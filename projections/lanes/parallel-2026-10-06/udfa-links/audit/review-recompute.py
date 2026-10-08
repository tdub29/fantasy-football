"""Independent reviewer recompute of udfa-link-results.md (2026-10-08).

Reads only audit/links.csv, audit/phase23.json and the immutable store copy. Writes
review-recompute.json beside this file. Deterministic: no randomness, sorted output.
Bias definitions follow udfa-link-results.md section 3 as written.
"""
import hashlib
import json
import pathlib
import re
import sqlite3
import sys

import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
LANE = HERE.parent
STORE = pathlib.Path('C:/Users/TrevorWhite/.claude/jobs/915dc2f8/tmp/udfa_r2.sqlite')
EXPECTED = '85d9801d4f2ec3f750af80e62f13f2b20615c508b1ce85fc27fd132981afa9c0'

P5 = {'Southeastern Conference', 'Big Ten Conference', 'Atlantic Coast Conference', 'Big Twelve Conference',
      'Pacific Twelve Conference', 'Pacific Ten Conference', 'Big East'}
G5 = {'American Athletic Conference', 'Mountain West Conference', 'Conference USA', 'Mid-American Conference',
      'Sun Belt Conference', 'Western Athletic Conference'}
FCS = {'Big Sky Conference', 'Big South - Ohio Valley Conference', 'Big South Conference',
       'Colonial Athletic Association', 'Coastal Athletic Association', 'Ivy League',
       'Mid-Eastern Athletic Conference', 'Missouri Valley Football Conference', 'Gateway Football Conference',
       'Northeast Conference', 'Ohio Valley Conference', 'Patriot League', 'Pioneer Football League',
       'Southern Conference', 'Southland Conference', 'Southwestern Athletic Conference',
       'United Athletic Conference', 'Great West Football Conference', 'Atlantic 10'}
MISSING = {'NO FOOTBALL', 'NO COLLEGE'}


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def conf_type(c):
    if c is None or (isinstance(c, float) and pd.isna(c)) or c in MISSING:
        return 'missing'
    if c in P5:
        return 'P5'
    if c in G5:
        return 'G5'
    if c in FCS:
        return 'FCS'
    if c == 'Independent':
        return 'Independent'
    return 'D2-lower'


def norm(name):
    s = re.sub(r"[^a-z ]", '', str(name).lower().replace('-', ' '))
    s = re.sub(r'\b(jr|sr|ii|iii|iv|v)\b', '', s)
    return re.sub(r'\s+', ' ', s).strip()


def pct(a, b):
    return round(100.0 * a / b, 1) if b else None


def rate_table(df, col):
    out = {}
    for k, g in sorted(df.groupby(col, dropna=False), key=lambda kv: str(kv[0])):
        out[str(k)] = dict(n=len(g), unlinked=int(g.unlinked.sum()), unlinked_pct=pct(g.unlinked.sum(), len(g)),
                           nofeat=int(g.nofeat.sum()), nofeat_pct=pct(g.nofeat.sum(), len(g)))
    return out


def games_bucket(g):
    return '0' if g == 0 else '1-16' if g <= 16 else '17-48' if g <= 48 else '49+'


def class_bucket(s):
    s = int(s)
    for lo, hi in ((2008, 2011), (2012, 2015), (2016, 2019), (2020, 2023), (2024, 2026)):
        if lo <= s <= hi:
            return f'{lo}-{hi}'
    return 'other'


before = sha(STORE)
if before != EXPECTED:
    sys.exit('store sha mismatch, refusing to open')

p23 = json.loads((HERE / 'phase23.json').read_text(encoding='utf-8'))
L = pd.read_csv(HERE / 'links.csv', dtype=str, keep_default_na=False)
for c in ('base_id', 'identity_id', 'feature_id'):
    L[c] = pd.to_numeric(L[c].replace('', None), errors='coerce')
L['season_i'] = L.season.astype(int)
L['t0_i'] = L.t0.astype(int)
L['linked'] = L.identity_id.notna()
L['unlinked'] = ~L.linked
L['nofeat'] = L.feature_id.isna()
L['is_new'] = L.base_id.isna() & L.linked
L['iddob'] = L.evidence.map(lambda e: (json.loads(e).get('id') or {}).get('dob') or '')

