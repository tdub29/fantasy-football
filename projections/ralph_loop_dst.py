import json, os, sys, subprocess, pathlib
import pandas as pd
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
WORKSPACE = ROOT.parent
SPARE_LLM = WORKSPACE / ".agents" / "scripts" / "spare-llm.py"
TASK_DIR = ROOT / "projections" / "tasks"
TASK_DIR.mkdir(parents=True, exist_ok=True)
WORKLOG_PATH = ROOT / "projections" / "ralph_dst_worklog.md"

ALLOWED_FEATURES = {
    "sacks": ["def_pressure_rate", "def_sack_rate", "opp_sack_rate_allowed"],
    "turnovers": ["takeaways_per_game", "giveaways_per_game"]
}

def run_ralph_iteration(iter_num, current_best_score, history):
    rejected_summary = ""
    rejected = [h for h in history if not h.get("accepted")]
    if rejected:
        rejected_summary = "\nPreviously REJECTED attempts (DO NOT repeat or slightly tweak these):\n"
        for r in rejected:
            rejected_summary += f"- Hypothesis: {r.get('hypothesis')} | Sacks: {r.get('sack_features')} | TO: {r.get('to_features')} | Score: {r.get('score')}\n"

    prompt = f"""You are optimizing an NFL D/ST Poisson regression model for sacks and turnovers.
Current 5-fold Cross-Validation Poisson deviance is {current_best_score} (lower is better).
Features currently in baseline:
- Sacks: def_sack_rate, opp_sack_rate_allowed
- Turnovers: takeaways_per_game, giveaways_per_game
{rejected_summary}
Task: Propose ONE feature or modeling improvement to lower the combined Poisson deviance.
Available candidate columns in data:
- def_pressure_rate (defensive sacks + qb hits per opponent dropback)
- def_sack_rate
- opp_sack_rate_allowed
- takeaways_per_game
- giveaways_per_game
- alpha (regularization strength in PoissonRegressor(alpha=...))

Respond with a JSON object with keys:
"hypothesis": "brief description of why this improves Poisson deviance",
"sack_features": ["list", "of", "features"],
"sack_alpha": float,
"to_features": ["list", "of", "features"],
"to_alpha": float

Return ONLY the raw JSON object, no markdown.
"""
    prompt_file = TASK_DIR / f"ralph_prompt_{iter_num}.txt"
    output_file = TASK_DIR / f"ralph_output_{iter_num}.json"
    prompt_file.write_text(prompt, encoding="utf-8")
    
    cmd = [
        sys.executable,
        str(SPARE_LLM),
        "--model", "deepseek-r1:7b",
        "--prompt-file", str(prompt_file),
        "--output", str(output_file)
    ]
    print(f"[Iter {iter_num}] Querying OSM on spare laptop...")
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0 or not output_file.exists():
        print(f"[Iter {iter_num}] Error running spare-llm: {res.stderr}")
        return None
        
    raw = output_file.read_text(encoding="utf-8").strip()
    import re
    raw = re.sub(r"<think>[\s\S]*?</think>", "", raw).strip()
    m = re.search(r"\{[\s\S]*\}", raw)
    if m:
        raw = m.group(0)
    try:
        proposal = json.loads(raw)
        return proposal
    except Exception as e:
        print(f"[Iter {iter_num}] Failed to parse JSON proposal: {e}")
        return None

def evaluate_proposal(proposal, data):
    from sklearn.linear_model import PoissonRegressor
    from sklearn.metrics import mean_poisson_deviance, mean_absolute_error
    from sklearn.model_selection import KFold
    
    sack_feats = proposal.get("sack_features", ["def_sack_rate", "opp_sack_rate_allowed"])
    to_feats = proposal.get("to_features", ["takeaways_per_game", "giveaways_per_game"])
    
    if not sack_feats or not to_feats:
        return None, "sack_features and to_features must both have at least one feature"
        
    s_alpha = float(proposal.get("sack_alpha", 0.5))
    to_alpha = float(proposal.get("to_alpha", 0.5))
    
    # Verify features exist
    for f in sack_feats + to_feats:
        if f not in data.columns:
            return None, f"Feature {f} not in data"
            
    try:
        kf = KFold(n_splits=5, shuffle=True, random_state=42)
        s_devs, to_devs = [], []
        
        for train_idx, val_idx in kf.split(data):
            train = data.iloc[train_idx]
            val = data.iloc[val_idx]
            
            ms = PoissonRegressor(alpha=s_alpha, max_iter=300)
            ms.fit(train[sack_feats], train["actual_sacks"])
            ps = np.clip(ms.predict(val[sack_feats]), 0.05, None)
            
            mto = PoissonRegressor(alpha=to_alpha, max_iter=300)
            mto.fit(train[to_feats], train["actual_to"])
            pto = np.clip(mto.predict(val[to_feats]), 0.05, None)
            
            s_devs.append(mean_poisson_deviance(val["actual_sacks"], ps))
            to_devs.append(mean_poisson_deviance(val["actual_to"], pto))
            
        s_dev = round(float(np.mean(s_devs)), 4)
        to_dev = round(float(np.mean(to_devs)), 4)
        comb = round(s_dev + to_dev, 4)
        
        return {
            "sack_deviance": s_dev,
            "turnover_deviance": to_dev,
            "combined_deviance": comb
        }, None
    except Exception as e:
        return None, str(e)

