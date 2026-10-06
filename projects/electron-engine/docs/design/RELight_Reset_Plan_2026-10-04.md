# RE:Light — native Mac rebuild and portable experience plan

Date: 4 October 2026. Status: native implementation delivered for Mac rehearsal; final acceptance audit and connected-kit verification remain open. The original plan below is retained; implementation and style updates are recorded at the end.

## Confirmed brief

Build a native SwiftUI Mac application for running the RE:Light installation. Setup must feel as easy as choosing what to share in a screen-sharing app. Discord was an analogy for simplicity, not a requested feature. There is no Discord integration or screen-sharing workflow in scope.

The actual job is: choose projector and audio devices, receive physical input, record a participant, automatically replay that participant’s recording at authored positions in the scenes, and apply customizable effects. The application must make both running the installation and preparing its cues understandable. Future distribution to other people, Windows PCs, and potentially browsers must remain possible.

Keep RE:Light as the product name and remove “Engine” from everyday language. Make the interface native, quiet, precise, and cinematic. Simplicity applies to operation; creative control and diagnostic depth must remain available.

## What was inspected

Reviewed the running packaged application and current source: operator App.tsx, window-manager.ts, AudioGraph.ts, shared audio-effects.ts, default experience.json, and operator/content/audio documentation. Package and checkout versions must be reconciled before migration. Existing uncommitted changes must be preserved.

Observed problems:

- Six destinations divide the job: Status, Demo, Setup, Test Flow, Settings, Diagnostics.
- Status mixes onboarding, transport, dated project updates, technical activity, device status, and scene information.
- Demo has independent playback logic; Test uses the engine and earlier text timings. Their relationship is difficult to understand.
- Test Flow has several start/transport controls and generic guidance while setup is incomplete. The first recovery step lives elsewhere.
- Setup duplicates microphone instructions and checklist rows. Raw states and engineering language leak into ordinary operation.
- The effect parameters and cue definitions exist in configuration, but Settings exposes bus volumes rather than a usable cue/effects editor.

Useful foundation in the current source:

- Separate operator and audience output, authoritative narrative state, validation, local content, and physical readiness checks.
- Temporary recording and later playback through a visitor-voice bus.
- Clean, memory echo, decay, and dark voice presets, with filtering, delay, feedback, reverb, and distortion parameters.
- Default placeholder cues play the recording 1.5 seconds into Narrowing with decay, then 1.5 seconds into Relight clean. These are existing prototype values, not newly approved film cues.
- Separate film, narration, ambience, SFX, visitor voice, and master levels.
- Revision guards, cleanup, limiter, and exact device selection.

Source inspection establishes implemented mechanisms, not current physical performance. The projector, actual recording/playback, sound character, cue accuracy, and hardware recovery were not verified in this planning pass. The running demo picture was visible. Current content is still draft/placeholder material; the two-minute v5 film remains the story authority.

## One workspace, two useful views

The main window opens to **Run**. **Edit** is a deliberate second view for preparing the same experience. Devices and Troubleshooting are contextual panels, not separate top-level products. Settings remains a standard Mac command for rare preferences.

```text
RE:Light                         Run | Edit       Devices   Help
──────────────────────────────────────────────────────────────
 Scene list        Audience preview             Inspector
 Memory            Current picture/text         Selected cue
 Possibility                                    or device issue
 Choice
 Hospital
 Wake
──────────────────────────────────────────────────────────────
 Scene timeline    Picture ───────────────────────────────
                   Voice   ──────[Visitor voice]──────────
                   Sound   ───────────[Ambience]──────────
──────────────────────────────────────────────────────────────
 Ready / exact issue       Start · Pause · Stop & Clear
```

This is an information hierarchy, not a finished visual mockup. Run hides editing tools and shows current scene, progress, the next expected participant action, output status, and essential transport. Edit reveals cue timing and effects. Both use the same project and runtime; there is no independent demo engine or duplicate transport.

### First use and everyday operation

