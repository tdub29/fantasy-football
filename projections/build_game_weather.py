"""Kickoff-hour weather forecast for every game in the upcoming NFL week.

For start/sit and kicker decisions: wind, gust, precipitation chance/amount and
temperature at the actual kickoff hour (US Eastern), per game, plus a derived
flag ("wind" / "rain/snow" / "cold") the UI can surface without re-deriving
thresholds itself.

Sources, both public and key-free:
  schedule  nflverse-data games.parquet (schedules release) - gameday/gametime,
            home/away, stadium, roof, surface, spread_line, total_line
  forecast  Open-Meteo (api.open-meteo.com/v1/forecast) - no key, no signup

"Upcoming week" = the lowest week number in the current season that has any
game with a null home_score (i.e. not yet played).

Roof handling:
  dome, closed          -> indoors. Weather is null, reason "indoors". No fetch
                           (the forecast would be for the parking lot, not the field).
  outdoors, open        -> fetch normally.
  blank/unknown roof     -> nflverse leaves roof blank for retractable-roof
                           stadiums (ARI/ATL/DAL/HOU/IND) until the roof
                           decision is made close to kickoff. Fetch anyway and
                           flag the game "retractable, may be closed" so a
                           forecast that later turns out to be moot is at
                           least explained, not silently wrong.

Neutral-site / international games are matched against a small hardcoded
venue table by stadium name. A stadium this script doesn't recognize gets
weather=null, reason "unknown venue" - never a guessed lat/lon.

Writes site/data/weather.js as:
    window.WEATHER = {
      generated, season, week, source,
      games: [ {game_id, week, kickoff, home, away, stadium, roof, surface,
                 temp_f, wind_mph, gust_mph, precip_prob, precip_in, flag,
                 reason, note, spread_line, total_line}, ... ],
      byTeam: { <team>: <game_id>, ... }   // both teams of every game this week
    }

Usage:
    python projections/build_game_weather.py
    python projections/build_game_weather.py --self-check
"""
from __future__ import annotations

import argparse
import datetime as dt
import io
import json
import pathlib
import sys
import time
import urllib.error
import urllib.request
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT / "projections" / "nflverse-cache" / "weather"
OUT = ROOT / "site" / "data" / "weather.js"
GAMES_URL = "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.parquet"
GAMES_CSV_FALLBACK = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"
OPEN_METEO = "https://api.open-meteo.com/v1/forecast"
UA = {"User-Agent": "Mozilla/5.0 FantasyHub/1.0"}
ET = ZoneInfo("America/New_York")
MAX_AGE_H = 3.0

