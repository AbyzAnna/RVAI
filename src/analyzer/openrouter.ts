import { completeJson } from "../llm.js";
import type { Catalog, GoalProfile } from "../schemas.js";
import { LlmGoal, systemPrompt, toProfile } from "./prompt.js";

export { hasOpenRouterKey, OPENROUTER_DEFAULT_MODEL, OPENROUTER_URL } from "../llm.js";

/** Goal analyzer that calls Claude through OpenRouter with a strict JSON schema. */
export async function analyzeWithOpenRouter(
  query: string,
  catalog: Catalog,
  opts: { apiKey?: string; model?: string; fetch?: typeof fetch; env?: NodeJS.ProcessEnv } = {},
): Promise<GoalProfile> {
  const parsed = await completeJson(LlmGoal, "goal_profile", systemPrompt(catalog), query, { provider: "openrouter", role: "analyzer", ...opts });
  return toProfile(query, parsed, catalog, "openrouter");
}
