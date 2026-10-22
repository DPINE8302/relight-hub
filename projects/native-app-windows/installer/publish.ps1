# Publishes self-contained Windows x64 and/or ARM64 builds and, when Inno
# Setup is available, compiles one unsigned per-user installer per architecture.
[CmdletBinding()]
param(
    [ValidateSet("x64", "arm64", "all")]
    [string]$Architecture = "all"
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Project = Join-Path $Root "src\RELight.App\RELight.App.csproj"
$InstallerDir = Join-Path $Root "artifacts\installer"

if (-not (Test-Path $Project)) {
    throw "App project not found: $Project"
}

$Iscc = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe"),
    (Join-Path $env:ProgramFiles "Inno Setup 6\ISCC.exe")
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

$Architectures = if ($Architecture -eq "all") { @("x64", "arm64") } else { @($Architecture) }

foreach ($Arch in $Architectures) {
    $Rid = "win-$Arch"
    $PublishDir = Join-Path $Root "artifacts\publish\$Arch"

    if (Test-Path $PublishDir) {
        Remove-Item $PublishDir -Recurse -Force
    }

    New-Item -ItemType Directory -Path $PublishDir -Force | Out-Null

    Write-Host "Publishing RE:Light Native for $Rid..."
    dotnet publish $Project `
        -c Release `
        -r $Rid `
        -p:Platform=$Arch `
        --self-contained true `
        -p:WindowsAppSDKSelfContained=true `
        -p:WindowsPackageType=None `
        -p:PublishSingleFile=false `
        -p:PublishTrimmed=false `
        -p:DebugType=None `
        -p:DebugSymbols=false `
        -o $PublishDir

    if ($LASTEXITCODE -ne 0) {
        throw "dotnet publish for $Rid failed with exit code $LASTEXITCODE."
    }

    $Exe = Join-Path $PublishDir "RELight.App.exe"
    if (-not (Test-Path $Exe)) {
        throw "Publish for $Rid completed without RELight.App.exe."
    }

    Write-Host "Published: $PublishDir"
}

if (-not $Iscc) {
    Write-Warning "Inno Setup 6 was not found. The architecture publish directories are ready, but no Setup.exe was built."
    return
}

New-Item -ItemType Directory -Path $InstallerDir -Force | Out-Null

foreach ($Arch in $Architectures) {
    $PublishDir = Join-Path $Root "artifacts\publish\$Arch"
    $InstallerName = "RELightNative-2.2.0-alpha.1-win-$Arch"

    Write-Host "Compiling $Arch installer with $Iscc..."
    & $Iscc `
        "/DAppArch=$Arch" `
        "/DPublishDir=$PublishDir" `
        "/DInstallerName=$InstallerName" `
        (Join-Path $Root "installer\RELightNative.iss")

    if ($LASTEXITCODE -ne 0) {
        throw "Inno Setup for $Arch failed with exit code $LASTEXITCODE."
    }
}

Write-Host "Installer(s) written to: $InstallerDir"
