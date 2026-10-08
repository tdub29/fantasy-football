"""Pre-draft expected-capital boards, each read from the LAST Wayback capture made strictly before draft day (UTC).

Signal types stay apart. None of these is a mock pick, a fantasy rank or a real draft slot:
  wf    WalterFootball position boards: position rank and a projected-round range (one analyst)
  cbs   CBSSports position boards, page title "CBSSports.com - NFLDraftScout.com": overall rank, position rank,
        projected round (scouting board)
  espn  ESPN Scouts Inc board: OVR RK, POS RK, grade (scouting board and grade)
Key-free read-only GETs to web.archive.org only, never to the publisher. Each page is fetched at its exact CDX
timestamp and refused if Wayback serves a different capture. Raw pages cache to scratch with sha256.
Rights: no source licenses its data and the Internet Archive grants research access only, so the CSVs stay in
scratch as a private research cache. The repo holds this code and aggregate provenance only.

    python capital_wayback.py --selftest               # offline: parsers and round grammar
    python capital_wayback.py --smoke                  # live: one pinned capture per source, sha256 and rows
    python capital_wayback.py wf|cbs|espn [year ...]   # scratch <src>_predraft.csv and <src>_provenance.json
    python capital_wayback.py eval                     # coverage and accuracy vs nfl_draft_pick (PROSPECT_DB)
"""
import csv
import gzip
import hashlib
import html
import json
import os
import pathlib
import re
import sqlite3
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

SCR = pathlib.Path(os.environ.get("CAPITAL_SCRATCH", r"C:\Users\TrevorWhite\.claude\jobs\5b948640\tmp\capital"))
NFMDD = pathlib.Path(os.environ.get("NFMDD_CSV", r"C:\Users\TrevorWhite\.claude\jobs\ea66a469\tmp\nfmdd\nfmdd_predraft.csv"))
CDX = "http://web.archive.org/cdx/search/cdx"
# Round 1 start dates. A capture must come from an EARLIER UTC day so draft-night edits cannot leak.
DRAFT_DAY = {2012: "20120426", 2013: "20130425", 2014: "20140508", 2015: "20150430", 2016: "20160428",
             2017: "20170427", 2018: "20180426", 2019: "20190425", 2020: "20200423", 2021: "20210429",
             2022: "20220428", 2023: "20230427", 2024: "20240425", 2025: "20250424", 2026: "20260423"}
YEARS = {"wf": range(2012, 2027), "cbs": range(2013, 2018), "espn": range(2018, 2027)}
POS = ("QB", "RB", "WR", "TE")
COLS = ["source", "year", "capture", "stamp", "days_before", "page", "pos_rank", "ovr_rank", "name", "pos",
        "school", "proj_text", "round_lo", "round_hi", "top_cap", "grade", "src_id", "flag"]
MON = {m: i for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split(), 1)}


def get(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=180) as r:
                return r.read(), r.geturl()
        except Exception as ex:  # noqa: BLE001  (Wayback rate-limits; back off, then report)
            err = ex
            time.sleep(10 * (i + 1))
    raise RuntimeError(f"{url}: {err}")


def cdx(url, y, prefix=False):
    q = {"url": url, "from": f"{y - 1}0901", "to": DRAFT_DAY[y], "output": "json", "fl": "timestamp,original",
         "filter": "statuscode:200"}
    if prefix:
        q["matchType"] = "prefix"
    qs = urllib.parse.urlencode(q)
    c = SCR / "cdx" / f"{hashlib.sha256(qs.encode()).hexdigest()[:16]}.json"  # cached: reruns repeat no lookups
    if not c.exists():
        body, _ = get(CDX + "?" + qs)
        c.parent.mkdir(parents=True, exist_ok=True)
        c.write_bytes(body or b"[]")
    rows = json.loads(c.read_bytes() or b"[]")[1:]
    return [(ts, u) for ts, u in rows if ts[:8] < DRAFT_DAY[y]]  # CDX "to" is inclusive


