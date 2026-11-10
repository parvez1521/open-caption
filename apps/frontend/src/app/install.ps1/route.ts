// Windows one-command installer for the CapsEasy Companion (see WINDOWS_INSTALL in lib/install.ts for the command).
// No admin rights, immune to the default "running scripts is disabled" policy (never runs a .ps1 shim), own npm
// prefix in %LOCALAPPDATA%\capseasy, and a private Node (x64/arm64/x86) when the PC has none or an old one.
// Contains NO secrets: the companion authenticates with its own paired token.

const NODE_VERSION = "20.18.0";

export async function GET(request: Request) {
  const app = (process.env.APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
  const script = `# CapsEasy Companion installer (Windows). Paste into PowerShell, Command Prompt or Win+R:
#   powershell -NoProfile -ExecutionPolicy Bypass -Command "irm ${app}/install.ps1 | iex"
# Works on locked-down PCs: no admin rights, never runs a .ps1 wrapper (Windows blocks those by default),
# installs into %LOCALAPPDATA%\\capseasy, and brings its own Node.js when the one on this PC is missing or old.
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
try { Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force } catch {}  # this window only
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}
$App = "${app}"
$Home2 = Join-Path $env:LOCALAPPDATA "capseasy"
$Prefix = Join-Path $Home2 "npm"          # our own global npm folder: no admin, no clash with other Node setups
New-Item -ItemType Directory -Force -Path $Home2, $Prefix | Out-Null

function Fetch($Url, $OutFile) {
  for ($i = 1; $i -le 3; $i++) {
    try { Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $OutFile; return } catch { if ($i -eq 3) { throw "Download failed: $Url ($($_.Exception.Message))" }; Start-Sleep -Seconds (2 * $i) }
  }
}
function Add-UserPath($Dir) {
  $env:Path = "$Dir;$env:Path"
  $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if (-not $UserPath) { $UserPath = "" }
  if ((";$UserPath;") -notlike "*;$Dir;*") { [Environment]::SetEnvironmentVariable("Path", ("$Dir;$UserPath").TrimEnd(";"), "User") }
}
function Fail($Msg) {
  Write-Host ""
  Write-Host "  $Msg" -ForegroundColor Red
  Write-Host "  Need help? Copy this window's text and send it to support." -ForegroundColor DarkGray
  throw $Msg
}

Write-Host ""
Write-Host "  Open Caption Companion" -ForegroundColor Green
Write-Host "  Makes captions privately on this computer." -ForegroundColor DarkGray
Write-Host ""

# 1. Node.js 20+ (the one on this PC, else a private copy). Always node.exe / npm.cmd, never the .ps1 shims.
$Node = $null; $Npm = $null
$SysNode = Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1
if ($SysNode) {
  $v = ""; try { $v = (& $SysNode.Source --version 2>$null | Out-String).Trim() } catch {}
  $SysNpm = Join-Path (Split-Path $SysNode.Source) "npm.cmd"
  if ($v -match "^v(\\d+)" -and [int]$Matches[1] -ge 20 -and (Test-Path $SysNpm)) { $Node = $SysNode.Source; $Npm = $SysNpm }
}
if (-not $Node) {
  $NodeDir = Join-Path $Home2 "node"
  if (-not (Test-Path (Join-Path $NodeDir "node.exe"))) {
    $Arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64" -or $env:PROCESSOR_ARCHITEW6432 -eq "ARM64") { "arm64" } elseif ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
    Write-Host "> Installing a private copy of Node.js ($Arch, no admin needed)..."
    $Zip = Join-Path $env:TEMP "capseasy-node-$([guid]::NewGuid().ToString('N')).zip"
    Fetch "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-$Arch.zip" $Zip
    $Tmp = Join-Path $Home2 "node-unpack"
    if (Test-Path $Tmp) { Remove-Item -Recurse -Force $Tmp }
    Expand-Archive -Force -LiteralPath $Zip -DestinationPath $Tmp
    if (Test-Path $NodeDir) { Remove-Item -Recurse -Force $NodeDir }
    Move-Item (Get-ChildItem $Tmp | Select-Object -First 1).FullName $NodeDir
    Remove-Item -Recurse -Force $Tmp, $Zip -ErrorAction SilentlyContinue
  }
  $Node = Join-Path $NodeDir "node.exe"; $Npm = Join-Path $NodeDir "npm.cmd"
  Add-UserPath $NodeDir
}
$env:Path = "$(Split-Path $Node);$env:Path"
Add-UserPath $Prefix
$Cap = Join-Path $Prefix "capseasy.cmd"

$OneClick = [bool]$env:CAPSEASY_PAIR

# 2. The Companion (skip when already up to date)
$Latest = ""
try { $Latest = (Invoke-RestMethod -UseBasicParsing "$App/companion/latest.json").version } catch {}
$Have = ""
if (Test-Path $Cap) { try { $Have = ((& $Cap --version 2>$null) | Out-String).Trim() } catch {} }
if ($Have -and $Have -eq $Latest) {
  Write-Host "> Companion $Have is already installed and up to date."
} else {
  if ($Have) { Write-Host "> Updating the Companion ($Have -> $Latest)..." } else { Write-Host "> Installing the Companion..." }
  # a running Companion locks its files and would block the update
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "capseasy" } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force } catch {} }
  & $Npm install -g --prefix "$Prefix" --cache "$(Join-Path $Home2 'npm-cache')" --no-fund --no-audit --loglevel=error "$App/companion/capseasy-companion-latest.tgz"
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $Cap)) { Fail "Installing the Companion failed (npm exit $LASTEXITCODE)." }
}
# PowerShell would pick capseasy.ps1 over capseasy.cmd, and .ps1 files are blocked on most PCs: keep only the .cmd
Remove-Item (Join-Path $Prefix "capseasy.ps1") -Force -ErrorAction SilentlyContinue
try { $Old = (& $Npm prefix -g 2>$null | Out-String).Trim(); if ($Old) { Remove-Item (Join-Path $Old "capseasy.ps1") -Force -ErrorAction SilentlyContinue } } catch {}

# 3. Pair with the account
$Name = ""
if ($OneClick) {
  # one-click setup file: the website already approved this code for the signed-in account, no browser step
  Write-Host "> Connecting this computer to your account..."
  & $Cap login --api $App --pair-code $env:CAPSEASY_PAIR
  if ($LASTEXITCODE -ne 0) { Fail "This setup file has expired or was already used. Download a fresh one from the Open Caption website." }
} else {
  try { $Name = ((& $Cap check-pairing --api $App 2>$null) | Out-String).Trim() } catch {}
}
if ($OneClick) {
} elseif ($LASTEXITCODE -eq 0 -and $Name) {
  Write-Host ""
  Write-Host "  Welcome back! '$Name' is already connected to your account." -ForegroundColor Green
} else {
  Write-Host "> Pairing with your account (a browser window will open)..."
  & $Cap login --api $App
  if ($LASTEXITCODE -ne 0) { Fail "Pairing did not finish. Open a new terminal and run: capseasy login --api $App" }
}

# 4. Start by itself at every sign-in, so nobody needs a terminal again
try { & $Cap autostart enable | Out-Null } catch {}

Write-Host ""
Write-Host "  All set. The Companion now starts automatically when you log in." -ForegroundColor Green
Write-Host "  (The first job downloads the speech model and renderer once, a few hundred MB.)" -ForegroundColor DarkGray
Write-Host ""
if ($OneClick) {
  # run it in the background (no window) and get out of the way: the website shows "Connected" by itself
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "capseasy" -and $_.CommandLine -match " start" } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force } catch {} }
  $Vbs = Join-Path $env:APPDATA "Microsoft/Windows/Start Menu/Programs/Startup/CapsEasy Companion.vbs"  # same path the Companion writes
  if (Test-Path $Vbs) { Start-Process wscript.exe -ArgumentList "\`"$Vbs\`"" } else { Start-Process -WindowStyle Hidden -FilePath $Cap -ArgumentList "start" }
  Write-Host "  You can close this window and go back to Open Caption." -ForegroundColor Green
  Start-Sleep -Seconds 4
} else {
  & $Cap start
}
`;
  return new Response(script, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