con = sqlite3.connect(STORE.as_uri() + '?mode=ro&immutable=1', uri=True)
con.execute('PRAGMA query_only=ON')
NP = pd.read_sql('SELECT gsis_id, college_conference, college_name FROM nfl_player', con)
CMB = set(pd.read_sql('SELECT DISTINCT pfr_id FROM nfl_combine WHERE pfr_id IS NOT NULL', con).pfr_id)
NPS = pd.read_sql("SELECT player_id, SUM(games) g, SUM(fantasy_points_ppr) ppr FROM nfl_player_season "
                  "WHERE season_type='REG' GROUP BY player_id", con)
REC = pd.read_sql('SELECT season, player_name, stars FROM cfb_recruit', con)
conflict_ids = sorted({int(v) for rc in p23['rule_conflicts'] for v in rc['ids'].values()})
ROS = pd.read_sql('SELECT athlete_id, season, team_id, date_of_birth FROM cfb_roster WHERE athlete_id IN (%s)'
                  % ','.join("'%d'" % i for i in conflict_ids), con)
con.close()

M = L.merge(NP[['gsis_id', 'college_conference', 'college_name']], on='gsis_id', how='left')
assert len(M) == len(L)
M['conf'] = M.college_conference.map(conf_type)
M['combine'] = M.pfr.isin(CMB) & (M.pfr != '')
M['pfr_known'] = M.pfr != ''
M = M.merge(NPS, left_on='gsis_id', right_on='player_id', how='left')
M['g'] = M.g.fillna(0)
M['ppr'] = M.ppr.fillna(0.0)
M['gb'] = M.g.map(games_bucket)
M['cls'] = M.season_i.map(class_bucket)

REC['nn'] = REC.player_name.map(norm)
rec_by = {k: g for k, g in REC.groupby('nn')}


def recruit(row):
    g = rec_by.get(norm(row['name']))
    if g is None:
        return ('none', None)
    g = g[(g.season >= row['t0_i'] - 6) & (g.season <= row['t0_i'] - 3)]
    if len(g) == 0:
        return ('none', None)
    if len(g) == 1:
        return ('one', float(g.stars.iloc[0]) if pd.notna(g.stars.iloc[0]) else None)
    return ('multi', None)


rm = M.apply(recruit, axis=1, result_type='expand')
M['rec'] = rm[0]
M['stars'] = rm[1]

out = dict(store_sha_before=before)

# Section 1
cov = {}
for p, g in M.groupby('pop'):
    cov[p] = dict(n=len(g), base=int(g.base_id.notna().sum()), identity=int(g.linked.sum()),
                  feature=int(g.feature_id.notna().sum()), fresh=int((g.fresh.str.lower() == 'true').sum()),
                  new_links=int(g.is_new.sum()), new_with_feature=int((g.is_new & g.feature_id.notna()).sum()),
                  base_with_feature=int((g.base_id.notna() & g.feature_id.notna()).sum()))
    for k in ('base', 'identity', 'feature', 'fresh'):
        cov[p][k + '_pct'] = pct(cov[p][k], cov[p]['n'])
out['s1_coverage'] = cov

# Section 2
out['s2_methods_csv'] = {p: dict(sorted(g.method.replace('', 'unlinked').value_counts().to_dict().items()))
                         for p, g in M.groupby('pop')}
out['s2_methods_match_p23'] = out['s2_methods_csv'] == {p: dict(sorted(v.items())) for p, v in p23['methods'].items()}
dup = M[M.linked].groupby('identity_id').size()
out['s2_identity_id_dups'] = int((dup > 1).sum())
out['s2_collisions_p23'] = len(p23['collisions'])
out['s2_rule_on_id_known'] = p23['rule_on_id_known']
out['s2_r1_disagree'] = {k: v.get('disagree') for k, v in p23['r1_vs_base'].items()}
out['s2_lio'] = p23['lio']
out['s2_unlinked_causes_rule_conflict'] = M[M.cause == 'rule_conflict'].groupby('pop').size().to_dict()
rc_detail = []
for rc in p23['rule_conflicts']:
    ids = {}
    for rule, cid in rc['ids'].items():
        ids.setdefault(int(cid), []).append(rule)
    d = dict(name=rc['name'], key=rc['key'], ids={})
    for cid, rules in sorted(ids.items()):
        r = ROS[ROS.athlete_id.astype(str) == str(cid)]
        d['ids'][str(cid)] = dict(rules=rules, seasons=sorted(r.season.astype(int).unique().tolist()),
                                  teams=sorted(r.team_id.astype(str).unique().tolist()),
                                  dob=sorted(r.date_of_birth.dropna().astype(str).unique().tolist()))
    row = M[M.key == rc['key']].iloc[0]
    d['t0'] = int(row.t0_i)
    d['cause'] = row.cause
    d['linked'] = bool(row.linked)
    rc_detail.append(d)
