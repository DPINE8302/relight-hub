# Final acceptance audit — 4 October 2026

## Current recording visual — 2.1.1 / build 6

The user-approved reference composition is now implemented in native SwiftUI, not just saved: wide one-line Thai instruction, tracked RE:LIGHT mark, amber RECORD line and arrow, low gold particle horizon and privacy footer. The horizon uses 5,000 bounded Canvas particles at 24 Hz only while the gate is shown; Reduce Motion freezes it. Recording retains actual elapsed time, RMS response and timed/manual behavior. The operator Consent & Record button is red. Native audience output and operator preview were directly inspected at the original draft's paused Memory gate; copy fits without clipping. This is a native interpretation of the composition, not a pixel-identical still image.

Debug and release builds passed, 30 existing tests passed, strict/deep signature verified, ZIP CRC and executable equality passed. ZIP SHA-256: 0bf02c5be9bc9cd0dfcdee5db333574203730e5c5f2de917174489ffecc1987e. Test log: test-results-2.1.1-2026-10-04.txt.

The locally ad-hoc signed rebuild initially requested macOS microphone consent again. Permission subsequently returned, the actual Mac microphone signal check passed, and the final 2.1.1 timed recording state was directly inspected with an advancing elapsed counter and paused film clock. The actual six-second take completed, the supplied film resumed into Possibility, and Stop & Clear removed the take and effect tails. Memory was restored at frame zero in Run, ready, with Save disabled. The preceding 2.1.0 full manual-run evidence remains version-specific. Original draft and cue rules remain saved and unchanged; Stop & Clear returned to idle with no temporary voice. Connected HDMI projector/audio/USB and final-film acceptance remain open.

## Current live verification — 2.1.0 / build 5

This supersedes earlier microphone-permission pending notes. The final packaged app passed the Mac microphone signal check and an actual manual Start / Stop run in the isolated Manual Recording QA project. Capture remained active beyond six seconds with the authored gate clock paused at frame zero; Stop & Continue completed a 29.1-second take and resumed the same scene. The authored Hospital cue scheduled once at 00:01:08:18 with 50 ms lead. Completion reached 00:01:40:13 and Help reported no visitor recording. Native support export succeeded: packaged-run-2.1.0-manual-2026-10-04.txt contains diagnostics without audio or transcript.

This run used explicit scene placeholders, not final films. Its take was longer than the ten-second voice region; the separate native PCM regression establishes three-second audio filling ten seconds and exact loop resume. Acoustic listening, projector framing, room latency, external audio and physical USB controls remain unverified. The original supplied Draft 1 project was restored in Run, ready and saved, with no temporary take retained. No production code or package changed during these checks.


Goal: finish and perfect the application while preserving the requested native Mac workflow, cinematic style, portable project contract, and physical exhibition requirements. This is an evidence record, not a claim that missing hardware or films have passed.

Historical 2.0.3 audit (superseded by the current verification above): the package was 2.0.3/build 4, strict/deep signature passes, ZIP CRC passes and its executable matches the app. Saved Scenes 1–4 reference the supplied draft and remain unapproved; Wake has no film. Current system inventory still shows only the built-in display and no identified exhibition audio kit. These same installation/content conditions have persisted through three resumed goal turns, while the sidebar redesign and active-voice controller verification closed independent software work. The goal is blocked pending the connected projector/audio/USB installation and final scene media; it is not marked complete. Mac rehearsal remains usable. No additional rebuild or repetitive test run was needed in this audit.

Latest artifact: **2.1.0 / build 5**. Recording and repeat additions are documented in RECORDING_2.1_2026-10-04.md; 30 tests pass. Native editor/save and final packaged live manual capture verified; microphone permission is available. Mac rehearsal now routes audience output to a selected external projector, including draft media. Physical projector validation is planned for 5 October morning.

Prior sidebar-free artifact: **2.0.3 / build 4**. The user's subsequent request removed both persistent sidebars: horizontal scene selection, central stage, timeline below, and a focused editor on demand. Native Run/Edit, cue editor, Devices handoff and unchanged saved-state behavior were directly verified. 25 tests pass. Earlier 2.0.2 full-run/report evidence below remains historical runtime evidence; it is not a new 2.0.3 full exhibition run. The app was left ready in Run on Memory. See STYLE_2026-10-04.md for this layout pass.

