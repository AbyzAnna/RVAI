import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export type Provider = "anthropic" | "openrouter";

export const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5-5";
export const OPENROUTER_DEFAULT_MODEL = "anthropic/claude-opus-5.5";
export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

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
      model: opts.model ?? ANTHROPIC_DEFAULT_MODEL,
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
      model: opts.model ?? OPENROUTER_DEFAULT_MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_schema", json_schema: { name, strict: true, schema: z.toJSONSchema(schema) } },
      // Only route to providers that honor the schema.
      provider: { require_parameters: true },
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
