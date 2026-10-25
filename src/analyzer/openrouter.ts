import { z } from "zod";
import type { Catalog, GoalProfile } from "../schemas.js";
import { LlmGoal, systemPrompt, toProfile } from "./prompt.js";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_DEFAULT_MODEL = "anthropic/claude-opus-5.5";

export function hasOpenRouterKey(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.OPENROUTER_API_KEY);
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

/** Goal analyzer that calls Claude through OpenRouter with a strict JSON schema. */
export async function analyzeWithOpenRouter(
  query: string,
  catalog: Catalog,
  opts: { apiKey?: string; model?: string; fetch?: typeof fetch; env?: NodeJS.ProcessEnv } = {},
): Promise<GoalProfile> {
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
      max_tokens: 4000,
      messages: [
        { role: "system", content: systemPrompt(catalog) },
        { role: "user", content: query },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "goal_profile", strict: true, schema: z.toJSONSchema(LlmGoal) },
      },
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
  const parsed = LlmGoal.parse(JSON.parse(choice.message.content));
  return toProfile(query, parsed, catalog, "openrouter");
}
