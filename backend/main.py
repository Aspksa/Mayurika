"""Mayurika Python-only API; stdlib HTTP server, no extra packages."""
import json
import os
import sqlite3
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from db import connect, migrate, remember, search

ROOT=Path(__file__).resolve().parent.parent
DATA=Path(os.environ.get("MAYURIKA_DATA",str(ROOT/"data")))
DB_PATH=DATA/"memory.sqlite3"
UI=ROOT/"frontend"/"dist"

class Handler(BaseHTTPRequestHandler):
    def send_json(self,code,payload):
        body=json.dumps(payload,ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type","application/json; charset=utf-8")
        self.send_header("Content-Length",str(len(body)))
        self.send_header("Cache-Control","no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url=urlsplit(self.path)
        if url.path=="/api/health":
            with connect(DB_PATH) as db:
                count=db.execute("SELECT COUNT(*) FROM memories").fetchone()[0]
            return self.send_json(200,{"ok":True,"name":"Mayurika","memory_count":count,"cloud":"not_configured"})
        if url.path=="/api/memory/search":
            q=parse_qs(url.query).get("q",[""])[0].strip()
            if len(q)>500:
                return self.send_json(400,{"error":"Query too long"})
            if not q:
                return self.send_json(200,{"results":[]})
            with connect(DB_PATH) as db:
                return self.send_json(200,{"results":search(db,q)})
        if url.path=="/api/events":
            with connect(DB_PATH) as db:
                rows=db.execute("SELECT id,kind,payload,created_at FROM activity_events ORDER BY id DESC LIMIT 100").fetchall()
            return self.send_json(200,{"events":[dict(r) for r in rows]})
        if url.path=="/" or url.path=="/index.html":
            return self.serve_ui()
        self.send_json(404,{"error":"Not found"})

    def serve_ui(self):
        file=UI/"index.html"
        if not file.is_file():
            return self.send_json(503,{"error":"Frontend not built. Run frontend build."})
        data=file.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type","text/html; charset=utf-8")
        self.send_header("Content-Length",str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path!="/api/memory":
            return self.send_json(404,{"error":"Not found"})
        if int(self.headers.get("Content-Length","0"))>65536:
            return self.send_json(413,{"error":"Payload too large"})
        try:
            size=int(self.headers.get("Content-Length","0"))
            data=json.loads(self.rfile.read(size))
            content=data["content"]
            if not isinstance(content,str) or not 0<len(content)<=5000:
                raise ValueError("Invalid content")
            with connect(DB_PATH) as db:
                mid=remember(db,content)
            self.send_json(201,{"id":mid,"status":"pending"})
        except (ValueError,KeyError,TypeError,json.JSONDecodeError):
            self.send_json(400,{"error":"Invalid memory"})
        except sqlite3.Error:
            self.send_json(500,{"error":"Database error"})

def main():
    with connect(DB_PATH) as db:
        migrate(db)
    port=int(os.environ.get("MAYURIKA_PORT","53554"))
    server=ThreadingHTTPServer(("127.0.0.1",port),Handler)
    print(f"Mayurika API: http://127.0.0.1:{port}",flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__=="__main__":
    main()
