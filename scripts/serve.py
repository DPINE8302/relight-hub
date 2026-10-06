from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(Path(__file__).resolve().parents[1]/'docs'),**kwargs)
 def translate_path(self,path):
  if path.startswith('/relight-hub/'):path=path[len('/relight-hub'):]
  return super().translate_path(path)
ThreadingHTTPServer(('127.0.0.1',8790),Handler).serve_forever()
