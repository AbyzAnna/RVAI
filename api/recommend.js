// Vercel function for POST /api/recommend: same contract as src/server.ts, running the compiled pipeline (npm run build).
import { requestContext, run, StepError } from "../dist/orchestrator.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "use POST" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
    const query = typeof body.query === "string" ? body.query.trim().slice(0, 500) : "";
    if (!query) return res.status(400).json({ error: "Describe what you need." });
    const { result, trace } = await run(query, { offline: body.offline === true, context: requestContext(body.context), plan: body.plan === true });
    res.status(200).json({ result, trace });
  } catch (err) {
    if (err instanceof StepError) return res.status(500).json({ error: err.message, trace: err.trace });
    res.status(400).json({ error: err instanceof Error ? err.message : "bad request" });
  }
}
