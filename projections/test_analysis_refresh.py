"""Offline adapter checks, using the real native runner on temporary scripts only."""
import contextlib
import io
import json
from pathlib import Path
import tempfile
from unittest.mock import patch

import analysis_refresh as adapter


def invoke(args):
    stdout = io.StringIO()
    with contextlib.redirect_stdout(stdout):
        code = adapter.main(args)
    return code, json.loads(stdout.getvalue().strip().splitlines()[-1]), stdout.getvalue()


def checks():
    pipeline = adapter.pipeline
    with tempfile.TemporaryDirectory(prefix="analysis-refresh-check-") as folder:
        root = Path(folder)
        pipeline.ROOT = root
        pipeline.SITE_DATA = root / "data"
        pipeline.SITE_DATA.mkdir()
        pipeline.TRACKED = ["fixture.js"]
        (pipeline.SITE_DATA / "fixture.js").write_bytes(b"window.FIXTURE={};")
        okay, bad, slow = [root / (name + ".py") for name in ("okay", "bad", "slow")]
        okay.write_bytes(b'import sys\nprint("okay",*sys.argv[1:])\n')
        bad.write_bytes(b'import sys\nprint("bad source",file=sys.stderr)\nsys.exit(7)\n')
        slow.write_bytes(b'import time\ntime.sleep(20)\n')
        pipeline.STEPS = [("okay", okay, True, ["seed=3"]), ("bad", bad, True),
                          ("slow", slow, True, [], .15), ("missing", root / "missing.py", True)]
        original_run = pipeline.run
        code, summary, output = invoke(["--quiet"])
        assert code == 1 and summary["failed"] == 3 and summary["completed"] == 4
        assert len(output.strip().splitlines()) == 1
        state = json.loads(Path(summary["report"]).read_text(encoding="utf-8"))
        assert [row["label"] for row in state["results"]] == ["okay", "bad", "slow", "missing"]
        assert state["results"][0]["args"] == ["seed=3"] and state["results"][0]["code_sha256"]
        assert "seed=3" in Path(state["results"][0]["log"]).read_text(encoding="utf-8")
        assert state["results"][2]["note"] == "timeout" and state["results"][3]["note"] == "missing"
        assert state["validation_status"] == "not_evaluated_by_adapter"
        assert (pipeline.SITE_DATA / "build-info.js").is_file()
        assert pipeline.run is original_run
        pipeline.STEPS = [("okay", okay, True), ("optional bad", bad, False)]
        code, summary, _ = invoke(["--core", "--quiet"])
        assert code == 0 and summary["completed"] == 1
        code, summary, _ = invoke(["--stamp-only", "--quiet"])
        assert code == 0 and summary["completed"] == 0
        with adapter.one_refresh(root / ".agents/artifacts/analysis-refresh"):
            code, summary, _ = invoke(["--quiet"])
            assert code == 2 and summary["state"] == "not_started"
        code, _, _ = invoke(["--core", "--quiet"])
        assert code == 0
        native_read = Path.read_bytes
        def denied_metadata(path):
            if path == okay:
                raise PermissionError("Injected optional-hash read failure")
            return native_read(path)
        (pipeline.SITE_DATA / "build-info.js").unlink()  # Prove this invocation stamps again.
        with patch.object(Path, "read_bytes", denied_metadata):
            code, summary, _ = invoke(["--core", "--quiet"])
        assert code == 0 and summary["completed"] == 1
        state = json.loads(Path(summary["report"]).read_text(encoding="utf-8"))
        assert state["results"][0]["code_sha256"] is None
        assert "Injected" in state["results"][0]["code_hash_error"]
        assert (pipeline.SITE_DATA / "build-info.js").is_file()
    print("Offline refresh adapter checks passed; no live data/model run")


if __name__ == "__main__":
    checks()
