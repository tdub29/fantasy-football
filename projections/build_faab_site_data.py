"""Build site/data/faab.js from the pre-claim FAAB research dimensions plus per league.

The site uses NFL experience at pickup, situation of emergence, and position. The
source also carries production after pickup, but that is hindsight and must not shape
a bid recommendation or archetype shown at decision time.

Source of truth is the row-level CSV rather than notes/faab-archetype-stats.json,
because the stats JSON is pre-aggregated with no league column and per-league splits
cannot be recovered from it.

Usage:
    python projections/build_faab_site_data.py
"""
import csv
import datetime
import io
import json
import pathlib
import statistics
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "notes" / "faab-bids-2026-09-16.csv"
OUT = ROOT / "site" / "data" / "faab.js"

# Under this many priced claims a median is a hint, not a rate. Carried through to
# the UI as `thin` so a 4-claim bucket cannot masquerade as a market.
THIN_N = 5
# Pre-claim dimensions, ordered by usefulness while pricing a live claim.
DIMENSIONS = [
    ("situation", "situation", "What happened"),
    ("position", "pos_group", "Position"),
    ("experience", "exp_tier", "NFL experience"),
]


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def claim_record(row, dimensions):
    """Small, public history row for one priced claim.

    IDs stay in the research CSV. The site only needs display values and the
    labels used to match a claim to a visible bucket. `eff_week` is the
    classifier's corrected NFL week; Sleeper's raw week is wrong offseason.
    """
    created_ms = int(row["created_ms"])
    return {
        "player": row["player"],
        "season": int(row["season"]),
        "week": int(row["eff_week"]),
        "date": datetime.datetime.fromtimestamp(
            created_ms / 1000, datetime.timezone.utc
        ).date().isoformat(),
        "bid": num(row["bid"]),
        "pct": num(row["bid_pct_budget"]),
        "pos": row["pos_group"],
        "team": row["nfl_team_at_pickup"],
        # Sleeper's PPR projection for the claim week: what the claimant saw, and
        # the distance the waiver board's per-player comps are matched on.
        "proj": None if num(row.get("proj_ppr")) is None else round(num(row["proj_ppr"]), 1),
        "phase": row["phase"],
        **{key: row[source] or "unknown" for key, source, _ in dimensions},
    }


def quantile(sorted_vals, q):
    """Linear-interpolated quantile. statistics.quantiles needs n>=2 and returns
    cut points, which is awkward for a 1-claim bucket that still has to render."""
    if not sorted_vals:
        return None
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    pos = (len(sorted_vals) - 1) * q
    lo, hi = int(pos), min(int(pos) + 1, len(sorted_vals) - 1)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (pos - lo)


def summarize(rows):
    """One bucket's box-plot stats. `rows` are PRICED claims only."""
    bids = sorted(r["bid"] for r in rows)
    pcts = sorted(r["pct"] for r in rows if r["pct"] is not None)
    if not bids:
        return None
    return {
        "n": len(bids),
        "min": round(bids[0], 1),
        "q1": round(quantile(bids, 0.25), 1),
        "median": round(quantile(bids, 0.5), 1),
        "q3": round(quantile(bids, 0.75), 1),
        "max": round(bids[-1], 1),
        "mean": round(statistics.fmean(bids), 1),
        # Percent of budget is the only cross-league comparable figure, since the
        # four leagues run 200, 200, 150 and 100.
        "medianPct": round(quantile(pcts, 0.5), 1) if pcts else None,
        "thin": len(bids) < THIN_N,
    }


def bucket(rows, key, zero_rows):
    """dim value -> summary, sorted by median desc, with the zero-bid share attached."""
    groups, zero_groups = {}, {}
    for r in rows:
        groups.setdefault(r[key] or "unknown", []).append(r)
    for r in zero_rows:
        zero_groups.setdefault(r[key] or "unknown", []).append(r)
    out = []
    for name, rs in groups.items():
        s = summarize(rs)
        if not s:
            continue
        z = len(zero_groups.get(name, []))
        s["situation"] = name          # kept as `situation` so the panel reads one field
        # Share of ALL completed claims here that went for nothing. A situation
        # nobody bids on is a different fact from a cheap one.
        s["zeroShare"] = round(z / (z + s["n"]) * 100, 1) if (z + s["n"]) else 0.0
        out.append(s)
    out.sort(key=lambda x: (-x["median"], -x["n"]))
    return out


