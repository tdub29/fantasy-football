"""OUR OWN dynasty player categories via literal k-means clustering (numpy, seeded)
on interpretable features: dynasty value (KTC 1QB), age (career stage), and our own
season fantasy-point projection (position-relative). Replaces the off-base third-party
"category" field. Clusters are labeled from their centroids (glass-box: every label is
explained by where the cluster sits on value/age/production).

Emits site/data/categories.js (window.PLAYER_CATEGORIES keyed by sleeper_id).
"""
import json, re, unicodedata, pathlib
import numpy as np

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parent
SITE = ROOT / "site" / "data"
K = 9  # more granular archetypes; clusters live in value+age space so labels never split a group
RNG = np.random.default_rng(42)

def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s.lower())
    return re.sub(r"[^a-z0-9]+", " ", s).strip()

def load_ktc():
    # ktc.js = `(window.RANKINGS_SOURCES=...).push( {JSON} );` — brace-match the object
    txt = (SITE / "ktc.js").read_text(encoding="utf-8")
    start = txt.index("{", txt.index(".push("))
    depth = 0
    for i in range(start, len(txt)):
        if txt[i] == "{": depth += 1
        elif txt[i] == "}":
            depth -= 1
            if depth == 0: end = i + 1; break
    obj = json.loads(txt[start:end])
    oneqb = next(r for r in obj["rankings"] if r.get("format") == "dynasty_1qb")
    return {norm(p["name"]): p for p in oneqb["players"]}

def load_proj():
    proj = {}
    for f in ("offense-projections.json", "defense-projections.json"):
        for p in json.loads((HERE / f).read_text(encoding="utf-8"))["players"]:
            if p.get("id"): proj[p["id"]] = p.get("blend")
    return proj

def kmeans(X, k, iters=100, restarts=12):
    best = None
    for _ in range(restarts):
        # k-means++ init
        c = [X[RNG.integers(len(X))]]
        for _ in range(k - 1):
            d = np.min([np.sum((X - ci) ** 2, axis=1) for ci in c], axis=0)
            probs = d / d.sum()
            c.append(X[RNG.choice(len(X), p=probs)])
        C = np.array(c)
        for _ in range(iters):
            lab = np.argmin(((X[:, None, :] - C[None, :, :]) ** 2).sum(2), axis=1)
            newC = np.array([X[lab == j].mean(0) if np.any(lab == j) else C[j] for j in range(k)])
            if np.allclose(newC, C): C = newC; break
            C = newC
        inertia = sum(((X[lab == j] - C[j]) ** 2).sum() for j in range(k))
        if best is None or inertia < best[0]: best = (inertia, C, lab)
    return best[1], best[2]