out['s2_rule_conflicts'] = rc_detail

# Section 3
bias = {}
for p, g in M.groupby('pop'):
    b = dict(n=len(g), unlinked=int(g.unlinked.sum()), nofeat=int(g.nofeat.sum()))
    for col in ('pos', 'cls', 'conf', 'combine', 'pfr_known', 'rec', 'gb'):
        b[col] = rate_table(g, col)
    lk, ul = g[g.linked], g[g.unlinked]
    b['ppr_mean_linked'] = round(lk.ppr.mean(), 1)
    b['ppr_mean_unlinked'] = round(ul.ppr.mean(), 1)
    b['ppr_median_linked'] = round(lk.ppr.median(), 1)
    b['ppr_median_unlinked'] = round(ul.ppr.median(), 1)
    b['games_mean_linked'] = round(lk.g.mean(), 1)
    b['games_mean_unlinked'] = round(ul.g.mean(), 1)
    b['ppr_mean_feature'] = round(g[~g.nofeat].ppr.mean(), 1)
    b['ppr_mean_nofeature'] = round(g[g.nofeat].ppr.mean(), 1)
    one = g[g.rec == 'one']
    b['stars_unique_unlinked'] = dict(n=int(one[one.unlinked].stars.notna().sum()),
                                      mean=round(one[one.unlinked].stars.mean(), 2))
    b['stars_unique_linked'] = dict(n=int(one[one.linked].stars.notna().sum()),
                                    mean=round(one[one.linked].stars.mean(), 2))
    b['unlinked_played_1plus'] = int((ul.g >= 1).sum())
    b['unlinked_ppr_100plus'] = int((ul.ppr >= 100).sum())
    b['unlinked_ppr_100plus_names'] = sorted(
        (f"{r['name']} ({r.college_name}, {r.cause}, ppr {round(r.ppr, 1)})" for _, r in ul[ul.ppr >= 100].iterrows()))
    b['unlinked_by_conf_cause'] = {f'{k[0]}|{k[1]}': int(v) for k, v in
                                   sorted(ul.groupby(['cause', 'conf']).size().items())}
    b['unlinked_conf'] = ul.conf.value_counts().sort_index().to_dict()
    b['unlinked_by_class_cause'] = {f'{k[0]}|{k[1]}': int(v) for k, v in
                                    sorted(ul.groupby(['cause', 'cls']).size().items())}
    b['unlinked_names'] = sorted(f"{r['name']} ({r.college}, {r.conf}, {r.cause})" for _, r in ul.iterrows()) if p == 'D' else None
    bias[p] = b
out['s3_bias'] = bias

# Section 4
dob = {}
for p, g in M.groupby('pop'):
    d = {}
    for grp, sub in (('base', g[g.base_id.notna()]), ('new', g[g.is_new])):
        d[grp] = sub.iddob.replace('', 'blank').value_counts().sort_index().to_dict()
    d['no_link'] = int(g.unlinked.sum())
    lk = g[g.linked]
    d['exact_linked'] = dict(n=len(lk), exact=int((lk.iddob == 'exact').sum()), pct=pct((lk.iddob == 'exact').sum(), len(lk)))
    d['exact_by_games'] = {k: dict(n=len(s), exact=int((s.iddob == 'exact').sum()), pct=pct((s.iddob == 'exact').sum(), len(s)))
                           for k, s in sorted(lk.groupby('gb'))}
    d['exact_by_class'] = {k: dict(n=len(s), exact=int((s.iddob == 'exact').sum()), pct=pct((s.iddob == 'exact').sum(), len(s)))
                           for k, s in sorted(lk.groupby('cls'))}
    d['any_dob_by_class'] = {k: dict(n=len(s), present=int(s.iddob.isin(['exact', 'conflict', 'within1']).sum()),
                                     pct=pct(s.iddob.isin(['exact', 'conflict', 'within1']).sum(), len(s)))
                             for k, s in sorted(lk.groupby('cls'))}
    new = g[g.is_new]
    d['new_method_has_dob_name'] = int(new.method.str.contains('dob_name').sum())
    d['new_dob_name_only'] = int((new.method == 'dob_name').sum())
    d['new_dob_name_no_xwalk'] = int((new.method.str.contains('dob_name') & ~new.method.str.contains('xwalk')).sum())
    dob[p] = d