| Requirement | Evidence | Result |
| --- | --- | --- |
| Native SwiftUI Mac application, Run/Edit, floating center navigation | Packaged 2.0.2 launched; native Run/Edit and cue inspector directly inspected | Implemented; Mac verified |
| Old cinematic recording style, expressive response, readable consent | STYLE_2026-10-04.md; native audience/recording screenshots inspected in prior style pass | Mac verified |
| Mac-only full-flow video, real capture, timed processed replay, ending cleanup | QA_2026-10-04.md and packaged-run-2026-10-04.txt document full 1× draft run and v5 run | Mac rehearsal verified; final audio corrections tested offline; final packaged microphone signal, six-second test capture, Dry completion, Processed start, and interruption cleanup also passed |
| Frame-authored capture/replay, trim, fades, levels, pan, effects and automation | Core/runtime sources; 23 passing tests; eight parameters visible in final packaged inspector | Implemented; real installed onset latency still requires measurement |
| Accurate Dry/Processed comparison and adjustable echo mix | Native bypass render regression; optional-field compatibility/round-trip test; final UI Echo mix 30% | Verified |
| Temporary voice, safe interruption, no voice in saved/exported projects | Native lifecycle tests, actual Stop & Clear checks, portable export inspected and hashed | Verified on Mac |
| Supplied exact draft used for Scenes 1–4 | Source/bundle SHA-256 match; scene regions playable; editable inferred boundaries | Verified; remains an unfinished draft |
| Same project/device workflow for exhibition and local rehearsal | Native Studio setup/profile and blockers; runtime routing/device-failure tests | Implemented; actual connected kit not verified |
| Final intended media for every scene | Wake explicitly reports film pending; supplied Scenes 1–4 remain unapproved | Incomplete: requires final media |
| Projector framing, external audio, USB controls, installation latency and repeated physical runs | Final Devices inventory lists only Mac display and Built-in Retina Display; no external projector available | Unverified: connected installation required |
| Portable files and future PC/browser feasibility | Foundation-only RELightCore, versioned JSON, relative copied assets, conformance tests | Contract delivered; Windows/browser release remains a future commission |
| Relocated/second-Mac import | UI portable export completed on this Mac; media deduplication and source integrity verified | Export verified; independent receiving Mac unavailable |
| Signing/package and clear handoff | Release build, strict/deep signature, ZIP CRC and executable equality, 2.0.2 Info.plist, bundled Quick Start | Local Mac artifact verified; public notarization requires signing credentials |
| New operator intuitiveness and complete accessibility acceptance | Native controls/menu/labels inspected; reduced motion/transparency implemented | No independent first-user/VoiceOver session; cannot claim universal usability passed |

The v5 story authority specifies one consent/recording gate after Memory and DREAM-01 only in H02. Earlier references in the exploratory reset plan to the legacy Choose Again gate are not an instruction to add an extra gate to the locked v5 film. The existing native Record/Continue controls implement consent/decline; actual handset/lighting integration remains part of connected installation validation.

Current final acceptance remains open for final content and physical/release checks. Rehearsal evidence must not be promoted to an exhibition pass. No source films were replaced, no private audio was exported, and the legacy application remains available.


## Latest pass — 2.0.2

23 tests pass (12 core, 11 native). Final package CRC/executable equality and exact supplied-media hashes passed. A new natural 1× run captured six seconds, traversed all scenes, scheduled H02 once with 59 ms lead, paused/resumed in Wake, completed at 00:01:40:13 and cleared the take. Help identified version 2.0.2 and `Visitor recording: none`.

Resume/late-source fades are now sample-preserving; initial automation uses the resumed position, and missed/finished fragments do not replay late. This particular live run paused during Wake; see the subsequent direct active-voice controller check below.

Final-build support export passed through the native Save panel after the user brought the app forward. `packaged-run-2.0.2-2026-10-04.txt` was created and its contents verified: version 2.0.2, Complete, six-second capture, one scheduled voice cue, and cleared participant voice. It contains no recording or transcript. Computer-use lost access again after Save closed; subsequent RE:Light access timed out, and Finder reported `cgWindowNotFound`. This prevents the remaining active-voice interaction check, not report export. RE:Light remains listed as running. A fresh display/audio inventory still shows only the built-in display and no identified exhibition audio kit. Final acceptance remains blocked by unavailable connected installation/final media and this remaining native interaction check.

## Direct active-voice controller verification

`activeVoicePauseResumeFreezesClockAndRestoresAutomation` passed against the actual Studio and AVAudioEngine on this Mac. A six-second known synthetic PCM fixture (not a participant take) played through the native voice node; pause stopped that node and engine, and the scene clock remained exactly unchanged over an asynchronous wait. Resume restarted the native node/engine, restored the level automation value at a positive source offset, advanced the clock, and retained exactly one original scheduling event. Stop removed the take. The separate PCM regression proves sample/source/fade continuity. This closes the controller-level active-voice pause/resume gap; it is not human acoustic or physical installation verification. Total: 25 tests, 12 core and 13 native. No production source or packaged binary changed in this verification pass. A fresh display inventory still finds only the built-in display. Final content and connected installation acceptance remain open.

## Historical 2.1.0 consent audit — superseded

Across the feature implementation and two subsequent goal continuations, final packaged microphone consent has remained unresolved and no external projector has been connected. The latest native Devices inspection still shows Allow microphone and disabled Test signal; current display inventory lists only Color LCD. Independent work delivered manual capture, keyframed gates, repetition, saved authoring and 30 passing tests, including manual editor test-take audition. No further meaningful live capture/installation acceptance can proceed without the macOS consent response and connected kit. Goal status is blocked after this third audit; not complete. The app remains ready on the unchanged draft project, with no temporary voice retained. The user's projector trial is planned for 5 October morning.
