import http.server
import json
import sys
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import dev_server  # noqa: E402


class FakeBackend(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        status, out = (200, {"result": {"status": "ok"}, "echo": body}) if body.get("query") else (400, {"error": "Describe what you need."})
        data = json.dumps(out).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


def serve(server):
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{server.server_address[1]}"


def post(url, payload):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=5) as res:
            return res.status, json.loads(res.read())
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read())


class DevServerTest(unittest.TestCase):
    def setUp(self):
        dev_server.Handler.log_message = lambda *a: None
        self.backend = http.server.ThreadingHTTPServer(("127.0.0.1", 0), FakeBackend)
        self.proxy = dev_server.make_server(0, serve(self.backend))
        self.base = serve(self.proxy)

    def tearDown(self):
        for s in (self.proxy, self.backend):
            s.shutdown()
            s.server_close()

    def test_forwards_post_and_passes_errors_through(self):
        self.assertEqual(post(self.base + "/api/recommend", {"query": "a free Figma"}), (200, {"result": {"status": "ok"}, "echo": {"query": "a free Figma"}}))
        self.assertEqual(post(self.base + "/api/recommend", {"query": ""}), (400, {"error": "Describe what you need."}))

    def test_serves_ui_files(self):
        with urllib.request.urlopen(self.base + "/ui/index.html", timeout=5) as res:
            self.assertIn(b"<html", res.read())

    def test_unreachable_backend_is_a_clear_502(self):
        dead = dev_server.make_server(0, "http://127.0.0.1:9")  # nothing listens on the discard port
        status, body = post(serve(dead) + "/api/recommend", {"query": "x"})
        dead.shutdown()
        dead.server_close()
        self.assertEqual(status, 502)
        self.assertIn("unreachable", body["error"])


if __name__ == "__main__":
    unittest.main()
