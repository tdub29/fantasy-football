"""Run the existing refresh once, with compact status and truthful failure exit.

Use this command at the coordinator's safe checkpoint, never alongside an
existing refresh. No cache skips are added to live sources or scientific fits.
    python projections/analysis_refresh.py --quiet
    python projections/analysis_refresh.py --core --quiet
Full logs/status live in .agents/artifacts/analysis-refresh/<run-id>/.
"""
import argparse
import contextlib
import datetime as dt
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import uuid

import build_all as pipeline

# kicker-analysis writes the site board only where it is told (predict_week.py --site-out or
# KICKER_SITE_JS). build_all passes no flag, so without this the step passes and kickers.js
# silently stays on last week.
os.environ.setdefault("KICKER_SITE_JS", str(Path(__file__).resolve().parents[1] / "site" / "data" / "kickers.js"))


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n",
                                         dir=path.parent, delete=False) as output:
            temporary = Path(output.name)
            json.dump(value, output, ensure_ascii=False, allow_nan=False, indent=2)
            output.flush()
            os.fsync(output.fileno())
        # Windows: a reader holding status.json open (dashboard, indexer, AV) makes the
        # replace fail with WinError 5 for a moment. Retry briefly before giving up.
        for attempt in range(20):
            try:
                os.replace(temporary, path)
                break
            except PermissionError:
                if attempt == 19:
                    raise
                time.sleep(0.25)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


@contextlib.contextmanager
def one_refresh(directory):
    directory.mkdir(parents=True, exist_ok=True)
    handle = (directory / "owner.lock").open("a+b")
    try:
        handle.seek(0, os.SEEK_END)
        if not handle.tell():
            handle.write(b"0")
            handle.flush()
        handle.seek(0)
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            raise RefreshBusy("Existing adapter refresh owns this project; no duplicate") from exc
        yield
    finally:
        handle.close()  # OS releases the lock; no stale-age cleanup or force flag.


class RefreshBusy(RuntimeError):
    pass


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--core", action="store_true")
    parser.add_argument("--stamp-only", action="store_true")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args(argv)
    directory = pipeline.ROOT / ".agents" / "artifacts" / "analysis-refresh"
    run_id = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    run_dir = directory / run_id
    status_path = run_dir / "status.json"
    native_run, native_argv = pipeline.run, sys.argv
    state = {"run_id": run_id, "state": "running", "results": [],
             "validation_status": "not_evaluated_by_adapter",
             "source_policy": "native freshness and scientific rules unchanged"}

    def recorded_run(label, script, timeout=600, args=()):
        index = len(state["results"]) + 1
        state["current_step"] = {"index": index, "label": label}
        atomic_json(status_path, state)
        output = io.StringIO()
        code_hash, hash_error = None, None
        try:
            if script.is_file():
                code_hash = hashlib.sha256(script.read_bytes()).hexdigest()
        except OSError as exc:
            hash_error = str(exc)[:300]  # Diagnostics must not replace the native execution result.
        with contextlib.redirect_stdout(output):
            result = native_run(label, script, timeout=timeout, args=args)
        log_path = run_dir / f"{index:03d}-{script.stem}.log"
        log_path.write_bytes(output.getvalue().encode("utf-8"))
        # Native run already bounds child stdout; this log preserves its original output.
        if not args_outer.quiet:
            print(output.getvalue(), end="")
        result = {**result, "args": list(args), "timeout_seconds": timeout,
                  "code_sha256": code_hash, "log": str(log_path)}
        if hash_error is not None:
            result["code_hash_error"] = hash_error
        state["results"].append(result)
        state.pop("current_step", None)
        atomic_json(status_path, state)
        return result

    args_outer = args
    try:
        with one_refresh(directory):
            run_dir.mkdir()
            atomic_json(status_path, state)
            pipeline.run = recorded_run
            sys.argv = [str(Path(pipeline.__file__))]
            if args.core:
                sys.argv.append("--core")
            if args.stamp_only:
                sys.argv.append("--stamp-only")
            native_output = io.StringIO()
            with contextlib.redirect_stdout(native_output):
                native_result = pipeline.main()
            (run_dir / "pipeline.log").write_bytes(native_output.getvalue().encode("utf-8"))
            if not args.quiet:
                print(native_output.getvalue(), end="")
            state["failed"] = sum(not row.get("ok") for row in state["results"])
            state["completed"] = len(state["results"])
            state["state"] = "failed" if state["failed"] or native_result not in (None, 0) else "completed"
            state["finished_utc"] = dt.datetime.now(dt.timezone.utc).isoformat()
            atomic_json(status_path, state)
    except RefreshBusy as exc:
        print(json.dumps({"state": "not_started", "error": str(exc)}))
        return 2
    except Exception as exc:
        # Preserve last checkpoint on write failure; no denied-write retry or job replacement.
        print(json.dumps({"state": "failed", "error": str(exc), "report": str(status_path),
                          "report_is_checkpoint": True}))
        return 1
    finally:
        pipeline.run, sys.argv = native_run, native_argv
    print(json.dumps({"state": state["state"], "run_id": run_id, "completed": state["completed"],
                      "failed": state["failed"], "report": str(status_path)}), flush=True)
    return 0 if state["state"] == "completed" else 1


if __name__ == "__main__":
    sys.exit(main())
