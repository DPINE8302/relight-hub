# RE:Light

The current application is the native SwiftUI Mac app in [native-app](native-app/README.md). Open `native-app/artifacts/RELight Native.app`, then choose **File → Open Draft 1 Rehearsal**. Use **Run**, **Edit**, **Devices**, and **Stop & Clear (⌘.)**.

See the [native quick start](native-app/README.md), [verification record](native-app/docs/QA_2026-10-04.md), and [cinema style notes](native-app/docs/STYLE_2026-10-04.md). The existing Electron application is retained below as the legacy implementation; its Test/Production names and shortcuts apply only to that app.

## Legacy Electron application

RE:Light Engine is an offline, Apple-silicon Electron runtime for the RE:Light immersive exhibition. It provides an English operator application and a separate Thai audience canvas, with a main-process-authoritative state machine, guarded local content packs, temporary in-memory voice capture, explicit physical-system checks, and two intentionally separate workflows:

- **Production** uses the assigned external display, selected production microphone, speakers, AC power, and two identity-bound USB controls. It starts only after genuine System Check evidence passes.
- **Test** runs the complete narrative with text-only scene placeholders, a selected Mac microphone, and foreground keyboard controls: `Space` starts, `R` records, and `W` performs White / Choose Again. Test evidence never becomes a Production PASS.

This repository is intentionally nested inside the original RE:Light asset archive. The parent PDFs, ZIP files, artwork, old `scene01.mp4`, and private meeting notes are not copied or committed. The presentation preview explicitly bundles only `production/scene01_draft1/Scene01_Draft1_480p_v5.mp4` into the renderer build; it remains labeled as an 18-second draft with draft audio. Electron Builder uses an explicit `files` and `extraResources` allowlist.

For a quick review, click **Watch presentation demo** on Status. It plays the Scene 01 Draft 1 picture edit, then shows four clearly labeled five-second text cards for Scenes 02–05. This 38-second preview is separate from the two-minute v5 story timeline and from the hardware-gated Test and Production flows.

## New operator? Start here

You do not need to understand Electron, USB HID, or the state machine to rehearse the experience. Follow [Start here](docs/START_HERE.md) for safe DMG installation and an exact five-minute Test run. Keep the [Operator cheat sheet](docs/OPERATOR_CHEAT_SHEET.md) beside the Mac during rehearsal.

The short version is: choose **Test**, complete the real microphone setup in **Setup**, then open **Test Flow** and run **Full Flow** at 4×. Do not use Production as a shortcut around missing hardware or final media.

## Release truth

- Engineering target: Apple Silicon, macOS 13 Ventura or later.
- Current local target: M5 Pro on macOS 27 prerelease.
- Local artifact: `RELight.app` inside `RELight-Engine-1.0.0-arm64.dmg`.
- Finder name: **RE:Light Engine**; bundle ID: `com.relight.engine`.
- Local builds are ad-hoc signed. Public distribution is not complete until a Developer ID Application identity and notarization credentials are installed.
- Test mode works with text-only placeholders and clearly labeled substitutions. Production Start never treats Test evidence as a physical PASS.
- Final films, final captions, the approved icon, and content-rights acceptance are deliberately deferred to the later Final Content gate.

## Development

```bash
npm ci
npm run dev
```

The first launch seeds an editable content pack at `~/Movies/RELight Engine Content`. Settings, structured logs, and the last-known-good configuration live under `~/Library/Application Support/RELight Engine`.

Required verification:

```bash
npm run typecheck
npm run lint
npm test
npm run test:hid
npm run test:e2e
npm run build
npm run package:mac:local
npm run verify:package
```

`verify:package` mounts the DMG, copies `RELight.app` to a temporary folder, verifies its arm64 ad-hoc signature and exact resource allowlists, requires and audits the packaged native HID helper at `Contents/Library/Helpers/relight-hid-bridge`, launches the app with isolated Application Support data, tests the packaged microphone identity, confirms the audience renderer is ready, requires zero attempted or allowed remote requests, and completes a renderer-driven offline placeholder cycle. macOS may show the microphone purpose prompt during this explicit release check.

