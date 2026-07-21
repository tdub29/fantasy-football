"""Deterministic verbatim-quote -> timestamp anchoring against YouTube .en.vtt.

Builds an ordered (word, start_seconds) stream from the vtt inline timing tags,
then finds where a quote's word sequence first appears. Also verifies the quote
is a real contiguous span of the transcript. No LLM, no guessing.
"""
from __future__ import annotations
import re, sys, json
from pathlib import Path

HERE = Path(__file__).parent
CUE_RE = re.compile(r"^(\d\d):(\d\d):(\d\d)\.(\d+)\s*-->\s*(\d\d):(\d\d):(\d\d)\.(\d+)")
INLINE_RE = re.compile(r"<(\d\d):(\d\d):(\d\d)\.(\d+)><c>(.*?)</c>", re.S)

def _hms(h, m, s, ms=0):
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000.0

def normword(w: str) -> str:
    # letters+digits only, lowercase; collapses punctuation/case/ASR spacing noise
    return re.sub(r"[^a-z0-9]", "", w.lower())

def word_stream(vid: str):
    """Ordered (normword, start_seconds) from INLINE timing tags only.

    YouTube rolling captions repeat previously-spoken lines as *plain* head text
    (no inline tag); only newly-spoken words carry an inline `<ts><c>w</c>` tag.
    So inline-only == each word once, in spoken order, correctly timed. The single
    gap is the first word of each cue's new line (plain, untagged) — the fuzzy
    in-order matcher in find_time tolerates those.
    """
    text = (HERE / f"{vid}.en.vtt").read_text(encoding="utf-8-sig")
    words = []
    for line in text.splitlines():
        for mm in INLINE_RE.finditer(line):
            t = _hms(*mm.group(1, 2, 3, 4))
            for w in mm.group(5).split():
                nw = normword(w)
                if nw:
                    words.append((nw, t))
    return words

def plain_words(vid: str):
    """Normalized word list from the clean .txt (the substring-verification source)."""
    txt = (HERE / f"{vid}.txt").read_text(encoding="utf-8-sig")
    return [normword(w) for w in txt.split() if normword(w)], txt

def _fmt(sec: int) -> str:
    return f"{sec // 3600:02d}:{sec % 3600 // 60:02d}:{sec % 60:02d}"

def find_time(vid: str, quote: str):
    """Return (start_seconds, HH:MM:SS) for the earliest place the quote begins in
    the vtt word stream, else None. Fuzzy in-order match of the first ~14 words,
    tolerating cue-initial words missing from the inline stream."""
    q = [normword(w) for w in quote.split() if normword(w)]
    if not q:
        return None
    stream = word_stream(vid)
    sw = [w for w, _ in stream]
    key = q[: min(14, len(q))]
    need = max(4, int(0.66 * len(key)))
    heads = set(key[:3])  # candidate starts (first word may be a missing cue-initial)
    for i in range(len(sw)):
        if sw[i] not in heads:
            continue
        j, ki, matched = i, 0, 0
        end = min(len(sw), i + len(key) + 8)
        while ki < len(key) and j < end:
            if sw[j] == key[ki]:
                matched += 1; ki += 1; j += 1
            elif ki + 1 < len(key) and sw[j] == key[ki + 1]:
                ki += 1  # key word missing from stream (cue-initial) -> skip it
            else:
                j += 1  # stream noise -> skip it
        if matched >= need:
            sec = int(stream[i][1])
            return sec, _fmt(sec)
    return None

def txt_words(vid: str):
    """(list of (normword, char_start, char_end), raw_text) for the clean .txt."""
    raw = (HERE / f"{vid}.txt").read_text(encoding="utf-8-sig")
    out = []
    for m in re.finditer(r"\S+", raw):
        nw = normword(m.group(0))
        if nw:
            out.append((nw, m.start(), m.end()))
    return out, raw

def _locate(words, phrase, start=0):
    """Earliest (start_idx, end_idx) at/after `start` where phrase words match in
    order within a window (fuzzy: tolerates minor ASR word diffs). end_idx is the
    last matched word index. None if not found."""
    p = [normword(w) for w in phrase.split() if normword(w)]
    if not p:
        return None
    sw = [w for w, _, _ in words]
    need = max(3, int(0.6 * len(p)))
    heads = set(p[:3])
    for i in range(start, len(sw)):
        if sw[i] not in heads:
            continue
        j, ki, matched, last = i, 0, 0, i
        end = min(len(sw), i + len(p) + 10)
        while ki < len(p) and j < end:
            if sw[j] == p[ki]:
                matched += 1; ki += 1; last = j; j += 1
            elif ki + 1 < len(p) and sw[j] == p[ki + 1]:
                ki += 1
            else:
                j += 1
        if matched >= need:
            return i, last
    return None

