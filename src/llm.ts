import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export type Provider = "anthropic" | "openrouter";

export const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5-5";
export const OPENROUTER_DEFAULT_MODEL = "anthropic/claude-opus-5.5";
export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * The model each agent uses when no model is forced. Reading a request is a short structured task, so the
 * Goal Analyzer uses a fast model; naming real, current open-source projects is where the strongest model
 * pays off, so Alternative Finder's live discovery uses it. On OpenRouter the later entries are fallbacks
 * it switches to when the first is down.
 */
export const AGENT_MODELS = {
  analyzer: { anthropic: "claude-sonnet-5-5", openrouter: ["anthropic/claude-sonnet-5.5", "anthropic/claude-opus-5.5", "anthropic/claude-haiku-5.5"] },
  discovery: { anthropic: "claude-opus-5-5", openrouter: ["anthropic/claude-opus-5.5", "anthropic/claude-sonnet-5.5"] },
} as const;
export type AgentRole = keyof typeof AGENT_MODELS;

/** The slice of the SDK client RVAI uses, so tests can pass a fake. */
export type MessagesClient = Pick<Anthropic, "messages">;

export interface LlmOptions {
  provider: Provider;
  client?: MessagesClient;
  fetch?: typeof fetch;
  apiKey?: string;
  env?: NodeJS.ProcessEnv;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  /** Picks the agent's model from AGENT_MODELS when `model` isn't set. */
  role?: AgentRole;
}

export function hasApiCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
}

export function hasOpenRouterKey(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.OPENROUTER_API_KEY);
}

/** Which provider to use: the Anthropic API (explicit client or key), then OpenRouter, else none. */
export function pickProvider(env: NodeJS.ProcessEnv, client?: MessagesClient): Provider | null {
  if (client || hasApiCredentials(env)) return "anthropic";
  if (hasOpenRouterKey(env)) return "openrouter";
  return null;
}

const Completion = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        message: z.object({ content: z.string().nullable().optional(), refusal: z.string().nullable().optional() }),
      }),
    )
    .min(1),
});

function openRouterModels(opts: LlmOptions): { model: string; models?: string[] } {
  if (opts.model || !opts.role) return { model: opts.model ?? OPENROUTER_DEFAULT_MODEL };
  const [model, ...fallbacks] = AGENT_MODELS[opts.role].openrouter;
  return { model, models: [model, ...fallbacks] };
}