The fake-microphone E2E alone uses Chromium's macOS `--no-sandbox` test workaround because its audio-service sandbox cannot read a local WAV fixture. The other Electron E2E cases and every ordinary or packaged app launch keep sandboxing enabled.

## Operator model

The native menu and centered macOS 27-style navigation expose Status, Setup, Test Flow, Settings, and Diagnostics. Operator commands are also available through the native Experience menu:

| Command | Shortcut |
| --- | --- |
| Start | `⌘Return` |
| Pause or Resume | `⌘⇧P` |
| Restart Scene | `⌘⌥R` |
| Skip Scene | `⌘⇧→` |
| Return to Idle | `⌘⇧I` |
| Emergency Reset | `⌘⇧R` |
| Settings | `⌘,` |
| Actual Size | `⌘0` |
| Zoom In | `⌘=` |
| Zoom Out | `⌘-` |

The native **Help** menu contains an offline five-minute rehearsal, keyboard reference, and Production-readiness reminder. It does not open the network. Use **View** zoom commands when the operator text is uncomfortable to read.

The current operating mode is always visible and may change only outside an active visitor session.

In **Test**, open **Test Flow**: `Space` starts from Idle and pauses/resumes passive scenes, `R` represents Record, and `W` represents White / Choose Again. `←` / `→` move through scenes and `⌥R` restarts the current scene. Timed scenes advance automatically at the selected 1×, 2×, or 4× speed. Test keys are scoped to this foreground surface. When an interactive control has focus, it keeps normal keyboard behavior—so Space may activate a focused button—and the same keystroke is not also dispatched as Test input.

In **Production**, Start remains an operator action. The two physical controls are learned from macOS native HID events and stored by device plus input element—not by a global `R` or `Space` shortcut. Input Monitoring is requested only from an explicit setup action. RE:Light reads only the external USB controls being assigned or already bound; it does not record normal typing. Every accepted source still requires release before another trigger, rejects repeats, and applies a 250ms debounce.

Cheap encoders do not always expose a serial number. The app then binds the control to its USB port and says so plainly; moving it to another port requires reassignment. See [Hardware and physical controls](docs/HARDWARE.md).

## Content and privacy

The bundled default is a Test configuration with local text placeholders and empty media folders. Final films and configuration stay in the external content pack; see [Experience configuration](docs/EXPERIENCE_CONFIG.md). Production media validation remains intentionally blocked until those final files are supplied.

Voice is never monitored live or uploaded. A visitor recording remains in memory, is decoded for later playback, and is disposed during reset. The audience sees:

> เสียงของคุณจะใช้เฉพาะในประสบการณ์นี้ และจะถูกลบทันทีเมื่อจบ

The physical installation must also display the same privacy promise and label the controls by purpose:

- `บันทึกความฝัน / RECORD`
- `เลือกอีกครั้ง / CHOOSE AGAIN`

## Documentation

- [Start here — installation and first five-minute Test](docs/START_HERE.md)
- [Operator cheat sheet](docs/OPERATOR_CHEAT_SHEET.md)
- [Experience configuration](docs/EXPERIENCE_CONFIG.md)
- [Hardware and physical controls](docs/HARDWARE.md)
- [Audio graph and effects](docs/AUDIO_EFFECTS.md)
- [Exhibition setup and release gates](docs/EXHIBITION_SETUP.md)
- [Troubleshooting and recovery](docs/TROUBLESHOOTING.md)

## V1 boundaries

V1 includes a narrowly scoped, local macOS HID helper built with Apple's public IOKit APIs. It is not a kernel extension or custom driver. V1 still excludes phones, Arduino/serial controllers, fans, lighting, webcams, motion sensing, custom HID drivers, cloud services, permanent recordings, authentication, databases, runtime ffmpeg, TouchDesigner, Logic Pro, Unity, and Unreal. A non-HID controller requires a separate future input adapter without changing the experience engine.

LINE Seed Sans TH is bundled from the [official LINE Seed distribution](https://seed.line.me/index_th.html) under the SIL Open Font License 1.1; the license accompanies the font files.
