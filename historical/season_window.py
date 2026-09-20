"""Which seasons on disk are finished enough to make a season-level claim about.

The nflverse weekly file for the season being played exists from week 1, and
every builder here globs `player_stats/week_*.csv` with no upper bound. That is
correct for anything keyed by week, and wrong for anything that states a fact
about a whole season. One week of 2026 makes SF's primary passer Mac Jones, so
the player card reads NEW QB, was Brock Purdy, which describes a start Purdy
missed rather than a job he lost. Career availability is worse: a season in
progress adds a full 17 games of potential against the 1 that has been played,
so every active player's availability percentage drops at once.

So a season-level aggregate iterates `completed_week_files()`; a week-level one
keeps the plain glob. `build_opportunity.build_turnover` deliberately reads the
in-flight season and labels the row `basis=roster` rather than excluding it,
because who is on this team now is exactly the question it answers.

    python season_window.py        # self-check
"""
from __future__ import annotations

import csv
from pathlib import Path

ROOT = Path(__file__).parent

# Eight weeks is a little under half a season. Below it, a rate read off the
# season is a small-sample number wearing a season label.
INFLIGHT_WEEK_FLOOR = 8


def weeks_on_disk(season: int, stats_dir: Path | None = None) -> int:
    """Distinct REG weeks present for a season. 0 when the file is absent."""
    f = (stats_dir or (ROOT / "player_stats")) / f"week_{season}.csv"
    if not f.exists():
        return 0
    weeks = set()
    with open(f, encoding="utf-8") as fin:
        for r in csv.DictReader(fin):
            if r.get("season_type") == "REG" and r.get("week"):
                weeks.add(r["week"])
    return len(weeks)


def _season_of(path: Path) -> int | None:
    try:
        return int(path.stem.replace("week_", "").replace("_derived", ""))
    except ValueError:
        return None


def newest_season(stats_dir: Path | None = None) -> int | None:
    d = stats_dir or (ROOT / "player_stats")
    years = [y for y in (_season_of(f) for f in d.glob("week_*.csv")) if y is not None]
    return max(years) if years else None


def is_inflight(season: int, stats_dir: Path | None = None) -> bool:
    """Being played right now, as opposed to merely short.

    The week count alone is not the test. A strike year, or an old file that
    was only ever partially published, is short and finished, and excluding it
    would quietly drop real history. Only the newest season on disk can be the
    one in progress.
    """
    if season != newest_season(stats_dir):
        return False
    return 0 < weeks_on_disk(season, stats_dir) < INFLIGHT_WEEK_FLOOR


def completed_week_files(stats_dir: Path | None = None, min_season: int = 2014):
    """Yield (season, path) for weekly files complete enough to aggregate.

    Same order as `sorted(dir.glob("week_*.csv"))`, minus the in-flight season
    and minus anything before `min_season`, which every caller already skipped
    with its own `if yr < 2014: continue`.
    """
    d = stats_dir or (ROOT / "player_stats")
    for f in sorted(d.glob("week_*.csv")):
        yr = _season_of(f)
        if yr is None or yr < min_season:
            continue
        if is_inflight(yr, d):
            continue
        yield yr, f


def _selftest() -> None:
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        d = Path(td)
        cols = "season_type,week,player_id\n"

        def write(year, weeks, kind="REG"):
            body = "".join(f"{kind},{w},a\n" for w in weeks)
            (d / f"week_{year}.csv").write_text(cols + body, encoding="utf-8")

        write(2013, [1])                  # short and finished
        write(2025, range(1, 18))         # a full season
        write(2026, [1])                  # in flight

        assert weeks_on_disk(2025, d) == 17, weeks_on_disk(2025, d)
        assert weeks_on_disk(2026, d) == 1
        assert weeks_on_disk(1999, d) == 0
        assert newest_season(d) == 2026
        assert not is_inflight(2025, d)
        assert is_inflight(2026, d)
        assert not is_inflight(1999, d), "absent is not in flight"
        assert not is_inflight(2013, d), "only the newest season can be in progress"

        assert [yr for yr, _ in completed_week_files(d)] == [2025]
        assert [yr for yr, _ in completed_week_files(d, min_season=2013)] == [2013, 2025]

        # the floor is a boundary, so test both sides of it
        write(2027, range(1, INFLIGHT_WEEK_FLOOR + 1))
        assert not is_inflight(2027, d), "a season at the floor is aggregatable"
        assert not is_inflight(2026, d), "2026 is no longer the newest file on disk"
        write(2028, range(1, INFLIGHT_WEEK_FLOOR))
        assert is_inflight(2028, d), "one week under the floor is in flight"

        # POST rows must not be mistaken for regular-season weeks
        write(2029, range(1, 5), kind="POST")
        assert weeks_on_disk(2029, d) == 0
        assert not is_inflight(2029, d), "zero REG weeks reads as absent, not in flight"
    print("season_window selftest ok")


if __name__ == "__main__":
    _selftest()
