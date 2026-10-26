import { createContext, Script } from "node:vm";
import { z } from "zod";
import { scanForInjection } from "./agents/index.js";
import { type UrlCheck } from "./discover.js";
import { auditOutput, checkRequest, isSafeUrl, REFUSAL_PREFIX, SYSTEM_RULES } from "./guardrails.js";
import { completeJson, completeText, streamText, hasApiCredentials, hasOpenRouterKey, type MessagesClient, type Provider } from "./llm.js";
import { runStep, type TraceEntry } from "./orchestrator.js";
import { gameConfig, GameDesign, gameHtml, isBlockGame } from "./game-engine.js";
import { htmlTemplate, notice, osName, pythonTemplate, runInstructions, type Format } from "./rebuild-templates.js";

/**
 * App Rebuilder: the person names an app or website; research agents describe it from public
 * information only (what it does, its visible features, likely tech stack from public signals);
 * the person picks features, a model and their system; the builder writes ONE original,
 * self-contained file that runs on that system. Nothing is downloaded from, decompiled or copied
 * out of the original product.
 */

export const REBUILD_MODELS = [
  { id: "anthropic/claude-sonnet-5.5", label: "Claude Sonnet 5.5", note: "Recommended: fast and strong at code" },
  { id: "anthropic/claude-opus-5.5", label: "Claude Opus 5.5", note: "Most capable, slower" },
  { id: "anthropic/claude-haiku-5.5", label: "Claude Haiku 5.5", note: "Fastest, for simpler apps" },
  { id: "openai/gpt-5.5", label: "GPT-5.5", note: "OpenAI" },
  { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", note: "Google" },
  { id: "deepseek/deepseek-v4-pro", label: "DeepSeek V4 Pro", note: "Open weights" },
  { id: "qwen/qwen3-coder", label: "Qwen3 Coder", note: "Open weights, made for code" },
] as const;
export const DEFAULT_REBUILD_MODEL = REBUILD_MODELS[0].id;
const RESEARCH_MODEL = "anthropic/claude-sonnet-5.5";
const NAMER_MODEL = "anthropic/claude-haiku-5.5";

export interface RebuildOptions {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  client?: MessagesClient;
  offline?: boolean;
  urlCheck?: UrlCheck;
  /** How long the build may spend on model calls before using the template (default 250s, under Vercel's 300s). */
  budgetMs?: number;
}

/** OpenRouter first here, because it is what lets the person choose a model; then the Anthropic API. */
function provider(opts: RebuildOptions): Provider | null {
  const env = opts.env ?? process.env;
  if (opts.offline) return null;
  if (hasOpenRouterKey(env)) return "openrouter";
  if (opts.client || hasApiCredentials(env)) return "anthropic";
  return null;
}

/** "anthropic/claude-sonnet-5.5" -> "claude-sonnet-5-5" for the Anthropic API; other vendors fall back to its default. */
const anthropicModel = (id: string) => (id.startsWith("anthropic/") ? id.slice(10).replace(/\./g, "-") : undefined);

function llm(p: Provider, model: string, opts: RebuildOptions, maxTokens?: number) {
  return p === "openrouter"
    ? { provider: p, model, env: opts.env, fetch: opts.fetch, maxTokens }
    : { provider: p, model: anthropicModel(model), client: opts.client, maxTokens };
}

const PUBLIC_ONLY = `Work only from public information: the official website, public documentation, app store listings, press and reviews.
Describe things in your own words. Never include the product's source code, private APIs, internal file formats, or anything that would come from decompiling, disassembling or reverse engineering its binaries.
${SYSTEM_RULES}`;

// ---------- research ----------

const Profiler = z.object({
  known: z.boolean().describe("false when you don't recognize this app or website"),
  officialName: z.string(),
  officialUrl: z.string().nullable().describe("the official https homepage, or null"),
  category: z.string().describe("two or three words, e.g. 'note taking', 'photo editor', 'puzzle game'"),
  summary: z.string().describe("one or two sentences on what it does and for whom"),
  audience: z.string(),
});
const FeatureList = z.object({
  features: z.array(z.object({ label: z.string(), description: z.string(), core: z.boolean() })),
});
const Stack = z.object({
  likely: z.array(z.string()).describe("technologies it likely uses, e.g. 'React', 'Electron', 'PostgreSQL'"),
  signals: z.array(z.object({ signal: z.string(), inference: z.string() })).describe("the public evidence behind each guess"),
  confidence: z.enum(["low", "medium", "high"]),
});
const Questions = z.object({
  questions: z
    .array(z.object({ question: z.string(), options: z.array(z.string()) }))
    .describe("2 or 3 short questions, each with 3 or 4 short answers to tap"),
});

export const Feature = z.object({ id: z.string(), label: z.string(), description: z.string(), core: z.boolean() });
export const AppProfile = z.object({
  status: z.literal("ok"),
  query: z.string(),
  officialName: z.string(),
  officialUrl: z.string().nullable(),
  category: z.string(),
  summary: z.string(),
  audience: z.string(),
  features: z.array(Feature).min(1),
  stack: Stack,
  /** Questions about the person's own use, asked before building so the file fits them. */
  questions: z.array(z.object({ question: z.string(), options: z.array(z.string()) })).default([]),
  source: z.enum(["ai", "fallback"]),
  notice: z.string(),
});
export type AppProfile = z.infer<typeof AppProfile>;

export interface RebuildRefusal {
  status: "refused";
  query: string;
  reason: string;
  message: string;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "feature";
const clip = (s: string, n: number) => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

/**
 * Does the official site exist? Big sites often answer a server's request with 401/403/429 from their bot
 * protection (quizlet.com does), which still proves the site is real; only network errors and 404/5xx fail.
 */
export const siteExists: UrlCheck = async (url) => {
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "RVAI link check" } });
    await res.body?.cancel().catch(() => {});
    return res.status < 400 || [401, 403, 429].includes(res.status);
  } catch {
    return false;
  }
};

