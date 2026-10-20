#!/usr/bin/env node
// Builds data/demo-league.js: one fictional 12-team dynasty PPR league for screenshots and demos.
// Deterministic (seeded), so a rebuild only changes when KTC values or the player pool change.
// Players are real NFL players; league, teams, managers, records and scores are invented.
//   node site/data/build_demo_league.js
'use strict';
const fs = require('fs');
const path = require('path');

global.window = {};
for (const f of ['players.js', 'ktc.js', 'leagues.js']) require(path.join(__dirname, f));
const PLAYERS = window.PLAYERS;
const template = window.LEAGUES.find(l => l.is_dynasty && !l.is_superflex && !l.is_idp && !l.platform);
if (!template) throw new Error('no 1QB dynasty Sleeper league to borrow scoring from');

let seed = 20261020;
const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 2147483648);

const LEAGUE_ID = '990000000000000001';
const SEASON = String(template.season);
const WEEK = template.week;
const PLAYED = template.last_scored_leg || WEEK - 1;
const TEAMS = [
  ['Fourth & Fiction', 'coach_pickles'], ['Waiver Wizards', 'gridiron_gus'], ['Bye Week Bandits', 'sundaysam'],
  ['Red Zone Raccoons', 'trashcan_ted'], ['Pocket Protectors', 'nerd_alert'], ['End Zone Owls', 'nightowl_nina'],
  ['Goal Line Goblins', 'goblin_mode'], ['Sunday Scaries', 'nervous_ned'], ['Bench Mob', 'benchwarmer_bo'],
  ['Hail Mary Club', 'long_bomb_lou'], ['Turbo Turnips', 'veggie_vic'], ['Touchdown Tacos', 'taco_tuesday_tom'],
];
const N = TEAMS.length;
const uid = i => `990000000000${String(i + 1).padStart(6, '0')}`;

// Draft pool: KTC 1QB dynasty board, matched to Sleeper ids by name + position, no K/DEF.
const norm = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const byName = new Map();
for (const p of Object.values(PLAYERS)) if (p.pos && p.team && p.team !== 'FA') byName.set(norm(p.name) + p.pos, p.id);
const board = window.RANKINGS_SOURCES.find(s => s.id === 'keeptradecut').rankings.find(r => !/superflex/i.test(r.id));
const pool = board.players
  .filter(p => ['QB', 'RB', 'WR', 'TE'].includes(p.pos) && byName.has(norm(p.name) + p.pos))
  .map(p => ({ id: byName.get(norm(p.name) + p.pos), pos: p.pos, v: p.ktcValue || 0 }));

// Snake draft with a little managerial noise and sane position caps.
const CAP = { QB: 3, RB: 8, WR: 9, TE: 3 };
const ROUNDS = 22;
const rosters = TEAMS.map(() => []);
const taken = new Set();
for (let rd = 0; rd < ROUNDS; rd++) {
  const order = [...Array(N).keys()];
  if (rd % 2) order.reverse();
  for (const t of order) {
    const count = pos => rosters[t].filter(x => x.pos === pos).length;
    const open = pool.filter(p => !taken.has(p.id) && count(p.pos) < CAP[p.pos]);
    const p = open[Math.min(open.length - 1, Math.floor(rand() * rand() * 4))];
    if (!p) continue;
    taken.add(p.id); rosters[t].push(p);
  }
}

const SLOTS = template.roster_positions.filter(s => s !== 'BN');
const FLEX = { FLEX: ['RB', 'WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'] };
const lineup = ps => {
  const left = [...ps].sort((a, b) => b.v - a.v), out = [];
  for (const s of SLOTS) {
    const i = left.findIndex(p => (FLEX[s] || [s]).includes(p.pos));
    if (i >= 0) out.push(left.splice(i, 1)[0]);
  }
  return out;
};
const strength = rosters.map(ps => lineup(ps).reduce((s, p) => s + p.v, 0));
const sMean = strength.reduce((a, b) => a + b, 0) / N;

