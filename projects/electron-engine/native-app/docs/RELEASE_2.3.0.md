# Mac 2.3.0 — Film 02 included

The Mac download contains the complete five-minute Film 02, selected Ainsley narration and authored settings. Opening the app selects this experience automatically. Start Exhibition plays from the beginning; importing media or manually opening a project is unnecessary.

Recording point: **01:00:18:20** (frame 452). Dream playback: **01:04:25:20** (frame 6,380). Source clock begins at 01:00:00:00, at 24 fps. Narrator, mute, six-second capture, echo/reverb/low-pass/level settings and existing repetitions are carried by `Resources/Release/experience.relight`.

## Changes

- Content-specific working copies and one-time selection of newly included experiences. Existing operator edits and external projects survive relaunch and upgrades.
- Verify included project/media checksums before installation; repair missing included files without overwriting saved settings. A damaged required package blocks startup instead of silently substituting an unrelated starter.
- Persist narrator mute, including changes during playback, with project save/undo. Quit → Save stops an active run before saving.
- Background device discovery/import/export, stable run routes, interruption handling, scrubbing and exact source-timecode navigation from the 2.2 series.
- Package from a consistent input snapshot. Output-directory locking and refusal to overwrite existing releases protect old artifacts. ZIP extraction compares every delivered file and verifies the app signature.

## Verification on 27 October 2026

- 46 native and 15 core tests pass; seven HID tests pass (68 total).
- Separate fresh app identity opened directly on Film 02 with all media available, frame zero, system devices and Start enabled. Start Exhibition visibly advanced the film; Stop & Clear returned to Ready at zero.
- Both supplied cue jumps and video decoding at start/cues/final frame were verified. Original movie and narrator are byte-identical to the supplied media.
- Regression checks cover upgrades, preserving external projects even if an unused included copy is damaged, saved operator edits, missing media repair, integrity rejection, mute round-trip and output-lock/archive preservation.
- Three independent source review cycles were context-isolated and trace-unverified. No further practical release blockers were reported in the reviewed scope. The final small quit-save adjustment was inspected and compiled/tested afterward.

The release record also includes recipient download/extraction and live Hub checks performed before the completion report. These checks do not certify every microphone, projector, OS or room installation.

## Boundaries

Apple silicon and macOS 14+ only. Locally ad-hoc signed, without Apple notarization; macOS may require Open Anyway on first launch. Microphone permission, speaker confirmation and projector framing belong to each recipient's Mac and venue. No such confirmations are distributed as already passed.

Captured participant voice stays in memory and is absent from downloads, source, project files and support logs. Windows remains a separate alpha release.

The general multi-cue scheduler retains a previously observed lookahead boundary that can shorten a preceding adjacent region by about 60 ms. Film 02 contains one voice region and is unaffected. This release is not a claim of universal absence of bugs.
