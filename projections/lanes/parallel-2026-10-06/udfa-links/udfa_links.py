"""udfa-links lane: identity audit of the college -> NFL link for every drafted and undrafted QB/RB/WR/TE,
a conservative resolver for the rows the builder's linker misses, and before/after coverage and bias.

Read-only on the lane's store copy: opens it as file:...?immutable=1 and presets bpm._CON before the first
bpm.read_src, so pdb.connect()/pdb.ingest() never run. (An unset _CON re-fetched three live sources into the
coordinator's first copy on 2026-10-07; see notes/.../udfa-links/CHECKPOINT.md.) Writes only ./audit/ and
one input cache in the job scratch dir. No outcome is read until every link decision is frozen.

    PROSPECT_DB=<copy> python -I projections/lanes/parallel-2026-10-06/udfa-links/udfa_links.py [--fresh]

Phase 2-3 (this file): baseline = bpm.link_college unchanged on D (drafted, as bpm.prepare builds it) and U
(undrafted, as overall_study.udfas builds it). Four outcome-free rules then run on the rows it misses, and
a base link is never moved. Exit 1 if a hand-traced named case or an input hash fails.
"""
import argparse
import collections
import difflib
import functools
import hashlib
import json
import os
import pathlib
import pickle
import sqlite3
import sys
import time
from types import SimpleNamespace

import numpy as np
import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
WT = HERE.parents[3]
sys.path.insert(0, str(WT / "projections"))
STORE = pathlib.Path(os.environ["PROSPECT_DB"]).resolve()
assert STORE.name != "prospect.sqlite" and "prospect-db" not in STORE.parts, f"{STORE} looks like the master store"
import build_prospect_model as bpm  # noqa: E402

JOB = pathlib.Path(os.environ.get("UDFA_SCRATCH", r"C:/Users/TrevorWhite/.claude/jobs/915dc2f8/tmp"))
REUSE = JOB / "reuse"
XWALK_SHA = "eab2eccd774823e1a84a190c3b05a82eca8864649c8e690f275e42b17c559431"   # packages lane R4 snapshot
OUT = HERE / "audit"
POS = ("QB", "RB", "WR", "TE")
COHORTS = [(2008, 2011), (2012, 2015), (2016, 2019), (2020, 2023)]


def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def open_store():
    if bpm._CON is None:
        bpm._CON = sqlite3.connect(f"file:{STORE.as_posix()}?immutable=1", uri=True)
    return bpm._CON


def load(fresh=False):
    """Every input, cached in the job scratch keyed by the copy's size and mtime."""
    st = STORE.stat()
    tag = (str(STORE), st.st_size, st.st_mtime_ns)
    pk = JOB / "udfa_links_inputs.pkl"
    if pk.exists() and not fresh:
        d = pickle.loads(pk.read_bytes())
        if d["tag"] == tag:
            return d
    con = open_store()
    ps = bpm.load_college()
    pl = bpm.read_src("nfl_player", "players.parquet")
    dr = bpm.read_src("nfl_draft_pick", "draft_picks.parquet")
    ros = pd.concat([bpm.read_src("nfl_roster", f"roster_{y}.parquet", ["gsis_id", "season"])
                     for y in range(bpm.FIRST_CLASS, bpm.SEASON + 1)], ignore_index=True)
    cr = pd.read_sql_query("SELECT season, athlete_id, team_id, full_name, position_abbreviation AS pos, "
                           "substr(date_of_birth, 1, 10) AS dob FROM cfb_roster", con)
    box = pd.read_sql_query("SELECT season, athlete_id, team_id, athlete_name AS name FROM cfb_player_box "
                            "GROUP BY season, athlete_id, team_id, athlete_name", con)
    xp = REUSE / "espn_nfl_college_xwalk.parquet"
    assert sha256(xp) == XWALK_SHA, "crosswalk snapshot changed"
    xw = pd.read_parquet(xp)
    fcs = pd.concat([pd.read_parquet(p) for p in sorted(REUSE.glob("espn_fcs_lines_*.parquet"))], ignore_index=True)
    srcs = dict(con.execute("SELECT source_key, sha256 FROM source_file"))
    d = dict(tag=tag, ps=ps, pl=pl, dr=dr, ros=ros, cr=cr, box=box, xw=xw, fcs=fcs, srcs=srcs)
    pk.write_bytes(pickle.dumps(d))
    return d


# ----------------------------------------------------------------------------- phase 2-3: baseline + resolver

BPM_SHA = sha256(bpm.__file__)
CODE_SHA = sha256(__file__)
STORE_SHA = "85d9801d4f2ec3f750af80e62f13f2b20615c508b1ce85fc27fd132981afa9c0"
RUN = "20261004T144240-26c1527e"   # last shipped build; the baseline must reproduce its player_link
SKILL = {"QB", "RB", "WR", "TE", "FB", "ATH", "KR", "PR", "-"}   # "-" is ESPN's blank roster position
RULES = ("xwalk", "dob_name", "multi_school", "gap_window")


