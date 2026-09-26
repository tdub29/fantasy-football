// Trade Lab round 3, the "Verification round 2" findings in notes/trade-lab-redraft-audit.md.
// Each block fails on the code before this round:
//   H  the title simulator set each week's lineup AFTER drawing the season, so a
//      bench body who never starts on the projection still bought title odds
//   H  a trade that improves both starting lineups read as a clear win for the
//      side that took on a backup QB, purely from that hindsight hedge
//   M  a dynasty IR-slot player was out of the simulated season for good, on his
//      owner's book and a receiver's, although his lines have him back mid-season
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const slice = (a, b) => {
  const i = app.indexOf(a), j = app.indexOf(b, i);
  assert(i >= 0 && j > i, `slice not found: ${a}`);
  return app.slice(i, j);
};
const SRC = [
  'const KT = {};',
  'const norm = (s) => String(s || "").toLowerCase();',
  'const rankIndex = () => ({ all: [], bySleeperId: new Map(), byName: new Map() });',
  'const pickIndex = () => ({ oneqb: new Map(), sf: new Map() });',
  slice('  const CURRENT_SEASON', '  // Position aging curves'),
  slice('let _projByPidIdx = null;', '  // PP vs Sleeper POSITIONAL RANK difference'),
  slice('function isDynastyLeague(lg)', '  // The league whose format defines VOR replacement'),
  slice('function slotToBucket', "  // A redraft league's top asset"),
  slice('const REDRAFT_VOR_SCALE', '  // League-aware starter slots'),
  slice('function targetStartersByPos(league)', '  // Is this player startable league-wide'),
  slice('function ageRetention(', '  // Value share: this roster'),
  slice('function offenseStarterCount', '  function viewLeague('),
  slice('function consolidationPremium', 'KT.refreshMiddle = function'),
  slice('function playerValue(', '  // Value of a single asset'),
  slice('function isPickKey', '\n  // Team-agnostic player search'),
  slice('function tradeTitleWhatIf', '  // Middle summary builds DOM once'),
  slice('function projUnitData()', 'function buildWhatIfTray'),
].join('\n');
const load = (window) => new Function('window', SRC + `
  return { KT, SIM, tradeLineupImpact, championshipOdds, tradeTitleWhatIf, pairedTitleDelta };`)(window);

const roster = (id, players, extra = {}) => ({ roster_id: id, team_name: `T${id}`, is_me: id === 1,
  players, taxi: [], reserve: [], wins: 0, losses: 0, ties: 0, fpts: 0, ...extra });
