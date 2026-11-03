# Scheduled Fantasy Football refresh: data, checks, deploy, commit. No Claude involved.
# Registered in Task Scheduler as "FF data refresh (Tue|Thu|Sun)". Logs go to
# .agents\artifacts\scheduled-refresh\<timestamp>.log; a failed gate skips the deploy.
#   powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\run-ff-refresh.ps1"
$ErrorActionPreference = 'Continue'
$ff = Split-Path -Parent $PSScriptRoot
$bp = Split-Path -Parent $ff
$logDir = Join-Path $ff '.agents\artifacts\scheduled-refresh'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir ((Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
function Log([string]$m) { "$(Get-Date -Format 's') $m" | Tee-Object -FilePath $log -Append }
$env:PYTHONUTF8 = '1'; $env:OMP_NUM_THREADS = '1'

# 1. Full refresh. It exits nonzero when any one source is missing (Gibbs not posted yet is
#    normal), so the site checks below are the gate, not this exit code.
Set-Location $ff
Log 'refresh: start'
python projections/analysis_refresh.py --quiet *>> $log
Log "refresh: exit $LASTEXITCODE"

# 2. Site checks. Ship at 95% or better: one or two load-timing flakes or an unposted expert
#    board are routine; a real break fails dozens of features at once.
Set-Location $bp
$out = python .agents/scripts/verify-app.py 'Fantasy Football' 2>&1 | Out-String
$out | Out-File -FilePath $log -Append -Encoding utf8
$m = [regex]::Match($out, '(\d+)/(\d+) features pass')
if (-not $m.Success) { Log 'checks: no result, deploy skipped'; exit 1 }
$pass = [int]$m.Groups[1].Value; $total = [int]$m.Groups[2].Value
Log "checks: $pass/$total"
if ($pass -lt [math]::Ceiling($total * 0.95)) { Log 'checks: below 95%, deploy skipped'; exit 1 }

# 3. Deploy.
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $bp '.agents\scripts\deploy-phone-apps.ps1') -Deploy *>> $log
if ($LASTEXITCODE -ne 0) { Log "deploy: failed ($LASTEXITCODE)"; exit 1 }
Log 'deploy: done'

# 4. Commit the rebuilt data, only on main so another session's branch is never written to.
Set-Location $ff
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne 'main') { Log "git: on '$branch', not main; commit skipped"; exit 0 }
git add -u site/data projections *>> $log
git reset -q projections/analysis_refresh.py projections/test_analysis_refresh.py *>> $log
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) { Log 'git: nothing to commit'; exit 0 }
git commit -q -m "data: scheduled refresh $(Get-Date -Format 'yyyy-MM-dd HH:mm')" *>> $log
git pull -q --no-rebase --no-edit *>> $log
git push -q *>> $log
Log "git: push exit $LASTEXITCODE"
