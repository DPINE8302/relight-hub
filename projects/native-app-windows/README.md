# RE:Light Native for Windows

A Windows-native twin of RE:Light Native. It opens the same schema-1 `.relight`
projects and is intended to match the verified macOS exhibition behavior. The
Swift app in `../native-app` remains the reference and is not modified by this
port. The legacy Electron app is out of scope.

**Status (22 October 2026):** the Windows host has been built and smoke-tested
on Windows 11 ARM64. The final run passed 145/145 tests; both self-contained
publishes and unsigned per-user installers were produced; and the ARM64
installer was installed and exercised end-to-end. Verified on the final build:
full-DPI launch, `.relight` open and shell association, current-user
single-instance forwarding, the Devices dialog, media validation, visible
scene-1 playback, scene advance, and Stop/reset. Audio routing, projector
output, physical HID, native x64 hardware acceptance, and the complete
five-scene media package remain unverified. The x64 build was smoke-launched
under ARM64 emulation only.

The Mac app stays frozen at the verified RE:Light Native 2.1.2 build 7 baseline.
No Swift source has been changed by this port.

## What is implemented

| Project | Contents |
| --- | --- |
| `src/RELight.Core` | Schema-1 model, validation, frame rate, cues, effects, automation, repeat/fill, path containment, Windows path policy, 2 MB project load and atomic save with timestamped backup, portable export, Draft 1 seeding |
| `src/RELight.Media` | Streaming ISO-BMFF/QuickTime metadata probe and the Windows counterpart of the Mac `validateMedia` rules |
| `src/RELight.Audio` | Bounded 48 kHz memory-only take store, stereo-to-mono capture mix, silence rejection, voice-region builder (fades, trim, repeat, loop/fill, splice ramps), an offline effect renderer (speed, low-pass, distortion, feedback delay, room reverb, limiter, level/pan automation) and pitch-preserving 2×/4× rehearsal time-stretch |
| `src/RELight.Show` | Portable run engine: preparing/playing/paused/gate/recording/finished states, media clock, gates, automatic and manual capture, voice scheduling, film ducking, pause/resume, stop/reset, audition, test takes, editing, undo/redo, abort, and machine calibration layering |
| `src/RELight.Studio` | `StudioViewModel` orchestration for project load/save/export, media checks, blockers, cue editing, run commands and control actions; portable `DeviceSettingsStore` (`devices.json`) and `CalibrationStore` (`calibration.json`) |
| `src/RELight.Controls` | Control roles, HID element policy, hashed device identity, learn-twice tracker, bindings, release/debounce edge router and exhibition action policy |
| `src/RELight.Windows` | Windows adapters: power/path policy, display and audio endpoint enumeration, NAudio WASAPI capture/playback, WAVE_FORMAT_EXTENSIBLE capture conversion, HidSharp inventory/report parsing and `WindowsSettingsStore` |
| `src/RELight.App` | Code-only WinUI 3 operator and audience windows, dual `MediaPlayer` preview/audience surfaces, device/calibration dialog, run controls, scene ribbon, HID learning, file pickers, blockers, event log, unsaved-change save/discard/cancel guards, last-project restore, a 2-second topology refresh, command-line/file-association project open and current-user single-instance forwarding |
| `tests/RELight.*.Tests` | Core, Media, Audio, Show, Controls and Studio test projects |
| `fixtures` | Golden `.relight` documents, invalid cases, validation and check tables generated from the Swift core |
| `tools` | The macOS-only Swift fixture generator |

## Verified on this machine

`dotnet test RELightNative.Windows.slnx` passed **145/145 tests** on the final
Windows 11 ARM64 smoke-test run; the same suite also passes on macOS:

- Core: 72, Media: 8, Audio: 19, Show: 16, Controls: 12, Studio: 18.
- All golden project documents round-trip **byte for byte** through
  `ProjectJson` (sorted keys, two-space indentation, `"key" : value`, escaped
  slashes, UUID casing, shortest-round-trip doubles, no trailing newline).
- Decoding behavior, validation messages, starter project, cue ledger,
  automation, presets and path escapes match the generated Swift fixtures.
- The supplied `Draft 1 scene1-4 .mov` probes as QuickTime, H.264 `avc1`
  1920×1080, 24 fps, 2077 video samples, 86.54 s video track, 86.61 s movie,
  AAC `mp4a` 48 kHz stereo. Its first four Draft 1 scenes pass media validation;
  the fifth scene correctly reports `Film not supplied`.
