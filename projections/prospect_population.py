"""Population B: every FBS QB/RB/WR/TE whose college career ended, drafted or not.

The v1 talent model trained on drafted players only, so it never saw the thousands of college
players the NFL passed on: a pre-draft forecast built that way is conditional on being drafted,
which is the unknown. This table keeps everyone who left: a player's exit season Y is his last
season on file (stats or roster), his draft year Y + 1, and his outcome is the same v1 label
(top-24 RB/WR or top-12 QB/TE PPR PPG season in the window) whether he was drafted, signed as an
undrafted free agent, or never played. Never playing is a real 0, not missing.

Links: drafted players reuse the v1 college link. Undrafted NFL players (nflverse `players` with no
draft year) link by ESPN id when it is his college id and his college seasons end before his
rookie season, else by name + a school on his nflverse college list + rookie season Y+1 or Y+2.
FCS and lower-division players are absent from the college feed, so they are outside this
population entirely (most undrafted hits: Ekeler, Cruz, Thielen); that is a stated coverage limit.

    python projections/prospect_population.py          # coverage summary
"""
from __future__ import annotations

import pathlib
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import build_prospect_model as bpm  # noqa: E402

LAST_EXIT = bpm.SEASON - 1          # 2025 exits are the 2026 draft; 2026 players are still playing


def recruit_pos(ps, con) -> pd.Series:
    """Recruiting-service position per college id, joined like stars (name + a school he played for)."""
    rec = pd.read_sql_query("SELECT season, team_id, player_name, position FROM cfb_recruit", con)
    rec["team_id"] = pd.to_numeric(rec.team_id, errors="coerce")
    rec["_k"] = rec.player_name.map(bpm.bpp.norm_name)
    names = ps[["player_id", "name", "team_id"]].drop_duplicates()
    names["_k"] = names.name.map(bpm.bpp.norm_name)
    m = names.merge(rec.dropna(subset=["position"]).drop_duplicates(["_k", "team_id"]), on=["_k", "team_id"])
    return m.groupby("player_id").position.last()


def infer_pos(ps, bio, con) -> pd.DataFrame:
    """ESPN rosters before 2014 list every player's position as "-", so an older player's position
    is inferred from his college usage, then recruit position and size: QB if he threw more than
    he caught and had 50+ career attempts; RB if he ran at least as often as he caught (20+
    carries); otherwise a receiver, TE if recruited as one or listed at 240+ lb, else WR. Graded
    against ESPN's own position on the 2014+ players (`grade_inference`)."""
    c = ps.groupby("player_id")[["pass_att", "rush_att", "rec"]].sum()
    rp = recruit_pos(ps, con)
    w = bio.ros_weight.reindex(c.index)
    pos = np.select([(c.pass_att >= 50) & (c.pass_att > c.rec), (c.rush_att >= c.rec) & (c.rush_att >= 20),
                     rp.reindex(c.index).eq("TE") | (w >= 240)], ["QB", "RB", "TE"], "WR")
    return pd.DataFrame({"inf_pos": pos, "rec_pos": rp.reindex(c.index)}, index=c.index)


def exits(ps: pd.DataFrame, bio: pd.DataFrame, con, drafted_year: pd.Series | None = None) -> pd.DataFrame:
    """One row per college player whose last season on file is <= LAST_EXIT. Position: ESPN's where
    it gives one, the inferred one where it lists "-" (pos_src says which)."""
    ros = pd.read_sql_query("SELECT athlete_id AS player_id, MAX(season) AS last_roster FROM cfb_roster GROUP BY 1", con)
    ros["player_id"] = pd.to_numeric(ros.player_id, errors="coerce").astype("Int64")
    last = ps.groupby("player_id").season.max().rename("last_stat").to_frame().join(ros.set_index("player_id"))
    last["exit"] = last[["last_stat", "last_roster"]].max(axis=1)
    if drafted_year is not None:   # a drafted player left by his draft, whatever a later roster file says
        cap = drafted_year.reindex(last.index) - 1
        last["exit"] = np.where(cap.notna(), np.minimum(last.exit, cap), last.exit)
    e = last[last.exit <= LAST_EXIT].join(bio[["ros_pos", "hs_class", "first_season"]]).join(infer_pos(ps, bio, con))
    known = e.ros_pos.notna() & e.ros_pos.ne("-")
    e["pos_src"] = np.where(known, "espn", "inferred")
    e["ros_pos"] = e.ros_pos.where(known, e.inf_pos)
    keep = e.ros_pos.isin(bpm.POS)
    if drafted_year is not None:   # drafted at QB/RB/WR/TE: in, whatever ESPN listed (FB, ATH)
        keep |= drafted_year.reindex(e.index).notna()
    return e[keep].reset_index().rename(columns={"index": "player_id"})