// A toy window from { id: [pos, weekly points, leading null weeks, season blend] }.
const toyWindow = (P, currentWeek, injured = {}) => ({
  PLAYERS: Object.fromEntries(Object.entries(P).map(([id, [pos]]) =>
    [id, { id, name: id, pos, team: `N${id}`, age: 26, injury_status: injured[id] || null }])),
  WEEKLY_RANKINGS: { currentWeek, players: Object.entries(P).map(([id, [pos, w, out = 0]]) =>
    ({ id, name: id, pos, sleeper: Array.from({ length: 17 }, (_, i) => (i + 1 >= currentWeek && i + 1 < currentWeek + out ? null : w)) })) },
  OFFENSE_PROJ: { offense: { players: Object.entries(P).map(([id, [pos, w, , blend]]) =>
    ({ id, name: id, pos, team: `N${id}`, blend: blend || w * 17 })) } },
  FANTASY_SCHEDULE: { leagues: {} },
});
const redraftLeague = (id, rosters) => ({ id, name: id, is_dynasty: false, type: 0, status: 'pre_season', week: 1,
  total_rosters: rosters.length, playoff_teams: 2, settings: { playoff_week_start: 11 }, drafts: [], traded_picks: [],
  roster_positions: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN', 'BN', 'BN', 'BN'], rosters });
const champsOf = (H, lg, whatIf, sims) => { const c = []; H.championshipOdds(lg, { sims, whatIf, champions: c }); return c; };

// ==== H: a bench body who never starts on the projection buys nothing ==========
// Availability is fixed (no injuries, no byes), so a TE2 projected below every
// slot he could fill never makes a lineup. Every draw is keyed on the player, so
// with him on the roster every simulated season must play out exactly as before:
// the paired change is not small, it is zero. Hindsight started him in every
// season his multiplier beat the TE1's.
{
  const P = {
    q1: ['QB', 18], r1: ['RB', 15], r2: ['RB', 12], w1: ['WR', 16], w2: ['WR', 13], t1: ['TE', 10], tS: ['TE', 9],
    q2: ['QB', 19], r3: ['RB', 14], r4: ['RB', 12], w3: ['WR', 15], w4: ['WR', 13], t2: ['TE', 10],
    q3: ['QB', 17], r5: ['RB', 16], r6: ['RB', 11], w5: ['WR', 14], w6: ['WR', 13], t3: ['TE', 11],
    q4: ['QB', 18], r7: ['RB', 13], r8: ['RB', 12], w7: ['WR', 16], w8: ['WR', 12], t4: ['TE', 9],
  };
  const lg = redraftLeague('toy-bench', [roster(1, ['q1', 'r1', 'r2', 'w1', 'w2', 't1']), roster(2, ['q2', 'r3', 'r4', 'w3', 'w4', 't2']),
    roster(3, ['q3', 'r5', 'r6', 'w5', 'w6', 't3']), roster(4, ['q4', 'r7', 'r8', 'w7', 'w8', 't4'])]);
  const H = load(toyWindow(P, 1));
  for (const pos in H.SIM.missedGames) H.SIM.missedGames[pos] = 0;
  H.SIM.byeWeeks = [99, 99];
  const base = champsOf(H, lg, null, 3000), deep = champsOf(H, lg, { 1: { add: ['tS'], drop: [] } }, 3000);
  const d = H.pairedTitleDelta(base, deep, 1);
  assert.equal(d.delta, 0, `a TE2 who never starts moved T1's title odds ${d.delta.toFixed(2)} pts`);
  assert.deepEqual(deep, base, 'with him on the bench, every simulated season must end the same way');
}

// ==== H: a trade that improves both lineups is not a clear win for one side ====
// T1 sends his WR1 for T2's slightly worse WR1 and T2's QB2, who is better than
// T1's QB1: each lineup gains half a point a week. T2 keeps his own QB1. With
// availability fixed again, no bench body ever plays, so only bench UPSIDE could
// split the two: with hindsight T1 bought a weekly hedge (three QBs, starting
// whichever breaks out) and T2 lost his, and the title odds, which the redraft
// verdict follows once they clear their band, read it as T1's win (+4.2 / -2.2).
// Phi Kap's Rice for Waddle + Purdy read exactly that.
{
  const P = {
    q1: ['QB', 18], q1b: ['QB', 17], r1: ['RB', 15], r2: ['RB', 10], w1: ['WR', 16], w2: ['WR', 12], t1: ['TE', 9],
    q2: ['QB', 21], q2b: ['QB', 19], r3: ['RB', 14], r4: ['RB', 11], w3: ['WR', 15.5], w4: ['WR', 13], t2: ['TE', 10],
    q3: ['QB', 19], r5: ['RB', 16], r6: ['RB', 11], w5: ['WR', 15], w6: ['WR', 12], t3: ['TE', 10],
    q4: ['QB', 19], r7: ['RB', 14], r8: ['RB', 12], w7: ['WR', 16], w8: ['WR', 12], t4: ['TE', 9],
    qFA: ['QB', 17], rFA: ['RB', 6], wFA: ['WR', 6], tFA: ['TE', 4],
  };
  const lg = redraftLeague('toy-winwin', [roster(1, ['q1', 'q1b', 'r1', 'r2', 'w1', 'w2', 't1']), roster(2, ['q2', 'q2b', 'r3', 'r4', 'w3', 'w4', 't2']),
    roster(3, ['q3', 'r5', 'r6', 'w5', 'w6', 't3']), roster(4, ['q4', 'r7', 'r8', 'w7', 'w8', 't4'])]);
  const H = load(toyWindow(P, 1));
  for (const pos in H.SIM.missedGames) H.SIM.missedGames[pos] = 0;
  H.SIM.byeWeeks = [99, 99];
  const send = new Set(['w1']), get = new Set(['w3', 'q2b']);
  const impA = H.tradeLineupImpact(lg, 1, send, get), impB = H.tradeLineupImpact(lg, 2, get, send);
  assert(impA.delta > 0 && impB.delta > 0, `the toy must improve both lineups, or this proves nothing: ${impA.delta} / ${impB.delta}`);
  // The Trade Lab's run: its sim count, its paired band, its verdict.
  const sims = H.SIM.tradeSimBudget;
  const base = champsOf(H, lg, null, sims), after = champsOf(H, lg, H.tradeTitleWhatIf(1, 2, send, get, lg), sims);
  const side = (rid) => {
    const { delta, se } = H.pairedTitleDelta(base, after, rid);
    return { delta, sig: Math.round(Math.abs(delta) * 10) > Math.round(Math.max(0.1, H.SIM.titleBandZ * se) * 10) };
  };
  const a = side(1), b = side(2);
  const v = H.KT.redraftVerdict(send.size, get.size, impA, impB, { a: a.delta, b: b.delta, sigA: a.sig, sigB: b.sig });
  assert(!/^WIN FOR/.test(v.label), `two better lineups read ${v.label} (${v.note}): A ${a.delta.toFixed(2)}, B ${b.delta.toFixed(2)}`);
}

// ==== M: a dynasty IR-slot player counts from the week his lines resume ========
// zIR is back in week 6, inside the regular season; zLate in week 9, the final.
// Both sit in T1's IR slot. Before, the simulator left an IR-slot player out of
// the season on every book, so neither moved anything.
{
  const P = {
    q1: ['QB', 18], r1: ['RB', 15], r2: ['RB', 9], w1: ['WR', 13], w2: ['WR', 8], t1: ['TE', 9],
    zIR: ['WR', 20, 2], zLate: ['WR', 21, 5],
    q2: ['QB', 19], r3: ['RB', 14], r4: ['RB', 11], w3: ['WR', 15], w4: ['WR', 9], t2: ['TE', 10],
    q3: ['QB', 18], r5: ['RB', 15], r6: ['RB', 10], w5: ['WR', 14], w6: ['WR', 10], t3: ['TE', 10],
    q4: ['QB', 18], r7: ['RB', 14], r8: ['RB', 10], w7: ['WR', 15], w8: ['WR', 9], t4: ['TE', 9],
  };
  const lg = { id: 'toy-ir', name: 'toy-ir', is_dynasty: true, type: 2, status: 'in_season', week: 4, total_rosters: 4,
    playoff_teams: 2, settings: { playoff_week_start: 9 }, drafts: [], traded_picks: [],
    roster_positions: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN', 'BN', 'BN', 'BN', 'IR', 'IR'],
    rosters: [roster(1, ['q1', 'r1', 'r2', 'w1', 'w2', 't1', 'zIR', 'zLate'], { reserve: ['zIR', 'zLate'], wins: 1, losses: 2 }),
      roster(2, ['q2', 'r3', 'r4', 'w3', 'w4', 't2'], { wins: 2, losses: 1 }), roster(3, ['q3', 'r5', 'r6', 'w5', 'w6', 't3'], { wins: 2, losses: 1 }),
      roster(4, ['q4', 'r7', 'r8', 'w7', 'w8', 't4'], { wins: 1, losses: 2 })] };
  const H = load(toyWindow(P, 4, { zIR: 'IR', zLate: 'IR' }));
  // The season blend is a full healthy season, like most preseason totals.
  const run = (whatIf) => { const champions = []; const res = H.championshipOdds(lg, { sims: 3000, whatIf, champions }); return { res, champions }; };
  const of = (r, rid) => r.res.find(o => o.rosterId === rid);
  const base = run(null), noIR = run({ 1: { drop: ['zIR'], add: [] } }), noLate = run({ 1: { drop: ['zLate'], add: [] } });
  assert(of(base, 1).expPts > of(noIR, 1).expPts + 1,
    `an IR-slot WR back in week 6 must score for his owner from then: ${of(noIR, 1).expPts.toFixed(1)} -> ${of(base, 1).expPts.toFixed(1)}`);
  assert.equal(of(noLate, 1).expPts, of(base, 1).expPts, 'a player back only in the playoffs scores nothing in the regular season');
  const late = H.pairedTitleDelta(noLate.champions, base.champions, 1);
  assert(late.delta > 2 * late.se, `and he must count in the playoff weeks he is back for: ${late.delta.toFixed(2)} ±${late.se.toFixed(2)}`);
  // A receiver books him from the same week.
  const traded = run({ 1: { drop: ['zIR'], add: [] }, 2: { drop: [], add: ['zIR'] } });
  assert(of(traded, 2).expPts > of(base, 2).expPts + 1, `the receiver of an IR-slot player must book his return: ${of(base, 2).expPts.toFixed(1)} -> ${of(traded, 2).expPts.toFixed(1)}`);
}

console.log('trade-lab-r3.test.js: all assertions passed (bench scrub moves nothing, win-win reads even, IR-slot player counts from his return)');
