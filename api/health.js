// Vercel function for GET /api/health: tells the web app a backend is present (same contract as src/server.ts).
import { pickProvider } from "../dist/llm.js";

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ ok: true, ai: pickProvider(process.env) });
}