def grade_inference(ps, bio, con) -> pd.DataFrame:
    """Inferred vs ESPN position on players whose ESPN position is real (mostly 2014+)."""
    inf = infer_pos(ps, bio, con)
    k = bio.ros_pos.reindex(inf.index)
    k = k[k.notna() & k.ne("-")]
    x = inf.loc[k.index].assign(espn=k)
    x["espn_grp"] = x.espn.where(x.espn.isin(bpm.POS), "other")
    return pd.crosstab(x.espn_grp, x.inf_pos)


def link_undrafted(e: pd.DataFrame, ps: pd.DataFrame, con) -> pd.Series:
    """college player_id -> gsis_id for undrafted NFL players."""
    pl = pd.read_sql_query("SELECT gsis_id, display_name, position, espn_id, college_name, rookie_season FROM nfl_player "
                           "WHERE draft_year IS NULL AND rookie_season IS NOT NULL", con)
    pl = pl[pl.position.isin(bpm.POS)]
    last = e.set_index("player_id").exit
    out = {}
    eid = pd.to_numeric(pl.espn_id, errors="coerce")
    for r, i in zip(pl.itertuples(), eid):
        if pd.notna(i) and int(i) in last.index and last[int(i)] < r.rookie_season:
            out[int(i)] = r.gsis_id
    names = ps[["player_id", "name", "pos_team"]].dropna().drop_duplicates()
    names = names[names.player_id.isin(last.index) & ~names.player_id.isin(list(out))]
    names["_k"] = names.name.map(bpm.name_key)
    by = names.groupby("_k")
    taken = set(out.values())
    for r in pl.itertuples():
        if r.gsis_id in taken:
            continue
        k = bpm.name_key(r.display_name)
        if k not in by.groups:
            continue
        c = by.get_group(k)
        c = c[c.player_id.map(last).between(r.rookie_season - 2, r.rookie_season - 1)]
        schools = [s.strip() for s in str(r.college_name or "").split(";") if s.strip()]
        c = c[np.array([max((bpm.school_sim(s, t) for s in schools), default=0) >= 0.5 for t in c.pos_team], dtype=bool)]
        ids = c.player_id.unique()
        if len(ids) == 1 and int(ids[0]) not in out:
            out[int(ids[0])] = r.gsis_id
    return pd.Series(out, name="gsis_udfa")


