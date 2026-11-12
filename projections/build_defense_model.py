import json, re, os, pathlib
import pandas as pd
import numpy as np
from sklearn.linear_model import PoissonRegressor

ROOT = pathlib.Path(__file__).resolve().parent.parent
PARQUET_PATH = ROOT / "projections" / "nflverse-cache" / "stats_team_week_2026.parquet"
KICKERS_PATH = ROOT / "site" / "data" / "kickers.js"
OUT_PATH = ROOT / "site" / "data" / "defense-weekly.js"

def load_data():
    df = pd.read_parquet(PARQUET_PATH)
    df = df[(df["season"] == 2026) & (df["week"] <= 9) & (df["season_type"] == "REG")].copy()
    
    df["off_dropbacks"] = df["attempts"].fillna(0) + df["sacks_suffered"].fillna(0)
    df["def_takeaways"] = df["def_interceptions"].fillna(0) + df["fumble_recovery_opp"].fillna(0)
    df["off_giveaways"] = df["passing_interceptions"].fillna(0) + df["fumbles_lost_total"].fillna(0)
    df["def_pressures"] = df["def_sacks"].fillna(0) + df["def_qb_hits"].fillna(0)
    
    # Vectorized match to get opponent's off_dropbacks in that exact game
    opp_df = df[["week", "team", "off_dropbacks"]].rename(
        columns={"team": "opponent_team", "off_dropbacks": "opp_dropbacks"}
    )
    df = df.merge(opp_df, on=["week", "opponent_team"], how="left")
    df["opp_dropbacks"] = df["opp_dropbacks"].fillna(35.0)
    return df

def load_week10_matchups():
    text = open(KICKERS_PATH, "r", encoding="utf-8").read()
    m = re.search(r"window\.KICKER_MODEL\s*=\s*(\{.*?\});", text, re.DOTALL)
    if not m:
        return {}
    data = json.loads(m.group(1))
    matchups = {}
    for k in data.get("kickers", []):
        team = k["team"]
        opp = k["opp"]
        matchups[team] = {
            "opp": opp,
            "home": k.get("home", 0),
            "team_implied": float(k.get("impliedTotal", 21.0)),
        }
    for team, info in matchups.items():
        opp = info["opp"]
        info["opp_implied"] = matchups.get(opp, {}).get("team_implied", 21.0)
    return matchups

def compute_team_stats(df):
    agg = df.groupby("team").agg(
        games=("week", "count"),
        sacks_suffered=("sacks_suffered", "sum"),
        off_dropbacks=("off_dropbacks", "sum"),
        off_giveaways=("off_giveaways", "sum"),
        def_sacks=("def_sacks", "sum"),
        def_pressures=("def_pressures", "sum"),
        opp_dropbacks=("opp_dropbacks", "sum"),
        def_takeaways=("def_takeaways", "sum")
    ).reset_index()

    agg["sack_rate_allowed"] = np.where(agg["off_dropbacks"] > 0, agg["sacks_suffered"] / agg["off_dropbacks"], 0.065)
    agg["giveaways_per_game"] = np.where(agg["games"] > 0, agg["off_giveaways"] / agg["games"], 1.2)
    agg["def_sack_rate"] = np.where(agg["opp_dropbacks"] > 0, agg["def_sacks"] / agg["opp_dropbacks"], 0.065)
    agg["def_pressure_rate"] = np.where(agg["opp_dropbacks"] > 0, agg["def_pressures"] / agg["opp_dropbacks"], 0.22)
    agg["takeaways_per_game"] = np.where(agg["games"] > 0, agg["def_takeaways"] / agg["games"], 1.2)

    return agg.set_index("team").to_dict(orient="index")

