// Vercel function for GET /api/examples (same contract as src/server.ts).
import { EXAMPLES } from "../dist/server.js";

export default function handler(req, res) {
  res.status(200).json({ examples: EXAMPLES });
}
