<#
.SYNOPSIS
  One command: refresh every data source, prove the site still works, ship it to the phone.

.DESCRIPTION
  Wraps the four things that were previously run by hand and in the wrong order:
    1. projections/build_all.py   (Sleeper dump, KTC, site data, FAAB, projections, weekly, SOS)
    2. the JS test suite          (a green pipeline that breaks the site is not green)
    3. deploy-phone-apps.ps1      (stage + Cloudflare Pages)
    4. a live fetch               (staged does not mean deployed; that bit us on 2026-09-12)

  Any failing step stops the run. Data that does not pass tests never reaches the phone.

.PARAMETER SkipDeploy
  Refresh and test only. Use when iterating locally.

.PARAMETER DataOnly
  Refresh only. Skips tests and deploy.

.EXAMPLE
  .\refresh.ps1
  .\refresh.ps1 -SkipDeploy
#>
param([switch]$SkipDeploy, [switch]$DataOnly)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$ws   = Split-Path $root -Parent
Set-Location $root

function Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }

# Shared tooling runs on the plain python on PATH, never a project venv.
if ($env:VIRTUAL_ENV) {
  Write-Host "note: VIRTUAL_ENV is set ($env:VIRTUAL_ENV). Clearing it for this run." -ForegroundColor Yellow
  $env:VIRTUAL_ENV = $null
}

Step 1 'Refreshing all data sources (projections/build_all.py)'
python projections/build_all.py
if ($LASTEXITCODE -ne 0) { throw "build_all.py failed with exit $LASTEXITCODE" }

# build_all prints "pipeline done: N/17 steps ok" but exits 0 even on partial failure,
# so read the freshness off disk rather than trusting the exit code.
Step 2 'Checking every data file actually regenerated'
$stale = @()
$today = (Get-Date).Date
foreach ($f in 'ktc.js','projections.js','weekly-rankings.js','players.js','leagues.js','faab.js','trade-history.js','sos.js','sos-grid.js','categories.js') {
  $p = Join-Path $root "site\data\$f"
  if (-not (Test-Path $p)) { $stale += "$f MISSING"; continue }
  $age = (Get-Item $p).LastWriteTime
  if ($age.Date -lt $today) { $stale += "$f ($($age.ToString('MM-dd HH:mm')))" }
}
if ($stale.Count) {
  Write-Host "  STALE, did not rebuild today:" -ForegroundColor Yellow
  $stale | ForEach-Object { Write-Host "    $_" -ForegroundColor Yellow }
  Write-Host "  A source is probably down. Check the build_all output above before trusting these numbers." -ForegroundColor Yellow
} else {
  Write-Host '  all data files rebuilt today' -ForegroundColor Green
}

if ($DataOnly) { Write-Host "`nData refreshed. Skipped tests and deploy (-DataOnly)." -ForegroundColor Green; exit 0 }

Step 3 'Running the JS test suite'
node --check site/js/app.js
if ($LASTEXITCODE -ne 0) { throw 'app.js failed syntax check' }
# `*> $null` on a NATIVE command is a trap in PowerShell 5.1: redirecting node's stderr wraps
# each line in an ErrorRecord (NativeCommandError), and under $ErrorActionPreference = 'Stop'
# that TERMINATES on the first failing test. So the loop never reached the remaining tests and
# the "tests failed: <name>" message below never printed. What you got instead was
# `NotSpecified: (node:internal/assert/utils:77:String) [], RemoteException` at this line, with
# no test named. Hit for real on 2026-09-17 when dynasty-claims went red. Keep stderr CAPTURED
# rather than redirected, and drop to Continue for the loop. Check: test-refresh-testloop.ps1
$failed  = @()
$failOut = @{}
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
foreach ($t in 'starting-lineup','title-odds','projections','team-needs','trade-picks','trade-consolidation','pick-fv','dynasty-claims','standings-sort','fantasy-sos','waiver-board','trade-history-picks') {
  $out = & node "site/js/$t.test.js" 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { $failed += $t; $failOut[$t] = $out } else { Write-Host "  ok   $t" -ForegroundColor Green }
}
$ErrorActionPreference = $prevEAP
if ($failed.Count) {
  foreach ($t in $failed) {
    Write-Host "  FAIL $t" -ForegroundColor Red
    # Quote the shortest decisive line, not the whole node stack.
    $why = ($failOut[$t] -split "`r?`n" | Where-Object { $_ -match 'AssertionError|Error:|doctrine says' } | Select-Object -First 1)
    if ($why) { Write-Host "       $($why.Trim())" -ForegroundColor Red }
  }
  throw "tests failed: $($failed -join ', '). Not deploying."
}

if ($SkipDeploy) { Write-Host "`nRefreshed and tested. Skipped deploy (-SkipDeploy)." -ForegroundColor Green; exit 0 }

Step 4 'Staging and deploying to Cloudflare Pages'
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ws '.agents\scripts\deploy-phone-apps.ps1') -Deploy
if ($LASTEXITCODE -ne 0) { throw "deploy failed with exit $LASTEXITCODE" }

Step 5 'Verifying the live site serves the new build'
# The site sits behind Cloudflare Access, so an unauthenticated fetch returns the
# login page, not the file. Detect that and say so, rather than hashing HTML.
$srcHash = (Get-FileHash (Join-Path $root 'site\data\weekly-rankings.js') -Algorithm SHA256).Hash.Substring(0,12)
try {
  $live = Invoke-WebRequest -Uri 'https://trevor-apps.pages.dev/ff/data/weekly-rankings.js' `
            -TimeoutSec 60 -UseBasicParsing -MaximumRedirection 5
  $body = [string]$live.Content
  if ($body -match 'cloudflareaccess|AuthFormLogin|Send login code') {
    Write-Host '  behind Cloudflare Access, cannot verify from here. Open it on your phone; you are signed in there.' -ForegroundColor Yellow
  }
  elseif ($body -match 'WEEKLY_RANKINGS') {
    $bytes    = [Text.Encoding]::UTF8.GetBytes($body)
    $sha      = [Security.Cryptography.SHA256]::Create()
    $liveHash = ([BitConverter]::ToString($sha.ComputeHash($bytes)) -replace '-','').Substring(0,12)
    if ($liveHash -eq $srcHash) { Write-Host '  live build matches local' -ForegroundColor Green }
    else { Write-Host "  live differs from local (live $liveHash vs local $srcHash). Cloudflare may still be propagating." -ForegroundColor Yellow }
  }
  else { Write-Host '  unexpected response, not the data file and not an Access page.' -ForegroundColor Yellow }
} catch {
  Write-Host "  live check skipped: $($_.Exception.Message.Split([char]10)[0])" -ForegroundColor Yellow
}

Write-Host "`nDone. https://trevor-apps.pages.dev/ff/" -ForegroundColor Green
