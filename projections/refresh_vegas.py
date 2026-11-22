"""Refresh and publish weekly Vegas data without running product QA.

Run every two hours through Windows Task Scheduler. Existing scoring stays unchanged.
"""
import datetime as dt
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / ".agents/artifacts/vegas-refresh"
TARGET = "site/data/weekly-rankings.js"


def run(*args, capture=False):
    return subprocess.run(args, cwd=ROOT, check=True, timeout=1800,
                          text=True, encoding="utf-8", errors="replace",
                          stdout=subprocess.PIPE if capture else None).stdout


def main():
    STATE.mkdir(parents=True, exist_ok=True)
    # ponytail: one local writer; the existing deployment command also locks its bundle.
    with (STATE / "owner.lock").open("a+b") as lock:
        import msvcrt
        lock.seek(0)
        if not lock.read(1):
            lock.write(b"0")
            lock.flush()
        lock.seek(0)
        msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        if run("git", "branch", "--show-current", capture=True).strip() != "main":
            raise RuntimeError("Vegas refresh requires the owning checkout on main")
        if run("git", "diff", "--cached", "--name-only", capture=True).strip():
            raise RuntimeError("Another writer has staged files; refresh stopped")
        if run("git", "status", "--porcelain", "--", TARGET, capture=True).strip():
            raise RuntimeError("Weekly rankings have unpublished edits; refresh stopped")
        with (STATE / "run.log").open("w", encoding="utf-8") as log:
            subprocess.run([sys.executable, "-u", "projections/build_weekly_rankings.py"],
                           cwd=ROOT, stdout=log, stderr=subprocess.STDOUT,
                           check=True, timeout=1200)
        run("git", "add", "--", TARGET)
        staged = run("git", "diff", "--cached", "--name-only", capture=True).splitlines()
        if any(path != TARGET for path in staged):
            raise RuntimeError("Another writer staged files during refresh; publish stopped")
        if run("git", "diff", "--cached", "--name-only", capture=True).strip():
            run("git", "commit", "-m", "Refresh current week Vegas player projections", "--", TARGET)
        run("git", "push", "origin", "main")
        revision = run("git", "rev-parse", "HEAD", capture=True).strip()
        evidence = STATE / dt.datetime.now().strftime("deploy-%Y%m%d-%H%M%S")
        run("powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
            str(ROOT.parent / ".agents/scripts/deploy-phone-apps.ps1"),
            "-Deploy", "-FantasyFootballOnly", "-FantasyFootballRef", revision,
            "-EvidenceDir", str(evidence))
        (STATE / "status.json").write_text(json.dumps({
            "status": "deployed", "completed": dt.datetime.now(dt.timezone.utc).isoformat(),
            "commit": revision, "evidence": str(evidence)}, indent=2), encoding="utf-8")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        STATE.mkdir(parents=True, exist_ok=True)
        (STATE / "status.json").write_text(json.dumps({
            "status": "failed", "time": dt.datetime.now(dt.timezone.utc).isoformat(),
            "error": str(exc)}, indent=2), encoding="utf-8")
        raise
