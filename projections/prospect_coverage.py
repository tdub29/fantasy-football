"""Coverage and feature registry for the prospect model, written from the SQLite store.

    python projections/prospect_db.py coverage     # -> notes/prospect-research/data-coverage.md

Population A coverage (drafted 2008+) by class, population B (every exiting FBS player) by class,
and the feature registry: source, time known, phase, coverage, and the verdict of every experiment
that tested the feature (read from notes/prospect-research/experiments/*.json, so it cannot drift).
"""
from __future__ import annotations

import json
import pathlib
import sys
import warnings

import numpy as np
import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import build_prospect_model as bpm  # noqa: E402

OUT = bpm.ROOT / "notes" / "prospect-research" / "data-coverage.md"
EXP = bpm.ROOT / "notes" / "prospect-research" / "experiments"

# feature -> (family, source, known at, phases it may serve, candidate ids that tested it)
REGISTRY = {
    "log_pick": ("draft capital", "nflverse draft_picks", "the pick", "post-draft", ["A0"]),
    "ryptpa_career": ("production", "ESPN PBP receiving / team pass att", "end of final season", "pre + post", ["A0", "A14", "B1", "B2", "B8", "B10"]),
    "ryptpa_best": ("production", "ESPN PBP", "end of final season", "pre + post", ["A0", "A14", "B1", "B2", "B8", "B10"]),
    "ryptpa_final": ("production", "ESPN PBP", "end of final season", "pre + post", ["A0", "A14", "B1", "B2", "B8", "B10"]),
    "scrim_ypg": ("production", "ESPN PBP", "end of final season", "pre + post", ["A0", "A14", "B1", "B2", "B8", "B10"]),
    "rush_ypg_best": ("production (QB)", "ESPN PBP", "end of final season", "pre + post", ["A0", "A14", "B1", "B2", "B8", "B10"]),
    "comp_final": ("production (QB)", "ESPN PBP", "end of final season", "pre + post", ["A0", "A14", "B1", "B2", "B8", "B10"]),
    "dom_best": ("dominator", "ESPN PBP", "end of final season", "pre + post", ["B2"]),
    "dom_final": ("dominator", "ESPN PBP", "end of final season", "pre + post", ["B2"]),
    "target_share_best": ("usage", "ESPN PBP targets", "end of final season", "pre + post", ["A6"]),
    "rec_epa_best": ("efficiency", "ESPN PBP EPA", "end of final season", "pre + post", ["A5"]),
    "rush_succ_best": ("efficiency", "ESPN PBP success", "end of final season", "pre + post", ["A5"]),
    "fd_share_best": ("usage quality", "sportsdataverse usage", "end of final season", "pre + post", ["A12", "B7", "B10"]),
    "explosive_best": ("usage quality", "sportsdataverse usage", "end of final season", "pre + post", ["A12", "B7", "B10"]),
    "team_off_final": ("team context", "sportsdataverse cfb_ratings", "end of final season", "pre + post", ["A11", "B7", "B10"]),
    "sos_career": ("schedule strength", "cfb_ratings + opponent splits", "end of final season", "pre + post", ["A11", "B7", "B10"]),
    "power": ("conference", "ESPN fbs_class", "end of final season", "pre + post", ["A0", "A14", "B1", "B2", "B8", "B10"]),
    "early": ("declaration", "seasons on file", "declaration", "pre + post", ["A0", "A14", "B1", "B2", "B8", "B10"]),
    "early_covid": ("declaration", "seasons excl. 2020", "declaration", "pre + post", ["A2"]),
    "n_seasons": ("experience", "seasons on file", "declaration", "pre + post", ["B2"]),
    "draft_age": ("age (estimated)", "class year, 18.71 + years", "any time", "pre + post", ["A0", "A14", "B1", "B2", "B8", "B10"]),
    "draft_age_real": ("age (observed)", "nflverse birth_date", "draft day (drafted only)", "post-draft", ["A1", "A3"]),
    "stars": ("recruiting", "247 stars", "signing day", "pre + post", ["A0", "B0s", "B1", "B2"]),
    "grade": ("recruiting", "247 composite grade", "signing day", "pre + post", ["A4"]),
    "weight": ("size", "combine, else college roster", "combine / roster", "pre + post", ["A0", "B2"]),
    "speed_score": ("athleticism", "nflverse combine", "combine (Feb-Mar)", "post-combine", ["A0", "A8", "B4"]),
    "no_forty": ("athleticism missingness", "nflverse combine", "combine", "post-combine", ["A8"]),
    "invited": ("combine invite", "nflverse combine", "combine", "post-combine", ["B4"]),
    "tm_pass_att_prev": ("landing spot", "nflverse prior-season stats", "draft day", "post-draft", ["A9"]),
    "tm_pos_ppr_prev": ("landing spot", "nflverse prior-season stats", "draft day", "post-draft", ["A9"]),
    "pre_logit": ("population B summary", "B model, forward out-of-fold", "draft day", "post-draft", ["A13"]),
    "aya_final": ("production (QB)", "ESPN PBP", "end of final season", "pre + post", ["A14"]),
    "starts": ("experience (QB)", "ESPN PBP", "end of final season", "pre + post", ["A14"]),
    "n_qual": ("experience", "seasons on file", "declaration", "pre", ["B2", "B8", "B10"]),
    "stars_missing": ("recruiting missingness", "247 stars null or unmatched", "signing day", "pre", ["B6"]),
    "stage": ("college year", "season minus recruit class", "any time", "pre (served)", ["S1", "S2", "S3"]),
    "age_k": ("age (estimated)", "18.71 + seasons", "any time", "pre (served)", ["S1", "S2", "S3"]),
    "live_yptpa": ("live production", "sportsdataverse player + team box", "after his team's 4th game", "pre (served)", ["S4n4", "S4n8", "S5n4"]),
    "live_rec_share": ("live production", "sportsdataverse player box", "after his team's 4th game", "pre (served)", ["S4n4", "S4n8", "S5n4"]),
    "live_scrim_pg": ("live production", "sportsdataverse player box", "after his team's 4th game", "pre (served)", ["S4n4", "S4n8", "S5n4"]),
    "live_games": ("live availability", "sportsdataverse player box", "after his team's 4th game", "pre (served)", ["S4n4", "S4n8", "S5n4"]),
    "has_live": ("live availability", "sportsdataverse player box", "after his team's 4th game", "pre (served)", ["S4n4", "S4n8", "S5n4"]),
}
# Families searched but never built, with the reason (see public-source-registry.md).
NOT_BUILT = [
    ("breakout age", "built, display-only since v1 (dropping it improved WR); estimated ages only", "redundant"),
    ("real birth date, college players", "no key-free source (ESPN DOB null after 2013)", "unavailable"),
    ("pro-day testing", "RAS archive frozen at 2019: train-serve skew", "unavailable"),
    ("pre-draft consensus rank (FantasyPros rookie ECR)", "5 mature classes, terms unverified", "deferred to Jan 2027"),
    ("routes, snaps, PFF grades (college)", "not public", "unavailable"),
    ("injury history (college)", "no reliable dated public source found", "unavailable"),
    ("transfer / redshirt history", "player-level history not public; team portal counts only", "too sparse"),
    ("vacated targets at landing spot", "needs the post-draft roster", "leakage"),
    ("film / scouting grades", "no licensed, dated public source", "unavailable"),
]


