"""Draft-capital percentile of expected three-year starter value, never talent.

Uses the overall study's C0 (position-specific decreasing isotonic regression).
Historical forecasts embargo three-year outcome labels: class Y trains through
Y-3. Reference is embargoed 2012-2023 drafted QB/RB/WR/TE predictions, pooled
across positions on a common VOR target. No pre-draft or UDFA extrapolation.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'projections' / 'inputs' / 'capital_training.csv'
OUT = ROOT / 'site' / 'data' / 'capital-ratings.js'
POSITIONS = ('QB', 'RB', 'WR', 'TE')


def forecast(training, rows, target):
    out = pd.Series(np.nan, index=rows.index)
    for pos in POSITIONS:
        train, test = training[training.pos == pos], rows[rows.pos == pos]
        if test.empty or len(train) < 10:
            continue
        model = IsotonicRegression(increasing=False, out_of_bounds='clip')
        model.fit(train.pick, train[target])
        out.loc[test.index] = model.predict(test.pick)
    return out


def percentile(reference, values):
    ref = np.sort(np.asarray(reference))
    return 100 * (np.searchsorted(ref, values, side='left')
                  + np.searchsorted(ref, values, side='right')) / (2 * len(ref))


def build():
    train = pd.read_csv(SOURCE)
    assert train.year.between(2008, 2023).all()
    assert not train.duplicated(['year', 'pick']).any()
    assert np.isfinite(train[['pick', 'vor3_F1', 'vor3_F2']]).all().all()
    text = (ROOT / 'site/data/prospect-model.js').read_text(encoding='utf-8')
    model = json.loads(text[text.index('{'):text.rindex('}') + 1])
    records = [{'id': sid, 'year': p['y'], 'pick': p['pk'], 'pos': p['p']}
               for sid, p in model['nfl'].items()
               if p.get('pk') and 1 <= p['pk'] <= 300 and p['p'] in POSITIONS
               and p['y'] >= 2012]
    rows = pd.DataFrame(records)
    ratings = {str(r['id']): {} for r in records}
    for fmt in ('F1', 'F2'):
        target = 'vor3_' + fmt
        ref_rows = train[train.year.between(2012, 2023)]
        reference = pd.Series(np.nan, index=ref_rows.index)
        for year in sorted(ref_rows.year.unique()):
            test = ref_rows[ref_rows.year == year]
            reference.loc[test.index] = forecast(train[train.year <= year - 3], test, target)
        assert reference.notna().all(), 'missing reference predictions'
        predictions = pd.Series(np.nan, index=rows.index)
        for year in sorted(rows.year.unique()):
            test = rows[rows.year == year]
            predictions.loc[test.index] = forecast(train[train.year <= year - 3], test, target)
        for index, value in predictions.dropna().items():
            sid = str(rows.loc[index, 'id'])
            ratings[sid][fmt] = round(float(percentile(reference, value)), 1)
    result = {
        'label': 'Draft-capital rating', 'model': 'C0, three-year label embargo',
        'reference': 'Fixed modern benchmark: drafted QB/RB/WR/TE classes 2012-2023; not historical as-of percentiles',
        'formats': {'F1': '10-team PPR, 1QB', 'F2': '10-team PPR, superflex'},
        'target': 'Three-year value above starter replacement; percentile, not hit probability',
        'sourceHash': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'players': ratings,
    }
    OUT.write_text('window.CAPITAL_RATINGS = ' + json.dumps(result, separators=(',', ':')) + ';\n', encoding='utf-8')
    print(f'capital-ratings: {len(ratings)} drafted players; no pre-draft ratings')


def self_check():
    # Independent monotonicity/tie/embargo contract, not a reassertion of source.
    sample = pd.DataFrame({'pos': ['TE'] * 12, 'pick': range(1, 13),
                           'value': [100] * 4 + [20] * 4 + [0] * 4})
    test = pd.DataFrame({'pos': ['TE'] * 3, 'pick': [1, 8, 254]})
    assert forecast(sample, test, 'value').tolist() == [100, 20, 0]
    assert percentile([0, 0, 10, 20], np.array([0, 10, 20])).tolist() == [25, 62.5, 87.5]
    print('capital-ratings self-check passed')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--self-check', action='store_true')
    self_check() if parser.parse_args().self_check else build()
