// Vercel function for POST /api/rebuild/research: same contract as src/server.ts.
import { researchApp } from "../../dist/rebuild.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "use POST" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return res.status(400).json({ error: "Type the name of an app or website." });
    const parts = body.parts && typeof body.parts === "object" ? body.parts : undefined;
    res.status(200).json(await researchApp(name, {}, parts));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "research failed", trace: err?.trace });
  }
}
