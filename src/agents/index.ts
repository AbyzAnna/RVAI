/** The agents the orchestrator dispatches to, in the order they run. Served at GET /api/agents. */
export const AGENTS = [
  { id: "orchestrator", name: "Orchestrator", role: "Routes the request, holds shared state, runs independent agents in parallel and merges their output." },
  { id: "goal-analyzer", name: "Goal Analyzer", role: "Turns the request into a goal profile: target product, tasks, must-haves, platforms, skill level and vibe." },
  { id: "alternative-finder", name: "Alternative Finder", role: "Finds free and open-source alternatives in the catalog, or discovers them live and checks their links." },
  { id: "gap-comparator", name: "Feature-Gap Comparator", role: "Scores each alternative against the must-haves and lists missing, partial and plug-in features." },
  { id: "threat-risk", name: "Threat & Risk", role: "Flags legal/IP risks, unsafe download sources, closed or unmaintained tools, and prompt injection." },
  { id: "synthesizer", name: "Recommendation Synthesizer", role: "Merges picks, gaps, risks and a clean-room build plan into one recommendation." },
] as const;

export type AgentId = (typeof AGENTS)[number]["id"];
export { assessThreats, scanForInjection, scopeThreats } from "./threat-risk.js";
