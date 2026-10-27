#!/usr/bin/env python3
"""Restore exact, versioned public release media for a source checkout."""
from pathlib import Path
import hashlib
import json
import shutil
import tempfile
import urllib.request
import zipfile

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'Resources/Release/media-manifest.json').read_text())
def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()
needed = [entry for entry in manifest['files'] if not (root / 'Resources/Release' / entry['path']).is_file() or sha(root / 'Resources/Release' / entry['path']) != entry['sha256']]
if not needed:
    print('Release media already verified.')
    raise SystemExit(0)
with tempfile.TemporaryDirectory(prefix='relight-media-') as temporary:
    archive = Path(temporary) / 'release.zip'
    print('Downloading the versioned Mac release…', flush=True)
    urllib.request.urlretrieve(manifest['archiveURL'], archive)
    with zipfile.ZipFile(archive) as zipped:
        for entry in needed:
            relative = Path(entry['path'])
            if relative.is_absolute() or '..' in relative.parts:
                raise ValueError('Unsafe media path')
            member = 'RELight Native.app/Contents/Resources/Included Experience/' + entry['path']
            staged = Path(temporary) / relative.name
            with zipped.open(member) as source, staged.open('wb') as destination:
                shutil.copyfileobj(source, destination)
            if sha(staged) != entry['sha256']:
                raise ValueError('Released media checksum does not match: ' + entry['path'])
            target = root / 'Resources/Release' / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(staged, target)
            print('Verified ' + entry['path'])
