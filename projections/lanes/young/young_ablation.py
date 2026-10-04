"""Young lane leakage check (reported, not a candidate): the replay with `weight` removed from the
year-2 columns. Roster weight is his LAST listing (no historical vintage), two to four years after a
sophomore is served, so a pass that leans on it would be leaning on the future.

    PROSPECT_DB=<lane copy> python projections/lanes/young/young_ablation.py
"""
from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import young_replay as yr  # noqa: E402

_cols = yr.yl1_cols
yr.yl1_cols = lambda pos: [c for c in _cols(pos) if c != "weight"]
yr.OUT = yr.NOTES / "ablation-no-weight.json"
yr.yd.TMP = yr.yd.TMP / "ablation-no-weight"
yr.yd.TMP.mkdir(parents=True, exist_ok=True)

if __name__ == "__main__":
    yr.main()
