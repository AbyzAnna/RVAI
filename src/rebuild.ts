import { z } from "zod";
import { scanForInjection } from "./agents/index.js";
import { checkUrlLoads, type UrlCheck } from "./discover.js";
import { auditOutput, checkRequest, isSafeUrl, REFUSAL_PREFIX, SYSTEM_RULES } from "./guardrails.js";
import { completeJson, completeText, hasApiCredentials, hasOpenRouterKey, type MessagesClient, type Provider } from "./llm.js";
import { runStep, type TraceEntry } from "./orchestrator.js";
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

/**
 * Research: three agents run in parallel (Product Profiler, Feature Mapper, Stack Detective), then
 * the Link Checker confirms the official site loads. Each agent's output is schema-checked.
 */
export async function researchApp(rawQuery: string, opts: RebuildOptions = {}): Promise<{ result: AppProfile | RebuildRefusal; trace: TraceEntry[] }> {
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

  const ask = <S extends z.ZodType>(schema: S, name: string, task: string) =>
    completeJson(schema, name, `You are one of RVAI's research agents.\n${PUBLIC_ONLY}`, `App or website: "${query}"\n\n${task}`, llm(p, RESEARCH_MODEL, opts, 3000));

  const traces: TraceEntry[][] = [[], [], []];
  const [profile, features, stack] = await Promise.all([
    runStep({
        name: "product-profiler",
        schema: Profiler,
        label: p,
        retries: 1,
        primary: () => ask(Profiler, "profile", "Identify the product: its official name, official homepage, category, a short summary and its audience."),
        fallback: { run: () => ({ known: false, officialName: query, officialUrl: null, category: "app", summary: "", audience: "" }), label: "unknown product" },
      },
      traces[0],
    ),
    runStep(
      {
        name: "feature-mapper",
        schema: FeatureList,
        label: p,
        retries: 1,
        primary: () => ask(FeatureList, "features", "List 8 to 12 user-visible features, as a user would describe them. Mark the 4 to 6 that define the product as core. Keep each label under 6 words."),
        fallback: { run: () => ({ features: fallbackProfile(query).features }), label: "generic features" },
      },
      traces[1],
    ),
    runStep(
      {
        name: "stack-detective",
        schema: Stack,
        label: p,
        primary: () => ask(Stack, "stack", "Give its likely tech stack from public signals only: job posts, engineering blogs, open-source repos it publishes, the type of app it ships (web, Electron, native). At most 6 items, each 1 to 3 words (e.g. \"Java\", \"OpenGL\"). Say what each guess is based on."),
        fallback: { run: () => ({ likely: [], signals: [], confidence: "low" as const }), label: "no stack guess" },
      },
      traces[2],
    ),
  ]).catch((err) => {
    trace.push(...traces.flat());
    throw err;
  });
  trace.push(...traces.flat());

  // Only show the official link if it is a safe https link that actually loads.
  const started = Date.now();
  const url = profile.officialUrl && isSafeUrl(profile.officialUrl) && (await (opts.urlCheck ?? checkUrlLoads)(profile.officialUrl)) ? profile.officialUrl : null;
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
    source: "ai",
    notice: RESEARCH_NOTICE,
  });
  const problems = auditOutput(result);
  if (problems.length) return refuse(query, "The research results pointed at sources RVAI won't share.");
  return { result, trace };
}

// ---------- build ----------

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
});
export type BuildRequest = z.infer<typeof BuildRequest>;

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
  model: string | null;
}

const Naming = z.object({ appName: z.string(), tagline: z.string() });
const MAX_FILE = 400_000;
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

