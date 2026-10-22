# RE:Light Native for Windows — offline installer

This directory contains the unsigned, per-user Inno Setup packaging path. The
script produces separate x64 and ARM64 installers. It has not been compiled or
installed on Windows yet because no Windows machine was available when this
packaging path was written.

## Build on Windows 10 22H2 x64 or Windows 11 x64/ARM64

```powershell
cd relight-engine\native-app-windows

# Both architectures (default).
.\installer\publish.ps1

# Or a single architecture.
.\installer\publish.ps1 -Architecture arm64
.\installer\publish.ps1 -Architecture x64
```

The script publishes self-contained builds to:

- `artifacts\publish\x64\` (native x64 apphost)
- `artifacts\publish\arm64\` (native ARM64 apphost)

It then runs Inno Setup, when installed, and writes:

- `artifacts\installer\RELightNative-2.2.0-alpha.1-win-x64.exe`
- `artifacts\installer\RELightNative-2.2.0-alpha.1-win-arm64.exe`

Each installer is architecture-specific. Install the x64 package on x64
Windows and the ARM64 package on ARM64 Windows 11. An x64 build can run under
Windows 11 ARM64 emulation for a smoke test, but that is not native ARM64
validation and is not an x64 acceptance substitute.

Publish must run on Windows: the Windows App SDK self-contained manifest merge
invokes `mt.exe`, which is a Windows executable. On macOS only a
framework-dependent cross-publish can be checked, and it does not replace the
self-contained Windows build.

Prerequisites on the build PC:

- .NET SDK 10.0.402 or newer. The ARM64 SDK is preferred on an ARM64 build PC.
- Inno Setup 6.3 or newer (only needed to create `Setup.exe`). The
  architecture-specific `ArchitecturesAllowed`/`ArchitecturesInstallIn64BitMode`
  values require Inno Setup with ARM64 support.
- No Windows App SDK runtime is required on the exhibition PC because the
  publish is self-contained.

## Installer behavior

- Per-user install under `%LOCALAPPDATA%\Programs\RELight Native`; no admin
  prompt.
- Start Menu shortcut and optional desktop shortcut.
- `.relight` files open in the existing app window (the app uses a
  current-user named pipe for single-instance forwarding).
- Unsigned binary. SmartScreen may warn on first launch; signing is a later
  release step.
- Uninstall removes the app and its file association but leaves
  `%LOCALAPPDATA%\RELight Native` device/calibration settings in place.
- The installers share the same application ID and install directory, so
  upgrading from one architecture build to another replaces the payload rather
  than creating a second app. Windows will reject the wrong-architecture
  installer.

## Remaining verification

- Confirm Windows App SDK self-contained publish works on clean Windows 10
  22H2 x64, Windows 11 x64 and Windows 11 ARM64 machines without the runtime
  installed.
- Confirm the ARM64 installer compiles with Inno Setup 6.3+ and installs a
  native ARM64 apphost.
- Confirm the x64 installer still targets x64 only and rejects ARM64 Windows;
  confirm the ARM64 installer rejects x64 Windows.
- Confirm the app launches from the Start Menu and from a `.relight` file.
- Confirm Windows 10 22H2 x64, Windows 11 x64 and Windows 11 ARM64 install,
  upgrade and uninstall.
- Add Authenticode signing before public distribution.
