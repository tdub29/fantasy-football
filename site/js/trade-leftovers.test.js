// Leftovers from the Trade Lab audits (notes/trade-lab-redraft-audit.md). Each block
// fails on the code before this change:
//   K/DEF  the title simulator's pool had no kicker or defense, so every K and DEF
//          slot sat empty for every team and trading one never moved title odds
//   L3     rest-of-season points summed through NFL week 18, past the title game
//   Finder a dynasty deal that overpays on KTC ranked level with a fair one when
//          the title odds were the same
//   L1     a throw-in let its side claim a better free agent than the body it lost
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
  'const rankIndex = () => ({ all: RANKED, bySleeperId: new Map(RANKED.map(r => [r._sleeperId, r])), byName: new Map() });',
  'const pickIndex = () => ({ oneqb: PICKS, sf: PICKS });',
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
  slice("  // Project a roster's on-field team strength at horizon N.", '  // ROUTE: Action Center'),
  slice('function projUnitData()', 'function buildWhatIfTray'),
  slice('  // Trade Finder. Iterates reasonable packages', '  // Last run per league'),
].join('\n');
const RET = 'return { SIM, simPool, championshipOdds, pairedTitleDelta, rosPointsByPid, playoffSettings, tradeTitleWhatIf, findTrades, finderScore };';
const load = (window, { RANKED = [], PICKS = new Map(), stub = '' } = {}) =>
  new Function('window', 'RANKED', 'PICKS', `${SRC}\n${stub}\n${RET}`)(window, RANKED, PICKS);

const roster = (id, players, extra = {}) => ({ roster_id: id, team_name: `T${id}`, is_me: id === 1,
  players, taxi: [], reserve: [], wins: 0, losses: 0, ties: 0, fpts: 0, ...extra });