def verdicts() -> dict:
    out = {}
    for f in EXP.glob("[AB]*.json"):
        r = json.loads(f.read_text(encoding="utf-8"))
        out[r["id"]] = {pos: x["verdict"] for pos, x in r["results"].items()}
    return out


def served_table() -> list[str]:
    """Pre-draft candidates replayed through the served code (prospect_serving_backtest.py), 2012-2021 seasons."""
    sb, rv = EXP / "serving-backtest.json", EXP / "reviews.json"
    if not sb.exists():
        return []
    b = json.loads(sb.read_text(encoding="utf-8"))
    reviews = json.loads(rv.read_text(encoding="utf-8")).get("reviews", {}) if rv.exists() else {}
    f = lambda x: f"{x['ratio']:.2f} / {x['slope']:.2f}" if x.get("ratio") is not None else "n/a"
    L = ["", "### Served pre-draft models (serving backtest, next class, 2012-2021 replays)", "",
         "Gates: mean ratio 0.8-1.25 and calibration slope 0.75-1.25 on all rows, first-eligible rows and (from addendum 10) "
         "each season's top 60 by the model; then an independent review. Ratio / slope shown.", "",
         "| Candidate | Position | All rows | First-eligible | Top 60 | Log loss vs stars + stage | Gates | Review |",
         "|---|---|---|---|---|---|---|---|"]
    for k, x in b.items():
        cid, pos = k.split()
        if not cid.startswith("S"):
            continue
        vs = x.get("vs_stars_stage", {})
        ll = f"{vs['base_logloss']:.4f} to {vs['cand_logloss']:.4f}" if vs else "n/a"
        top = x.get("top60_by_pd", {})
        gates = "fail" if not x["pass"] else ("pass, D1 not scored" if "top60_pass" not in x else "pass" if x["top60_pass"] else "fail (D1)")
        r = reviews.get(f"{cid} {pos}", {}).get("verdict", "")
        L.append(f"| {cid} | {pos} | {f(x['all'])} | {f(x['first_eligible'])} | {f(top) if top else 'not scored'} | {ll} | {gates} | {r} |")
    return L


