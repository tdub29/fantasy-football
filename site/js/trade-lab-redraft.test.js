// Redraft Trade Lab, the four high defects from notes/trade-lab-redraft-audit.md,
// pinned on a toy 4-team league so each one fails on the old code by assertion:
//   H1 a depth player priced at 0 (tier-1 baseline, rank n+1, floored)
//   H2 a trade that leaves Side A with no QB read as a win for A (summed value).
//      No QB is free in this toy, so the slot stays empty even with the waiver
//      wire in the lineup; trade-lab-r2.test.js prices the case where one is.
//   H3 strength rose for a roster that can no longer field a QB (top-K by value)
//   H4 three seasons of title odds, phantom picks, and standings ignored
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const slice = (a, b) => {
  const i = app.indexOf(a), j = app.indexOf(b, i);
  assert(i >= 0 && j > i, `slice not found: ${a}`);
  return app.slice(i, j);
};

// ---- toy league: QB RB WR TE FLEX K DEF, 4 teams, week 4 of a 6-week season --
// Weekly points, flat across weeks 1-9. The title game is week 7 (one round from
// week 7), so rest-of-season = 4 x weekly: weeks 8 and 9 are past the season.
const W = {
  q1: ['QB', 20], q2: ['QB', 19.5], q3: ['QB', 19], q4: ['QB', 18.8], q5: ['QB', 18.6], q6: ['QB', 18.4],
  r1: ['RB', 22], r2: ['RB', 20], r3: ['RB', 18], r4: ['RB', 16], r5: ['RB', 14], r6: ['RB', 12], r7: ['RB', 11], r8: ['RB', 10], rFA: ['RB', 6],
  w1: ['WR', 21], w2: ['WR', 19], w3: ['WR', 17], w4: ['WR', 15], w5: ['WR', 13], w6: ['WR', 11], w7: ['WR', 10], w8: ['WR', 9], wFA: ['WR', 5],
  t1: ['TE', 15], t2: ['TE', 13], t3: ['TE', 11], t4: ['TE', 9], t5: ['TE', 8], tFA: ['TE', 4],
  k1: ['K', 9], k2: ['K', 8.5], k3: ['K', 8], k4: ['K', 7.5], kFA: ['K', 8.8],
  d1: ['DEF', 10], d2: ['DEF', 9], d3: ['DEF', 8], d4: ['DEF', 7], dFA: ['DEF', 6],
};
const roster = (id, players, wins, losses, fpts) => ({ roster_id: id, team_name: `T${id}`, is_me: id === 1,
  players, taxi: [], reserve: [], wins, losses, ties: 0, fpts });
// Side A (roster 1) holds both of its QBs in q2 and q6 and a depth RB in r7.
// Roster 4 is the weakest lineup and the only unbeaten team.
const toy = {
  id: 'toy', name: 'Toy', is_dynasty: false, type: 0, status: 'in_season', week: 4, total_rosters: 4,
  playoff_teams: 2, settings: { playoff_week_start: 7 },
  roster_positions: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN', 'BN'],
  rosters: [
    roster(1, ['q2', 'q6', 'r3', 'r7', 'w2', 'w6', 't4', 'k4', 'd4'], 0, 3, 250),
    roster(2, ['q1', 'r1', 'r5', 'w1', 'w5', 't1', 't5', 'k1', 'd1'], 2, 1, 300),
    roster(3, ['q3', 'r2', 'r6', 'w3', 'w7', 't2', 'k2', 'd2'], 1, 2, 270),
    roster(4, ['q4', 'q5', 'r4', 'r8', 'w4', 'w8', 't3', 'k3', 'd3'], 3, 0, 280),
  ],
};
const schedule = { 4: { 1: 2, 2: 1, 3: 4, 4: 3 }, 5: { 1: 3, 3: 1, 2: 4, 4: 2 }, 6: { 1: 4, 4: 1, 2: 3, 3: 2 } };
const window = {
  PLAYERS: Object.fromEntries(Object.entries(W).map(([id, [pos]]) => [id, { id, name: id, pos, team: `N${id}`, age: 26, injury_status: null }])),
  WEEKLY_RANKINGS: { currentWeek: 4, players: Object.entries(W).map(([id, [pos, w]]) => ({ id, name: id, pos, sleeper: Array(9).fill(w) })) },
  // Season projections feed the title simulator. Like the real feed, no K or DEF.
  OFFENSE_PROJ: { offense: { players: Object.entries(W).filter(([, [pos]]) => !['K', 'DEF'].includes(pos))
    .map(([id, [pos, w]]) => ({ id, name: id, pos, team: `N${id}`, blend: w * 17 })) } },
  FANTASY_SCHEDULE: { leagues: { toy: { medianScoring: false, weeks: schedule } } },
};
// The dynasty rankings carry no K or DEF, as in the app.
const ranked = Object.entries(W).filter(([, [pos]]) => !['K', 'DEF'].includes(pos))
  .map(([id, [pos]]) => ({ name: id, pos, _sleeperId: id }));