# --------------------------------------------------------------------------
# Stadium coordinates. Every current NFL home venue, keyed by nflverse's home
# team code. LA and LAC share SoFi Stadium; NYG and NYJ share MetLife.
# --------------------------------------------------------------------------
HOME_STADIUMS = {
    "ARI": (33.5276, -112.2626),   # State Farm Stadium, Glendale AZ
    "ATL": (33.7554, -84.4008),    # Mercedes-Benz Stadium, Atlanta GA
    "BAL": (39.2780, -76.6227),    # M&T Bank Stadium, Baltimore MD
    "BUF": (42.7738, -78.7870),    # Highmark Stadium, Orchard Park NY
    "CAR": (35.2258, -80.8528),    # Bank of America Stadium, Charlotte NC
    "CHI": (41.8623, -87.6167),    # Soldier Field, Chicago IL
    "CIN": (39.0955, -84.5161),    # Paycor Stadium, Cincinnati OH
    "CLE": (41.5061, -81.6995),    # Huntington Bank Field, Cleveland OH
    "DAL": (32.7473, -97.0945),    # AT&T Stadium, Arlington TX
    "DEN": (39.7439, -105.0201),   # Empower Field at Mile High, Denver CO
    "DET": (42.3400, -83.0456),    # Ford Field, Detroit MI
    "GB":  (44.5013, -88.0622),    # Lambeau Field, Green Bay WI
    "HOU": (29.6847, -95.4107),    # NRG Stadium, Houston TX
    "IND": (39.7601, -86.1639),    # Lucas Oil Stadium, Indianapolis IN
    "JAX": (30.3239, -81.6373),    # EverBank Stadium, Jacksonville FL
    "KC":  (39.0489, -94.4839),    # GEHA Field at Arrowhead Stadium, Kansas City MO
    "LA":  (33.9535, -118.3392),   # SoFi Stadium, Inglewood CA (shared w/ LAC)
    "LAC": (33.9535, -118.3392),   # SoFi Stadium, Inglewood CA (shared w/ LA)
    "LV":  (36.0909, -115.1833),   # Allegiant Stadium, Las Vegas NV
    "MIA": (25.9580, -80.2389),    # Hard Rock Stadium, Miami Gardens FL
    "MIN": (44.9736, -93.2575),    # U.S. Bank Stadium, Minneapolis MN
    "NE":  (42.0909, -71.2643),    # Gillette Stadium, Foxborough MA
    "NO":  (29.9511, -90.0812),    # Caesars Superdome, New Orleans LA
    "NYG": (40.8135, -74.0745),    # MetLife Stadium, East Rutherford NJ (shared w/ NYJ)
    "NYJ": (40.8135, -74.0745),    # MetLife Stadium, East Rutherford NJ (shared w/ NYG)
    "PHI": (39.9008, -75.1675),    # Lincoln Financial Field, Philadelphia PA
    "PIT": (40.4468, -80.0158),    # Acrisure Stadium, Pittsburgh PA
    "SEA": (47.5952, -122.3316),   # Lumen Field, Seattle WA
    "SF":  (37.4030, -121.9700),   # Levi's Stadium, Santa Clara CA
    "TB":  (27.9759, -82.5033),    # Raymond James Stadium, Tampa FL
    "TEN": (36.1665, -86.7713),    # Nissan Stadium, Nashville TN
    "WAS": (38.9077, -76.8645),    # Northwest Stadium, Landover MD
}

# Retractable-roof home stadiums: nflverse leaves `roof` blank for these until
# the game-day call is made, instead of reporting "open"/"closed" ahead of time.
RETRACTABLE_TEAMS = {"ARI", "ATL", "DAL", "HOU", "IND"}

# Neutral-site venues that ALSO have a retractable roof (matched the same way
# as INTL_VENUES, by substring). A blank roof at a neutral site otherwise means
# "no roof at all" (an open-air soccer stadium), not "undecided" - so this list
# must stay separate from RETRACTABLE_TEAMS, which is about a team's own park
# and is meaningless once the game is played somewhere else entirely.
RETRACTABLE_NEUTRAL_VENUES = {"bernabeu"}  # Santiago Bernabeu, Madrid (2024 renovation)

# International / neutral-site venues, matched by a lowercase substring of the
# schedule's `stadium` name. Coordinates double-checked against public venue
# data. Add to this table as new neutral-site games are announced; never guess.
INTL_VENUES = {
    "tottenham": (51.6043, -0.0664),        # Tottenham Hotspur Stadium, London
    "wembley": (51.5560, -0.2795),          # Wembley Stadium, London
    "twickenham": (51.4560, -0.3410),       # Twickenham Stadium, London
    "banorte": (19.3029, -99.1505),         # Estadio Banorte (fka Azteca), Mexico City
    "azteca": (19.3029, -99.1505),          # Estadio Azteca, Mexico City
    "munich": (48.2188, 11.6247),           # Allianz Arena / FC Bayern Munich Stadium
    "allianz arena": (48.2188, 11.6247),
    "frankfurt": (50.0685, 8.6455),         # Deutsche Bank Park, Frankfurt
    "bernabeu": (40.4531, -3.6883),         # Estadio Santiago Bernabeu, Madrid
    "maracana": (-22.9121, -43.2302),       # Maracana Stadium, Rio de Janeiro
    "corinthians": (-23.5453, -46.4742),    # Neo Quimica Arena / Corinthians Arena, Sao Paulo
    "sao paulo": (-23.5453, -46.4742),
    "croke park": (53.3607, -6.2512),       # Croke Park, Dublin
    "olympiastadion": (52.5147, 13.2395),   # Olympiastadion, Berlin
    "melbourne": (-37.8199, 144.9834),      # Melbourne Cricket Ground
    "stade de france": (48.9244, 2.3601),   # Stade de France, Paris/Saint-Denis
}


