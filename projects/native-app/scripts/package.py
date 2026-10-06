#!/usr/bin/env python3
"""Build a local, ad-hoc signed native app without modifying the Electron app."""
from pathlib import Path
import plistlib
import shutil
import subprocess

root = Path(__file__).resolve().parents[1]
repo = root.parent
def run(*args, cwd=root):
    return subprocess.check_output(args, cwd=cwd, text=True).strip()

run('swift', 'build', '-c', 'release')
bin_path = Path(run('swift', 'build', '-c', 'release', '--show-bin-path'))
run('node', str(repo / 'scripts/build-hid-helper.mjs'), cwd=repo)
app = root / 'artifacts/RELight Native.app'
contents = app / 'Contents'
for name in ('MacOS', 'Resources/media', 'Helpers'):
    (contents / name).mkdir(parents=True, exist_ok=True)
shutil.copy2(bin_path / 'RELight', contents / 'MacOS/RELight')
shutil.copy2(repo / 'native/hid-bridge/build/relight-hid-bridge', contents / 'Helpers/relight-hid-bridge')
draft = repo.parent / 'production/scene01_draft1/Scene01_Draft1_480p_v5.mp4'
shutil.copy2(draft, contents / 'Resources/media/Scene01_Draft1_480p_v5.mp4')
shutil.copy2(root / 'README.md', contents / 'Resources/Quick Start.md')
shutil.copy2(root / 'Resources/RELight.icns', contents / 'Resources/RELight.icns')
example = contents / 'Resources/Examples/Draft1'
shutil.copytree(root / 'Resources/Examples/Draft1', example, dirs_exist_ok=True)
(example / 'media').mkdir(parents=True, exist_ok=True)
shutil.copy2(Path('/Users/Marcrohard/Downloads/Draft 1 scene1-4 .mov'), example / 'media/Draft 1 scene1-4 .mov')
info = {
    'CFBundleIdentifier': 'com.relight.studio.native',
    'CFBundleName': 'RELight Native',
    'CFBundleDisplayName': 'RE:Light',
    'CFBundleExecutable': 'RELight',
    'CFBundleIconFile': 'RELight',
    'CFBundlePackageType': 'APPL',
    'CFBundleShortVersionString': '2.1.1',
    'CFBundleVersion': '6',
    'LSMinimumSystemVersion': '14.0',
    'NSHighResolutionCapable': True,
    'NSMicrophoneUsageDescription': 'RE:Light records a participant’s consented response for temporary playback inside the experience. Recordings stay in memory and are deleted when the run ends or stops.',
    'NSHumanReadableCopyright': 'RE:Light. Local exhibition build.',
    'CFBundleDocumentTypes': [{'CFBundleTypeName': 'RELight Experience', 'CFBundleTypeExtensions': ['relight'], 'CFBundleTypeRole': 'Editor'}],
}
with (contents / 'Info.plist').open('wb') as f:
    plistlib.dump(info, f)
run('codesign', '--force', '--sign', '-', str(contents / 'Helpers/relight-hid-bridge'))
run('codesign', '--force', '--sign', '-', str(app))
run('codesign', '--verify', '--deep', '--strict', str(app))
print(app)
