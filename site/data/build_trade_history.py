"""Build instant, league-specific trade partner history from Sleeper.

Historical transactions and completed drafts do not change. Cache them on disk,
refresh the active season every six hours, and ship the compact result so Trade
Lab does not make roughly 100 API requests before showing its first row.
"""
from __future__ import annotations

import concurrent.futures
import datetime
import json
import pathlib
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
LEAGUES = ROOT / "site" / "data" / "leagues.js"
OUT = ROOT / "site" / "data" / "trade-history.js"
CACHE = ROOT / "notes" / "faab-cache"
MY_USER_ID = "726629031964975104"
ACTIVE_TTL = 6 * 3600
UA = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )
}


def fetch_json(url: str):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=90) as response:
                return json.load(response)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            if attempt == 3:
                raise
            time.sleep(attempt + 1)


def cached(name: str, url: str, max_age: int | None = None):
    path = CACHE / name
    if path.exists() and (max_age is None or time.time() - path.stat().st_mtime < max_age):
        return json.loads(path.read_text(encoding="utf-8"))
    payload = fetch_json(url)
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    return payload


def load_site_leagues():
    source = LEAGUES.read_text(encoding="utf-8")
    start = source.index("[")
    rows, _ = json.JSONDecoder().raw_decode(source[start:])
    return [row for row in rows
            if str(row.get("id", "")).isdigit() and row.get("platform") != "espn"]


def chain_for(league_id: str):
    chain, seen, current = [], set(), league_id
    while current and current != "0" and current not in seen and len(chain) < 10:
        seen.add(current)
        meta = cached(
            f"league_{current}.json",
            f"https://api.sleeper.app/v1/league/{current}",
        )
        chain.append({"id": current, "season": str(meta.get("season", "")),
                      "sf": "SUPER_FLEX" in (meta.get("roster_positions") or [])})
        current = str(meta.get("previous_league_id") or "")
    return chain


def endpoint_specs(site_leagues, chains):
    specs = {}
    for league in site_leagues:
        current_id = str(league["id"])
        for season in chains[current_id]:
            league_id = season["id"]
            ttl = ACTIVE_TTL if league_id == current_id else None
            specs[(league_id, "rosters")] = (
                f"trade_rosters_{league_id}.json",
                f"https://api.sleeper.app/v1/league/{league_id}/rosters", ttl,
            )
            specs[(league_id, "users")] = (
                f"trade_users_{league_id}.json",
                f"https://api.sleeper.app/v1/league/{league_id}/users", ttl,
            )
            specs[(league_id, "drafts")] = (
                f"trade_drafts_{league_id}.json",
                f"https://api.sleeper.app/v1/league/{league_id}/drafts", ttl,
            )
            for week in range(19):
                specs[(league_id, "tx", week)] = (
                    f"tx_{league_id}_{week}.json",
                    f"https://api.sleeper.app/v1/league/{league_id}/transactions/{week}", ttl,
                )
    return specs


def fetch_specs(specs):
    out = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
        futures = {pool.submit(cached, *spec): key for key, spec in specs.items()}
        for future in concurrent.futures.as_completed(futures):
            out[futures[future]] = future.result()
    return out


def pick_key(season, round_no, origin_uid):
    return f"{season}|{round_no}|{origin_uid}" if origin_uid else None