def pops(dr, pl):
    """D exactly as bpm.prepare() builds it, U exactly as overall_study.udfas() does."""
    assert "espn_id" not in dr.columns
    d = dr[(dr.season >= bpm.FIRST_CLASS) & dr.position.isin(POS) & dr.pick.notna()].copy()
    d = d.merge(pl[["gsis_id", "espn_id", "birth_date"]], on="gsis_id", how="left")
    d.index = range(len(d))
    u = pl[pl.draft_pick.isna() & ~pl.gsis_id.isin(d.gsis_id.dropna())
           & pl.position.isin(list(POS) + ["FB"]) & pl.rookie_season.between(2008, 2023)].copy()
    u = u.assign(season=u.rookie_season.astype(int), pfr_player_name=u.display_name, college=u.college_name)
    u.index = range(len(u))
    return d, u


def linked(X, ps, name, tag):
    """bpm.link_college unchanged, cached on its exact inputs (it walks every row in Python)."""
    h = hashlib.sha256(pd.util.hash_pandas_object(X[["season", "pfr_player_name", "college", "espn_id"]].astype(str),
                                                  index=True).values.tobytes()).hexdigest()
    key, pk = (tag, BPM_SHA, h), JOB / f"udfa_links_lc_{name}.pkl"
    if pk.exists():
        k, ids, lm = pickle.loads(pk.read_bytes())
        if k == key:
            return ids, lm
    t, lm = time.time(), {}
    ids = bpm.link_college(X, X.espn_id, ps, lm).reindex(X.index).astype("Int64")
    lm = pd.Series(lm, dtype=object).reindex(X.index).fillna("none")
    print(f"  link_college {name}: {len(X):,} rows, {time.time() - t:.0f}s", flush=True)
    pk.write_bytes(pickle.dumps((key, ids, lm)))
    return ids, lm


def frame(d, u, base, ros, xw):
    """One row per NFL player in either population, carrying the builder's own link as base."""
    first = ros.groupby("gsis_id").season.min()
    parts = []
    for pop, X, pfr in (("D", d, "pfr_player_id"), ("U", u, "pfr_id")):
        ids, lm = base[pop]
        a = pd.DataFrame({"pop": pop, "row": X.index, "gsis_id": X.gsis_id, "pfr": X[pfr], "name": X.pfr_player_name,
                          "season": X.season.astype(int), "position": X.position, "college": X.college,
                          "espn_id": pd.to_numeric(X.espn_id, errors="coerce").astype("Int64"),
                          "birth_date": X.birth_date, "base_id": ids, "base_method": lm})
        # A UDFA can sit on a roster before nflverse's rookie season; college ended before either.
        a["t0"] = a.season if pop == "D" else np.minimum(a.season, a.gsis_id.map(first).fillna(9999)).astype(int)
        parts.append(a)
    A = pd.concat(parts, ignore_index=True)
    A["pos"] = A.position.replace({"FB": "RB"})
    A["key"] = [g if isinstance(g, str) else f"pfr:{p}" for g, p in zip(A.gsis_id, A.pfr)]
    A["bd"] = pd.to_datetime(A.birth_date, errors="coerce").dt.strftime("%Y-%m-%d")
    x = xw[xw.status.astype(str).eq("200")].drop_duplicates("gsis_id", keep="last").set_index("gsis_id")
    for c, src in (("xw_cid", "college_athlete_id"), ("xw_espn", "espn_id"), ("xw_team", "espn_college_id")):
        A[c] = pd.to_numeric(A.gsis_id.map(x[src]), errors="coerce").astype("Int64")
    return A


def groupset(k, v):
    out = collections.defaultdict(set)
    for a, b in zip(k, v):
        out[a].add(b)
    return out


