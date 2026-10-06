# Current build — Thai story, active stages and adapted nature

Verified 5 October 2026 against the compiled local build using Brave (Chromium).

- Production build passes; the existing bundled Three.js size warning remains.
- 25 core journey checks pass: particle-clear exit, sequential physical heart-platform landings, checkpoints, blue waypoint progression, lure/rush/crash, both portal branches, replay and pause. See `verify-story-rebuild-final.json`.
- 22 stage-scene and asset checks pass: each area's Thai scene, frozen controls, skip and automatic return, lure attraction and breath repulsion, all five loaded Quaternius models and instancing. See `verify-stage-scenes-final.json`.
- 12 interface checks pass: desktop/panel/small layouts, compass heading, settings, language, local font, modal focus and concise endings. See `story-final-confirmation.json`.
- A final normal-speed keyboard-driven journey completed in **74.041 seconds** with all cutscenes, twelve clears, four platform checkpoints, three waypoints, a lure touch, five jumps and the green ending. No teleports, stage overrides or time acceleration were used. Model errors and missing Thai copy were empty. Its reported audio context was suspended; this run does not prove audible playback. See `live-story-final.json`.
- Targeted final checks confirm Brain completion clears its temporary slowdown and finishes its phase. Choice hides the objective compass because both portals are valid; the prompt sits below the world labels. See `stage-world-confirmation-run.txt`.
- The first screenshot batch inspected nature, opening, lung/heart education, brain instruction/gameplay and choice. One adjustment moved the choice prompt away from portal labels; the confirmation batch inspected panel and small choice plus small brain. No further cosmetic round was run.
- Thai is primary, with occasional English names. EN switches to the alternative; captions do not duplicate both languages. LINE Seed Sans TH is local. Narration files contain text only.
- The free Standard Quaternius archive (104,088,529 bytes) passed ZIP CRC verification. Five selected models were adapted and loaded in the running game. Raw pack is retained locally under Assets/Quaternius, not included in the portable ZIP.

Evidence is in `output/playwright/`. Isolated tests use the diagnostic `?qa` bridge and explicit setup. These differ from the normal-speed keyboard-driven journey, whose evidence is saved separately. Desktop keyboard/mouse is the target; responsive checks do not establish touch controls. Browser checks establish behavior, not how enjoyable children find the game. A Thai child playtest is still needed.

---

# Historical evidence from earlier builds

The following sections preserve old gameplay and interface checks. Their old timers, powers, bilingual subtitle stacks and orb-collection rules are no longer the current game.

# Current build — original-style Thai/English polish

Verified 5 October 2026 against the compiled local build using installed Brave (Chromium).

- Production build passed. The existing Three.js vendor chunk warning remains.
- 30 journey, 29 loop, and 19 power regression checks passed. These use accelerated game logic and isolated setup; both physical portal branches and reset behavior are covered.
- 24 additional interface checks passed: Thai default, paired story text, language switching, locally loaded Thai font, dialog focus, power picker and keyboard casting, compass heading/distance/orb tracking, ending facts, replay, and narration script availability. See `output/playwright/clean-final-ui.json`.
- Dialog/settings checks and actual keyboard movement, jumping, camera orbit, audio waveform, volume/sensitivity controls, quality, fullscreen, and restart checks passed. Evidence is in `output/playwright/clean-*-checks.txt` and `clean-settings-audio*.txt`.
- A fresh normal-speed keyboard-driven journey completed in **209.920 seconds**. It visited all zones, collected three orbs, experienced three crashes, resisted the final pull, entered the green portal, and reached the bilingual educational ending. It used no teleports or time acceleration. Five jumps, 26 cleared particles, zero falls, zero model errors, and zero missing Thai translations were recorded. Five healthy alveoli at the ending reflect the symbolic recovery sequence, not uninterrupted protection. See `clean-real-time-playthrough.json`.
- Observed at that ending: 60 FPS, 906,240 triangles, 656 draw calls on this local headless Chromium setup. This is not a hardware performance guarantee.
- Final screenshots inspected at desktop 1440×900, panel 589×785, and small 393×667. Original rounded English typography, blue/white palette, locally bundled LINE Seed Sans TH, floating HUD, brighter portal surfaces, rounded plants, and organ lighting are retained. Files: `output/playwright/final-thai-*.png`. Small-screen layout checks do not imply touch gameplay support.
- Narration is text only. Thai/English cues and caption events are prepared; no narrator voice has been recorded or synthesized.

Desktop keyboard/mouse remains the gameplay target. The latest complete journey was verified in Brave; earlier Safari start/render evidence below is historical, not a new full Safari run. The reference sheets are concept images; current models are procedural 3D, with replaceable GLB slots.

The sections below preserve earlier build evidence and are historical.

---

# Current build — Wildbrush adaptation

Verified 5 October 2026, Asia/Bangkok, at http://127.0.0.1:8787/ using the compiled dist build in the Codex in-app browser.

- Production build passed; Vite retains the existing bundled Three.js size warning.
- 19 new mechanic checks passed: sprint speed/stamina, all four optional trials, Mist slowing, ranged Gust clearing, Bloom decorative restoration independent of alveoli, Lift, glide, wheel/pause freeze, energy regeneration and insufficient energy, replay reset and temporary-effect disposal.
- 30 original journey checks passed: all zones, gates, four physical moving-platform jumps, respawn, all reward/crash cycles, craving pull/resistance, physical choice, restored ending and education.
- 29 loop-branch checks passed: same journey coverage plus the purple loop and replay/choose-again controls.
- Ordinary browser interaction verified Step Inside, keyboard 3/R selecting and casting Lift, Tab opening the wheel, click-select Bloom, J opening the journal and its return control. Journal pauses the world with its own overlay. Both diagnostic and ordinary states rendered successfully; no browser console warnings/errors were recorded at the end.
- Title, journal and gameplay screenshots saved as output/playwright/wildbrush-\*.jpg. Diagnostic results are output/playwright/wildbrush-{arts,journey,loop}.json. Final build hashes are output/wildbrush-build-sha256.json.