- Media validation matches the Mac rules: duration must cover
  `mediaInFrame + frames` with 1.1 frames of tolerance, and nominal frame rate
  must be within 0.05 fps.
- The portable voice path preallocates a bounded take (600 s maximum), mixes
  stereo capture to mono, rejects empty or silent takes with the Mac's
  DREAM-00 messages, and builds cue regions with source trim, one-time PCM
  fades, repeat/loop, 5 ms splice ramps and the 10-minute memory cap. Tests
  mirror the Mac audio tests with synthetic PCM; no visitor audio is written
  to disk. Rehearsal 2×/4× uses a phase vocoder, and a synthetic 440 Hz tone
  stays at 440 Hz at every rehearsal speed.
- The portable show engine is covered for gates, consent, automatic and manual
  capture, pause/resume offsets, ducking, repeat/fill, test takes, audition,
  editing locks, abort and calibration layering. Machine voice advance is
  clamped to ±1000 ms and never written into a project or export.
- HID policy and routing are covered without hardware: unassigned elements are
  ignored, learns require two matching activations, releases must precede a
  second press, and exhibition requires two tested controls. The Windows HID
  adapter itself is unverified against a physical encoder.
- Device assignments and calibration persist as separate per-machine JSON
  files, survive malformed/out-of-range input by failing closed, and are never
  fields in a `.relight` project. The last project path is likewise remembered
  in `%LOCALAPPDATA%\RELight Native`, never in the project document.
- Mac-illegal Windows names (reserved names, trailing dot/space, invalid
  characters, decomposed Unicode, case collisions) are surfaced as repairable
  audit entries.
- Portable export stages the project and referenced media, writes a fresh
  `experience.relight`, and refuses to overwrite an existing folder. Draft 1
  seeding is implemented and tested against the Mac resource layout, but the
  provisional Windows publish does not bundle the 114 MB Draft 1 movie yet, so
  first launch falls back to the starter project unless an example folder is
  supplied at `Examples\Draft1` next to the executable.
- The shared mix policy computes film ducking as `filmLevel × duckLevel`, and
  the power policy fails closed unless AC power is known.
- Project saves are atomic, reject documents of 2 MB or more, and create a
  timestamped backup before replacing an existing file.
- Final Windows 11 ARM64 VM smoke test (22 October 2026): the self-contained
  ARM64 publish installed per-user, launched at `2880x1802` physical
  (`1440x940` DIP) on a 200% display, and exposed the complete operator UI,
  scene ribbon, Devices dialog, transport, and event log without a crash.
- The installed `.relight` association forwarded a project into the existing
  window; a second launch exited in ~144 ms while the current-user single
  instance stayed alive and loaded the forwarded project.
- The matching 24 fps scene-1 MP4 validated as playable, rendered visibly in
  the preview, advanced the 432-frame / 18-second clip into scene 2, and reset
  to `00:00:00:00` on Stop. Missing scenes correctly reported blockers.
- Both `win-arm64` and `win-x64` self-contained installers built from the final
  source. Only ARM64 was installed and run natively; x64 was launched under
  ARM64 emulation as a smoke check, not accepted on x64 hardware.
- Installers are unsigned, so Windows SmartScreen may warn. No visitor audio,
  projector, or physical HID hardware was available for this smoke test.

Media tests that need the 114 MB exhibition movie return early when the movie
is not present (for example on a clean CI checkout); all other tests always run.

## Requirements

- .NET SDK **10.0.402 or newer**. The portable projects target `net10.0`.
- macOS with Swift only if you need to regenerate the golden fixtures.
- Windows 10 22H2 (x64) or Windows 11 (x64 or ARM64) to run the WinUI host.
  The publish script produces a native apphost for each architecture; ARM64
  Windows can also run the x64 build under emulation for smoke testing only.
- Inno Setup 6.3 or newer only on the Windows build machine that creates the
  installer.

## Commands

```sh
cd projects/native-app-windows
dotnet build RELightNative.Windows.slnx
dotnet test RELightNative.Windows.slnx
```

Regenerate the conformance corpus from the unmodified Swift core (macOS only):

```sh
./tools/generate-fixtures.sh
```

Build the self-contained publishes and unsigned per-user installers on a
Windows build machine:

```powershell
cd projects\native-app-windows

# Both architectures (default), into artifacts\publish\x64 and
# artifacts\publish\arm64, then one Setup.exe per architecture.
.\installer\publish.ps1

# Or just one target.
.\installer\publish.ps1 -Architecture arm64
.\installer\publish.ps1 -Architecture x64
```

