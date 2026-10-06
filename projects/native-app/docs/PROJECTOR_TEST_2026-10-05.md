# Connected projector test — 5 October 2026

In progress, not an acceptance pass. Native app 2.1.1.

EPSON PJ detected through HDMI, with two-channel 48 kHz HDMI audio output. Initial macOS state mirrored the internal display. System Settings → Displays → EPSON PJ → Stop Mirroring was applied through native UI. Authoritative display inventory then showed EPSON PJ 1920×1080 at 60 Hz, online, mirroring off; Mac built-in display remains main.

Native Devices selects EPSON PJ. Open audience output enabled the Picture is correct action in idle. Physical picture/framing confirmation requested from the user; not yet received. An External Microphone also appeared after the initial inventory; the user selected CADefaultDeviceAggregate-39593-1 and the app reported microphone signal passed. Intended input/output route confirmation is pending. Do not infer audible room playback or physical projection from OS detection alone.

Full draft capture/replay, audio listening, USB controls and room latency remain to be checked. Saved films remain drafts; Wake remains a labeled placeholder.

## First connected draft run

User confirmed the physical projected picture is visible and fits without cropping. Native Picture is correct was confirmed. External Microphone and EPSON PJ were explicitly selected. The supplied draft ran at normal speed, paused for consent after Memory, captured 6.0 seconds, continued Scenes 2–4, scheduled voice once at 00:01:19:18 with 52 ms lead, and completed at 00:01:40:13 with participant voice cleared. These observations came from actual native UI and Help events in 2.1.1. Wake remained its explicit missing-film rehearsal placeholder.

Physical sound has not yet been confirmed. Later Devices inspection showed External Headphones selected but disconnected, so the listening route cannot be accepted from this run alone. EPSON PJ was restored and its test tone triggered; physical listening confirmation was requested. External Microphone signal test then showed 5% input level. Hardware/route checks reset when selections change; the earlier microphone/picture confirmations are observations, not a claim that the final saved readiness flags stayed passed. AC power was reported disconnected and USB access unknown.

## Bluetooth audio investigation

The user clarified that sound is connected by Bluetooth rather than projector HDMI, and reported no sound from Bluetooth while Mac speakers work. RH-8080 was detected as connected (macOS Device Type: Headset), output at 50%, unmuted. System output was changed from EPSON PJ to RH-8080 and a macOS Boop comparison sound was triggered. The user still reported Mac speakers audible, Bluetooth inaudible; this is not a successful Bluetooth acoustic check. RH-8080 was disconnected once for a reconnect attempt. Concurrent user changes to System Settings interrupted further automation. Intended Bluetooth device identity and who will complete its setup were requested before continuing. No pairing was forgotten, no permission or app package changed. Do not mark speaker/latency acceptance passed.
