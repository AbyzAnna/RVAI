// Vercel function for GET /api/rebuild/models: the AI models the person can pick for building.
import { REBUILD_MODELS } from "../../dist/rebuild.js";

export default function handler(req, res) {
  res.status(200).json({ models: REBUILD_MODELS });
}
