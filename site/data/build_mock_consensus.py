"""Build site/data/mock-consensus.js: where public 2027 NFL mock drafts slot each college prospect.

Plain GET only: no keys, no accounts, no NFL Mock Draft Database, no PFF. Each parser reads one
published mock and returns (pick, name, school) rows. A page that fails to load or parse, or is
older than MAX_AGE_DAYS, is recorded as failed and contributes nothing; no pick is ever filled in.
Big boards are not used: a board rank is not a pick slot.

Players are matched to the PROSPECT_MODEL college rows of the 2027 class by normalized name AND
school. Per player: median pick, min and max pick, source count, newest source date, source list.

Run: python site/data/build_mock_consensus.py [--self-check]
"""
import datetime as dt
import html
import json
import re
import statistics
import sys
import unicodedata
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODEL = HERE / 'prospect-model.js'
OUT = HERE / 'mock-consensus.js'
CLASS = 2027
MAX_AGE_DAYS = 60
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'
MONTHS = {m: i for i, m in enumerate(['january', 'february', 'march', 'april', 'may', 'june', 'july',
                                      'august', 'september', 'october', 'november', 'december'], 1)}


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'text/html'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', 'replace')


def text(s):
    s = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', s, flags=re.S)
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()


def iso_date(s):
    return dt.date.fromisoformat(s[:10]).isoformat()


# Each parser: list of urls -> (date 'YYYY-MM-DD', [(pick, name, school), ...]).

def tankathon(urls):
    t = get(urls[0])
    date = iso_date(re.search(r'last-updated-at[^>]*>[^<]*<time datetime="([^"]+)"', t).group(1))
    rows = re.findall(r'class="mock-row-pick-number">(\d+)<.*?class="mock-row-name">([^<]+)<'
                      r'.*?class="mock-row-school-position">([^<]+)<', t, re.S)
    return date, [(int(p), text(n), text(sp.split('|')[-1])) for p, n, sp in rows]


def walter(urls):
    picks, dates = {}, []
    for url in urls:
        t = get(url)
        dates.append(re.search(r'"dateModified":"([^"]+)"', t).group(1))
        for m in re.finditer(r'id="ovrl_(\d+)"(.*?)(?=<p[ >]|<td align)', t, re.S):
            body = re.sub(r'<a class="wf-teamhub-link".*?</a>', ' ', m.group(2), flags=re.S)
            row = re.match(r'[\s:]*(.+?)\s*,\s*([A-Za-z0-9/-]+)\s*,\s*(.+?)\.?$', text(body))
            if row and int(m.group(1)) not in picks:
                picks[int(m.group(1))] = (int(m.group(1)), row.group(1), row.group(3))
    return iso_date(max(dates)), list(picks.values())


def drafttek(urls):
    rows, date = [], None
    for url in urls:
        t = get(url)
        if date is None:
            m = re.search(r'\b(' + '|'.join(MONTHS) + r') (\d{1,2}), (20\d\d)\b', text(t), re.I)
            date = dt.date(int(m.group(3)), MONTHS[m.group(1).lower()], int(m.group(2))).isoformat()
        for card in re.split(r'<div class="pick-card', t)[1:]:
            p = re.search(r'class="pick-num">\s*(\d+)', card)
            n = re.search(r'class="pick-player-name[^"]*">(.*?)</div>', card, re.S)
            s = re.search(r'class="pick-school-pos">\s*<span>(.*?)</span>', card, re.S)
            if p and n and s:
                rows.append((int(p.group(1)), text(n.group(1)), text(s.group(1))))
    return date, rows


def cbs(urls, author):
    t = get(urls[0])
    marks = list(re.finditer(r'Updated: (\d{1,2})/(\d{1,2})/(\d\d)', t))
    for i, m in enumerate(marks):
        if not re.search(re.escape(author) + r' @\w+\s*$', text(t[m.start() - 3000:m.start()])):
            continue
        seg = t[m.end():marks[i + 1].start() if i + 1 < len(marks) else len(t)]
        rows = []
        for tr in re.findall(r'<tr[^>]*>(.*?)</tr>', seg, re.S):
            n = re.search(r'Player Names\|([^"]+)"', tr)
            s = re.search(r'College Team Names\|([^"]+)"', tr)
            p = re.search(r'cell-rank">\s*(\d+)', tr)
            if n and s and p:
                rows.append((int(p.group(1)), html.unescape(n.group(1)), html.unescape(s.group(1))))
        mo, d, y = (int(x) for x in m.groups())
        return dt.date(2000 + y, mo, d).isoformat(), rows
    raise ValueError(f'no mock by {author} on the page')


def pfn(urls):
    t = get(urls[0])
    date = iso_date(re.search(r'"datePublished":"([^"]+)"', t).group(1))
    heads = [text(h) for h in re.findall(r'<h[2-4][^>]*>(.*?)</h[2-4]>', t[t.find('<article'):], re.S)]
    rows = []
    for a, b in zip(heads, heads[1:]):
        p, r = re.search(r'(?:^|\| )(\d+)\) ', a), re.match(r'(.+?), ([A-Za-z0-9/-]+), (.+)$', b)
        if p and r:
            rows.append((int(p.group(1)), r.group(1), r.group(3)))
    return date, rows