The publish/installer script is not exercised on macOS; see
`installer/README.md` for prerequisites and remaining verification. A
framework-dependent cross-publish is useful for checking the apphost only and
does not replace a Windows self-contained build.

## Installers

The GitHub Release publishes unsigned per-user installers for both
architectures:

| Architecture | File | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| ARM64 | `RELightNative-2.2.0-alpha.1-win-arm64.exe` | 66,974,585 | `F23FCE4427EAFEA0B2AFE3123871E9986CA9D87A426DBDE14D9A12A6717AD18F` |
| x64 | `RELightNative-2.2.0-alpha.1-win-x64.exe` | 71,173,946 | `3830FE0CB192591E13C38475F957F9CDF38FD2453EE49B4EE410E0C1FB777337` |

Verify a download with
`Get-FileHash .\RELightNative-2.2.0-alpha.1-win-arm64.exe -Algorithm SHA256`.
The installers are not code-signed, so Windows SmartScreen may warn.

## Validation status and remaining work

The host now builds, installs, launches, and passes the smoke test above. These
areas remain unverified or need target hardware, the complete media package, or
deeper acceptance work:

1. **Media acceptance:** only the matching scene-1 24 fps MP4 was played. The
   complete 114 MB five-scene movie, frame-accurate seeking, dropped-frame/GPU
   measurements, and the libmpv fallback decision are still open.
2. **Audio acceptance:** WASAPI endpoint selection and routing, shared vs
   exclusive mode, latency, `WAVE_FORMAT_EXTENSIBLE` capture on real
   microphones, 48 kHz stereo voice playback and the machine-calibration value.
   A/B the effect approximations against the Mac Audio Units and listen for
   artifacts in the phase-vocoder 2A-/4A- rehearsal output.
3. **Projector/display/power:** fullscreen on the selected projector,
   fail-closed power state, display/system wake blocking, and the fullscreen
   readiness predicate. Single-instance forwarding and `.relight` association
   are verified; save/close prompts and last-project restore still need a
   dedicated test.
4. **Physical HID:** HidSharp inventory, serial/physical/port identity,
   keyboard-style encoders, background input and the Raw Input fallback.
5. **Native x64 acceptance:** the x64 build only ran under ARM64 emulation.
   Final acceptance needs real x64 hardware.
6. **Operator/audience parity and authoring:** compare the provisional WinUI
   screens with the Mac recording screen, particle horizon, rehearsal labels,
   reduced motion and high-contrast behavior. The provisional window only
   exposes scene selection and cue add/remove; the full Edit workspace (scene,
   cue, media, effects, automation, presets) is still Mac-only.
7. **Media policy:** decide whether fragmented MP4/VFR files are rejected or
   remuxed on import. The probe exposes both conditions but the portable rules
   currently mirror the Mac nominal-frame-rate check.
8. **Packaging and soak:** test the 10-minute take, 10-minute A/V drift, device
   disconnect/reconnect, projector hot-plug, sleep/power changes and ten
   consecutive offline sessions on clean Windows 11 x64 and ARM64 machines.
9. **WinUI control constraint:** this Windows App SDK build fails built-in style
   lookup for `ProgressBar`, `NumberBox`, and `TextBox`. The host avoids those
   controls; any future UI change that reintroduces them must be tested here
   first.

## Compatibility notes

- `.relight` files are the contract, not shared code. Windows writes the same
  schema-1 bytes as the Mac app. Per-machine calibration is stored outside the
  project; `outputOffsetMs` remains the authored voice-advance value.
- Project media paths stay relative and may not escape the project. Containment
  uses real-path resolution to reject symlinks; Windows and macOS compare
  case-insensitively, which is slightly broader than the Swift literal-prefix
  check.
- The ISO-BMFF probe supports classic (non-fragmented) MP4/MOV, 32/64-bit boxes,
  `moov` before or after `mdat`, QuickTime SoundDescription v1/v2 audio, and
  computes uniform or average frame rate from `stts`. Fragmented files are
  flagged (`Fragmented == true`) but their sample tables are not reconstructed
  yet. Edit lists are not applied; the movie duration comes from `mvhd`, as
  AVAsset does.
- Variable frame rate is detected and exposed on `VideoTrackInfo`, but the
  current validator intentionally mirrors the Mac validator's nominal-rate rule.
  Whether to reject VFR outright remains a Windows media-spike decision.
