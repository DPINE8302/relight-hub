> Superseded artwork: the command-room poster below was rejected. The current poster and corrected provenance are documented in [skyfront/README.md](skyfront/README.md).

# Game section redesign — 12 October 2026

Fighter is the lead feature, Puff World is second, and the scenario game and Light Trail remain in a collapsed native disclosure. Implemented in the production website and the education copy in relight-hub, preserving unrelated existing changes.

## Artwork

Built-in Image Gen created `concept.png` and `fighter-poster-source.png`. The production poster is `../../public/games/fighter-poster.webp` (199 KB). The original Puff World poster is retained exactly, per the user's final direction. No game artwork was changed inside either game.

Final artwork prompt:

> Create a new production game poster, 1536x1024 landscape. Image 1 is the EXACT style reference: match its beautiful soft rounded premium 3D animated-family-film rendering, smooth tactile surfaces, charming proportions, restrained composition, luminous cool blue lighting with tiny warm gold accents, deep navy edges. Image 2 is subject/setting reference only: RE:LIGHT Fighter panda pilot, fighter aircraft, coastal aviation command room. Reimagine that scene in the precise soft friendly 3D style of image 1. A charming panda pilot in navy flight suit stands lower-left facing the viewer three-quarter, gently confident expression, rounded friendly face, simple tiny gold trim. One clean sleek rounded twin-tail jet as a blue hologram over a circular command table center-right; warm gold ceiling light and simplified wide windows onto a sunset island coastline. Focus on one panda and one jet, very clean uncluttered shapes, soft cinematic depth, beautiful blue/navy palette. Keep entire panda and aircraft inside central 80% safe crop. No text, logo, UI, watermark, badges, no extra characters, no photoreal harsh militaristic clutter. Full bleed artwork designed to sit beside code-native game title and play button on dark navy #070B17 website.

References: existing `public/games/puff-world-poster.webp` and `relight-fighter/assets/ui/command-room-source.png`.

## Visual verification

Used Codex's in-app browser against the production build at http://localhost:3101/. Desktop inspected at 1536 × 1024 and 1536 × 1280; phone inspected at 390 × 844. Captures are `desktop.jpg`, `mobile-fighter.jpg`, and `mobile.jpg`. Used view_image on the concept, final desktop capture, and mobile Fighter capture.

| Comparison | Result |
| --- | --- |
| Hierarchy and layout | Fighter leads with a large left poster and right copy; Puff is visibly secondary; older games collapsed. |
| Typography | LINE Seed Sans TH; cream heading, responsive sizes, no clipped phone text. |
| Palette | Existing navy, cream and gold tokens; poster colors remain untinted. |
| Asset framing | Full 3:2 artwork shows panda and Airy completely. Changed the initial Puff crop to preserve the original complete poster. |
| Container model | Open rows and thin separators; no enclosing feature cards. |
| Actions and icons | Filled gold Fighter action, quieter Puff link, matching SVG arrows, keyboard focus styles. |
| Mobile | Single-column features, full-width Fighter button, both images loaded, no horizontal overflow. |
| Copy | All intended section headings, descriptions and CTA labels match the implementation. Main hero copy remains unchanged. |

Intentional deviations from the first generated concept follow the user's later directions: Fighter artwork matches the original Puff style, original Puff artwork replaces the invented concept illustration, and Puff uses a smaller full poster. Existing website content width and typography scale are retained. Platform metadata includes mobile for Fighter, matching the existing education activity. No other material visual mismatches remain in the requested section; implementation was faithfully verified against the revised design direction.

## Functional verification

- Production build and TypeScript passed.
- Existing server-rendered homepage test passed.
- Targeted ESLint: zero errors, two Next image advisories. These are optimized static WebP files, explicitly sized and lazy loaded.
- Git diff whitespace checks passed in both repositories.
- Disclosure opens to the two older games and closes again.
- Puff link opens `/puff-world` with its game entry screen.
- Fighter launch opens a new tab at `https://relight-fighter.vercel.app/`; verified the current SKYFRONT / FINAL SORTIE menu with mission, free-flight, and settings controls. HTTP 200 also confirmed.
- Offline cache versions regenerated in both copies.

This is a local reviewable update; no production website deployment was performed.
