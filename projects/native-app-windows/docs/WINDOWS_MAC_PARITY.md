# Windows / Mac 2.3.2 parity

Source of truth: `projects/electron-engine/native-app`, documented release
2.3.2. The Windows port remains scoped to `projects/native-app-windows`.

## Film 02 implementation

- Added the Mac 2.3.2 schema fields for project timecode start, physical-control
  requirement, narrator/countdown recording starts, narrator muting, and per-cue
  dream gain boost.
- Added a byte-for-byte conformance fixture for the released Film 02 project.
  It references the Mac paths but contains no private film or narrator media.
- Added portable countdown/narrator gate states and a Windows NAudio narrator
  playback adapter. The gate pauses at the authored frame and begins recording
  after the lead-in.
- Portable export now stages both film and narrator assets.

## Operator tools

- Scene settings edit the film, source frame, scene length, and visitor recording
  setup. Import media copies external films and narrator audio into the project.
  Film replacement can keep the scene length or use the full clip while retaining
  authored cue positions.
- Preview film starts at the operator’s playhead and skips recording gates.
  Project settings edit the mix, output timing, timecode, and ending blackout.
- Voice cues support source trim, fades, repeat/fill, built-in and project
  presets, and per-effect automation. Record and play a test take from the
  operator window. Support reports can be saved to a text file.
- Film 02 uses its authored timecode, optional USB controls, and dream boost.
  The audience window shows the recording countdown in Thai and English.

## Available verification

- The pinned .NET 10.0.402 SDK passes the portable solution test suite.
- Core tests verify the Film 02 fixture's fields and byte-for-byte round trip.
- Show tests verify that a narrated gate enters countdown and starts timed
  recording before resuming from the authored gate frame.

## Remaining parity work

1. Run the released 470 MB Film 02 movie and 6.191-second narrator on native
   Windows ARM64 and x64 hardware.
2. Verify Media Foundation playback timing, frame-accurate seeking, GPU/drop
   behavior, and the 300-second voice cue at frames 6380–6543.
3. Verify WASAPI narrator routing, microphone capture, dream-boost 400x DSP,
   clipping protection, 48 kHz conversion, and A/V latency.
4. Verify the complete WinUI authoring UI for scene settings, voice/effects,
   automation, presets, source trim, repeat/fill, and recording-screen layout.
5. Verify `.relight` shell association, save/discard/recovery, support reports,
   physical HID, projector fullscreen/hot-plug, power/sleep, and clean installs.
6. Sign the ARM64 and x64 installers and repeat clean-machine smoke and soak
   tests.

No private Film 02 media was added to Git. Runtime checks above require the
real media package and physical Windows exhibition hardware.
