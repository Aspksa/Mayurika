"""Portable Windows launcher: builds frontend and runs the single Python API."""
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FRONT = ROOT / "frontend"
DIST = FRONT / "dist"


def find_tsc():
    candidates = [
        FRONT / "node_modules" / ".bin" / "tsc.cmd",
        ROOT / "node_modules" / ".bin" / "tsc.cmd",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    return shutil.which("tsc.cmd") or shutil.which("tsc")


def build():
    compiler = find_tsc()
    if not compiler:
        print("TypeScript compiler not found. No dependencies were installed.")
        return False
    DIST.mkdir(parents=True, exist_ok=True)
    subprocess.run([compiler, "--project", str(FRONT / "tsconfig.json")],
                   cwd=str(ROOT), check=True)
    for filename in ("index.html", "style.css"):
        shutil.copy2(FRONT / filename, DIST / filename)
    return (DIST / "app.js").is_file()


def open_when_ready(port):
    url = f"http://127.0.0.1:{port}"
    for _ in range(50):
        try:
            with urllib.request.urlopen(url + "/api/health", timeout=0.5) as response:
                if response.status == 200:
                    webbrowser.open(url)
                    return
        except Exception:
            time.sleep(0.2)


def main():
    try:
        if not build():
            print("Frontend build failed.")
            return 1
    except (OSError, subprocess.CalledProcessError) as exc:
        print("Frontend build error:", exc)
        return 1
    port = int(os.environ.get("MAYURIKA_PORT", "53554"))
    threading.Thread(target=open_when_ready, args=(port,), daemon=True).start()
    sys.path.insert(0, str(ROOT / "backend"))
    from main import main as serve
    try:
        serve()
    except OSError as exc:
        print("Cannot start Mayurika:", exc)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