def evidence(I):
    """Every college id the store or the FCS package has seen: seasons, names, teams, DOB, roster position."""
    ps, cr, box, fcs = I["ps"], I["cr"], I["box"], I["fcs"]
    cols = ["id", "season", "team_id", "name", "src"]
    ev = pd.concat([ps.rename(columns={"player_id": "id"}).assign(src="ps")[cols],
                    cr.rename(columns={"athlete_id": "id", "full_name": "name"}).assign(src="roster")[cols],
                    box.rename(columns={"athlete_id": "id"}).assign(src="box")[cols],
                    fcs.rename(columns={"athlete_id": "id"}).assign(src="fcs")[cols]], ignore_index=True)
    for c in ("id", "season", "team_id"):
        ev[c] = pd.to_numeric(ev[c], errors="coerce")
    ev = ev.dropna(subset=["id", "season"]).astype({"id": "int64", "season": "int64"})
    E = SimpleNamespace(end=ev.groupby("id").season.max().to_dict(),
                        src_end={s: g.groupby("id").season.max().to_dict() for s, g in ev.groupby("src")})
    nm = ev[["id", "name"]].dropna().drop_duplicates()
    E.names = groupset(nm["id"], nm["name"])
    tm = ev[["id", "team_id"]].dropna().drop_duplicates()
    E.teams = groupset(tm["id"], tm["team_id"].astype("int64"))
    st = ev.loc[ev.src.isin(["ps", "box", "fcs"]), ["id", "season"]].drop_duplicates()
    E.stat_seasons = groupset(st["id"], st["season"])
    p = ps.dropna(subset=["player_id"]).astype({"player_id": "int64"})
    E.last_ps = p.groupby("player_id").season.max().to_dict()
    pt = p[["player_id", "pos_team"]].dropna().drop_duplicates()
    E.ps_teams = groupset(pt["player_id"], pt["pos_team"])
    pn = p[["player_id", "name"]].dropna().drop_duplicates()
    E.kps = groupset(pn["name"].map(bpm.name_key), pn["player_id"])
    c = cr.assign(id=pd.to_numeric(cr.athlete_id, errors="coerce"),
                  dob=pd.to_datetime(cr.dob, errors="coerce").dt.strftime("%Y-%m-%d")).dropna(subset=["id"])
    c = c.astype({"id": "int64"})
    dd = c[["id", "dob"]].dropna().drop_duplicates()
    E.dob, E.dob_ids = groupset(dd["id"], dd["dob"]), groupset(dd["dob"], dd["id"])
    rp = c[["id", "pos"]].dropna().drop_duplicates()
    E.rpos = groupset(rp["id"], rp["pos"])
    f = fcs.assign(id=pd.to_numeric(fcs.athlete_id, errors="coerce"), tid=pd.to_numeric(fcs.team_id, errors="coerce"))
    ft = f[["tid", "team"]].dropna().drop_duplicates("tid", keep="last")
    E.tname = dict(zip(ft["tid"].astype("int64"), ft["team"]))      # FCS names carry the mascot ("Baylor Bears")
    pt2 = p[["team_id", "pos_team"]].dropna().drop_duplicates("team_id", keep="last")
    E.tname.update(zip(pt2["team_id"].astype("int64"), pt2["pos_team"]))
    E.ps_sch = sorted({bpm.school_key(t) for t in p.pos_team.dropna().unique()})
    E.ps_sch_set = set(E.ps_sch)
    E.fcs_sch = {bpm.school_key(t) for t in f.team.dropna().unique()}
    fn = f[["id", "name"]].dropna().drop_duplicates()
    E.fk = groupset(fn["name"].map(bpm.name_key), fn["id"].astype("int64"))
    return E


def schools(c):
    return [s.strip() for s in c.split(";") if s.strip()] if isinstance(c, str) else []


@functools.lru_cache(maxsize=None)
def toks(s):
    t = bpm._name_tokens(s) if isinstance(s, str) else None
    return None if t is None else (bpm.NICK.get(t[0], t[0]), t[-1])


def first_ok(a, b):
    return a == b or (min(len(a), len(b)) >= 3 and (a.startswith(b) or b.startswith(a)))


def name_ok(E, name, cid):
    """Same surname and a compatible first name under any name the id was ever listed with."""
    t = toks(name)
    return t is not None and any((v := toks(n)) is not None and v[1] == t[1] and first_ok(v[0], t[0])
                                 for n in E.names.get(cid, ()))


def dob_status(E, bd, cid):
    ds = E.dob.get(cid)
    if not isinstance(bd, str) or not ds:
        return "none"
    if bd in ds:
        return "exact"
    b = pd.Timestamp(bd)
    return "within1" if min(abs((pd.Timestamp(x) - b).days) for x in ds) <= 1 else "conflict"


def pos_conflict(E, cid):
    r = E.rpos.get(cid)
    return bool(r) and not (r & SKILL)


def team_names(E, cid):
    return sorted({E.tname[t] for t in E.teams.get(cid, ()) if t in E.tname})


# Each rule returns (college id or None, status, detail). Every rule runs on every row so it can be graded
# on the id-known rows; it is applied only where the builder found nothing.

def r1(E, a):
    """ESPN's own NFL-athlete -> college-athlete pointer (packages lane crosswalk)."""
    if pd.isna(a.xw_cid):
        return None, "", None
    cid = int(a.xw_cid)
    if pd.notna(a.xw_espn) and pd.notna(a.espn_id) and int(a.xw_espn) != int(a.espn_id):
        return None, "espn_mismatch", cid
    if cid not in E.end:
        return None, "no_rows", cid
    if E.end[cid] >= a.t0:
        return None, "end", cid
    if not name_ok(E, a.name, cid) and dob_status(E, a.bd, cid) != "exact":
        return None, "name", cid
    return cid, "accept", cid


