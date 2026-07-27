"""Team environment / strength-of-schedule scoring from Draft Sharks' Fantasy
Environment Score (Beyond the Box Score "team environment" episode, KZhFFaliZCA).
Score = Vegas-based blend, heaviest weight on implied points/game (offense) plus
implied points allowed/game (defense/game script). Source article:
https://www.draftsharks.com/article/fantasy-environment-score

Emits site/data/environment.js (window.TEAM_ENV keyed by Sleeper team abbrev)."""
import json, pathlib

SITE = pathlib.Path(__file__).parent.parent / "site" / "data"
HERE = pathlib.Path(__file__).parent

# (env_rank, team, abbrev, env_score, implied_pf_per_game, implied_pa_per_game)
# Full Vegas implied points for + allowed, per game, from the Draft Sharks article.
ROWS = [
    (1, "Cowboys", "DAL", 3.12, 25.74, 24.58), (2, "Bengals", "CIN", 2.67, 25.97, 23.12),
    (3, "Rams", "LAR", 2.55, 26.49, 22.01), (4, "Lions", "DET", 2.54, 26.09, 22.53),
    (5, "Bills", "BUF", 2.53, 26.06, 22.56), (6, "Ravens", "BAL", 2.26, 25.93, 22.04),
    (7, "49ers", "SF", 1.58, 25.16, 22.40), (8, "Packers", "GB", 1.36, 24.93, 22.10),
    (9, "Bears", "CHI", 1.30, 24.53, 22.97), (10, "Commanders", "WAS", 1.18, 23.38, 24.83),
    (11, "Colts", "IND", 0.96, 23.37, 24.48), (12, "Seahawks", "SEA", 0.79, 24.82, 20.80),
    (13, "Buccaneers", "TB", 0.72, 23.34, 23.51), (14, "Jaguars", "JAX", 0.29, 23.26, 22.89),
    (15, "Patriots", "NE", 0.23, 23.76, 21.45), (16, "Chiefs", "KC", 0.19, 24.03, 21.18),
    (17, "Chargers", "LAC", 0.16, 23.74, 21.58), (18, "Eagles", "PHI", 0.13, 23.97, 21.06),
    (19, "Giants", "NYG", -0.39, 22.03, 23.97), (20, "Vikings", "MIN", -0.44, 22.53, 22.56),
    (21, "Saints", "NO", -0.87, 21.49, 23.36), (22, "Falcons", "ATL", -0.99, 21.16, 24.22),
    (23, "Texans", "HOU", -1.15, 22.74, 20.70), (24, "Titans", "TEN", -1.34, 20.65, 24.14),
    (25, "Broncos", "DEN", -1.38, 22.40, 20.69), (26, "Panthers", "CAR", -1.73, 20.69, 23.22),
    (27, "Steelers", "PIT", -1.79, 21.43, 22.01), (28, "Cardinals", "ARI", -1.93, 18.56, 27.00),
    (29, "Dolphins", "MIA", -2.12, 19.03, 24.88), (30, "Raiders", "LV", -2.86, 19.13, 23.84),
    (31, "Jets", "NYJ", -3.76, 18.56, 23.41), (32, "Browns", "CLE", -3.82, 18.76, 22.56),
]

def tier(rank):
    if rank <= 6:  return "target"    # elite offensive environment
    if rank <= 12: return "good"
    if rank <= 20: return "neutral"
    if rank <= 27: return "below"
    return "avoid"                      # bottom-5

def main():
    n = len(ROWS)
    # recompute PF/PA ranks from values so they're internally consistent.
    # pf_rank 1 = scores most; pa_rank 1 = allows fewest (best defense).
    pf_rank = {r[2]: i + 1 for i, r in enumerate(sorted(ROWS, key=lambda r: -r[4]))}
    pa_rank = {r[2]: i + 1 for i, r in enumerate(sorted(ROWS, key=lambda r: r[5]))}
    teams = {}
    for rank, name, ab, score, pf, pa in ROWS:
        teams[ab] = {
            "team": name, "abbr": ab, "env_rank": rank, "env_score": score,
            "implied_pf": pf, "pf_rank": pf_rank[ab],
            "implied_pa": pa, "pa_rank": pa_rank[ab],
            "tier": tier(rank), "total": n,
        }
    payload = {
        "source": "Draft Sharks Fantasy Environment Score (BBS team-environment ep KZhFFaliZCA)",
        "url": "https://www.draftsharks.com/article/fantasy-environment-score",
        "definition": "Vegas blend, heaviest weight on implied points/game (offense) + implied points allowed/game (defense/game script). Higher = better fantasy scoring environment.",
        "tiers": {"target": "top-6 (draft up)", "good": "7-12", "neutral": "13-20", "below": "21-27", "avoid": "bottom-5 (fade)"},
        "teams": teams,
    }
    SITE.mkdir(parents=True, exist_ok=True)
    (SITE / "environment.js").write_text(
        "window.TEAM_ENV = " + json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + ";\n", encoding="utf-8")
    (HERE / "team-environment.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote environment.js: {len(teams)} teams")
    print("target tier:", [r[1] for r in ROWS if tier(r[0]) == "target"])
    print("avoid tier:", [r[1] for r in ROWS if tier(r[0]) == "avoid"])

if __name__ == "__main__":
    main()
