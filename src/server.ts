import { existsSync, readFileSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { run, StepError, type RunOptions } from "./orchestrator.js";

const PAGE = fileURLToPath(new URL("../web/index.html", import.meta.url));
const MAX_BODY = 4096;

export const EXAMPLES = [
  "I need something like Photoshop for my Linux laptop to retouch photos with layers and masks",
  "A cozy block building game like Minecraft that runs on an old laptop, multiplayer with friends",
  "Free replacement for Microsoft Office on my Mac, must open docx and xlsx files",
  "I want to make my first 2D game like in Unity, I'm a beginner",
  "I need to edit and sign PDF forms like in Adobe Acrobat, on Windows",
  "How do I crack Photoshop?",
];

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error("request too large");
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

/** A small local web server: GET / serves the page, POST /api/recommend runs the pipeline. */
export function createServer(base: RunOptions = {}): Server {
  return createHttpServer(async (req, res) => {
    const send = (status: number, body: unknown, type = "application/json") => {
      res.writeHead(status, { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store" });
      res.end(type === "application/json" ? JSON.stringify(body) : String(body));
    };
    try {
      if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) return send(200, readFileSync(PAGE, "utf8"), "text/html");
      if (req.method === "GET" && req.url === "/api/examples") return send(200, { examples: EXAMPLES });
      if (req.method === "POST" && req.url === "/api/recommend") {
        const body = (await readJson(req)) as { query?: unknown; offline?: unknown };
        const query = typeof body.query === "string" ? body.query.trim().slice(0, 500) : "";
        if (!query) return send(400, { error: "Describe what you need." });
        const { result, trace } = await run(query, { ...base, offline: base.offline || body.offline === true });
        return send(200, { result, trace });
      }
      send(404, { error: "not found" });
    } catch (err) {
      if (err instanceof StepError) return send(500, { error: err.message, trace: err.trace });
      send(400, { error: err instanceof Error ? err.message : "bad request" });
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const port = Number(process.env.PORT ?? 3000);
  createServer().listen(port, "127.0.0.1", () => console.log(`RVAI is running at http://localhost:${port}`));
}
