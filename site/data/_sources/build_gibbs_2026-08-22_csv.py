"""Emit the Gibbs 2026-08-22 top-200 as the CSV shape build_jacob_gibbs.py reads.

Same shape as build_gibbs_2026-08-14_csv.py: paste the board exactly as it prints
("<rank> <Name> <TEAM> (<bye>) <POS>", with "TIER n" separator lines) and this
computes the positional ranks, which Gibbs' own board never shows.

STATE: ranks 85-200 are transcribed and verified. Ranks 1-84 are NOT YET SOURCED -
Trevor's 2026-08-22 phone screenshot only covered 85-200, and the top half of this
board is not published anywhere reachable (the CBS Aug-14 article still serves only
its two Aug-14 PNGs; x.com is behind a login wall). Paste ranks 1-84 into TOP84
below and this writes the full pipeline CSV; until then it writes the partial file
and refuses to pretend the board is complete.

    python site/data/_sources/build_gibbs_2026-08-22_csv.py

Verification already applied to every one of the 116 rows below: the printed bye
matches that team's 2026 bye, and name + team + position resolve to exactly one
Sleeper player. Two independent transcriptions of the screenshot were diffed
field by field.

One field the screenshot does not carry: the number printed on the 7th tier bar
(above rank 178). Its digits are 6 pixels tall and the second one measures as a 5
or a 7 depending on the method - template correlation against the known "5" on the
tier-15 bar says 5, a stroke-density read says 7. The GROUPING is certain (seven
bars, above 85 / 101 / 117 / 141 / 148 / 161 / 178), so the block is stored as
tier 17 and the ambiguity is recorded rather than guessed away.
"""
import csv
import re
from pathlib import Path

# Paste ranks 1-84 here, same format, including their TIER lines (tiers 1-10).
TOP84 = """
"""

# Ranks 85-200, transcribed from the 2026-08-22 phone screenshot (588x1280, board at
# y=320..748, four columns). Tier bars sit above 85, 101, 117, 141, 148, 161 and 178.
RAW = """
TIER 11
85 Jakobi Meyers JAC (7) WR
86 Kyle Pitts Sr. ATL (11) TE
87 Rachaad White WAS (7) RB
88 Kyle Monangai CHI (10) RB
89 Rico Dowdle PIT (9) RB
90 Jordan Addison MIN (6) WR
91 Wan'Dale Robinson TEN (9) WR
92 Brian Thomas Jr. JAC (7) WR
93 Alec Pierce IND (13) WR
94 Tony Pollard TEN (9) RB
95 Kenny Gainwell TB (10) RB
96 Blake Corum LAR (11) RB
97 Jordan Mason MIN (6) RB
98 Trevor Lawrence JAC (7) QB
99 Aaron Jones Sr. MIN (6) RB
100 Brock Purdy SF (8) QB
TIER 12
101 Jonah Coleman DEN (10) RB
102 Jaylin Noel HOU (8) WR
103 KC Concepcion CLE (11) WR
104 RJ Harvey DEN (10) RB
105 Zach Charbonnet SEA (11) RB
106 Kyler Murray MIN (6) QB
107 Jaxson Dart NYG (8) QB
108 J.K. Dobbins DEN (10) RB
109 Dallas Goedert PHI (10) TE
110 DK Metcalf PIT (9) WR
111 Jalen Coker CAR (5) WR
112 Jacory Croskey-Merritt WAS (7) RB
113 Chris Rodriguez Jr. JAC (7) RB
114 Romeo Doubs NE (11) WR
115 Dalton Kincaid BUF (7) TE
116 Isaiah Likely NYG (8) TE
TIER 13
117 MarShawn Lloyd GB (11) RB
118 Courtland Sutton DEN (10) WR
119 De'Zhaun Stribling SF (8) WR
120 Jordyn Tyson NO (8) WR
121 Deebo Samuel Sr. SF (8) WR
122 George Kittle SF (8) TE
123 Malik Willis MIA (6) QB
124 Matthew Golden GB (11) WR
125 Xavier Worthy KC (5) WR
126 Ryan Flournoy DAL (14) WR
127 Cyrus Allen KC (5) WR
128 Caleb Douglas MIA (6) WR
129 Jake Ferguson DAL (14) TE
130 Brenton Strange JAC (7) TE
131 Mike Washington Jr. LV (13) RB
132 Tyjae Spears TEN (9) RB
133 Chuba Hubbard CAR (5) RB
134 Emmett Johnson KC (5) RB
135 Tank Bigsby PHI (10) RB
136 Kimani Vidal LAC (7) RB
137 Demond Claiborne MIN (6) RB
138 Bo Nix DEN (10) QB
139 Dak Prescott DAL (14) QB
140 Baker Mayfield TB (10) QB
TIER 14
141 Terrance Ferguson LAR (11) TE
142 Oronde Gadsden II LAC (7) TE
143 Woody Marks HOU (8) RB
144 Adam Randall BAL (13) RB
145 Tyrone Tracy Jr. NYG (8) RB
146 Ja'Kobi Lane BAL (13) WR
147 Keaton Mitchell LAC (7) RB
TIER 15
148 Jaydon Blue DAL (14) RB
149 Tyler Allgeier ARI (14) RB
150 James Conner ARI (14) RB
151 Isiah Pacheco DET (6) RB
152 Patrick Mahomes II KC (5) QB
153 Jared Goff DET (6) QB
154 Matthew Stafford LAR (11) QB
155 Travis Kelce KC (5) TE
156 Juwan Johnson NO (8) TE
157 Dylan Sampson CLE (11) RB
158 Ray Davis BUF (7) RB
159 Kaelon Black SF (8) RB
160 Gunnar Helm TEN (9) TE
TIER 16
161 Khalil Shakir BUF (7) WR
162 Pat Bryant DEN (10) WR
163 Tre' Harris LAC (7) WR
164 Jack Bech LV (13) WR
165 Tank Dell HOU (8) WR
166 Omar Cooper Jr. NYJ (13) WR
167 Zachariah Branch ATL (11) WR
168 Jauan Jennings MIN (6) WR
169 Malik Washington MIA (6) WR
170 Rashod Bateman BAL (13) WR
171 Jalen McMillan TB (10) WR
172 Chris Bell MIA (6) WR
173 Tyler Shough NO (8) QB
174 Jordan Love GB (11) QB
175 C.J. Stroud HOU (8) QB
176 Daniel Jones IND (13) QB
177 Rashid Shaheed SEA (11) WR
TIER 17
178 Mark Andrews BAL (13) TE
179 Ollie Gordon II MIA (6) RB
180 Kaytron Allen WAS (7) RB
181 Dontayvion Wicks PHI (10) WR
182 Devaughn Vele NO (8) WR
183 Tez Johnson TB (10) WR
184 Cam Ward TEN (9) QB
185 Keenan Allen IND (13) WR
186 Germie Bernard PIT (9) WR
187 Denzel Boston CLE (11) WR
188 Adonai Mitchell NYJ (13) WR
189 Antonio Williams WAS (7) WR
190 Sam Darnold SEA (11) QB
191 Jacoby Brissett ARI (14) QB
192 Hunter Henry NE (11) TE
193 Michael Mayer LV (13) TE
194 Bryce Young CAR (5) QB
195 Fernando Mendoza LV (13) QB
196 Brian Robinson Jr. ATL (11) RB
197 Sean Tucker TB (10) RB
198 Dalton Schultz HOU (8) TE
199 Cade Otton TB (10) TE
200 Eli Raridon NE (11) TE
"""