out['s4_dob'] = dob
out['s4_flags_p23'] = {k: p23['flags'][k] for k in ('dob_conflict', 'dob_within1')}
out['s4_flags_csv'] = {k: int(M['flags'].str.contains(k).sum()) for k in ('dob_conflict', 'dob_within1')}

# Section 5
out['s5_causes_csv'] = {p: dict(sorted(g.cause[g.cause != ''].value_counts().to_dict().items())) for p, g in M.groupby('pop')}
out['s5_causes_match_p23'] = out['s5_causes_csv'] == {p: dict(sorted(v.items())) for p, v in p23['causes'].items()}

# Reviewer extras: checks the write-up did not run.
def cell(s, flag):
    return f'{int(s[flag].sum())}/{len(s)}={pct(s[flag].sum(), len(s))}'


U = M[M['pop'] == 'U'].copy()
U['exact'] = U.iddob == 'exact'
U['conf_missing'] = U.conf == 'missing'
D = M[M['pop'] == 'D'].copy()
D['exact'] = D.iddob == 'exact'
ext = {}
ext['U_unlinked_by_class_x_games'] = {f'{c}|{gb}': cell(s, 'unlinked') for (c, gb), s in sorted(U.groupby(['cls', 'gb']))}
ext['U_exact_dob_linked_by_class_x_games'] = {f'{c}|{gb}': cell(s, 'exact') for (c, gb), s in sorted(U[U.linked].groupby(['cls', 'gb']))}
ext['U_conf_missing_by_games'] = {gb: cell(s, 'conf_missing') for gb, s in sorted(U.groupby('gb'))}
ext['U_conf_missing_by_class'] = {c: cell(s, 'conf_missing') for c, s in sorted(U.groupby('cls'))}
ext['D_exact_dob_linked_by_games_classes_to_2023'] = {gb: cell(s, 'exact') for gb, s in sorted(D[D.linked & (D.season_i <= 2023)].groupby('gb'))}
ext['D_linked_0_games_by_class'] = D[D.linked & (D.gb == '0')].cls.value_counts().sort_index().to_dict()
# Transfer re-key pattern test per conflict: sequential non-overlapping seasons, no shared team, DOB on exactly one id.
pat = []
for d in rc_detail:
    (a, A), (b, B) = sorted(d['ids'].items())
    seq = max(A['seasons']) < min(B['seasons']) or max(B['seasons']) < min(A['seasons'])
    distinct = not (set(A['teams']) & set(B['teams']))
    one_dob = (len(A['dob']) > 0) != (len(B['dob']) > 0)
    pat.append(dict(name=d['name'], sequential=seq, distinct_teams=distinct, dob_on_exactly_one=one_dob,
                    fits_all=seq and distinct and one_dob))
ext['rule_conflict_pattern'] = pat
ext['rule_conflict_pattern_counts'] = {k: sum(p[k] for p in pat) for k in ('sequential', 'distinct_teams', 'dob_on_exactly_one', 'fits_all')}
out['reviewer_extras'] = ext

# Provenance
out['s6_sha'] = {n: sha(LANE / n) for n in ('udfa_links.py',)}
out['s6_sha'].update({f'audit/{n}': sha(HERE / n) for n in ('links.csv', 'phase23.json', 'codex-recount.json')})
out['s6_xwalk_sha_p23'] = p23['provenance'].get('xwalk_sha')
out['s6_parity_p23'] = {k: p23['parity'][k] for k in ('d_keys', 'mismatch')}
out['s6_fcs_p23'] = {k: p23['provenance'].get(k) for k in ('fcs_files', 'fcs_bad', 'run')}

after = sha(STORE)
out['store_sha_after'] = after
out['store_sha_ok'] = before == after == EXPECTED
(HERE / 'review-recompute.json').write_text(json.dumps(out, indent=1, sort_keys=True, default=str) + '\n', encoding='utf-8')
print('ok', out['store_sha_ok'])