def write_report(con=None):
    warnings.filterwarnings("ignore")
    import prospect_experiments as pe
    import prospect_population as pp
    bpm.SOURCE = "db"
    ps, bio, d, t, age0 = bpm.prepare(say=lambda *a: None)
    con = bpm._CON
    t = pe.enrich(ps, bio, d, t, age0, con)
    L = ["# Prospect data coverage and feature registry", "",
         "Generated by `python projections/prospect_db.py coverage` from the SQLite store. Missing means the source has no "
         "value; estimated means derived, not measured; inapplicable means the feature does not exist for that player. "
         "Never-played undrafted players are real zeros in population B, not missing.", ""]
    # ---- population A
    dd = d[d.draft_year >= bpm.FIRST_CLASS]
    a = dd.groupby("draft_year").agg(drafted=("gsis_id", "size"), linked=("player_id", lambda s: s.notna().sum()),
                                     dob=("dob", lambda s: s.notna().sum()), forty=("forty", lambda s: s.notna().sum()))
    tt = t[t.gsis_id.notna()]
    a["stars"] = tt.groupby("draft_year").stars.apply(lambda s: s.notna().sum())
    a["grade"] = tt.groupby("draft_year").grade.apply(lambda s: s.notna().sum())
    a["usage"] = tt.groupby("draft_year").fd_share_best.apply(lambda s: s.notna().sum())
    a["outcome"] = [("final, all positions" if y <= min(bpm.LAST_CLASS.values()) else
                     "final WR/RB, open QB/TE" if y <= max(bpm.LAST_CLASS.values()) else "open") for y in a.index]
    L += ["## Population A: drafted QB/RB/WR/TE (counts by class)", "",
          "| Class | Drafted | Linked to college | Real DOB | Combine forty | Stars (linked) | Composite grade (linked) | Usage file (linked) | Outcome |",
          "|---|---|---|---|---|---|---|---|---|"]
    for y, r in a.iterrows():
        L.append(f"| {y} | {r.drafted} | {r.linked} | {r.dob} | {r.forty} | {int(r.stars or 0)} | {int(r.grade or 0)} | "
                 f"{int(r.usage or 0)} | {r.outcome} |")
    L.append(f"| all | {a.drafted.sum()} | {a.linked.sum()} ({a.linked.sum() / a.drafted.sum():.1%}) | {a.dob.sum()} | "
             f"{a.forty.sum()} | {int(a.stars.sum())} | {int(a.grade.sum())} | {int(a.usage.sum())} | |")
    L.append("")
    # ---- population B
    e = pp.build(ps, bio, d, t, age0, con, say=lambda *a: None)
    e = e[e.draft_year >= bpm.FIRST_CLASS]
    b = e.groupby("draft_year").agg(exits=("sid", "size"), drafted=("drafted", "sum"), udfa=("udfa", "sum"),
                                    pos_inferred=("pos_src", lambda s: (s == "inferred").sum()),
                                    hits=("hit", "sum"), open_=("hit", lambda s: s.isna().sum()))
    L += ["## Population B: every exiting FBS QB/RB/WR/TE with a qualifying season (by decision class)", "",
          "| Class | Exits | Drafted | Undrafted, linked to an NFL roster | Position inferred (pre-2014 rosters) | Hits | Outcome open |",
          "|---|---|---|---|---|---|---|"]
    for y, r in b.iterrows():
        L.append(f"| {y} | {r.exits} | {int(r.drafted)} | {int(r.udfa)} | {int(r.pos_inferred)} | {int(r.hits)} | {int(r.open_)} |")
    L += ["", "Position inference (usage, then recruit position and weight) agrees with ESPN's own position on 94.6% "
          "of the population's ESPN-positioned rows (`python projections/prospect_population.py`). FCS and lower "
          "divisions are absent from the college feed, so FCS players (most undrafted hits: Ekeler, Cruz, Thielen) are "
          "outside population B.", ""]
    # ---- feature registry
    v = verdicts()
    L += ["## Feature registry", "",
          "| Feature | Family | Source | Known at | Phase | Coverage, linked draftees 2008-2023 | Tested in, verdict per position |",
          "|---|---|---|---|---|---|---|"]
    hist = tt[tt.draft_year <= 2023]
    for f, (fam, src, when, phase, ids) in REGISTRY.items():
        cov = f"{hist[f].notna().mean():.0%}" if f in hist else "n/a"
        tested = "; ".join(f"{i}: " + ", ".join(f"{p} {pe.final_verdict(i, p, s_).replace('**', '')}" for p, s_ in v[i].items())
                           for i in ids if i in v) or ("served models table below" if ids and ids[0][0] == "S" else "baseline/definition")
        L.append(f"| `{f}` | {fam} | {src} | {when} | {phase} | {cov} | {tested} |")
    L += served_table()
    L += ["", "### Families searched and not built", "", "| Family | Reason | Disposition |", "|---|---|---|"]
    L += [f"| {a_} | {b_} | {c_} |" for a_, b_, c_ in NOT_BUILT]
    OUT.write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    write_report()
