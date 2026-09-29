"""Current NFL contract for every fantasy-relevant player, keyed by Sleeper id.

Writes site/data/contracts.js for the player card's Contract block: APY, total,
guarantees, APY as a share of the cap, and the year he reaches free agency.

Source, public and key-free: OverTheCap contracts as republished by nflverse
(nflreadr::load_contracts), release tag "contracts", historical_contracts.parquet.
Cached under projections/nflverse-cache/ like every other nflverse file.

Join: contract gsis_id -> sleeper_id through nflverse rosters 2024-2026, then the
Sleeper dump's own gsis_id, then a normalized name + position match against
active Sleeper players that is used only when exactly one player fits.

End year. OTC's `years` is the NEW years for an extension, stacked on the deal
it extends (Burrow's 2023 "5 years" runs through 2029, not 2027), so
year_signed + years is only the end year for a fresh contract. An extension ends
at the prior deal's end plus its years (a round-1 rookie deal counts its fifth-year
option), capped by the last real year in OTC's per-season table, which catches a
full rework like Allen's 2025 deal (6 years counted from 2025, through 2030).
The per-season table alone is not trusted: void years carry placeholder salaries.

    python projections/build_contracts.py
    python projections/build_contracts.py --self-check
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys

import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import build_prospect_profile as bpp  # noqa: E402  (shared cached fetch + name normalizer)

ROOT = bpp.ROOT
OUT = ROOT / "site" / "data" / "contracts.js"
SLEEPER_DUMP = ROOT / "players-nfl.json"
ROSTER_YEARS = (2024, 2025, 2026)
# OTC position -> Sleeper positions it may appear as.
POS = {"QB": ("QB",), "RB": ("RB", "FB"), "FB": ("RB", "FB"), "WR": ("WR",), "TE": ("TE",), "K": ("K",),
       "ED": ("DE", "LB", "DL"), "IDL": ("DT", "DL", "DE"), "LB": ("LB",), "CB": ("CB", "DB"), "S": ("S", "DB")}
FANTASY = ("QB", "RB", "WR", "TE", "K")
TEAM = {"49ers": "SF", "Bears": "CHI", "Bengals": "CIN", "Bills": "BUF", "Broncos": "DEN", "Browns": "CLE",
        "Buccaneers": "TB", "Cardinals": "ARI", "Chargers": "LAC", "Chiefs": "KC", "Colts": "IND",
        "Commanders": "WAS", "Cowboys": "DAL", "Dolphins": "MIA", "Eagles": "PHI", "Falcons": "ATL",
        "Giants": "NYG", "Jaguars": "JAX", "Jets": "NYJ", "Lions": "DET", "Packers": "GB", "Panthers": "CAR",
        "Patriots": "NE", "Raiders": "LV", "Rams": "LAR", "Ravens": "BAL", "Saints": "NO", "Seahawks": "SEA",
        "Steelers": "PIT", "Texans": "HOU", "Titans": "TEN", "Vikings": "MIN"}
MIN_JOIN = 0.95  # of active QB/RB/WR/TE/K contracts


def league_year(today: dt.date | None = None) -> int:
    """The NFL league year turns over in March."""
    today = today or dt.date.today()
    return today.year if today.month >= 3 else today.year - 1


def team_abbr(otc_team: str) -> str:
    # Traded players read "NYJ/MIN" (from/to); the last code is the current team.
    return TEAM.get(otc_team, otc_team.split("/")[-1] if "/" in otc_team else otc_team)


def chain_ends(history: list[dict], draft_round) -> list[int]:
    """End year of every deal in a contract_history list, extensions stacked on their predecessor."""
    ends = []
    for i, c in enumerate(history):
        ys, yrs = int(c["year_signed"]), int(c["yrs"] or 1)
        end = ys + yrs - 1
        if c["contract_type"] == "Extension" and i:
            prev, prev_end = history[i - 1], ends[-1]
            if prev["contract_type"] == "Drafted" and draft_round == 1 and ys >= int(prev["year_signed"]) + 3:
                prev_end += 1  # the fifth-year option was part of the deal he extended
            end = max(end, prev_end + yrs)
        ends.append(end)
    return ends


def last_real_year(seasons, start: int) -> int | None:
    """Last consecutive year from `start` whose cap hit includes a salary (void years do not)."""
    last = None
    for s in sorted((s for s in seasons if str(s.get("year") or "").isdigit()), key=lambda s: int(s["year"])):
        y = int(s["year"])
        if y < start:
            continue
        base, cap = s.get("base_salary") or 0, s.get("cap_number") or 0
        if base > 0 and cap >= base - 0.01:
            last = y
        else:
            break
    return last


def contract_end(row, history: list[dict]) -> tuple[int, str]:
    """(final contract year, contract type) for the active contract in `row`."""
    naive = int(row["year_signed"] + row["years"] - 1)
    active = [i for i, c in enumerate(history) if c["status"] == "Active"]
    i = active[-1] if active else None
    kind = history[i]["contract_type"] if i is not None else ""
    if kind != "Extension":
        return naive, kind
    stacked = chain_ends(history[: i + 1], row["draft_round"])[-1]
    real = last_real_year(row["season_history"], int(row["year_signed"]))
    return max(naive, min(stacked, real) if real else stacked), kind


def gtd_after(seasons, season: int) -> float:
    """Guaranteed salary still owed in the years after `season`, in $M."""
    return round(sum((s.get("guaranteed_salary") or 0) for s in seasons
                     if str(s.get("year") or "").isdigit() and int(s["year"]) > season), 2)


def sleeper_maps(cache_frames: list[pd.DataFrame], dump: dict):
    by_gsis = {}
    for r in cache_frames:
        r = r[r["sleeper_id"].notna() & r["gsis_id"].notna()]
        by_gsis.update(dict(zip(r["gsis_id"], r["sleeper_id"].astype(str))))
    for sid, p in dump.items():
        if p.get("gsis_id"):
            by_gsis.setdefault(str(p["gsis_id"]).strip(), sid)
    by_name = {}
    for sid, p in dump.items():
        if p.get("active") and p.get("full_name"):
            by_name.setdefault((bpp.norm_name(p["full_name"]), p.get("position")), set()).add(sid)
    return by_gsis, by_name


def match(row, by_gsis, by_name):
    if pd.notna(row["gsis_id"]) and row["gsis_id"] in by_gsis:
        return by_gsis[row["gsis_id"]], "gsis"
    nm = bpp.norm_name(row["player"])
    hits = set().union(*(by_name.get((nm, p), set()) for p in POS[row["position"]]))
    return (next(iter(hits)), "name") if len(hits) == 1 else (None, None)


def build(contracts: pd.DataFrame, rosters: list[pd.DataFrame], dump: dict, season: int):
    act = contracts[contracts["is_active"] & contracts["position"].isin(list(POS))].copy()
    # Two rows can both claim "active" (a trade or a re-sign OTC did not close out): keep the newest.
    act = act.sort_values(["year_signed", "value"]).drop_duplicates("otc_id", keep="last")
    by_gsis, by_name = sleeper_maps(rosters, dump)

    rows, stale, misses, how, live_fant = [], 0, [], {"gsis": 0, "name": 0}, 0
    for _, r in act.iterrows():
        history = list(r["contract_history"]) if r["contract_history"] is not None else []
        thru, kind = contract_end(r, history)
        basis = "extension" if kind == "Extension" else "plain"
        option = kind == "Drafted" and r["draft_round"] == 1 and int(r["years"]) == 4
        if thru < season and option:
            thru += 1  # still active past year 4, so the option was exercised
            option, basis = False, "option"
        if thru < season:
            stale += 1  # OTC still flags it active but it has run out; show nothing rather than a dead deal
            continue
        live_fant += r["position"] in FANTASY
        sid, via = match(r, by_gsis, by_name)
        if sid is None:
            misses.append(r)
            continue
        how[via] += 1
        i = max((k for k, c in enumerate(history) if c["status"] == "Active"), default=None)
        prior = history[i - 1] if i else None
        rows.append({
            "sid": sid, "otc_id": int(r["otc_id"]), "pos": r["position"], "name": r["player"], "basis": basis,
            "team": team_abbr(r["team"]), "type": kind or None, "signed": int(r["year_signed"]),
            "years": int(r["years"]), "value": r["value"], "apy": r["apy"], "gtd": r["guaranteed"],
            "cap_pct": round(r["apy_cap_pct"] * 100, 1), "thru": thru, "fa": thru + 1, "option": option or None,
            "gtd_after": gtd_after(r["season_history"] if r["season_history"] is not None else [], season),
            "prior": [team_abbr(prior["team"]), prior["contract_type"], int(prior["year_signed"]),
                      int(prior["yrs"] or 0), prior["apy"]] if prior is not None and prior["year_signed"] else None,
        })
    df = pd.DataFrame(rows)
    # One Sleeper id, one contract: two OTC rows landing on the same player is a join error, keep the richer deal.
    dupes = int(df["sid"].duplicated().sum())
    df = df.sort_values(["signed", "value"]).drop_duplicates("sid", keep="last")
    fant_miss = sum(1 for m in misses if m["position"] in FANTASY)
    stats = {"active": len(act), "stale": stale, "matched": len(df), "join_dupes": dupes, "by": how,
             "misses": len(misses), "fantasy_rate": round(1 - fant_miss / max(1, live_fant), 4)}
    return df, stats


FIELDS = {
    "team": "Team on the contract (current team after a trade)",
    "type": "OTC contract type: Drafted, UDFA, UFA, Extension, Franchise, SFA, Practice, ...",
    "signed": "Year signed",
    "years": "Contract years as OTC counts them (NEW years for an extension)",
    "value": "Total value, $M", "apy": "Average per year, $M", "gtd": "Total guarantees at signing, $M",
    "cap_pct": "APY as a percent of the salary cap in the year signed (24.5 = 24.5%)",
    "thru": "Final contract season", "fa": "Season he would first play as a free agent (thru + 1)",
    "option": "true: a round-1 rookie deal whose fifth-year option could still add a season",
    "gtd_after": "Guaranteed salary still owed after the current league year, $M",
    "prior": "[team, type, year signed, years, APY $M] of the deal before this one",
}


def write_payload(df: pd.DataFrame, season: int):
    players = {r["sid"]: bpp.clean({k: v for k, v in r.items() if k not in ("sid", "otc_id", "name", "pos", "basis") and v is not None})
               for r in df.to_dict("records")}
    payload = {
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": "OverTheCap via nflverse (github.com/nflverse/nflverse-data releases/contracts)",
        "season": season, "fields": FIELDS, "players": players,
    }
    body = json.dumps(payload, allow_nan=False, separators=(",", ":"))
    OUT.write_text(f"window.CONTRACTS={body};\n", encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes), {len(players)} players")


def load():
    contracts = pd.read_parquet(bpp.fetch("contracts", "historical_contracts.parquet"))
    rosters = [pd.read_parquet(bpp.fetch("rosters", f"roster_{y}.parquet"), columns=["gsis_id", "sleeper_id"])
               for y in ROSTER_YEARS]
    dump = json.loads(SLEEPER_DUMP.read_text(encoding="utf-8"))
    return contracts, rosters, dump


def self_check():
    # Extension math on the shapes that motivated it (years in $M-free form).
    burrow = [{"contract_type": "Drafted", "status": "Extended", "year_signed": 2020, "yrs": 4},
              {"contract_type": "Extension", "status": "Active", "year_signed": 2023, "yrs": 5}]
    assert chain_ends(burrow, 1) == [2023, 2029], chain_ends(burrow, 1)
    assert chain_ends(burrow, 2) == [2023, 2028]  # no fifth-year option outside round 1
    henry = [{"contract_type": "UFA", "status": "Extended", "year_signed": 2024, "yrs": 2},
             {"contract_type": "Extension", "status": "Active", "year_signed": 2025, "yrs": 2}]
    assert chain_ends(henry, 2) == [2025, 2027]
    void = [{"year": "2029", "base_salary": 40, "cap_number": 50}, {"year": "2030", "base_salary": 50, "cap_number": 11.6},
            {"year": "2031", "base_salary": 50, "cap_number": 0}, {"year": "Total", "base_salary": 1, "cap_number": 1}]
    assert last_real_year(void, 2029) == 2029
    assert team_abbr("Bengals") == "CIN" and team_abbr("NYJ/MIN") == "MIN"

    contracts, rosters, dump = load()
    season = league_year()
    df, st = build(contracts, rosters, dump, season)
    print(f"  {st}")
    assert st["fantasy_rate"] >= MIN_JOIN, f"join rate {st['fantasy_rate']:.3f} < {MIN_JOIN}"
    assert st["join_dupes"] == 0, f"{st['join_dupes']} Sleeper ids matched two active contracts"
    assert not df["sid"].duplicated().any() and not df["otc_id"].duplicated().any(), "duplicate active contract"
    assert (df["fa"] == df["thru"] + 1).all()
    # FA year = year signed + years for a fresh deal. A round-1 rookie deal still active in year 5
    # got its option year (+1), and an extension stacks, so those two may only run later, never earlier.
    naive = df["signed"] + df["years"]
    plain = df["basis"] == "plain"
    assert (df.loc[plain, "fa"] == naive[plain]).all(), "fresh deal FA != signed + years"
    opt = df["basis"] == "option"
    assert (df.loc[opt, "fa"] == naive[opt] + 1).all(), "rookie deal off by more than its option year"
    assert (df.loc[df["basis"] == "extension", "fa"] >= naive[df["basis"] == "extension"]).all(), "extension ends early"
    assert set(df["basis"]) <= {"plain", "option", "extension"}
    assert (df["thru"] >= season).all(), "an expired contract was written"
    # Known stars, checked against their public contract terms.
    want = {"Joe Burrow": 2029, "Ja'Marr Chase": 2029, "Justin Jefferson": 2028, "Josh Allen": 2030, "Derrick Henry": 2027}
    got = {r["name"]: r["thru"] for r in df.to_dict("records") if r["name"] in want and r["pos"] in FANTASY}
    assert got == want, f"end years {got} != {want}"
    print(f"self-check OK: {len(df)} contracts, fantasy join rate {st['fantasy_rate']:.1%}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-check", action="store_true")
    if ap.parse_args().self_check:
        self_check()
        return
    contracts, rosters, dump = load()
    season = league_year()
    df, st = build(contracts, rosters, dump, season)
    print(f"  {st}")
    write_payload(df, season)


if __name__ == "__main__":
    main()
