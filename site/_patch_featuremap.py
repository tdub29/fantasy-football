"""Register the number band and the three-tab shell in the feature map.

Both go AFTER the existing Cmd+K player-card features and each opens with an
Escape, because an already-open modal swallows the next feature's Control+k.
That is already recorded in player-card-this-week's notes and it is why the
order here is not arbitrary.
"""
import io
import json
import sys

P = '../.agents/feature-map.json'

CMDK_PATH = [
    {"press": "Escape"},
    {"sleepMs": 300},
    {"eval": "location.hash='#rankings'"},
    {"sleepMs": 2500},
    {"press": "Control+k"},
    {"fill": ".cmdk-input-wrap input", "value": "Jahmyr Gibbs"},
    {"sleepMs": 800},
    {"press": "Enter"},
    {"sleepMs": 1400},
]

BAND = {
    "id": "player-card-number-band",
    "name": "Player card: six-cell number band",
    "path": CMDK_PATH,
    "selector": ".num-band",
    "assert": (
        "document.querySelectorAll('.num-band .num-cell').length >= 4"
        " && ['Value','Value rank','Tier','Proj pts','VOR','Age']"
        ".every(l => [...document.querySelectorAll('.num-band .num-cell-label')]"
        ".some(e => e.textContent.trim() === l))"
        " && document.querySelectorAll('.price-line').length === 0"
    ),
    "notes": (
        "The six figures the card is read for, in one fixed order, replacing two "
        "stacked rows of chips that wrapped differently on every player. Gibbs is "
        "used deliberately: he is ranked AND has an offense projection, so all six "
        "cells are reachable and a missing one is a real defect. Six is a ceiling, "
        "not a floor, for other players: Value and Tier need a ranking, Value rank "
        "and Proj pts come from mispricingIndex() which is built from "
        "OFFENSE_PROJ.offense only (so an IDP has neither), and Cooper Rush "
        "correctly renders one cell. The .price-line clause is the anti-duplication "
        "check: that class was the old chip row, and it must stay gone or every "
        "number prints twice. Browser matrix: site/_playercard_check.py."
    ),
}

TABS = {
    "id": "player-card-detail-tabs",
    "name": "Player card: Value / Production / Context tabs",
    "path": CMDK_PATH,
    "selector": ".pm-tab-bar",
    "assert": (
        "document.querySelectorAll('.pm-tab-bar [role=tab]').length === 3"
        " && [...document.querySelectorAll('.pm-panel')].filter(p => !p.hidden).length === 1"
        " && document.querySelectorAll('.pm-tab-bar [role=tab][aria-selected=\"true\"]').length === 1"
        " && !!document.querySelector('.pm-panel:not([hidden]) .ktcv-block')"
    ),
    "notes": (
        "Seventeen reference blocks behind three tabs, reusing .tab-bar / .tab so "
        "the card inherits the 44px touch target rather than growing a second tab "
        "component. Exactly one panel visible is the load-bearing assertion: the "
        "panels are siblings and a stale hidden flag shows two at once. The last "
        "clause pins the judge's ordering decision, that the KTC value chart opens "
        "the default Value tab instead of sitting behind a points-per-game tab "
        "inside historyBlock. A group with no surviving blocks drops its own tab, "
        "so an unranked player with no KTC history gets two tabs, not three with "
        "one blank; that case is covered in site/_playercard_check.py rather than "
        "here, because this feature asserts the full-data shape."
    ),
}


def main() -> int:
    d = json.load(io.open(P, encoding='utf-8'))
    have = {f['id'] for f in d['features']}
    added = []
    for entry in (BAND, TABS):
        if entry['id'] in have:
            print('  already registered: %s' % entry['id'])
            continue
        d['features'].append(entry)
        added.append(entry['id'])

    # KTC is no longer a tab inside this chart, so the name stops promising one.
    for f in d['features']:
        if f['id'] == 'player-card-career-chart':
            f['name'] = 'Player card: career PPG chart'
            if 'KTC value was promoted' not in f['notes']:
                f['notes'] += (
                    " UPDATE 2026-09-17: the KTC series was promoted out of this chart "
                    "into ktcValueChart(), which opens the Value tab with its own "
                    "3mo/1yr/All range control and a signed change callout. This chart "
                    "is points-per-game only now, so careerChart renders it with no tab "
                    "strip at all, which is why the tab clause here is written to accept "
                    "zero .cchart-tabs. The chart also now lives inside the hidden "
                    "Production panel, so the assertion must not depend on visibility."
                )
            print('  updated: player-card-career-chart')

    json.dump(d, io.open(P, 'w', encoding='utf-8', newline='\n'), indent=1)
    print('added: %s  (features now %d)' % (added or 'none', len(d['features'])))
    return 0


if __name__ == '__main__':
    sys.exit(main())
