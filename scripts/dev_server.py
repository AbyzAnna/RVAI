"""Serve the repository root and forward /api/* to Anna's backend, so the UI and API share one origin.

Anna's server (src/server.ts, `npm run web`) sends no CORS headers, so the browser cannot call it from
http://127.0.0.1:4173 directly. Run this instead of `python3 -m http.server`:

    python3 scripts/dev_server.py                      # UI on :4173, API forwarded to http://127.0.0.1:3000
    python3 scripts/dev_server.py --port 4173 --api http://127.0.0.1:3000

Standard library only. Binds to 127.0.0.1; for local demos, not deployment.
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAX_BODY = 64 * 1024
TIMEOUT_S = 90  # the UI gives up after 60 s; live discovery can be slow


class Handler(http.server.SimpleHTTPRequestHandler):
    api_base = "http://127.0.0.1:3000"

    def do_GET(self) -> None:
        if self.path.startswith("/api/"):
            return self._forward(None)
        super().do_GET()

    def do_POST(self) -> None:
        if not self.path.startswith("/api/"):
            return self._reply(404, b'{"error":"not found"}')
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            return self._reply(413, b'{"error":"request too large"}')
        self._forward(self.rfile.read(length))

    def _forward(self, body: bytes | None) -> None:
        req = urllib.request.Request(self.api_base.rstrip("/") + self.path, data=body, method=self.command,
                                     headers={"Content-Type": self.headers.get("Content-Type", "application/json")})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as res:
                self._reply(res.status, res.read(), res.headers.get("Content-Type"))
        except urllib.error.HTTPError as err:  # backend answered with 4xx/5xx: pass it through unchanged
            self._reply(err.code, err.read(), err.headers.get("Content-Type"))
        except (urllib.error.URLError, TimeoutError, ConnectionError) as err:
            reason = getattr(err, "reason", err)
            msg = f"RVAI backend unreachable at {self.api_base} ({reason}). Start it with `npm run web` in Anna's repo"
            self._reply(502, json.dumps({"error": msg}).encode())

    def _reply(self, status: int, body: bytes, content_type: str | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type or "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def make_server(port: int, api: str) -> http.server.ThreadingHTTPServer:
    handler = functools.partial(type("BoundHandler", (Handler,), {"api_base": api}), directory=str(ROOT))
    return http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--port", type=int, default=4173)
    ap.add_argument("--api", default="http://127.0.0.1:3000", help="base URL of Anna's backend")
    args = ap.parse_args()
    server = make_server(args.port, args.api)
    print(f"RVAI UI: http://127.0.0.1:{args.port}/ui/  ·  /api/* -> {args.api}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
