#!/usr/bin/env python3
"""Local-only launcher for the compiled game; no npm or internet required."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import functools, webbrowser, urllib.request, sys
ROOT = Path(__file__).resolve().parent
PORT = 8787
URL = f'http://127.0.0.1:{PORT}/'
if not (ROOT / 'dist/index.html').exists():
    sys.exit('Browser build missing. Run npm install and npm run build first.')
try:
    with urllib.request.urlopen(URL, timeout=1) as response:
        if b'PUFF//WORLD: INSIDE' in response.read():
            webbrowser.open(URL)
            sys.exit(0)
except Exception:
    pass
class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()
try:
    server = ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Handler, directory=str(ROOT / 'dist')))
except OSError:
    sys.exit(f'Port {PORT} is occupied by another app. Change PORT in launch.py or use npm run dev.')
print(f'PUFF//WORLD: INSIDE is running at {URL}\nKeep this window open. Press Ctrl+C to stop.')
webbrowser.open(URL)
try:
    server.serve_forever()
except KeyboardInterrupt:
    server.server_close()
