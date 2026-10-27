<#
.SYNOPSIS
Inject the frame-keyboard bundle into Steam's SharedJSContext over the Chrome DevTools Protocol.

.DESCRIPTION
Windows counterpart of injector/frame_keyboard_injector.py (same behaviour, no Python needed).
Every 2 s it looks up the SharedJSContext target on http://127.0.0.1:8080/json. When the target is
new (Steam restarted) or window.__fjk is missing (the context reloaded), it evaluates the bundle.
CDP being unreachable or Steam being closed is normal: it waits with backoff and tries again.
Console lines starting with "[fjk]" are written to the log file.

Steam only opens the debugging port when an empty file named .cef-enable-remote-debugging sits next
to steam.exe (install.ps1 creates it).

.PARAMETER Bundle
Bundle to inject (default: bundle.js next to this script).
.PARAMETER DevTools
CDP endpoint (default: http://127.0.0.1:8080).
.PARAMETER Once
Inject (or re-inject) once and exit.
.PARAMETER NoConsole
Do not forward [fjk] console lines.
.PARAMETER LogFile
Log file (default: %LOCALAPPDATA%\frame-keyboard\injector.log).
#>
param(
    [string]$Bundle = (Join-Path $PSScriptRoot 'bundle.js'),
    [string]$DevTools = 'http://127.0.0.1:8080',
    [switch]$Once,
    [switch]$NoConsole,
    [string]$LogFile = (Join-Path $env:LOCALAPPDATA 'frame-keyboard\injector.log')
)

$ErrorActionPreference = 'Stop'
$TargetTitle = 'SharedJSContext'
$PollSeconds = 2
$MaxBackoffSeconds = 30
$CallTimeoutMs = 15000
$CheckExpression = "typeof window.__fjk === 'object' && window.__fjk !== null"
$StatusExpression = 'window.__fjk ? `${window.__fjk.version} (${window.__fjk.state})` : "missing"'

$script:ws = $null
$script:nextId = 0
$script:connectedMs = 0
$script:lastState = $null

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
if ((Test-Path $LogFile) -and ((Get-Item $LogFile).Length -gt 1MB)) { Remove-Item $LogFile -Force }

function Write-Log([string]$Message) {
    $line = '{0:yyyy-MM-dd HH:mm:ss} {1}' -f (Get-Date), $Message
    Write-Host $line
    try { Add-Content -Path $LogFile -Value $line -Encoding UTF8 } catch { }
}

# Print a state message only when it differs from the previous one.
function Write-State([string]$Message) {
    if ($Message -ne $script:lastState) {
        $script:lastState = $Message
        Write-Log $Message
    }
}

function New-Timeout { (New-Object System.Threading.CancellationTokenSource($CallTimeoutMs)).Token }

# Read one complete websocket text message.
function Receive-Message {
    $buffer = New-Object byte[] 65536
    $text = New-Object System.Text.StringBuilder
    $token = New-Timeout
    do {
        $segment = New-Object System.ArraySegment[byte] -ArgumentList @(, $buffer)
        $result = $script:ws.ReceiveAsync($segment, $token).GetAwaiter().GetResult()
        if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
            throw 'websocket closed'
        }
        [void]$text.Append([System.Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count))
    } until ($result.EndOfMessage)
    $text.ToString()
}

function Write-ConsoleEvent($params) {
    # Runtime.enable replays old messages; only show ones logged after we connected.
    if ($params.timestamp -lt ($script:connectedMs - 1000)) { return }
    $parts = foreach ($arg in $params.args) {
        if ($null -ne $arg.value) { [string]$arg.value }
        elseif ($arg.description) { [string]$arg.description }
        else { [string]$arg.type }
    }
    $text = $parts -join ' '
    if ($text.StartsWith('[fjk]')) {
        if ($params.type -and $params.type -ne 'log') { Write-Log "js $($params.type): $text" } else { Write-Log "js: $text" }
    }
}

