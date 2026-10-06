# Recording and authored playback — 2.1.0 / build 5

## Current live verification — 2.1.0 / build 5

This supersedes earlier microphone-permission pending notes. The final packaged app passed the Mac microphone signal check and an actual manual Start / Stop run in the isolated Manual Recording QA project. Capture remained active beyond six seconds with the authored gate clock paused at frame zero; Stop & Continue completed a 29.1-second take and resumed the same scene. The authored Hospital cue scheduled once at 00:01:08:18 with 50 ms lead. Completion reached 00:01:40:13 and Help reported no visitor recording. Native support export succeeded: packaged-run-2.1.0-manual-2026-10-04.txt contains diagnostics without audio or transcript.

This run used explicit scene placeholders, not final films. Its take was longer than the ten-second voice region; the separate native PCM regression establishes three-second audio filling ten seconds and exact loop resume. Acoustic listening, projector framing, room latency, external audio and physical USB controls remain unverified. The original supplied Draft 1 project was restored in Run, ready and saved, with no temporary take retained. No production code or package changed during these checks.


Timed capture remains the default for existing projects. Optional CaptureCue.mode selects manual Start / Stop at a consent gate; manual capture is bounded at ten minutes to control memory use. An optional local gateFrame places the recording screen inside the scene. The film clock pauses there, and capture or decline resumes that same scene; unset gateFrame retains the original after-scene gate. USB Record presses start and finish; the operator has Stop & Continue and Return. Test-take recording also offers timed six seconds or manual.

Voice cues retain exact start/length/source/fade/effect/automation editing. Optional repeatCount and loopToFill retain once-only legacy playback. Repeat supports 2–100 copies trimmed to the region; Fill region loops through a partial final repeat. Three seconds can fill ten seconds. Short fades at loop boundaries reduce clicks, global fades and automation span the entire region, and resume preserves the matching repeated source fragment. Repeated regions are bounded to ten minutes. All rules serialize with the project; participant PCM remains temporary and is excluded from save/export. Replace draft films and save revised source/scene/cue frames; no supplied draft was approved or replaced in this pass.

Native Liquid Glass uses SwiftUI glassEffect on macOS 26+, with native material fallback on older supported Macs and a solid surface under Reduce Transparency. Only navigation uses that material; scene films stay unobscured. Apple API reference: https://developer.apple.com/documentation/swiftui/view/glasseffect(_:in:)

## Evidence

30 tests pass (13 core, 17 native). New tests cover legacy default/round-trip and invalid manual/timing/repeat rules; a three-second known PCM take produces a nine-second three-repeat buffer or ten-second Fill region buffer; resumed loop samples equal the original region tail; actual Studio manual capture remains recording past six seconds, pauses at authored frame zero, resumes the same scene on Stop, and clears on reset; decline resumes without another gate. These use known PCM for audio assertions and are not human listening or projector latency measurements.

Packaged native authoring inspected: Timed and Start / Stop switch correctly; exact recording screen frame and three playback choices are visible; Repeat reveals a three-times stepper; native Save writes mode=manual, gateFrame=0, loopToFill=true, startFrame=120 and lengthFrames=240 in an isolated QA project. The working draft was not altered by those checks. At the earlier authoring inspection, Record was disabled while microphone consent was pending. That historical limitation is resolved by the current packaged live verification above.

## Projector test tomorrow morning — 5 October

Final delivery: 2.1.0/build 5, release/signature checks passed. ZIP CRC and executable equality passed; SHA-256 `68fc3bdaaef17b0cd91585d5dca53369cbe60365d8c17d407404932c8f4f1d98`. The final native app was relaunched, its glass navigation and original draft preview inspected, and Open Draft 1 Rehearsal restored the user's saved rehearsal. Original timed capture and cue frames are retained; original movie hash matches the bundle. Microphone permission subsequently became available and final live manual capture passed, as recorded above. No temporary take was retained.

Use the supplied draft project with This Mac rehearsal mode, select the external projector in Devices, and open audience output. The selected external display receives a borderless full-display audience window even in rehearsal, retaining draft labels. Use extended displays. Exhibition mode retains final-media approval, microphone/speaker/picture/USB/power checks. Verify microphone signal and actual speaker/picture first, try Timed and Start / Stop, then compare a short take in a ten-second Fill region cue. Export Help's support report after the run if troubleshooting is needed. Connected hardware framing, levels, measured latency and USB presses remain unverified until that test.

## Follow-up test-take verification

The final running 2.1.0 app was rechecked: macOS consent still had not returned, with Allow microphone visible and Test signal disabled. It was left ready on the unchanged draft project in Run. No process restart or production/package change was needed. A new controller integration test uses a valid authored loop region, manually stops a known three-second test take, verifies return to Edit on the same scene, starts native audition, verifies the ten-second prepared loop, and clears all temporary audio on Stop. Total 30 tests pass. This closes the editor test-take runtime coverage gap but does not substitute for live participant capture in the packaged app.
