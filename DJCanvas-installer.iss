#define MyAppName "DJ Canvas"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Ahmed Mohamed"
#define MyAppURL "https://github.com/Ahmed-Mohamed222"
#define MyAppExeName "DJCanvas.exe"
#define MyAppSourceDir "E:\theatre\music sorter\DJ Canvas Source Code\electron-release\DJCanvas-win32-x64"

[Setup]
AppId={{5E583A85-C95B-4C9D-A3D8-809AF1A2C3E2}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=admin
OutputDir=E:\theatre\music sorter\DJ Canvas Full Setup
OutputBaseFilename=DJCanvas-Setup
SetupIconFile=E:\theatre\music sorter\DJ Canvas Source Code\icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#MyAppSourceDir}\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#MyAppSourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "E:\theatre\music sorter\DJ Canvas Source Code\icon.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "E:\theatre\music sorter\DJ Canvas Source Code\icon.png"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\icon.ico"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; IconFilename: "{app}\icon.ico"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