The current regression checks accelerate the real game logic and use explicit setup for isolated power trials. They are not a new uninterrupted human playthrough. Pointer lock and responsive/mobile gameplay were not independently verified; desktop remains the target. Older evidence below pertains to the previous build.

---

# PUFF//WORLD: INSIDE — delivery verification

Verified on 5 October 2026, Asia/Bangkok. Final game is served locally from the compiled `dist/` folder at http://127.0.0.1:8787/.

## Complete real-time playthrough

A browser automation driver sent ordinary movement, jump, and interaction keyboard events to the running game. The game used its normal requestAnimationFrame loop and original stage durations. No time acceleration, stage overrides, or player teleports were used in this run.

- Finished in **209.924 seconds (3 minutes 30 seconds)**.
- Intro → Lung at 20.082 seconds.
- Lung → Heart at 84.801 seconds.
- Heart → Brain at 130.242 seconds.
- Brain → Choice at 197.682 seconds.
- Walk Away entered at 199.921 seconds; educational ending appeared at 209.924 seconds.
- Cleared 29 particles, completed five jumps including all four moving platforms, collected three orbs, experienced all three crashes, and resisted the final pull.
- No falls/respawns in this run. End state: five healthy flowers, 72 BPM, no remaining particles, no model-loading errors.
- Browser telemetry at completion: 120 FPS, 278,184 triangles, 1,197 draw calls at high quality in this local Chromium environment. These are observed measurements, not performance guarantees for other laptops.

Evidence: `output/playwright/real-time-playthrough.txt`. Driver: `work/live-playthrough.js`.

## Requirement coverage

| Requirement                | Verification                                                                                                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Three connected zones      | Both complete branch checks and the real-time journey visit Lung, Heart, and Brain through physical travel.                                                                                                                                                        |
| Lung interactions          | Contact clears aerosol; missed particles change alveoli; early gate prevents leaving before the teaching sequence.                                                                                                                                                 |
| Heart mechanic             | 72 → 85 → 98 → 112 BPM; all four moving platforms physically jumped onto and ridden, then exited.                                                                                                                                                                  |
| Brain mechanic             | Three rushes followed by three crashes; final no-input drift; backwards movement resists it; final gate opens.                                                                                                                                                     |
| Both endings               | Compiled-build branch checks pass for the green recovery portal and purple loop portal.                                                                                                                                                                            |
| Controls                   | Real W key moves 5 units in 1 second; real Space tap jumps; mouse drag changes orbit; Esc pauses. The real-time driver also uses E on the first orb.                                                                                                               |
| Four checkpoints           | Falling from each zone’s island respawns at its correct checkpoint. These isolated checks use direct stage setup and the real fall/respawn physics.                                                                                                                |
| Audio                      | User-click activation resumes AudioContext; waveform RMS measured 0.04574 for an emitted sound. The real-time journey logs inhale/exhale, heartbeat, clearing, damage, reward, crash, portal, and ending sounds. Pause suspends audio.                             |
| Settings                   | Master, music, and sensitivity sliders respond to actual keyboard changes; Low disables shadows; High restores them; fullscreen enters/exits.                                                                                                                      |
| Replay                     | Actual Play Again button resets health, cycle count, respawn count, position, and progression. Restart from pause also resets the run.                                                                                                                             |
| Choose Again               | Actual button returns to physical portals with controls visible, no choice HUD, restored exposure; walking to green changes the ending.                                                                                                                            |
| Replaceable GLBs           | Valid binary GLB replaces Airy, 3 floating islands, 1 heart island, 3 bridges, and 8 neuron modules. Airy normalization gives scale 2.4 for a unit-height fixture. Invalid URL falls back to the procedural Airy. All test manifest entries were restored to null. |
| Browser delivery           | Compiled build loaded and played through local Python launcher; no login or runtime CDN dependency.                                                                                                                                                                |
| Source/reference retention | Original GDD and all 10 supplied PNGs retained in references/.                                                                                                                                                                                                     |
| Build/dependencies         | Production build passes. npm audit reports zero vulnerabilities.                                                                                                                                                                                                   |

Final branch evidence: `output/playwright/final-journey-checks.txt` and `output/playwright/final-loop-checks.txt`.
Controls/settings/audio evidence: `output/playwright/ui-controls-audio.txt`.
Checkpoint evidence: `output/playwright/all-checkpoints.txt`.
Model evidence: `output/playwright/glb-replacements.txt`; generated disposable GLB fixture is preserved only in `work/qa-fixture.glb`, outside the browser build.
Replay evidence: `output/playwright/replay-and-choice.txt`.

## Browser coverage and limits

The automated journey, branch, UI, audio, and rendering tests used the installed Brave browser (Chromium engine). Native Safari also loaded the compiled build and rendered Airy, the organ world, and gameplay HUD after pressing Step Inside. Safari verification was a rendering/start smoke check, not a second full journey. Chrome and Edge were not independently installed or tested. Mobile gameplay is intentionally omitted under the GDD’s optional-mobile scope.

The current art is stylized geometric 3D informed by the supplied references. It does not contain detailed artist-authored GLBs. Slots, normalization instructions, and independent gameplay colliders are ready for those replacements. External animated GLBs currently play their first animation clip; expanding named animation-state selection is an art-integration task described in README.md.

Health effects and recovery are symbolic. The opening and ending explicitly distinguish this visualization from instantaneous physiological changes. Health copy is based on the CDC, WHO, and National Academies sources linked in README.md.
