"""Independent deterministic recount; source snapshots stay read only. No model reruns."""
import collections
import csv
import hashlib
import json
import pathlib
import sqlite3
import sys
from datetime import datetime, timezone

HERE = pathlib.Path(__file__).resolve().parent
STORE = pathlib.Path('C:/Users/TrevorWhite/.claude/jobs/915dc2f8/tmp/udfa_r2.sqlite')
EXPECTED = '85d9801d4f2ec3f750af80e62f13f2b20615c508b1ce85fc27fd132981afa9c0'

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def ident(value):
    return int(float(value)) if value not in ('', None) else None

def counts(rows):
    return dict(n=len(rows), base=sum(ident(r['base_id']) is not None for r in rows),
                identity=sum(ident(r['identity_id']) is not None for r in rows),
                feature=sum(ident(r['feature_id']) is not None for r in rows),
                fresh=sum(r['fresh'].lower() == 'true' for r in rows))

def label(row):
    return {k: row[k] for k in ('pop', 'key', 'gsis_id', 'name', 'pos', 'season')}

before = digest(STORE)
if before != EXPECTED:
    raise SystemExit('Immutable copy hash mismatch: refusing to open database')
report = json.loads((HERE / 'phase23.json').read_text(encoding='utf-8'))
with (HERE / 'links.csv').open(newline='', encoding='utf-8-sig') as handle:
    rows = list(csv.DictReader(handle))
checks = {}
totals = {pop: counts([r for r in rows if r['pop'] == pop]) for pop in ('D', 'U')}
checks['population'] = dict(pass_=all(totals[p]['n'] == report['population'][p] for p in totals), actual=totals)
coverage_mismatches = []
for cell in report['coverage']:
    lo, hi = map(int, cell['cohort'].split('-'))
    subset = [r for r in rows if r['pop'] == cell['pop'] and lo <= int(r['season']) <= hi
              and (cell['pos'] == 'ALL' or cell['pos'] == r['pos'])]
    actual = counts(subset)
    expected = {k: cell[k] for k in actual}
    if actual != expected:
        coverage_mismatches.append(dict(group={k: cell[k] for k in ('pop', 'cohort', 'pos')}, expected=expected, actual=actual))
checks['coverage'] = dict(pass_=not coverage_mismatches, cells_checked=len(report['coverage']), mismatches=coverage_mismatches)
methods = {p: dict(collections.Counter(r['method'] or 'unlinked' for r in rows if r['pop'] == p)) for p in ('D', 'U')}
checks['methods'] = dict(pass_=methods == report['methods'], actual=methods, expected=report['methods'])
by_college = collections.defaultdict(list)
for r in rows:
    cid = ident(r['identity_id'])
    if cid is not None:
        by_college[cid].append(r)
duplicates = [dict(college_id=cid, rows=[label(r) for r in group]) for cid, group in by_college.items()
              if len(group) > 1 and any(ident(r['base_id']) is None for r in group)]
checks['nonbase_collisions'] = dict(pass_=not duplicates, duplicate_groups=duplicates, reported_count=len(report['collisions']))
unlinked = {p: [label(r) for r in rows if r['pop'] == p and ident(r['identity_id']) is None] for p in ('D', 'U')}
checks['unlinked'] = dict(pass_=len(unlinked['D']) == 19 and len(unlinked['U']) == 177,
                          counts={p: len(v) for p, v in unlinked.items()}, rows=unlinked)
# Reconstruct rule conflicts directly from the CSV's rule evidence, never from outcomes.
conflicts = []
for r in rows:
    ev = json.loads(r['evidence'])
    accepted = {k: ident(v[0]) for k, v in ev.items() if k != 'id' and isinstance(v, list)
                and len(v) > 1 and v[1] == 'accept' and ident(v[0]) is not None}
    if ident(r['base_id']) is None and len(set(accepted.values())) > 1:
        conflicts.append(dict(key=r['key'], name=r['name'], ids=accepted))
expected_conflicts = {r['key']: r for r in report['rule_conflicts']}
actual_conflicts = {r['key']: r for r in conflicts}
checks['rule_conflicts'] = dict(pass_=actual_conflicts == expected_conflicts and len(conflicts) == 10,
                               actual=conflicts, expected=report['rule_conflicts'],
                               rows=[dict(label(r), rule_ids=actual_conflicts[r['key']]['ids'])
                                     for r in rows if r['key'] in actual_conflicts])
con = sqlite3.connect(STORE.as_uri() + '?mode=ro&immutable=1', uri=True)
try:
    con.execute('PRAGMA query_only=ON')
    records = con.execute('SELECT gsis_id, cfb_player_id, method FROM player_link WHERE run_id = ?',
                          (report['provenance']['run'],)).fetchall()
finally:
    con.close()
store = {key: (ident(cid), method) for key, cid, method in records}
drafted = {r['key']: r for r in rows if r['pop'] == 'D'}
only_csv = sorted(drafted.keys() - store.keys())
only_store = sorted(store.keys() - drafted.keys())
mismatches = []
for key in drafted.keys() & store.keys():
    row = drafted[key]
    method = 'name_school' if row['base_method'] == 'name_prefix' else row['base_method']
    actual = (ident(row['base_id']), method)
    if actual != store[key]:
        mismatches.append(dict(key=key, csv=list(actual), store=list(store[key])))
checks['store_parity'] = dict(pass_=len(drafted) == len(store) == 1520 and not only_csv and not only_store and not mismatches,
                             csv_rows=totals['D']['n'], csv_unique_keys=len(drafted), store_unique_keys=len(store),
                             only_csv=only_csv, only_store=only_store, mismatches=mismatches,
                             note='Compare to shipped player_link baseline, not raw draft-pick source; duplicate CSV keys keep final occurrence.')
after = digest(STORE)
checks['immutable_copy'] = dict(pass_=before == after == EXPECTED, before=before, after=after, expected=EXPECTED)
result = dict(created_at=datetime.now(timezone.utc).isoformat(), scope='Deterministic recount only, no identity/model judgment',
              input_hashes={n: digest(HERE / n) for n in ('links.csv', 'phase23.json')}, checks=checks,
              passed=all(c['pass_'] for c in checks.values()))
(HERE / 'codex-recount.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps(dict(passed=result['passed'], checks={k: v['pass_'] for k, v in checks.items()}, totals=totals)))
sys.exit(0 if result['passed'] else 1)
