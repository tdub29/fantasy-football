#!/usr/bin/env python
"""FAAB bid extraction + waiver-archetype classification.

Pulls every waiver claim from the Sleeper API for the four league chains
tdub1329 plays in, classifies each pickup on four archetype dimensions, and
writes the CSV / stats table / box-plot chart under Fantasy Football/notes/.

Run with the plain python on PATH (never a project venv):
    python notes/faab_extract.py            # full run, uses cache
    python notes/faab_extract.py --refresh  # re-pull everything from Sleeper

Every network response is cached under notes/faab-cache/, so a re-run does not
re-hammer Sleeper. Classification rules are documented in
notes/faab-bid-archetypes-2026-09-16.md; this file is their implementation and
the two must be read together.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "faab-cache")

# Sleeper 403s a bare urllib request. A browser UA is the whole fix.
UA = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )
}

# league_id chains, current season first. Confirmed against previous_league_id
# by verify_chains() on every run.
CHAINS = {
    "Password is taco": ["1341184676601028608", "1182053591920443392",
                         "1055234308773920768", "917510862720745472",
                         "856718682599059456"],
    "The League": ["1314860638501076992", "1180542554655346688",
                   "1085114627396091904", "990856735038513152"],
    "yuH": ["1312276370583220224", "1183305370750713856",
            "1072695681120444416", "1043796251647221760"],
    "Phi Kap Fantasy": ["1389722402430136320", "1257103919633408000",
                        "1131298238423969792"],
}
# Sleeper settings.type: 0 = redraft, 1 = keeper, 2 = dynasty. Verified per
# league-season rather than hardcoded, but this is the expected split.
EXPECTED_FORMAT = {
    "Password is taco": "dynasty",
    "The League": "dynasty",
    "yuH": "dynasty",
    "Phi Kap Fantasy": "redraft",
}
# Washington Football League is an ESPN league. ESPN has no key-free waiver-bid
# endpoint and is not on api.sleeper.app at all, so it is out of scope here and
# every dynasty/redraft number below excludes it.
EXCLUDED_LEAGUES = {"Washington Football League": "ESPN, not on the Sleeper API"}

STAT_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF", "DL", "LB", "DB"]
# only the stat fields the classifier reads, so the cache stays small
KEEP_STATS = ["gp", "gs", "gms_active", "off_snp", "tm_off_snp", "def_snp",
              "tm_def_snp", "st_snp", "tm_st_snp", "pts_ppr", "pts_half_ppr",
              "rec_tgt", "rush_att", "pass_att", "pos_rank_ppr", "idp_tkl"]

CURRENT_SEASON = 2026   # anchor for the years_exp fallback; refetched every run
CURRENT_LEAGUES = {ids[0] for ids in CHAINS.values()}
IDP_POS = {"DL", "LB", "DB", "DE", "DT", "CB", "SS", "FS", "NT", "ILB", "OLB", "S"}


# --------------------------------------------------------------------------- #
# fetch + cache
# --------------------------------------------------------------------------- #
_refresh = False


def _fetch(url: str, timeout: int = 180):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            if attempt == 3:
                raise
            time.sleep(2 * (attempt + 1))
            print(f"  retry {attempt + 1} on {url} ({e})", file=sys.stderr)


_fetched = {}   # name -> payload, so a live file is pulled once per run


def cached(name: str, url: str, slim=None, timeout: int = 180, live=False):
    """Return JSON for url, caching under faab-cache/name. slim(payload) may
    shrink what gets written to disk. live=True refetches once per run: the
    current season is still being written, and a cache-forever read froze 2026
    at week 1 with every later week cached as an empty list."""
    path = os.path.join(CACHE, name)
    if name in _fetched:
        return _fetched[name]
    if os.path.exists(path) and not (_refresh or live):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    payload = _fetch(url, timeout=timeout)
    if slim is not None:
        payload = slim(payload)
    os.makedirs(CACHE, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f)
    _fetched[name] = payload
    return payload


def league_meta(league_id: str) -> dict:
    return cached(f"league_{league_id}.json",
                  f"https://api.sleeper.app/v1/league/{league_id}")


def players_nfl() -> dict:
    return cached("players_nfl.json",
                  "https://api.sleeper.app/v1/players/nfl", timeout=600)


def transactions(league_id: str, week: int) -> list:
    return cached(f"tx_{league_id}_{week}.json",
                  f"https://api.sleeper.app/v1/league/{league_id}/transactions/{week}",
                  live=league_id in CURRENT_LEAGUES)


def _slim_week(rows: list) -> list:
    out = []
    for r in rows:
        st = r.get("stats") or {}
        pl = r.get("player") or {}
        out.append({
            "pid": r.get("player_id"),
            "team": r.get("team"),
            "opp": r.get("opponent"),
            "pos": pl.get("position"),
            "date": r.get("date"),
            "s": {k: st[k] for k in KEEP_STATS if k in st},
        })
    return out


def week_stats(season: int, week: int) -> list:
    """One row per player who was on an NFL active roster that week, with the
    HISTORICAL team (players/nfl only carries today's team) plus snaps, starts
    and PPR points. Rows with no 'gp' are active-roster players who did not
    play, which is the absence signal the classifier needs."""
    pos = "&".join(f"position[]={p}" for p in STAT_POSITIONS)
    return cached(
        f"wkstats_{season}_{week}.json",
        f"https://api.sleeper.app/stats/nfl/{season}/{week}"
        f"?season_type=regular&{pos}&order_by=pts_ppr",
        slim=_slim_week, timeout=300, live=season == CURRENT_SEASON)


def week_proj(season: int, week: int) -> dict:
    """{player_id: Sleeper's PPR projection for that week}. The projection a
    claimant saw is what prices a player's comps on the waiver board."""
    pos = "&".join(f"position[]={p}" for p in STAT_POSITIONS)
    return cached(
        f"proj_{season}_{week}.json",
        f"https://api.sleeper.com/projections/nfl/{season}/{week}"
        f"?season_type=regular&{pos}",
        slim=lambda rows: {r["player_id"]: (r.get("stats") or {}).get("pts_ppr")
                           for r in rows if r.get("player_id")},
        live=season == CURRENT_SEASON)


def verify_chains() -> dict:
    """Walk previous_league_id and assert the hardcoded chains are right.
    Returns {league_name: [(season, league_id, meta), ...]}."""
    resolved = {}
    for name, ids in CHAINS.items():
        walked, cur = [], ids[0]
        while cur:
            m = league_meta(cur)
            walked.append(cur)
            cur = m.get("previous_league_id")
        if walked != ids:
            raise SystemExit(
                f"chain mismatch for {name}:\n  hardcoded {ids}\n  walked    {walked}")
        resolved[name] = [(int(league_meta(i)["season"]), i, league_meta(i))
                          for i in ids]
    return resolved


# --------------------------------------------------------------------------- #
# raw waiver extraction
# --------------------------------------------------------------------------- #
def extract_bids(resolved: dict) -> list:
    """Every waiver transaction with a non-null settings.waiver_bid, one row per
    added player. Keeps failed claims (status column) because a losing bid is
    still a stated price; the charts use completed claims only."""
    rows = []
    for name, seasons in resolved.items():
        fmt = "dynasty" if seasons[0][2]["settings"].get("type") == 2 else "redraft"
        if fmt != EXPECTED_FORMAT[name]:
            raise SystemExit(f"{name}: expected {EXPECTED_FORMAT[name]}, API says {fmt}")
        for season, lid, meta in seasons:
            budget = meta["settings"].get("waiver_budget")
            ltype = meta["settings"].get("type")
            fmt_s = {0: "redraft", 1: "keeper", 2: "dynasty"}.get(ltype, f"type{ltype}")
            for week in range(0, 19):
                for t in transactions(lid, week):
                    if t.get("type") != "waiver":
                        continue
                    bid = (t.get("settings") or {}).get("waiver_bid")
                    if bid is None:
                        continue
                    for pid in (t.get("adds") or {}):
                        rows.append({
                            "league": name, "league_id": lid, "season": season,
                            "format": fmt_s, "budget": budget,
                            "week": t.get("leg", week), "tx_week_key": week,
                            "status": t.get("status"),
                            "roster_id": (t.get("roster_ids") or [None])[0],
                            "player_id": pid, "bid": bid,
                            "bid_pct_budget": round(100.0 * bid / budget, 3) if budget else None,
                            "created_ms": t.get("created"),
                            "dropped_ids": ";".join((t.get("drops") or {}).keys()),
                            "transaction_id": t.get("transaction_id"),
                        })
    return rows


def hold_lengths(resolved: dict) -> dict:
    """(league_id, roster_id, player_id) -> weeks held before being dropped, from
    the league's own add/drop log. None means never dropped that season."""
    adds, drops = {}, defaultdict(list)
    for name, seasons in resolved.items():
        for season, lid, _ in seasons:
            for week in range(0, 19):
                for t in transactions(lid, week):
                    if t.get("status") != "complete":
                        continue
                    leg = t.get("leg", week)
                    for pid, rid in (t.get("adds") or {}).items():
                        adds.setdefault((lid, rid, pid), []).append(leg)
                    for pid, rid in (t.get("drops") or {}).items():
                        drops[(lid, rid, pid)].append(leg)
    out = {}
    for key, add_weeks in adds.items():
        for aw in add_weeks:
            later = [d for d in drops.get(key, []) if d >= aw]
            out[(key[0], key[1], key[2], aw)] = (min(later) - aw) if later else None
    return out


# --------------------------------------------------------------------------- #
# NFL-season context used by the classifier
# --------------------------------------------------------------------------- #
class SeasonContext:
    """Weekly snap / start / points view of one NFL season, plus the derived
    facts the situation rules need."""

    def __init__(self, season: int, max_week: int = 18):
        self.season = season
        self.rows = {}            # (pid, week) -> slim row
        self.by_team = defaultdict(list)   # (team, week) -> [rows]
        self.weeks = []
        for wk in range(1, max_week + 1):
            rows = week_stats(season, wk)
            if not rows:
                continue
            self.weeks.append(wk)
            for r in rows:
                self.rows[(r["pid"], wk)] = r
                self.by_team[(r["team"], wk)].append(r)
        # first kickoff of each NFL week, straight from the game dates in the
        # stat rows. A waiver claim belongs to the next kickoff after it.
        self.week_start = {}
        for wk in self.weeks:
            ds = [r["date"] for r in self.rows_in_week(wk) if r.get("date")]
            if ds:
                self.week_start[wk] = min(ds)
        # team bye weeks: nobody on the team logged a game
        self.bye = defaultdict(set)
        teams = {t for t, _ in self.by_team}
        for t in teams:
            for wk in self.weeks:
                if not any((r["s"].get("gp") or 0) >= 1
                           for r in self.by_team.get((t, wk), [])):
                    self.bye[t].add(wk)
        # position-season weekly score percentiles among starter-quality weeks
        self.pct = {}
        buckets = defaultdict(list)
        for (pid, wk), r in self.rows.items():
            s = r["s"]
            if not s.get("gp"):
                continue
            grp = pos_group(r["pos"])
            if grp is None:
                continue
            share = snap_share(r)
            if share is not None and share < 0.40:
                continue
            buckets[grp].append(s.get("pts_ppr") or 0.0)
        for grp, vals in buckets.items():
            vals.sort()
            self.pct[grp] = {
                p: vals[min(len(vals) - 1, int(p / 100.0 * len(vals)))]
                for p in (50, 80)
            } if vals else {50: 0, 80: 0}

    def rows_in_week(self, wk):
        return [r for (pid, w), r in self.rows.items() if w == wk]

    def phase_and_week(self, created_ms):
        """(phase, effective NFL week) for a claim, from its wall-clock time.
        Sleeper's transaction `leg` is 1 for every offseason move, so leg alone
        files a May dynasty stash as a week-1 in-season pickup."""
        d = time.strftime("%Y-%m-%d", time.localtime(created_ms / 1000.0))
        kick1 = self.week_start.get(1)
        if kick1 and d < kick1:
            return ("offseason" if d < f"{self.season}-08-01" else "preseason"), 1
        for wk in self.weeks:
            st = self.week_start.get(wk)
            if st and d < st:
                return "in-season", wk
        # past the last kickoff this season has on record. A claim placed then is
        # for the NEXT week, which is the right pre-pickup window even when that
        # week has not been played: 2026 had only week 1 in the books on
        # 2026-09-16, and returning week 1 put every claim's own snap history at
        # zero and filed entrenched starters as speculative stashes.
        return "in-season", (max(self.weeks) + 1 if self.weeks else 1)

    def row(self, pid, wk):
        return self.rows.get((pid, wk))

    def team_of(self, pid, wk):
        r = self.row(pid, wk)
        return r["team"] if r else None

    def played(self, pid, wk):
        r = self.row(pid, wk)
        return bool(r and (r["s"].get("gp") or 0) >= 1)

    def cum_snaps(self, pid, upto):
        tot = 0.0
        for wk in range(1, upto + 1):
            r = self.row(pid, wk)
            if r:
                tot += (r["s"].get("off_snp") or 0) + (r["s"].get("def_snp") or 0)
        return tot

    def teammates(self, team, wk, group, exclude=None):
        out = []
        for r in self.by_team.get((team, wk), []):
            if r["pid"] == exclude:
                continue
            if pos_group(r["pos"]) == group:
                out.append(r)
        return out

    def last_team(self, pid, upto):
        for wk in range(upto, 0, -1):
            r = self.row(pid, wk)
            if r:
                return r["team"], wk
        return None, None


def pos_group(pos):
    if pos in ("QB",):
        return "QB"
    if pos in ("RB", "FB"):
        return "RB"
    if pos in ("WR",):
        return "WR"
    if pos in ("TE",):
        return "TE"
    if pos in ("K",):
        return "K"
    if pos in ("DEF",):
        return "DEF"
    if pos in IDP_POS:
        return "IDP"
    return None


def snap_share(row):
    s = row["s"]
    off, tmo = s.get("off_snp"), s.get("tm_off_snp")
    if tmo:
        return (off or 0) / tmo
    dfn, tmd = s.get("def_snp"), s.get("tm_def_snp")
    if tmd:
        return (dfn or 0) / tmd
    return None


# --------------------------------------------------------------------------- #
# dimension 1: NFL years of experience at the time of the pickup
# --------------------------------------------------------------------------- #
def exp_at_pickup(pl, season):
    """metadata.rookie_year is the reliable anchor: exp = pickup season minus
    rookie season. years_exp in players/nfl is as-of-today and freezes at
    retirement, so it is a fallback for ACTIVE players only and unknown
    otherwise. Never guessed."""
    rk = (pl.get("metadata") or {}).get("rookie_year")
    if rk:
        try:
            v = season - int(rk)
            if -1 <= v <= 30:
                return v, "rookie_year"
        except (TypeError, ValueError):
            pass
    ye = pl.get("years_exp")
    if ye is not None and pl.get("active"):
        v = season - (CURRENT_SEASON - int(ye))
        if -1 <= v <= 30:
            return v, "years_exp_active"
    return None, "unknown"


def exp_tier(exp):
    if exp is None:
        return "unknown"
    if exp <= 0:
        return "NFL year 1 (rookie)"
    if exp <= 2:
        return "NFL years 2-3"
    if exp <= 6:
        return "NFL years 4-7"
    return "NFL years 8+"


# --------------------------------------------------------------------------- #
# dimension 2: situation of emergence
# --------------------------------------------------------------------------- #
ENTRENCHED_SHARE = 0.60     # a full-time NFL role
TAKEOVER_SHARE = 0.55       # a single-week jump into the lead role
HANDCUFF_CEILING = 0.40     # a backup's share
STASH_CEILING = 0.15        # effectively no NFL role
STARTER_SHARE = 0.30        # the share that makes a man an actual starter.
                            # 0.40 was too strict for a split backfield and
                            # dropped Javonte Williams, a real lead back, at 0.37.
LONG_TERM_WEEKS = 3         # missed games that make an absence long-term


def prior_weeks(ctx, pid, week, back=3):
    """The player's own last `back` played weeks before the pickup."""
    out = []
    for wk in range(max(1, week - back), week):
        r = ctx.row(pid, wk)
        if r is None:
            continue
        s = r["s"]
        if not s.get("gp"):
            continue
        out.append({"week": wk, "share": snap_share(r) or 0.0,
                    "pts": s.get("pts_ppr") or 0.0,
                    "started": bool(s.get("gs"))})
    return out


def own_absence(ctx, pid, week, team):
    """(missed_weeks, was_a_starter_before, plays_again_within_2wks). A missing
    stat row counts as a miss, because IR and inactive both drop the row; only
    the NFL team's bye is excused."""
    last_played, last_share = None, 0.0
    for wk in range(1, week):
        if ctx.played(pid, wk):
            last_played = wk
            last_share = snap_share(ctx.row(pid, wk)) or 0.0
    if last_played is None:
        return 0, False, False
    missed = [wk for wk in range(last_played + 1, week)
              if wk in ctx.weeks and wk not in ctx.bye[team or ""]
              and not ctx.played(pid, wk)]
    back = any(ctx.played(pid, wk) for wk in range(week, week + 3))
    return len(missed), last_share >= 0.50, back


def vacancy_ahead(ctx, team, group, week, pid, own_snaps):
    """Did a man genuinely AHEAD of this player stop playing? The cumulative
    snap gate is what stops a full-time player being credited to a rotational
    teammate's absence: Robert Woods at 86% of snaps did not emerge because
    Noah Brown got hurt behind him."""
    cands = {}
    for wk in range(1, week):
        for r in ctx.by_team.get((team, wk), []):
            if r["pid"] == pid or pos_group(r["pos"]) != group:
                continue
            s = r["s"]
            c = cands.setdefault(r["pid"], {"snaps": 0.0, "starts": 0, "gp": 0,
                                            "shares": []})
            c["snaps"] += (s.get("off_snp") or 0) + (s.get("def_snp") or 0)
            c["starts"] += int(s.get("gs") or 0)
            c["gp"] += int(s.get("gp") or 0)
            if s.get("gp"):
                sh = snap_share(r)
                if sh is not None:
                    c["shares"].append(sh)
    ranked = sorted(cands.items(), key=lambda kv: -kv[1]["snaps"])[:4]
    found = []
    for inc_pid, c in ranked:
        if c["gp"] < 1 or c["starts"] < 1 or c["snaps"] <= own_snaps:
            continue
        if not c["shares"] or sum(c["shares"]) / len(c["shares"]) < STARTER_SHARE:
            continue
        first_miss, missed = None, 0
        for wk in ctx.weeks:
            if wk < week - 1 or wk in ctx.bye[team]:
                continue
            if ctx.played(inc_pid, wk):
                if first_miss is not None:
                    break
                continue
            if first_miss is None:
                first_miss = wk
            missed += 1
        if first_miss is None or first_miss > week:
            continue
        moved_to = None
        for wk in ctx.weeks:
            if wk <= first_miss:
                continue
            t = ctx.team_of(inc_pid, wk)
            if t and t != team:
                moved_to = t
                break
        found.append({"incumbent_id": inc_pid, "incumbent_weeks_missed": missed,
                      "incumbent_first_missed": first_miss,
                      "incumbent_moved_to": moved_to,
                      "incumbent_snaps_before": round(c["snaps"], 0)})
    if not found:
        return None
    # the biggest vacancy wins. Jacksonville 2024 week 9: Gabe Davis had more
    # snaps than Christian Kirk and missed one week, Kirk missed the rest of the
    # season, and the $125 claim on Parker Washington was about Kirk.
    found.sort(key=lambda f: (-f["incumbent_weeks_missed"], -f["incumbent_snaps_before"]))
    return found[0]


def classify_situation(ctx, pid, pl, week, season, hold, group, phase):
    """First matching rule wins. The order IS the design: phase, then a real
    vacancy, then the player's own role, then intent. Documented rule by rule
    in faab-bid-archetypes-2026-09-16.md."""
    ev = {"phase": phase}
    rookie_yr = (pl.get("metadata") or {}).get("rookie_year")
    is_rookie = bool(rookie_yr) and str(rookie_yr) == str(season)

    # 0. claims made outside the NFL season have no in-season context at all
    if phase == "offseason":
        return ("offseason rookie claim" if is_rookie
                else "offseason veteran claim"), ev
    if phase == "preseason":
        return "preseason claim", ev

    # 1. kickers and team defenses are a churn market, not an emergence story
    if group in ("K", "DEF"):
        return "kicker or team defense", ev

    team = None
    for wk in range(week, 0, -1):
        team = ctx.team_of(pid, wk)
        if team:
            ev["team_from_week"] = wk
            break
    if team is None:
        team, _ = ctx.last_team(pid, 18)
    ev["nfl_team"] = team
    if team is None:
        return "no NFL snaps that season", ev

    # 2. a mid-season move is its own situation
    prev = ctx.team_of(pid, week - 1) if week > 1 else None
    if prev and prev != team:
        ev["prev_team"] = prev
        return "changed NFL teams", ev

    own = prior_weeks(ctx, pid, week)
    own_snaps = ctx.cum_snaps(pid, week - 1)
    shares = [w["share"] for w in own]
    ev["prior_snap_shares"] = [round(x, 3) for x in shares]
    ev["prior_best_ppr_3wk"] = round(max([w["pts"] for w in own], default=0.0), 1)
    ev["own_cum_snaps"] = round(own_snaps, 0)

    # 3. his own absence, before anyone else's
    missed, was_starter, returns = own_absence(ctx, pid, week, team)
    ev["own_missed_weeks"] = missed
    if missed >= 1 and was_starter and returns:
        return "returning starter from own absence", ev
    if missed >= 2 and not returns:
        return "injured or unavailable stash", ev

    # 4. the man ahead of him stopped playing. Gated on the added player having
    #    an NFL role at all: J.K. Dobbins really was out for 2023, but Baltimore's
    #    third-string back with zero career snaps was not inheriting his job, he
    #    was a lottery ticket.
    has_role = own_snaps > 0 or (shares and max(shares) >= STASH_CEILING)
    vac = (vacancy_ahead(ctx, team, group, week, pid, own_snaps)
           if group and has_role else None)
    if vac:
        ev.update(vac)
        if vac["incumbent_moved_to"]:
            return "starter left the team (cut or traded)", ev
        if vac["incumbent_weeks_missed"] >= LONG_TERM_WEEKS:
            return "starter long-term injury", ev
        return "starter short-term injury", ev

    # 5. he already had a full-time job and simply was not rostered
    full = [x for x in shares if x >= ENTRENCHED_SHARE]
    if len(own) >= 2 and len(full) >= 2:
        return "entrenched NFL starter, unrostered", ev
    if len(own) == 1 and full and own[0]["started"]:
        return "entrenched NFL starter, unrostered", ev

    # 6. the box score, then the usage, that made the market notice
    boom = ctx.pct.get(group, {}).get(80, 9e9)
    startable = ctx.pct.get(group, {}).get(50, 9e9)
    ev["boom_line"] = round(boom, 1)
    ev["startable_line"] = round(startable, 1)
    if ev["prior_best_ppr_3wk"] >= boom:
        return "breakout game", ev
    if shares and max(shares) >= TAKEOVER_SHARE:
        return "usage takeover, no big box score", ev

    # 7. the classic speculative backup buy. Rule 6 already took everyone above
    #    the boom line, so what is left to test is that he is actually ON the
    #    field behind a healthy starter. A man with no snaps is a stash, not a
    #    handcuff, which is what Keaton Mitchell was in week 4 of 2023.
    if group in ("RB", "QB") and shares and STASH_CEILING <= max(shares) < HANDCUFF_CEILING:
        mates = ctx.teammates(team, max(1, week - 1), group, exclude=pid)
        mates.sort(key=lambda r: -((r["s"].get("off_snp") or 0)))
        if mates and (mates[0]["s"].get("gp") or 0) >= 1:
            ev["starter_ahead"] = mates[0]["pid"]
            return "healthy handcuff / backup stash", ev

    if is_rookie and shares and max(shares) >= STASH_CEILING:
        return "rookie ramping into a role", ev

    ev["weeks_held"] = hold
    if hold is not None and hold <= 1:
        return "one-week stream / roster filler", ev
    if not shares or max(shares) < STASH_CEILING:
        return "speculative stash, minimal NFL role", ev
    if STASH_CEILING <= max(shares) < TAKEOVER_SHARE:
        return "rotational piece, no role change", ev
    # unreachable: the snap-share bands above partition the whole range, so this
    # is a guard against a future edit opening a hole, not a real bucket.
    return "unclassified, no signal in the data", ev


# --------------------------------------------------------------------------- #
# dimension 4: point-production profile
# --------------------------------------------------------------------------- #
def production_profile(ctx, pid, week, group):
    """Realized weekly PPR distribution from the pickup week to the end of the
    season, against that position-season's own starter-week percentiles.
    Hindsight by construction: no key-free source carries the bidder's forward
    view of a player's variance, and the note says so rather than pretending."""
    scores = []
    for wk in ctx.weeks:
        if wk < week:
            continue
        r = ctx.row(pid, wk)
        if r and r["s"].get("gp"):
            scores.append(r["s"].get("pts_ppr") or 0.0)
    if len(scores) < 3 or group not in ctx.pct:
        return "unknown (under 3 games after pickup)", {"games_after": len(scores)}
    hi, mid = ctx.pct[group][80], ctx.pct[group][50]
    boom = sum(1 for s in scores if s >= hi) / len(scores)
    startable = sum(1 for s in scores if s >= mid) / len(scores)
    ev = {"games_after": len(scores), "boom_rate": round(boom, 3),
          "startable_rate": round(startable, 3),
          "mean_ppr": round(statistics.mean(scores), 2),
          "boom_line": round(hi, 1), "startable_line": round(mid, 1)}
    if boom >= 0.25:
        return "upside play", ev
    if startable >= 0.50:
        return "floor play", ev
    return "low output, neither profile", ev


# --------------------------------------------------------------------------- #
# assemble
# --------------------------------------------------------------------------- #
def classify_all(rows, players, holds):
    seasons = sorted({r["season"] for r in rows})
    ctxs = {}
    for s in seasons:
        print(f"  loading NFL {s} weekly context ...")
        ctxs[s] = SeasonContext(s)
    out = []
    for r in rows:
        pl = players.get(r["player_id"]) or {}
        ctx = ctxs[r["season"]]
        pos = pl.get("position")
        group = pos_group(pos)
        exp, exp_src = exp_at_pickup(pl, r["season"])
        tier = "n/a (team defense)" if group == "DEF" else exp_tier(exp)
        hold = holds.get((r["league_id"], r["roster_id"], r["player_id"], r["week"]))
        phase, eff_week = ctx.phase_and_week(r["created_ms"])
        if r["week"] > 1:
            eff_week = max(eff_week, r["week"])
            phase = "in-season"
        sit, sev = classify_situation(ctx, r["player_id"], pl, eff_week,
                                     r["season"], hold, group, phase)
        prof, pev = production_profile(ctx, r["player_id"], max(1, eff_week), group)
        team_at = sev.get("nfl_team")
        if not team_at:
            team_at = ctx.last_team(r["player_id"], 18)[0] or (pl.get("team") or "unknown")
        rec = dict(r)
        rec.update({
            "phase": phase,
            "eff_week": eff_week,
            "player": pl.get("full_name") or pl.get("last_name") or "?",
            "position": pos or "unknown",
            "pos_group": group or "unknown",
            "nfl_team_at_pickup": team_at,
            "exp_years": exp if exp is not None else "",
            "exp_tier": tier,
            "exp_source": exp_src,
            "situation": sit,
            "production_profile": prof,
            "weeks_held": "" if hold is None else hold,
            "proj_ppr": (week_proj(r["season"], eff_week).get(r["player_id"])
                         if 1 <= eff_week <= 18 else None),
            "evidence": json.dumps({**sev, **pev}, sort_keys=True),
        })
        rec["archetype"] = (f'{rec["exp_tier"]} | {sit} | {rec["pos_group"]} | {prof}')
        out.append(rec)
    return out


# --------------------------------------------------------------------------- #
# stats
# --------------------------------------------------------------------------- #
def five(vals):
    v = sorted(vals)
    n = len(v)
    if n == 0:
        return None
    q1 = statistics.quantiles(v, n=4, method="inclusive")[0] if n > 1 else v[0]
    q3 = statistics.quantiles(v, n=4, method="inclusive")[2] if n > 1 else v[0]
    return {"n": n, "min": v[0], "q1": round(q1, 1), "median": round(statistics.median(v), 1),
            "q3": round(q3, 1), "iqr": round(q3 - q1, 1), "max": v[-1],
            "mean": round(statistics.mean(v), 1)}


def summarize(rows, key, fmt, min_n=1):
    """Priced (>0) completed claims only, grouped by key(row)."""
    g = defaultdict(list)
    zeros = Counter()
    totals = Counter()
    for r in rows:
        if r["format"] != fmt or r["status"] != "complete":
            continue
        k = key(r)
        totals[k] += 1
        if r["bid"] > 0:
            g[k].append(r["bid"])
        else:
            zeros[k] += 1
    out = {}
    for k, vals in g.items():
        if len(vals) < min_n:
            continue
        s = five(vals)
        s["zero_claims"] = zeros[k]
        s["all_claims"] = totals[k]
        s["zero_share"] = round(100.0 * zeros[k] / totals[k], 1) if totals[k] else 0.0
        out[k] = s
    return out


def main():
    global _refresh
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="ignore the cache")
    ap.add_argument("--stage", default="all",
                    choices=["all", "raw", "audit"], help="raw = CSV only")
    args = ap.parse_args()
    _refresh = args.refresh
    os.makedirs(CACHE, exist_ok=True)

    print("verifying previous_league_id chains ...")
    resolved = verify_chains()
    for name, seasons in resolved.items():
        print(f"  {name}: {', '.join(str(s) for s, _, _ in seasons)}")
    print(f"excluded: {EXCLUDED_LEAGUES}")

    print("pulling waiver transactions ...")
    rows = extract_bids(resolved)
    print(f"  {len(rows)} waiver claims with a non-null bid")

    # baseline sanity check named in the brief
    taco23 = [r for r in rows if r["league"] == "Password is taco" and r["season"] == 2023]
    base = {"n": len(taco23), "max": max(r["bid"] for r in taco23),
            "zeros": sum(1 for r in taco23 if r["bid"] == 0)}
    print(f"  baseline taco 2023: {base}  (brief says n=200 max=57 zeros=96)")
    assert base == {"n": 200, "max": 57, "zeros": 96}, f"baseline drift: {base}"

    holds = hold_lengths(resolved)
    players = players_nfl()

    if args.stage == "raw":
        write_csv(rows, "faab-bids-raw.csv")
        return

    print("classifying ...")
    rows = classify_all(rows, players, holds)
    write_csv(rows, "faab-bids-2026-09-16.csv")

    report = build_report(rows)
    with open(os.path.join(HERE, "faab-archetype-stats.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=1)
    print_tables(report)
    write_note_tables(report)
    from faab_chart import render
    render(rows, report, HERE)


def write_csv(rows, name):
    path = os.path.join(HERE, name)
    cols = list(rows[0].keys())
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {path} ({len(rows)} rows)")


def build_report(rows):
    dims = {
        "situation": lambda r: r["situation"],
        "position": lambda r: r["pos_group"],
        "experience": lambda r: r["exp_tier"],
        "production": lambda r: r["production_profile"],
        "archetype": lambda r: r["archetype"],
    }
    rep = {"generated": time.strftime("%Y-%m-%d %H:%M"), "dims": {},
           "counts": {}, "unknowns": {}, "excluded": EXCLUDED_LEAGUES}
    for dim, key in dims.items():
        rep["dims"][dim] = {
            fmt: {k: v for k, v in sorted(
                summarize(rows, key, fmt, min_n=(8 if dim == "archetype" else 1)).items(),
                key=lambda kv: -kv[1]["median"])}
            for fmt in ("dynasty", "redraft")}
    for fmt in ("dynasty", "redraft"):
        sub = [r for r in rows if r["format"] == fmt]
        comp = [r for r in sub if r["status"] == "complete"]
        priced = [r for r in comp if r["bid"] > 0]
        rep["counts"][fmt] = {
            "claims_with_bid": len(sub),
            "completed": len(comp),
            "failed": len(sub) - len(comp),
            "completed_zero_dollar": len(comp) - len(priced),
            "completed_priced": len(priced),
            "zero_share_pct": round(100.0 * (len(comp) - len(priced)) / len(comp), 1) if comp else 0,
            "leagues": sorted({r["league"] for r in sub}),
            "seasons": sorted({r["season"] for r in sub}),
        }
        rep["unknowns"][fmt] = {
            "experience_unknown_pct": pct(sub, lambda r: r["exp_tier"] == "unknown"),
            "experience_na_team_defense_pct": pct(sub, lambda r: r["exp_tier"].startswith("n/a")),
            "position_unknown_pct": pct(sub, lambda r: r["pos_group"] == "unknown"),
            "production_unknown_pct": pct(sub, lambda r: r["production_profile"].startswith("unknown")),
            "situation_unresolved_pct": pct(sub, lambda r: r["situation"] ==
                                            "unclassified, no signal in the data"),
            "any_dimension_unknown_pct": pct(sub, lambda r: (
                r["exp_tier"] == "unknown" or r["pos_group"] == "unknown"
                or r["production_profile"].startswith("unknown"))),
        }
    return rep


def pct(rows, f):
    return round(100.0 * sum(1 for r in rows if f(r)) / len(rows), 1) if rows else 0.0


def print_tables(rep):
    for fmt in ("dynasty", "redraft"):
        c = rep["counts"][fmt]
        print(f"\n== {fmt.upper()} ==  {c}")
        print(f"   unknown shares: {rep['unknowns'][fmt]}")
        for dim in ("situation", "position", "experience", "production", "archetype"):
            d = rep["dims"][dim][fmt]
            if not d:
                print(f"\n-- {dim} ({fmt}) -- no cell reaches the minimum sample")
                continue
            print(f"\n-- {dim} ({fmt}), priced completed claims --")
            print(f"{'label':<58}{'n':>5}{'med':>7}{'IQR':>7}{'q1':>6}{'q3':>6}{'max':>6}{'$0':>6}")
            for k, v in d.items():
                print(f"{k[:57]:<58}{v['n']:>5}{v['median']:>7g}{v['iqr']:>7g}"
                      f"{v['q1']:>6g}{v['q3']:>6g}{v['max']:>6g}{v['zero_claims']:>6}")


NOTE = "faab-bid-archetypes-2026-09-16.md"
BEGIN = "<!-- FAAB-TABLES:BEGIN (generated by notes/faab_extract.py - do not hand-edit) -->"
END = "<!-- FAAB-TABLES:END -->"
NOTE_SECTIONS = [
    ("situation", "dynasty", "Situation of emergence, dynasty", None),
    ("situation", "redraft", "Situation of emergence, redraft",
     "Three dynasty situations have no redraft row at all, and that is the format "
     "difference: offseason rookie claims, offseason veteran claims and preseason claims "
     "are a quarter of the priced dynasty volume and zero of the redraft volume. Phi Kap "
     "Fantasy only runs waivers in season."),
    ("position", "dynasty", "Position, dynasty", None),
    ("position", "redraft", "Position, redraft", None),
    ("experience", "dynasty", "NFL experience at the pickup, dynasty", None),
    ("experience", "redraft", "NFL experience at the pickup, redraft", None),
    ("production", "dynasty", "Point-production profile, dynasty", None),
    ("production", "redraft", "Point-production profile, redraft", None),
    ("archetype", "dynasty", "Full four-dimension archetype, dynasty, n >= 8", None),
    ("archetype", "redraft", "Full four-dimension archetype, redraft, n >= 8", None),
]


def write_note_tables(rep):
    """Rewrite the tables block inside the prose note straight from the report, so a
    table can never disagree with the script that produced it."""
    path = os.path.join(HERE, NOTE)
    if not os.path.exists(path):
        print(f"  note {NOTE} not found, skipping the table write")
        return
    with open(path, encoding="utf-8") as f:
        text = f.read()
    if BEGIN not in text or END not in text:
        raise SystemExit(f"{NOTE} is missing the FAAB-TABLES markers")
    out = []
    for dim, fmt, heading, tail in NOTE_SECTIONS:
        d = rep["dims"][dim][fmt]
        out.append(f"### {heading}")
        out.append("")
        if not d:
            out.append("No cell in this grouping reaches the minimum sample, so there is no "
                       "table to draw. Read this format off the marginal dimensions instead; "
                       "every cell, however thin, is in the CSV.")
            out.append("")
            if tail:
                out.append(tail)
                out.append("")
            continue
        out.append("| Archetype | n | median | IQR | Q1 | Q3 | max | $0 claims | $0 share |")
        out.append("|---|---:|---:|---:|---:|---:|---:|---:|---:|")
        for k, v in d.items():
            out.append(f"| {k} | {v['n']} | {v['median']:g} | {v['iqr']:g} | {v['q1']:g} | "
                       f"{v['q3']:g} | {v['max']:g} | {v['zero_claims']} | {v['zero_share']:g}% |")
        out.append("")
        if tail:
            out.append(tail)
            out.append("")
    counts = rep["counts"]
    out.append("### Counts behind every table above")
    out.append("")
    out.append("| | Dynasty | Redraft |")
    out.append("|---|---:|---:|")
    for label, key in [("claims with a non-null bid", "claims_with_bid"),
                       ("completed", "completed"), ("failed", "failed"),
                       ("completed at $0", "completed_zero_dollar"),
                       ("completed above $0 (the boxes)", "completed_priced")]:
        out.append(f"| {label} | {counts['dynasty'][key]} | {counts['redraft'][key]} |")
    out.append(f"| $0 share of completed | {counts['dynasty']['zero_share_pct']:g}% | "
               f"{counts['redraft']['zero_share_pct']:g}% |")
    out.append("")
    out.append("### What is unknown, by dimension")
    out.append("")
    out.append("| Dimension | Dynasty | Redraft |")
    out.append("|---|---:|---:|")
    u = rep["unknowns"]
    for label, key in [("experience unknown", "experience_unknown_pct"),
                       ("experience n/a (team defense)", "experience_na_team_defense_pct"),
                       ("position unknown", "position_unknown_pct"),
                       ("situation unclassified", "situation_unresolved_pct"),
                       ("production profile unknown", "production_unknown_pct"),
                       ("any dimension unknown", "any_dimension_unknown_pct")]:
        out.append(f"| {label} | {u['dynasty'][key]:g}% | {u['redraft'][key]:g}% |")
    out.append("")
    out.append("The production profile is the only real gap and its cause is structural: it needs "
               "three games after the pickup, so week-16-and-later claims and all of 2026 to date "
               "cannot have one. Nothing was invented to fill it.")
    out.append("")
    body = BEGIN + "\n\n" + "\n".join(out) + END
    head, _, rest = text.partition(BEGIN)
    _, _, foot = rest.partition(END)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(head + body + foot)
    print(f"wrote the generated tables block into {NOTE}")


if __name__ == "__main__":
    sys.path.insert(0, HERE)
    main()