const RESEARCH_NOTICE =
  "Built from public information only. The tech stack is an educated guess from public signals, not from the app's code.";

/** Used when there is no model to ask: a generic feature set the person can edit. */
function fallbackProfile(query: string): AppProfile {
  const generic = [
    ["Create and edit items", "Add, change and delete the main things the app works with."],
    ["Organize", "Group items with folders, tags or boards."],
    ["Search", "Find anything quickly by typing."],
    ["Save and export", "Keep your work on your computer and export it as a file."],
    ["Dark mode", "A comfortable dark theme."],
    ["Keyboard shortcuts", "Do common actions without the mouse."],
  ];
  return {
    status: "ok",
    query,
    officialName: query,
    officialUrl: null,
    category: "app",
    summary: `An app you described as "${query}".`,
    audience: "You",
    features: generic.map(([label, description], i) => ({ id: slug(label), label, description, core: i < 4 })),
    stack: { likely: [], signals: [], confidence: "low" },
    questions: [],
    source: "fallback",
    notice: "No AI model is connected, so these are generic starting features. Edit them to match what you want.",
  };
}

function refuse(query: string, reason: string): { result: RebuildRefusal; trace: TraceEntry[] } {
  return {
    result: { status: "refused", query, reason, message: `${REFUSAL_PREFIX} ${reason} RVAI can still build an original app that does a similar job.` },
    trace: [{ step: "guard-input", status: "blocked", ms: 0 }],
  };
}

export const RESEARCH_AGENTS = ["product-profiler", "feature-mapper", "stack-detective", "question-asker"] as const;
export type ResearchAgent = (typeof RESEARCH_AGENTS)[number];
const AGENT_SCHEMAS = { "product-profiler": Profiler, "feature-mapper": FeatureList, "stack-detective": Stack, "question-asker": Questions } as const;

function agentStep(agent: ResearchAgent, query: string, p: Provider, opts: RebuildOptions) {
  const ask = <S extends z.ZodType>(schema: S, name: string, task: string) =>
    completeJson(schema, name, `You are one of RVAI's research agents.\n${PUBLIC_ONLY}`, `App or website: "${query}"\n\n${task}`, llm(p, RESEARCH_MODEL, opts, 3000));
  const steps = {
    "product-profiler": {
      name: agent,
      schema: Profiler,
      label: p,
      retries: 1,
      primary: () => ask(Profiler, "profile", "Identify the product: its official name, official homepage, category, a short summary and its audience."),
      fallback: { run: () => ({ known: false, officialName: query, officialUrl: null, category: "app", summary: "", audience: "" }), label: "unknown product" },
    },
    "feature-mapper": {
      name: agent,
      schema: FeatureList,
      label: p,
      retries: 1,
      primary: () => ask(FeatureList, "features", "List 8 to 12 user-visible features, as a user would describe them. Mark the 4 to 6 that define the product as core. Keep each label under 6 words."),
      fallback: { run: () => ({ features: fallbackProfile(query).features }), label: "generic features" },
    },
    "stack-detective": {
      name: agent,
      schema: Stack,
      label: p,
      primary: () => ask(Stack, "stack", "Give its likely tech stack from public signals only: job posts, engineering blogs, open-source repos it publishes, the type of app it ships (web, Electron, native). At most 6 items, each 1 to 3 words (e.g. \"Java\", \"OpenGL\"). Say what each guess is based on."),
      fallback: { run: () => ({ likely: [], signals: [], confidence: "low" as const }), label: "no stack guess" },
    },
    "question-asker": {
      name: agent,
      schema: Questions,
      label: p,
      primary: () =>
        ask(
          Questions,
          "questions",
          "Someone wants their own free app that does a similar job. Ask 2 or 3 short questions whose answers would change what to build for them, such as what they will use it for, what content it should start with, or the look they like. Each question gets 3 or 4 short answers (under 5 words each). Speak to the person directly, for example 'What will you study?'. Don't ask about their computer, the AI model or price.",
        ),
      fallback: { run: () => ({ questions: [] }), label: "no questions" },
    },
  };
  return steps[agent] as unknown as Parameters<typeof runStep<unknown>>[0];
}

/** Runs one research agent on its own, so the page can run all three side by side and show each finish. */
export async function researchAgent(rawQuery: string, agent: string, opts: RebuildOptions = {}): Promise<{ result: unknown; trace: TraceEntry[] } | { result: RebuildRefusal; trace: TraceEntry[] }> {
  const query = clip(rawQuery, 80);
  if (!(RESEARCH_AGENTS as readonly string[]).includes(agent)) throw new Error(`unknown agent: ${agent}`);
  const guard = checkRequest(query);
  if (!guard.allowed) return refuse(query, guard.reason!);
  const p = scanForInjection(query).length ? null : provider(opts);
  const trace: TraceEntry[] = [];
  if (!p) return { result: null, trace: [{ step: agent, status: "fallback", ms: 0, detail: "no AI model" }] };
  const result = await runStep(agentStep(agent as ResearchAgent, query, p, opts), trace);
  return { result, trace };
}

/**
 * Research: three agents run in parallel (Product Profiler, Feature Mapper, Stack Detective), then
 * the Link Checker confirms the official site loads. Each agent's output is schema-checked.
 */
