"""Render the TE lane results tables from notes/prospect-research/lanes/te/results.json (markdown to stdout).

    python projections/lanes/te/te_report.py
"""
import json
import pathlib

NOTES = pathlib.Path(__file__).resolve().parents[3] / "notes" / "prospect-research" / "lanes" / "te"


def main():
    b = {k: v for k, v in json.loads((NOTES / "results.json").read_text(encoding="utf-8")).items() if k.startswith("T")}
    print("| ID | All ratio / slope | First-eligible ratio / slope | D1 top 60 ratio / slope | Served log loss vs stars+year (season resamples) | vs S4n4 | Verdict |")
    print("|---|---|---|---|---|---|---|")
    for cid, o in b.items():
        g = o["gates"]
        f = lambda k: f"{g[k]['ratio']:.2f} / {g[k]['slope']:.2f}"
        v = o["vs_stars_stage"]
        s4 = o.get("vs_s4n4", {})
        print(f"| {cid} | {f('all')} | {f('first_eligible')} | {f('top60')} | {v['base_logloss']:.4f} to {o['served_logloss']:.4f} "
              f"({v['boot_by_season']['p']:.0%}) | {s4.get('s4n4_logloss', float('nan')):.4f} to {o['served_logloss']:.4f} "
              f"({s4.get('boot_by_season', {}).get('p', float('nan')):.0%}) | {'pass' if o['pass'] else 'fail'} |")
    print()
    print("Season-resampling support (share of 4,000 resamples of the 10 replayed seasons inside each band):")
    print()
    keys = ["all_ratio", "all_slope", "first_eligible_ratio", "first_eligible_slope", "top60_ratio", "top60_slope", "all_six"]
    print("| ID | " + " | ".join(keys) + " |")
    print("|---" * (len(keys) + 1) + "|")
    for cid, o in b.items():
        print(f"| {cid} | " + " | ".join(f"{o['season_support'][k]:.0%}" for k in keys) + " |")
    print()
    print("Ratio by completed-season college year (2 = first-eligible): predicted / observed (events)")
    print()
    for cid, o in b.items():
        print(f"- {cid}: " + ", ".join(f"year {x['year']}{'+' if x['year'] == 4 else ''} {x['ratio']:.2f} ({x['events']})"
                                        for x in o["by_college_year"]))
    print()
    for cid, o in b.items():
        cs = [x["C"] for x in o["fits"]]
        ks = [x["k"] for x in o["fits"]]
        late = o["replays_2017_2021"]
        print(f"- {cid}: chosen C per replay {cs}, k {ks}; AUC {o['auc']:.3f} (stars+year {o['vs_stars_stage']['base_auc']:.3f}); "
              f"drafted-only AUC {o['vs_stars_stage']['drafted_base_auc']:.3f} to {o['vs_stars_stage']['drafted_cand_auc']:.3f}; "
              f"2017-2021 replays ratio {late['all']['ratio']:.2f} slope {late['all']['slope']:.2f}, first-eligible "
              f"{late['first_eligible']['ratio']:.2f}; {o['players']} players, {o['players_hit']} hit")


if __name__ == "__main__":
    main()
