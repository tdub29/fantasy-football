// Trade Finder on toy leagues. Each assertion fails on the old suggestTrades
// (1-for-1 only, 18% value band, surplus/need heuristic, no simulation):
//   (a) it returns a 2-for-1 that fixes a hole
//   (b) it rejects a trade that raises my odds but lowers the partner's
//   (c) it rejects a pile of fillers for a stud, and still finds the stud
//   (d) a redraft league gets no picks, and both sides' 2026 odds
//   (e) a rebuilder is never offered a deal that sells his best young asset
//       for less than one younger piece or pick near its value
// Title-odds changes carry a paired standard error; a deal shows only when my
// gain clears SIM.finderSeMult of it.
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
  // KTC pick anchors for every class the FV horizon reaches, so no pick falls
  // through to the strategy.js table.
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
const load = (window, RANKED, PICKS) => new Function('window', 'RANKED', 'PICKS', SRC + `
  return { findTrades, finderScan, tradeLineupImpact, projectedTradeStrength, championshipOdds, tradeTitleWhatIf, rosterStance,
    KT, SIM, rosterOwnedPicks };`)(window, RANKED, PICKS);

const roster = (id, players, wins = 0, losses = 0) => ({ roster_id: id, team_name: `T${id}`, is_me: id === 1,
  players, taxi: [], reserve: [], wins, losses, ties: 0, fpts: 0 });
const keysOf = (side) => side.keys;
const shows = (p, send, get) => keysOf(p.send).slice().sort().join() === send.slice().sort().join()
  && keysOf(p.get).slice().sort().join() === get.slice().sort().join();

