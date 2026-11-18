import json
import sys
import tempfile
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"backend"))
import main
from db import connect,migrate,remember
from memory_relations import propose_relations

class MapApiTests(unittest.TestCase):
    def test_map_returns_real_nodes_and_edges(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/"test.sqlite3"
            with connect(path) as db:
                migrate(db)
                remember(db,"проект Mayurika использует SQLite память")
                mid=remember(db,"проект Mayurika использует SQLite базу")
                propose_relations(db,mid)
            with patch.object(main,"DB_PATH",path):
                server=ThreadingHTTPServer(("127.0.0.1",0),main.Handler)
                thread=threading.Thread(target=server.serve_forever,daemon=True)
                thread.start()
                try:
                    with urllib.request.urlopen(f"http://127.0.0.1:{server.server_port}/api/memory/map") as response:
                        payload=json.load(response)
                    self.assertEqual(payload["limit"],200)
                    self.assertFalse(payload["has_more"])
                    self.assertIsNone(payload["next_before"])
                    self.assertEqual(len(payload["nodes"]),2)
                    self.assertEqual(len(payload["links"]),1)
                    self.assertEqual(payload["links"][0]["relation"],"related")
                finally:
                    server.shutdown();server.server_close();thread.join()
