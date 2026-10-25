"""Prepare local release candidates. Never upload or mutate published releases."""
from pathlib import Path
import zipfile, hashlib, json, tempfile, os

H = Path(__file__).resolve().parents[1]
S, R = H / 'docs', H.parent
out = R / 'output/relight-ecosystem-candidate-2026-10-25'
DENIED = {'node_modules', '.git', '.DS_Store', '.next', '.wall-data', '.vercel', '.wrangler', 'dist', '__pycache__', '.cache', 'coverage'}
launcher = '#!/bin/zsh\ncd "$(dirname "$0")"\nexec python3 serve.py\n'
server = '''from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
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

def sha(data):
    return hashlib.sha256(data).hexdigest()

def private(relative):
    return any(p in DENIED or p.startswith('.env') for p in relative.parts) or relative.suffix.lower() in {'.db', '.sqlite', '.sqlite3'} or relative.name.endswith(('-wal', '-shm', '-journal'))

def refuse_links(target):
    for ancestor in (target.absolute(), *target.absolute().parents):
        if ancestor.is_symlink() and not (str(ancestor) in {'/tmp', '/var'} and str(ancestor.resolve()) == '/private' + str(ancestor)):
            raise ValueError('Package refuses linked file or root: ' + str(ancestor))

def write_atomic(target, content):
    refuse_links(target.parent)
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temp = tempfile.mkstemp(prefix='.relight-package-', dir=target.parent)
    try:
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(content)
        os.replace(temp, target)
    finally:
        if os.path.exists(temp): os.unlink(temp)

def archive(name, folder, prefix=None, website=True):
    if Path(name).name != name or name in {'.', '..'}:
        raise ValueError('Archive name must be a filename')
    refuse_links(folder)
    folder = folder.resolve()
    manifest_path = folder / 'SOURCE-SNAPSHOT.json'
    hashes = None
    if not website:
        if not manifest_path.is_file() or manifest_path.is_symlink():
            raise ValueError('Source package requires a regular SOURCE-SNAPSHOT.json manifest')
        hashes = json.loads(manifest_path.read_text()).get('hashes')
        if not isinstance(hashes, dict) or not hashes or any(not isinstance(k, str) or not isinstance(v, str) or len(v) != 64 or any(c not in '0123456789abcdef' for c in v) or Path(k).is_absolute() or '..' in Path(k).parts or private(Path(k)) for k, v in hashes.items()):
            raise ValueError('Invalid source manifest')
    selected = set(hashes) | {'SOURCE-SNAPSHOT.json', 'SOURCE-SNAPSHOT.md'} if hashes is not None else None
    assembled = {}
    for f in sorted(folder.rglob('*')):
        relative = f.relative_to(folder)
        if private(relative) or not f.is_file():
            continue
        if selected is not None and relative.as_posix() not in selected:
            continue
        if f.is_symlink() or f.stat().st_nlink > 1 or folder not in f.resolve().parents:
            raise ValueError('Package refuses linked file: ' + str(relative))
        content = f.read_bytes()
        if hashes is not None and relative.as_posix() in hashes and sha(content) != hashes[relative.as_posix()]:
            raise ValueError('Stale source snapshot: ' + str(relative))
        if website and prefix and f.suffix in {'.html', '.js', '.css', '.json'} and f.name != 'model-viewer.min.js':
            try:
                content = content.decode().replace(prefix, '/').encode()
            except UnicodeError:
                pass
        assembled[relative.as_posix()] = content
    if selected is not None and not selected.issubset(assembled):
        raise ValueError('Incomplete source snapshot')
    # Rebased static assets get their own exact-byte hashes in the ZIP.
    if website and 'CURRENT-ASSETS.json' in assembled:
        keys = json.loads(assembled['CURRENT-ASSETS.json'])
        assembled['CURRENT-ASSETS.json'] = (json.dumps({key: sha(assembled[key]) for key in keys}, indent=2) + '\n').encode()
    if website and 'SHA256SUMS.json' in assembled:
        keys = json.loads(assembled['SHA256SUMS.json'])
        assembled['SHA256SUMS.json'] = (json.dumps({key: sha(assembled[key]) for key in keys}, indent=2) + '\n').encode()
    refuse_links(out)
    out.mkdir(parents=True, exist_ok=True)
    descriptor, temp = tempfile.mkstemp(prefix='.relight-package-', dir=out)
    os.close(descriptor)
    try:
        with zipfile.ZipFile(temp, 'w', zipfile.ZIP_DEFLATED) as z:
            for relative, content in assembled.items():
                z.writestr(('site/' if website else '') + relative, content)
            if website:
                info = zipfile.ZipInfo('Start Website.command')
                info.external_attr = 0o100755 << 16
                z.writestr(info, launcher)
                z.writestr('serve.py', server)
                z.writestr('README.txt', 'RE;light website candidate\n\nMac: Python 3 is required; double-click Start Website.command.\nWindows/Linux: Run python3 serve.py (or python serve.py).\nKeep the Terminal open. External links and shared services require internet.\nThis package is a prepared candidate, not evidence of a production deployment.\n')
        os.replace(temp, out / name)
    finally:
        if os.path.exists(temp): os.unlink(temp)
    return out / name

def main():
    produced = []
    for name, folder in [('PUFF-WORLD-INSIDE-Website.zip', 'games/puff'), ('RELight-Skyfront-Website.zip', 'games/skyfront'), ('RELight-Arcade-Website.zip', 'games/arcade'), ('RELight-Mini-Games-Website.zip', 'games/mini'), ('RELight-Progress-Website.zip', 'sites/progress'), ('RELight-Pitch-Website.zip', 'sites/pitch')]:
        prefix = '/relight-hub/' + folder + '/' if folder.startswith('sites/') or folder == 'games/skyfront' else None
        produced.append(archive(name, S / folder, prefix))
    produced.append(archive('RELight-Education-Source.zip', H / 'projects/education', website=False))
    lines = [sha(f.read_bytes()) + '  ' + f.name for f in produced]
    write_atomic(out / 'SHA256SUMS.txt', ('\n'.join(lines) + '\n').encode())
    for f in produced:
        print(f.name, round(f.stat().st_size / 1000000, 2), 'MB')

if __name__ == '__main__':
    main()