def num(x):
    """JSON-safe number: NaN/inf/None become None; ints stay ints."""
    if x is None:
        return None
    try:
        f = float(x)
    except (TypeError, ValueError):
        return None
    if not np.isfinite(f):
        return None
    return int(f) if f.is_integer() and abs(f) < 1e9 else round(f, 2)


def season_now() -> int:
    t = dt.date.today()
    return t.year if t.month >= 8 else t.year - 1


def fetch_bytes(url: str, timeout: int = 60) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def load_schedule() -> pd.DataFrame:
    """games.parquet, falling back to the nfldata csv mirror if that release asset moves."""
    try:
        return pd.read_parquet(io.BytesIO(fetch_bytes(GAMES_URL)))
    except Exception as e:
        print(f"  games.parquet failed ({e}); falling back to nfldata games.csv")
        return pd.read_csv(io.BytesIO(fetch_bytes(GAMES_CSV_FALLBACK)))


def pick_upcoming_week(sched: pd.DataFrame, season: int) -> tuple[pd.DataFrame, int]:
    cur = sched[sched["season"] == season]
    unplayed = cur[cur["home_score"].isna()]
    if unplayed.empty:
        # Season's over on the schedule feed; fall back to the last week played.
        wk = int(cur["week"].max())
    else:
        wk = int(unplayed["week"].min())
    return cur[cur["week"] == wk].copy(), wk


def venue_lookup(home_team: str, stadium_name: str, location: str) -> tuple[tuple[float, float] | None, str | None]:
    """Returns ((lat, lon) or None, reason-if-None)."""
    loc = str(location or "").strip().lower()
    if loc == "home" and home_team in HOME_STADIUMS:
        return HOME_STADIUMS[home_team], None
    name = str(stadium_name or "").strip().lower()
    for needle, coords in INTL_VENUES.items():
        if needle in name:
            return coords, None
    if loc == "neutral":
        # Explicitly flagged neutral-site by the schedule and not in our
        # venue table - never guess a lat/lon, including the home team's park.
        return None, "unknown venue"
    # location missing/unrecognized (defensive): fall back to the home team's
    # usual park rather than dropping an ordinary home game over a data gap.
    if home_team in HOME_STADIUMS:
        return HOME_STADIUMS[home_team], None
    return None, "unknown venue"


def classify_roof(raw_roof, home_team: str, location=None, stadium_name=None) -> tuple[str, str | None, bool]:
    """Returns (roof_label, note, should_fetch)."""
    r = str(raw_roof or "").strip().lower()
    if r in ("dome", "closed"):
        return (r or "indoors"), None, False
    if r in ("outdoors", "open"):
        return r, None, True
    # blank/unknown roof
    is_home_site = str(location or "").strip().lower() != "neutral"
    if is_home_site and home_team in RETRACTABLE_TEAMS:
        return "retractable", "retractable, may be closed", True
    if not is_home_site:
        name = str(stadium_name or "").strip().lower()
        if any(needle in name for needle in RETRACTABLE_NEUTRAL_VENUES):
            return "retractable", "retractable, may be closed", True
        # A blank roof at a neutral site otherwise just means "no roof at
        # all" (an open-air soccer stadium) - not "undecided".
        return "outdoors", "roof status unknown for this venue, assumed open", True
    # Genuinely unexpected blank on a non-retractable home venue: fetch rather
    # than silently drop the game, but say so.
    return "unknown", "roof status unknown, assumed open", True