const H = new Function('window', 'RANKED', [
  'const KT = {};',
  'const norm = (s) => String(s || "").toLowerCase();',
  'const rankIndex = () => ({ all: RANKED, bySleeperId: new Map(RANKED.map(r => [r._sleeperId, r])), byName: new Map() });',
  // Only the old pick path reaches these; the redraft gate returns first.
  'const draftPickLabel = () => "pick", pickValue = () => 50;',
  slice('  const CURRENT_SEASON', '  // Position aging curves'),
  slice('let _projByPidIdx = null;', '  // PP vs Sleeper POSITIONAL RANK difference'),
  slice('function isDynastyLeague(lg)', '  // The league whose format defines VOR replacement'),
  slice('const REDRAFT_VOR_SCALE', '  // League-aware starter slots'),
  slice('function targetStartersByPos(league)', '  // Is this player startable league-wide'),
  slice('function ageRetention(', '  // Value share: this roster'),
  slice('function offenseStarterCount', '  // 5-level buy/sell stance'),
  slice('function consolidationPremium', 'KT.refreshMiddle = function'),
  slice('function isPickKey', '  function knownDraftSlot'),
  slice('function rosterOwnedPicks', '\n  // Team-agnostic player search'),
  slice("  // Project a roster's on-field team strength at horizon N.", '  // ROUTE: Action Center'),
  slice('function projUnitData()', 'function buildWhatIfTray'),
].join('\n') + `
  return { KT, tierValue, tradeLineupImpact, simulateRosterStrength, titleOddsByYear, championshipOdds,
    rosterOwnedPicks, REDRAFT_VOR_SCALE };`)(window, ranked);

// The audit's repro A in miniature: Side A sends both QBs for Side B's TE1.
const send = new Set(['q2', 'q6']), recv = new Set(['t1']);

// ---- H1: depth and flex bodies price above 0, continuously ------------------
// r7 is RB7 in a 4-team league: 44 rest-of-season points against RB5's 56, so
// the tier-1 baseline floored him to 0. The best FREE RB is 24.
const val = (id) => H.tierValue({ _sleeperId: id }, toy);
assert(val('r7') > 0, `depth RB r7 must carry redraft value, got ${val('r7')}`);
assert(val('w6') > 0, `flex WR w6 must carry redraft value, got ${val('w6')}`);
assert(val('r7') > val('r8') && val('r8') > 0, 'value must stay continuous and ordered below the starters');
assert.equal(val('rFA'), 0, 'the best free body is replacement, worth exactly 0');
assert.equal(val('r7'), Math.round((44 - 24) * H.REDRAFT_VOR_SCALE * 10) / 10,
  'value is rest-of-season points over the best free body, times REDRAFT_VOR_SCALE');

// ---- H2: both QBs for a TE reads as a loss for the side left without a QB ---
const impA = H.tradeLineupImpact(toy, 1, send, recv);
const impB = H.tradeLineupImpact(toy, 2, recv, send);
assert(impA.delta < 0, `Side A's lineup must drop without a QB, got ${impA.delta}`);
assert.equal(typeof H.KT.redraftVerdict, 'function', 'redraft verdict must not be the summed-value fairness');
assert(/isDynastyLeague\(lg\)\s*\?\s*KT\.computeFairness\([^)]*\)\s*:\s*KT\.redraftVerdict\(/.test(slice('KT.refreshMiddle = function', 'KT.toggle = function')),
  'the Trade Lab must route a redraft league to the lineup verdict');
