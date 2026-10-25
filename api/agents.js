// Vercel function for GET /api/agents: the orchestrator and the sub-agents it dispatches to.
import { AGENTS } from "../dist/agents/index.js";

export default function handler(req, res) {
  res.status(200).json({ agents: AGENTS });
}
