#!/usr/bin/env python3
"""Package the Mac app with an included, portable experience. Never replace a running copy."""
from pathlib import Path
import argparse
import hashlib
import json
import plistlib
import shutil
import subprocess
import tempfile
import zipfile
import atexit
import fcntl
import os

VERSION = '2.3.1'
BUILD = '13'
parser = argparse.ArgumentParser()
parser.add_argument('--project', type=Path, help='Saved experience.relight; defaults to Resources/Release/experience.relight')
parser.add_argument('--output-dir', type=Path)
parser.add_argument('--bundle-id', default='com.relight.studio.native')
parser.add_argument('--no-archive', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
repo = root.parent
output = (args.output_dir or root / 'artifacts' / VERSION).resolve()
app = output / 'RELight Native.app'
archive = output / f'RELight-Native-{VERSION}-Mac.zip'
source_project_file = (args.project or root / 'Resources/Release/experience.relight').resolve()
output.mkdir(parents=True, exist_ok=True)
lock_fd = os.open(output / '.package.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
try:
    fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    raise RuntimeError('Another packager is using this output directory.')

def run(*command, cwd=root):
    return subprocess.check_output(command, cwd=cwd, text=True).strip()

def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def ensure_idle():
    if app.is_symlink():
        raise RuntimeError('App output must not be a symlink.')
    commands = run('ps', '-axo', 'comm=').splitlines()
    if str(app / 'Contents/MacOS/RELight') in [s.strip() for s in commands]:
        raise RuntimeError('This copy is running. Use a separate --output-dir.')

def ensure_new_output():
    paths = [app] if args.no_archive else [app, archive, output / 'release.json', output / 'SHA256SUMS.txt']
    if any(p.exists() or p.is_symlink() for p in paths):
        raise RuntimeError('Release output already exists. Choose a new output directory to preserve prior builds.')

ensure_idle()
ensure_new_output()
snapshot = tempfile.TemporaryDirectory(prefix='relight-package-inputs-')
atexit.register(snapshot.cleanup)
project_file = Path(snapshot.name) / 'experience.relight'
project_file.write_bytes(source_project_file.read_bytes())
project = json.loads(project_file.read_text())
paths = {s['media'] for s in project['scenes'] if s.get('media')}
paths.update(s['capture']['narrator'] for s in project['scenes'] if s.get('capture', {}).get('narrator'))
records = []
for relative in sorted(paths):
    p = Path(relative)
    source = (source_project_file.parent / p).resolve()
    if p.is_absolute() or '..' in p.parts or not source.is_relative_to(source_project_file.parent) or not source.is_file():
        raise ValueError(f'Missing or unsafe project media: {relative}. See scripts/fetch-release-media.py.')
    expected = sha(source)
    target = project_file.parent / p
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    if sha(target) != expected or sha(source) != expected:
        raise RuntimeError(f'Media changed while taking the release snapshot: {relative}')
    records.append({'path': relative, 'bytes': target.stat().st_size, 'sha256': expected})
identity = hashlib.sha256(json.dumps({'project': project, 'media': records}, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:24]
manifest = {'schemaVersion': 1, 'id': 'experience-' + identity, 'title': project['title'], 'projectSHA256': sha(project_file), 'files': records}
run('swift', 'build', '-c', 'release')
bin_path = Path(run('swift', 'build', '-c', 'release', '--show-bin-path'))
run('node', str(repo / 'scripts/build-hid-helper.mjs'), cwd=repo)
output.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix='.relight-package-', dir=output) as temp:
    staged = Path(temp) / app.name
    contents = staged / 'Contents'
    for part in ['MacOS', 'Helpers', 'Resources/Included Experience']:
        (contents / part).mkdir(parents=True, exist_ok=True)
    shutil.copy2(bin_path / 'RELight', contents / 'MacOS/RELight')
    shutil.copy2(repo / 'native/hid-bridge/build/relight-hid-bridge', contents / 'Helpers/relight-hid-bridge')
    shutil.copy2(root / 'Resources/RELight.icns', contents / 'Resources/RELight.icns')
    shutil.copy2(root / 'README.md', contents / 'Resources/Quick Start.md')
    shutil.copytree(root / 'Resources/Narration', contents / 'Resources/Narration')
    included = contents / 'Resources/Included Experience'
    shutil.copy2(project_file, included / 'experience.relight')
    for relative in paths:
        target = included / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(project_file.parent / relative, target)
    (included / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    info = {
        'CFBundleIdentifier': args.bundle_id,
        'CFBundleName': 'RELight Native', 'CFBundleDisplayName': 'RE:Light Native',
        'CFBundleExecutable': 'RELight', 'CFBundleIconFile': 'RELight', 'CFBundlePackageType': 'APPL',
        'CFBundleShortVersionString': VERSION, 'CFBundleVersion': BUILD,
        'LSMinimumSystemVersion': '14.0', 'NSHighResolutionCapable': True,
        'RELightIncludedExperienceRequired': True,
        'NSMicrophoneUsageDescription': 'RE:Light records your response for temporary playback in this experience. The recording stays in memory and is cleared when the experience ends or stops.',
        'NSHumanReadableCopyright': 'RE:Light. Exhibition edition.',
        'CFBundleDocumentTypes': [{'CFBundleTypeName': 'RELight Experience', 'CFBundleTypeExtensions': ['relight'], 'CFBundleTypeRole': 'Editor'}],
    }
    (contents / 'Info.plist').write_bytes(plistlib.dumps(info))
    run('codesign', '--force', '--sign', '-', str(contents / 'Helpers/relight-hid-bridge'))
    run('codesign', '--force', '--sign', '-', str(staged))
    run('codesign', '--verify', '--deep', '--strict', str(staged))
    ensure_idle()
    ensure_new_output()
    shutil.move(staged, app)
print(app, flush=True)
if args.no_archive:
    raise SystemExit(0)
run('ditto', '-c', '-k', '--norsrc', '--keepParent', str(app), str(archive))
with tempfile.TemporaryDirectory(prefix='relight-extract-') as temp:
    extracted = Path(temp)
    run('ditto', '-x', '-k', str(archive), str(extracted))
    delivered = extracted / app.name
    run('codesign', '--verify', '--deep', '--strict', str(delivered))
    for source in app.rglob('*'):
        if source.is_file():
            assert sha(source) == sha(delivered / source.relative_to(app)), source.relative_to(app)
with zipfile.ZipFile(archive) as zipped:
    assert zipped.testzip() is None
metadata = {'version': VERSION, 'build': BUILD, 'file': archive.name, 'bytes': archive.stat().st_size, 'megabytes': round(archive.stat().st_size / 1_000_000, 1), 'sha256': sha(archive), 'includedExperience': manifest}
(output / 'release.json').write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + '\n')
(output / 'SHA256SUMS.txt').write_text(f'{metadata["sha256"]}  {archive.name}\n')
print(archive, flush=True)
