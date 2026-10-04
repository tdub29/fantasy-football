import sys, sqlite3, json, numpy as np, pandas as pd
sys.path.insert(0, 'projections')
import build_prospect_model as bpm
L = 'C:/Users/TrevorWhite/.claude/jobs/15921b94/tmp/lane-features/'
out = {}
for pos, ship in (('RB', 'S4n4'), ('WR', 'S6n4')):
    r = pd.read_parquet(L + f'replay_rows_{pos}.parquet')
    c = sqlite3.connect(L + 'prospect.sqlite')
    t = pd.read_sql_query('select season, player_id, pos_team, games from cfb_rushing union all select season, player_id, pos_team, games from cfb_receiving', c)
    t = t.sort_values('games').drop_duplicates(['season', 'player_id'], keep='last')
    last = r[['player_id', 'season']].merge(t.rename(columns={'season': 'k'}), on='player_id')
    last = last[last.k <= last.season - 1].sort_values('k').drop_duplicates(['player_id', 'season'], keep='last')
    r = r.merge(last[['player_id', 'season', 'pos_team']], on=['player_id', 'season'], how='left')
    y = r.y.to_numpy(float)
    def nll(p):
        p = np.clip(p, 1e-4, 1 - 1e-4); return -(y * np.log(p) + (1 - y) * np.log(1 - p))
    for cand in ('F1', 'F2'):
        r['gain'] = nll(r[ship].to_numpy()) - nll(r[cand].to_numpy())
        g = r.groupby('pos_team').agg(gain_sum=('gain', 'sum'), n=('gain', 'size'), hits=('y', 'sum')).sort_values('gain_sum', ascending=False)
        k = ~r.pos_team.eq(g.index[0]).to_numpy()
        b = bpm.class_bootstrap(y[k], r[ship].to_numpy()[k], r[cand].to_numpy()[k], r.season.to_numpy()[k], n=200000)
        out[f'{cand} {pos}'] = {'total_gain_sum': float(r.gain.sum()), 'top_school': g.index[0], 'top_school_rows': int(g.n.iloc[0]),
                                'top_school_hits': int(g.hits.iloc[0]), 'top_school_gain_sum': float(g.gain_sum.iloc[0]),
                                'without_top_school_mean_gain': float(r.gain[k].mean()), 'without_top_school_boot_p': b['p']}
        print(pos, cand, json.dumps(out[f'{cand} {pos}']))
p = 'notes/prospect-research/lanes/features/results.json'
book = json.loads(open(p, encoding='utf-8').read())
book['diagnostics']['school_concentration'] = out
open(p, 'w', encoding='utf-8').write(json.dumps(book, indent=1, default=float))
