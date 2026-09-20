# Proves refresh.ps1's test loop survives a failing test and NAMES it, instead of dying on the
# PowerShell 5.1 native-stderr trap. Runs offline in about a second and creates nothing permanent.
#
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File .\test-refresh-testloop.ps1
$ErrorActionPreference = 'Stop'
$fail = 0
$tmp = Join-Path $env:TEMP "ff-testloop-$PID"
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
try {
  # Two fakes: one passes, one throws a node AssertionError on stderr then exits 1.
  Set-Content -LiteralPath (Join-Path $tmp 'good.test.js') -Encoding utf8 -Value 'console.log("ok");'
  Set-Content -LiteralPath (Join-Path $tmp 'bad.test.js')  -Encoding utf8 -Value @'
const assert = require("node:assert/strict");
assert(false, "owned% vs projected points correlation: got 0.77, doctrine says 0.88 +/- 0.1");
'@

  # --- the pre-fix shape: `*> $null` under 'Stop' ---
  $preAborted = $false
  $seen = @()
  try {
    foreach ($t in 'good','bad','good') {
      node (Join-Path $tmp "$t.test.js") *> $null
      $seen += $t
    }
  } catch { $preAborted = $true }
  if (-not $preAborted) {
    Write-Host "note  pre-fix shape did not abort here (saw $($seen.Count)/3); the trap is version sensitive" -ForegroundColor Yellow
  } else {
    Write-Host "ok    pre-fix shape aborts the loop at the failing test (saw $($seen.Count)/3)" -ForegroundColor Green
  }

  # --- the fixed shape: capture stderr, drop to Continue, collect every failure ---
  $failed = @(); $failOut = @{}; $ran = 0
  $prevEAP = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  foreach ($t in 'good','bad','good') {
    $out = & node (Join-Path $tmp "$t.test.js") 2>&1 | Out-String
    $ran++
    if ($LASTEXITCODE -ne 0) { $failed += $t; $failOut[$t] = $out }
  }
  $ErrorActionPreference = $prevEAP

  if ($ran -ne 3) { Write-Host "FAIL fixed shape ran $ran of 3 tests" -ForegroundColor Red; $fail++ }
  else { Write-Host "ok    fixed shape runs all 3 tests past the failure" -ForegroundColor Green }

  if ($failed.Count -ne 1 -or $failed[0] -ne 'bad') { Write-Host "FAIL failures collected: $($failed -join ',')" -ForegroundColor Red; $fail++ }
  else { Write-Host "ok    the failing test is named ('bad')" -ForegroundColor Green }

  $why = ($failOut['bad'] -split "`r?`n" | Where-Object { $_ -match 'AssertionError|Error:|doctrine says' } | Select-Object -First 1)
  if (-not $why) { Write-Host "FAIL no decisive line extracted from the failure output" -ForegroundColor Red; $fail++ }
  else { Write-Host "ok    decisive line extracted: $($why.Trim().Substring(0, [Math]::Min(60, $why.Trim().Length)))..." -ForegroundColor Green }

  # refresh.ps1 must still carry the fix.
  $src = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'refresh.ps1')
  if ($src -match 'node "site/js/\$t\.test\.js" \*> \$null') { Write-Host "FAIL refresh.ps1 went back to `*> `$null on a native command" -ForegroundColor Red; $fail++ }
  else { Write-Host "ok    refresh.ps1 no longer redirects node's stderr" -ForegroundColor Green }
  if ($src -notmatch '\$failOut\[\$t\]') { Write-Host "FAIL refresh.ps1 no longer captures per-test output" -ForegroundColor Red; $fail++ }
  else { Write-Host "ok    refresh.ps1 captures per-test output for the report" -ForegroundColor Green }
}
finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -Confirm:$false -ErrorAction SilentlyContinue
}

if ($fail) { Write-Host "$fail assertion(s) failed" -ForegroundColor Red; exit 1 }
Write-Host 'test-refresh-testloop: all assertions pass' -ForegroundColor Green
