# Exhibition setup

First time operating the app? Complete [Start here](START_HERE.md) before connecting exhibition hardware, and keep the [Operator cheat sheet](OPERATOR_CHEAT_SHEET.md) beside the Mac.

## Choose the operating mode

The mode control is always visible and may change only while no visitor session is active.

- **Production** is the exhibition workflow. It requires genuine evidence from AC power, an external audience display, valid final content, the selected microphone, tested sound output, Input Monitoring, and both assigned native USB controls.
- **Test** is the rehearsal workflow. It uses text-only scene names, an explicitly selected Mac microphone, and `Space` / `R` / `W`. Hardware substitutions remain labeled and never create a Production PASS.

Use Test for narrative, timing, recording, reset, and operator practice while final films are unavailable. Do not describe a Test completion as exhibition readiness.

## First Production setup

1. Connect AC, projector, production microphone, USB HID encoder, and speakers.
2. In macOS Displays, select **Use as Extended Display** and disable mirroring.
3. In Sound, select the intended exhibition output if the app states **Uses macOS system output**.
4. Copy the packaged `RELight.app` from the DMG to a stable local path and launch it.
5. Select **Production**, open **Setup**, and choose the exact audience display and microphone.
6. Under **Setup → Visitor controls**, choose **Allow Input Monitoring…**, read the preflight explanation, and grant **RE:Light Engine** in **System Settings → Privacy & Security → Input Monitoring**. Relaunch if requested.
7. Under USB Controls, assign Record and Choose Again by pressing and releasing each physical control twice. Keep a no-serial encoder connected to the same USB port.
8. Run the microphone signal, each physical button, display/video, storage, AC, and speaker tests.
9. Confirm the selected external content pack validates and every referenced production asset decodes.
10. Start only when every critical Production row reports PASS.

Assignment proves which device and element owns a role; it does not prove that the physical button still works. Each control must receive a fresh press during the current guided check.

The app holds `prevent-display-sleep` for its lifetime. Also disable disruptive notifications and test the actual power, display, audio, and USB paths before doors open.

## Daily opening check

1. Confirm the copied app, content pack, cables, hub path, and physical signs have not moved.
2. Confirm the mode reads **Production** before testing equipment.
3. Verify Input Monitoring remains granted and both assigned USB devices are present.
4. Test the selected microphone and inspect the live level without enabling monitoring.
5. Press and release both real controls once during their guided checks.
6. Confirm the speaker tone at the visitor position and the audience canvas on the projector.
7. Run one complete no-visitor cycle, then Emergency Reset once.
8. Return to Idle before admitting visitors.

## Test workflow

1. Select **Test** while Idle, then open **Test Flow → Full Flow**.
2. Choose the Mac microphone you intend to exercise; the built-in microphone is appropriate for local rehearsal.
3. Open the audience Test window. It displays the current scene name as text instead of loading final films.
4. Choose 1×, 2×, or 4× speed, then press `Space` to start. The timed states advance automatically; `Space` pauses or resumes a passive scene.
5. At the recording gate, press `R`, speak, and either wait six seconds or release and press `R` again after one second.
6. At the final choice gate, press `W` for White / Choose Again.
7. Confirm the flow returns cleanly to Idle and no visitor audio survives reset.

Pause/Resume, Previous/Next, Restart Scene, Return to Idle, and Emergency Reset remain available through the operator transport and native menu. `←` / `→` drive the Test transport and `⌥R` restarts the current scene. A focused operator control keeps its normal keyboard behavior; for example, Space activates a focused button without also dispatching the Test shortcut.

## Content replacement and final-media deferral

Use **Settings → Open Content Folder**. Replace only files inside the selected external content root, preserve relative media paths, validate, and reload while Idle. Keep a backup of the last approved pack. Do not place final content inside the application bundle.

The current deliverable intentionally uses text-only Test scenes. Final films are a separate gate and are not to be invented, generated, or copied from the parent archive. The development `scene01.mp4` remains outside the package; it may be selected only through the development local-media action, uses `contain` over black, and must never become the default Production scene.

When final media arrives, verify every scene on the installed projector for captions, loudness, aspect ratio, motion/flashing safety, rights, transition gaps, dropped frames, and exact narrative cue timing before clearing Production content readiness.

## Privacy and accessibility

Place physical signage where visitors can read it before participating:

> เสียงของคุณจะใช้เฉพาะในประสบการณ์นี้ และจะถูกลบทันทีเมื่อจบ

Label controls by purpose and color. Verify projector captions, large Thai type, contrast, reduced-motion behavior, and the complete operator workflow with Full Keyboard Access and VoiceOver.

Input Monitoring is used only to identify presses from assigned external USB controls. The native helper does not store raw reports, characters, or normal typing. Logs and exported diagnostics contain redacted device categories and anonymous identifiers, never raw serial numbers or visitor content.

## Offline package rehearsal

Disconnect networking, launch the copied packaged app, select Test, and run the complete text-only flow. Confirm zero network activity, no recording files, no parent-archive assets in the bundle, and a clean return to Idle.

`npm run verify:package` performs an automated offline cycle against a copied app rather than the read-only mounted image. It uses isolated support data, audits the application and native helper architecture/signatures/resources, checks the packaged microphone identity, waits for the audience renderer, and requires zero attempted or allowed remote requests. It cannot grant Input Monitoring or replace the physical encoder test.

## Emergency Reset

Emergency Reset is immediate and confirmation-free. It blanks and mutes the audience, invalidates callbacks, stops media/recording/audio, disposes visitor data, clears the session, repairs the audience window or HID helper if needed, and returns to Idle or System Check. Use `⌘⇧R` or the clearly labeled operator control.

## Release gates

1. **Engineering:** source, dual windows, engine, text-only Test flow, microphone/audio, native-HID contracts, tests, docs, and local package pass.
2. **Packaged Test:** the arm64 app and DMG run offline on this Mac with honest Test labels; the packaged helper is present, arm64, signed, and linked only to system libraries.
3. **Physical Production:** actual projector, USB mic, exact HID encoder, speakers, AC, Input Monitoring, disconnects, identity fallback, routing, latency, reset, and repeated sessions pass.
4. **Final content:** films, captions, loudness, safety, timing, approved icon, and rights pass.
5. **Distribution:** Developer ID signing, hardened runtime/audio-input entitlements, notarization, stapling, and Gatekeeper verification pass if public distribution is later requested.

The current build may complete gates 1 and 2. Gates 3–5 remain explicitly open until the physical hardware, final content, and signing credentials exist.