def r2(E, a):
    """Exact birth date on a college roster plus the same surname and a compatible first name."""
    if not isinstance(a.bd, str):
        return None, "", []
    c = sorted(i for i in E.dob_ids.get(a.bd, ()) if E.end[i] < a.t0 and name_ok(E, a.name, i))
    if len(c) <= 1:
        return (c[0], "accept", c) if c else (None, "none", c)
    # One man under several ids (ESPN re-keys some transfers): the id carrying stats, latest season, wins.
    pool = [i for i in c if i in E.last_ps] or c
    sc = {i: E.last_ps.get(i, E.end[i]) for i in pool}
    top = [i for i in pool if sc[i] == max(sc.values())]
    return (top[0], f"split_identity:{len(c)}", c) if len(top) == 1 else (None, "ambiguous", c)


def r3(E, a, per_school):
    """Transfers: the builder's own linker run once per listed school; every school must agree."""
    ids = sorted({int(x) for x in per_school if pd.notna(x)})
    if not ids:
        return None, ("none" if per_school else ""), ids
    if len(ids) > 1:
        return None, "multi_school_conflict", ids
    if E.end.get(ids[0], -1) >= a.t0:
        return None, "end", ids
    return ids[0], "accept", ids


def r4(E, a):
    """The builder's exact name key over a wider window (last college season 1-5 years before the NFL),
    one candidate only, school match >= 0.8, no DOB or roster-position conflict."""
    ids = sorted(i for i in E.kps.get(bpm.name_key(a.name), ()) if a.t0 - 5 <= E.last_ps[i] <= a.t0 - 1)
    if not ids:
        return None, "none", {}
    sim = {i: max((bpm.school_sim(s, t) for s in schools(a.college) for t in E.ps_teams.get(i, ())), default=0.0)
           for i in ids}
    near = [i for i in ids if sim[i] >= 0.5]
    if len(near) > 1:
        return None, "ambiguous", sim
    if not near or sim[near[0]] < 0.8:
        return None, "school", sim
    i = near[0]
    if E.end[i] >= a.t0:
        return None, "end", sim
    if dob_status(E, a.bd, i) == "conflict":
        return None, "dob_conflict", sim
    if pos_conflict(E, i):
        return None, "pos_conflict", sim
    return i, "accept", sim


def cause(E, a, ident, st, R):
    """Why a row has no college stats to build features from (first match wins)."""
    if st in ("collision", "rule_conflict"):
        return st
    if ident is not None:
        return "identity_no_stats:" + ("fcs" if ident in E.src_end.get("fcs", {}) else "roster_box")
    if any(v[1] in ("ambiguous", "multi_school_conflict") for v in R.values()):
        return "ambiguous"
    if R["xwalk"][1] not in ("", "accept"):
        return f"xwalk_reject:{R['xwalk'][1]}"
    if any(v[1] == "end" for v in R.values()):
        return "end_guard"
    if R["gap_window"][1] in ("dob_conflict", "pos_conflict"):
        return "gap_guard"
    if E.kps.get(bpm.name_key(a.name)):
        return "window_other"
    ks = [bpm.school_key(s) for s in schools(a.college)]
    if not ks:
        return "no_college"
    if any(k in E.ps_sch_set or difflib.get_close_matches(k, E.ps_sch, n=1, cutoff=0.85) for k in ks):
        return "player_not_in_ps"
    if any(f == k or f.startswith(k + " ") for k in ks for f in E.fcs_sch):
        return "school_not_in_ps:fcs_lines"
    return "school_not_in_ps:absent"


def iv(x):
    return None if x is None or pd.isna(x) else int(x)


def no_school(E, r, s):
    return r["identity"] is None or s not in {bpm.school_key(n) for n in team_names(E, r["identity"])}


