"""Player-season rushing / receiving / passing lines for every FBS and FCS team, 2013+, aggregated
from the stats.ncaa.org play-by-play that sportsdataverse republishes in the cfbfastR column
contract (`ncaa_mfb_pbp_cfbfastr`). Everything is parsed from `play_text`: the file's name columns
are mostly empty (receiver 19% filled in 2016) and its reshaped flags mislabel whole games (EWU
2016: every completion typed "Pass Incompletion", completion False, yards null). `yards_gained` is
only the fallback when the text carries no yardage.

Names arrive as "Last, First", "First Last", "F. Last", "Last, F." or a bare "LAST", so a player
is keyed inside his team-season by (last name, first initial). A bare surname is folded into the
one key on that team-season with the same surname, or dropped when there are several.

    python projections/lanes/data/ncaa_pbp_stats.py            # writes <scratch>/ncaa/pbp_player_season_<y>.parquet
"""
import os
import pathlib
import re
import sys

import numpy as np
import pandas as pd

NCAA = pathlib.Path(os.environ.get("LANE_DATA", r"C:\Users\TrevorWhite\.claude\jobs\15921b94\tmp\lane-data")) / "ncaa"
SUFFIX = re.compile(r"\b(jr|sr|ii|iii|iv|v)\b\.?", re.I)
NAME = r"([A-Za-z][A-Za-z.'\- ]*?(?:, ?[A-Za-z][A-Za-z.'\-]*(?: [A-Za-z][A-Za-z.'\-]*)?)?)"
RUSH = re.compile(rf"^{NAME} rush")
PASS = re.compile(rf"^{NAME} pass (?:complete|incomplete|intercepted)(?: (?:short|deep|left|right|middle))*"
                  rf"(?: to {NAME}(?= for |,| \(|\.| broken| caught|$))?")
# Leading clutter some feeds put before the ball carrier: "Clock 07:14, ", "[NHSG], " and bare
# formation tags ("NHSG, Darnold, Sam pass"), stripped only when a full name follows.
CLOCK = (r"^(?:\(\d{1,2}:\d{2}\)\s*)?(?:Clock \d{1,2}:\d{2},\s*)?(?:\[[^\]]*\],\s*)*"
         r"(?:(?:No Huddle-Shotgun|No Huddle|Shotgun|Pistol|Under Center)\s+)?")
TAGS = (r"^(?:[A-Z]{1,5}, )+(?=[A-Za-z.'\- ]+, [A-Za-z.'\- ]+? (?:pass|rush) |"
        r"[A-Z][a-z]+ [A-Za-z.'\-]+ [A-Za-z.'\- ]*?(?:pass|rush) )")
YDS = re.compile(r" for (?:(loss of )?(\d+) yards?( loss)?|(no gain))")


def split_name(s):
    """-> (last, first initial or ''), lower-case letters only."""
    if not isinstance(s, str) or not s.strip() or s.strip().upper() == "TEAM":
        return None
    s = SUFFIX.sub("", s).strip(" .,")
    if not s:
        return None
    if "," in s:
        last, first = (x.strip() for x in s.split(",", 1))
    else:
        parts = s.split()
        last, first = (parts[-1], parts[0]) if len(parts) > 1 else (parts[0], "")
    last = re.sub(r"[^a-z]", "", last.lower())
    first = re.sub(r"[^a-z]", "", first.lower())[:1]
    return (last, first) if last else None


def text_yards(t):
    m = YDS.search(t or "")
    if not m:
        return np.nan
    if m.group(4):
        return 0.0
    return -float(m.group(2)) if (m.group(1) or m.group(3)) else float(m.group(2))