# Send one CDP request and wait for its reply (console events that arrive meanwhile are logged).
function Invoke-Cdp([string]$Method, $Params = @{}) {
    $script:nextId += 1
    $id = $script:nextId
    $json = @{ id = $id; method = $Method; params = $Params } | ConvertTo-Json -Compress -Depth 6
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $segment = New-Object System.ArraySegment[byte] -ArgumentList @(, $bytes)
    [void]$script:ws.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, (New-Timeout)).GetAwaiter().GetResult()
    while ($true) {
        $reply = Receive-Message | ConvertFrom-Json
        if ($reply.id -eq $id) {
            if ($reply.error) { throw "${Method}: $($reply.error.message)" }
            return $reply.result
        }
        if ($reply.method -eq 'Runtime.consoleAPICalled' -and -not $NoConsole) { Write-ConsoleEvent $reply.params }
    }
}

function Invoke-Eval([string]$Expression) {
    $result = Invoke-Cdp 'Runtime.evaluate' @{ expression = $Expression; returnByValue = $true; awaitPromise = $false }
    if ($result.exceptionDetails) {
        $details = $result.exceptionDetails
        $description = if ($details.exception.description) { $details.exception.description } else { $details.text }
        throw (($description -split "`n")[0])
    }
    $result.result.value
}

function Find-Target {
    $raw = Invoke-RestMethod -Uri "$DevTools/json" -TimeoutSec 5
    # Depending on the PowerShell version the JSON array arrives as one object or as many; flatten both.
    $targets = foreach ($outer in $raw) { foreach ($item in $outer) { $item } }
    $targets | Where-Object { $_.title -eq $TargetTitle -and $_.webSocketDebuggerUrl } | Select-Object -First 1
}

function Connect-Target($Target) {
    $script:ws = New-Object System.Net.WebSockets.ClientWebSocket
    [void]$script:ws.ConnectAsync([Uri]$Target.webSocketDebuggerUrl, (New-Timeout)).GetAwaiter().GetResult()
    $script:connectedMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
}

function Disconnect-Target {
    if ($script:ws) {
        try { $script:ws.Dispose() } catch { }
        $script:ws = $null
    }
}

function Send-Bundle {
    if (-not (Test-Path $Bundle)) {
        Write-State "cannot read bundle $Bundle"
        return $false
    }
    $source = [System.IO.File]::ReadAllText((Resolve-Path $Bundle).Path, [System.Text.Encoding]::UTF8)
    try {
        [void](Invoke-Eval "$source`n//# sourceURL=frame-keyboard/bundle.js`n")
    } catch {
        Write-Log "injection failed: $($_.Exception.Message)"
        return $false
    }
    $status = '?'
    try { $status = Invoke-Eval $StatusExpression } catch { }
    Write-Log "injected $Bundle -> window.__fjk $status"
    $true
}

# Keep the bundle injected into one target until it disappears or its websocket closes.
function Watch-Target($Target) {
    Connect-Target $Target
    try {
        $script:lastState = $null
        Write-Log "connected to $TargetTitle ($($Target.id))"
        [void](Invoke-Cdp 'Runtime.enable') # console forwarding
        while ($script:ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
            if (-not (Invoke-Eval $CheckExpression)) { [void](Send-Bundle) }
            Start-Sleep -Seconds $PollSeconds
            $current = Find-Target
            if (-not $current -or $current.id -ne $Target.id) {
                Write-Log "$TargetTitle target changed; reconnecting"
                return
            }
        }
    } finally {
        Disconnect-Target
    }
}

if ($Once) {
    # Inject once unconditionally (the bundle replaces an existing instance itself).
    try {
        $target = Find-Target
        if (-not $target) {
            Write-Log "no $TargetTitle target at $DevTools"
            exit 1
        }
        Connect-Target $target
        try {
            if (Send-Bundle) { exit 0 } else { exit 1 }
        } finally {
            Disconnect-Target
        }
    } catch {
        Write-Log "CDP unavailable at ${DevTools}: $($_.Exception.Message)"
        exit 1
    }
}

Write-Log "frame-keyboard injector: bundle $Bundle, CDP $DevTools"
$backoff = $PollSeconds
while ($true) {
    try {
        $target = Find-Target
        if (-not $target) {
            Write-State "waiting for $TargetTitle target"
        } else {
            $backoff = $PollSeconds
            Watch-Target $target
            continue
        }
    } catch {
        Write-State "CDP unavailable ($($_.Exception.Message)); retrying"
    }
    Start-Sleep -Seconds $backoff
    $backoff = [Math]::Min($backoff * 2, $MaxBackoffSeconds)
}
