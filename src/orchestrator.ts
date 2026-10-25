import { z, type ZodType } from "zod";
import { analyzeWithClaude, analyzeWithKeywords, analyzeWithOpenRouter, detectProduct } from "./analyzer/index.js";
import { discoverAlternatives, type UrlCheck } from "./discover.js";
import { pickProvider, type MessagesClient } from "./llm.js";
import { findProduct, loadCatalog } from "./catalog.js";
import { compareAlternatives } from "./compare.js";
import { auditOutput, checkRequest, isSafeUrl, REFUSAL_PREFIX } from "./guardrails.js";
import { assessThreats, scanForInjection, scopeThreats } from "./agents/index.js";
import { buildRecommendation, DISCOVERED_PREFIX } from "./recommend.js";
import {
  Catalog as CatalogSchema,
  FeatureMatrix,
  GoalProfile,
  Recommendation,
  Refusal,
  ThreatReport,
  type Catalog,
} from "./schemas.js";

export type StepStatus = "ok" | "fallback" | "failed" | "blocked";

export interface TraceEntry {
  step: string;
  status: StepStatus;
  ms: number;
  detail?: string;
}

export interface RunOptions {
  /** Skip Claude entirely and use the keyword analyzer. */
  offline?: boolean;
  /** Anthropic client to use; when set, the Anthropic API is used directly. */
  client?: MessagesClient;
  /** fetch to use for OpenRouter calls (tests pass a fake). */
  fetch?: typeof fetch;
  model?: string;
  catalog?: Catalog;
  env?: NodeJS.ProcessEnv;
  /** Look up alternatives live when a request isn't in the catalog (needs an API key). Default true. */
  discover?: boolean;
  /** How discovered links are checked (tests pass a fake). */
  urlCheck?: UrlCheck;
}

export interface RunResult {
  result: Recommendation | Refusal;
  trace: TraceEntry[];
}

export class StepError extends Error {
  constructor(
    readonly step: string,
    message: string,
    readonly trace: TraceEntry[],
  ) {
    super(`${step}: ${message}`);
  }
}

