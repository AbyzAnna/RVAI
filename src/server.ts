import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { createServer as createHttpServer, type IncomingMessage, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { AGENTS } from "./agents/index.js";
import { ACTIONS, handleAuth } from "./auth.js";
import { pickProvider } from "./llm.js";
import { run, StepError, type RunOptions } from "./orchestrator.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PAGE = join(ROOT, "web", "index.html");
// Static folders served as-is: the RVAI web app (ui/) and the catalog files it reads (data/).
const STATIC_DIRS = ["ui", "data"];
const TYPES: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
};

/** Resolves /ui/... or /data/... to a file inside those folders, or null (never escapes them). */
function staticFile(urlPath: string): string | null {
  const path = decodeURIComponent(urlPath.split("?")[0]);
  const dir = STATIC_DIRS.find((d) => path === `/${d}` || path.startsWith(`/${d}/`));
  if (!dir) return null;
  const base = join(ROOT, dir);
  let file = normalize(join(ROOT, path));
  if (file !== base && !file.startsWith(base + sep)) return null;
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  return existsSync(file) && statSync(file).isFile() ? file : null;
}
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

/**
 * A small local web server: the RVAI web app at /ui/ (and the catalog files in /data/), the simple
 * page at /simple, and POST /api/recommend, all on one origin so the app needs no CORS or proxy.
 */
export function createServer(base: RunOptions = {}): Server {
  return createHttpServer(async (req, res) => {
    const send = (status: number, body: unknown, type = "application/json") => {
      res.writeHead(status, { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store" });
      res.end(type === "application/json" ? JSON.stringify(body) : String(body));
    };
    try {
      const url = req.url ?? "/";
      if (req.method === "GET" && url === "/") {
        res.writeHead(302, { Location: "/ui/" });
        return res.end();
      }
      if (req.method === "GET" && url === "/ui") {
        res.writeHead(301, { Location: "/ui/" });
        return res.end();
      }
      if (req.method === "GET" && (url === "/simple" || url === "/index.html")) return send(200, readFileSync(PAGE, "utf8"), "text/html");
      if (req.method === "GET" && url === "/favicon.ico") {
        res.writeHead(204);
        return res.end();
      }
      if (req.method === "GET" && url === "/api/examples") return send(200, { examples: EXAMPLES });
      if (req.method === "GET" && url === "/api/agents") return send(200, { agents: AGENTS });
      if (req.method === "GET" && url === "/api/health") {
        const env = base.env ?? process.env;
        return send(200, { ok: true, ai: base.offline ? null : pickProvider(env, base.client) });
      }
      const auth = /^\/api\/auth\/([a-z]+)$/.exec(url.split("?")[0]);
      if (auth && (ACTIONS as readonly string[]).includes(auth[1])) {
        const body = req.method === "POST" ? await readJson(req) : undefined;
        const reply = await handleAuth({ action: auth[1], method: req.method ?? "GET", body, cookie: req.headers.cookie }, base.env ?? process.env, base.fetch);
        if (reply.cookie) res.setHeader("Set-Cookie", reply.cookie);
        return send(reply.status, reply.body);
      }
      const file = req.method === "GET" ? staticFile(url) : null;
      if (file) {
        res.writeHead(200, { "Content-Type": `${TYPES[extname(file)] ?? "application/octet-stream"}; charset=utf-8`, "Cache-Control": "no-store" });
        return res.end(readFileSync(file));
      }
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
  createServer().listen(port, "127.0.0.1", () => console.log(`RVAI is running at http://localhost:${port}/ui/`));
}