def fetch(ts, url):
    """Page text at exactly this capture, cached. Refuses another served capture or a 1 MiB truncated record."""
    p = SCR / "raw" / f"{ts}_{hashlib.sha256(url.encode()).hexdigest()[:12]}.html"
    if not p.exists():
        b, served = get(f"http://web.archive.org/web/{ts}id_/{url}")
        got = re.search(r"/web/(\d{14})", served).group(1)
        if got != ts:
            raise RuntimeError(f"{url}: asked {ts}, Wayback served {got}")
        if len(b) == 1 << 20:
            raise RuntimeError(f"{url} {ts}: record truncated at 1 MiB")
        if b[:2] == b"\x1f\x8b":
            b = gzip.decompress(b)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(b)
        time.sleep(2)
    b = p.read_bytes()
    try:
        t = b.decode("utf-8")
    except UnicodeDecodeError:
        t = b.decode("latin-1")  # CBS pages declare ISO-8859-1
    return t, hashlib.sha256(b).hexdigest()


def txt(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


def days(stamp, y):
    a = time.strptime(stamp, "%Y-%m-%d")
    b = time.strptime(DRAFT_DAY[y], "%Y%m%d")
    return round((time.mktime(b) - time.mktime(a)) / 86400)


def wf_round(t):
    """(lo, hi, top): round range with 8 meaning undrafted, top = pick cap for "Top-N"; None if unreadable."""
    s = t.lower().replace(" ", "").replace("–", "-").replace("—", "-")  # 2021+ pages use an en dash
    if re.search(r"first-?overall|^no\.?1(=|$)", s):
        return 1, 1, 1
    if "second-overall" in s:
        return 1, 1, 2
    m = re.match(r"top-?(\d+)", s)
    if m:
        return 1, 1, int(m.group(1))
    if s == "fa":
        return 8, 8, None
    m = re.fullmatch(r"([1-7])(?:-([1-7]|fa))?", s)
    if not m:
        return None  # e.g. the typo "54-6"
    lo = int(m.group(1))
    hi = 8 if m.group(2) == "fa" else int(m.group(2) or lo)
    return (lo, hi, None) if lo <= hi else None


def parse_wf(raw, page_pos):
    """Board rows in page order. The page stamp ("last updated") is the vintage, not the capture."""
    rows = []
    for li in re.split(r'(?i)<li\b|<div class="panel" id="prpSlot_', raw)[1:]:  # list items to 2023, panels from 2024
        if "Projected Round" not in li:
            continue
        b = re.search(r"(?is)<b>(.*?)</b>", li)
        head = re.split(r"\s+Height:", txt(b.group(1)) if b else "")[0].strip()
        parts = [x.strip() for x in head.split(",")]
        nm = re.match(r"(.+?)(\*{0,2})$", parts[0])
        pos = parts[1] if len(parts) > 2 and re.fullmatch(r"[A-Z0-9/\-]+", parts[1]) else page_pos
        pr = re.search(r"(?is)Projected Round \((\d{4})\):\s*(.*?)</b>", li)
        rt = re.sub(r"(?i)\.?\s*View Ranking History.*$", "", txt(pr.group(2))).rstrip(".").strip() if pr else ""
        r = wf_round(rt)
        rows.append(dict(pos_rank=len(rows) + 1, name=nm.group(1).strip(), mark=nm.group(2), pos=pos,
                         school=parts[-1] if len(parts) > 1 else "", proj_year=pr.group(1) if pr else "",
                         proj_text=rt, round_lo=r and r[0], round_hi=r and r[1], top_cap=r and r[2]))
    u = re.search(r"last updated\s*([A-Z][a-z]+)\.?\s+(\d{1,2})\s*,?\s*(\d{4})", txt(raw))
    stamp = f"{u.group(3)}-{MON[u.group(1)[:3].lower()]:02d}-{int(u.group(2)):02d}" if u else None
    return stamp, rows


def parse_cbs(raw):
    """Rows of the NFLDraftScout table. Columns are read from the header, so sort order does not matter."""
    tab = re.search(r"(?is)<tr[^>]*>(?:(?!</tr>).)*Proj\. Round.*?</table>", raw)
    if not tab:
        return []
    trs = re.findall(r"(?is)<tr[^>]*>(.*?)</tr>", tab.group(0))
    head = [txt(c) for c in re.findall(r"(?is)<td[^>]*>(.*?)</td>", trs[0])]
    out = []
    for tr in trs[1:]:
        cells = re.findall(r"(?is)<td[^>]*>(.*?)</td>", tr)
        if len(cells) != len(head):
            continue
        d = dict(zip(head, (txt(c) for c in cells)))
        pid = re.search(r'data-player-id="(\d+)"', tr)
        if not d.get("Rank", "").isdigit():
            continue
        out.append(dict(ovr_rank=int(d["Rank"]), name=d["Player"].lstrip("*"), mark="*" if d["Player"].startswith("*") else "",
                        pos=d.get("Pos."), pos_rank=int(d["Pos. Rank"]) if d.get("Pos. Rank", "").isdigit() else None,
                        school=d.get("School"), proj_text=d.get("Proj. Round", ""), src_id=pid and pid.group(1)))
    return out


def parse_espn(raw):
    """(draftYear, pageIndex, pageCount, rows) from the board JSON embedded in the page."""
    i = raw.find('"bestAvailable":')
    if i < 0:
        return None, None, None, []
    ba, _ = json.JSONDecoder().raw_decode(raw, i + len('"bestAvailable":'))
    dy = re.search(r'"draftYear":(\d{4})', raw)
    pos = {p["id"]: p["abbreviation"] for p in ba.get("positions", [])}
    rows = []
    for a in ba.get("athletes", []):
        at = {x["name"]: x.get("displayValue") for x in a.get("attributes", [])}
        num = lambda v: int(v) if v and str(v).isdigit() else None  # noqa: E731
        rows.append(dict(src_id=a.get("id"), name=a.get("displayName"), pos=pos.get((a.get("position") or {}).get("id")),
                         school=(a.get("team") or {}).get("location"), pos_rank=num(at.get("rank")),
                         ovr_rank=num(at.get("overall")), grade=num(at.get("grade"))))
    return int(dy.group(1)) if dy else None, ba.get("pageIndex"), ba.get("pageCount"), rows


def pages(src, y):
    """{page label: [(ts, url), ...] newest first}: pre-draft captures of every board page for the fantasy positions."""
    cand = {}
    if src == "wf":
        for p in POS:
            # Old URL, plus the /{POS}Rankings{Y}.php rename (the 2024 pages link the 2025 class there)
            cand[p] = cdx(f"walterfootball.com/draft{y}{p}.php", y) + cdx(f"walterfootball.com/{p}Rankings{y}.php", y)
            time.sleep(2)
    elif src == "cbs":
        for ts, u in cdx(f"www.cbssports.com/nfl/draft/prospect-rankings-results/{y}", y, prefix=True):
            m = re.search(r"prospect-rankings-results/(\d{4})[/_]([A-Za-z]+)/([^?]*)\??(.*)$", u)
            if not m or int(m.group(1)) != y or m.group(2).upper() not in POS:
                continue
            q = m.group(4)
            # Full list (any sort) beats the rank-sorted first 25; other sorts select a different 25, so skip them.
            tier = 2 if "print_rows=9999" in q else 1 if m.group(3).startswith("overall") and q in ("", "&_1:col_1=1") else 0
            if tier:
                cand.setdefault(m.group(2).upper(), []).append((tier, ts, u))
        cand = {k: [(ts, u) for _, ts, u in sorted(v, reverse=True)] for k, v in cand.items()}
    else:
        for ts, u in cdx("www.espn.com/nfl/draft/bestavailable/_/position/", y, prefix=True):
            m = re.fullmatch(r"https?://www\.espn\.com(?::80)?/nfl/draft/bestavailable/_/position/(qb|rb|wr|te)(?:/page/(\d+))?/?", u)
            if m:
                cand.setdefault(f"{m.group(1).upper()}{int(m.group(2) or 1)}", []).append((ts, u))
    return {k: sorted(v, reverse=True)[:4] if src != "cbs" else v[:4] for k, v in sorted(cand.items()) if v}


def load(src, y):
    rows, prov = [], []
    for page, cands in pages(src, y).items():
        for ts, url in cands:  # newest first; a capture Wayback will not serve exactly is skipped, not substituted
            try:
                raw, sha = fetch(ts, url)
                break
            except RuntimeError as ex:
                prov.append(dict(source=src, year=y, page=page, url=url, capture=ts, rows=0, skipped=str(ex)[-80:]))
        else:
            continue
        cap = f"{ts[:4]}-{ts[4:6]}-{ts[6:8]}"
        if src == "wf":
            stamp, rs = parse_wf(raw, page)
            for r in rs:
                r["flag"] = "year_text" if r.pop("proj_year") != str(y) else ""
        elif src == "cbs":
            stamp, rs = cap, parse_cbs(raw)
            for r in rs:
                r["round_lo"], r["round_hi"], r["top_cap"] = (wf_round(r["proj_text"]) or (None, None, None))
        else:
            dy, pi, pc, rs = parse_espn(raw)
            stamp = cap
            if dy != y:  # a stale page still showing another class
                prov.append(dict(source=src, year=y, page=page, url=url, capture=ts, sha256=sha, rows=0, skipped=f"draftYear {dy}"))
                continue
        vint = stamp or cap
        for r in rs:
            rows.append({**{c: "" for c in COLS}, **{k: v for k, v in r.items() if k in COLS}, "source": src, "year": y,
                         "capture": ts, "stamp": vint, "days_before": days(vint, y), "page": page})
        prov.append(dict(source=src, year=y, page=page, url=url, capture=ts, stamp=vint, sha256=sha, rows=len(rs)))
    if src == "espn":  # one row per athlete: keep the freshest page that lists him
        keep = {}
        for r in rows:
            if r["src_id"] not in keep or r["capture"] > keep[r["src_id"]]["capture"]:
                keep[r["src_id"]] = r
        rows = sorted(keep.values(), key=lambda r: (r["pos"] or "", r["pos_rank"] or 999))
    return rows, prov


def norm(name):
    s = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[.'`\u2019]", "", s)
    s = re.sub(r"[^a-z ]+", " ", s)
    return " ".join(w for w in s.split() if w not in ("jr", "sr", "ii", "iii", "iv", "v"))


def spearman(xs, ys):
    def rank(v):
        o = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        i = 0
        while i < len(o):
            j = i
            while j + 1 < len(o) and v[o[j + 1]] == v[o[i]]:
                j += 1
            for k in range(i, j + 1):
                r[o[k]] = (i + j) / 2
            i = j + 1
        return r
    if len(xs) < 5:
        return None
    a, b = rank(xs), rank(ys)
    ma, mb = sum(a) / len(a), sum(b) / len(b)
    num = sum((p - ma) * (q - mb) for p, q in zip(a, b))
    den = (sum((p - ma) ** 2 for p in a) * sum((q - mb) ** 2 for q in b)) ** 0.5
    return round(num / den, 3) if den else None


def proj_pick(r):
    """Ordinal expected-pick proxy from a projected round range: Top-N maps inside round 1, 8 = undrafted."""
    if r.get("top_cap"):
        return (int(r["top_cap"]) + 1) / 2
    if r.get("round_lo") in ("", None):
        return None
    lo, hi = int(r["round_lo"]), int(r["round_hi"])
    return ((lo - 1) * 32 + hi * 32) / 2


EVAL_COLS = ["source", "year", "pos", "board_n", "matched_drafted", "fallback_matches", "drafted_at_pos", "coverage",
             "ambiguous", "days_before", "rho_signal_pick", "rho_signal_pick_noflag", "rho_posrank_pick", "round_hit",
             "n_common", "rho_other", "captures"]
PAIRS = (("wf", "cbs"), ("wf", "espn"), ("wf", "nfmdd"), ("espn", "nfmdd"))


def signal(src, r):
    """Ordinal expected-capital signal, smaller = earlier: WF projected-round midpoint, else the overall rank."""
    if src == "wf":
        return proj_pick(r)
    return float(r["ovr_rank"]) if r.get("ovr_rank") else None


def in_range(r, pick, rnd):
    if r.get("top_cap") not in ("", None):
        return pick <= int(r["top_cap"])
    return int(r["round_lo"]) <= rnd <= int(r["round_hi"])


def evaluate():
    """Coverage of the real draft and Spearman of board signal against actual pick, per source, class and position
    (plus ALL), among board players matched to ONE drafted QB/RB/WR/TE: drafted-only conditioning. Paired rows
    (source "a+b") score two boards on the same drafted players. Match: exact normalized name in the class, else
    first initial plus last name plus position when that is unique."""
    db = os.environ.get("PROSPECT_DB")
    if not db:
        sys.exit("set PROSPECT_DB to a scratch COPY of the prospect DB")
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    picks, alt, drafted = {}, {}, {}
    for season, rnd, pick, name, pos in con.execute(
            "select season, round, pick, pfr_player_name, position from nfl_draft_pick where season between 2012 and 2026"):
        w = norm(name).split()
        if pos not in POS or not w:
            continue
        picks.setdefault((season, " ".join(w)), []).append((pick, rnd))
        alt.setdefault((season, w[0][0], w[-1], pos), []).append((pick, rnd))
        drafted[(season, pos)] = drafted.get((season, pos), 0) + 1
    boards = {}
    for src in ("wf", "cbs", "espn"):
        f = SCR / f"{src}_predraft.csv"
        if f.exists():
            boards[src] = list(csv.DictReader(f.open(encoding="utf-8")))
    if NFMDD.exists():
        boards["nfmdd"] = [dict(r, ovr_rank=r["rank"]) for r in csv.DictReader(NFMDD.open(encoding="utf-8"))]
    groups = {}
    for src, rows in boards.items():
        for r in rows:
            # Board position = the position page (QB1 -> QB), else the listed one: WF lists "RB/FB" and the odd "225"
            y, pos, w = int(r["year"]), (r.get("page") or r.get("pos") or "")[:2].upper(), norm(r["name"]).split()
            hit = picks.get((y, " ".join(w)), [])
            r["_fb"] = not hit
            if not hit and w:
                hit = alt.get((y, w[0][0], w[-1], pos), [])
            r["_hit"] = hit[0] if len(hit) == 1 else None
            r["_ambig"] = len(hit) > 1
            if pos in POS:
                groups.setdefault((src, y, pos), []).append(r)
                groups.setdefault((src, y, "ALL"), []).append(r)
    out = []
    for (src, y, pos), rs in sorted(groups.items()):
        m = list({r["_hit"][0]: r for r in reversed(rs) if r["_hit"]}.values())  # one row per drafted player
        pr = [(signal(src, r), r["_hit"][0], r.get("flag")) for r in m if signal(src, r) is not None]
        rk = [(float(r["pos_rank"]), r["_hit"][0]) for r in m if r.get("pos_rank")] if pos != "ALL" else []
        rh = [in_range(r, *r["_hit"]) for r in m if r.get("round_lo") not in ("", None) or r.get("top_cap") not in ("", None)]
        nd = sum(drafted.get((y, p), 0) for p in POS) if pos == "ALL" else drafted.get((y, pos), 0)
        caps = sorted({r["capture"] for r in rs if r.get("capture")}) or [""]
        out.append(dict(source=src, year=y, pos=pos, board_n=len(rs), matched_drafted=len(m),
                        fallback_matches=sum(r["_fb"] for r in m), drafted_at_pos=nd,
                        coverage=round(len(m) / nd, 3) if nd else None, ambiguous=sum(r["_ambig"] for r in rs),
                        days_before=min((int(r["days_before"]) for r in rs if r.get("days_before") not in (None, "")), default=None),
                        rho_signal_pick=spearman([a for a, _, _ in pr], [b for _, b, _ in pr]),
                        rho_signal_pick_noflag=spearman([a for a, _, f in pr if not f], [b for _, b, f in pr if not f]),
                        rho_posrank_pick=spearman(*zip(*rk)) if rk else None,
                        round_hit=round(sum(rh) / len(rh), 3) if rh else None, captures=f"{caps[0]}..{caps[-1]}"))
    for a, b in PAIRS:
        for y in sorted({k[1] for k in groups if k[0] == a} & {k[1] for k in groups if k[0] == b}):
            sa, sb = ({r["_hit"][0]: signal(s, r) for r in groups[(s, y, "ALL")] if r["_hit"] and signal(s, r) is not None}
                      for s in (a, b))
            common = sorted(set(sa) & set(sb))
            if len(common) >= 5:
                out.append(dict(source=f"{a}+{b}", year=y, pos="ALL", n_common=len(common),
                                rho_signal_pick=spearman([sa[k] for k in common], common),
                                rho_other=spearman([sb[k] for k in common], common)))
    return out


def selftest():
    assert wf_round("First Overall Pick") == (1, 1, 1) and wf_round("No. 1=Overall Pick") == (1, 1, 1)
    assert wf_round("Second-overall pick") == (1, 1, 2) and wf_round("Top-20 pick") == (1, 1, 20)
    assert wf_round("Top 25") == (1, 1, 25) and wf_round("2-4") == (2, 4, None) and wf_round("6-FA") == (6, 8, None)
    assert wf_round("FA") == (8, 8, None) and wf_round("3") == (3, 3, None) and wf_round("5–7") == (5, 7, None)
    assert wf_round("54-6") is None and wf_round("4-2") is None and wf_round("No") is None
    page = ("<ol><li> <img src='x.gif'>\n<b> Robert Griffin*, III QB, Baylor </b> <b> <br> Height: 6-2. <br> "
            "Projected Round (2012): Second-overall pick. </b> <br> <li> <b> Kirk Cousins, Michigan State </b> "
            "<b> Height: 6-3. <br> Projected Round (2011): 2-4. </b> <li> <b> Kellen Moore, QB, Boise State <br> "
            "Height: 6-0. Projected Round (2012): 6-FA. </b></ol> This page was last updated <b> April 7 , 2018. </b>")
    stamp, rows = parse_wf(page, "QB")
    assert stamp == "2018-04-07", stamp
    assert [(r["name"], r["pos"], r["school"], r["proj_text"]) for r in rows] == [
        ("Robert Griffin", "QB", "Baylor", "Second-overall pick"), ("Kirk Cousins", "QB", "Michigan State", "2-4"),
        ("Kellen Moore", "QB", "Boise State", "6-FA")], rows
    assert rows[0]["mark"] == "*" and rows[1]["proj_year"] == "2011" and rows[2]["round_hi"] == 8
    panel = ('<li><a href="/x">nav</a></li> <div class="panel" id="prpSlot_1"> <span class="pick-number">1.</span> <b> '
             '<a href="/s">Blake Corum</a>, RB, Michigan <br> Height: 5-8.<br>Projected Round (2024): 2-3. </b> </div> '
             '<div class="panel" id="prpSlot_2"> <b> <a href="/t">Trevor Lawrence</a>, QB, Clemson <br> Height: 6-6.<br>'
             'Projected Round (2024): No. 1. View Ranking History </b> </div> last updated <b> March 30, 2024. </b>')
    stamp, rows = parse_wf(panel, "RB")
    assert stamp == "2024-03-30" and [(r["name"], r["school"], r["round_lo"], r["top_cap"]) for r in rows] == [
        ("Blake Corum", "Michigan", 2, None), ("Trevor Lawrence", "Clemson", 1, 1)], rows
    cbs = ('<table><tr><td>Rank</td><td>Player</td><td>Pos.</td><td>Pos. Rank</td><td>School</td><td>Class</td>'
           '<td>Ht.</td><td>Wt.</td><td>Proj. Round</td></tr><tr class="row1"><td>36</td><td><a href="/p" '
           'data-player-id="1884454">Bishop Sankey</a></td><td>RB</td><td>1</td><td>Washington</td><td>Jr</td>'
           '<td>5-10</td><td>203</td><td>1-2</td></tr></table>')
    assert parse_cbs(cbs) == [dict(ovr_rank=36, name="Bishop Sankey", mark="", pos="RB", pos_rank=1, school="Washington",
                                   proj_text="1-2", src_id="1884454")]
    espn = ('{"draftYear":2019,"bestAvailable":{"pageCount":15,"pageIndex":1,"pageSize":25,"positions":[{"id":"31",'
            '"abbreviation":"DE"}],"athletes":[{"displayName":"Nick Bosa","id":"103504","team":{"location":"Ohio State"},'
            '"position":{"id":"31"},"attributes":[{"name":"rank","displayValue":"1"},{"name":"overall","displayValue":"1"},'
            '{"name":"grade","displayValue":"95"}]}]}}')
    dy, pi, pc, rs = parse_espn(espn)
    assert (dy, pi, pc) == (2019, 1, 15) and rs == [dict(src_id="103504", name="Nick Bosa", pos="DE", school="Ohio State",
                                                         pos_rank=1, ovr_rank=1, grade=95)], rs
    assert norm("D.J. Moore") == "dj moore" and norm("Robert Griffin III") == "robert griffin"
    assert spearman([1, 2, 3, 4, 5], [5, 6, 7, 8, 20]) == 1.0 and spearman([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]) == -1.0
    assert in_range(dict(top_cap="10"), 7, 1) and not in_range(dict(top_cap="", round_lo="2", round_hi="3"), 40, 1)
    assert in_range(dict(top_cap="", round_lo="2", round_hi="3"), 70, 3) and not in_range(dict(round_lo="8", round_hi="8"), 250, 7)
    assert proj_pick(dict(top_cap=10)) == 5.5 and proj_pick(dict(round_lo=2, round_hi=4, top_cap=None)) == 80.0
    print("selftest ok")


# One pinned capture per source: the loader must reproduce these bytes and row counts with no credentials.
SMOKE = [("wf", "20180425082945", "http://walterfootball.com:80/draft2018RB.php", "b650de1b7c846826", 32),
         ("espn", "20190420194911", "http://www.espn.com/nfl/draft/bestavailable", "dc1b2fd2b6ed3ded", 25)]


def smoke():
    for src, ts, url, sha16, n in SMOKE:
        raw, sha = fetch(ts, url)
        rows = parse_wf(raw, "RB")[1] if src == "wf" else parse_espn(raw)[3]
        assert sha.startswith(sha16) and len(rows) == n, (src, sha[:16], len(rows))
        print(src, ts, sha[:16], len(rows), "ok")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    a = sys.argv[1:]
    if a == ["--selftest"]:
        selftest()
    elif a == ["--smoke"]:
        smoke()
    elif a == ["eval"]:
        res = evaluate()
        w = csv.DictWriter(sys.stdout, fieldnames=EVAL_COLS, restval="")
        w.writeheader()
        w.writerows(res)
    elif a and a[0] in YEARS:
        src = a[0]
        SCR.mkdir(parents=True, exist_ok=True)
        ys = [int(x) for x in a[1:]] or list(YEARS[src])
        allrows, allprov = [], []
        if (SCR / f"{src}_predraft.csv").exists():  # rerun: a class is replaced only once its reload finishes
            allrows = list(csv.DictReader((SCR / f"{src}_predraft.csv").open(encoding="utf-8")))
            allprov = json.loads((SCR / f"{src}_provenance.json").read_text())
        for y in ys:
            rows, prov = load(src, y)
            allrows = [r for r in allrows if int(r["year"]) != y] + rows
            allprov = [r for r in allprov if int(r["year"]) != y] + prov
            print(src, y, "pages", len(prov), "rows", len(rows), flush=True)
            # Written after every class, so a Wayback outage loses at most the class in progress
            with (SCR / f"{src}_predraft.csv").open("w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=COLS, extrasaction="ignore")
                w.writeheader()
                w.writerows(sorted(allrows, key=lambda r: int(r["year"])))
            (SCR / f"{src}_provenance.json").write_text(json.dumps(allprov, indent=1))
            time.sleep(3)
    else:
        sys.exit(__doc__)