interface Step<T> {
  name: string;
  schema: ZodType<T>;
  primary: () => T | Promise<T>;
  /** Shown in the trace when the primary succeeds, e.g. which provider answered. */
  label?: string;
  /** How many extra tries the primary gets before falling back. */
  retries?: number;
  fallback?: { run: () => T | Promise<T>; label: string };
  /** When set, the primary is skipped and the fallback runs straight away, with this note. */
  skipPrimary?: string;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Runs one step: validate its output, retry, then fall back, recording each outcome. */
export async function runStep<T>(step: Step<T>, trace: TraceEntry[]): Promise<T> {
  const started = Date.now();
  const errors: string[] = [];

  if (!step.skipPrimary) {
    for (let attempt = 0; attempt <= (step.retries ?? 0); attempt++) {
      try {
        const value = step.schema.parse(await step.primary());
        const detail = [step.label, attempt ? `succeeded on retry ${attempt}` : undefined].filter(Boolean).join(", ");
        trace.push({ step: step.name, status: "ok", ms: Date.now() - started, ...(detail ? { detail } : {}) });
        return value;
      } catch (err) {
        errors.push(message(err));
      }
    }
  } else {
    errors.push(step.skipPrimary);
  }

  if (step.fallback) {
    try {
      const value = step.schema.parse(await step.fallback.run());
      trace.push({ step: step.name, status: "fallback", ms: Date.now() - started, detail: `${errors.join("; ")}; used ${step.fallback.label}` });
      return value;
    } catch (err) {
      errors.push(`fallback failed: ${message(err)}`);
    }
  }

  trace.push({ step: step.name, status: "failed", ms: Date.now() - started, detail: errors.join("; ") });
  throw new StepError(step.name, errors.join("; "), trace);
}

function refusal(query: string, reason: string, catalog: Catalog): Refusal {
  const product = detectProduct(catalog, query);
  return {
    status: "refused",
    query,
    reason,
    message: `${REFUSAL_PREFIX} ${reason} Here are legal ways to get the same job done instead.`,
    legalOptions: {
      alternatives: (product?.alternatives ?? [])
        .filter((a) => isSafeUrl(a.url))
        .map((a) => ({ name: a.name, url: a.url, license: a.license })),
      discounts: product?.officialDiscounts ?? [],
    },
  };
}

/** Drops any pick, discount or link that failed the output audit. */
function sanitize(rec: Recommendation): Recommendation {
  const clean = (v: unknown) => auditOutput(v).length === 0;
  const picks = rec.picks.filter(clean).map((p, i) => ({ ...p, rank: i + 1 }));
  const buildPlan = rec.buildPlan && clean(rec.buildPlan) ? rec.buildPlan : null;
  return {
    ...rec,
    picks,
    discounts: rec.discounts.filter(clean),
    buildPlan,
    ...(rec.threats ? { threats: scopeThreats(rec.threats, picks.map((p) => p.name), buildPlan !== null) } : {}),
  };
}

/**
 * The Orchestrator. Guards the input, then dispatches to the sub-agents in src/agents:
 * Goal Analyzer -> Alternative Finder -> (Feature-Gap Comparator || Threat & Risk) -> Recommendation Synthesizer,
 * and guards the output. It owns the shared state; every agent's output is checked against its schema
 * before the next agent sees it, and independent agents run in parallel.
 */
export async function run(query: string, opts: RunOptions = {}): Promise<RunResult> {
  const trace: TraceEntry[] = [];
  const catalog = opts.catalog ?? loadCatalog();
  const env = opts.env ?? process.env;

  const guard = checkRequest(query);
  if (!guard.allowed) {
    trace.push({ step: "guard-input", status: "blocked", ms: 0, detail: guard.category });
    return { result: Refusal.parse(refusal(query, guard.reason!, catalog)), trace };
  }
  // Prompt injection doesn't get a refusal: the request is still answered, but no model reads it.
  const requestThreats = scanForInjection(query);
  trace.push({ step: "guard-input", status: "ok", ms: 0, ...(requestThreats.length ? { detail: "prompt injection: model calls disabled" } : {}) });

  // Anthropic API first (explicit client or key), then OpenRouter, then keywords.
  const provider = opts.offline || requestThreats.length ? null : pickProvider(env, opts.client);
  const skipReason = opts.offline ? "offline mode" : requestThreats.length ? "possible prompt injection" : "no Anthropic or OpenRouter API key";
  const analyzed = await runStep(
    {
      name: "goal-analyzer",
      schema: GoalProfile,
      label: provider ?? undefined,
      primary: () =>
        provider === "openrouter"
          ? analyzeWithOpenRouter(query, catalog, { env, model: opts.model, fetch: opts.fetch })
          : analyzeWithClaude(query, catalog, { client: opts.client, model: opts.model }),
      retries: 1,
      fallback: { run: () => analyzeWithKeywords(query, catalog), label: "keyword analyzer" },
      ...(provider ? {} : { skipPrimary: skipReason }),
    },
    trace,
  );

  // Catalog first; when the request isn't in it, discover alternatives live and keep only those whose links check out.
  const discover = !analyzed.targetProductId && provider && opts.discover !== false;
  const found = await runStep(
    {
      name: "alternative-finder",
      schema: z.object({ profile: GoalProfile, catalog: CatalogSchema }),
      label: discover ? `live discovery via ${provider}` : "catalog",
      primary: async () => {
        if (!discover) return { profile: analyzed, catalog };
        const d = await discoverAlternatives(
          analyzed,
          catalog,
          { provider, client: opts.client, fetch: opts.fetch, env, model: opts.model },
          opts.urlCheck,
        );
        return { profile: d.profile, catalog: { ...catalog, products: [...catalog.products, d.product] } };
      },
      fallback: { run: () => ({ profile: analyzed, catalog }), label: "build plan only" },
    },
    trace,
  );
  const profile = found.profile;
  const product = findProduct(found.catalog, profile.targetProductId);

  // These two only need the profile and the candidate pool, so they run side by side.
  const compareTrace: TraceEntry[] = [];
  const threatTrace: TraceEntry[] = [];
  const [matrix, threats] = await Promise.all([
    runStep({ name: "gap-comparator", schema: FeatureMatrix, primary: () => compareAlternatives(profile, product) }, compareTrace),
    runStep(
      {
        name: "threat-risk",
        schema: ThreatReport,
        primary: () =>
          assessThreats({ profile, product, discovered: product?.id.startsWith(DISCOVERED_PREFIX) ?? false, requestThreats }),
      },
      threatTrace,
    ),
  ]);
  trace.push(...compareTrace, ...threatTrace);

  const recommendation = await runStep(
    {
      name: "synthesizer",
      schema: Recommendation,
      primary: () => {
        const rec = buildRecommendation(profile, matrix, found.catalog);
        return { ...rec, threats: scopeThreats(threats, rec.picks.map((p) => p.name), rec.buildPlan !== null) };
      },
    },
    trace,
  );

  const audited = await runStep(
    {
      name: "guard-output",
      schema: Recommendation,
      primary: () => {
        const problems = auditOutput(recommendation);
        if (problems.length) throw new Error(problems.join(", "));
        return recommendation;
      },
      fallback: {
        label: "sanitized output",
        run: () => {
          const cleaned = sanitize(recommendation);
          const left = auditOutput(cleaned);
          if (left.length) throw new Error(left.join(", "));
          return cleaned;
        },
      },
    },
    trace,
  );

  return { result: audited, trace };
}
