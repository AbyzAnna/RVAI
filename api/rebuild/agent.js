// Vercel function for POST /api/rebuild/agent: runs one research agent, so the page can run them side by side.
import { researchAgent } from "../../dist/rebuild.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "use POST" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || typeof body.agent !== "string") return res.status(400).json({ error: "Send a name and an agent." });
    res.status(200).json(await researchAgent(name, body.agent));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "agent failed", trace: err?.trace });
  }
}