export async function researchApp(
  rawQuery: string,
  opts: RebuildOptions = {},
  parts?: Partial<Record<ResearchAgent, unknown>>,
): Promise<{ result: AppProfile | RebuildRefusal; trace: TraceEntry[] }> {
  const query = clip(rawQuery, 80);
  const guard = checkRequest(query);
  if (!guard.allowed) return refuse(query, guard.reason!);
  const injected = scanForInjection(query).length > 0;
  const p = injected ? null : provider(opts);
  const trace: TraceEntry[] = [{ step: "guard-input", status: "ok", ms: 0, ...(injected ? { detail: "prompt injection: model calls disabled" } : {}) }];
  if (!p) {
    trace.push({ step: "research", status: "fallback", ms: 0, detail: injected ? "possible prompt injection" : opts.offline ? "offline mode" : "no AI key; generic features" });
    return { result: fallbackProfile(query), trace };
  }

  // Each agent's result can come from the browser (it ran it on its own via /api/rebuild/agent, so the person
  // could watch it finish) or be run here; either way it is checked against its schema.
  const traces: TraceEntry[][] = RESEARCH_AGENTS.map(() => []);
  const [profile, features, stack, questions] = await Promise.all(
    RESEARCH_AGENTS.map((agent, i) => {
      const given = parts?.[agent];
      if (given !== undefined) {
        const parsed = AGENT_SCHEMAS[agent].safeParse(given);
        if (parsed.success) {
          traces[i].push({ step: agent, status: "ok", ms: 0, detail: "ran in parallel" });
          return Promise.resolve(parsed.data);
        }
      }
      return runStep(agentStep(agent, query, p, opts), traces[i]);
    }),
  ).catch((err) => {
    trace.push(...traces.flat());
    throw err;
  }) as [z.infer<typeof Profiler>, z.infer<typeof FeatureList>, z.infer<typeof Stack>, z.infer<typeof Questions>];
  trace.push(...traces.flat());

  // Only show the official link if it is a safe https link that actually loads.
  const started = Date.now();
  const url = profile.officialUrl && isSafeUrl(profile.officialUrl) && (await (opts.urlCheck ?? siteExists)(profile.officialUrl)) ? profile.officialUrl : null;
  trace.push({ step: "link-checker", status: url ? "ok" : "fallback", ms: Date.now() - started, ...(url ? {} : { detail: "official link missing or did not load" }) });

  const seen = new Set<string>();
  const list = features.features
    .map((f) => ({ id: slug(f.label), label: clip(f.label, 60), description: clip(f.description, 200), core: f.core }))
    .filter((f) => f.label && !seen.has(f.id) && seen.add(f.id))
    .slice(0, 14);

  const result = AppProfile.parse({
    status: "ok",
    query,
    officialName: clip(profile.officialName, 80) || query,
    officialUrl: url,
    category: clip(profile.category, 40) || "app",
    summary: clip(profile.known ? profile.summary : `RVAI doesn't recognize "${query}" yet, so these features are a best guess. Edit them to match what you want.`, 400),
    audience: clip(profile.audience, 120),
    features: list.length ? list : fallbackProfile(query).features,
    stack: { ...stack, likely: stack.likely.map((s) => clip(s, 30)).filter(Boolean).slice(0, 6), signals: stack.signals.slice(0, 6) },
    questions: questions.questions
      .map((q) => ({ question: clip(q.question, 120), options: q.options.map((o) => clip(o, 40)).filter(Boolean).slice(0, 4) }))
      .filter((q) => q.question && q.options.length >= 2)
      .slice(0, 3),
    source: "ai",
    notice: RESEARCH_NOTICE,
  });
  const problems = auditOutput(result);
  if (problems.length) return refuse(query, "The research results pointed at sources RVAI won't share.");
  return { result, trace };
}

// ---------- build ----------

/** The App Planner's detailed blueprint: what the builder must make, down to screens, rules and starter content. */
export const AppPlan = z.object({
  pitch: z.string().describe("one sentence: what this version is and who it is for"),
  look: z.string().describe("the visual style: palette, mood, layout idea"),
  screens: z.array(z.object({ name: z.string(), purpose: z.string(), parts: z.array(z.string()) })).describe("3 to 6 screens or views and what is on each"),
  features: z
    .array(z.object({ label: z.string(), behavior: z.string().describe("2 to 4 sentences: exactly how it works, step by step"), details: z.array(z.string()).describe("rules, states and edge cases") }))
    .describe("one entry per requested feature and mod"),
  data: z.array(z.object({ name: z.string(), fields: z.array(z.string()) })).describe("what is saved"),
  sampleContent: z.array(z.string()).describe("realistic starter content with real values, so the app is useful on first open"),
  extras: z.array(z.string()).describe("polish: help panel, toasts, undo, stats, settings"),
  shortcuts: z.array(z.string()),
});
export type AppPlan = z.infer<typeof AppPlan>;

export const BuildRequest = z.object({
  target: z.string().trim().min(1).max(80),
  summary: z.string().max(400).default(""),
  category: z.string().max(60).default("app"),
  features: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(80),
        description: z.string().max(240).default(""),
        /** Added by the person, not found in the original: shown as a "mod" in the title. */
        custom: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(15),
  model: z.string().default(DEFAULT_REBUILD_MODEL),
  system: z.object({
    os: z.enum(["macos", "windows", "linux", "chromeos", "other"]),
    arch: z.enum(["arm64", "x64", "unknown"]).default("unknown"),
    format: z.enum(["html", "python"]).default("html"),
  }),
  notes: z.string().max(500).default(""),
  /** The person's answers to the research questions, e.g. "What will you study?" -> "Spanish". */
  answers: z.array(z.object({ question: z.string().max(160), answer: z.string().max(120) })).max(4).default([]),
  /** From POST /api/rebuild/plan; without one the builder plans on its own. */
  plan: AppPlan.optional(),
  /** Safe mode: only the core features in a simple, reliable file, no extras. Used when the full build still crashes after a repair. */
  basic: z.boolean().default(false),
  /** Continuing a file that was cut off: what was written so far, the name it already has, and which part this is. */
  partial: z.string().max(400_000).optional(),
  appName: z.string().max(60).optional(),
  part: z.number().int().min(1).max(3).default(1),
});
export type BuildRequest = z.infer<typeof BuildRequest>;

