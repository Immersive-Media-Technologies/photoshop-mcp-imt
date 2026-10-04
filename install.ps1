# PS-MCP-IMT - install on Windows (PowerShell 5.1+).
#   .\install.ps1              check -> build -> live self-test -> write client configs (asks first)
#   .\install.ps1 -Yes         same, without questions
#   .\install.ps1 -NoConfig    check, build and self-test only; print the config instead
# If scripts are blocked: powershell -ExecutionPolicy Bypass -File .\install.ps1
# Verified on Windows 11 (ARM) with Photoshop/After Effects 2026 - 2026-10-04.
param([switch]$Yes, [switch]$NoConfig)
$ErrorActionPreference = 'Continue'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Fail = $false
function Ok($m)   { Write-Host "  ok   $m" -ForegroundColor Green }
function Warn($m) { Write-Host " warn  $m" -ForegroundColor Yellow }
function Bad($m)  { Write-Host " FAIL  $m" -ForegroundColor Red; $script:Fail = $true }
function Ask($q)  { if ($Yes) { return $true }; $r = Read-Host "$q [y/N]"; return ($r -eq 'y' -or $r -eq 'Y') }

Write-Host "`nPS-MCP-IMT - environment check`n-----------------------------------------------"
$PsExe = $null
if ($env:PHOTOSHOP_PATH -and (Test-Path $env:PHOTOSHOP_PATH)) { $PsExe = $env:PHOTOSHOP_PATH }
else {
  $found = Get-ChildItem -Path "$env:ProgramFiles\Adobe" -Filter 'Photoshop.exe' -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.DirectoryName -match 'Adobe Photoshop (2024|2025|2026)' } | Sort-Object FullName -Descending | Select-Object -First 1
  if ($found) { $PsExe = $found.FullName }
}
if ($PsExe) { Ok "Photoshop: $PsExe" } else { Bad "Photoshop 2024-2026 not found under $env:ProgramFiles\Adobe (set PHOTOSHOP_PATH to Photoshop.exe)" }

$NodeBin = (Get-Command node -ErrorAction SilentlyContinue).Source
if ($NodeBin) {
  $major = [int]((& $NodeBin -v) -replace '^v(\d+).*', '$1')
  if ($major -ge 18) { Ok "Node $(& $NodeBin -v) - $NodeBin" } else { Bad "Node.js >= 18 required (found $(& $NodeBin -v))" }
} else { Bad "Node.js >= 18 not found - install from https://nodejs.org or use the Claude Desktop extension (.mcpb), which needs no Node" }
if ($Fail) { Write-Host "`nStopped." -ForegroundColor Red; exit 1 }

Write-Host "`nBuild`n-----------------------------------------------"
Set-Location $Here
if (Test-Path 'package-lock.json') { npm ci --no-audit --no-fund 2>&1 | Out-Null; if ($LASTEXITCODE -ne 0) { npm install --no-audit --no-fund 2>&1 | Out-Null } }
else { npm install --no-audit --no-fund 2>&1 | Out-Null }
if (Test-Path 'node_modules') { Ok 'dependencies installed' } else { Bad 'npm install failed'; exit 1 }
npm run build 2>&1 | Out-Null
if (Test-Path 'dist\index.js') { Ok 'server built: dist\index.js' } else { Bad 'build produced no dist\index.js'; exit 1 }
if (Test-Path 'dist\uxp\deepartisan-ps-bridge.ccx') { Ok 'UXP plugin packed: dist\uxp\deepartisan-ps-bridge.ccx' }

Write-Host "`nLive check against Photoshop`n-----------------------------------------------"
if (-not (Get-Process -Name 'Photoshop' -ErrorAction SilentlyContinue)) {
  Warn 'Photoshop is not running - skipping the live check (start it and run .\install.ps1 again)'
} else {
  $env:PS_MCP_UXP = '1'
  $out = & $NodeBin "$Here\tools\selftest.mjs" 2>$null | Out-String
  if ($out -match '"ok":\s*true') {
    $v = [regex]::Match($out, '"version":\s*"([^"]*)"').Groups[1].Value
    Ok "Photoshop answers: $v"
    if ($out -match '"uxp":\s*"ok"') { Ok 'UXP bridge: plugin is polling' } else { Warn 'UXP bridge: plugin not seen (optional - README -> The UXP bridge)' }
  } else { Bad 'Photoshop did not answer'; Write-Host $out }
}

$entry = "$Here\dist\index.js"
$serverJson = @"
{
      "command": "$($NodeBin -replace '\\', '\\')",
      "args": ["$($entry -replace '\\', '\\')"],
      "env": { "PS_MCP_FACADE": "1", "PS_MCP_UXP": "1" }
    }
"@
Write-Host "`nConnect`n-----------------------------------------------"
function Write-ClientConfig($file, $label) {
  if (-not (Ask "Add the server to $label ($file)?")) { return }
  $dir = Split-Path -Parent $file
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  if (Test-Path $file) { Copy-Item $file "$file.bak-$(Get-Date -Format yyyyMMdd-HHmmss)" }
  $js = @'
const fs = require('fs'); const [file, node, entry] = process.argv.slice(2);
let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
cfg.mcpServers = cfg.mcpServers || {};
cfg.mcpServers.photoshop = { command: node, args: [entry], env: { PS_MCP_FACADE: '1', PS_MCP_UXP: '1' } };
fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
'@
  $tmp = Join-Path $env:TEMP 'psmcp-write-config.js'
  Set-Content -Path $tmp -Value $js -Encoding UTF8
  & $NodeBin $tmp $file $NodeBin $entry
  Ok "$label`: mcpServers.photoshop written (restart $label)"
}
if ($NoConfig) {
  Write-Host "Add to your client's MCP config:`n`n  `"mcpServers`": { `"photoshop`": $serverJson }`n"
} else {
  Write-ClientConfig "$env:APPDATA\Claude\claude_desktop_config.json" 'Claude Desktop'
  Write-ClientConfig "$env:USERPROFILE\.cursor\mcp.json" 'Cursor'
  Write-ClientConfig "$env:USERPROFILE\.gemini\config\mcp_config.json" 'Google Antigravity'
  Write-Host ""
  Write-Host "Other clients: `"mcpServers`": { `"photoshop`": $serverJson }"
}
Write-Host "`nStart with a copy of a real document: the agent edits what is open. The optional UXP panel plugin"
Write-Host "(dist\uxp\deepartisan-ps-bridge.ccx) keeps reads, save and export working while Photoshop is modal.`n"
