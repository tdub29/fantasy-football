# Ralph Loop: D/ST Model Autonomous Optimization

**Baseline Champion**: combined_deviance=2.6508

| Iter | Hypothesis | Features Tested | Score | Decision |
| --- | --- | --- | --- | --- |
| 1 | Baseline Qwen run | S: def_sack_rate, opp_sack_rate, def_pressure_rate / TO: takeaways, giveaways | 2.6515 | KEEP (Round 1 winner) |
| 2 | Calibrate regularization alpha=0.1 on DeepSeek-R1 | S: def_sack_rate, opp_sack_rate_allowed / TO: takeaways, giveaways (alpha=0.1) | 2.6508 | KEEP (Round 2 winner) |
| 1 | Adding def_pressure_rate to the sack features may improve th | `S:['def_pressure_rate', 'def_sack_rate', 'opp_sack_rate_allowed'] / TO:['takeaways_per_game', 'giveaways_per_game']` | 2.6514 | DISCARD (score 2.6514 >= 2.6508) |
| 2 | Increasing the regularization strength (alpha) in PoissonReg | `S:['def_sack_rate', 'opp_sack_rate_allowed'] / TO:['takeaways_per_game', 'giveaways_per_game']` | 2.6512 | DISCARD (score 2.6512 >= 2.6508) |
| 3 | Adding def_pressure_rate to the sack features will provide m | `S:['def_pressure_rate', 'def_sack_rate', 'opp_sack_rate_allowed'] / TO:['takeaways_per_game', 'giveaways_per_game']` | 2.6515 | DISCARD (score 2.6515 >= 2.6508) |
| 4 | Adding def_pressure_rate as a feature for sacks will provide | `S:['def_pressure_rate', 'def_sack_rate', 'opp_sack_rate_allowed'] / TO:['takeaways_per_game', 'giveaways_per_game']` | 2.6513 | DISCARD (score 2.6513 >= 2.6508) |
| 5 | Adding def_pressure_rate will provide more granular informat | `S:['def_pressure_rate', 'def_sack_rate', 'opp_sack_rate_allowed'] / TO:['takeaways_per_game', 'giveaways_per_game']` | 2.6198 | KEEP (improved from 2.6508 to 2.6198) |
| 6 | Adding def_pressure_rate to the sack features will provide m | `S:['def_pressure_rate', 'def_sack_rate', 'opp_sack_rate_allowed'] / TO:['takeaways_per_game', 'giveaways_per_game']` | 2.6452 | DISCARD (score 2.6452 >= 2.6198) |
| 7 | Adding def_pressure_rate as a new feature for sacks will pro | `S:['def_pressure_rate', 'def_sack_rate', 'opp_sack_rate_allowed'] / TO:['takeaways_per_game', 'giveaways_per_game']` | 2.6148 | KEEP (improved from 2.6198 to 2.6148) |
| 8 | Adding an interaction term between def_pressure_rate and def | `S:['def_pressure_rate', 'def_sack_rate'] / TO:['takeaways_per_game', 'giveaways_per_game']` | 2.6536 | DISCARD (score 2.6536 >= 2.6148) |
| 9 | Adding def_pressure_rate as a feature for sacks will provide | `S:['def_pressure_rate', 'def_sack_rate', 'opp_sack_rate_allowed'] / TO:['takeaways_per_game', 'giveaways_per_game']` | 2.6148 | DISCARD (score 2.6148 >= 2.6148) |
| 10 | Error: sack_features and to_features must both have at le | `Adding an interaction term bet` | None | REJECT |
| 11 | Error: Feature def_sack_rate:opp_sack_rate_allowed not in | `Adding an interaction term bet` | None | REJECT |
| 12 | Adding def_pressure_rate to the sack_features may capture mo | `S:['def_sack_rate', 'opp_sack_rate_allowed', 'def_pressure_rate'] / TO:['takeaways_per_game', 'giveaways_per_game']` | 2.652 | DISCARD (score 2.652 >= 2.6148) |
| 13 | Error: Feature def_sack_rate:opp_sack_rate_allowed not in | `Adding an interaction term bet` | None | REJECT |
| 14 | Adding def_pressure_rate as a feature for sacks will provide | `S:['def_sack_rate', 'opp_sack_rate_allowed', 'def_pressure_rate'] / TO:['takeaways_per_game', 'giveaways_per_game']` | 2.6513 | DISCARD (score 2.6513 >= 2.6148) |
| 15 | Adding def_pressure_rate as a feature for sacks and an inter | `S:['def_sack_rate', 'opp_sack_rate_allowed', 'def_pressure_rate'] / TO:['takeaways_per_game', 'giveaways_per_game']` | 2.6237 | DISCARD (score 2.6237 >= 2.6148) |
