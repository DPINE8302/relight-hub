#define AppName "RE:Light Native"
#define AppShortName "RELight Native"
#define AppVersion "2.2.0"
#define AppPublisher "RE:Light"
#define AppExeName "RELight.App.exe"

; publish.ps1 overrides these per architecture. The defaults keep the script
; directly compilable for x64 from the installer directory.
#ifndef AppArch
  #define AppArch "x64"
#endif
#ifndef PublishDir
  #define PublishDir "..\artifacts\publish\x64"
#endif
#ifndef InstallerName
  #define InstallerName "RELightNative-2.2.0-alpha.1-win-x64"
#endif

[Setup]
AppId={{6F0E2D5A-1C7B-4A93-8E2F-0D4B5C6A7E81}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={localappdata}\Programs\RELight Native
DefaultGroupName={#AppShortName}
DisableProgramGroupPage=yes
UsePreviousAppDir=yes
PrivilegesRequired=lowest
ArchitecturesAllowed={#AppArch}
ArchitecturesInstallIn64BitMode={#AppArch}
MinVersion=10.0.19045
OutputDir=..\artifacts\installer
OutputBaseFilename={#InstallerName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#AppExeName}
UninstallDisplayName={#AppName}
ChangesAssociations=yes
CloseApplications=yes
RestartApplications=no
SetupLogging=yes
SetupIconFile=..\src\RELight.App\Assets\RELight.ico

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked

[Files]
Source: "{#PublishDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#AppShortName}"; Filename: "{app}\{#AppExeName}"
Name: "{autodesktop}\{#AppShortName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon
Name: "{group}\Uninstall {#AppShortName}"; Filename: "{uninstallexe}"

[Registry]
Root: HKA; Subkey: "Software\Classes\.relight"; ValueType: string; ValueName: ""; ValueData: "RELightNative.Project"; Flags: uninsdeletevalue
Root: HKA; Subkey: "Software\Classes\RELightNative.Project"; ValueType: string; ValueName: ""; ValueData: "RE:Light project"; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\Classes\RELightNative.Project\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#AppExeName},0"
Root: HKA; Subkey: "Software\Classes\RELightNative.Project\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExeName}"" ""%1"""

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Launch {#AppName}"; Flags: nowait postinstall skipifsilent
