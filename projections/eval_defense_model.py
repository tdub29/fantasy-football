import pathlib, json
import pandas as pd
import numpy as np
from sklearn.linear_model import PoissonRegressor
from sklearn.metrics import mean_poisson_deviance, mean_absolute_error
from sklearn.model_selection import KFold

ROOT = pathlib.Path(__file__).resolve().parent.parent
PARQUET_PATH = ROOT / "projections" / "nflverse-cache" / "stats_team_week_2026.parquet"

def get_prepared_data():
    df = pd.read_parquet(PARQUET_PATH)
    df = df[(df["season"] == 2026) & (df["week"] <= 9) & (df["season_type"] == "REG")].copy()
    
    df["off_dropbacks"] = df["attempts"].fillna(0) + df["sacks_suffered"].fillna(0)
    df["def_takeaways"] = df["def_interceptions"].fillna(0) + df["fumble_recovery_opp"].fillna(0)
    df["off_giveaways"] = df["passing_interceptions"].fillna(0) + df["fumbles_lost_total"].fillna(0)
    df["def_pressures"] = df["def_sacks"].fillna(0) + df["def_qb_hits"].fillna(0)
    
    opp_df = df[["week", "team", "off_dropbacks"]].rename(
        columns={"team": "opponent_team", "off_dropbacks": "opp_dropbacks"}
    )
    df = df.merge(opp_df, on=["week", "opponent_team"], how="left")
    df["opp_dropbacks"] = df["opp_dropbacks"].fillna(35.0)
    
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
        t_games = max(1, tf["games"] - 1)
        t_opp_db = max(10.0, tf["opp_dropbacks"] - row["opp_dropbacks"])
        t_def_sacks = max(0, tf["def_sacks"] - row["def_sacks"])
        t_def_pressures = max(0, tf["def_pressures"] - row["def_pressures"])
        t_def_to = max(0, tf["def_takeaways"] - row["def_takeaways"])
        
        o_games = max(1, of["games"] - 1)
        o_off_db = max(10.0, of["off_dropbacks"] - row["sacks_suffered"] - row["attempts"])
        o_sacks_suff = max(0, of["sacks_suffered"] - row["def_sacks"])
        o_giveaways = max(0, of["off_giveaways"] - row["def_takeaways"])
        
        rows.append({
            "def_sack_rate": t_def_sacks / t_opp_db,
            "def_pressure_rate": t_def_pressures / t_opp_db,
            "opp_sack_rate_allowed": o_sacks_suff / o_off_db,
            "takeaways_per_game": t_def_to / t_games,
            "giveaways_per_game": o_giveaways / o_games,
            "actual_sacks": float(row["def_sacks"]),
            "actual_to": float(row["def_takeaways"]),
            "week": int(row["week"]),
            "team": t
        })
    return pd.DataFrame(rows)

def evaluate_baseline(data):
    kf = KFold(n_splits=5, shuffle=True, random_state=42)
    s_devs, s_maes, to_devs, to_maes = [], [], [], []
    
    for train_idx, val_idx in kf.split(data):
        train = data.iloc[train_idx]
        val = data.iloc[val_idx]
        
        # Sacks model
        ms = PoissonRegressor(alpha=0.5)
        ms.fit(train[["def_sack_rate", "opp_sack_rate_allowed"]], train["actual_sacks"])
        ps = np.clip(ms.predict(val[["def_sack_rate", "opp_sack_rate_allowed"]]), 0.05, None)
        
        # Turnovers model
        mto = PoissonRegressor(alpha=0.5)
        mto.fit(train[["takeaways_per_game", "giveaways_per_game"]], train["actual_to"])
        pto = np.clip(mto.predict(val[["takeaways_per_game", "giveaways_per_game"]]), 0.05, None)
        
        s_devs.append(mean_poisson_deviance(val["actual_sacks"], ps))
        s_maes.append(mean_absolute_error(val["actual_sacks"], ps))
        to_devs.append(mean_poisson_deviance(val["actual_to"], pto))
        to_maes.append(mean_absolute_error(val["actual_to"], pto))
        
    return {
        "sack_deviance": round(float(np.mean(s_devs)), 4),
        "sack_mae": round(float(np.mean(s_maes)), 4),
        "turnover_deviance": round(float(np.mean(to_devs)), 4),
        "turnover_mae": round(float(np.mean(to_maes)), 4),
        "combined_deviance": round(float(np.mean(s_devs) + np.mean(to_devs)), 4)
    }

if __name__ == "__main__":
    data = get_prepared_data()
    metrics = evaluate_baseline(data)
    print("CV Evaluation Results:")
    print(json.dumps(metrics, indent=2))
