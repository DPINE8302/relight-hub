# RE:Light Native

A native SwiftUI macOS exhibition controller. Open `artifacts/RELight Native.app`.

## Start here

1. Choose **File → Open Draft 1 Rehearsal** for the supplied Scenes 1–4 movie, or **Open Project…** for another `.relight` project.
2. Open **Devices**, choose **Continue with this Mac**, and test microphone input and speaker output. The exhibition device profile is preserved.
3. In **Run**, press **Start**. After Memory, choose **Consent & Record** or **Continue without recording**. The film clock pauses at this gate. A usable recording is played only at the authored voice cue; silence/decline follows DREAM-00.
4. Choose a scene from the horizontal chapter strip. In **Edit**, use **Scene settings…** for film/recording setup, or click a voice region (or **Voice & effects…**) to open its focused editor. Set start, duration, source trim and fades in frames. Choose Clean, Echo, Decay or Distorted, change individual parameters (including echo wet/dry mix), and add parameter automation. Bypass removes creative processing while retaining level, pan, timing and output protection. Use Record test take to choose Timed · 6 seconds or Start / Stop, then compare Dry/Processed. **Done** returns to the film and timeline; no sidebars stay open.
5. **Stop & Clear** immediately stops playback and clears voice and effect tails. The run also clears voice on completion. Voice is never written into projects, exports or support reports.

## Recording and repetition

In **Edit → Scene settings…**, enable Record participant and choose **Timed** or **Start / Stop**. Existing projects retain Timed. Start / Stop waits for consent, records until **Stop & Continue** (Return, or another press of the assigned Record control), and keeps the film clock paused. A ten-minute maximum bounds memory use. You can keep the recording screen after the scene, or enable **Recording screen at a scene frame** and enter its exact local frame. After capture or decline, the film resumes from that frame.

In **Voice & effects…**, choose **Once**, **Repeat** (2–100 times), or **Fill region**. A three-second take can fill a ten-second region with three complete repeats and one partial repeat. Length frames defines the maximum region; source in trims the start of each repeat. Fades span the whole region and short fades at repeat boundaries reduce clicks. Automation continues across the region and pause/resume retains the source position within a repeat. Repeated regions can be up to ten minutes. To replay at different moments, add separate voice regions with their own timing and effects.

Replace each draft via **Choose scene film…**, adjust source in/length, recording-screen frame and voice regions, then save with ⌘S. Save stores these rules and media references, never the participant take. Export Portable Project includes the referenced films. Draft status stays explicit until you approve final media.

The supplied draft movie is copied byte-for-byte; it is not re-encoded. Its four provisional scene starts are 0, 17.25, 34.291667 and 63.75 seconds. Scene 4 ends at frame 2,077 (86.541667 seconds). The draft project adds a clearly labeled Wake placeholder; that film has not been supplied. These are rehearsal timings, separate from the v5 master. The source in-point and scene length remain editable. All supplied draft scenes remain unapproved.

The original v5 starter is 120 seconds at 24 fps with consent after Memory, voice once at frames 2,352–2,544, and black/silent output from frame 2,808. The draft rehearsal uses its own shorter clock and a provisional hospital voice test at source 79.75 seconds.

## Exhibition

For tomorrow's projector trial with draft films, keep **This Mac** rehearsal mode, select the projector in **Devices → Display**, and open audience output. It fills the selected external display while retaining rehearsal/draft labels. Test and confirm the actual picture and speakers. This allows testing unfinished media; it does not approve it for an exhibition. Use an extended desktop rather than mirrored displays.

Choose **Exhibition**, select the exact microphone, speakers and external projector, then test and confirm them. Assign the two USB controls by pressing each twice and test a further press. Import/approve final film for every scene and connect power. Exhibition mode explains blockers before it can start. It never substitutes an unrelated device silently. **Continue with this Mac** uses local devices while retaining the saved exhibition assignments.

The audience window contains only scene output, rehearsal labeling where appropriate, and the off-clock consent/recording instructions. It blanks when idle, preparing or finished. Open it from Devices to check framing. Positive voice advance compensates measured physical output latency.

## Projects and recovery

Save with ⌘S; undo with ⌘Z. The project contains relative media references and authored frame/effect rules. Export Portable Project copies the project and referenced media into a new folder. Device identities stay local. Help contains media checks, device state, recent run events, recovery instructions and a local support-report export. No captured audio or transcript is included.

Shortcuts: ⌘Return start/pause/resume; ⌘. stop/clear; ⌘O open; ⌘⇧S export.

## Development

Requires macOS 14+ and the Swift/Xcode toolchain. Current artifact is Apple silicon, locally ad-hoc signed.

```sh
swift test --package-path native-app
python3 native-app/scripts/package.py
```

Package script bundles the existing HID helper, the original Scene 1 draft, the user-supplied assembled draft, and the icon. The supplied movie path is configured in that script. Rebuild the icon with `swift native-app/scripts/icon.swift /tmp/relight-native.iconset` and `iconutil -c icns /tmp/relight-native.iconset -o native-app/Resources/RELight.icns`.

`RELightCore` uses Foundation only. Versioned JSON, relative assets, rational frame rules and conformance tests define the future platform contract. Windows/web runtimes have not been built. The Mac app uses SwiftUI/AppKit, AVPlayer, an independent device-specific Audio Queue for capture, and AVAudioEngine with native time-pitch, EQ, distortion, echo, reverb and limiter. Real-time audio is scheduled with native host time; UI meters do not schedule onset.

A public release still needs appropriate Apple signing/notarization and platform-specific release builds. Local rehearsal is not proof of physical projector/speaker latency or exhibition hardware readiness. See `docs/QA_2026-10-04.md`.
