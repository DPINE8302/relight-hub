# PUFF//WORLD: INSIDE

A complete desktop Three.js browser game based on the supplied GDD and ten visual references. All source, reference images, browser build, model slots, and verification evidence are in this folder.

## Play

Double-click **Start Game.command**. It serves the included `dist/` build locally and opens http://127.0.0.1:8787/. Keep its Terminal window open while playing. No login, npm installation, internet connection, or extra game download is needed to play the included build. The launcher uses Python 3, already available on this Mac. Closing the Terminal stops that server.

For development, run `npm install` then `npm run dev`. Use `npm run build` to refresh `dist/` after edits. `npm run preview` serves the rebuilt game. The `dist/` contents can be uploaded to an ordinary static website host. Double-clicking `dist/index.html` directly will not work because browsers restrict module and model loading through file URLs.

## Language and narration

Thai is the primary language, with occasional English names and key labels. EN / ไทย switches to an English alternative. Captions display one language at a time. LINE Seed Sans TH is bundled locally; the original rounded PUFF//WORLD title treatment remains.

`public/narration-cues.json` contains Thai/English text for future recording. Caption events emit `puff:narration-cue` with both scripts and duration. No narrator has been recorded or generated.

## Controls

- WASD / arrow keys: move relative to the camera.
- Space: jump; hold while descending to glide. Shift: sprint while stamina lasts.
- Left click / Q / E: breathe away nearby aerosol or push the golden lure away.
- Drag mouse: orbit the camera. L: toggle mouse lock.
- J or ?: help and optional educational facts. H: show/hide control hints.
- Esc or pause: settings, resume and restart.

Falls return Airy to the latest checkpoint while retaining stage progress. Settings include master/music volume, camera sensitivity, low/high graphics, fullscreen and restart. Web Audio provides ambient sound, heartbeat and action effects after starting the game.

## Story and playable flow

Airy is a little breath inside the body. A vape cloud enters, and Airy must travel through lungs, heart and brain to reach clear air. The opening is a 9.5-second in-engine camera sequence. Each area also has a short, skippable educational scene: lungs 7.2 seconds, heart 7.6 seconds, brain 10.8 seconds and choice 6.4 seconds. These introduce one cause and show the next action; control resumes after the scene.

1. **Lung Garden:** clear twelve incoming particles. Missed particles darken alveoli. Completing the action stops the cloud and opens the exit.
2. **Heart Zone:** jump onto four moving platforms in sequence. Their motion and heartbeat follow illustrative BPM milestones (72, 85, 98, 112). Each landing lights a checkpoint. Falling preserves completed steps.
3. **Brain Zone:** follow three blue waypoints towards the exit. The golden nicotine lure approaches and pulls Airy back; breathing repels it. Touching it briefly gives a rush, then a slowdown. Escape requires movement along the route, rather than waiting or repeatedly collecting rewards.
4. **Choice:** physically enter ONE MORE to see the loop, or WALK AWAY to finish the journey. Both choices have their own ending and replay controls. Optional facts are folded below the ending.

Stage exits depend on completed actions. There are no fixed exit countdowns. Playtime varies with exploration and repeated jumps. The old four-power picker and optional crystal trials were removed to keep the main journey clear. The previous source is retained in `work/before-story-rebuild/`.

## Adapted nature assets

Five models from the free **Quaternius Stylized Nature MegaKit Standard** are incorporated: CommonTree_1, Bush_Common_Flowers, Plant_1, Rock_Medium_1 and Flower_3_Group. The Standard download contains 68 of the full kit's 116 models.

`src/nature.js` changes their materials, colours, scale and placement for the pastel floating islands, keeping the paths and platform channel clear. Repeated geometry is instanced. The rest of Airy, the organs and portals retain their existing procedural models and replaceable model slots.

