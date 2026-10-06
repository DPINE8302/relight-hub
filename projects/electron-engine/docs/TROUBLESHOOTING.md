# Troubleshooting

For a first rehearsal, follow [Start here](START_HERE.md) in order. It deliberately completes microphone Setup before entering Test Flow. Use the [Operator cheat sheet](OPERATOR_CHEAT_SHEET.md) for recovery during a run.

## Microphone permission denied

Quit RE:Light Engine. Open **System Settings → Privacy & Security → Microphone**, enable **RE:Light Engine**, and relaunch. If the packaged bundle has never requested access, return to **Setup → Guided checks** and run the Microphone permission check. Development and packaged applications have different macOS privacy identities; test the packaged `com.relight.engine` build separately.

If the chosen microphone disappears, reconnect it and choose that exact device again. The app does not silently switch to built-in or virtual input.

In Test, explicitly choose **MacBook Microphone** or the visible built-in-device label when Continuity and virtual microphones are also listed. “System default” is not a guarantee that the built-in microphone is active.

## Input Monitoring not granted

Open **Setup → Visitor controls** and choose **Allow Input Monitoring…**. After reading the RE:Light explanation, enable **RE:Light Engine** in **System Settings → Privacy & Security → Input Monitoring**. Relaunch the copied app if the status remains Denied or Restart Required.

Do not grant Accessibility, disable Chromium's HID blocklist, or use a global-shortcut workaround. The native helper needs Input Monitoring specifically so it can distinguish the assigned external USB device from the Mac keyboard.

Development Electron and the copied packaged bundle have different macOS privacy identities. Ad-hoc signing can also invalidate a grant after rebuilding. Keep the release candidate at a stable path and repeat the packaged permission test. If the grant cannot persist, Developer ID signing is required for the physical Production gate.

## USB control is missing or changed identity

Disconnect and reconnect the encoder, then refresh USB Controls. Confirm that it appears as an external USB HID device and not as a serial/Arduino device. V1's native adapter does not support serial controllers.

If the UI says **Bound to this USB port**, reconnect the encoder through the original Mac port and hub path. A no-serial device moved to another port must be assigned again. A current-boot-only identity must be relearned after restart. Never edit the stored identifier manually.

If two roles conflict, clear one assignment and learn each physical control with two complete press-release cycles. Assignment does not satisfy System Check; run each matching check under **Setup → Guided checks** afterward.

## Projector missing or mirrored

Open macOS Displays, detect displays, and choose **Extended Display**. Return to **Setup → Display and audio** and reselect the audience display. A one-display development window is not a physical PASS. If the projector disconnects mid-session, the forced safe reset is expected.

## No sound

Confirm the macOS default output in Control Center or System Settings, then choose **Test Speakers** and confirm the tone in the operator UI. Check app bus volumes and master volume. V1 does not guarantee a custom output selector when the Chromium sink API is unavailable.

## Content configuration rejected

Open Diagnostics to read the exact JSON path and reason. Common causes are a missing reserved state, an unreachable node, illegal recording action, undeclared transition, unsupported timeline action, unintended cycle, remote/absolute media URL, or traversal outside the content root.

The active in-memory configuration remains the previous valid version, but the next live Start is blocked until the external file validates. Use **Restore Last Known Good** or **Open Content Folder** to repair it. Reload only while IDLE.

## Missing or corrupt video

Production mode fails System Check when required media is missing or does not decode. This is expected before the separate Final Content gate. Use Test for the complete text-only scene-name flow; do not add parent-archive media to the app to make Production pass.

When approved final media is available, verify the relative path and H.264/AAC file, then use **Test Flow → Single Scene** before the full Production check. Text-only fallback is intentionally limited to Test/developer behavior.

## Production button ignored

Confirm the mode reads **Production**, Input Monitoring is Granted, the exact assigned device is Connected, and the role has a current physical test. Release the control fully before pressing again. Repeated/held inputs and events inside the 250ms debounce window are ignored.

Record is legal at WAITING_FOR_RECORD and, after one second, during RECORDING for early stop. Choose Again is legal only at WAITING_FOR_CHOICE. Wrong-state input is logged and ignored. The Mac keyboard never substitutes for an assigned Production control.

If the native helper exits, an assigned device disconnects, or Input Monitoring is revoked during Production, the safe reset is intentional. Reopen **Setup**, restore the device/permission, and test both roles again.

## Test key ignored

Confirm the mode reads **Test** and keep **Test Flow** in the foreground. `Space` starts from Idle and pauses/resumes passive scenes, `R` controls recording only at the record gate, and `W` is White / Choose Again only at the choice gate. Release each key before pressing it again.

If a text field, selector, button, or link has focus, it keeps its ordinary keyboard behavior and the Test shortcut is not dispatched. This means Space can activate a focused button. Leave the control or use the visible Test transport when you intend to drive the narrative. Test keys can never satisfy Production System Check.

## Audience or operator window recovered

An audience-renderer crash recreates the audience window, cleans the session, and returns safely to IDLE. An operator-renderer crash recreates the operator without interrupting a healthy audience session. If video or output audio fails, the engine performs a safe reset. Export Diagnostics after recovery if the cause is unclear.

## Active close confirmation

Closing while a session is active asks for confirmation. Emergency Reset itself never asks. Close normally from IDLE to quit without interruption.

## Diagnostics privacy

Export creates a local redacted bundle. Logs include anonymous session IDs, transitions, device categories, HID identity quality, assigned roles, checks, media events, resets, warnings, and errors. They exclude audio, visitor content, raw HID reports, typed characters, raw serial numbers, usernames, absolute personal paths, and full device-owner labels. Nothing uploads automatically.

## Final icon and public distribution

The local Test build may use a placeholder/default application icon. Replace it with an approved `.icns` asset before the final-content gate. Public distribution also requires a Developer ID Application certificate, hardened-runtime entitlements including audio input, notarization, stapling, and Gatekeeper verification; an ad-hoc DMG is only for local rehearsal.