/** Checks a generated file is complete, self-contained and clean. Empty means it passed. */
export function checkFile(content: string, format: Format): string[] {
  const problems: string[] = [];
  if (content.length > MAX_FILE) problems.push("file is too large");
  if (format === "html") {
    if (!/^\s*<!doctype html>/i.test(content)) problems.push("does not start with <!DOCTYPE html>");
    if (!/<\/html>\s*$/i.test(content)) problems.push("is cut off before </html>");
    if (!/<script\b/i.test(content)) problems.push("has no script, so nothing would work");
    if (EXTERNAL_RESOURCE.test(content)) problems.push("loads files from the internet, so it isn't one self-contained file");
  } else {
    if (!/if __name__ == ["']__main__["']/.test(content)) problems.push("has no main entry point");
    if (THIRD_PARTY_PY.test(content)) problems.push("needs packages outside the Python standard library");
  }
  if (auditOutput(content).length) problems.push("mentions piracy terms or unsafe links");
  return problems;
}

function builderPrompt(req: BuildRequest, appName: string): { system: string; user: string } {
  const os = osName(req.system.os);
  const mod = req.system.os === "macos" ? "Cmd" : "Ctrl";
  const format =
    req.system.format === "html"
      ? `Write ONE complete HTML5 file that opens by double-clicking it on ${os}.
- Inline <style> and <script> only. No external URLs at all: no CDNs, web fonts, remote images or analytics. Draw icons with inline SVG or CSS.
- Save the person's data in localStorage and add export/import of that data as a JSON file.
- Work fully offline. If a feature normally needs a server (accounts, sync, sharing), make a local version and say so in the UI.
- Keyboard shortcuts use ${mod}. Responsive layout, accessible labels, a clean modern look of your own.
- Start your reply with <!DOCTYPE html> and end it with </html>. Output the file only.`
      : `Write ONE complete Python 3.10+ file that runs with "python3 file.py" on ${os}${req.system.arch !== "unknown" ? ` (${req.system.arch})` : ""}.
- Standard library only: tkinter/ttk for the window. No pip packages.
- Save the person's data as JSON in their home folder.
- Keyboard shortcuts use ${mod === "Cmd" ? "Command" : "Control"}. Clean layout with ttk widgets.
- End with: if __name__ == "__main__": main()
- Output the file only, no explanation.`;
  return {
    system: `You are RVAI's App Builder. You write original, working software in a single file.
Clean-room rules: you only get a plain description of features. Do not reproduce any product's code, exact screens, logos, icons, artwork, sounds, wording or name. Use your own design and the app name "${appName}".
${SYSTEM_RULES}`,
    user: `Build "${appName}", an original ${req.category} app that does a similar job to ${req.target}: ${req.summary || "(no summary)"}.

Implement every one of these features so it really works:
${req.features.map((f) => `- ${f.label}${f.description ? `: ${f.description}` : ""}${f.custom ? " (a new idea the original doesn't have)" : ""}`).join("\n")}
${req.notes ? `\nThe person also said: ${req.notes}\n` : ""}
${format}
Keep it compact (under 500 lines) but complete: no TODOs, no placeholders, no fake buttons.`,
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
export async function buildApp(input: unknown, opts: RebuildOptions = {}): Promise<{ result: BuiltFile | RebuildRefusal; trace: TraceEntry[] }> {
  const req = BuildRequest.parse(input);
  const target = clip(req.target, 80);
  const everything = [target, req.summary, req.notes, ...req.features.flatMap((f) => [f.label, f.description])].join("\n");
  const guard = checkRequest(everything);
  if (!guard.allowed) return refuse(target, guard.reason!);
  const injected = scanForInjection(everything).length > 0;
  const model = REBUILD_MODELS.some((m) => m.id === req.model) ? req.model : DEFAULT_REBUILD_MODEL;
  const p = injected ? null : provider(opts);
  const trace: TraceEntry[] = [{ step: "guard-input", status: "ok", ms: 0, ...(injected ? { detail: "prompt injection: model calls disabled" } : {}) }];
  const format = req.system.format;
  const features = req.features.map((f) => ({ label: clip(f.label, 80), description: clip(f.description, 240), custom: f.custom }));
  const skip = injected ? "possible prompt injection" : opts.offline ? "offline mode" : "no AI key";

  const naming = await runStep(
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
          llm(p!, NAMER_MODEL, opts, 300),
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

  const { system, user } = builderPrompt({ ...req, target, features }, appName);
  const template = () => (format === "html" ? htmlTemplate : pythonTemplate)({ appName, target, summary: clip(req.summary, 200), features: features.map(({ label, description }) => ({ label, description })) });
  let source: BuiltFile["source"] = "ai";
  const deadline = Date.now() + (opts.budgetMs ?? 250_000);
  const content = await runStep(
    {
      name: "app-builder",
      schema: z.string(),
      label: p ? model : undefined,
      retries: 1,
      primary: async () => {
        // Stay inside the hosting time limit: a retry only runs if there is still room for it.
        const left = deadline - Date.now();
        if (left < 45_000) throw new Error("out of time for another try");
        const file = extractFile(await completeText(system, user, { ...llm(p!, model, opts, 16000), timeoutMs: Math.min(180_000, left) }), format);
        const problems = checkFile(file, format);
        if (problems.length) throw new Error(`file check: ${problems.join(", ")}`);
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

  const final = withNotice(withTitle(content, format, title), format, notice(title, target, instructions));
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
      model: source === "ai" ? model : null,
    },
    trace,
  };
}
