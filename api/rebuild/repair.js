// Vercel function for POST /api/rebuild/repair. Same contract as src/server.ts.
import { repairApp } from "../../dist/rebuild.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "use POST" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
    res.status(200).json(await repairApp(body));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "repair failed" });
  }
}