def season_lines(y: int) -> pd.DataFrame:
    cols = ["game_id", "pos_team", "play_text", "play_type", "yards_gained"]
    d = pd.read_parquet(NCAA / f"ncaa_mfb_pbp_cfbfastr_{y}.parquet", columns=cols)
    # Text drives everything: the reshaped flags mislabel whole games (EWU 2016: every completion
    # typed "Pass Incompletion", completion False, yards null). Conversion tries and NO PLAY rows out.
    d = d[d.pos_team.notna() & d.play_text.notna() & ~d.play_text.str.contains("NO PLAY", na=False)
          & ~d.play_type.fillna("").str.contains("Extra Point|Two Point")]
    d["play_text"] = d.play_text.str.replace(CLOCK, "", regex=True).str.replace(TAGS, "", regex=True)
    yds = d.play_text.map(text_yards)
    yds = yds.where(yds.notna(), d.yards_gained).fillna(0.0)
    td = d.play_text.str.upper().str.contains("TOUCHDOWN").astype(int)
    out = []
    nm = d.play_text.str.extract(RUSH)[0]
    r = d[nm.notna()]
    out.append(pd.DataFrame({"game_id": r.game_id, "team": r.pos_team, "name": nm[r.index], "rush_att": 1,
                             "rush_yds": yds[r.index], "rush_td": td[r.index]}))
    m = d.play_text.str.extract(PASS)
    p = d[m[0].notna()]
    m = m.loc[p.index]
    comp = p.play_text.str.contains(" pass complete")
    intc = p.play_text.str.contains(" pass intercepted| intercepted by", case=False)
    out.append(pd.DataFrame({"game_id": p.game_id, "team": p.pos_team, "name": m[0], "pass_att": 1,
                             "comp": comp.astype(int), "pass_yds": yds[p.index].where(comp, 0.0),
                             "pass_td": (td[p.index] & comp).astype(int), "pass_int": intc.astype(int)}))
    out.append(pd.DataFrame({"game_id": p.game_id, "team": p.pos_team, "name": m[1], "targets": 1,
                             "rec": comp.astype(int), "rec_yds": yds[p.index].where(comp, 0.0),
                             "rec_td": (td[p.index] & comp).astype(int)}))
    team_pass = p.groupby("pos_team").size().rename("team_pass_att")
    team_games = d.groupby("pos_team").game_id.nunique().rename("team_games")
    x = pd.concat(out, ignore_index=True)
    x["key"] = x.name.map(split_name)
    x = x.dropna(subset=["key"])
    x["last"], x["fi"] = x.key.str[0], x.key.str[1]
    # fold a bare surname into the single full key with that surname on the team-season
    full = x[x.fi != ""].groupby(["team", "last"]).fi.agg(lambda s: s.mode().iloc[0] if s.nunique() == 1 else None)
    bare = x.fi == ""
    x.loc[bare, "fi"] = [full.get((t, l)) for t, l in zip(x.team[bare], x["last"][bare])]
    unresolved = int(x.fi.isna().sum())
    x = x.dropna(subset=["fi"])
    num = ["rush_att", "rush_yds", "rush_td", "pass_att", "comp", "pass_yds", "pass_td", "pass_int",
           "targets", "rec", "rec_yds", "rec_td"]
    g = x.groupby(["team", "last", "fi"])
    s = g[num].sum(min_count=1).fillna(0)
    s["games"] = g.game_id.nunique()
    s["name"] = g.name.agg(lambda v: v.value_counts().index[0])
    s = s.reset_index().join(team_pass, on="team").join(team_games, on="team")
    s["season"] = y
    print(f"{y}: {len(s):,} player-seasons, {s.team.nunique()} teams, {unresolved:,} plays with an ambiguous bare surname dropped")
    return s


def main():
    ys = [int(a) for a in sys.argv[1:]] or [y for y in range(2013, 2027) if (NCAA / f"ncaa_mfb_pbp_cfbfastr_{y}.parquet").exists()]
    for y in ys:
        season_lines(y).to_parquet(NCAA / f"pbp_player_season_{y}.parquet", index=False)


def _check():
    assert split_name("Muhammad, Khalfani") == ("muhammad", "k")
    assert split_name("E. Fairweather") == ("fairweather", "e")
    assert split_name("Cooper Kupp") == ("kupp", "c")
    assert split_name("SAINT JUSTE, D.") == ("saintjuste", "d")
    assert split_name("Odell Beckham Jr.") == ("beckham", "o")
    assert split_name("TEAM") is None
    import pandas as _pd
    assert text_yards("X rush for loss of 3 yards to the A20") == -3
    assert text_yards("X rush for no gain to the A20") == 0
    assert text_yards("Robinson,Bijan rush for 1 yard loss to the TEX12") == -1
    assert text_yards("Robinson,Bijan rush left for 3 yards gain to the TEX30") == 3
    t = _pd.Series(["(15:00) No Huddle-Shotgun Robinson,Bijan rush left for 3 yards gain"]).str.replace(
        CLOCK, "", regex=True).str.replace(TAGS, "", regex=True)
    assert RUSH.match(t[0]).group(1) == "Robinson,Bijan", t[0]
    m = PASS.match("Ewers,Quinn pass incomplete short right to Worthy,Xavier broken up by Calligan,Keydrain.")
    assert m.group(2) == "Worthy,Xavier", m.groups()
    m = PASS.match("Gage Gubrud pass complete to Cooper Kupp for 6 yards to the WSU47 (Tago, Logan).")
    assert m.group(1) == "Gage Gubrud" and m.group(2) == "Cooper Kupp", m.groups()
    m = PASS.match("Fourcade, Chase pass incomplete to Taylor, Dontrel (Teuhema, S.).")
    assert m.group(1) == "Fourcade, Chase" and m.group(2) == "Taylor, Dontrel", m.groups()
    import pandas as _pd
    t = _pd.Series(["Clock 07:14, Browne, Max pass incomplete to Smith-Schuster.", "NHSG, Darnold, Sam pass complete",
                    "[NHSG], Darnold, Sam rush for 3 yards", "COHEN, Tarik rush for 5 yards", "SG, Sam Darnold pass complete"])
    t = t.str.replace(CLOCK, "", regex=True).str.replace(TAGS, "", regex=True).tolist()
    assert t == ["Browne, Max pass incomplete to Smith-Schuster.", "Darnold, Sam pass complete",
                 "Darnold, Sam rush for 3 yards", "COHEN, Tarik rush for 5 yards", "Sam Darnold pass complete"], t
    m = PASS.match("Finley, R. pass incomplete to Cook, C..")
    assert m.group(2).rstrip(".") == "Cook, C", m.groups()


if __name__ == "__main__":
    _check()
    main()