def build(ps, bio, d, t, age0, con, say=print) -> pd.DataFrame:
    drafted = d.dropna(subset=["player_id"]).drop_duplicates("player_id").set_index("player_id")
    e = exits(ps, bio, con, drafted.season)
    e["gsis_id"] = e.player_id.map(drafted.gsis_id)
    e["pick"] = e.player_id.map(drafted.pick)
    e["draft_pos"] = e.player_id.map(drafted.position)
    e["drafted_year"] = e.player_id.map(drafted.season)
    ud = link_undrafted(e[e.gsis_id.isna()], ps, con)
    e["udfa"] = e.player_id.map(ud).notna()
    e["gsis_id"] = e.gsis_id.fillna(e.player_id.map(ud))
    # An undrafted player's label position is the one on his FIRST NFL roster (the position he
    # signed at), not nflverse's current one: Terrelle Pryor signed as a QB and his QB seasons must
    # not be ranked among receivers.
    ro = pd.read_sql_query("SELECT gsis_id, season, position FROM nfl_roster ORDER BY season, source_key, src_row", con)
    first = ro.dropna().drop_duplicates("gsis_id").set_index("gsis_id").position
    e["pos"] = e.draft_pos.fillna(e.gsis_id.map(first).where(lambda s: s.isin(bpm.POS))).fillna(e.ros_pos)
    # Model group = his COLLEGE position (known before the draft); the label still ranks him at the
    # position he was drafted or signed at. A college QB drafted as a WR stays in the QB model.
    e["cpos"] = e.ros_pos.where(e.ros_pos.isin(bpm.POS), e.inf_pos)
    # College roster weight (last listing) and recruiting stars: both known before the draft.
    e["weight"] = e.player_id.map(bio.ros_weight)
    e["stars"] = e.player_id.map(bio.stars)
    # Decision class = the draft right after his last season. Features are built as of that draft;
    # the outcome window opens when he actually entered the NFL (a drafted player who sat out a year
    # is labelled from his real draft).
    e["cls"] = (e.exit + 1).astype(int)
    e["draft_year"] = e.cls
    e["cutoff"] = e.exit.astype(int)
    e["dob"] = pd.NaT
    e["sid"] = "b" + e.player_id.astype(str)
    feats = bpm.career_features(e[["sid", "player_id", "cpos", "cutoff", "draft_year", "dob", "hs_class", "first_season"]]
                                .rename(columns={"cpos": "pos"}), ps, age0)
    e = e.merge(feats, on="sid", how="left")
    # Plausible prospects, the same filter the college board uses: a qualifying season, and for a
    # QB a season as the starter.
    e = e[(e.n_qual >= 1) & ((e.cpos != "QB") | (e.starts >= 1))].copy()
    stats = pd.read_sql_query("SELECT player_id, season, position, games, fantasy_points_ppr FROM nfl_player_season", con)
    e["draft_year"] = e.drafted_year.fillna(e.cls).astype(int)
    e = bpm.attach_outcomes(e, bpm.nfl_outcomes(stats, bpm.season_positions()))
    e["outcome_year"], e["draft_year"] = e.draft_year, e.cls
    e["win"] = e.pos.map(lambda q: bpm.TARGET[q][1])
    e["drafted"] = e.pick.notna().astype(float)
    e["bucket"] = np.select([e.pick <= 32, e.pick <= 64, e.pick <= 100, e.pick.notna()], ["R1", "R2", "R3", "D3"], "UD")
    say(f"population B: {len(e):,} exits {e.draft_year.min()}-{e.draft_year.max()}, {e.drafted.sum():.0f} drafted, "
        f"{e.udfa.sum()} undrafted NFL players linked, hits {e.hit.sum():.0f} ({e[e.drafted == 0].hit.sum():.0f} undrafted)")
    return e


def main():
    import warnings
    warnings.filterwarnings("ignore")
    ps, bio, d, t, age0 = bpm.prepare(say=lambda *a: None)
    e = build(ps, bio, d, t, age0, bpm._CON)
    k = e[e.pos_src.eq("espn")]
    print("position inference graded on the population's ESPN-positioned rows (rows ESPN, columns inferred):")
    print(pd.crosstab(k.ros_pos, k.inf_pos).to_string())
    print(f"agreement {k.ros_pos.eq(k.inf_pos).mean():.1%}")
    m = e[e.hit.notna()]
    print(m.groupby(["cpos"]).agg(n=("sid", "size"), drafted=("drafted", "sum"), udfa=("udfa", "sum"), hits=("hit", "sum"),
                                 hits_undrafted=("hit", lambda s: s[m.loc[s.index, "drafted"] == 0].sum())).to_string())
    print(m.groupby("draft_year").agg(n=("sid", "size"), drafted=("drafted", "sum"), hits=("hit", "sum")).T.to_string())
    print(m[(m.drafted == 0) & (m.hit == 1)][["name_final", "cpos", "pos", "draft_year", "pos_team_final", "best_rank"]].to_string())


if __name__ == "__main__":
    main()