def train_and_predict():
    df = load_data()
    matchups = load_week10_matchups()
    
    # Calculate point-in-time features per game: prior stats excluding current game
    # To be fast and exact: total sum minus current game stats
    team_full = df.groupby("team").agg(
        games=("week", "count"),
        sacks_suffered=("sacks_suffered", "sum"),
        off_dropbacks=("off_dropbacks", "sum"),
        off_giveaways=("off_giveaways", "sum"),
        def_sacks=("def_sacks", "sum"),
        def_pressures=("def_pressures", "sum"),
        opp_dropbacks=("opp_dropbacks", "sum"),
        def_takeaways=("def_takeaways", "sum")
    ).to_dict(orient="index")

    rows = []
    for _, row in df.iterrows():
        t = row["team"]
        opp = row["opponent_team"]
        tf = team_full.get(t)
        of = team_full.get(opp)
        if not tf or not of:
            continue
        # Leave out this single game
        t_games = tf["games"] - 1
        t_opp_db = tf["opp_dropbacks"] - row["opp_dropbacks"]
        t_def_sacks = tf["def_sacks"] - row["def_sacks"]
        t_def_pressures = tf["def_pressures"] - row["def_pressures"]
        t_def_to = tf["def_takeaways"] - row["def_takeaways"]
        
        o_games = of["games"] - 1
        o_off_db = of["off_dropbacks"] - row["sacks_suffered"] - row["attempts"]
        o_sacks_suff = of["sacks_suffered"] - row["def_sacks"]
        o_giveaways = of["off_giveaways"] - row["def_takeaways"]
        
        t_sack_rate = (t_def_sacks / t_opp_db) if t_opp_db > 0 else 0.065
        t_press_rate = (t_def_pressures / t_opp_db) if t_opp_db > 0 else 0.22
        o_sack_rate_allowed = (o_sacks_suff / o_off_db) if o_off_db > 0 else 0.065
        t_to_rate = (t_def_to / t_games) if t_games > 0 else 1.2
        o_ga_rate = (o_giveaways / o_games) if o_games > 0 else 1.2
        
        rows.append({
            "def_pressure_rate": t_press_rate,
            "def_sack_rate": t_sack_rate,
            "opp_sack_rate_allowed": o_sack_rate_allowed,
            "actual_sacks": row["def_sacks"],
            "takeaways_per_game": t_to_rate,
            "giveaways_per_game": o_ga_rate,
            "actual_to": row["def_takeaways"]
        })
        
    hist_df = pd.DataFrame(rows)
    
    # Model configuration validated by Ralph autonomous loop (winner: round 3 iter 7, deviance=2.6148)
    m_sacks = PoissonRegressor(alpha=0.0)
    m_sacks.fit(hist_df[["def_pressure_rate", "def_sack_rate", "opp_sack_rate_allowed"]], hist_df["actual_sacks"])
    
    m_to = PoissonRegressor(alpha=0.0)
    m_to.fit(hist_df[["takeaways_per_game", "giveaways_per_game"]], hist_df["actual_to"])
    
    current_team_stats = compute_team_stats(df)
    
    predictions = []
    for team, info in sorted(matchups.items()):
        opp = info["opp"]
        t_stat = current_team_stats.get(team, {
            "def_sack_rate": 0.065, "def_pressure_rate": 0.22, "takeaways_per_game": 1.2
        })
        opp_stat = current_team_stats.get(opp, {
            "sack_rate_allowed": 0.065, "giveaways_per_game": 1.2
        })
        
        pred_s = float(m_sacks.predict(pd.DataFrame([[t_stat["def_pressure_rate"], t_stat["def_sack_rate"], opp_stat["sack_rate_allowed"]]], columns=["def_pressure_rate", "def_sack_rate", "opp_sack_rate_allowed"]))[0])
        pred_to = float(m_to.predict(pd.DataFrame([[t_stat["takeaways_per_game"], opp_stat["giveaways_per_game"]]], columns=["takeaways_per_game", "giveaways_per_game"]))[0])
        
        opp_implied = info.get("opp_implied", 21.0)
        team_implied = info.get("team_implied", 21.0)
        spread = team_implied - opp_implied
        # Game script multiplier: favorite defense forces more dropbacks
        game_script_mult = 1.0 + (spread * 0.015)
        
        adj_sacks = round(max(0.5, pred_s * game_script_mult), 2)
        adj_to = round(max(0.3, pred_to * (1.0 + spread * 0.01)), 2)
        
        predictions.append({
            "team": team,
            "opp": opp,
            "home": info["home"],
            "exp_sacks": adj_sacks,
            "exp_turnovers": adj_to,
            "pressure_rate": round(float(t_stat["def_pressure_rate"]), 3),
            "opp_implied": round(opp_implied, 1),
            "team_implied": round(team_implied, 1),
        })

    payload = {
        "season": 2026,
        "week": 10,
        "generated": pd.Timestamp.now("UTC").strftime("%Y-%m-%dT%H:%M:%SZ"),
        "defenses": predictions
    }
    
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        f.write(f"window.DEFENSE_WEEKLY = {json.dumps(payload)};\n")
        
    print(f"Generated defense-weekly.js with {len(predictions)} team projections.")
    # Print top 5 projected defenses
    top_def = sorted(predictions, key=lambda x: (x["exp_sacks"] * 2.0 + x["exp_turnovers"] * 2.0), reverse=True)[:5]
    print("Top 5 D/ST Week 10:")
    for d in top_def:
        print(f"  {d['team']} vs {d['opp']} (home={d['home']}): sacks={d['exp_sacks']}, turnovers={d['exp_turnovers']}, opp_implied={d['opp_implied']}")
    return payload

if __name__ == "__main__":
    train_and_predict()