# Hand-traced in phase 1 (gsis_id, what must hold). A failure exits 1 after the outputs are written.
NAMED = [
    ("00-0026300", "Josh Johnson (San Diego): never Iowa State's namesake", lambda E, r: no_school(E, r, "iowa state")),
    ("00-0039798", "Isaiah Davis (South Dakota State): never UTSA's namesake", lambda E, r: no_school(E, r, "utsa")),
    ("00-0027608", "Kyle Williams: crosswalk 183335 fails the end guard",
     lambda E, r: r["identity"] != 183335 and r["r1"] == "end"),
    ("00-0026234", "Kevin O'Connell: base 147785 kept, crosswalk id has no rows",
     lambda E, r: r["identity"] == r["base"] == 147785 and r["r1"] == "no_rows"),
    ("00-0027693", "Taylor Price: never the 2015 Fresno State id",
     lambda E, r: r["identity"] is None or E.end[r["identity"]] < 2010),
    ("00-0031118", "Corey Brown: never 487791", lambda E, r: r["identity"] != 487791),
    ("00-0026836", "Kenneth Harris: base kept, crosswalk fails the end guard",
     lambda E, r: r["identity"] == r["base"] and r["r1"] == "end"),
    ("00-0029513", "Dwight Jones: crosswalk id has no rows", lambda E, r: r["r1"] == "no_rows"),
    ("00-0031275", "Ian Thompson: crosswalk id has no rows", lambda E, r: r["r1"] == "no_rows"),
    ("00-0033266", "JoJo Natson: base kept", lambda E, r: r["identity"] == r["base"]),
    ("00-0028863", "Dominique Davis: base kept", lambda E, r: r["identity"] == r["base"]),
    ("00-0026195", "Ray Rice (Raymell): linked with stats", lambda E, r: r["feature"] is not None),
    ("00-0027007", "Beanie Wells: linked with stats", lambda E, r: r["feature"] is not None),
    ("00-0029665", "Robert Griffin III: linked with stats", lambda E, r: r["feature"] is not None),
    ("00-0026364", "Steve Johnson (Stevie): linked with stats", lambda E, r: r["feature"] is not None),
    ("00-0025860", "BenJarvus Green-Ellis: 145975", lambda E, r: r["identity"] == 145975),
    ("00-0028411", "Dontrelle Inman: 236790, stale", lambda E, r: r["identity"] == 236790 and not r["fresh"]),
    ("00-0030656", "Isaiah Crowell: unlinked, or the stale Georgia id",
     lambda E, r: r["identity"] is None or (r["identity"] == 512836 and not r["fresh"])),
    ("00-0032218", "Dorial Green-Beckham: linked with stats", lambda E, r: r["feature"] is not None),
    ("00-0027700", "Mardy Gilyard: linked with stats", lambda E, r: r["feature"] is not None),
    ("00-0030095", "Corey Fuller: linked with stats", lambda E, r: r["feature"] is not None),
    ("00-0033699", "Austin Ekeler: FCS identity 555082, no FBS stats",
     lambda E, r: r["identity"] == 555082 and r["cause"] == "identity_no_stats:fcs"),
]


def clean(o):
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple, set)):
        return [clean(v) for v in (sorted(o, key=str) if isinstance(o, set) else o)]
    if isinstance(o, np.bool_):
        return bool(o)
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, (np.floating, float)):
        return None if o != o else float(o)
    if o is pd.NA or o is pd.NaT:
        return None
    return o


def provenance(I, con):
    shas = {}
    for line in (REUSE / "sha256.txt").read_text().split("\n"):
        if " *" in line:
            h, n = line.strip().split(" *", 1)
            shas[n.strip()] = h.strip()
    fcs = {p.name: sha256(p) for p in sorted(REUSE.glob("espn_fcs_lines_*.parquet"))}
    run_sha = con.execute("SELECT code_sha256 FROM build_run WHERE run_id = ?", (RUN,)).fetchone()
    out = dict(store=str(STORE), store_sha=sha256(STORE), xwalk_sha=sha256(REUSE / "espn_nfl_college_xwalk.parquet"),
               fcs_files=len(fcs), fcs_bad=[n for n, h in fcs.items() if shas.get(n) != h],
               bpm_sha=BPM_SHA, overall_sha=sha256(WT / "projections/lanes/overall/overall_study.py"),
               code_sha=CODE_SHA, run=RUN, run_code_sha=run_sha[0] if run_sha else None, source_file=I["srcs"])
    out["ok"] = out["store_sha"] == STORE_SHA and out["xwalk_sha"] == XWALK_SHA and not out["fcs_bad"] and len(fcs) > 0
    return out


def parity(con, A):
    """The baseline must reproduce the shipped build's player_link (record_build folds name_prefix in)."""
    s = pd.read_sql_query("SELECT gsis_id AS key, cfb_player_id, method FROM player_link WHERE run_id = ?", con,
                          params=(RUN,)).drop_duplicates("key", keep="last").set_index("key")
    d = A[A["pop"] == "D"].drop_duplicates("key", keep="last").set_index("key")
    both = d.index.intersection(s.index)
    bid = d.loc[both, "base_id"].fillna(-1).astype("int64")
    sid = pd.to_numeric(s.loc[both, "cfb_player_id"]).fillna(-1).astype("int64")
    meth = d.loc[both, "base_method"].replace({"name_prefix": "name_school"})
    bad = both[(bid != sid).to_numpy() | (meth != s.loc[both, "method"]).to_numpy()]
    return dict(d_rows=int((A["pop"] == "D").sum()), d_keys=len(d), store_rows=len(s), both=len(both),
                only_D=sorted(d.index.difference(s.index)), only_store=sorted(s.index.difference(d.index)),
                mismatch=len(bad), examples=[dict(key=k, base=int(bid[k]), store=int(sid[k]), method=meth[k],
                                                  store_method=s.at[k, "method"]) for k in bad[:20]])


