"""Fetch the sportsdataverse ncaa_mfb_* release files (stats.ncaa.org, FBS + FCS, 2013+) to the lane
scratch dir. Plain GETs of public release assets: no key, no account. Lane data prototype only;
nothing here touches the shared store.

    python projections/lanes/data/fetch_ncaa_mfb.py [tag ...]
"""
import hashlib
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

OUT = pathlib.Path(os.environ.get("LANE_DATA", r"C:\Users\TrevorWhite\.claude\jobs\15921b94\tmp\lane-data")) / "ncaa"
BASE = "https://github.com/sportsdataverse/sportsdataverse-data/releases/download"
TAGS = sys.argv[1:] or ["ncaa_mfb_player_stats", "ncaa_mfb_rosters", "ncaa_mfb_teams", "ncaa_mfb_schedule"]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    man = {}
    for tag in TAGS:
        for y in range(2013, 2027):
            name = f"{tag}_{y}.parquet"
            p = OUT / name
            for _ in range(4):   # .part then rename: an interrupted download never looks complete
                if p.exists():
                    break
                try:
                    urllib.request.urlretrieve(f"{BASE}/{tag}/{name}", p.with_suffix(".part"))
                    p.with_suffix(".part").replace(p)
                except (urllib.error.URLError, OSError) as ex:
                    print("retry", name, ex)
            if not p.exists():
                raise SystemExit(f"could not fetch {name}")
            man[f"{tag}/{name}"] = {"url": f"{BASE}/{tag}/{name}", "bytes": p.stat().st_size,
                                    "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}
            print(name, p.stat().st_size)
    (OUT / "manifest.json").write_text(json.dumps(man, indent=1))


if __name__ == "__main__":
    main()