1. Open the supplied RE:Light project. Show its real available content and concise missing-content summary.
2. Choose the named projector, microphone, speakers, and two controls in Devices. Remember exact valid assignments.
3. Give permission only when needed. Speak to test the input, play a sound to confirm speakers, identify the projector, and press each assigned physical control.
4. Return to Run, see Ready or the first actionable blocker, then Start.
5. The authored flow waits for Record, captures the participant, stores voice temporarily, and plays it automatically at its cues with the selected processing.
6. At the next interactive gate, show Choose Again. Finish the experience and clear the participant recording before the next run.

Rehearsal uses the same authored project and cues. It can substitute the Mac screen and onscreen/keyboard controls, clearly labeled, without satisfying physical exhibition checks. It must not silently replace films with a different narrative. Optional text placeholders are explicitly selected and identified. Previewing a non-recording scene does not require microphone setup.

### Same flow with or without the exhibition kit

Mac-only testing is a first-class path: run the actual available films on the Mac display, capture real speech through its built-in microphone, process and replay that recording through its speakers, and use onscreen/keyboard equivalents of the physical controls. Use the same scene sequence, capture windows, playback cues, effects, automation, and interaction gates as the connected installation. The hardware changes; the authored experience does not.

If a saved exhibition device is absent when opening the project, show its name and offer **Continue with this Mac**. Confirm the proposed local screen/input/output substitutions together in one compact panel, then retain the project and authoring position. Preserve exhibition assignments for later reconnection. Never silently reroute a running visitor session after a device disconnect: stop safely, explain the loss, and offer an explicit rehearsal restart with local devices. Previously captured visitor audio must be cleared on that restart.

Connecting the projector, external microphone, speakers, and controls makes the same Devices panel available for selecting and testing the real kit. A single ready status describes the selected setup; expandable evidence states which devices actually passed. Returning to the exhibition setup rechecks required physical evidence rather than inheriting local rehearsal passes. Do not create a separate simplified narrative or a separate test application.

## Voice cues: essential creative capability

This is a focused experience cue editor, not a general-purpose DAW. It should use familiar track, region, inspector, bypass, audition, and undo interactions while keeping the RE:Light job central.

### Capture is authored too

The operator must be able to set both capture and playback positions against the video. Add a **Record participant** cue with an exact start frame, stop frame or duration, and explicit trigger policy: automatic at the authored video position or armed at that position and started by the participant’s physical control. Preserve the established exhibition interaction by default; changing its trigger policy is an explicit authoring choice. Show microphone readiness before the run and prewarm capture without storing speech before the intended capture cue. Account for input latency and measure actual capture boundaries against the media clock.

Name the captured take so playback cues reference the intended recording. A take becomes available only after capture and preparation complete; flag any playback cue that cannot have its source ready in time. Define early stop, silence, failed capture, and repeated capture behavior. Audio trim, fades, processing, and automation are nondestructive edits to the temporary source. All takes remain session-bound and are disposed at the end or emergency reset.

The creative contract is: authored recording window → temporary take → chosen processing → authored playback cue. Recording must not merely happen somewhere in the flow; its placement must be configurable and verified, just like replay.

Select a scene, place a **Visitor recording** cue, and define:

- Exact start position by frame or timecode, with project frame rate explicit. Support frame stepping, dragging with snapping, and direct numeric entry.
- Source: the current participant recording. Store a source reference in the project, never the participant’s audio bytes.
- Source in-point, playback length, fades, level, and defined behavior if the recording is shorter or unavailable.
- Effects: Clean, Echo, Decay, Distorted, or a saved custom preset. Show a few meaningful controls initially; expand full parameters when needed.
- Adjustable delay time, feedback, reverb mix, distortion amount, filter cutoff, dry/wet balance, and output level. Add parameter automation points for changes over time, with exact positions and interpolation defined.
- Output bus and stereo pan where appropriate. Screen position for visual overlays, if needed, belongs to a separate visual cue inspector; do not confuse picture coordinates with voice timing or audio routing.
- Audition dry/processed, bypass individual effects, reset a parameter, save a preset, and undo edits. Use an operator’s explicit test take or supplied sample for rehearsal; clear it before live use.

A scene timeline is for timing cues against existing film, not changing the film edit. Preserve supplied media and story timing. A participant recording can be reused in multiple scene cues with different effects.

Example authoring operation: select Narrowing → add Visitor recording → enter the intended frame → choose Distorted → adjust echo and wet mix → audition the scene → Save. No manual JSON editing should be required for ordinary cue work.

