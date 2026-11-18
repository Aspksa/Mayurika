"""Local HTTP tests with no external packages."""
import http.client
import json
import sys
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
import main as api
from db import connect, migrate


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        api.DB_PATH = Path(cls.tmp.name) / "memory.sqlite3"
        api.UI = Path(cls.tmp.name) / "dist"
        api.UI.mkdir()
        for filename, content in [("index.html", "<h1>Mayurika</h1>"),
                                  ("app.js", "console.log('ready')"),
                                  ("style.css", "body{color:gold}")]:
            (api.UI / filename).write_text(content, encoding="utf-8")
        with connect(api.DB_PATH) as db:
            migrate(db)
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), api.Handler)
        cls.server.daemon_threads = True
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)
        cls.tmp.cleanup()

    def request(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        conn.request(method, path, body=body, headers=headers or {})
        res = conn.getresponse()
        data = res.read()
        status = res.status
        conn.close()
        return status, data

    def test_static_assets(self):
        for path in ("/", "/app.js", "/style.css"):
            code, body = self.request("GET", path)
            self.assertEqual(code, 200)
            self.assertTrue(body)

    def test_traversal_blocked(self):
        code, _ = self.request("GET", "/../backend/db.py")
        self.assertEqual(code, 404)

    def test_cross_origin_write_blocked(self):
        code, _ = self.request("POST", "/api/memory", b'{"content":"unsafe"}',
                               {"Content-Type": "application/json",
                                "Origin": "https://example.org"})
        self.assertEqual(code, 403)

    def test_content_type_required(self):
        code, _ = self.request("POST", "/api/memory", b'{"content":"unsafe"}',
                               {"Content-Type": "text/plain"})
        self.assertEqual(code, 415)

    def test_save_and_search(self):
        code, body = self.request("POST", "/api/memory",
                                  json.dumps({"content": "Golden kitsune"}).encode(),
                                  {"Content-Type": "application/json"})
        self.assertEqual(code, 201)
        self.assertEqual(json.loads(body)["status"], "pending")
        code, body = self.request("GET", "/api/memory/search?q=Golden")
        self.assertEqual(code, 200)
        self.assertEqual(len(json.loads(body)["results"]), 1)


if __name__ == "__main__":
    unittest.main()