(async () => {
  // ==== Redraft toy: QB RB WR TE FLEX, 4 teams, week 4, 6 weeks left =========
  // Weekly points. I have two good WRs, a thin FLEX and a 4-point TE. T2 has two
  // TEs and three RBs but a 7-point WR. Free agents set replacement level.
  const R = {
    q1: ['QB', 20], r1: ['RB', 18], r2: ['RB', 7], w1: ['WR', 19], w2: ['WR', 16], w3: ['WR', 8], t1: ['TE', 4],
    q2: ['QB', 19], r3: ['RB', 17], r9: ['RB', 15], r10: ['RB', 11], w4: ['WR', 7], t2: ['TE', 16], t3: ['TE', 13],
    q3: ['QB', 18], r4: ['RB', 16], r5: ['RB', 12], w6: ['WR', 15], w7: ['WR', 12], t4: ['TE', 12],
    q4: ['QB', 17], r6: ['RB', 15], r7: ['RB', 11], w8: ['WR', 14], w9: ['WR', 11], t5: ['TE', 11],
    qFA: ['QB', 15], rFA: ['RB', 6], wFA: ['WR', 6], tFA: ['TE', 4],
  };
  const redraft = {
    id: 'toy-r', name: 'Toy R', is_dynasty: false, type: 0, status: 'in_season', week: 4, total_rosters: 4,
    playoff_teams: 2, settings: { playoff_week_start: 7 },
    roster_positions: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN', 'BN', 'BN', 'BN'],
    // Pick data present on purpose: only the redraft gate keeps it out of a trade.
    drafts: [], traded_picks: [],
    rosters: [
      roster(1, ['q1', 'r1', 'r2', 'w1', 'w2', 'w3', 't1'], 1, 2),
      roster(2, ['q2', 'r3', 'r9', 'r10', 'w4', 't2', 't3'], 2, 1),
      roster(3, ['q3', 'r4', 'r5', 'w6', 'w7', 't4'], 2, 1),
      roster(4, ['q4', 'r6', 'r7', 'w8', 'w9', 't5'], 1, 2),
    ],
  };
  const players = (T) => Object.fromEntries(Object.entries(T).map(([id, [pos, , age]]) =>
    [id, { id, name: id, pos, team: `N${id}`, age: age || 26, injury_status: null }]));
  const winR = {
    PLAYERS: players(R),
    WEEKLY_RANKINGS: { currentWeek: 4, players: Object.entries(R).map(([id, [pos, w]]) => ({ id, name: id, pos, sleeper: Array(9).fill(w) })) },
    OFFENSE_PROJ: { offense: { players: Object.entries(R).map(([id, [pos, w]]) => ({ id, name: id, pos, team: `N${id}`, blend: w * 17 })) } },
    FANTASY_SCHEDULE: { leagues: { 'toy-r': { medianScoring: false,
      weeks: { 4: { 1: 2, 2: 1, 3: 4, 4: 3 }, 5: { 1: 3, 3: 1, 2: 4, 4: 2 }, 6: { 1: 4, 4: 1, 2: 3, 3: 2 } } } } },
  };
  const PICKS = new Map();
  for (let y = 2025; y <= 2032; y++) {
    [[3500, 3000, 2500], [1500, 1200, 1000], [700, 600, 500], [400, 300, 250]].forEach((v, r) =>
      ['early', 'mid', 'late'].forEach((b, i) => PICKS.set(`${y}|${b}|${r + 1}`, { ktcValue: v[i] })));
  }
  const HR = load(winR, [], PICKS);
  const outR = await HR.findTrades(redraft, { sims: 3000 });
  if (process.env.DEBUG) for (const p of outR.proposals) console.log('R', keysOf(p.send), '->', keysOf(p.get), p.my, p.their);

  // (a) A multi-piece package that fixes my TE hole with T2. The 1-for-1, w1 for
  // t2, leaves my FLEX to an 8-point body and gains me under SIM.finderMinGainPts,
  // so a second piece has to come with it. Until round 3 this was w1 for t2 + r10,
  // but most of its title gain was r10's hindsight hedge from T2's bench (+3.9 then,
  // +1.8 with lineups set on the projection), and two better packages outrank it.
  const two = outR.proposals.find(p => p.them.roster_id === 2 && keysOf(p.get).some(k => R[k][0] === 'TE')
    && keysOf(p.send).length + keysOf(p.get).length >= 3);
  assert(two, `the finder must offer T2 a package for a TE, got ${outR.proposals.map(p => `${keysOf(p.send)}>${keysOf(p.get)}`).join(' | ') || 'nothing'}`);
  assert.equal(two.them.roster_id, 2);
  assert(HR.tradeLineupImpact(redraft, 1, new Set(), new Set(['t2'])).delta > 0, 't2 must start for me: that is the hole');
  assert(HR.tradeLineupImpact(redraft, 1, new Set(['w1']), new Set(['t2'])).delta < HR.SIM.finderMinGainPts, 'the 1-for-1 must not be worth proposing');
  assert(two.my.delta > HR.SIM.finderSeMult * two.my.se && two.their.after > two.their.before, 'my gain must clear the noise, and his odds rise');

  // ==== Dynasty toy: 1QB, same slots, preseason =================================
  // [pos, season points, age, KTC value /100]. On KTC T2 contends, T4 buys, I
  // sell and T3 tanks. I have RB depth and holes at WR and TE.
  const D = {
    mQB: ['QB', 300, 27, 25], r1: ['RB', 280, 25, 55], rB: ['RB', 240, 26, 30], oR: ['RB', 250, 30, 28],
    yR: ['RB', 120, 22, 22], wWk: ['WR', 120, 28, 12], w2: ['WR', 150, 25, 14], mTE: ['TE', 100, 29, 10],
    // T2: a stud TE, a 180-point TE2, a 150-point RB hole.
    p2QB: ['QB', 320, 28, 45], p2RB: ['RB', 150, 27, 25], p2W1: ['WR', 270, 26, 65], p2W2: ['WR', 230, 27, 50],
    S: ['TE', 260, 26, 60], p2TE: ['TE', 180, 27, 30],
    // T4: an old 280-point WR1 priced at 30, and no second RB.
    p4QB: ['QB', 280, 29, 35], p4R1: ['RB', 200, 25, 35], p4R2: ['RB', 110, 26, 10], oWx: ['WR', 280, 31, 30],
    p4W2: ['WR', 200, 26, 30], p4W3: ['WR', 180, 27, 31], p4TE: ['TE', 140, 27, 20],
    p3QB: ['QB', 260, 34, 20], p3R: ['RB', 130, 29, 12], yW: ['WR', 200, 23, 42], yW2: ['WR', 170, 22, 40], yW3: ['WR', 160, 22, 38],
    oW: ['WR', 210, 31, 29], oTE: ['TE', 150, 31, 6],
    fQB: ['QB', 200, 30, 0], fRB: ['RB', 100, 27, 0], fWR: ['WR', 100, 27, 0], fTE: ['TE', 80, 27, 0],
  };
  const dynasty = {
    id: 'toy-d', name: 'Toy D', is_dynasty: true, type: 2, status: 'pre_season', week: 1, total_rosters: 4,
    playoff_teams: 2, settings: { playoff_week_start: 7 },
    roster_positions: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN', 'BN', 'BN', 'BN', 'BN'],
    // T3 traded every first and second through 2030 to T2, so his future
    // lineup has holes a pick can fill: that is what makes a sale raise his FV.
    drafts: [], traded_picks: [2026, 2027, 2028, 2029, 2030].flatMap(y => [1, 2].map(round =>
      ({ season: String(y), round, roster_id: 3, owner_id: 2, previous_owner_id: 3 }))),
    rosters: [
      roster(1, ['mQB', 'r1', 'rB', 'oR', 'yR', 'wWk', 'w2', 'mTE']),
      roster(2, ['p2QB', 'p2RB', 'p2W1', 'p2W2', 'S', 'p2TE']),
      roster(3, ['p3QB', 'p3R', 'yW', 'yW2', 'yW3', 'oW', 'oTE']),
      roster(4, ['p4QB', 'p4R1', 'p4R2', 'oWx', 'p4W2', 'p4W3', 'p4TE']),
    ],
  };
  const ranked = Object.entries(D).filter(([, d]) => d[3] > 0).map(([id, [pos, , , v]]) => ({ name: id, pos, _sleeperId: id, ktcValue: v * 100 }));
  for (const pos of ['QB', 'RB', 'WR', 'TE']) {
    ranked.filter(r => r.pos === pos).sort((a, b) => b.ktcValue - a.ktcValue).forEach((r, i) => { r._posRank = i + 1; });
  }
  const winD = {
    PLAYERS: players(D),
    OFFENSE_PROJ: { offense: { players: Object.entries(D).map(([id, [pos, pts]]) => ({ id, name: id, pos, team: `N${id}`, blend: pts })) } },
    FANTASY_SCHEDULE: { leagues: {} },
    STRATEGY: { age_curve: { QB: { peak_avg: 30, sell_age: 33, hard_sell_age: 36 }, RB: { peak_avg: 25, sell_age: 27, hard_sell_age: 29 },
      WR: { peak_avg: 27, sell_age: 29, hard_sell_age: 31 }, TE: { peak_avg: 28, sell_age: 30, hard_sell_age: 32 } } },
  };
  const HD = load(winD, ranked, PICKS);
  const outD = await HD.findTrades(dynasty, { sims: 3000 });
  if (process.env.DEBUG) for (const p of outD.proposals) console.log('D', p.them.roster_id, keysOf(p.send), '->', keysOf(p.get), p.my, p.their);
  const stance = (id) => HD.rosterStance(dynasty.rosters.find(r => r.roster_id === id), dynasty);
  assert(['contender', 'buyer'].includes(stance(2)) && ['contender', 'buyer'].includes(stance(4)),
    `T2 and T4 must read as contenders, got ${stance(2)} and ${stance(4)}`);

  // (b) rB for T4's old WR1: my bench RB into his RB need at the same KTC value,
  // which is what the old finder offered him. My lineup gains 130 and my odds
  // rise, but T4 swaps a 280-point starter for a 240-point one and his odds fall.
  const odds = (whatIf) => HD.championshipOdds(dynasty, { sims: 3000, whatIf });
  const base = odds(null), swap = odds(HD.tradeTitleWhatIf(1, 4, new Set(['rB']), new Set(['oWx'])));
  const title = (res, id) => res.find(o => o.rosterId === id).title;
  assert(title(swap, 1) > title(base, 1), 'rB for oWx must raise my title odds');
  assert(title(swap, 4) < title(base, 4), 'rB for oWx must lower the title odds of the contender who gives him up');
  assert(!outD.proposals.some(p => shows(p, ['rB'], ['oWx'])), 'a trade that lowers the partner objective must be rejected');

  // (c) rB + oR for the stud TE: even on KTC (58 for 60) and both lineups gain,
  // but neither piece is within the anchor band of S. A pile never buys a stud;
  // r1, the one piece that anchors, does.
  const pileFair = HD.KT.computeFairness(30 + 28, 60, 2, 1, 30, 60).pct;
  assert(pileFair >= HD.SIM.finderFairPct, `the pile must pass the value band, or this proves nothing: ${pileFair}`);
  assert(HD.tradeLineupImpact(dynasty, 1, new Set(['rB', 'oR']), new Set(['S'])).delta >= HD.SIM.finderMinGainPts);
  assert(HD.tradeLineupImpact(dynasty, 2, new Set(['S']), new Set(['rB', 'oR'])).delta > 0);
  const forS = outD.proposals.filter(p => keysOf(p.get).includes('S'));
  assert(forS.length, `the finder must still offer an anchored deal for the stud, got ${outD.proposals.map(p => `${keysOf(p.send)}>${keysOf(p.get)}`).join(' | ')}`);
  for (const p of forS) {
    const head = Math.max(...p.send.items.map(a => a.v));
    assert(head >= HD.SIM.finderAnchorRatio * 60, `a pile bought the stud: ${keysOf(p.send)}`);
  }

  // (e) The rebuilder's core is yW, yW2, yW3 (his best by value four years out).
  // My 2027 first for yW raises his FV (the pick fills a hole in his future
  // lineup) and reads CLOSE on KTC, about 32 for 42: only the partner's side of the
  // headliner rule stops it. Checked on the scan too, which has no dice in it.
  const r1Pick = 'pick:2027:1:1';
  const fvT3 = (send, recv) => HD.projectedTradeStrength(dynasty, 3, new Set(send), new Set(recv), 4)
    - HD.projectedTradeStrength(dynasty, 3, new Set(), new Set(), 4);
  assert(['seller', 'tank'].includes(stance(3)), `T3 must read as a rebuilder, got ${stance(3)}`);
  assert(fvT3(['yW'], [r1Pick]) >= HD.SIM.finderMinFvGain, `selling yW must raise T3's FV, or this proves nothing: ${fvT3(['yW'], [r1Pick])}`);
  const r1v = HD.rosterOwnedPicks(1, dynasty).find(p => p.season === '2027' && p.round === 1 && p.originRosterId === 1).value;
  assert(HD.KT.computeFairness(r1v, 42, 1, 1, r1v, 42).pct >= HD.SIM.finderFairPct, `the sale must pass the value band: ${r1v} for 42`);
  assert(r1v >= HD.SIM.finderAnchorRatio * 42, 'and my side of the headliner rule, so only his side can stop it');
  const core = ['yW', 'yW2', 'yW3'];
  const sellsCore = (p) => {
    const out = p.get.items.filter(a => core.includes(a.k));
    if (!out.length) return false;
    const back = p.send.items;
    return !(back.length === 1 && back[0].v >= HD.SIM.finderPartnerAnchorRatio * Math.max(...out.map(a => a.v))
      && (back[0].pos === 'PICK' || D[back[0].k][2] < Math.min(...out.map(a => D[a.k][2]))));
  };
  const scanT3 = HD.finderScan(dynasty, dynasty.rosters[0], dynasty.rosters.find(r => r.roster_id === 3)).cands;
  const sold = scanT3.concat(outD.proposals.filter(p => p.them.roster_id === 3)).filter(sellsCore);
  assert(!sold.length, `a rebuilder was offered a sale of his young core: ${sold.map(p => `${keysOf(p.send)}>${keysOf(p.get)}`).join(' | ')}`);

  // (d) No picks in redraft, although the same payload flagged dynasty owns picks;
  // and every redraft proposal prices 2026 odds for both sides.
  assert(HR.rosterOwnedPicks(1, { ...redraft, is_dynasty: true }).length > 0, 'the toy must carry picks, or (d) proves nothing');
  assert(outR.proposals.length, 'redraft must find something');
  for (const p of outR.proposals) {
    assert(!keysOf(p.send).concat(keysOf(p.get)).some(k => k.startsWith('pick:')), `redraft offered a pick: ${keysOf(p.send)}`);
    assert(p.my.before > 0 && p.their.before > 0 && Number.isFinite(p.my.after) && Number.isFinite(p.their.after), 'both sides carry 2026 odds');
  }

  console.log(`trade-finder.test.js: all assertions passed (redraft ${outR.proposals.length} proposals, dynasty ${outD.proposals.length}; `
    + `${keysOf(two.send)}>${keysOf(two.get)} you ${two.my.delta >= 0 ? '+' : ''}${two.my.delta.toFixed(1)} pts +-${two.my.se.toFixed(1)}, them ${(two.their.before * 100).toFixed(1)}->${(two.their.after * 100).toFixed(1)}%)`);
})().catch((err) => { console.error(err); process.exit(1); });
