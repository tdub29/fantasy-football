"""Emit the Gibbs Aug-14 top-175 as the CSV shape build_jacob_gibbs.py reads."""
import csv
import re
from pathlib import Path

# Transcribed from the two full-res CBS screenshots (screenshot-2026-08-14-at-1-46-51-pm.png
# = ranks 1-89 / tiers 1-10, -1-47-03- = ranks 90-175 / tiers 11-16).
RAW = """
TIER 1
1 Jahmyr Gibbs DET (6) RB
2 Ja'Marr Chase CIN (6) WR
3 Puka Nacua LAR (11) WR
4 Bijan Robinson ATL (11) RB
5 Christian McCaffrey SF (8) RB
TIER 2
6 Amon-Ra St. Brown DET (6) WR
7 Jaxon Smith-Njigba SEA (11) WR
8 CeeDee Lamb DAL (14) WR
TIER 3
9 James Cook III BUF (7) RB
10 Ashton Jeanty LV (13) RB
11 Jonathan Taylor IND (13) RB
12 Omarion Hampton LAC (7) RB
13 Chase Brown CIN (6) RB
TIER 4
14 A.J. Brown NE (11) WR
15 Kenneth Walker III KC (5) RB
16 Derrick Henry BAL (13) RB
17 Saquon Barkley PHI (10) RB
18 Justin Jefferson MIN (6) WR
19 George Pickens DAL (14) WR
20 Malik Nabers NYG (8) WR
21 Drake London ATL (11) WR
22 De'Von Achane MIA (6) RB
TIER 5
23 Brock Bowers LV (13) TE
24 Nico Collins HOU (8) WR
25 Emeka Egbuka TB (10) WR
26 Jeremiyah Love ARI (14) RB
27 Zay Flowers BAL (13) WR
28 DeVonta Smith PHI (10) WR
TIER 6
29 Chris Olave NO (8) WR
30 Ladd McConkey LAC (7) WR
31 Tee Higgins CIN (6) WR
32 Jaylen Waddle DEN (10) WR
33 Trey McBride ARI (14) TE
34 Colston Loveland CHI (10) TE
35 Javonte Williams DAL (14) RB
36 Cam Skattebo NYG (8) RB
37 Luther Burden III CHI (10) WR
TIER 7
38 Rashee Rice KC (5) WR
39 Mike Evans SF (8) WR
40 Tetairoa McMillan CAR (5) WR
41 Christian Watson GB (11) WR
42 Davante Adams LAR (11) WR
TIER 8
43 Josh Jacobs GB (11) RB
44 Kyren Williams LAR (11) RB
45 D'Andre Swift CHI (10) RB
46 Josh Allen BUF (7) QB
47 Bucky Irving TB (10) RB
48 Breece Hall NYJ (13) RB
49 Bhayshul Tuten JAC (7) RB
50 Garrett Wilson NYJ (13) WR
51 Rome Odunze CHI (10) WR
52 Jameson Williams DET (6) WR
53 Sam LaPorta DET (6) TE
54 TreVeyon Henderson NE (11) RB
55 Quinshon Judkins CLE (11) RB
56 David Montgomery HOU (8) RB
57 Tyler Warren IND (13) TE
58 Terry McLaurin WAS (7) WR
59 Parker Washington JAC (7) WR
60 DJ Moore BUF (7) WR
61 Tucker Kraft GB (11) TE
62 Jordyn Tyson NO (8) WR
TIER 9
63 Travis Etienne Jr. NO (8) RB
64 Josh Downs IND (13) WR
65 Jayden Reed GB (11) WR
66 Carnell Tate TEN (9) WR
67 Jadarian Price SEA (11) RB
68 Harold Fannin Jr. CLE (11) TE
69 Drake Maye NE (11) QB
70 Lamar Jackson BAL (13) QB
71 Michael Pittman Jr. PIT (9) WR
72 Rhamondre Stevenson NE (11) RB
TIER 10
73 Quentin Johnston LAC (7) WR
74 Jayden Daniels WAS (7) QB
75 Stefon Diggs WAS (7) WR
76 Makai Lemon PHI (10) WR
77 Jonathon Brooks CAR (5) RB
78 Caleb Williams CHI (10) QB
79 Justin Herbert LAC (7) QB
80 Jalen Hurts PHI (10) QB
81 Jaylen Warren PIT (9) RB
82 Chris Godwin Jr. TB (10) WR
83 Joe Burrow CIN (6) QB
84 Trevor Lawrence JAC (7) QB
85 Marvin Harrison Jr. ARI (14) WR
86 Jakobi Meyers JAC (7) WR
87 Michael Wilson ARI (14) WR
88 Kyle Pitts Sr. ATL (11) TE
89 Isaiah Likely NYG (8) TE
TIER 11
90 Rachaad White WAS (7) RB
91 Kyle Monangai CHI (10) RB
92 Rico Dowdle PIT (9) RB
93 Jordan Addison MIN (6) WR
94 Wan'Dale Robinson TEN (9) WR
95 Brian Thomas Jr. JAC (7) WR
96 Alec Pierce IND (13) WR
97 Tony Pollard TEN (9) RB
98 Kenny Gainwell TB (10) RB
99 Blake Corum LAR (11) RB
100 Jordan Mason MIN (6) RB
101 Aaron Jones Sr. MIN (6) RB
102 Brock Purdy SF (8) QB
TIER 12
103 RJ Harvey DEN (10) RB
104 Zach Charbonnet SEA (11) RB
105 J.K. Dobbins DEN (10) RB
106 Kyler Murray MIN (6) QB
107 Jaxson Dart NYG (8) QB
108 KC Concepcion CLE (11) WR
109 DK Metcalf PIT (9) WR
110 Jayden Higgins HOU (8) WR
111 Jalen Coker CAR (5) WR
112 Jacory Croskey-Merritt WAS (7) RB
113 Dallas Goedert PHI (10) TE
114 Courtland Sutton DEN (10) WR
115 Xavier Worthy KC (5) WR
116 Romeo Doubs NE (11) WR
117 Malik Willis MIA (6) QB
118 Bo Nix DEN (10) QB
119 Dak Prescott DAL (14) QB
120 Chris Rodriguez Jr. JAC (7) RB
121 Baker Mayfield TB (10) QB
122 Patrick Mahomes II KC (5) QB
123 Jared Goff DET (6) QB
124 Matthew Stafford LAR (11) QB
TIER 13
125 Dalton Kincaid BUF (7) TE
126 George Kittle SF (8) TE
127 Matthew Golden GB (11) WR
128 Chuba Hubbard CAR (5) RB
129 Tyrone Tracy Jr. NYG (8) RB
130 Jonah Coleman DEN (10) RB
131 Deebo Samuel Sr. SF (8) WR
132 Ryan Flournoy DAL (14) WR
133 De'Zhaun Stribling SF (8) WR
134 Jake Ferguson DAL (14) TE
135 Brenton Strange JAC (7) TE
TIER 14
136 Oronde Gadsden II LAC (7) TE
137 Tyjae Spears TEN (9) RB
138 Woody Marks HOU (8) RB
139 Tank Bigsby PHI (10) RB
140 Kimani Vidal LAC (7) RB
141 MarShawn Lloyd GB (11) RB
142 Emmett Johnson KC (5) RB
143 Demond Claiborne MIN (6) RB
144 Khalil Shakir BUF (7) WR
145 Tyler Shough NO (8) QB
146 Omar Cooper Jr. NYJ (13) WR
147 Jauan Jennings MIN (6) WR
148 Malik Washington MIA (6) WR
149 Keaton Mitchell LAC (7) RB
150 Cyrus Allen KC (5) WR
TIER 15
151 Jack Bech LV (13) WR
152 Jalen McMillan TB (10) WR
153 Chris Bell MIA (6) WR
154 Jordan Love GB (11) QB
155 Travis Kelce KC (5) TE
156 C.J. Stroud HOU (8) QB
157 Gunnar Helm TEN (9) TE
158 Daniel Jones IND (13) QB
159 Cam Ward TEN (9) QB
160 Terrance Ferguson LAR (11) TE
161 Mark Andrews BAL (13) TE
162 Dylan Sampson CLE (11) RB
163 Isiah Pacheco DET (6) RB
164 Tyler Allgeier ARI (14) RB
165 Ray Davis BUF (7) RB
166 Jaydon Blue DAL (14) RB
167 Rashid Shaheed SEA (11) WR
TIER 16
168 Ollie Gordon II MIA (6) RB
169 Kaytron Allen WAS (7) RB
170 Tre' Harris LAC (7) WR
171 Pat Bryant DEN (10) WR
172 Dontayvion Wicks PHI (10) WR
173 Zachariah Branch ATL (11) WR
174 Antonio Williams WAS (7) WR
175 Fernando Mendoza LV (13) QB
"""

ROW = re.compile(r"^(\d+)\s+(.+?)\s+([A-Z]{2,3})\s+\((\d+)\)\s+(QB|RB|WR|TE)$")

rows, tier = [], 0
for line in RAW.strip().splitlines():
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
    rows.append({"rank": int(rank), "tier": tier, "name": name, "team": team,
                 "bye": int(bye), "pos": pos})

assert len(rows) == 175, len(rows)
assert [r["rank"] for r in rows] == list(range(1, 176)), "rank gap"
assert sorted({r["tier"] for r in rows}) == list(range(1, 17)), "tier gap"

pos_n = {}
out = Path(__file__).with_name("jacob-gibbs-2026-08-14.csv")
with out.open("w", encoding="utf-8", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["RK", "TIERS", "PLAYER NAME", "TEAM", "POS", "BYE", "SOS", "ECR VS ADP"])
    for r in rows:
        pos_n[r["pos"]] = pos_n.get(r["pos"], 0) + 1
        w.writerow([r["rank"], r["tier"], r["name"], r["team"],
                    f"{r['pos']}{pos_n[r['pos']]}", r["bye"], "", ""])
print(f"wrote {out} rows={len(rows)} " + " ".join(f"{k}={v}" for k, v in sorted(pos_n.items())))