def extract_span(vid: str, start_phrase: str, end_phrase: str):
    """Slice the exact verbatim .txt span between the two phrase anchors.
    Returns dict(quote, at, timestamp) or dict(error=...)."""
    words, raw = txt_words(vid)
    s = _locate(words, start_phrase)
    if not s:
        return {"error": f"start_phrase not found: {start_phrase!r}"}
    si = s[0]
    e = _locate(words, end_phrase, start=si)
    if not e:
        return {"error": f"end_phrase not found after start: {end_phrase!r}"}
    ei = e[1]
    if ei < si:
        return {"error": "end before start"}
    quote = raw[words[si][1]:words[ei][2]].strip()
    quote = re.sub(r"\s+", " ", quote)
    anc = find_time(vid, quote)
    if not anc:
        return {"error": f"could not anchor timestamp for span"}
    return {"quote": quote, "at": anc[0], "timestamp": anc[1]}

def verify_substring(vid: str, quote: str):
    """True if quote is a contiguous span of the .txt (whitespace/case/punct-insensitive)."""
    q = [normword(w) for w in quote.split() if normword(w)]
    pw, _ = plain_words(vid)
    if not q:
        return False
    n = len(q)
    for i in range(len(pw) - n + 1):
        if pw[i:i + n] == q:
            return True
    return False

MAX_WORDS = 70  # a quote longer than this means a runaway end_phrase; flag it

def build_cmd(vid: str, spans_path: str, out_path: str) -> int:
    """Read [{player,start_phrase,end_phrase,skip,reason}], slice verbatim spans,
    anchor timestamps, verify, write results. Prints a summary; nonzero if any error."""
    spans = json.loads(Path(spans_path).read_text(encoding="utf-8"))
    results, errors = [], 0
    for sp in spans:
        player = sp.get("player", "").strip()
        if sp.get("skip"):
            results.append({"player": player, "video_id": vid, "status": "skip",
                            "reason": sp.get("reason", "")})
            continue
        r = extract_span(vid, sp.get("start_phrase", ""), sp.get("end_phrase", ""))
        if "error" in r:
            errors += 1
            results.append({"player": player, "video_id": vid, "status": "error",
                            "error": r["error"], "start_phrase": sp.get("start_phrase"),
                            "end_phrase": sp.get("end_phrase")})
            continue
        nwords = len(r["quote"].split())
        ok = verify_substring(vid, r["quote"])
        status = "ok"
        if not ok:
            status = "error"; errors += 1
        elif nwords > MAX_WORDS:
            status = "toolong"; errors += 1
        results.append({"player": player, "video_id": vid, "status": status,
                        "timestamp": r["timestamp"], "at": r["at"],
                        "takeaway": r["quote"], "words": nwords})
    Path(out_path).write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    good = sum(1 for x in results if x["status"] == "ok")
    print(f"{vid}: {good} ok, {errors} need-fix, {len(results)} total -> {out_path}")
    for x in results:
        if x["status"] not in ("ok", "skip"):
            print(f"  FIX [{x['status']}] {x['player']}: {x.get('error') or str(x.get('words'))+' words'}")
    return 1 if errors else 0

if __name__ == "__main__":
    if len(sys.argv) >= 5 and sys.argv[1] == "build":
        sys.exit(build_cmd(sys.argv[2], sys.argv[3], sys.argv[4]))
    # default: self-check on Cam Ward
    vid = "9PIPsiPe_-A"
    for sp, ep in [("I watched every Cam Ward dropback", "dropback from 2025"),
                   ("only Shadur Sanders graded", "worse than Cam Ward among qualified"),
                   ("his vision is just uncanny", "feel for timing and space")]:
        r = extract_span(vid, sp, ep)
        assert "quote" in r and verify_substring(vid, r["quote"]), r
        print(f"[{r['timestamp']}] {r['quote'][:70]}")
    print("SELF-CHECK PASS")
