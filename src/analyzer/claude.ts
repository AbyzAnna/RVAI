import { completeJson, type MessagesClient } from "../llm.js";
import type { Catalog, GoalProfile } from "../schemas.js";
import { LlmGoal, systemPrompt, toProfile } from "./prompt.js";

export { ANTHROPIC_DEFAULT_MODEL as DEFAULT_MODEL, hasApiCredentials, type MessagesClient } from "../llm.js";

/** Goal analyzer backed by Claude structured output. Throws on refusal or an unusable answer. */
export async function analyzeWithClaude(
  query: string,
  catalog: Catalog,
  opts: { client?: MessagesClient; model?: string } = {},
): Promise<GoalProfile> {
  const parsed = await completeJson(LlmGoal, "goal_profile", systemPrompt(catalog), query, { provider: "anthropic", role: "analyzer", ...opts });
  return toProfile(query, parsed, catalog, "claude");
}