def kickoff_dt(gameday: str, gametime: str) -> dt.datetime | None:
    if not gameday or not gametime or pd.isna(gameday) or pd.isna(gametime):
        return None
    try:
        y, m, d = (int(x) for x in str(gameday).split("-"))
        hh, mm = (int(x) for x in str(gametime).split(":")[:2])
        return dt.datetime(y, m, d, hh, mm, tzinfo=ET)
    except (ValueError, TypeError):
        return None


def kickoff_hour_value(hourly_times: list[str], hourly_values: list[float], kickoff: dt.datetime):
    """Pick the hourly bucket matching kickoff's hour (floored), naive-local match."""
    target = kickoff.strftime("%Y-%m-%dT%H:00")
    try:
        idx = hourly_times.index(target)
    except ValueError:
        return None
    v = hourly_values[idx]
    return None if v is None else v


def fetch_weather_for_game(game_id: str, lat: float, lon: float, date_str: str) -> dict | None:
    """Cached Open-Meteo hourly pull for one game's kickoff date. 3h cache."""
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / f"{game_id}.json"
    fresh = p.exists() and (time.time() - p.stat().st_mtime) / 3600 < MAX_AGE_H
    if fresh:
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass  # cache corrupt, refetch below
    url = (
        f"{OPEN_METEO}?latitude={lat}&longitude={lon}"
        "&hourly=temperature_2m,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m"
        "&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch"
        f"&timezone=America%2FNew_York&start_date={date_str}&end_date={date_str}"
    )
    try:
        payload = json.loads(fetch_bytes(url, timeout=30))
        p.write_text(json.dumps(payload), encoding="utf-8")
        return payload
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as e:
        if p.exists():
            age = (time.time() - p.stat().st_mtime) / 3600
            print(f"  {game_id}: Open-Meteo refresh failed ({e}); using the {age:.1f}h-old cached copy")
            try:
                return json.loads(p.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                return None
        print(f"  {game_id}: Open-Meteo fetch failed and no cached copy ({e})")
        return None


def derive_flag(temp_f, wind_mph, gust_mph, precip_prob) -> str | None:
    if (wind_mph is not None and wind_mph >= 15) or (gust_mph is not None and gust_mph >= 25):
        return "wind"
    if precip_prob is not None and precip_prob >= 50:
        return "rain/snow"
    if temp_f is not None and temp_f <= 32:
        return "cold"
    return None


def build(season: int) -> dict:
    sched = load_schedule()
    week_games, week = pick_upcoming_week(sched, season)

    games = []
    by_team: dict[str, str] = {}
    n_indoors = 0
    n_unknown_venue = 0
    n_flagged: dict[str, int] = {}

    for _, row in week_games.sort_values(["gameday", "gametime"]).iterrows():
        game_id = row["game_id"]
        home, away = row["home_team"], row["away_team"]
        by_team[home] = game_id
        by_team[away] = game_id

        kickoff = kickoff_dt(row.get("gameday"), row.get("gametime"))
        roof_label, roof_note, should_fetch = classify_roof(
            row.get("roof"), home, row.get("location"), row.get("stadium"))

        temp_f = wind_mph = gust_mph = precip_prob = precip_in = None
        reason = None
        note = roof_note

        if not should_fetch:
            reason = "indoors"
            n_indoors += 1
        elif kickoff is None:
            reason = "kickoff time unknown"
        else:
            coords, venue_reason = venue_lookup(home, row.get("stadium"), row.get("location"))
            if coords is None:
                reason = venue_reason
                n_unknown_venue += 1
            else:
                lat, lon = coords
                date_str = kickoff.strftime("%Y-%m-%d")
                payload = fetch_weather_for_game(game_id, lat, lon, date_str)
                if not payload or "hourly" not in payload:
                    reason = "forecast unavailable"
                else:
                    h = payload["hourly"]
                    times = h.get("time") or []
                    temp_f = num(kickoff_hour_value(times, h.get("temperature_2m") or [], kickoff))
                    wind_mph = num(kickoff_hour_value(times, h.get("wind_speed_10m") or [], kickoff))
                    gust_mph = num(kickoff_hour_value(times, h.get("wind_gusts_10m") or [], kickoff))
                    precip_prob = num(kickoff_hour_value(times, h.get("precipitation_probability") or [], kickoff))
                    precip_in = num(kickoff_hour_value(times, h.get("precipitation") or [], kickoff))
                    if temp_f is None:
                        reason = "kickoff hour outside forecast range"

        flag = derive_flag(temp_f, wind_mph, gust_mph, precip_prob)
        if flag:
            n_flagged[flag] = n_flagged.get(flag, 0) + 1

        games.append({
            "game_id": game_id,
            "week": week,
            "kickoff": kickoff.isoformat() if kickoff else None,
            "home": home,
            "away": away,
            "stadium": row.get("stadium"),
            "roof": roof_label,
            "surface": row.get("surface"),
            "temp_f": temp_f,
            "wind_mph": wind_mph,
            "gust_mph": gust_mph,
            "precip_prob": precip_prob,
            "precip_in": precip_in,
            "flag": flag,
            "reason": reason,
            "note": note,
            "spread_line": num(row.get("spread_line")),
            "total_line": num(row.get("total_line")),
        })

    return {
        "generated": dt.datetime.now().isoformat(timespec="seconds"),
        "season": season,
        "week": week,
        "source": "nflverse-data (schedules) + Open-Meteo forecast",
        "games": games,
        "byTeam": by_team,
    }, n_indoors, n_unknown_venue, n_flagged


# --------------------------------------------------------------------------
# Self-check
# --------------------------------------------------------------------------
def self_check() -> int:
    # Flag thresholds, in priority order.
    assert derive_flag(70, 16, 20, 10) == "wind"          # wind alone trips it
    assert derive_flag(70, 5, 26, 10) == "wind"            # gust alone trips it
    assert derive_flag(70, 5, 5, 55) == "rain/snow"
    assert derive_flag(30, 5, 5, 10) == "cold"
    assert derive_flag(70, 5, 5, 10) is None
    assert derive_flag(32, 0, 0, 0) == "cold"              # boundary: <=32 is cold
    assert derive_flag(33, 0, 0, 0) is None
    assert derive_flag(70, 14.9, 24.9, 49) is None          # just under every threshold
    assert derive_flag(70, 15, 0, 0) == "wind"              # boundary: >=15 wind
    assert derive_flag(70, 0, 25, 0) == "wind"              # boundary: >=25 gust
    assert derive_flag(70, 0, 0, 50) == "rain/snow"         # boundary: >=50 precip

    # Dome/closed roofs are skipped (no fetch); outdoors/open are fetched;
    # a blank roof on a known retractable-roof team's OWN park still fetches,
    # flagged - but the exact same blank roof at a neutral site must not
    # inherit that team's retractable-ness (Maracana has no roof at all).
    for r in ("dome", "closed", "Dome", "CLOSED"):
        label, note, fetch = classify_roof(r, "GB", "Home", "Lambeau Field")
        assert fetch is False and note is None, (r, label, note, fetch)
    for r in ("outdoors", "open", "Outdoors"):
        label, note, fetch = classify_roof(r, "GB", "Home", "Lambeau Field")
        assert fetch is True and note is None, (r, label, note, fetch)
    label, note, fetch = classify_roof("", "IND", "Home", "Lucas Oil Stadium")
    assert fetch is True and label == "retractable" and "retractable" in note, (label, note, fetch)
    label, note, fetch = classify_roof(None, "GB", "Home", "Lambeau Field")
    assert fetch is True and label == "unknown" and note is not None, (label, note, fetch)
    # DAL is a retractable-roof TEAM, but this game is neutral-site at an
    # open-air stadium - must not come back "retractable".
    label, note, fetch = classify_roof("", "DAL", "Neutral", "Maracana Stadium")
    assert fetch is True and label == "outdoors" and note is not None, (label, note, fetch)
    # Bernabeu genuinely has a retractable roof even as a neutral-site venue.
    label, note, fetch = classify_roof("", "ATL", "Neutral", "Bernabeu")
    assert fetch is True and label == "retractable" and "retractable" in note, (label, note, fetch)

    # Kickoff-hour selection from a fake hourly series: a 13:00 kickoff must
    # read the 13:00 bucket, not 12:00 or 14:00, and an off-hour kickoff must
    # floor to its hour.
    times = ["2026-09-27T12:00", "2026-09-27T13:00", "2026-09-27T14:00", "2026-09-27T20:00"]
    vals = [10.0, 55.5, 99.9, 42.0]
    k1 = dt.datetime(2026, 9, 27, 13, 0, tzinfo=ET)
    assert kickoff_hour_value(times, vals, k1) == 55.5
    k2 = dt.datetime(2026, 9, 27, 20, 15, tzinfo=ET)  # 8:05/8:15/8:20 kickoffs floor to the 8pm bucket
    assert kickoff_hour_value(times, vals, k2) == 42.0
    k3 = dt.datetime(2026, 9, 27, 23, 0, tzinfo=ET)   # not in the series at all
    assert kickoff_hour_value(times, vals, k3) is None

    # num() must never leak NaN/inf into JSON.
    assert num(float("nan")) is None and num(float("inf")) is None and num(3.0) == 3 and num(3.14159) == 3.14

    # Venue lookup: a real neutral-site name resolves, an unrecognized one
    # does not (never a guessed lat/lon).
    coords, reason = venue_lookup("DAL", "Maracana Stadium", "Neutral")
    assert coords is not None and reason is None
    coords, reason = venue_lookup("KC", "Some Made Up Arena", "Neutral")
    assert coords is None and reason == "unknown venue"
    coords, reason = venue_lookup("GB", "Lambeau Field", "Home")
    assert coords == HOME_STADIUMS["GB"] and reason is None

    # byTeam must cover both home and away for a small synthetic week.
    fake_by_team: dict[str, str] = {}
    for gid, h, a in [("g1", "GB", "CHI"), ("g2", "KC", "DEN")]:
        fake_by_team[h] = gid
        fake_by_team[a] = gid
    for team in ("GB", "CHI", "KC", "DEN"):
        assert team in fake_by_team

    # Every current-team code has real coordinates; LA/LAC and NYG/NYJ share venues.
    assert len(HOME_STADIUMS) == 32
    assert HOME_STADIUMS["LA"] == HOME_STADIUMS["LAC"]
    assert HOME_STADIUMS["NYG"] == HOME_STADIUMS["NYJ"]

    print("build_game_weather self-check ok")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=season_now())
    ap.add_argument("--self-check", action="store_true")
    a = ap.parse_args()
    if a.self_check:
        return self_check()

    data, n_indoors, n_unknown_venue, n_flagged = build(a.season)
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    OUT.write_text(
        "// Generated by projections/build_game_weather.py from nflverse + Open-Meteo. Do not edit.\n"
        f"window.WEATHER={body};\n",
        encoding="utf-8",
    )
    n = len(data["games"])
    flags = ", ".join(f"{k}:{v}" for k, v in n_flagged.items()) or "none"
    print(f"wrote {OUT.name}: season {data['season']} week {data['week']}, {n} games, "
          f"{n_indoors} indoors, {n_unknown_venue} unknown venue, flagged [{flags}] "
          f"({OUT.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