Keep editor changes as a draft until saved and validated. Live runs use an immutable project revision. Do not let an accidental edit alter the current participant session.

### Timing contract

Store authored positions as integer frames with rational frame rate, and store audio trim/automation units explicitly. Import existing millisecond cues without silently rounding them; flag off-frame values and show any conversion before saving.

For 24 fps, a frame is about 41.67 ms. “Exact frame” describes authored placement, not a promise of zero physical output latency. The engine needs a shared media/audio timebase, prepared voice buffers, scheduled audio playback, and measured output compensation. Projector and speaker latency must be calibrated and recorded for the installed kit.

Define pause/resume, seek, restart, looping, effect tails, recording availability, and interruption consistently. Pause freezes narrative playback and automation. Stop & Clear cancels scheduled cues and tails, stops input capture, and disposes of voice. Seeking never unexpectedly starts recording. Replaying a cue is explicit; stale callbacks cannot play audio from a previous participant. Missing voice cannot quietly appear as a passing rehearsal; show an operator warning and follow the authored failure policy.

## Native Mac now; portability by design

The Mac operator interface will be actual SwiftUI with AppKit integration where necessary, native menus, windows, keyboard behavior, accessibility, and system appearance. Use native AVFoundation/Core Audio capabilities for video, capture, scheduling, effects, and routing, plus the existing HID knowledge. The precise APIs and effect chain must be proven in a technical spike before the full rewrite.

Do not assume that a SwiftUI application itself becomes a Windows or web app. Keep the project format, cue semantics, effect parameters, readiness rules, and command/event contract independent of Apple APIs.

Proposed implementation boundary:

| Part | Responsibility | Portability |
| --- | --- | --- |
| Project format | Scenes, assets, interaction gates, frame cues, effects, automation | Versioned portable files, relative asset paths |
| Experience rules | State transitions, cue ledger, session identity, validation | Reusable deterministic logic and common test fixtures |
| Platform runtime | Clock, audio/video, capture, devices, permissions, storage | Mac implementation now; Windows/browser adapters later |
| Operator interface | Run, Edit, Devices, Troubleshooting | SwiftUI Mac now; platform-appropriate UI later |

Implementation decision: use a small Foundation-only Swift package (`RELightCore`) for project validation, rational frame/timecode rules, automation interpolation, and once-only cue semantics. The runtime is SwiftUI/AppKit plus AVPlayer, an independent Core Audio input queue, and a native AVAudioEngine effects chain. The input queue allows selected microphones and speakers to be independent devices. No JavaScriptCore, web view, server, or extra runtime is needed on Mac.

The versioned JSON `.relight` project, relative media folder, and conformance fixtures are the portability contract. A Windows or browser runtime can implement that same contract; the current Mac binary does not run on those platforms. Do not claim a Windows/web adapter has been implemented.

Future Windows can use the existing Electron foundation or a separate desktop shell implementing the same contract. Browser runtime can reuse compatible rules with Web Audio/media adapters. Browser permissions, external displays, HID, filesystem access, offline persistence, and output selection vary; capability detection and actual tests must determine which exhibition tasks it can support. Do not promise browser parity today.

### Distribution

Create a relocatable project folder/package with versioned configuration and relative media paths. Validate before import and preserve last-known-good state. A project prepared on one Mac must open on another without hardcoded home paths; device identities are local assignments and must be reassigned on the receiving machine. Show missing assets and unsupported capabilities directly.

Mac distribution requires a tested release build and appropriate signing/notarization before public handoff. Windows and browser releases are later deliverables, not implied by the Mac build. Keep export local and intentional; visitor voice is excluded from saved projects and diagnostic reports.

## Keep, combine, remove

| Existing element | Treatment |
| --- | --- |
| Status and Test Flow | One Run view and transport |
| Separate Demo destination | Optional draft content within the same project/player |
| Setup | Devices panel, ordered by unmet requirement |
| Effect JSON and bus sliders | Native cue inspector, effects controls, and compact mixer |
| Diagnostics | Contextual repair plus Help → Troubleshooting |
| Dated project brief, headline statistics, technical activity on home | Remove from operation; preserve useful records in documentation |
| Raw state IDs and developer simulation | Internal diagnostic detail |
| Duplicate Start/Validate/Reload controls | One clear action for each intent |
| Recording cleanup, validation, profile/evidence isolation, offline runtime | Preserve as behavioral requirements through migration |
| Emergency reset | Persistent Stop & Clear plus immediate emergency command |