def main():
    from eval_defense_model import get_prepared_data, evaluate_baseline
    data = get_prepared_data()
    best_score = 2.6508  # Champion from Round 2 Iteration 3
    print(f"Current Champion Combined Deviance: {best_score}")
    
    log_lines = [
        "# Ralph Loop: D/ST Model Autonomous Optimization\n\n",
        f"**Baseline Champion**: combined_deviance={best_score}\n\n",
        "| Iter | Hypothesis | Features Tested | Score | Decision |\n",
        "| --- | --- | --- | --- | --- |\n",
        "| 1 | Baseline Qwen run | S: def_sack_rate, opp_sack_rate, def_pressure_rate / TO: takeaways, giveaways | 2.6515 | KEEP (Round 1 winner) |\n",
        "| 2 | Calibrate regularization alpha=0.1 on DeepSeek-R1 | S: def_sack_rate, opp_sack_rate_allowed / TO: takeaways, giveaways (alpha=0.1) | 2.6508 | KEEP (Round 2 winner) |\n"
    ]
    
    max_iters = 15
    best_proposal = None
    history = [
        {
            "hypothesis": "Add unengineered raw features like qb_sacks",
            "sack_features": ["qb_sacks"],
            "to_features": ["takeaways_per_game"],
            "score": 999.0,
            "accepted": False
        },
        {
            "hypothesis": "Empty feature list for turnovers",
            "sack_features": ["def_pressure_rate"],
            "to_features": [],
            "score": 999.0,
            "accepted": False
        }
    ]
    
    for i in range(1, max_iters + 1):
        proposal = run_ralph_iteration(i, best_score, history)
        if not proposal:
            continue
            
        metrics, err = evaluate_proposal(proposal, data)
        if err:
            print(f"[Iter {i}] Evaluation error: {err}")
            history.append({
                "hypothesis": proposal.get("hypothesis", "Invalid feature"),
                "sack_features": proposal.get("sack_features", []),
                "to_features": proposal.get("to_features", []),
                "score": 999.0,
                "accepted": False
            })
            log_lines.append(f"| {i} | Error: {err[:50]} | `{proposal.get('hypothesis', '')[:30]}` | None | REJECT |\n")
            with open(WORKLOG_PATH, "w", encoding="utf-8") as f:
                f.writelines(log_lines)
            continue
            
        score = metrics["combined_deviance"]
        hyp = proposal.get("hypothesis", "").replace("|", "-")[:60]
        feats = f"S:{proposal.get('sack_features')} / TO:{proposal.get('to_features')}"
        
        is_winner = score < best_score
        history.append({
            "hypothesis": proposal.get("hypothesis", ""),
            "sack_features": proposal.get("sack_features", []),
            "to_features": proposal.get("to_features", []),
            "score": score,
            "accepted": is_winner
        })
        
        if is_winner:
            decision = f"KEEP (improved from {best_score} to {score})"
            best_score = score
            best_proposal = proposal
            print(f"[Iter {i}] *** WINNER *** New Best: {best_score}")
        else:
            decision = f"DISCARD (score {score} >= {best_score})"
            print(f"[Iter {i}] Discarded: {score} >= {best_score}")
            
        log_lines.append(f"| {i} | {hyp} | `{feats}` | {score} | {decision} |\n")
        with open(WORKLOG_PATH, "w", encoding="utf-8") as f:
            f.writelines(log_lines)
    print(f"Logged results to {WORKLOG_PATH}")
    if best_proposal:
        print("Best proposal found:", json.dumps(best_proposal, indent=2))

if __name__ == "__main__":
    main()
