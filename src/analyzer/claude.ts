import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Catalog, GoalProfile } from "../schemas.js";
import { LlmGoal, systemPrompt, toProfile } from "./prompt.js";

export const DEFAULT_MODEL = "claude-opus-5-5";

/** The slice of the SDK client the analyzer uses, so tests can pass a fake. */
export type MessagesClient = Pick<Anthropic, "messages">;

export function hasApiCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
}

/** Goal analyzer backed by Claude structured output. Throws on refusal or an unusable answer. */
export async function analyzeWithClaude(
  query: string,
  catalog: Catalog,
  opts: { client?: MessagesClient; model?: string } = {},
): Promise<GoalProfile> {
  const client = opts.client ?? new Anthropic();
  const response = await client.messages.parse({
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(LlmGoal) },
    system: systemPrompt(catalog),
    messages: [{ role: "user", content: query }],
  });

  if (response.stop_reason === "refusal") throw new Error("Claude declined the request");
  const parsed = response.parsed_output;
  if (!parsed) throw new Error(`Claude returned no parsable profile (stop_reason: ${response.stop_reason})`);
  return toProfile(query, parsed, catalog, "claude");
}