No Discord, accounts, cloud backend, general video editor, plugin marketplace, or full Logic clone. Cue editing, effects, and mixer controls are in scope because they directly serve this installation.

## Diagnostics with direct repair

Show one concise issue beside its recovery action. Expand for exact devices, cue, scene, event timing, and relevant logs. Preserve complete diagnostics without forcing the operator to read them routinely.

- Microphone: permission, exact selected input, level/clipping, capture availability, test result, disconnect recovery.
- Recording: captured duration, signal validity, buffer readiness, disposal state, failure reason.
- Cue playback: source available, authored frame, scheduled time, observed timing, effect chain, active output, missed/late cues.
- Projector: selected display, presentation health, resolution, placement, calibration, disconnect recovery.
- Audio: selected output, audible test confirmation, bus levels, overload/limiter information, supported routing.
- Controls: named purpose, physical assignment, accepted event, release/debounce, reassignment recovery.
- Content: missing/corrupt assets, frame-rate mismatch, invalid cue, restore last valid version.

Detection is not physical proof. Projector picture and speaker audibility require human confirmation. A support export includes relevant status and redacted events, excludes visitor audio, and never uploads automatically.

## Visual craft

Use native Mac control and window conventions. Content preview receives the largest area; the timeline is compact and purposeful. Inspector groups use clear labels, short explanations, and meaningful units. System fonts serve the operator; LINE Seed Sans TH remains appropriate for Thai audience text.

Neutral surfaces, restrained separators, warm RE:Light accent, legible light/dark modes, and minimal decoration. Avoid giant page headings, stacked warning banners, a six-tab glass capsule, and nested cards. Use standard focus, selection, shortcuts, menu commands, undo, and explicit disabled-state explanations. Support VoiceOver, increased contrast, reduced motion/transparency, and window resizing.

## Build sequence and proof

1. Preserve the existing checkout and settings. Identify package/source differences, map the real story and cue requirements, and establish migration fixtures.
2. Produce one coherent SwiftUI design concept for Run, Edit with a selected voice cue, Devices, and an actual failure. Resolve states before styling.
3. Build a small native vertical slice: real microphone → temporary recording → one native video scene → frame-positioned voice playback → editable echo/distortion → projector output → Stop & Clear. Measure timing and audio behavior. Test the portable-core option here.
4. Build the native workspace, project loading/saving, scene cue editor, effects, automation, undo, mixer, and rehearsal substitutions around that proven slice.
5. Migrate physical controls, full narrative gates, permissions, readiness, last-known-good recovery, diagnostics, and session privacy. Compare old/new behavioral traces before replacing the current app.
6. Package and verify on the actual Mac/projector/microphone/speakers/buttons, including repeated sessions and faults. Verify opening the exported project on another Mac. Retain the current application until the native replacement passes.
7. Validate future-platform feasibility with the shared project and conformance fixtures. Implement PC/web adapters only when that release is commissioned; record unsupported capabilities truthfully.

## Acceptance criteria

