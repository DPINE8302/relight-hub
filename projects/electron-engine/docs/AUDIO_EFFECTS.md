# Audio graph and voice effects

The audience renderer owns one Web Audio graph for its lifetime:

```text
MASTER + dynamics limiter
├── FILM
├── NARRATION
├── AMBIENCE
├── SFX
└── VISITOR_VOICE
```

Each bus has an independently persisted volume. All paths end at a conservative master limiter. Automated gain and feedback values are clamped before scheduling.

## Recording lifecycle

System Check opens the selected microphone for permission and a guided signal test, then releases it. Production preserves the exact selected device and never falls back silently. Test may use the Mac's built-in microphone, but the operator still selects it explicitly when Continuity or virtual inputs are present.

Starting Memory reacquires and warms the selected stream so Record can start `MediaRecorder` quickly. In Production that action comes only from the assigned native HID control; in Test it comes from `R`. The stream is never connected to an output node.

Capture stays in memory as a `Blob`, then decodes to an `AudioBuffer`. The recorder, tracks, object URL, source nodes, buffers, and references are disposed on reset. V1 writes no recording to disk. A noise-relative RMS check rejects recordings indistinguishable from the measured room floor rather than amplifying silence.

If capture fails after Start, the authored cinematic timing continues without visitor-voice playback and the operator receives a warning. The audience never sees a technical error.

## Presets

- **clean** — decoded visitor voice, conservative safety gain, and master limiter only.
- **memoryEcho** — intelligible dry component, restrained low-pass, 280ms delay, feedback no higher than 0.25, and light locally generated reverb.
- **memoryDecay** — low-pass automation from 12kHz to 900Hz, 320ms delay, feedback no higher than 0.38, reverb wet 0.35, subtle waveshaping, and gain from 1 to 0 across 10 seconds.
- **darkVoice** — intelligible dry component, stronger filtering, restrained distortion and delay, with no pitch-shifting dependency.

The reverb impulse is synthesized locally. No third-party audio engine or impulse file is shipped. Effect playback uses revision guards so a reset, restart, or new session makes every previous callback inert.

## Field calibration

Set macOS output first, then choose **Test Speakers** at the exhibition listening position. If the runtime exposes and successfully applies Web Audio sink selection, choose the named output in the operator UI; otherwise the app truthfully states **Uses macOS system output**. Begin with app buses below unity and increase the system output carefully.

Text-only Test mode validates capture, disposal, bus control, and visitor-voice effects without claiming final-film loudness. Final content must later be reviewed for dialogue intelligibility, consistent loudness, clipping, and feedback risk on the installed speakers and microphone.
