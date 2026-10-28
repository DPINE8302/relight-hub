# RE:Light Native for Mac 2.3.2

Download, unzip, open **RELight Native.app**, then press **Start Exhibition**. Film 02, the selected Ainsley narration, recording rules and dream effects are included. No media import, project selection, server or internet connection is needed to play.

Apple silicon · macOS 14 or later. This build is locally signed, not Apple-notarized. macOS may require **Privacy & Security → Open Anyway** on first open. Microphone access is requested by macOS when recording is used; it cannot be carried from another Mac.

## Included experience

| Setting | Default |
|---|---|
| Film | RE;light film 02.mov, unchanged original |
| Length | 5:00, 7,200 video frames at 24 fps |
| Source timecode | 01:00:00:00 |
| Recording point | 01:00:18:20, frame 452 |
| Recording start | Ainsley narrator, then six-second timed capture |
| Narrator | Selected original MP3; audible by default, can be muted |
| Dream playback | 01:04:25:20, frame 6,380; 163-frame region |
| Dream boost | Up to 400× for quiet takes, with a 0.9 PCM peak ceiling before effects |
| Voice effects | Saved echo, reverb, low-pass, level, pan and repeat settings |
| Required USB controls | Off |
| Device setup on a new Mac | This Mac, system microphone and system output |

The film pauses at the recording point throughout narration and capture, then resumes from the same film frame. Mute preserves the narrator's timing. Skip recording, silence, denied permission or a failed capture continues without visitor voice (DREAM-00). Captured voice stays in memory and is cleared when the run ends or **Stop & Clear** is pressed. It is never included in project files or exports. There is no application consent dialog.

A newly supplied included experience is selected once on upgrade. Previous projects and their edits remain on disk. Relaunches retain the operator's current project and changes. **File → Open Included Experience** returns to the included working copy. Missing included media is repaired without replacing saved settings.

## Dream recording loudness

Film 02 uses a 400× maximum dream boost by default. Quiet recordings receive the requested gain; stronger takes use a smaller constant gain so their waveform peaks stay below 0.9 before the existing effects/output limiter. This is an amplification limit, not a promise of 400 times perceived loudness. Film audio, narrator audio and the speaker test tone keep their existing levels. **Voice & effects → Dream boost limit** adjusts 1–400×. Legacy projects default to 1×.

The same gain is used across repeats and pause/resume, preserving dynamics. Silence and nonfinite microphone data are rejected; the quiet-capture threshold accounts for the intended boost.

## Playback

- **Start Exhibition** begins the full experience from frame zero. ⌘Return pauses/resumes. ⌘. stops and clears.
- **Play Preview** starts at the playhead and skips recording screens. It never records the microphone.
- Drag the timeline, step one frame or five seconds, use **Recording point** / **Dream voice**, or enter a source timecode and press **Go**.
- Run and Edit scroll so all controls remain reachable on smaller Mac displays.

## Clean projector output and keeping awake

The audience screen shows the film and authored recording instructions. On a single or mirrored display, audience output is also fullscreen; use ⌘Escape to return to the Mac controls. It has no app toolbar, title bar, rehearsal badge or diagnostic text. A full-frame nonactivating panel sits above the Mac menu bar and Dock, stays on its assigned display across Spaces and app switching, and tracks display resolution changes. Aspect-fit preserves the whole film without cropping. The cursor is transparent over audience content and restores on exit/close. **⌘Escape** closes audience output; the operator keeps normal Mac controls. Use an extended display for independent operator and audience screens.

Normal Audience opens clean. **Devices → Check audience output** explicitly shows a framing check; **Picture is correct** removes that check overlay. With Automatic display selected, a connected external display is preferred. A disconnected assigned display reports an error instead of silently selecting another one.

While the show, preview, recording, pause or an open audience window is active, an app-owned display-sleep assertion and activity keep the Mac awake. The guard is released when the session/output closes and on quit. It does not change global power preferences or override manual sleep, closing the lid, shutdown or loss of power. Keep the Mac plugged in with its lid open.

## Devices and projectors

For local playback, system input/output work without copying device identities from the author’s Mac. Open **Devices** to choose and test another microphone or speakers. A route interruption is reported; the app does not silently capture from another microphone.

For a room installation, choose **Exhibition**, select the connected external display, microphone and speakers, then confirm the actual picture, speaker sound and microphone signal. Connect power. USB controls are optional unless explicitly enabled. These physical checks are local to each installation and cannot be preset as already passed.

## Editing

**Edit → Scene settings…** changes recording start (button, countdown or narrator), duration, mute, source media and recording frame. **Voice & effects…** changes region timing, trim, repeats, fades and effects. Save with ⌘S; undo with ⌘Z.

**Replace Full Film…** imports a new export at its full video-track length while retaining cue frames/effects. The app rejects a shorter export that cannot contain the authored points. Imports and portable exports copy in the background; imports can be cancelled. Review and approve replacement media before Exhibition use.

**File → Export Portable Project…** copies the project and all referenced media to a new folder, excluding participant audio. Media references are relative; device assignments stay on the local Mac.

## Development and release

```sh
swift test
python3 scripts/fetch-release-media.py
python3 scripts/package.py --output-dir artifacts/new-build
```

The media fetcher restores the exact released Film 02 and narrator into `Resources/Release/media`, checking their SHA-256 values. Large film media is distributed in the GitHub release, not Git source history. `Resources/Release/experience.relight` records every authored default.

The packager validates media references, builds the Mac app and HID helper, creates a content-specific included-experience manifest, signs locally, extracts the ZIP and compares every delivered file. It refuses to replace a running app or an existing output. Use `--project` for another portable project. Verification builds can use `--bundle-id com.relight.studio.native.review` for separate preferences and app storage.

The Mac runtime uses SwiftUI/AppKit, AVPlayer, device-specific capture and AVAudioEngine effects. `RELightCore` defines the versioned JSON and rational frame-time contract. Windows has a separate release and is not changed by this Mac package.

Physical room latency, output levels and microphone placement need checks with the actual installation. See the release QA report for observed checks and remaining limitations; passing automated checks does not establish that every possible hardware configuration is bug-free.
