// Vercel function for /api/auth/{signup,login,logout,me}: same contract as src/server.ts (see src/auth.ts).
import { ACTIONS, handleAuth } from "../../dist/auth.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const action = String(req.query.action ?? "");
  if (!ACTIONS.includes(action)) return res.status(404).json({ error: "not found" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
    const reply = await handleAuth({ action, method: req.method, body, cookie: req.headers.cookie }, process.env);
    if (reply.cookie) res.setHeader("Set-Cookie", reply.cookie);
    res.status(reply.status).json(reply.body);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "bad request" });
  }
}