/** One structured call to Claude: returns output that matches the schema, or throws. */
export async function completeJson<S extends z.ZodType>(
  schema: S,
  name: string,
  system: string,
  user: string,
  opts: LlmOptions,
): Promise<z.infer<S>> {
  const maxTokens = opts.maxTokens ?? 4000;

  if (opts.provider === "anthropic") {
    const client = opts.client ?? new Anthropic();
    const response = await client.messages.parse({
      model: opts.model ?? (opts.role ? AGENT_MODELS[opts.role].anthropic : ANTHROPIC_DEFAULT_MODEL),
      max_tokens: maxTokens,
      output_config: { effort: "low", format: zodOutputFormat(schema) },
      system,
      messages: [{ role: "user", content: user }],
    });
    if (response.stop_reason === "refusal") throw new Error("Claude declined the request");
    if (response.parsed_output == null) throw new Error(`Claude returned no parsable output (stop_reason: ${response.stop_reason})`);
    return schema.parse(response.parsed_output);
  }

  const apiKey = opts.apiKey ?? (opts.env ?? process.env).OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  const res = await (opts.fetch ?? fetch)(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/AbyzAnna/RVAI",
      "X-Title": "RVAI",
    },
    body: JSON.stringify({
      ...openRouterModels(opts),
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_schema", json_schema: { name, strict: true, schema: z.toJSONSchema(schema) } },
      // Only route to providers that honor the schema.
      provider: { require_parameters: true },
      // Same as the Anthropic path: these are short structured answers, so long thinking only adds wait.
      reasoning: { effort: "low" },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const choice = Completion.parse(await res.json()).choices[0];
  if (choice.message.refusal) throw new Error("Claude declined the request");
  if (!choice.message.content) throw new Error(`OpenRouter returned no content (finish_reason: ${choice.finish_reason})`);
  return schema.parse(JSON.parse(choice.message.content));
}

/** One free-text call (for long outputs such as a whole generated file). Returns the reply text, or throws. */
export async function completeText(system: string, user: string, opts: LlmOptions): Promise<string> {
  const maxTokens = opts.maxTokens ?? 16000;

  if (opts.provider === "anthropic") {
    const client = opts.client ?? new Anthropic();
    const response = await client.messages.create({
      model: opts.model ?? ANTHROPIC_DEFAULT_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    });
    if (response.stop_reason === "refusal") throw new Error("Claude declined the request");
    const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    if (!text) throw new Error(`Claude returned no text (stop_reason: ${response.stop_reason})`);
    return text;
  }

  const apiKey = opts.apiKey ?? (opts.env ?? process.env).OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  const res = await (opts.fetch ?? fetch)(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/AbyzAnna/RVAI",
      "X-Title": "RVAI",
    },
    body: JSON.stringify({
      model: opts.model ?? OPENROUTER_DEFAULT_MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      // Long thinking can use up the whole budget before the file is written.
      reasoning: { effort: "low" },
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 150_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const choice = Completion.parse(await res.json()).choices[0];
  if (choice.message.refusal) throw new Error("the model declined the request");
  if (!choice.message.content) throw new Error(`OpenRouter returned no content (finish_reason: ${choice.finish_reason})`);
  if (choice.finish_reason === "length") throw new Error("the model ran out of room before finishing the file");
  return choice.message.content;
}

export interface StreamedText {
  text: string;
  /** false when the reply was cut off: by the token limit or because `stopAt` came first. */
  finished: boolean;
}

/**
 * Like completeText, but streams the reply so a long file that can't finish in time is kept instead of lost:
 * at `stopAt` (a Date.now() time) or at the token limit it returns what was written so far with finished=false.
 * The Anthropic path has no partial result and behaves like completeText.
 */
export async function streamText(system: string, user: string, opts: LlmOptions & { stopAt: number }): Promise<StreamedText> {
  if (opts.provider === "anthropic") return { text: await completeText(system, user, { ...opts, timeoutMs: Math.max(1000, opts.stopAt - Date.now()) }), finished: true };
  const apiKey = opts.apiKey ?? (opts.env ?? process.env).OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), Math.max(0, opts.stopAt - Date.now()));
  let text = "";
  try {
    const res = await (opts.fetch ?? fetch)(OPENROUTER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://github.com/AbyzAnna/RVAI", "X-Title": "RVAI" },
      body: JSON.stringify({
        model: opts.model ?? OPENROUTER_DEFAULT_MODEL,
        max_tokens: opts.maxTokens ?? 16000,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        reasoning: { effort: "low" },
        stream: true,
      }),
      signal: abort.signal,
    });
    if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    // A plain JSON answer (some proxies and the tests) is read like completeText's.
    if (!(res.headers.get("content-type") ?? "").includes("event-stream")) {
      const choice = Completion.parse(await res.json()).choices[0];
      if (choice.message.refusal) throw new Error("the model declined the request");
      return { text: choice.message.content ?? "", finished: choice.finish_reason !== "length" };
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finish: string | null = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
        const event = JSON.parse(line.slice(6)) as { error?: { message?: string }; choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }> };
        if (event.error) throw new Error(`OpenRouter: ${event.error.message ?? "stream error"}`);
        const choice = event.choices?.[0];
        text += choice?.delta?.content ?? "";
        if (choice?.finish_reason) finish = choice.finish_reason;
      }
    }
    return { text, finished: finish !== null && finish !== "length" };
  } catch (err) {
    // Out of time: keep what was written so far, so the next request can continue it.
    if (abort.signal.aborted && text) return { text, finished: false };
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
