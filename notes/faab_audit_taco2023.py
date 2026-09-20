#!/usr/bin/env python
"""Week-by-week hand-audit dump for ONE full season (Password is taco, 2023).

This is the evidence file behind the situation taxonomy in
faab-bid-archetypes-2026-09-16.md. It loops every waiver add in that season in
week order and prints the raw facts a human needs to name the situation: the
player, his NFL team, his snap share and PPR points in the weeks either side of
the pickup, and the same for the established starter ahead of him. Nothing here
is classified; the point is to read what is actually in the data before writing
rules.

    python notes/faab_audit_taco2023.py > notes/faab-cache/audit-taco-2023.txt
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import faab_extract as fx  # noqa: E402

LEAGUE = "Password is taco"
SEASON = 2023


def main():
    resolved = fx.verify_chains()
    rows = [r for r in fx.extract_bids(resolved)
            if r["league"] == LEAGUE and r["season"] == SEASON]
    holds = fx.hold_lengths(resolved)
    players = fx.players_nfl()
    ctx = fx.SeasonContext(SEASON)

    def line(pid, wk):
        r = ctx.row(pid, wk)
        if r is None:
            return "  --  "
        s = r["s"]
        if not s.get("gp"):
            return " DNP  "
        sh = fx.snap_share(r)
        return f"{(sh or 0) * 100:3.0f}%/{s.get('pts_ppr') or 0:5.1f}"

    for r in sorted(rows, key=lambda r: (r["created_ms"],)):
        pl = players.get(r["player_id"]) or {}
        phase, wk = ctx.phase_and_week(r["created_ms"])
        grp = fx.pos_group(pl.get("position"))
        team = None
        for w in range(wk, 0, -1):
            team = ctx.team_of(r["player_id"], w)
            if team:
                break
        hold = holds.get((r["league_id"], r["roster_id"], r["player_id"], r["week"]))
        rk = (pl.get("metadata") or {}).get("rookie_year")
        exp, _ = fx.exp_at_pickup(pl, SEASON)
        print(f"\n[{phase} wk{wk:>2}] ${r['bid']:>3} {r['status']:<8} "
              f"{pl.get('full_name', '?'):<24} {pl.get('position') or '?':<4} "
              f"{team or '?':<4} exp={exp} rookie_yr={rk} held={hold}w "
              f"roster={r['roster_id']}")
        window = [w for w in range(max(1, wk - 3), min(18, wk + 3) + 1)]
        print("      self   " + " ".join(f"w{w:<2}{line(r['player_id'], w)}" for w in window))
        if team and grp:
            mates = {}
            for w in range(1, wk):
                for m in ctx.by_team.get((team, w), []):
                    if m["pid"] == r["player_id"] or fx.pos_group(m["pos"]) != grp:
                        continue
                    mates[m["pid"]] = mates.get(m["pid"], 0) + (m["s"].get("off_snp") or 0) \
                        + (m["s"].get("def_snp") or 0)
            for mp, _sn in sorted(mates.items(), key=lambda kv: -kv[1])[:2]:
                nm = (players.get(mp) or {}).get("full_name", mp)
                print(f"      ahead: {nm[:20]:<20} "
                      + " ".join(f"w{w:<2}{line(mp, w)}" for w in window))


if __name__ == "__main__":
    main()
