# Clean audience output and awake protection — Mac 2.3.2

Audience output is a full-display borderless nonactivating panel. Its level is above the Mac menu bar and Dock, it has no toolbar/title bar/shadow, remains visible across Spaces and app switching/hiding, and cannot take operator keyboard focus. The cursor is transparent over audience content and restored on exit/close. Media uses aspect-fit to preserve the complete frame rather than cropping it.

All audience surfaces use the same clean panel, including a Mac-only or mirrored screen; no old titled preview window can remain on a projector after a topology change. An automatic target prefers an external display when opening output; explicitly assigned missing displays report an error. Output stays pinned to its actual target, resizes with display geometry changes and closes if that target disconnects.

Normal Audience opens without a display-check overlay. Devices → Check audience output deliberately shows framing marks, and Picture is correct / ⌘⇧Return removes them. Check is disabled while playback/recording is active. Rehearsal badges and missing-media diagnostic text remain on the operator preview; they are not drawn on audience output. The authored recording instructions remain part of the experience.

**⌘Escape** closes audience output and returns to controls on a single/mirrored screen. It does not intercept standard Force Quit. A dirty-project Quit temporarily lowers audience output only on the operator’s display so the Save/Cancel/Discard dialog is accessible; cancellation restores the presentation.

An app-owned PreventUserIdleDisplaySleep assertion and user-initiated activity cover the film, preparing, paused, recording/countdown, previews and open audience output. They are acquired before protected operation, released when no session/output remains and on shutdown, and cannot be re-created after shutdown. Acquisition failure blocks the operation and reports an error. No global power, security, menu-bar or Dock preference is modified.

## Verification

- 58 native + 17 core + 7 HID tests pass (82 total).
- Native panel checks cover full-frame sizing at negative coordinates, resolution changes, absence of title/toolbar/shadow, level above menu/Dock, cross-Space behavior and nonactivating focus.
- The actual IOKit assertion is inspected during a test and confirmed released. State tests span preparation, playback, pause, gates/countdown/recording and shutdown. An injected acquisition failure blocks playback and prevents audience output from appearing.
- Isolated native UI testing opened audience output; macOS power diagnostics showed both display and system idle-sleep prevention held for the RE:Light process. ⌘Escape recovered operator controls and both process assertions disappeared.
- Explicit framing check enabled confirmation; ⌘⇧Return changed the device card to Confirmed and disabled further confirmation, demonstrating the check overlay was cleared. ⌘Escape closed output. Dirty-Quit showed Save/Cancel/Discard; Cancel returned to the running app and fullscreen recovery still worked. The temporary QA-only mute edit was discarded.
- Three context-isolated, trace-unverified source review cycles were completed. The final review found no remaining practical release blocker in the reviewed scope.

Only the built-in display was detected during runtime checks. The CUA image capture targets the operator window rather than the nonactivating audience panel, so no external projected photograph was obtained. Physical projector framing, HDMI behavior and real-room latency remain unverified. Connect the projector as an extended display for independent operator controls, select it in Devices or reopen Automatic audience output, then confirm the physical picture.

Idle-sleep protection does not override closing a laptop lid, manual sleep/lock, critical battery conditions or loss of power. Keep the Mac powered with its lid open. Film 02, both authored timecodes and the 400× maximum dream boost are unchanged.

API references: [Apple window levels](https://developer.apple.com/documentation/appkit/nswindow/level-swift.struct/screensaver), [display idle assertion](https://developer.apple.com/documentation/iokit/kiopmassertiontypepreventuseridledisplaysleep).