Adapted runtime files and their license are in `public/nature/`; the verified original download stays in `Assets/Quaternius/`. The portable game includes incorporated runtime assets, not the standalone source kit. See `THIRD-PARTY-NOTICES.txt` and [Quaternius](https://quaternius.com/packs/stylizednaturemegakit.html).

## Replace the 3D models

Except for the adapted nature assets, the current models are stylized, reusable geometric models designed from the reference shapes and colors. The reference PNGs are concept/asset sheets, not supplied 3D meshes. The game does not claim to contain the detailed models pictured in those sheets.

1. Put a self-contained `.glb` file in `public/models/`.
2. Open `public/models/manifest.json`.
3. Replace a `null` with an entry such as:

```json
"airy": { "url": "models/airy.glb", "height": 2.4, "rotationY": 0 }
```

4. Run `npm run build` and reopen the launcher.

Available slots: airy, lung, alveoli, heart, brain, buildingA, buildingB, nicotine, toxic, metal, chemical, platform, rock, plant, portalPurple, portalGreen, vape, floatingIsland, heartIsland, bridge, neuron. A slot may also use a simple string URL such as `"models/heart.glb"`. The loader centers each model on X/Z, places its base at Y=0, and normalizes its height. Heights default to the gameplay model sizes. Use `rotationY` in radians to correct orientation. Author Airy facing +Z. Collisions and progression remain independent of visual models; keep models within the original slot footprints. Keep platforms about 3 × 3 units. Island GLBs should be 10 units tall and 28 units wide, with the playable surface at their top; their base is placed 10 units below the floor. The choice island scales X/Z down. Use a separate heartIsland model with the platform channel cut out (local X −8 to 8.3, Z −3.8 to 3.8); otherwise it retains the geometric island with its visible gap. Bridges are 4 units long along X and 3 units wide along Z; the longer bridge scales along X. Portals trigger within 1.5 units of their centers. GLB animations play the first included animation; named animation-state mapping can be extended in `src/models.js`. Failed GLB loading reports a console warning and uses the geometric fallback.

World layout, gates, flowers, and platforms live in `src/world.js`; game state, physics, checkpoints, camera, and UI in `src/main.js`; procedural models and GLB loading in `src/models.js`; sound in `src/audio.js`. `src/style.css` controls the interface.

## Educational framing and sources

This is a symbolic educational visualization, not a physiological simulation. Numerical BPM and the instant visual restoration are illustrative; effects and recovery vary between people. The optional help and ending facts explain this framing. The lure represents short-lived reward and craving. Breathing and clearing particles are game metaphors, not a treatment or a claim that vaping improves athletic ability.

- CDC, About E-Cigarettes: https://www.cdc.gov/tobacco/e-cigarettes/about.html
- CDC, Health Effects of Vaping: https://www.cdc.gov/tobacco/e-cigarettes/health-effects.html
- CDC, Why Youth Vape: https://www.cdc.gov/tobacco/e-cigarettes/why-youth-vape.html
- WHO, Tobacco: E-cigarettes: https://www.who.int/news-room/questions-and-answers/item/tobacco-e-cigarettes/
- National Academies, Nicotine / Public Health Consequences of E-Cigarettes: https://www.ncbi.nlm.nih.gov/books/NBK507191/

## Verification

See `QA.md` and `output/playwright/`. `?qa` enables a diagnostic bridge for accelerated timing and physics checks. Normal players do not get this bridge. Tests step the actual game logic rather than substituting different stage rules. They supplement ordinary keyboard/mouse interaction and browser rendering checks; they do not claim a human playtest or universal device performance.

The desktop game is the delivery target. Touch gameplay/mobile controls are not implemented, as allowed by the GDD. All runtime dependencies are bundled into the browser build. Three.js is MIT licensed; see `node_modules/three/LICENSE`.

## Earlier reference investigation

The Wildbrush reference capture and feature map remain in `reference/`. That earlier four-power implementation is historical and is not the current gameplay. No reference bundle is imported into the runtime.