// Round-robin schedule (circle method) for the whole regular season.
const weeks = {};
for (let w = 1; w < template.playoff_week_start; w++) {
  const ids = [...Array(N).keys()];
  const rot = (w - 1) % (N - 1);
  const ring = [ids[0], ...ids.slice(1).slice(rot), ...ids.slice(1).slice(0, rot)];
  const wk = {};
  for (let i = 0; i < N / 2; i++) { wk[ring[i] + 1] = ring[N - 1 - i] + 1; wk[ring[N - 1 - i] + 1] = ring[i] + 1; }
  weeks[w] = wk;
}

// Invented scores for played weeks: stronger lineups score more, plus seeded week-to-week noise.
const rec = TEAMS.map(() => ({ wins: 0, losses: 0, ties: 0, fpts: 0, fpts_against: 0, ppts: 0 }));
for (let w = 1; w <= PLAYED; w++) {
  const pts = strength.map(s => +(118 * (s / sMean) ** 0.6 + (rand() - 0.5) * 50).toFixed(2));
  for (let t = 0; t < N; t++) {
    const o = weeks[w][t + 1] - 1, r = rec[t];
    r.fpts += pts[t]; r.fpts_against += pts[o]; r.ppts += pts[t] + 6 + rand() * 18;
    if (pts[t] > pts[o]) r.wins++; else if (pts[t] < pts[o]) r.losses++; else r.ties++;
  }
}
const r2 = x => +x.toFixed(2);

// A handful of future picks that changed hands.
const traded = [];
for (const season of [String(+SEASON + 1), String(+SEASON + 2)]) {
  for (let k = 0; k < 5; k++) {
    const from = 1 + Math.floor(rand() * N), to = 1 + ((from + 1 + Math.floor(rand() * (N - 2))) % N);
    const round = 1 + Math.floor(rand() * 2);
    if (traded.some(p => p.season === season && p.round === round && p.roster_id === from)) continue;
    traded.push({ round, season, roster_id: from, owner_id: to, previous_owner_id: from });
  }
}

const league = {
  ...Object.fromEntries(Object.entries(template).filter(([k]) => !['rosters', 'users', 'drafts', 'traded_picks'].includes(k))),
  id: LEAGUE_ID, name: 'Backyard Demo League', short_name: 'Backyard Demo', buy_in: 0,
  total_rosters: N, playoff_teams: 6, divisions: 0, league_average_match: 0, demo: true,
  users: TEAMS.map(([team, mgr], i) => ({ user_id: uid(i), display_name: mgr, team_name: team })),
  rosters: TEAMS.map(([team, mgr], i) => ({
    roster_id: i + 1, owner_id: uid(i), owner_name: mgr, team_name: team, is_me: i === 0,
    opponent_roster_id: weeks[WEEK]?.[i + 1] ?? null,
    starters: lineup(rosters[i]).map(p => p.id), players: rosters[i].map(p => p.id), taxi: [], reserve: [],
    ...rec[i], fpts: r2(rec[i].fpts), fpts_against: r2(rec[i].fpts_against), ppts: r2(rec[i].ppts),
    waiver_budget_used: Math.floor(rand() * 120), waiver_position: i + 1, division: 0,
  })),
  drafts: [{ draft_id: '990000000000000002', type: 'snake', status: 'complete', season: SEASON,
    start_time: Date.UTC(+SEASON, 7, 20), settings: { rounds: ROUNDS, teams: N },
    draft_order: Object.fromEntries(TEAMS.map((_, i) => [uid(i), i + 1])) }],
  traded_picks: traded,
};
const schedule = { name: league.name, playoffStart: template.playoff_week_start, medianScoring: false, weeks };

const out = `// Generated by build_demo_league.js. Fictional league for screenshots and demos: real NFL
// players, invented league, teams, managers, records and scores. Loaded only by js/demo.js (?demo).
window.DEMO = ${JSON.stringify({ user: { user_id: uid(0), username: TEAMS[0][1], display_name: TEAMS[0][1] }, league, schedule })};
`;
fs.writeFileSync(path.join(__dirname, 'demo-league.js'), out);
console.log(`demo-league.js: ${N} teams, ${rosters.map(r => r.length).join('/')} players, week ${WEEK}, ${PLAYED} weeks scored, ${traded.length} traded picks`);