- A new operator understands the setup/start path within 30 seconds without a manual. First-run hardware setup presents one clear next step with real device names.
- Actual projector output, physical controls, microphone capture, and subsequent participant-voice playback complete the full intended workflow.
- Recording start and stop can be authored against the video by exact frame/timecode. Automatic capture and participant-triggered capture have explicit, separately tested semantics; input latency and actual capture boundaries are measured.
- A cue can be placed by exact frame, edited numerically, given custom effects/automation, auditioned, saved, and reopened without JSON editing.
- Every scene displays the intended asset, aspect ratio, captions/overlays, duration, transition, and interactive gate on the actual projector. Preflight checks every referenced asset; repeated full runs measure dropped frames, transition gaps, audiovisual synchronization, and output placement. Missing or corrupt content cannot be reported as a perfect presentation.
- Native scheduling meets a measured timing target on the real installation. Initial target: compensated voice onset within one project frame of the authored cue, with drift/late-cue measurements over repeated sessions. Tighten this if creative requirements demand it; do not call it passed before measurement.
- Pause, resume, seek, restart, scene changes, effect tails, and emergency interruption obey documented semantics and cannot replay a previous participant’s voice.
- Rehearsal and exhibition share authored cues; simulated checks never become physical passes.
- Mac-only full-flow testing plays available scene media, records a real local microphone take, applies the authored processing, and replays it at the same cues using local output and onscreen controls. Switching to the connected kit preserves project content, cue values, effects, and exhibition assignments; each selected setup is verified independently.
- No saved project, log, or export contains participant recordings. Capture/buffers/effects are cleared after every run and interrupted session.
- The Run view remains clear at laptop window sizes. Keyboard, VoiceOver, resize, light/dark, and accessibility appearances pass direct checks.
- Project import/export uses relative paths, reports incompatibilities, and opens on another Mac with device reassignment.
- The native packaged application passes first-launch permission handling, media decode, full interaction, repeated runs, device disconnect/reconnect, content recovery, and immediate reset on the actual kit.

## Sources and remaining specifics

Apple documentation consulted 4 October 2026:

- Designing for macOS: https://developer.apple.com/design/human-interface-guidelines/designing-for-macos/
- Toolbars: https://developer.apple.com/design/human-interface-guidelines/toolbars
- JavaScriptCore JSContext: https://developer.apple.com/documentation/javascriptcore/jscontext
- AVAudioPlayerNode scheduled playback: https://developer.apple.com/documentation/avfaudio/avaudioplayernode

Still to inventory during implementation: exact approved voice cue positions, intended effect sound/automation, source film frame rates, actual projector/audio/control kit, and distribution targets. Preserve current values until the creative specification authorizes changes. These details do not prevent settling the product structure and native/portable architecture direction now.

## Implementation and verification update — 4 October 2026

Native implementation is in `native-app/`. Run and Edit are the two workspaces. Device setup supports Mac rehearsal and preserved exhibition assignments. Frame-based voice regions include source trims, fades, effect presets, parameter automation, dry/processed audition, mixer ducking, and output compensation. Projects can be saved, reopened, and exported with copied media; participant audio remains in RAM.

The v5 default is 2,880 frames at 24 fps, an off-clock consent gate after Memory, a single hospital voice cue at frames 2,352–2,544, and black/silent output from frame 2,808. Missing media is explicit rehearsal text and blocks exhibition mode. The supplied Scene 1 draft and the later assembled Scenes 1–4 draft are bundled as separate rehearsal options. Wake remains missing; all draft films require final approval.

Verified native microphone signal and six-second capture in the running Mac app. Automated validation includes native audio conversion/cleanup, offline rendered clean/echo/distortion, installed speaker routing, gate/decline sequence completion, edit locking and stop cleanup. Physical projector latency, external microphone/speakers, and USB exhibition controls require the real connected kit. Distribution build is local ad-hoc signed; notarized public distribution is a separate release step.

### Supplied assembled draft

The user subsequently supplied `/Users/Marcrohard/Downloads/Draft 1 scene1-4 .mov`. It is 1,920×1,080, 24 fps, 2,077 video frames (86.541667 seconds), with AAC audio. A separate bundled Draft 1 rehearsal project now references one unchanged copy of this movie for the first four scenes. Visually inferred provisional starts are frames 0, 414, 823 and 1,530; the file ends at 2,077. The boundaries and scene lengths are editable. A provisional hospital voice test starts at source frame 1,914. Wake remains an explicit text placeholder. Every supplied scene remains a draft; this shorter test project does not change the v5 master.

The packaged and working copies match the original SHA-256 `9f957505d643b7448fc989e7e2128106578765a8166d5787a6c8e8d271da051a`.


### Final visual direction

The user subsequently requested a bolder cinematic style and a floating top-center navigation bar. The native implementation now follows the old audience recording screen's black, cream, amber-arrow and golden-horizon motifs, with microphone-responsive light during recording. This supersedes the initial restrained visual direction; see `native-app/docs/STYLE_2026-10-04.md`.