def build_league(chain, raw, draft_picks):
    counts, names, usernames, outcomes = {}, {}, {}, {}
    for season in chain:
        league_id = season["id"]
        rosters = raw.get((league_id, "rosters")) or []
        users = raw.get((league_id, "users")) or []
        owner_of = {str(r.get("roster_id")): str(r.get("owner_id")) for r in rosters}
        my_roster_id = next((str(r.get("roster_id")) for r in rosters
                             if str(r.get("owner_id")) == MY_USER_ID), "")
        for user in users:
            uid = str(user.get("user_id"))
            team = str((user.get("metadata") or {}).get("team_name")
                       or user.get("display_name") or uid).strip()
            display = str(user.get("display_name") or "").strip()
            names.setdefault(uid, team)
            if display:
                usernames.setdefault(uid, display)

        for draft in raw.get((league_id, "drafts")) or []:
            if draft.get("status") != "complete":
                continue
            slot_owners = {str(slot): str(uid)
                           for uid, slot in (draft.get("draft_order") or {}).items()}
            slot_rosters = draft.get("slot_to_roster_id") or {}
            team_count = len(slot_owners) or len(slot_rosters) or len(rosters)
            for pick in draft_picks.get(str(draft.get("draft_id")), []):
                slot = str(pick.get("draft_slot") or "")
                origin_uid = slot_owners.get(slot) or owner_of.get(str(slot_rosters.get(slot)))
                key = pick_key(draft.get("season") or season["season"], pick.get("round"), origin_uid)
                if not key or key in outcomes:
                    continue
                metadata = pick.get("metadata") or {}
                player = " ".join(x for x in (
                    metadata.get("first_name"), metadata.get("last_name")) if x).strip()
                player = player or f"#{pick.get('player_id')}"
                pick_no = int(pick.get("pick_no") or 0)
                in_round = ((pick_no - 1) % team_count) + 1 if team_count and pick_no else int(slot or 0) or None
                outcomes[key] = {"playerName": player, "pickInRound": in_round}

        for week in range(19):
            for tx in raw.get((league_id, "tx", week)) or []:
                if tx.get("type") != "trade" or tx.get("status") != "complete" or not my_roster_id:
                    continue
                uids = [owner_of.get(str(rid)) for rid in (tx.get("roster_ids") or [])]
                uids = [str(uid) for uid in uids if uid]
                if MY_USER_ID not in uids:
                    continue

                def players_for(assets, roster_id):
                    return [str(pid) for pid, owner in (assets or {}).items()
                            if str(owner) == roster_id]

                def pick_info(pick):
                    origin_uid = owner_of.get(str(pick.get("roster_id")))
                    return {
                        "season": str(pick.get("season")),
                        "round": int(pick.get("round")),
                        "key": pick_key(pick.get("season"), pick.get("round"), origin_uid),
                    }

                picks = tx.get("draft_picks") or []
                trade = {
                    "season": season["season"],
                    "week": tx.get("leg"),
                    "at": int(tx.get("status_updated") or tx.get("created") or 0),
                    "got": players_for(tx.get("adds"), my_roster_id),
                    "sent": players_for(tx.get("drops"), my_roster_id),
                    "gotPicks": [pick_info(p) for p in picks
                                 if str(p.get("owner_id")) == my_roster_id],
                    "sentPicks": [pick_info(p) for p in picks
                                  if str(p.get("previous_owner_id")) == my_roster_id
                                  and str(p.get("owner_id")) != my_roster_id],
                }
                for uid in uids:
                    if uid == MY_USER_ID:
                        continue
                    entry = counts.setdefault(uid, {"n": 0, "seasons": [], "last": 0, "trades": []})
                    entry["n"] += 1
                    if season["season"] not in entry["seasons"]:
                        entry["seasons"].append(season["season"])
                    entry["last"] = max(entry["last"], trade["at"])
                    entry["trades"].append(trade)

    seen = set()
    for entry in counts.values():
        for trade in entry["trades"]:
            if id(trade) in seen:
                continue
            seen.add(id(trade))
            for side in ("gotPicks", "sentPicks"):
                for pick in trade[side]:
                    pick["outcome"] = outcomes.get(pick["key"])

    partners = []
    for uid, entry in counts.items():
        entry["trades"].sort(key=lambda trade: trade["at"], reverse=True)
        partners.append({
            "uid": uid, "name": names.get(uid, uid), "username": usernames.get(uid, ""), **entry,
        })
    partners.sort(key=lambda row: (-row["n"], -row["last"]))
    # Seasons played superflex, so a trade's value chart reads the KTC board the
    # league used THEN: The League was 1QB in 2024 whatever it is now.
    return {"seasons": [s["season"] for s in chain], "partners": partners,
            "superflex": [s["season"] for s in chain if s.get("sf")]}


def main():
    site_leagues = load_site_leagues()
    chains = {str(league["id"]): chain_for(str(league["id"])) for league in site_leagues}
    specs = endpoint_specs(site_leagues, chains)
    raw = fetch_specs(specs)

    draft_specs = {}
    for key, drafts in raw.items():
        if len(key) != 2 or key[1] != "drafts":
            continue
        for draft in drafts or []:
            if draft.get("status") == "complete":
                draft_id = str(draft["draft_id"])
                draft_specs[draft_id] = (
                    f"trade_draft_picks_{draft_id}.json",
                    f"https://api.sleeper.app/v1/draft/{draft_id}/picks", None,
                )
    draft_picks = fetch_specs(draft_specs)
    payload = {
        "generated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "leagues": {
            league_id: build_league(chain, raw, draft_picks)
            for league_id, chain in chains.items()
        },
    }
    OUT.write_text(
        "window.TRADE_HISTORY = " + json.dumps(payload, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(f"wrote {OUT.relative_to(ROOT)}: {OUT.stat().st_size / 1024:.1f} KB")
    for league in site_leagues:
        data = payload["leagues"][str(league["id"])]
        print(f"  {league['name']}: {len(data['partners'])} partners, "
              f"{sum(p['n'] for p in data['partners'])} trades")


if __name__ == "__main__":
    main()
