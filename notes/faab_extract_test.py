#!/usr/bin/env python
"""Regression test for the waiver-archetype classifier.

Every case below was hand-verified against the week-by-week evidence dump
(notes/faab-cache/audit-taco-2023.txt and the same view for other seasons), and
each one guards a specific rule OR the ORDER of two rules. Move a rule and this
fails, which is the point: the order is the design.

    python notes/faab_extract_test.py

Needs notes/faab-cache/ populated. Run faab_extract.py first if it is empty.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import faab_extract as fx  # noqa: E402

# (season, player full name, effective week, expected situation, why this case exists)
CASES = [
    (2023, "Justice Hill", 2, "starter long-term injury",
     "J.K. Dobbins tore his Achilles in week 1; Hill was behind him on snaps"),
    (2023, "Robert Woods", 2, "entrenched NFL starter, unrostered",
     "Noah Brown went out BEHIND him. A 75%-snap starter did not emerge from that, "
     "which is the cumulative-snap gate in vacancy_ahead"),
    (2024, "Parker Washington", 9, "starter long-term injury",
     "Gabe Davis had more snaps and missed one week; Christian Kirk missed the rest "
     "of the season. The longest vacancy has to win, not the biggest name"),
    (2022, "Latavius Murray", 12, "starter left the team (cut or traded)",
     "Melvin Gordon was released by Denver and turned up in Kansas City"),
    (2023, "Matthew Stafford", 11, "returning starter from own absence",
     "his own absence outranks the backup who covered for him being 'absent' after"),
    (2023, "Baker Mayfield", 3, "entrenched NFL starter, unrostered",
     "100% of Tampa's snaps for two weeks and still on waivers"),
    (2023, "Jaleel McLaughlin", 5, "starter short-term injury",
     "he had just gone for 19.4 PPR, AND Javonte Williams missed week 5. The "
     "vacancy outranks the box score by design, so this case pins that order: a "
     "spike with the starter healthy is a bet on a role, a spike with the starter "
     "out is a one-week rental, and the labels have to tell them apart"),
    (2023, "Jordan Mason", 6, "healthy handcuff / backup stash",
     "Christian McCaffrey healthy and playing, Mason under 40% of snaps"),
    (2023, "Keaton Mitchell", 4, "speculative stash, minimal NFL role",
     "had not played a snap yet when the week-4 claim went in, so he is not a "
     "handcuff and Baltimore's third-string back is not the vacancy"),
    (2023, "Keaton Mitchell", 10, "breakout game",
     "by week 10 he had a 20.4-PPR week behind him, over the RB boom line"),
    (2023, "Tommy DeVito", 10, "starter long-term injury",
     "Daniel Jones was done for the season, and that outranks DeVito already "
     "having started two games"),
]



def check_note_tables_against_csv():
    """Recompute every statistic in the note's tables straight from the CSV and
    compare. The note's tables are written by faab_extract.py, so this is the
    independent read-back: a table that disagrees with its own data fails here."""
    import csv
    import re
    import statistics
    here = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(here, "faab-bids-2026-09-16.csv")
    note_path = os.path.join(here, "faab-bid-archetypes-2026-09-16.md")
    if not (os.path.exists(csv_path) and os.path.exists(note_path)):
        return ["faab-bids CSV or the note is missing; run faab_extract.py first"]

    rows = list(csv.DictReader(open(csv_path, encoding="utf-8")))
    keyers = {
        "Situation of emergence": lambda r: r["situation"],
        "Position": lambda r: r["pos_group"],
        "NFL experience at the pickup": lambda r: r["exp_tier"],
        "Point-production profile": lambda r: r["production_profile"],
        "Full four-dimension archetype": lambda r: r["archetype"],
    }
    text = open(note_path, encoding="utf-8").read()
    problems, checked = [], 0
    section, fmt, keyer = None, None, None
    for line in text.splitlines():
        h = re.match(r"^### (.+?), (dynasty|redraft)", line)
        if h:
            section, fmt = h.group(1), h.group(2)
            keyer = None
            for name, fn in keyers.items():
                if section.startswith(name):
                    keyer = fn
                    break
            continue
        if not line.startswith("| ") or keyer is None or line.startswith("|---"):
            continue
        # rsplit, not split: the four-dimension archetype labels contain " | "
        # themselves, and splitting left to right silently dropped all ten of
        # them, which were the rows most worth checking.
        cells = [c.strip() for c in line.strip().strip("|").rsplit("|", 8)]
        if len(cells) != 9 or cells[0] == "Archetype":
            continue
        label, n, med, iqr, q1, q3, mx, z, _zs = cells
        vals = sorted(int(r["bid"]) for r in rows
                      if r["format"] == fmt and r["status"] == "complete"
                      and int(r["bid"]) > 0 and keyer(r) == label)
        zeros = sum(1 for r in rows if r["format"] == fmt
                    and r["status"] == "complete" and int(r["bid"]) == 0
                    and keyer(r) == label)
        checked += 1
        if not vals:
            problems.append(f"{section} {fmt}: '{label}' has no priced claims in the CSV")
            continue
        if len(vals) != int(n):
            problems.append(f"{section} {fmt} '{label}': note says n={n}, CSV has {len(vals)}")
            continue
        if len(vals) > 1:
            a, _, b = statistics.quantiles(vals, n=4, method="inclusive")
        else:
            a = b = vals[0]
        want = {"median": statistics.median(vals), "q1": a, "q3": b,
                "iqr": b - a, "max": vals[-1], "zero": zeros}
        got = {"median": float(med), "q1": float(q1), "q3": float(q3),
               "iqr": float(iqr), "max": float(mx), "zero": int(z)}
        for k in want:
            if abs(round(want[k], 1) - got[k]) > 0.051:
                problems.append(f"{section} {fmt} '{label}': note {k}={got[k]}, "
                                f"CSV {k}={round(want[k], 1)}")
    if not checked:
        problems.append("parsed no table rows out of the note; the markers or the "
                        "table format changed")
    else:
        print(f"  ok  {checked} note table rows recomputed from the CSV and matched")
    return problems


def main():
    players = fx.players_nfl()
    by_name = {}
    for pid, p in players.items():
        by_name.setdefault(p.get("full_name"), []).append(pid)

    ctxs, failures, checked = {}, [], 0
    for season, name, week, expected, why in CASES:
        if season not in ctxs:
            ctxs[season] = fx.SeasonContext(season)
        ctx = ctxs[season]
        ids = by_name.get(name)
        assert ids, f"no player named {name} in players/nfl"
        pid = ids[0]
        pl = players[pid]
        got, ev = fx.classify_situation(
            ctx, pid, pl, week, season, None,
            fx.pos_group(pl.get("position")), "in-season")
        checked += 1
        if got != expected:
            failures.append(f"{name} {season} week {week}\n"
                            f"    expected: {expected}\n"
                            f"    got:      {got}\n"
                            f"    why:      {why}\n"
                            f"    evidence: {ev}")
        else:
            print(f"  ok  {name:<20} {season} w{week:<2} {got}")

    # the classifier must not invent a label that is not in the documented set
    documented = {
        "offseason rookie claim", "offseason veteran claim", "preseason claim",
        "kicker or team defense", "changed NFL teams", "no NFL snaps that season",
        "returning starter from own absence", "injured or unavailable stash",
        "starter left the team (cut or traded)", "starter long-term injury",
        "starter short-term injury", "entrenched NFL starter, unrostered",
        "breakout game", "usage takeover, no big box score",
        "healthy handcuff / backup stash", "rookie ramping into a role",
        "one-week stream / roster filler", "speculative stash, minimal NFL role",
        "rotational piece, no role change", "unclassified, no signal in the data",
    }
    csv_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            "faab-bids-2026-09-16.csv")
    if os.path.exists(csv_path):
        import csv
        seen = {r["situation"] for r in csv.DictReader(open(csv_path, encoding="utf-8"))}
        stray = seen - documented
        checked += 1
        if stray:
            failures.append(f"CSV carries situation labels the note does not document: {stray}")
        else:
            print(f"  ok  every situation label in the CSV is documented ({len(seen)} in use)")

    failures += check_note_tables_against_csv()
    checked += 1

    print()
    if failures:
        print(f"FAIL {len(failures)} of {checked}")
        for f in failures:
            print("  " + f)
        sys.exit(1)
    print(f"PASS {checked} checks")


if __name__ == "__main__":
    main()