CBS = 'https://www.cbssports.com/nfl/draft/mock-draft/'
DT = 'https://www.drafttek.com/2027-NFL-Mock-Draft/2027-NFL-Mock-Draft-Round-{}.asp'
SOURCES = [
    ('tankathon', 'Tankathon', tankathon, ['https://www.tankathon.com/nfl/mock_draft']),
    ('walter', 'WalterFootball (Walt)', walter,
     ['https://walterfootball.com/draft2027.php', 'https://walterfootball.com/draft2027_1.php']),
    ('walter-campbell', 'WalterFootball (Charlie Campbell)', walter,
     ['https://walterfootball.com/draft2027charlie.php', 'https://walterfootball.com/draft2027charlie_1.php']),
    ('drafttek', 'Drafttek', drafttek, [DT.format(r) for r in (1, 2, 4, 6)]),
    ('cbs-wilson', 'CBS Sports (Ryan Wilson)', lambda u: cbs(u, 'Ryan Wilson'), [CBS]),
    ('cbs-renner', 'CBS Sports (Mike Renner)', lambda u: cbs(u, 'Mike Renner'), [CBS]),
    ('cbs-edwards', 'CBS Sports (Josh Edwards)', lambda u: cbs(u, 'Josh Edwards'), [CBS]),
    ('pfn', 'Pro Football Network (Jacob Infante)', pfn,
     ['https://www.profootballnetwork.com/2027-nfl-mock-draft-3-rounds-august/']),
]

SCHOOL_ALIAS = {
    'miami fla': 'miami', 'miami fl': 'miami', 'miami florida': 'miami', 'mississippi': 'ole miss',
    'brigham young': 'byu', 'louisiana state': 'lsu', 'southern california': 'usc',
    'central florida': 'ucf', 'southern methodist': 'smu', 'texas christian': 'tcu',
    'north carolina state': 'nc state', 'appalachian state': 'app state', 'hawaii': 'hawaii',
}


def norm_name(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r"[.'`]", '', s)
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return ' '.join(w for w in s.split() if w not in ('jr', 'sr', 'ii', 'iii', 'iv', 'v'))


def norm_school(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r"[.'`]", '', s)
    s = ' '.join(re.sub(r'[^a-z0-9& ]', ' ', s).split())
    s = re.sub(r' st$', ' state', s)
    return SCHOOL_ALIAS.get(s, s)


def consensus(entries):
    """entries: [(source_id, pick, date)] -> the per-player record."""
    picks = sorted(p for _, p, _ in entries)
    return {'pick': statistics.median(picks), 'lo': picks[0], 'hi': picks[-1], 'n': len(entries),
            'date': max(d for _, _, d in entries), 'src': [[s, p] for s, p, _ in entries]}


def load_college():
    raw = MODEL.read_text(encoding='utf-8')
    model = json.loads(raw[raw.index('=') + 1:].strip().rstrip(';'))
    return model['college']


def build():
    today = dt.date.today()
    college = load_college()
    index = {(norm_name(r['n']), norm_school(r['sch'])): r for r in college if r['cls'] == CLASS}
    by_name = {}
    for r in college:
        by_name.setdefault(norm_name(r['n']), []).append(r)
    found, sources, failed, missed = {}, [], [], {}
    for sid, name, parse, urls in SOURCES:
        try:
            date, rows = parse(urls)
            if not rows:
                raise ValueError('page loaded but no picks parsed')
        except Exception as e:  # a source that fails is reported, never filled in
            failed.append({'id': sid, 'name': name, 'url': urls[0], 'why': f'{type(e).__name__}: {e}'[:160]})
            continue
        age = (today - dt.date.fromisoformat(date)).days
        if age > MAX_AGE_DAYS:
            failed.append({'id': sid, 'name': name, 'url': urls[0], 'why': f'stale: dated {date}'})
            continue
        matched = 0
        for pick, pname, school in rows:
            r = index.get((norm_name(pname), norm_school(school)))
            if r:
                found.setdefault(str(r['cid']), []).append((sid, pick, date))
                matched += 1
            elif norm_name(pname) in by_name:
                have = ', '.join('%s %s' % (x['sch'], x['cls']) for x in by_name[norm_name(pname)])
                missed[pname] = f'{school} in mock; model has {have}'
        sources.append({'id': sid, 'name': name, 'url': urls[0], 'date': date, 'picks': len(rows), 'matched': matched})
    players = {cid: consensus(e) for cid, e in found.items()}
    out = {'generated': today.isoformat(), 'class': CLASS, 'maxAgeDays': MAX_AGE_DAYS,
           'sources': sources, 'failed': failed, 'players': players}
    OUT.write_text('window.MOCK_CONSENSUS = ' + json.dumps(out, separators=(',', ':')) + ';\n', encoding='utf-8')
    for s in sources:
        print(f"ok    {s['id']:16} {s['date']}  {s['picks']:3} picks, {s['matched']:2} matched")
    for f in failed:
        print(f"FAIL  {f['id']:16} {f['why']}")
    for n, why in missed.items():
        print(f'name match, school or class differs: {n}: {why}')
    print(f'mock-consensus: {len(players)} {CLASS} prospects from {len(sources)} sources')


def self_check():
    assert norm_name("A'Mauri Washington") == 'amauri washington'
    assert norm_name('Demond Williams Jr.') == 'demond williams'
    assert norm_school('Miami (Fla.)') == 'miami' and norm_school('Ohio St.') == 'ohio state'
    assert norm_school("Hawai'i") == norm_school('Hawaii')
    c = consensus([('a', 10, '2026-10-01'), ('b', 3, '2026-10-06'), ('c', 40, '2026-09-01')])
    assert (c['pick'], c['lo'], c['hi'], c['n'], c['date']) == (10, 3, 40, 3, '2026-10-06'), c
    assert consensus([('a', 10, '2026-10-01'), ('b', 13, '2026-10-01')])['pick'] == 11.5
    print('self-check ok')


if __name__ == '__main__':
    self_check() if '--self-check' in sys.argv else build()