/** A long file that didn't finish inside one request: the page sends it back with `partial` to continue it. */
export interface PartialFile {
  status: "partial";
  appName: string;
  partial: string;
  part: number;
  bytes: number;
}

/** How many requests one file may take; after that a cut-off file counts as failed. */
export const MAX_PARTS = 3;

/**
 * Joins a continuation onto the cut-off text: drops code fences and any lines the model repeated.
 * A reply that starts over with <!DOCTYPE html> replaces the old text.
 */
export function joinContinuation(sofar: string, more: string): string {
  const next = more.replace(/^\s*```[\w-]*\n?/, "").replace(/\n?```\s*$/, "");
  if (/^\s*<!doctype html/i.test(next)) return next;
  for (let k = Math.min(next.length, sofar.length, 4000); k >= 12; k--) {
    if (sofar.endsWith(next.slice(0, k))) return sofar + next.slice(k);
  }
  return sofar + next;
}

export interface BuiltFile {
  status: "ok";
  appName: string;
  /** "Name (alternative to X · mods: a, b)": the person's naming rule, shown on the card and in the file. */
  displayTitle: string;
  mods: string[];
  filename: string;
  mime: string;
  format: Format;
  content: string;
  bytes: number;
  instructions: string[];
  source: "ai" | "template";
  /** Set when the file is built on RVAI's tested game engine instead of written from scratch. */
  engine: "rvai-blocks" | null;
  model: string | null;
}

