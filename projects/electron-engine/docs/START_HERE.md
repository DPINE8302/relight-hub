# Start here

> **Legacy Electron guide.** For the current native app, use [RE:Light Native quick start](../native-app/README.md). Native emergency action: **Stop & Clear (⌘.)**. The Test/Production workflow and shortcuts below apply only to the retained Electron app.

This guide is for the person running RE:Light, even if you have never used exhibition software before. Start in **Test**. You do not need the projector, USB buttons, final films, or Production setup to rehearse the story.

## What you have right now

- **Test works as a rehearsal:** it shows Thai scene text in a separate audience window, records through the microphone you choose, and uses `Space`, `R`, and `W` as the visitor controls.
- **Production is deliberately not ready yet:** it requires final media and a real projector, production microphone, speakers, AC power, and two assigned USB controls.
- **Recordings are temporary:** the voice stays in memory, is never uploaded, and is deleted when the experience resets.
- **Two windows are normal:** the larger English window is for the operator. The black Thai window is what the audience sees. On a one-display Mac, keep the audience window beside or behind the operator window.

## Install the local DMG safely

The current DMG is ad-hoc signed for local rehearsal, not notarized for public distribution. Install only the release candidate you received from this project owner.

1. Double-click `RELight-Engine-1.0.0-arm64.dmg`.
2. Drag `RELight.app` to **Applications**. Do not run the app from the mounted DMG.
3. Eject the RE:Light disk image.
4. Open **Applications**, then try to open `RELight` once.
5. If macOS blocks the unidentified or unnotarized app, open **System Settings → Privacy & Security**, scroll to **Security**, choose **Open Anyway**, authenticate, and confirm **Open**. macOS shows this exception for only a limited time after the blocked launch.

Do not disable Gatekeeper, do not remove quarantine with Terminal, and do not change Mac-wide security settings. If **Open Anyway** does not name the exact RE:Light app you just tried to open, stop and check the file with the project owner.

## Your first five-minute Test rehearsal

### 0:00 — Launch and choose Test

1. Open RE:Light Engine.
2. In the centered mode control at the top, choose **Test**.
3. Open **Setup** in the navigation bar.

If the mode will not change, return the experience to Idle first. Mode changes are locked during an active session.

### 0:30 — Give microphone permission

1. In Setup, choose **Run Test Checks**.
2. When macOS asks for Microphone access, choose **Allow**.
3. If macOS says access is denied, quit RE:Light, open **System Settings → Privacy & Security → Microphone**, enable **RE:Light Engine**, then reopen the app.

The permission request must happen before a visitor session. RE:Light never listens through the speakers and never writes the visitor recording to disk.

### 1:30 — Select and prove the microphone

1. Choose **Use This Mac’s Microphone**.
2. If that button is unavailable but microphones appear in the list, select the built-in Mac microphone yourself. Do not choose an iPhone, virtual device, or USB microphone by accident.
3. Choose **Test Signal** and speak normally for two seconds.
4. Watch the meter move and confirm **Microphone signal** changes to **Passed**.
5. Choose **Run Test Checks** once more. Answer the speaker confirmation honestly if a tone plays.

If no microphone appears, do not continue by pretending it worked. See [Troubleshooting](TROUBLESHOOTING.md#microphone-permission-denied).

### 2:30 — Run the complete story

1. Open **Test Flow**.
2. Keep **Full Flow** selected.
3. Choose **4×**. This speeds up only passive scenes; the recording remains a real six seconds.
4. Choose **Start Full Test**, or click an empty area of Test Flow and press `Space`.
5. Let the scenes advance by themselves. Do not press Next unless you are intentionally testing recovery.
6. At `WAITING_FOR_RECORD`, press and release `R` once. Speak your dream for up to six seconds. A second distinct `R` press may stop recording after one second.
7. At `WAITING_FOR_CHOICE`, press and release `W` once.
8. Watch the ending and wait until the status returns to `IDLE`.

The black audience window should show only the Thai scene name and the required privacy, record, or choice copy. It should not contain operator buttons, file paths, or diagnostics.

### 4:30 — Prove recovery

1. Start another Test.
2. During any scene, choose **Emergency Reset** on Status or press `⌘⇧R`.
3. Confirm the audience immediately goes black or returns to Idle, sound stops, recording stops, and the operator returns to a safe state.

Emergency Reset does not ask for confirmation. Use it whenever the audience screen, sound, recording, or controls are not behaving exactly as expected.

## How to know the rehearsal passed

A Test rehearsal passes only when all of these are true:

- Setup shows the selected microphone and a real passing signal test.
- Full Flow reaches the record gate, accepts `R`, and records real speech.
- Full Flow reaches the choice gate and accepts `W`.
- The ending completes and returns to Idle without stale sound or voice.
- Emergency Reset safely interrupts a second run.
- Test results remain labeled **Test only** or **Simulated** and do not turn Production green.

If **Start Full Test** is disabled, go back to Setup and read the first required row that is not Passed or Test only. Fix that row; do not repeatedly press Start.

## Everyday operating tips

- Keep the app in the foreground. Test keys intentionally do nothing elsewhere.
- Click an empty area before using `Space`, `R`, or `W`. A focused button or field keeps its normal Mac behavior.
- Press and release each key. Held keys and rapid repeats are ignored on purpose.
- Use **Return to Idle** for a normal stop. Use **Emergency Reset** when anything is uncertain.
- Use **View → Zoom In** or `⌘=` if text is too small; use `⌘0` to restore the default size.
- Use **Help → RE:Light Quick Start…** inside the packaged app for an offline reminder.
- Export Diagnostics only after returning to Idle when practical. The bundle is local and redacted; nothing uploads.

## Production is a separate gate

Do not switch to Production just to make the interface look finished. Production must remain blocked until the final films and the actual exhibition kit pass together:

- Mac connected to AC power.
- Projector configured as **Extended Display**, not mirroring.
- Exact production microphone selected and signal-tested.
- Intended speakers selected or routed through macOS and audibly confirmed.
- Input Monitoring granted to the copied packaged app.
- Record and Choose Again controls assigned to exact USB HID elements and freshly pressed during Setup.
- Final content pack validates and every film decodes on the projector.
- Privacy sign and purpose labels are physically installed.
- Ten packaged sessions, disconnect recovery, and Emergency Reset pass on the real hardware.

See [Exhibition setup](EXHIBITION_SETUP.md) for the full show-day process and [Hardware](HARDWARE.md) for USB assignment.

## Keep beside the Mac

Print or save [Operator cheat sheet](OPERATOR_CHEAT_SHEET.md). It contains the whole Test flow, emergency action, shortcuts, and Production go/no-go line on one short page.