def coverage(A):
    rows = []
    for pop in ("D", "U"):
        g = A[A["pop"] == pop]
        for lo, hi in COHORTS + ([(2024, 2026)] if pop == "D" else []) + [(2008, 2026)]:
            c = g[g.season.between(lo, hi)]
            for pos in POS + ("ALL",):
                x = c if pos == "ALL" else c[c.pos == pos]
                rows.append(dict(pop=pop, cohort=f"{lo}-{hi}", pos=pos, n=len(x), base=int(x.base_id.notna().sum()),
                                 identity=int(x.identity_id.notna().sum()), feature=int(x.feature_id.notna().sum()),
                                 fresh=int(x.fresh.sum())))
    return rows


def end_check(E, A, rows):
    return dict(n=len(rows), **{s: int(sum(E.src_end[s].get(int(A.at[j, "base_id"]), -1) >= A.at[j, "t0"] for j in rows))
                                for s in E.src_end})


def phase23(I):
    t = time.time()
    con = open_store()
    OUT.mkdir(exist_ok=True)
    prov = provenance(I, con)
    print(f"  provenance ok={prov['ok']}  run_code_sha==bpm_sha {prov['run_code_sha'] == BPM_SHA}", flush=True)
    ps = I["ps"]
    d, u = pops(I["dr"], I["pl"])
    base = {"D": linked(d, ps, "D", I["tag"]), "U": linked(u, ps, "U", I["tag"])}
    A = frame(d, u, base, I["ros"], I["xw"])
    E = evidence(I)
    print(f"  D {len(d):,}  U {len(u):,}  evidence ids {len(E.end):,}  {time.time() - t:.0f}s", flush=True)

    # Transfers: nflverse lists every school ("A; B"); each goes through the builder's own linker alone.
    per = collections.defaultdict(list)
    ms = A[A.college.fillna("").str.contains(";")]
    for k in range(int(ms.college.str.count(";").max()) + 1 if len(ms) else 0):
        sub = ms[ms.college.str.count(";") >= k]
        X = pd.DataFrame({"season": sub.season, "pfr_player_name": sub["name"], "espn_id": np.nan,
                          "college": sub.college.str.split(";").str[k].str.strip()}, index=sub.index)
        for i, v in linked(X, ps, f"r3_s{k}", I["tag"])[0].items():
            per[i].append(v)

    R = [{"xwalk": r1(E, a), "dob_name": r2(E, a), "multi_school": r3(E, a, per.get(a.Index, [])),
          "gap_window": r4(E, a)} for a in A.itertuples()]

    # Combine. A base link never moves; a new id must be the only accepted id and used by no other row.
    st, new = {}, {}
    for i, r in enumerate(R):
        if pd.notna(A.at[i, "base_id"]):
            continue
        acc = {k: v[0] for k, v in r.items() if v[0] is not None}
        ids = set(acc.values())
        if len(ids) > 1:
            st[i] = "rule_conflict"
        elif ids:
            new[i] = (ids.pop(), "+".join(k for k in RULES if k in acc))
    used = collections.defaultdict(list)
    for i, b in A.base_id.items():
        if pd.notna(b):
            used[int(b)].append(i)
    n_new = collections.Counter(c for c, _ in new.values())
    extra, collisions = collections.defaultdict(list), []
    A["identity_id"], A["method"] = A.base_id.copy(), A.base_method.where(A.base_id.notna(), "")
    for i, (c, m) in new.items():
        if c in used or n_new[c] > 1:
            st[i] = "collision"
            other = used.get(c, []) + [j for j, (c2, _) in new.items() if c2 == c and j != i]
            collisions.append(dict(key=A.at[i, "key"], name=A.at[i, "name"], id=c, method=m,
                                   with_keys=[A.at[j, "key"] for j in other]))
            for j in used.get(c, []):
                extra[j].append(f"collision_with:{A.at[i, 'key']}")
        else:
            A.at[i, "identity_id"], A.at[i, "method"] = c, m

    feat, lag, fresh, flags, causes, evid = [], [], [], [], [], []
    for a, r in zip(A.itertuples(), R):
        i = iv(a.identity_id)
        f = i if i in E.last_ps else None
        lg = int(a.t0 - E.last_ps[f]) if f is not None else None
        fl = list(extra.get(a.Index, []))
        later = False
        if i is not None:
            later = any(s >= a.t0 for s in E.stat_seasons.get(i, ()))
            ds = dob_status(E, a.bd, i)
            tn = team_names(E, i)
            fl += [n for n, on in (
                ("later_stats", later), ("end_ge_t0", E.end.get(i, -1) >= a.t0), ("pos_conflict", pos_conflict(E, i)),
                ("dob_conflict", ds == "conflict"), ("dob_within1", ds == "within1"),
                ("fcs_same_name_later", any(j != i and E.end.get(i, -1) < E.src_end.get("fcs", {}).get(j, -1) < a.t0
                                            for j in E.fk.get(bpm.name_key(a.name), ()))),
                ("xw_disagree", pd.notna(a.xw_cid) and int(a.xw_cid) != i),
                ("stale_espn_direct", a.base_method == "espn_id" and lg is not None and lg > 2),
                ("xw_school_mismatch", pd.notna(a.xw_team) and int(a.xw_team) not in E.teams.get(i, ())),
                ("school_mismatch", bool(schools(a.college)) and bool(tn) and max(
                    bpm.school_sim(s, n) for s in schools(a.college) for n in tn) < 0.5)) if on]
        feat.append(f)
        lag.append(lg)
        fresh.append(f is not None and lg in (1, 2) and not later)
        flags.append(";".join(fl))
        causes.append("" if f is not None else cause(E, a, i, st.get(a.Index, ""), r))
        e = {k: [v[0], v[1], {str(x): round(y, 2) for x, y in v[2].items()} if isinstance(v[2], dict) else v[2]]
             for k, v in r.items() if v[1]}
        if i is not None:
            e["id"] = dict(end={s: E.src_end[s][i] for s in E.src_end if i in E.src_end[s]},
                           dob=dob_status(E, a.bd, i), teams=team_names(E, i)[:4])
        evid.append(json.dumps(clean(e), separators=(",", ":")))
    A["feature_id"] = pd.array(feat, dtype="Int64")
    A["last_ps"] = pd.array([E.last_ps[x] if x is not None else None for x in feat], dtype="Int64")
    A["lag"] = pd.array(lag, dtype="Int64")
    A["fresh"], A["flags"], A["cause"], A["evidence"] = fresh, flags, causes, evid
    A["r1"] = [r["xwalk"][1] for r in R]

    # Leave-id-out: the builder's name fallback graded on the rows whose espn id is the truth.
    known = A[A.base_method.eq("espn_id")]
    X = pd.DataFrame({"season": known.season.to_numpy(), "pfr_player_name": known["name"].to_numpy(),
                      "college": known.college.to_numpy(), "espn_id": np.nan})
    lio, lio_m = linked(X, ps, "lio", I["tag"])
    truth = known.base_id.astype("int64").to_numpy()
    got = lio.to_numpy(dtype="float64", na_value=np.nan)
    lio_rep = {}
    for pop in ("D", "U"):
        m = (known["pop"] == pop).to_numpy()
        fnd = m & ~np.isnan(got)
        lio_rep[pop] = dict(n=int(m.sum()), found=int(fnd.sum()), correct=int((fnd & (got == truth)).sum()),
                            by_method=collections.Counter(lio_m.to_numpy()[fnd]),
                            wrong=[dict(key=k, truth=int(tr), got=int(g), method=mm) for k, tr, g, mm, w in
                                   zip(known["key"], truth, np.nan_to_num(got), lio_m, fnd & (got != truth)) if w][:20])
    # The new rules graded the same way.
    kn = known.index.to_numpy()
    rule_known = {}
    for k in RULES:
        acc = [(A.at[j, "key"], R[j][k][0], int(A.at[j, "base_id"])) for j in kn if R[j][k][0] is not None]
        rule_known[k] = dict(n=len(kn), accepted=len(acc), agree=sum(c == b for _, c, b in acc),
                             disagree=[dict(key=x, rule=c, truth=b) for x, c, b in acc if c != b][:20])
    # Crosswalk vs every base link, by base method.
    r1_agree = {}
    for m, g in A[A.base_id.notna()].groupby("base_method"):
        acc = [(A.at[j, "key"], A.at[j, "name"], R[j]["xwalk"][0], int(A.at[j, "base_id"])) for j in g.index
               if R[j]["xwalk"][0] is not None]
        r1_agree[m] = dict(rows=len(g), with_xw=int(g.xw_cid.notna().sum()), accepted=len(acc),
                           status=collections.Counter(g.r1), agree=sum(c == b for _, _, c, b in acc),
                           disagree=[dict(key=x, name=n, xw=c, base=b) for x, n, c, b in acc if c != b][:30])
    # DOB on base links, by method. espn_id rows say how often DOB disagrees on a near-certain link.
    dob = {}
    for m, g in A[A.base_id.notna()].groupby("base_method"):
        s = [dob_status(E, bd, int(b)) for bd, b in zip(g.bd, g.base_id)]
        dob[m] = dict(collections.Counter(s),
                      conflicts=[dict(key=k, name=n, nfl=bd, college=sorted(E.dob.get(int(b), ())))
                                 for k, n, bd, b, x in zip(g["key"], g["name"], g.bd, g.base_id, s) if x == "conflict"][:20])
    # End guard calibration: how often each source's last season reaches t0 on links taken as true.
    sure = [j for j in kn if dob_status(E, A.at[j, "bd"], int(A.at[j, "base_id"])) == "exact"]
    allb = [j for j in range(len(A)) if pd.notna(A.at[j, "base_id"])]

    unl = [j for j in range(len(A)) if pd.isna(A.at[j, "base_id"])]
    rep = dict(
        phase="2-3", created=time.strftime("%Y-%m-%dT%H:%M:%S"), provenance=prov, parity=parity(con, A),
        population=dict(D=len(d), U=len(u), multi_school=int(len(ms))),
        base_duplicate_ids={str(c): [A.at[j, "key"] for j in js] for c, js in used.items() if len(js) > 1},
        coverage=coverage(A),
        methods={p: A[A["pop"] == p].method.replace("", "unlinked").value_counts().to_dict() for p in ("D", "U")},
        causes={p: A[(A["pop"] == p) & A.feature_id.isna()].cause.value_counts().to_dict() for p in ("D", "U")},
        causes_by_pos={f"{p}:{q}": A[(A["pop"] == p) & (A.pos == q) & A.feature_id.isna()].cause.value_counts().to_dict()
                       for p in ("D", "U") for q in POS},
        flags=collections.Counter(f for x in A["flags"] for f in x.split(";") if f and not f.startswith("collision_with")),
        collisions=collisions,
        rule_conflicts=[dict(key=A.at[j, "key"], name=A.at[j, "name"],
                             ids={k: v[0] for k, v in R[j].items() if v[0] is not None})
                        for j, s in st.items() if s == "rule_conflict"],
        rule_status={k: collections.Counter(R[j][k][1] for j in unl if R[j][k][1]) for k in RULES},
        lio=lio_rep, rule_on_id_known=rule_known, r1_vs_base=r1_agree, dob_on_base=dob,
        end_guard_calibration=dict(espn_exact_dob=end_check(E, A, sure), all_base=end_check(E, A, allb)),
        xw_coverage={p: dict(n=int((A["pop"] == p).sum()), with_xw=int(A[A["pop"] == p].xw_cid.notna().sum()),
                             r1=collections.Counter(A[A["pop"] == p].r1)) for p in ("D", "U")},
        stale_espn_direct={p: int(A[A["pop"] == p]["flags"].str.contains("stale_espn_direct").sum()) for p in ("D", "U")},
    )
    named, ok = [], True
    for g, label, test in NAMED:
        m = A[A.gsis_id == g]
        if m.empty:
            named.append(dict(gsis_id=g, label=label, ok=False, why="missing"))
            ok = False
            continue
        a = m.iloc[0]
        r = dict(identity=iv(a["identity_id"]), base=iv(a["base_id"]), feature=iv(a["feature_id"]),
                 fresh=bool(a["fresh"]), r1=a["r1"], cause=a["cause"], method=a["method"])
        good = bool(test(E, r))
        ok &= good
        named.append(dict(gsis_id=g, label=label, ok=good, pop=a["pop"], name=a["name"], **r, flags=a["flags"]))
    rep["named"], rep["named_ok"] = named, ok
    cols = ["pop", "key", "gsis_id", "pfr", "name", "season", "t0", "position", "pos", "college", "espn_id", "xw_cid",
            "base_id", "base_method", "identity_id", "feature_id", "method", "last_ps", "lag", "fresh", "flags", "cause",
            "evidence"]
    A[cols].to_csv(OUT / "links.csv", index=False, lineterminator="\n")
    (OUT / "phase23.json").write_bytes(json.dumps(clean(rep), indent=1).encode("utf-8"))
    tot = {p: dict(n=int((A["pop"] == p).sum()), base=int(A[A["pop"] == p].base_id.notna().sum()),
                   identity=int(A[A["pop"] == p].identity_id.notna().sum()),
                   feature=int(A[A["pop"] == p].feature_id.notna().sum()), fresh=int(A[A["pop"] == p].fresh.sum()))
           for p in ("D", "U")}
    print(json.dumps(clean(dict(totals=tot, parity={k: v for k, v in rep["parity"].items() if k != "examples"},
                                named_fail=[x for x in named if not x["ok"]], methods=rep["methods"],
                                collisions=len(collisions), rule_conflicts=len(rep["rule_conflicts"]))), indent=1))
    print(f"  done {time.time() - t:.0f}s  named_ok={ok}  provenance_ok={prov['ok']}", flush=True)
    return 0 if ok and prov["ok"] else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--fresh", action="store_true")
    open_store()
    sys.exit(phase23(load(ap.parse_args().fresh)))


