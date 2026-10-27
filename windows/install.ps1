<#
.SYNOPSIS
Install or remove frame-keyboard on Windows (SteamVR keyboard).

.DESCRIPTION
  install.ps1                  install or update, and start the injector
  install.ps1 -RestartSteam    ... and restart Steam so the debugging port is opened right away
  install.ps1 -Uninstall       stop and remove (restart Steam afterwards to fully unload)
  install.ps1 -Uninstall -RemoveFlag   also delete .cef-enable-remote-debugging

What it does, without administrator rights:
  1. Creates an empty .cef-enable-remote-debugging next to steam.exe. Steam then opens its
     debugging port on 127.0.0.1:8080 (local only) the next time it starts.
  2. Copies bundle.js and the injector to %LOCALAPPDATA%\frame-keyboard.
  3. Registers a Scheduled Task "frame-keyboard" that runs the injector hidden at every logon. The
     injector waits for Steam and injects the keyboard again after every Steam restart.

Files are taken from this folder (the release archive) or from the repository layout
(windows\ next to dist\bundle.js, which `npm run build` creates).
#>
param(
    [switch]$Uninstall,
    [switch]$RemoveFlag,
    [switch]$RestartSteam
)

$ErrorActionPreference = 'Stop'
$TaskName = 'frame-keyboard'
$InstallDir = Join-Path $env:LOCALAPPDATA 'frame-keyboard'
$FlagName = '.cef-enable-remote-debugging'
$Injector = 'frame_keyboard_injector.ps1'

function Get-SteamDir {
    $candidates = @()
    try { $candidates += (Get-ItemProperty 'HKCU:\Software\Valve\Steam' -ErrorAction Stop).SteamPath } catch { }
    $candidates += ${env:ProgramFiles(x86)} + '\Steam'
    $candidates += $env:ProgramFiles + '\Steam'
    foreach ($candidate in $candidates) {
        if (-not $candidate) { continue }
        $dir = $candidate -replace '/', '\'
        if (Test-Path (Join-Path $dir 'steam.exe')) { return $dir }
    }
    return $null
}

function Stop-Injector {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    # The task's powershell child may outlive the task; stop any injector still running.
    Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*$Injector*" } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function Restart-Steam($SteamDir) {
    $exe = Join-Path $SteamDir 'steam.exe'
    if (Get-Process steam -ErrorAction SilentlyContinue) {
        Write-Host 'Closing Steam...'
        & $exe -shutdown
        $deadline = (Get-Date).AddSeconds(60)
        while ((Get-Process steam -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 1 }
    }
    Write-Host 'Starting Steam...'
    Start-Process $exe
}

$steamDir = Get-SteamDir

if ($Uninstall) {
    Stop-Injector
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
    if ($RemoveFlag -and $steamDir) { Remove-Item (Join-Path $steamDir $FlagName) -Force -ErrorAction SilentlyContinue }
    Write-Host 'Removed frame-keyboard.'
    Write-Host 'The keyboard code is still loaded in the running Steam client. Restart Steam to fully unload it'
    Write-Host 'and get the stock keyboard back.'
    if (-not $RemoveFlag) { Write-Host "($FlagName was left in place; use -Uninstall -RemoveFlag to delete it.)" }
    return
}

if (-not $steamDir) {
    throw 'Steam was not found. Install Steam first (steam.exe is expected in the folder registered under HKCU\Software\Valve\Steam).'
}

# Release archive: everything side by side. Repository: windows\ next to dist\bundle.js.
$bundle = @((Join-Path $PSScriptRoot 'bundle.js'), (Join-Path $PSScriptRoot '..\dist\bundle.js')) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $bundle) {
    throw 'bundle.js not found. Use the release archive, or run "npm install" and "npm run build" in the repository first.'
}
$injectorSource = Join-Path $PSScriptRoot $Injector
if (-not (Test-Path $injectorSource)) { throw "$Injector not found next to install.ps1." }

# 1. Let Steam open its debugging port.
$flag = Join-Path $steamDir $FlagName
if (-not (Test-Path $flag)) { New-Item -ItemType File -Path $flag | Out-Null }
Write-Host "Steam folder: $steamDir (debugging flag in place)"

# 2. Copy the files (stop a running injector first so an update replaces them cleanly).
Stop-Injector
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item $bundle (Join-Path $InstallDir 'bundle.js') -Force
Copy-Item $injectorSource (Join-Path $InstallDir $Injector) -Force

# 3. Start the injector at every logon, hidden, without administrator rights.
$injectorPath = Join-Path $InstallDir $Injector
$bundlePath = Join-Path $InstallDir 'bundle.js'
$arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$injectorPath`" -Bundle `"$bundlePath`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -Hidden
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description 'Injects the frame-keyboard overlay into Steam (SteamVR keyboard).' -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Host ''
Write-Host 'frame-keyboard is installed and injects itself whenever Steam runs.'
Write-Host "  Log:        $env:LOCALAPPDATA\frame-keyboard\injector.log"
Write-Host "  Re-inject:  powershell -File `"$injectorPath`" -Once"
Write-Host "  Uninstall:  powershell -File `"$PSScriptRoot\install.ps1`" -Uninstall"

if ($RestartSteam) {
    Restart-Steam $steamDir
} else {
    Write-Host ''
    Write-Host 'Restart Steam once so it opens the debugging port (or run this script again with -RestartSteam).'
}
