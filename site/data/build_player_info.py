"""Build timestamped player video intel from curated transcript takeaways."""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
SOURCE = ROOT / "transcripts" / "beyond-the-box-score-takeaways.json"
PLAYERS = ROOT / "players-nfl.json"
OUTPUT = ROOT / "site" / "data" / "player-info.js"
OFFENSIVE_POSITIONS = {"QB", "RB", "WR", "TE"}


def norm(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    value = re.sub(r"\b(jr|sr|ii|iii|iv)\b", "", value.lower())
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def seconds(label: str) -> int:
    parts = [int(part) for part in label.split(":")]
    if len(parts) != 3 or parts[1] > 59 or parts[2] > 59:
        raise ValueError(f"invalid timestamp: {label}")
    return parts[0] * 3600 + parts[1] * 60 + parts[2]


def duration(video_id: str) -> int:
    path = ROOT / "transcripts" / f"{video_id}.en.vtt"
    if not path.exists():
        raise ValueError(f"missing caption file: {path}")
    stamps = re.findall(r"(\d\d):(\d\d):(\d\d)\.\d+", path.read_text(encoding="utf-8-sig"))
    return max((int(h) * 3600 + int(m) * 60 + int(s) for h, m, s in stamps), default=0)


def sleeper_score(player: dict) -> tuple:
    fantasy_positions = set(player.get("fantasy_positions") or [])
    return (
        bool(player.get("active")),
        bool(fantasy_positions & OFFENSIVE_POSITIONS),
        bool(player.get("team")),
        int(player.get("years_exp") or 0),
    )


def choose_sleeper(name: str, candidates: list[tuple[str, dict]]) -> tuple[str, dict] | None:
    if not candidates:
        return None
    ranked = sorted(candidates, key=lambda item: sleeper_score(item[1]), reverse=True)
    if len(ranked) > 1 and sleeper_score(ranked[0][1]) == sleeper_score(ranked[1][1]):
        ids = ", ".join(player_id for player_id, _ in ranked if sleeper_score(_) == sleeper_score(ranked[0][1]))
        raise ValueError(f"ambiguous Sleeper match for {name}: {ids}")
    return ranked[0]


def build() -> dict:
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    sleeper = json.loads(PLAYERS.read_text(encoding="utf-8"))
    sleeper_by_name = {}
    for player_id, player in sleeper.items():
        name = player.get("full_name")
        if name:
            sleeper_by_name.setdefault(norm(name), []).append((player_id, player))

    video_durations = {video_id: duration(video_id) for video_id in source["videos"]}
    by_name = {}
    seen = set()
    for name, takeaways in source["players"].items():
        key = norm(name)
        sleeper_match = choose_sleeper(name, sleeper_by_name.get(key, []))
        record = {
            "name": sleeper_match[1]["full_name"] if sleeper_match else name,
            "sleeper_id": sleeper_match[0] if sleeper_match else None,
            "takeaways": [],
        }
        for item in takeaways:
            video_id = item["video_id"]
            if video_id not in source["videos"]:
                raise ValueError(f"{name}: unknown video {video_id}")
            at = seconds(item["timestamp"])
            if at > video_durations[video_id] + 2:
                raise ValueError(f"{name}: {item['timestamp']} exceeds {video_id} duration")
            identity = (key, video_id, at, item["takeaway"])
            if identity in seen:
                raise ValueError(f"duplicate takeaway: {identity}")
            seen.add(identity)
            record["takeaways"].append({
                "video_id": video_id,
                "at": at,
                "timestamp": item["timestamp"],
                "takeaway": item["takeaway"],
            })
        record["takeaways"].sort(
            key=lambda item: (source["videos"][item["video_id"]]["published_at"], -item["at"]),
            reverse=True,
        )
        by_name[key] = record

    by_id = {}
    for record in by_name.values():
        player_id = record["sleeper_id"]
        if player_id is None:
            continue
        if player_id in by_id:
            raise ValueError(f"duplicate Sleeper id in player info: {player_id}")
        by_id[player_id] = record

    return {
        "source": source["source"],
        "captured_at": source["captured_at"],
        "videos": source["videos"],
        "by_name": dict(sorted(by_name.items())),
        "by_id": dict(sorted(by_id.items())),
    }


def render(data: dict) -> str:
    return "window.PLAYER_INFO = " + json.dumps(data, separators=(",", ":"), ensure_ascii=False) + ";\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="validate source and generated file without writing")
    args = parser.parse_args()
    data = build()
    expected = render(data)
    takeaway_count = sum(len(player["takeaways"]) for player in data["by_name"].values())
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != expected:
            print(f"stale: {OUTPUT}")
            return 1
        print(f"ok: players={len(data['by_name'])}, takeaways={takeaway_count}, videos={len(data['videos'])}")
        return 0
    OUTPUT.write_text(expected, encoding="utf-8")
    print(f"wrote {OUTPUT}: players={len(data['by_name'])}, takeaways={takeaway_count}, videos={len(data['videos'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
