from pathlib import Path
import zipfile,hashlib,json,shutil
H=Path(__file__).resolve().parents[1];S=H/'docs';R=H.parent;out=R/'output/relight-hub-release';out.mkdir(parents=True,exist_ok=True)
launcher='#!/bin/zsh\ncd "$(dirname "$0")"\nexec python3 serve.py\n'
server='''from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import webbrowser
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(Path(__file__).resolve().parent/'site'),**kwargs)
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
url='http://127.0.0.1:'+str(server.server_port)+'/'
print('Website:',url,'\\nClose this Terminal to stop.')
webbrowser.open(url)
server.serve_forever()
'''
def archive(name,folder,prefix=None,website=True):
 with zipfile.ZipFile(out/name,'w',zipfile.ZIP_DEFLATED) as z:
  for f in sorted(folder.rglob('*')):
   if not f.is_file() or any(p in f.parts for p in ['node_modules','.git','.DS_Store','dist']):continue
   # Static website dist is not named dist inside this curated package.
   rel=f.relative_to(folder);content=f.read_bytes()
   if prefix and f.suffix in {'.html','.js','.css','.json'} and f.name!='model-viewer.min.js':
    try:content=content.decode().replace(prefix,'/').encode()
    except UnicodeError:pass
   z.writestr(('site/' if website else '')+str(rel),content)
  if website:
   info=zipfile.ZipInfo('Start Website.command');info.external_attr=0o100755<<16;z.writestr(info,launcher)
   z.writestr('serve.py',server)
   z.writestr('README.txt','RE:Light website download\n\nMac: Install Python 3 if needed, then double-click Start Website.command.\nWindows/Linux: Run python3 serve.py (or python serve.py).\nKeep the Terminal open while using the website.\nThis is a static site; external links and community services require internet.\n')
for name,folder in [('PUFF-WORLD-INSIDE-Website.zip','games/puff'),('RELight-Arcade-Website.zip','games/arcade'),('RELight-Mini-Games-Website.zip','games/mini'),('RELight-Progress-Website.zip','sites/progress'),('RELight-Pitch-Website.zip','sites/pitch')]:
 prefix='/relight-hub/'+folder+'/' if folder.startswith('sites/') else None
 archive(name,S/folder,prefix)
archive('RELight-Education-Source.zip',H/'projects/education',website=False)
archive('RELight-Pitch-Source.zip',H/'projects/pitch-progress',website=False)
# Only requested public website/app downloads in this release.
allowed={'PUFF-WORLD-INSIDE-Website.zip','RELight-Arcade-Website.zip','RELight-Mini-Games-Website.zip','RELight-Progress-Website.zip','RELight-Pitch-Website.zip','RELight-Education-Source.zip','RELight-Pitch-Source.zip'}
for f in out.iterdir():
 if f.name not in allowed and f.is_file():f.unlink()
app=R/'relight-engine/native-app/artifacts/RELight-Native-2.1.1-Mac.dmg';files=[app]+sorted(out.glob('*.zip'))
lines=[]
for f in files:
 digest=hashlib.sha256(f.read_bytes()).hexdigest();lines.append(digest+'  '+f.name);print(f.name,round(f.stat().st_size/1000000,2),'MB')
(out/'SHA256SUMS.txt').write_text('\n'.join(lines)+'\n')
