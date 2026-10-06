# Hardware

Test mode needs no USB visitor controls. New operators should complete [Start here](START_HERE.md) first, then use this document only when preparing the separate physical Production gate. The compact [Operator cheat sheet](OPERATOR_CHEAT_SHEET.md) is suitable beside the show Mac.

## Required Production kit

1. Apple-silicon Mac on AC power.
2. Projector or TV configured as **Extended Display**, not mirroring.
3. Explicitly selected production microphone.
4. One USB HID encoder with two momentary controls, or two separately identifiable USB HID controls.
5. Exhibition speakers routed through the tested output.

Label the controls by purpose, not color alone:

- Button 1: `บันทึกความฝัน / RECORD`
- Button 2: `เลือกอีกครั้ง / CHOOSE AGAIN`

Use distinguishable tactile shapes where practical. Production Start remains an operator command; a third physical Start button is not part of V1.

## Production USB controls

Production does not infer a physical device from an ordinary browser keyboard event. A bundled arm64 macOS helper uses Apple's public `IOHIDManager` APIs to enumerate external USB HID devices and observe the exact device and element that changed. It is a user-space helper, not a kernel extension, custom driver, global shortcut, or WebHID blocklist bypass.

Open **Setup → Visitor controls** and assign each role:

1. Choose **Assign** beside Record or Choose Again.
2. Press and fully release the intended physical control twice.
3. Confirm the detected product and USB identity.
4. Repeat for the other role.
5. Run the guided button checks. Assignment itself does not count as a PASS.

The app accepts only the two assigned elements after setup. A rising edge requires a release, repeated or held reports are ignored, and accepted input uses a 250ms debounce. A second distinct Record press may stop recording after one second. Wrong-state presses are logged as ignored without storing key content or raw HID reports.

### Device identity quality

The strongest available local identifier is used in this order:

1. Device serial number.
2. Physical-device unique ID.
3. USB location/port ID.
4. Current-boot registry identity.

Serial and physical identifiers are hashed before leaving the helper. Raw serial numbers are never displayed, persisted, logged, or exported.

Many low-cost keyboard encoders have no serial number. In that case the UI reports **Bound to this USB port**. Keep the encoder on the same Mac port and hub path. Moving it requires reassignment. If only a current-boot identity is available, Production blocks after restart until the controls are learned again. Two identical no-serial encoders cannot be treated as portable interchangeable devices.

Disconnecting an assigned encoder makes its roles unavailable immediately. An active Production session performs a safe reset; reconnecting the same identity restores the assignment but does not restore its physical PASS until each required control is tested again.

## Input Monitoring

macOS calls permission to read device-specific HID presses **Input Monitoring**. RE:Light requests it only after the operator chooses **Allow Input Monitoring…** in Production setup. The preflight explanation is:

> RE:Light Engine needs Input Monitoring to identify presses from the two USB exhibition buttons. It reads only the controls you assign and never records normal typing.

Grant **RE:Light Engine** in **System Settings → Privacy & Security → Input Monitoring**, then relaunch if the status does not update. Accessibility permission is not required. Development and packaged apps have different privacy identities; complete the final test with the copied packaged app.

Local builds are ad-hoc signed. macOS privacy decisions can be less stable across ad-hoc rebuilds, so install each candidate at a stable path and repeat the packaged permission test. If Input Monitoring cannot persist reliably, the physical Production gate requires Developer ID signing; do not bypass macOS privacy controls.

## Test controls

Test mode does not use the HID helper and never requests Input Monitoring. Open **Test Flow** before using these keys:

| Key | Test action |
| --- | --- |
| `Space` | Start from Idle; pause or resume a passive Test scene |
| `R` | Record; press again after one second to stop early |
| `W` | White / Choose Again |
| `←` / `→` | Previous / next scene through Test transport |
| `⌥R` | Restart the current scene |

Test keyboard controls work only in the foreground Test Flow surface. When no interactive control owns the key, recognized shortcuts are consumed by Test Flow. A focused field, selector, button, or link keeps its normal keyboard behavior instead, and no Test shortcut is dispatched; Space therefore activates a focused button just as it does elsewhere on macOS. Held keys, repeats, bounce, and wrong-state presses are ignored. Test input is always labeled as Test and cannot satisfy Production readiness.

## Displays

The app enumerates displays with Electron's `screen` API and identifies the primary and external screens. The audience window uses the exact bounds of the selected external display, frameless black presentation mode, always-on-top behavior, no menu, and a hidden cursor. With one display, a separate accessible Test window opens; Production Start remains blocked.

Disconnecting the selected projector during a Production session immediately blanks and mutes the audience, invalidates the session, releases recording resources, and returns to System Check. Reconnect it, select it again if necessary, and repeat the display test.

## Microphones and sound output

Microphone permission is requested only from an explicit System Check action. The UI enumerates available audio inputs after permission and persists the selected device ID and visible label. A missing production microphone remains selected but unavailable; the app never silently switches to another device.

Test may use the Mac's built-in microphone. Select the device explicitly when more than one microphone is listed so a Continuity or virtual input is not mistaken for the Mac microphone. Test capture still remains in memory and is never monitored through the speakers.

The guaranteed sound path is the macOS system output. When the runtime can enumerate outputs and route the single Web Audio graph with `AudioContext.setSinkId`, the operator may select and test one explicitly. Otherwise the UI states **Uses macOS system output**; choose the route in Control Center or System Settings before **Test Speakers**.

## Physical acceptance checklist

- Input Monitoring is granted to the copied packaged app and survives relaunch.
- The exact encoder appears with the expected product, VID/PID, HID usage, and identity quality.
- Record and Choose Again learn from different elements and cannot conflict.
- Built-in keyboard presses never satisfy a Production check or transition.
- Same-port reconnect, moved-port fallback, helper failure, and permission revocation behave safely.
- Both controls pass release, debounce, held-input, wrong-state, and spam tests.
- AC power passes and display sleep is blocked.
- Projector is extended, selected, locked, correctly oriented, and survives focus changes.
- Production microphone permission, signal, disconnect, reconnect, and silent-input behavior pass.
- Speaker routing, channel balance, safe loudness, and operator-confirmed tone pass.
- Emergency Reset works from every state, including during recording.
- Ten consecutive packaged offline sessions complete without device substitution or stale audio.

Software fixtures and Test mode validate behavior but cannot complete this physical gate. The actual encoder must be connected to capture its report layout and prove the packaged path.
