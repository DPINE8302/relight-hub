# Corrected SKYFRONT game poster

Created with built-in Image Gen on 12 October 2026. This replaces the rejected command-room restyle. The earlier mixed Airy/SKYFRONT generation was also rejected and was never installed on the website.

The actual reference sources were inspected before this generation:

- `relight-fighter/assets/characters/crew-atlas.png`: red panda with orange jacket, green scarf and aviation headset; Rio the otter with cyan monocle and navy outfit.
- `relight-fighter/src/portraits.js`: pilot uses the red-panda portrait; Rio uses the lower-left otter portrait.
- `relight-fighter/assets/story/coast.png`: coastal mountain-island world.
- `relight-fighter/assets/ui/skyfront-logo-source.png`: existing SKYFRONT wordmark.
- `relight-fighter/src/ship.js`: player aircraft ivory/gold/navy color scheme.

The poster is original promotional key art, with two stylized aircraft in flight, the game's pilot and wingmate, coastal scenery, the SKYFRONT title and RE;light branding. Aircraft geometry is an illustration based on the game silhouette and palette, not a literal render of the mesh.

## Final generation prompt

Make an ORIGINAL premium 3D animated-film GAME POSTER for SKYFRONT, landscape 1536x1024. Image 1 is exact canonical character reference: TOP LEFT orange RED PANDA pilot with white eyebrows/muzzle/cheeks, large warm brown eyes, black aviation headset with mic, GREEN SCARF and ORANGE flight jacket, green star patch; BOTTOM LEFT Rio is an otter with cyan HUD monocle and navy suit. Image 2 is exact coastal world reference. Image 3 is exact title logo reference. Do not redesign species, markings, clothing or colors. Original exciting poster key art: hero ivory/narrow-gold-trim/navy twin-engine swept-wing fighter banks toward camera diagonally in the lower two-thirds, through soft billowing clouds above the mountain-island coastline at sunrise. Its clear cockpit prominently shows the EXACT ORANGE RED PANDA pilot from image 1 steering confidently, face/headset/green scarf visible. A second smaller escort aircraft with Rio the brown otter visible in its cockpit is behind to the right. TWO planes only. Main aircraft uses ivory #f8f6f0, gold #b58d47, navy #070b17, warm gold engine exhaust, not blue neon holograms. Clean, appealing, soft cinematic 3D forms, tactile fur, luminous skies, hopeful rescue adventure, polished animated family film cover. Top quarter contains exact large wordmark SKYFRONT and its gold flight trail mark from image 3. Small exact RE;light branding bottom center. No other text. Strong title/aircraft/character hierarchy, beautiful negative space, generous safe margins. This must read as a finished retail game poster advertising flying coastal rescue missions, not a game menu scene. NO white cloud creatures, NO Airy, NO Puff World elements, NO black-and-white panda, NO generic bear, NO command room, NO hologram/table, NO user interface, NO buttons, NO frames. Use ONLY attached SKYFRONT references. Match character identity meticulously.

## Files and verification

- Original generation: `poster-source.png`.
- Website asset: `../../../public/games/skyfront-poster.webp`, also copied into relight-hub's education website.
- Existing Puff World poster retained.
- Image path and alternative text updated in both website copies; cache versions regenerated.
- Production build, TypeScript and existing homepage render test passed.
- Inspected the final WebP with view_image. Browser verification checks desktop and phone loading, full 3:2 framing, title visibility, character appearance and responsive fit.
- Final layout: dominant SKYFRONT poster with play action below, smaller Puff World companion on desktop; both full posters stacked on mobile. Older activities use a collapsed disclosure.
- Build, TypeScript, homepage render test and diff checks passed. Both posters loaded without horizontal overflow at 390px and 1536px.
- Deployed and promoted on 12 October 2026 to https://relight-web-two.vercel.app/#activities. Deployment: dpl_Cn1oBN6M88yymk2DVfKuGgmdFBNw. Source was the current local working tree, not only the base Git commit.
- Verified the public page, disclosure, external SKYFRONT menu and embedded Puff World launch. desktop.jpg and mobile.jpg show the public deployment.
