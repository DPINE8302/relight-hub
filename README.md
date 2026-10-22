# RE:Light Hub

Public link and download portal. Plain HTML, CSS and JavaScript hosted by GitHub Pages. Website ZIPs, the Mac DMG and the Windows installers are GitHub Release assets.

- Website: https://dpine8302.github.io/relight-hub/
- Downloads: https://github.com/DPINE8302/relight-hub/releases
- Pages source: `main`, `/docs`.

## Layout

`docs/index.html`: portal. `docs/games/`: three playable static game builds. `docs/sites/`: progress and pitch sites. `projects/`: curated application/game/education source snapshots, including `projects/native-app` (macOS reference) and `projects/native-app-windows` (WinUI 3 port). No credentials, private identity documents or visitor recordings are included.

Education is a dynamic Next.js website linked to its existing backend host. Its ZIP is source, not an offline static export. Other ZIPs include a local Python server and `Start Website.command`.

## Local preview

Run `python3 scripts/serve.py`, then open http://127.0.0.1:8790/relight-hub/ . No npm or build step is needed for the hub.

## Updating

Edit `docs/index.html`, `docs/assets/style.css` or `docs/assets/hub.js` and push to main. The game source snapshots use hash routes and relative Vite base for GitHub Pages. Build a game with `npm ci && npm run build` in its project folder, then copy its `dist` contents to `docs/games/mini` or `docs/games/arcade`. Keep the return-to-hub link when rebuilding.

Release files are kept out of Git history. Download them from Releases, verify `SHA256SUMS.txt`, and keep large installers in Releases rather than committing them. Native app 2.1.1 is Apple silicon, macOS 14+, ad-hoc signed and not notarized. The Windows port is 2.2.0-alpha.1 for Windows 11 ARM64/x64, self-contained and installed per-user; its installers are unsigned.

The historical pitch edition retains its original content; current production approval is not implied. Original source/asset folders elsewhere in the workspace are preserved.

## Visual assets

The hub inherits the Education website stylesheet and local fonts. Its hero has no image. Project covers use real screenshots in one navy/ivory/gold style. `art/cover-originals/` holds original PNGs; `art/prompts.md` records prompts; `docs/assets/covers/` holds delivery assets, including the Windows app screenshot cover.

## Identity kit

The [RE;light identity guide](https://dpine8302.github.io/relight-hub/brand/) includes approved logos, palette, typography, CSS tokens and a self-contained ZIP. Published sources are in `docs/brand/`; rejected marks remain in the local archive.
