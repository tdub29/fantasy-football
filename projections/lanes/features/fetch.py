"""Features lane: fetch the two candidate sportsdataverse-data families into the lane scratch dir.

Plain GETs of public release assets (no key). Files land in $LANE_DL (default: job tmp lane-features/dl).
Each file's sha256 and retrieval time go to manifest.json beside them.

    python projections/lanes/features/fetch.py
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import pathlib
import urllib.request

SDV = "https://github.com/sportsdataverse/sportsdataverse-data/releases/download"
DL = pathlib.Path(os.environ.get("LANE_DL", r"C:\Users\TrevorWhite\.claude\jobs\15921b94\tmp\lane-features\dl"))
FILES = ([("espn_cfb_adv_receiving", f"adv_receiving_{y}.parquet") for y in range(2004, 2027)]
         + [("cfb_team_talent", f"cfb_team_talent_{y}.parquet") for y in range(2005, 2027)]
         # the store's recruits start at 2004; the 4-class competition window for seasons 2005-2006 needs 2002-2003
         + [("cfb_recruits", f"cfb_recruits_{y}.parquet") for y in (2002, 2003)])


def main():
    DL.mkdir(parents=True, exist_ok=True)
    man_p = DL / "manifest.json"
    man = json.loads(man_p.read_text()) if man_p.exists() else {}
    for tag, name in FILES:
        p = DL / name
        if not p.exists():
            with urllib.request.urlopen(f"{SDV}/{tag}/{name}", timeout=120) as r:
                p.write_bytes(r.read())
            man[name] = {"url": f"{SDV}/{tag}/{name}", "sha256": hashlib.sha256(p.read_bytes()).hexdigest(),
                         "bytes": p.stat().st_size, "retrieved_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                         "licence": "sportsdataverse-data repo MIT (README badge CC BY 4.0); ESPN/247 source data under their terms"}
            print("got", name, p.stat().st_size)
    man_p.write_text(json.dumps(man, indent=1))


if __name__ == "__main__":
    main()