// A toy window from { id: [pos, weekly points, season blend] }; K and DEF have no
// season projection, like the real feed.
const toyWindow = (P, { currentWeek = 1, weeks = 9, schedule = {} } = {}) => ({
  PLAYERS: Object.fromEntries(Object.entries(P).map(([id, [pos]]) => [id, { id, name: id, pos, team: `N${id}`, age: 26, injury_status: null }])),
  WEEKLY_RANKINGS: { currentWeek, players: Object.entries(P).map(([id, [pos, w]]) =>
    ({ id, name: id, pos, sleeper: Array.isArray(w) ? w : Array(weeks).fill(w) })) },
  OFFENSE_PROJ: { offense: { players: Object.entries(P).filter(([, [pos]]) => !['K', 'DEF'].includes(pos))
    .map(([id, [pos, w, blend]]) => ({ id, name: id, pos, team: `N${id}`, blend: blend || w * 17 })) } },
  FANTASY_SCHEDULE: { leagues: schedule },
  STRATEGY: { age_curve: { QB: { peak_avg: 30, sell_age: 33, hard_sell_age: 36 }, RB: { peak_avg: 25, sell_age: 27, hard_sell_age: 29 },
    WR: { peak_avg: 27, sell_age: 29, hard_sell_age: 31 }, TE: { peak_avg: 28, sell_age: 30, hard_sell_age: 32 } } },
});
const league = (id, rosters, extra = {}) => ({ id, name: id, is_dynasty: false, type: 0, status: 'pre_season', week: 1,
  total_rosters: rosters.length, playoff_teams: 2, settings: { playoff_week_start: 7 }, drafts: [], traded_picks: [],
  roster_positions: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN', 'BN'], rosters, ...extra });

// ==== K/DEF: a kicker or defense upgrade moves title odds =======================
{
  const P = {
    q1: ['QB', 18], r1: ['RB', 14], r2: ['RB', 11], w1: ['WR', 15], w2: ['WR', 12], t1: ['TE', 9], kW: ['K', 4], dW: ['DEF', 3],
    q2: ['QB', 18], r3: ['RB', 14], r4: ['RB', 11], w3: ['WR', 15], w4: ['WR', 12], t2: ['TE', 9], k2: ['K', 8], d2: ['DEF', 8],
    q3: ['QB', 18], r5: ['RB', 14], r6: ['RB', 11], w5: ['WR', 15], w6: ['WR', 12], t3: ['TE', 9], k3: ['K', 8], d3: ['DEF', 8],
    q4: ['QB', 18], r7: ['RB', 14], r8: ['RB', 11], w7: ['WR', 15], w8: ['WR', 12], t4: ['TE', 9], k4: ['K', 8], d4: ['DEF', 8],
    kG: ['K', 13], dG: ['DEF', 12],   // free agents
  };
  const lg = league('toy-kd', [
    roster(1, ['q1', 'r1', 'r2', 'w1', 'w2', 't1', 'kW', 'dW']), roster(2, ['q2', 'r3', 'r4', 'w3', 'w4', 't2', 'k2', 'd2']),
    roster(3, ['q3', 'r5', 'r6', 'w5', 'w6', 't3', 'k3', 'd3']), roster(4, ['q4', 'r7', 'r8', 'w7', 'w8', 't4', 'k4', 'd4'])]);
  const H = load(toyWindow(P));
  const pool = H.simPool(lg.rosters[0], lg, 'ros');
  assert.equal(pool.find(a => a.pid === 'kW')?.mean, 4, 'a league that starts a K simulates its kicker at his weekly rate');
  assert.equal(pool.find(a => a.pid === 'dW')?.mean, 3, 'and its defense');
  // Dynasty basis too: no season projection for either, so the weekly rate stands in.
  const dyn = { ...lg, id: 'toy-kd-dyn', is_dynasty: true, type: 2 };
  assert.equal(H.simPool(lg.rosters[0], dyn, 'blend').find(a => a.pid === 'kW')?.mean, 4, 'dynasty prices a K off his weekly lines');
  // A league with no K or DEF slot never simulates one.
  const noKd = { ...lg, id: 'toy-no-kd', roster_positions: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN', 'BN', 'BN'] };
  assert(!H.simPool(lg.rosters[0], noKd, 'ros').some(a => ['K', 'DEF'].includes(a.pos)), 'no K or DEF slot, no K or DEF in the pool');

  const champs = (whatIf) => { const c = []; H.championshipOdds(lg, { sims: 3000, whatIf, champions: c }); return c; };
  const base = champs(null);
  for (const [drop, add] of [['kW', 'kG'], ['dW', 'dG']]) {
    const d = H.pairedTitleDelta(base, champs({ 1: { drop: [drop], add: [add] } }), 1);
    assert(d.delta > 2 * d.se, `swapping ${drop} for ${add} must raise T1's title odds, got ${d.delta.toFixed(2)} +-${(2 * d.se).toFixed(2)}`);
  }
}

// ==== L3: rest of season stops at the league's title game =======================
{
  // 10 a week through week 17, then 100 in NFL week 18.
  const P = { a: ['WR', [...Array(17).fill(10), 100]] };
  const H = load(toyWindow(P, { currentWeek: 3, schedule: { 'toy-l3b': { playoffStart: 14 } } }));
  const lgA = league('toy-l3a', [roster(1, ['a'])], { playoff_teams: 6, settings: { playoff_week_start: 15 } });
  // No settings block on the league record: the fantasy schedule carries Sleeper's
  // playoff_week_start. Four teams, two rounds: the title game is week 15.
  const lgB = league('toy-l3b', [roster(1, ['a'])], { playoff_teams: 4, settings: undefined });
  assert.equal(H.playoffSettings(lgA).lastWeek, 17);
  assert.equal(H.playoffSettings(lgB).lastWeek, 15);
  assert.equal(H.rosPointsByPid(lgA).get('a').pts, 150, 'weeks 3 to 17, no week 18');
  assert.equal(H.rosPointsByPid(lgB).get('a').pts, 130, 'weeks 3 to 15');
  assert.equal(H.simPool(lgA.rosters[0], lgA, 'ros').find(x => x.pid === 'a').mean, 10, 'the simulator reads the same weeks');
}

// ==== Finder: an overpay on KTC ranks below a fair deal at equal odds ===========
{
  const my = { delta: 3, se: 0.4 };
  const fair = H0().finderScore(true, my, 0, 50, 50), over = H0().finderScore(true, my, 0, 60, 35);
  assert(over < fair, `a 25-point KTC overpay must rank below an even deal: ${over} vs ${fair}`);
  assert(Math.abs((fair - over) - 25 * H0().SIM.finderOverpayWeight) < 1e-9, 'charged at SIM.finderOverpayWeight a point');
  assert.equal(H0().finderScore(true, my, 0, 35, 60), fair, 'getting more than I send is no bonus');
  assert.equal(H0().finderScore(false, my, 0, 60, 35), 3, 'redraft ranks on title odds alone');

  // End to end: every deal gets the same title odds (stubbed simulator) and FV
  // carries no weight, so the rank is the overpay alone. Two 1-for-1s for a WR:
  // rX (50) for pX (40) gains my lineup more than rY (30) for pY (30), so the
  // overpay used to rank above the even deal. [pos, season pts, age, KTC / 100];
  // anything under SIM.finderMinAsset is not trade currency, picks included.
  const D = {
    mQ: ['QB', 330, 26, 2], r1: ['RB', 200, 25, 2], rX: ['RB', 180, 25, 50], rY: ['RB', 170, 25, 30], w1: ['WR', 100, 27, 2], t1: ['TE', 150, 27, 2],
    pQ: ['QB', 320, 27, 60], p1: ['RB', 100, 27, 2], pX: ['WR', 260, 29, 40], pY: ['WR', 240, 27, 30], p3: ['WR', 235, 27, 2], p4: ['WR', 230, 27, 2], pT: ['TE', 160, 27, 2],
  };
  const win = toyWindow(Object.fromEntries(Object.entries(D).map(([id, [pos, pts]]) => [id, [pos, pts / 17, pts]])));
  for (const [id, [, , age]] of Object.entries(D)) win.PLAYERS[id].age = age;
  const RANKED = Object.entries(D).map(([id, [pos, , , v]]) => ({ name: id, pos, _sleeperId: id, ktcValue: v * 100 }));
  const stub = `championshipOdds = function (lg, { sims = 4000, whatIf = null, champions = null } = {}) {
    const me = lg.rosters.find(r => r.is_me).roster_id;
    const them = whatIf ? Number(Object.keys(whatIf).find(k => Number(k) !== me)) : null;
    const won = new Map();
    for (let s = 0; s < sims; s++) {
      const c = whatIf && s < 0.03 * sims ? me : whatIf && s < 0.04 * sims ? them : 0;
      if (champions) champions.push(c);
      won.set(c, (won.get(c) || 0) + 1);
    }
    return lg.rosters.map(r => ({ rosterId: r.roster_id, isMe: !!r.is_me, title: (won.get(r.roster_id) || 0) / sims, playoff: 0, expPts: 0 }));
  };
  SIM.finderFvWeight = 0;
  SIM.finderShowPerPartner = 8;`;
  const PICKS = new Map();
  for (let y = 2025; y <= 2032; y++) for (let r = 1; r <= 4; r++) for (const b of ['early', 'mid', 'late']) PICKS.set(`${y}|${b}|${r}`, { ktcValue: 200 });
  const H = load(win, { RANKED, PICKS, stub });
  const lg = league('toy-fd', [roster(1, ['mQ', 'r1', 'rX', 'rY', 'w1', 't1']), roster(2, ['pQ', 'p1', 'pX', 'pY', 'p3', 'p4', 'pT'])],
    { is_dynasty: true, type: 2, roster_positions: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN', 'BN', 'BN', 'BN', 'BN'] });
  (async () => {
    const out = await H.findTrades(lg, { sims: 800 });
    const keys = (p) => `${p.send.keys}>${p.get.keys}`;
    const over = out.proposals.find(p => keys(p) === 'rX>pX'), even = out.proposals.find(p => keys(p) === 'rY>pY');
    assert(over && even, `both 1-for-1s must show, got ${out.proposals.map(keys).join(' | ') || 'nothing'}`);
    assert(over.meD > even.meD, 'the overpay must gain my lineup more, or this proves nothing');
    assert.equal(over.my.delta, even.my.delta, 'equal title-odds gain');
    assert(out.proposals.indexOf(over) > out.proposals.indexOf(even), `the KTC overpay must rank below the even deal: ${out.proposals.map(keys).join(' | ')}`);
    console.log(`trade-leftovers.test.js: all assertions passed (${out.proposals.map(p => `${keys(p)} ${p.score.toFixed(2)}`).join(', ')})`);
  })().catch((err) => { console.error(err); process.exit(1); });
}

// ==== L1: a claim is never better than the body it replaces =====================
{
  const P = {
    q1: ['QB', 18], r1: ['RB', 14], w1: ['WR', 15], w2: ['WR', 12], tA: ['TE', 10], tS: ['TE', 4], kW: ['K', 5], d1: ['DEF', 8],
    q2: ['QB', 18], r2: ['RB', 14], w3: ['WR', 15], wX: ['WR', 11], t2: ['TE', 9], k2: ['K', 8], d2: ['DEF', 8],
    tF1: ['TE', 9.5], tF2: ['TE', 7], tF3: ['TE', 3], kF1: ['K', 12], kF2: ['K', 8.5],   // free agents
  };
  const H = load(toyWindow(P));
  const lg = league('toy-l1', [roster(1, ['q1', 'r1', 'w1', 'w2', 'tA', 'tS', 'kW', 'd1']), roster(2, ['q2', 'r2', 'w3', 'wX', 't2', 'k2', 'd2'])]);
  const a = H.tradeTitleWhatIf(1, 2, new Set(['tA', 'tS']), new Set(['wX']), lg)[1].add;
  assert(a.includes('tF1') && a.includes('tF3') && !a.includes('tF2'),
    `shipping TE1 (10) and TE2 (4) claims the best free TE under each, tF1 (9.5) and tF3 (3), got ${a}`);
  // Every free kicker beats kW, so the weakest comes back, not the best.
  const k = H.tradeTitleWhatIf(1, 2, new Set(['kW']), new Set(['wX']), lg)[1].add;
  assert(k.includes('kF2') && !k.includes('kF1'), `a sub-waiver kicker is replaced by the weakest free one, got ${k}`);
}

function H0() { return H0.h || (H0.h = load(toyWindow({}))); }