const Naming = z.object({ appName: z.string(), tagline: z.string() });
const MAX_FILE = 400_000;
/** One model call may take this long; the build function itself is capped at 300s by the host. */
const BUILD_TIMEOUT_MS = 240_000;
const THIRD_PARTY_PY = /^\s*(import|from)\s+(requests|numpy|pandas|PyQt\d?|PySide\d?|flask|django|kivy|pygame|wx|customtkinter|PIL)\b/m;
const EXTERNAL_RESOURCE = /<(script|link|img|iframe|source|video|audio|embed)\b[^>]*\b(src|href)\s*=\s*["']?\s*(https?:)?\/\//i;

/** Pulls the file out of a model reply: drops code fences and any chatter around the document. */
export function extractFile(reply: string, format: Format): string {
  let text = reply.trim();
  const fenced = text.match(/```[\w-]*\n([\s\S]*?)\n```/g);
  if (fenced) text = fenced.map((b) => b.replace(/^```[\w-]*\n/, "").replace(/\n```$/, "")).sort((a, b) => b.length - a.length)[0];
  if (format === "html") {
    const start = text.search(/<!doctype html/i);
    const end = text.toLowerCase().lastIndexOf("</html>");
    if (start >= 0 && end > start) text = text.slice(start, end + 7);
  }
  return text.trim() + "\n";
}

/** Window properties a page can't redeclare: `let top` or `const location` stops the whole script in a browser. */
const RESERVED_GLOBALS = ["window", "document", "location", "top"];

/**
 * Compiles every inline classic script and sets up its top-level names the way a browser does, without running
 * any of its code, and returns the errors. This catches syntax errors, a name declared twice (also across
 * separate <script> tags, which share one global scope) and names that clash with the browser's own, such as `top`.
 */
export function scriptErrors(html: string): string[] {
  const errors: string[] = [];
  const page = createContext({});
  new Script(`for (const k of ${JSON.stringify(RESERVED_GLOBALS)}) Object.defineProperty(globalThis, k, { get() { return globalThis; }, configurable: false });`).runInContext(page);
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(m[1]) || /type\s*=\s*["']?(module|application\/json|text\/template)/i.test(m[1])) continue;
    try {
      // The browser declares a script's top-level names before running its first line, so `throw` stops it right after.
      new Script(`throw RVAI_NOT_RUN;\n${m[2]}`).runInContext(page);
    } catch (err) {
      // Errors from inside the context come from its own realm, so read the message instead of using instanceof.
      const message = String((err as { message?: unknown })?.message ?? err);
      if (/RVAI_NOT_RUN is not defined/.test(message)) continue;
      const reserved = RESERVED_GLOBALS.find((g) => message.includes(`'${g}'`));
      errors.push(reserved ? `${message}: "${reserved}" is the browser's own name, rename that variable` : message);
    }
  }
  return errors;
}

/** Checks a generated file is complete, self-contained and clean. Empty means it passed. */
export function checkFile(content: string, format: Format): string[] {
  const problems: string[] = [];
  if (content.length > MAX_FILE) problems.push("file is too large");
  if (format === "html") {
    if (!/^\s*<!doctype html>/i.test(content)) problems.push("does not start with <!DOCTYPE html>");
    if (!/<\/html>\s*$/i.test(content)) problems.push("is cut off before </html>");
    if (!/<script\b/i.test(content)) problems.push("has no script, so nothing would work");
    if (EXTERNAL_RESOURCE.test(content)) problems.push("loads files from the internet, so it isn't one self-contained file");
    const broken = scriptErrors(content);
    if (broken.length) problems.push(`has a script error (${broken[0]})`);
  } else {
    if (!/if __name__ == ["']__main__["']/.test(content)) problems.push("has no main entry point");
    if (THIRD_PARTY_PY.test(content)) problems.push("needs packages outside the Python standard library");
  }
  if (auditOutput(content).length) problems.push("mentions piracy terms or unsafe links");
  return problems;
}

/** The person's answers, notes and the plan, as plain text for the planner and builder prompts. */
function wishes(req: Pick<BuildRequest, "notes" | "answers">): string {
  const lines = [...req.answers.map((a) => `- ${clip(a.question, 160)} ${clip(a.answer, 120)}`), ...(req.notes ? [`- They also said: ${req.notes}`] : [])];
  return lines.length ? `About the person and what they want:\n${lines.join("\n")}\n` : "";
}

const list = (items: string[]) => items.map((i) => clip(i, 300)).filter(Boolean).slice(0, 12);

/** The plan as a compact brief: every screen, feature rule and starter item the builder must deliver. */
export function planText(plan: AppPlan): string {
  const out = [
    `Pitch: ${clip(plan.pitch, 300)}`,
    `Look: ${clip(plan.look, 300)}`,
    "Screens:",
    ...plan.screens.slice(0, 8).map((s) => `- ${clip(s.name, 60)}: ${clip(s.purpose, 200)}. Shows: ${list(s.parts).join("; ")}`),
    "Features:",
    ...plan.features.slice(0, 16).flatMap((f) => [`- ${clip(f.label, 80)}: ${clip(f.behavior, 600)}`, ...list(f.details).map((d) => `  - ${d}`)]),
    "Saved data:",
    ...plan.data.slice(0, 8).map((d) => `- ${clip(d.name, 60)}: ${list(d.fields).join(", ")}`),
    "Starter content (put it in on first open):",
    ...list(plan.sampleContent).map((c) => `- ${c}`),
    "Polish:",
    ...list(plan.extras).map((e) => `- ${e}`),
    `Shortcuts: ${list(plan.shortcuts).join("; ")}`,
  ];
  return out.join("\n").slice(0, 9000);
}

function builderPrompt(req: BuildRequest, appName: string): { system: string; user: string } {
  const os = osName(req.system.os);
  const mod = req.system.os === "macos" ? "Cmd" : "Ctrl";
  const format =
    req.system.format === "html"
      ? `Write ONE complete HTML5 file that opens by double-clicking it on ${os}.
- Inline <style> and <script> only. No external URLs at all: no CDNs, web fonts, remote images or analytics. Draw icons with inline SVG or CSS.
- It must feel finished on first open, never an empty shell: load the starter content (marked as examples the person can delete) the first time it runs.
- Every feature gets its own real, working UI. Forms check their input, lists can be added to, edited, deleted and searched where that makes sense, and every button does something.
- Include empty states, a confirm before deleting, short toasts after actions, and a "How to use" help panel that lists the shortcuts.
- Save the person's data in localStorage (wrap every access in try/catch) and add export/import of that data as a JSON file.
- Work fully offline. If a feature normally needs a server (accounts, sync, sharing), make a local version and say so in the UI.
- Keyboard shortcuts use ${mod}. Responsive down to phone width, accessible labels and focus styles, light and dark themes, and a polished look of your own: consistent spacing, hover states, subtle transitions.
- Robust code: declare each name only once, never name your own variables window, document, location or top, check DOM lookups, and wrap start-up in try/catch that shows a friendly message on the page instead of a blank screen.
- Start your reply with <!DOCTYPE html> and end it with </html>. Output the file only.`
      : `Write ONE complete Python 3.10+ file that runs with "python3 file.py" on ${os}${req.system.arch !== "unknown" ? ` (${req.system.arch})` : ""}.
- Standard library only: tkinter/ttk for the window. No pip packages.
- Start with the starter content the first time it runs, so it is useful right away.
- Every feature gets real, working widgets: add, edit, delete and search where that makes sense; confirm before deleting.
- Save the person's data as JSON in their home folder, with export/import.
- Keyboard shortcuts use ${mod === "Cmd" ? "Command" : "Control"}, listed in a Help menu. Clean layout with ttk widgets and a status bar.
- End with: if __name__ == "__main__": main()
- Output the file only, no explanation.`;
  const brief = req.basic
    ? `This is the BASIC version: a previous, fuller version crashed. Build only these core features, simply and reliably, with no extras, animations or optional panels:\n${req.features.map((f) => `- ${f.label}${f.description ? `: ${f.description}` : ""}`).join("\n")}\n`
    : req.plan
    ? `Follow this plan closely. Build every screen, rule and starter item in it:\n${planText(req.plan)}\n`
    : `Implement every one of these features so it really works:\n${req.features.map((f) => `- ${f.label}${f.description ? `: ${f.description}` : ""}${f.custom ? " (a new idea the original doesn't have)" : ""}`).join("\n")}\n`;
  return {
    system: `You are RVAI's App Builder. You write original, detailed, working software in a single file.
Clean-room rules: you only get a plain description of features. Do not reproduce any product's code, exact screens, logos, icons, artwork, sounds, wording or name. Use your own design and the app name "${appName}".
${SYSTEM_RULES}`,
    user: `Build "${appName}", an original ${req.category} app that does a similar job to ${req.target}: ${req.summary || "(no summary)"}.

${brief}
${req.plan ? `The features the person picked: ${req.features.map((f) => f.label).join(", ")}.\n` : ""}${wishes(req)}
${format}
${
      req.basic
        ? "Keep it short and simple (under 400 lines). Every part must work 100%."
        : 'Make it detailed and complete in 600 to 900 lines, under 70 KB in total: compact CSS and code, no TODOs, no placeholders, no fake buttons, no "coming soon". Never go past 900 lines: a file that is cut off is lost.'
    }
Reliability comes first. The core features must work perfectly. If you are not sure an extra (a filter, animation, optional panel or polish item) will work without bugs, leave it out: a smaller app that fully works beats a bigger one that breaks.`,
  };
}

const filenameFor = (appName: string, target: string, format: Format) =>
  `${slug(appName)}-alt-to-${slug(target)}.${format === "html" ? "html" : "py"}`;

/** The project's own name, then in parentheses what it is an alternative to and the mods it adds. */
export function displayTitle(appName: string, target: string, mods: string[]): string {
  return `${appName} (alternative to ${target}${mods.length ? ` · mods: ${mods.join(", ")}` : ""})`;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Sets the window title to the display title (HTML <title>, or Tk's root.title). */
function withTitle(content: string, format: Format, title: string): string {
  if (format === "html") {
    return /<title>[\s\S]*?<\/title>/i.test(content)
      ? content.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`)
      : content.replace(/<head[^>]*>/i, (m) => `${m}\n<title>${escapeHtml(title)}</title>`);
  }
  return content.replace(/^(\s*)(\w+)\.title\(.*\)\s*$/m, (_m, indent, root) => `${indent}${root}.title(${JSON.stringify(title)})`);
}

/** Puts the notice (who made it, not affiliated, how to run it) at the top of the file. */
function withNotice(content: string, format: Format, lines: string[]): string {
  if (format === "python") return `${lines.map((l) => `# ${l}`).join("\n")}\n\n${content}`;
  const comment = `<!--\n${lines.map((l) => `  ${l.replace(/--/g, "-")}`).join("\n")}\n-->`;
  return content.replace(/^\s*<!doctype html>/i, (m) => `${m.trim()}\n${comment}`);
}

/**
 * Every HTML file starts with this small watchdog. If a script error happens or the page renders nothing,
 * it shows a clear message on the page instead of a white screen, and tells RVAI's preview so it can repair it.
 */
const GUARD_ID = "rvai-guard";
export const RUNTIME_GUARD = `<script id="${GUARD_ID}">(function(){var shown=0;function post(m){try{if(parent!==window)parent.postMessage(m,"*")}catch(e){}}
function show(m){if(shown)return;if(!document.body){document.addEventListener("DOMContentLoaded",function(){show(m)});return}shown=1;var d=document.createElement("div");d.setAttribute("role","alert");d.style.cssText="position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;padding:12px 14px;border-radius:10px;background:#3b0d0d;color:#ffe9e9;font:14px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35)";d.textContent="This app hit a problem: "+m+". Your saved data is safe. Open RVAI to repair it.";document.body.appendChild(d)}
function fail(m){m=String(m||"unknown error").slice(0,300);post({rvai:"runtime-error",message:m});show(m)}
window.addEventListener("error",function(e){if(e&&e.message)fail(e.message+(e.lineno?" (line "+e.lineno+")":""))});
window.addEventListener("unhandledrejection",function(e){fail(e&&e.reason&&e.reason.message||e&&e.reason)});
window.addEventListener("load",function(){setTimeout(function(){var b=document.body,blank=!b||(!b.innerText.trim()&&!b.querySelector("canvas,svg,img,input,button,video,textarea"));if(blank)fail("the page shows nothing");else post({rvai:"ready"})},700)})})()</script>`;

/** Adds the watchdog as the first thing in <head> (replacing an old copy), so it catches every later error. */
export function withGuard(content: string, format: Format): string {
  if (format !== "html") return content;
  const clean = stripGuard(content);
  return /<head[^>]*>/i.test(clean) ? clean.replace(/<head[^>]*>/i, (m) => `${m}\n${RUNTIME_GUARD}`) : clean.replace(/^\s*<!doctype html>/i, (m) => `${m.trim()}\n${RUNTIME_GUARD}`);
}
const stripGuard = (content: string) => content.replace(new RegExp(`\\n?<script id="${GUARD_ID}">[\\s\\S]*?<\\/script>`, "g"), "");

const requestText = (req: Pick<BuildRequest, "target" | "summary" | "notes" | "features" | "answers">) =>
  [req.target, req.summary, req.notes, ...req.features.flatMap((f) => [f.label, f.description]), ...req.answers.flatMap((a) => [a.question, a.answer])].join("\n");

function safeName(name: string, target: string, category: string): string {
  const n = clip(name, 40).replace(/[^\p{L}\p{N} .'-]/gu, "").trim();
  if (n.length >= 2 && !n.toLowerCase().includes(target.toLowerCase()) && !target.toLowerCase().includes(n.toLowerCase())) return n;
  const word = (category.split(/\s+/)[0] || "Open").replace(/^\w/, (c) => c.toUpperCase());
  return `${word} Workbench`;
}

/**
 * Build: guard the request, name the app (Namer), write the file with the chosen model (App Builder,
 * one retry), check it (File Checker), and fall back to an offline template if every try fails.
 * Always returns exactly one file.
 */
export async function buildApp(input: unknown, opts: RebuildOptions = {}): Promise<{ result: BuiltFile | PartialFile | RebuildRefusal; trace: TraceEntry[] }> {
  const req = BuildRequest.parse(input);
  const target = clip(req.target, 80);
  const everything = requestText(req);
  const guard = checkRequest(everything);
  if (!guard.allowed) return refuse(target, guard.reason!);
  const injected = scanForInjection(everything).length > 0;
  const model = REBUILD_MODELS.some((m) => m.id === req.model) ? req.model : DEFAULT_REBUILD_MODEL;
  const p = injected ? null : provider(opts);
  const trace: TraceEntry[] = [{ step: "guard-input", status: "ok", ms: 0, ...(injected ? { detail: "prompt injection: model calls disabled" } : {}) }];
  const format = req.system.format;
  const features = req.features.map((f) => ({ label: clip(f.label, 80), description: clip(f.description, 240), custom: f.custom }));
  const skip = injected ? "possible prompt injection" : opts.offline ? "offline mode" : "no AI key";

  const naming = req.appName ? { appName: req.appName, tagline: "" } : await runStep(
    {
      name: "namer",
      schema: Naming,
      label: p ?? undefined,
      primary: () =>
        completeJson(
          Naming,
          "naming",
          `You name original apps. The name must be new: not the original product's name, not a near copy of it, and not another company's trademark.\n${SYSTEM_RULES}`,
          `Name an original ${req.category} app with these features: ${features.map((f) => f.label).join(", ")}. It is a free alternative to ${target}. One or two words.`,
          llm(p!, NAMER_MODEL, opts, 1500),
        ),
      fallback: { run: () => ({ appName: "", tagline: "" }), label: "default name" },
      ...(p ? {} : { skipPrimary: skip }),
    },
    trace,
  );
  const appName = safeName(naming.appName, target, req.category);
  const mods = features.filter((f) => f.custom).map((f) => f.label).slice(0, 4);
  const title = displayTitle(appName, target, mods);
  const filename = filenameFor(appName, target, format);
  const instructions = runInstructions(format, req.system.os, req.system.arch, filename);

  let source: BuiltFile["source"] = "ai";
  let engine: BuiltFile["engine"] = null;
  const deadline = Date.now() + (opts.budgetMs ?? 250_000);
  let content: string;
  /** Set when the file was cut off and will be continued by the next request. */
  let cutOff: string | null = null;

  if (format === "html" && isBlockGame([target, req.category, req.summary].join(" "))) {
    // Games use RVAI's tested engine, so the file always loads and plays; the chosen model designs the game.
    engine = "rvai-blocks";
    const design = await runStep(
      {
        name: "game-designer",
        schema: GameDesign.partial(),
        label: p ? model : undefined,
        retries: 1,
        primary: () =>
          completeJson(
            GameDesign,
            "game_design",
            `You design original block-building games for RVAI's game engine. Use your own block names and colors, never the original game's names, characters or art.\n${SYSTEM_RULES}`,
            `Design "${appName}", a free 2D block-building game that is an alternative to ${target}.
Features the person picked:\n${features.map((f) => `- ${f.label}${f.custom ? " (mod)" : ""}`).join("\n")}
${wishes(req)}${req.notes || req.answers.length ? "Follow their wishes, especially colors and themes.\n" : ""}Turn on the systems that match their features and mods (for example low-spec for old laptops, co-op for playing with friends).`,
            llm(p!, model, opts, 4000),
          ),
        fallback: { run: () => ({}), label: "default design" },
        ...(p ? {} : { skipPrimary: skip }),
      },
      trace,
    );
    if (!p) source = "template";
    const lowSpec = mods.some((m) => /low[- ]?spec|old (laptop|pc|computer)|potato|performance/i.test(m)) || undefined;
    const coop = mods.some((m) => /co-?op|multiplayer|friend|lan|2 ?player|two player/i.test(m)) || undefined;
    content = gameHtml(gameConfig({ title, storageKey: `rvai:${slug(appName)}`, mods, design: { ...design, ...(lowSpec ? { lowSpec } : {}), ...(coop ? { coop } : {}) } }));
    const started = Date.now();
    const problems = checkFile(content, format);
    trace.push({ step: "file-checker", status: problems.length ? "failed" : "ok", ms: Date.now() - started, detail: problems.length ? problems.join(", ") : "scripts compile, self-contained" });
  } else {
    const { system, user } = builderPrompt({ ...req, target, features }, appName);
    const template = () => (format === "html" ? htmlTemplate : pythonTemplate)({ appName, target, summary: clip(req.summary, 200), features: features.map(({ label, description }) => ({ label, description })) });
    let lastProblem = "";
    content = await runStep(
      {
        name: "app-builder",
        schema: z.string(),
        label: p ? model : undefined,
        retries: 1,
        primary: async () => {
          // Stay inside the hosting time limit: a retry only runs if there is still room for it.
          const left = deadline - Date.now();
          if (left < 45_000) throw new Error("out of time for another try");
          // On the retry, tell the model what was wrong with its first file so it can avoid it.
          const ask = lastProblem
            ? `${user}\n\nYour previous attempt was rejected because it ${lastProblem}. Write the whole file again. Check every variable name is declared only once, and never name your own variables window, document, location or top.`
            : req.partial
              ? `${user}\n\nYou already wrote the start of this file, shown below. It was cut off. Continue from the exact character where it stops: output only the rest of the file, without repeating anything, and end it properly${format === "html" ? " with </html>" : ""}.\n\nTHE FILE SO FAR:\n${req.partial}`
              : user;
          // Streamed, so a long file that can't finish in this request is kept and continued in the next one.
          const reply = await streamText(system, ask, { ...llm(p!, model, opts, 32000), stopAt: Date.now() + Math.min(BUILD_TIMEOUT_MS, left - 10_000) });
          const text = req.partial && !lastProblem ? joinContinuation(req.partial, reply.text) : reply.text;
          if (!reply.finished) {
            if (req.part >= MAX_PARTS) throw new Error("the file was still unfinished after its last part");
            cutOff = text;
            return "";
          }
          const file = extractFile(text, format);
          const problems = checkFile(file, format);
          if (problems.length) {
            lastProblem = problems.join(", ");
            throw new Error(`file check: ${lastProblem}`);
          }
          return file;
        },
        fallback: {
          label: "offline template",
          run: () => {
            source = "template";
            return template();
          },
        },
        ...(p ? {} : { skipPrimary: skip }),
      },
      trace,
    );
  }

  if (cutOff !== null) {
    const step = trace.find((t) => t.step === "app-builder");
    if (step) step.detail = `part ${req.part} written, continuing in part ${req.part + 1}`;
    return { result: { status: "partial", appName, partial: cutOff, part: req.part, bytes: Buffer.byteLength(cutOff) }, trace };
  }
  const final = withGuard(withNotice(withTitle(content, format, title), format, notice(title, target, instructions)), format);
  return {
    result: {
      status: "ok",
      appName,
      displayTitle: title,
      mods,
      filename,
      mime: format === "html" ? "text/html" : "text/x-python",
      format,
      content: final,
      bytes: Buffer.byteLength(final),
      instructions,
      source,
      engine,
      model: source === "ai" ? model : null,
    },
    trace,
  };
}

// ---------- plan ----------

export interface PlanResult {
  status: "ok";
  /** null when the game engine builds it (it has its own designer) or no model is connected. */
  plan: AppPlan | null;
  engine: BuiltFile["engine"];
}

/**
 * Plan: before writing code, the App Planner turns the picked features, mods and the person's answers into a
 * detailed blueprint (screens, exact behavior, saved data, starter content, polish). The builder then follows it,
 * which is what makes the finished file detailed instead of a thin demo.
 */
export async function planApp(input: unknown, opts: RebuildOptions = {}): Promise<{ result: PlanResult | RebuildRefusal; trace: TraceEntry[] }> {
  const req = BuildRequest.parse(input);
  const target = clip(req.target, 80);
  const guard = checkRequest(requestText(req));
  if (!guard.allowed) return refuse(target, guard.reason!);
  if (req.system.format === "html" && isBlockGame([target, req.category, req.summary].join(" "))) {
    return { result: { status: "ok", plan: null, engine: "rvai-blocks" }, trace: [{ step: "app-planner", status: "ok", ms: 0, detail: "game engine designs it" }] };
  }
  const injected = scanForInjection(requestText(req)).length > 0;
  const p = injected ? null : provider(opts);
  const trace: TraceEntry[] = [];
  const plan = await runStep(
    {
      name: "app-planner",
      schema: AppPlan.nullable(),
      label: p ?? undefined,
      retries: 1,
      primary: () =>
        completeJson(
          AppPlan,
          "app_plan",
          `You are RVAI's App Planner. You turn a list of features into a detailed, original blueprint for a single-file ${req.system.format === "html" ? "web" : "Python desktop"} app that works offline. Describe behavior in your own words; never copy the original product's name, screens, wording or artwork.\n${SYSTEM_RULES}`,
          `Plan an original free app that does a similar job to ${target} (${req.category}): ${clip(req.summary, 400) || "(no summary)"}

Features to include:
${req.features.map((f) => `- ${f.label}${f.description ? `: ${f.description}` : ""}${f.custom ? " (the person's own mod)" : ""}`).join("\n")}
${wishes(req)}
Be specific and concrete but brief: name the buttons, fields, rules, scoring, limits and what happens on each action. At most 6 screens, 4 details per feature and 8 extras. Only plan extras that can be built reliably in one offline file; skip anything risky. Fit the plan to the person's answers. The starter content must be real and useful for them (for example real words and translations, real tasks, real recipes), at least 3 items per main list. Everything must work offline in one file with local storage.`,
          llm(p!, RESEARCH_MODEL, opts, 8000),
        ),
      fallback: { run: () => null, label: "builder plans on its own" },
      ...(p ? {} : { skipPrimary: injected ? "possible prompt injection" : opts.offline ? "offline mode" : "no AI key" }),
    },
    trace,
  );
  if (plan && auditOutput(plan).length) return refuse(target, "The plan pointed at sources RVAI won't share.");
  return { result: { status: "ok", plan, engine: null }, trace };
}

// ---------- repair ----------

export const RepairRequest = z.object({
  target: z.string().trim().min(1).max(80),
  content: z.string().min(1).max(MAX_FILE + 20_000),
  errors: z.array(z.string().max(400)).min(1).max(5),
  model: z.string().default(DEFAULT_REBUILD_MODEL),
});

export interface RepairedFile {
  status: "ok";
  content: string;
  bytes: number;
  model: string;
}

/**
 * Repair: the page opened the finished file in a hidden sandbox and it hit a runtime error or showed nothing.
 * The chosen model gets the file and the errors and returns the whole fixed file, which is checked again.
 * The title, notice and watchdog are kept exactly as they were.
 */
export async function repairApp(input: unknown, opts: RebuildOptions = {}): Promise<{ result: RepairedFile | RebuildRefusal; trace: TraceEntry[] }> {
  const req = RepairRequest.parse(input);
  const target = clip(req.target, 80);
  const errors = req.errors.map((e) => clip(e, 300));
  const guard = checkRequest(errors.join("\n"));
  if (!guard.allowed) return refuse(target, guard.reason!);
  const model = REBUILD_MODELS.some((m) => m.id === req.model) ? req.model : DEFAULT_REBUILD_MODEL;
  const p = provider(opts);
  const trace: TraceEntry[] = [];
  const header = req.content.match(/^\s*<!doctype html>\s*(<!--[\s\S]*?-->)?/i)?.[1] ?? "";
  const title = req.content.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const body = stripGuard(req.content).replace(header, "").trim();
  const fixed = await runStep(
    {
      name: "fixer",
      schema: z.string(),
      label: p ? model : undefined,
      primary: async () => {
        const file = extractFile(
          await completeText(
            `You are RVAI's Fixer. You repair single-file HTML apps so they open and fully work in a browser. Keep every feature, the design and the app's name.\n${SYSTEM_RULES}`,
            `This app shows these errors when it opens in a browser:\n${errors.map((e) => `- ${e}`).join("\n")}\n\nFind the cause of each error and anything else that would stop the app from working, and fix it. Return the whole corrected file, starting with <!DOCTYPE html> and ending with </html>. Output the file only.\n\n${body}`,
            { ...llm(p!, model, opts, 32000), timeoutMs: BUILD_TIMEOUT_MS },
          ),
          "html",
        );
        const problems = checkFile(file, "html");
        if (problems.length) throw new Error(`file check: ${problems.join(", ")}`);
        return file;
      },
      ...(p ? {} : { skipPrimary: opts.offline ? "offline mode" : "no AI key" }),
    },
    trace,
  );
  const restored = header ? fixed.replace(/^\s*<!doctype html>/i, (m) => `${m.trim()}\n${header}`) : fixed;
  const content = withGuard(title ? restored.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`) : restored, "html");
  return { result: { status: "ok", content, bytes: Buffer.byteLength(content), model }, trace };
}