# Seventh bar in view; its printed number is illegible at screenshot resolution.
TIER_LABEL_UNREAD = 17

ROW = re.compile(r"^(\d+)\s+(.+?)\s+([A-Z]{2,3})\s+\((\d+)\)\s+(QB|RB|WR|TE)$")

# 2026 byes, one per team. A printed bye that disagrees with this is a misread row.
BYES = {"ARI": 14, "ATL": 11, "BAL": 13, "BUF": 7, "CAR": 5, "CHI": 10, "CIN": 6,
        "CLE": 11, "DAL": 14, "DEN": 10, "DET": 6, "GB": 11, "HOU": 8, "IND": 13,
        "JAC": 7, "KC": 5, "LAC": 7, "LAR": 11, "LV": 13, "MIA": 6, "MIN": 6,
        "NE": 11, "NO": 8, "NYG": 8, "NYJ": 13, "PHI": 10, "PIT": 9, "SEA": 11,
        "SF": 8, "TB": 10, "TEN": 9, "WAS": 7}


def parse(block: str) -> list[dict]:
    rows, tier = [], 0
    for line in block.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("TIER "):
            tier = int(line.split()[1])
            continue
        m = ROW.match(line)
        if not m:
            raise SystemExit(f"unparsed: {line!r}")
        rank, name, team, bye, pos = m.groups()
        if BYES.get(team) != int(bye):
            raise SystemExit(f"bye mismatch on {name}: printed {bye}, {team} is on {BYES.get(team)}")
        rows.append({"rank": int(rank), "tier": tier, "name": name, "team": team,
                     "bye": int(bye), "pos": pos})
    return rows


def write(rows: list[dict], out: Path) -> None:
    pos_n: dict[str, int] = {}
    with out.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["RK", "TIERS", "PLAYER NAME", "TEAM", "POS", "BYE", "SOS", "ECR VS ADP"])
        for r in rows:
            pos_n[r["pos"]] = pos_n.get(r["pos"], 0) + 1
            w.writerow([r["rank"], r["tier"], r["name"], r["team"],
                        f"{r['pos']}{pos_n[r['pos']]}", r["bye"], "", ""])
    print(f"wrote {out.name} rows={len(rows)} " + " ".join(f"{k}={v}" for k, v in sorted(pos_n.items())))


def main() -> None:
    here = Path(__file__).resolve().parent
    tail = parse(RAW)
    assert [r["rank"] for r in tail] == list(range(85, 201)), "rank gap in 85-200"
    assert sorted({r["tier"] for r in tail}) == list(range(11, 18)), "tier gap in 85-200"

    head = parse(TOP84)
    if not head:
        write(tail, here / "jacob-gibbs-2026-08-22-partial-85-200.csv")
        print("PARTIAL: ranks 1-84 are still missing, so POS numbers above are "
              "positional ranks WITHIN 85-200 only, not real posRanks. Do not feed "
              "this file to build_jacob_gibbs.py. Paste 1-84 into TOP84 and re-run.")
        return

    rows = head + tail
    assert [r["rank"] for r in rows] == list(range(1, 201)), "rank gap"
    assert sorted({r["tier"] for r in rows}) == list(range(1, 18)), "tier gap"
    write(rows, here / "jacob-gibbs-2026-08-22.csv")


if __name__ == "__main__":
    main()