def main():
    ktc = load_ktc()
    proj = load_proj()
    players = json.loads((ROOT / "players-nfl.json").read_text(encoding="utf-8"))
    # KTC 1QB is offense-only; restrict name->id to offensive players (active first)
    # so a same-named IDP (e.g. Josh Allen DE vs QB) never steals the mapping.
    id_by_name = {}
    for pid, p in sorted(players.items(), key=lambda kv: (not kv[1].get("active"),)):
        if p.get("position") not in {"QB", "RB", "WR", "TE"}: continue
        nm = norm(p.get("full_name") or "")
        if nm: id_by_name.setdefault(nm, pid)

    rows = []
    for nm, k in ktc.items():
        pid = id_by_name.get(nm)
        age = k.get("age") or (players.get(pid, {}) if pid else {}).get("age")
        rows.append({"name": k["name"], "pos": k.get("pos"), "pid": pid,
                     "value": float(k.get("ktcValue") or 0), "age": float(age or 0),
                     "proj": float(proj.get(pid) or 0) if pid else 0.0})
    # impute missing age with position median
    for pos in set(r["pos"] for r in rows):
        ages = [r["age"] for r in rows if r["pos"] == pos and r["age"] > 0]
        med = float(np.median(ages)) if ages else 24.0
        for r in rows:
            if r["pos"] == pos and r["age"] <= 0: r["age"] = med

    # Cluster on the SAME two axes the labels use — dynasty value + age. Keeping the
    # feature space identical to the label space means a cluster can't contain a
    # value/age outlier that contradicts its label. (proj stays as a display stat.)
    # Literal clustering that CANNOT produce an in-group outlier: split by age stage
    # (career phase), then 1-D k-means on dynasty value WITHIN each stage. Value tiers
    # are contiguous ranges, so no member sits far from its group on either axis.
    STAGE = [("prime", lambda a: a <= 25), ("mid", lambda a: 25 < a < 28), ("aging", lambda a: a >= 28)]
    # tier 0 = highest value in the stage, tier 2 = lowest
    LABELS = {
        "prime": [("Cornerstone", "elite dynasty value, ascending age"),
                  ("Ascending", "strong value, young, trending up"),
                  ("Young Upside", "young developmental piece, room to rise")],
        "mid":   [("Win-Now Star", "elite value in prime, contend now"),
                  ("Win-Now Starter", "solid prime-age starter"),
                  ("Rotational", "prime-age depth / flex")],
        "aging": [("Aging Elite", "still-elite value but past 28, sell-high window"),
                  ("Veteran Starter", "aging vet who still produces"),
                  ("Aging Depth", "older, low dynasty value, redraft depth")],
    }
    out, legend = {}, []
    gid = 0
    for sname, pred in STAGE:
        idx = [i for i, r in enumerate(rows) if pred(r["age"])]
        if not idx: continue
        v = np.array([rows[i]["value"] for i in idx], dtype=float)
        k = min(3, len(set(v.round().tolist())))
        if k < 1: continue
        _, lab = kmeans(v.reshape(-1, 1), k) if k > 1 else (None, np.zeros(len(idx), int))
        # order clusters by mean value desc -> tier 0 (top) .. k-1
        order = sorted(range(k), key=lambda c: -v[lab == c].mean())
        tier_of = {c: t for t, c in enumerate(order)}
        for t in range(k):
            members = [idx[m] for m in range(len(idx)) if tier_of[int(lab[m])] == t]
            if not members: continue
            name, why = LABELS[sname][min(t, len(LABELS[sname]) - 1)]
            mv = [rows[i]["value"] for i in members]
            legend.append({"cluster": gid, "stage": sname, "tier": t, "label": name, "why": why,
                           "n": len(members), "avg_value": int(np.mean(mv)),
                           "value_range": [int(min(mv)), int(max(mv))],
                           "avg_age": round(float(np.mean([rows[i]["age"] for i in members])), 1),
                           "examples": [rows[i]["name"] for i in sorted(members, key=lambda i: -rows[i]["value"])[:4]]})
            for i in members:
                r = rows[i]
                if not r["pid"]: continue
                out[r["pid"]] = {"category": name, "cluster": gid, "stage": sname, "tier": t, "why": why,
                                 "value": int(r["value"]), "age": round(r["age"], 1), "proj": round(r["proj"], 1)}
            gid += 1
    payload = {"method": "age-stage split + 1-D k-means on dynasty value within each stage (contiguous value tiers = no in-group outliers)",
               "legend": sorted(legend, key=lambda x: -x["avg_value"]), "players": out}
    SITE.mkdir(parents=True, exist_ok=True)
    (SITE / "categories.js").write_text("window.PLAYER_CATEGORIES = " + json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + ";\n", encoding="utf-8")
    (HERE / "categories.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    ncat = len(set(v["category"] for v in out.values()))
    assert len(out) > 200 and ncat >= 6, "too few categories"
    # tightness: overlapping value ranges across same-stage tiers would mean a fuzzy split
    print(f"clustered {len(out)} players -> {ncat} categories ({len(legend)} groups), 0 in-group outliers by construction")
    for L in sorted(legend, key=lambda x: -x["avg_value"]):
        print(f"  [{L['label']:16s}] {L['stage']:5s} n={L['n']:3d} val {L['value_range'][0]:5d}-{L['value_range'][1]:5d} age~{L['avg_age']:.0f}  e.g. {', '.join(L['examples'][:3])}")

if __name__ == "__main__":
    main()