def main():
    if not CSV_PATH.exists():
        raise SystemExit(f"missing {CSV_PATH}; run the research extractor first")
    raw = list(csv.DictReader(io.open(CSV_PATH, encoding="utf-8")))

    # Only COMPLETED claims describe a price. A failed claim is a bid nobody paid.
    done = [r for r in raw if (r.get("status") or "") == "complete"]
    rows, zeros = [], []
    for r in done:
        bid, pct = num(r.get("bid")), num(r.get("bid_pct_budget"))
        rec = {
            "bid": bid, "pct": pct,
            "league": r.get("league") or "unknown",
            "budget": num(r.get("budget")),
            "format": r.get("format") or "unknown",
            "phase": r.get("phase") or "unknown",
            **{k: (r.get(src) or "unknown") for k, src, _ in DIMENSIONS},
        }
        (rows if (bid or 0) > 0 else zeros).append(rec)

    payload = {
        "generated": None,   # stamped below; Date is not available in the builder
        "source": "notes/faab-bids-2026-09-16.csv",
        "thinN": THIN_N,
        "dimLabels": {k: label for k, _, label in DIMENSIONS},
        "formats": {},       # format -> decision-time dimension -> [buckets]
        "leagues": {},       # league -> {format, budget, dims, counts}
        "counts": {},
        "excluded": {"Washington Football League": "ESPN, not on the Sleeper API"},
    }

    for fmt in sorted({r["format"] for r in rows}):
        fr = [r for r in rows if r["format"] == fmt]
        fz = [r for r in zeros if r["format"] == fmt]
        payload["formats"][fmt] = {k: bucket(fr, k, fz) for k, _, _ in DIMENSIONS}
        # Offseason share is the one finding that separates the two markets: 27% of
        # dynasty priced claims are offseason or preseason, and none in redraft.
        off = sum(1 for r in fr if r["phase"] in ("offseason", "preseason"))
        payload["counts"][fmt] = {
            "completed_priced": len(fr),
            "completed_zero_dollar": len(fz),
            "zero_share_pct": round(len(fz) / (len(fr) + len(fz)) * 100, 1) if (len(fr) + len(fz)) else 0.0,
            "offseason_pct": round(off / len(fr) * 100, 1) if fr else 0.0,
            "median_pct_budget": round(
                quantile(sorted(r["pct"] for r in fr if r["pct"] is not None), 0.5), 1) if fr else None,
            "leagues": sorted({r["league"] for r in fr}),
        }

    # Per league, because budgets differ and so does the local market.
    for lg in sorted({r["league"] for r in rows}):
        lr = [r for r in rows if r["league"] == lg]
        lz = [r for r in zeros if r["league"] == lg]
        budgets = sorted({r["budget"] for r in lr if r["budget"]})
        payload["leagues"][lg] = {
            "format": lr[0]["format"],
            "budget": budgets[-1] if budgets else None,
            "priced": len(lr),
            "zeroDollar": len(lz),
            "medianBid": round(quantile(sorted(r["bid"] for r in lr), 0.5), 1),
            "maxBid": round(max(r["bid"] for r in lr), 1),
            "medianPct": round(quantile(sorted(r["pct"] for r in lr if r["pct"] is not None), 0.5), 1)
                         if any(r["pct"] is not None for r in lr) else None,
            "dims": {k: bucket(lr, k, lz) for k, _, _ in DIMENSIONS},
            # All completed claims feed recommendations, including $0 adds. The UI
            # filters to paid rows for archetype drilldowns so displayed n stays exact.
            # League and format are inherited from this parent object.
            "claims": sorted(
                (claim_record(r, DIMENSIONS) for r in done
                 if r["league"] == lg),
                key=lambda r: (r["date"], r["player"]),
                reverse=True,
            ),
        }

    import time
    payload["generated"] = time.strftime("%Y-%m-%d")
    OUT.write_text("window.FAAB_ARCHETYPES = " + json.dumps(payload, separators=(",", ":")) + ";\n",
                   encoding="utf-8")
    kb = OUT.stat().st_size / 1024
    print(f"wrote {OUT.relative_to(ROOT)}: {kb:.0f} KB")
    for fmt, c in payload["counts"].items():
        dims = payload["formats"][fmt]
        print(f"  {fmt}: {c['completed_priced']} priced, {c['completed_zero_dollar']} at $0, "
              f"{c['offseason_pct']}% offseason, median {c['median_pct_budget']}% of budget")
        for k, _, label in DIMENSIONS:
            print(f"     {label}: {len(dims[k])} buckets")
    for lg, v in payload["leagues"].items():
        print(f"  {lg}: {v['format']}, budget {v['budget']}, {v['priced']} priced, "
              f"median ${v['medianBid']} ({v['medianPct']}% of budget)")
    return 0


def self_check():
    """Quantiles and the zero-share denominator, the two things easy to get wrong."""
    assert quantile([5], 0.5) == 5
    assert quantile([1, 2, 3, 4], 0.5) == 2.5
    assert quantile([1, 2, 3, 4], 0.25) == 1.75
    priced = [{"bid": 10.0, "pct": 5.0, "situation": "x"},
              {"bid": 20.0, "pct": 10.0, "situation": "x"}]
    zero = [{"bid": 0.0, "pct": 0.0, "situation": "x"},
            {"bid": 0.0, "pct": 0.0, "situation": "x"}]
    b = bucket(priced, "situation", zero)[0]
    assert b["n"] == 2 and b["median"] == 15.0, b
    # 2 priced + 2 free = 50% went for nothing, not 100% and not 0%.
    assert b["zeroShare"] == 50.0, b["zeroShare"]
    assert b["thin"] is True, "2 claims must be flagged thin"
    raw = {
        "player": "Test Player", "season": "2025", "eff_week": "4",
        "created_ms": "1758697200000", "bid": "17", "bid_pct_budget": "8.5",
        "pos_group": "RB", "nfl_team_at_pickup": "SEA", "phase": "in-season",
        "situation": "breakout game", "exp_tier": "NFL years 2-3",
        "production_profile": "upside play",
    }
    claim = claim_record(raw, DIMENSIONS)
    assert claim == {
        "player": "Test Player", "season": 2025, "week": 4,
        "date": "2025-09-24", "bid": 17.0, "pct": 8.5, "pos": "RB",
        "team": "SEA", "phase": "in-season", "situation": "breakout game",
        "position": "RB", "experience": "NFL years 2-3",
    }, claim
    assert not {"league_id", "roster_id", "player_id", "transaction_id"} & claim.keys()
    print("build_faab_site_data self-check ok")
    return 0


if __name__ == "__main__":
    sys.exit(self_check() if "--self-check" in sys.argv else main())
