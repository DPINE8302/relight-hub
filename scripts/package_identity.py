"""Mirror the canonical identity assets and rebuild download ZIPs/checksums."""
from pathlib import Path
import hashlib, shutil, zipfile
repo=Path(__file__).resolve().parents[1]
source=repo.parent/'brand'
target=repo/'docs/brand'
target.mkdir(parents=True,exist_ok=True)
for folder in ('logo','illustrations','fonts'):
    shutil.copytree(source/folder,target/folder,dirs_exist_ok=True)
for name in ('README.md','tokens.css'):
    shutil.copy(source/name,target/name)
shutil.copy(source/'RElight_Brand_Guide.html',target/'index.html')
(target/'downloads').mkdir(exist_ok=True)
with zipfile.ZipFile(target/'downloads/RElight-Font-Pack.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for path in sorted((target/'fonts').iterdir()):
        archive.write(path,Path('RElight-Fonts')/path.name)
    archive.writestr('RElight-Fonts/INSTALL.txt','Install the TTF files in Font Book (macOS) or right-click > Install (Windows). Restart your design app. WOFF2 files are for websites.\nRegular 400 / Bold 700 / ExtraBold 800. Thai + Latin.\nOfficial source: https://seed.line.me/index_th.html\nSee OFL-1.1.txt for licensing.\n')
with zipfile.ZipFile(target/'RElight-Identity-Kit.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(target.rglob('*')):
        if path.is_file() and path.name not in ('RElight-Identity-Kit.zip','SHA256SUMS.txt'):
            archive.write(path,Path('RElight-Identity-Kit')/path.relative_to(target))
files=[p for p in sorted(target.rglob('*')) if p.is_file() and p.name!='SHA256SUMS.txt']
(target/'SHA256SUMS.txt').write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(target)}\n' for p in files))
# Source guide also opens locally with working downloads.
shutil.copy(target/'downloads/RElight-Font-Pack.zip',source/'downloads/RElight-Font-Pack.zip')
shutil.copy(target/'RElight-Identity-Kit.zip',source/'RElight-Identity-Kit.zip')
print(f'Packaged {len(files)} identity files. Font and full kit ZIPs rebuilt.')