const verdict = H.KT.redraftVerdict(send.size, recv.size, impA, impB, null);
assert.equal(verdict.label, 'WIN FOR B', `no-QB trade must read as a loss for Side A, got ${verdict.label}`);
// Even title odds pointing the other way cannot rescue an empty starting slot.
const spun = H.KT.redraftVerdict(send.size, recv.size, impA, impB, { a: 3, b: -3, sigA: true, sigB: true });
assert.equal(spun.label, 'WIN FOR B', 'an emptied QB slot must lose whatever the title odds say');
// And the mirror: Side B left with no QB loses.
const mirror = H.KT.redraftVerdict(1, 2, H.tradeLineupImpact(toy, 2, recv, send), H.tradeLineupImpact(toy, 1, send, recv), null);
assert.equal(mirror.label, 'WIN FOR A');
// A bench-for-bench swap is even, never a 0% win for B.
const even = H.KT.redraftVerdict(1, 1, H.tradeLineupImpact(toy, 1, new Set(['r7']), new Set(['r8'])),
  H.tradeLineupImpact(toy, 4, new Set(['r8']), new Set(['r7'])), null);
assert.notEqual(even.label, 'WIN FOR B', 'a near-even swap must not read as a win for B');
assert.equal(H.KT.computeFairness(0, 0, 1, 1, 0, 0).label, 'FAIR', 'two worthless sides are even');

// ---- H3: strength of a roster left with no QB does not rise ------------------
const post = H.simulateRosterStrength(toy, 1, send, recv);
assert(post.delta < 0, `strength must fall when the QB slot empties, got ${post.before} -> ${post.after}`);
// The receiving side keeps a legal lineup, so its change is just the TE swap.
assert(H.simulateRosterStrength(toy, 2, recv, send).delta < 0, 'B loses its TE1 for two bench QBs');

// ---- H4: one season, no picks, and the standings count -----------------------
assert.deepEqual(H.rosterOwnedPicks(1, toy), [], 'a redraft league owns no picks');
const byYear = H.titleOddsByYear(toy, { years: 3, sims: 300 });
assert.equal(byYear.length, 1, `redraft title odds must price one season, got ${byYear.length}`);
assert.equal(byYear[0].season, H.titleOddsByYear(toy, { sims: 10 })[0].season);

const odds = H.championshipOdds(toy, { sims: 1500 });
const of = (id) => odds.find(o => o.rosterId === id);
const lowest = odds[odds.length - 1];
assert.notEqual(lowest.rosterId, 4, 'the unbeaten team cannot get the lowest title odds');
assert(of(4).playoff > of(1).playoff, `3-0 must out-qualify 0-3: ${of(4).playoff} vs ${of(1).playoff}`);
// Wins are seeded from the record, so they sum to the 6 played plus 2 per remaining week.
const winSum = odds.reduce((s, o) => s + o.expWins, 0);
assert(Math.abs(winSum - (6 + 3 * 2)) < 1e-9, `seeded wins must add up, got ${winSum}`);
// A median league plays the field too: 2 results per team-week on both sides of the seed.
const med = { ...toy, id: 'toy-median', rosters: toy.rosters.map(r => ({ ...r, wins: r.wins * 2, losses: r.losses * 2 })) };
window.FANTASY_SCHEDULE.leagues['toy-median'] = { medianScoring: true, weeks: schedule };
const medSum = H.championshipOdds(med, { sims: 200 }).reduce((s, o) => s + o.expWins, 0);
assert(Math.abs(medSum - (12 + 3 * 4)) < 1e-9, `median wins must add up, got ${medSum}`);
// Records that do not match the weeks played (no median flag on file) are not trusted.
const stale = { ...med, id: 'toy-stale' };
const staleSum = H.championshipOdds(stale, { sims: 200 }).reduce((s, o) => s + o.expWins, 0);
assert(Math.abs(staleSum - 6 * 2) < 1e-9, `unverifiable records must fall back to a full replay, got ${staleSum}`);

console.log(`trade-lab-redraft.test.js: all assertions passed (r7 ${val('r7')}, no-QB strength ${post.before} -> ${post.after}, ` +
  `verdict ${verdict.label}, 3-0 title ${(of(4).title * 100).toFixed(1)}% vs 0-3 ${(of(1).title * 100).toFixed(1)}%)`);
