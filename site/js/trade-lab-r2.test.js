// Trade Lab round 2, the verification findings in notes/trade-lab-redraft-audit.md.
// Each block fails on the code before this round:
//   H1 a kicker worse than the best free one, shipped in a trade, emptied his slot
//      and the redraft verdict read the side that sent him as losing outright
//   H2 "Run title odds" switched the verdict onto a second projection (season
//      blend / 17), and the simulator counted an IR player's absence twice
//   M  trade-sim.js priced 2026 on different inputs than the Trade Lab
//   M  the Trade Finder showed a deal its partner loses at the Lab's sim count
//   M  a dynasty roster that trades its QB for a lineup "upgrade" read stronger
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

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
  slice("  // Project a roster's on-field team strength at horizon N.", '  // ROUTE: Action Center'),
  slice('function projUnitData()', 'function buildWhatIfTray'),
  slice('  // Trade Finder. Iterates reasonable packages', '  // Last run per league'),
].join('\n');
const load = (window, RANKED = []) => new Function('window', 'RANKED', SRC + `
  return { KT, SIM, tradeLineupImpact, simulateRosterStrength, championshipOdds, titleOddsByYear, tradeTitleWhatIf,
    findTrades, simPool };`)(window, RANKED);

const roster = (id, players, wins = 0, losses = 0) => ({ roster_id: id, team_name: `T${id}`, is_me: id === 1,
  players, taxi: [], reserve: [], wins, losses, ties: 0, fpts: 0 });
const weeks = (w, nulls = 0) => Array.from({ length: 9 }, (_, i) => (i >= 3 && i < 3 + nulls ? null : w));

(async () => {
  // ==== Redraft toy: QB RB WR TE FLEX K DEF, 4 teams, week 4 of 6 ==============
  // [pos, weekly points, season blend (default 17 x weekly), leading null weeks]
  const R = {
    qA: ['QB', 20], rA1: ['RB', 15], rA2: ['RB', 5], wA: ['WR', 16], xH: ['WR', 14], tA: ['TE', 10], kA: ['K', 7], dA: ['DEF', 8],
    qB: ['QB', 19], rB1: ['RB', 22], rB2: ['RB', 12], wB: ['WR', 15], xL: ['WR', 14, 7 * 17], tB: ['TE', 11], kB: ['K', 9], dB: ['DEF', 9],
    qC: ['QB', 18], rC1: ['RB', 16], rC2: ['RB', 11], wC: ['WR', 13], wC2: ['WR', 12], tC: ['TE', 9], kC: ['K', 8.5], dC: ['DEF', 7.5],
    qD: ['QB', 17], rD1: ['RB', 14], rD2: ['RB', 10], wD: ['WR', 17], wD2: ['WR', 11], tD: ['TE', 8], kD: ['K', 7.8], dD: ['DEF', 8.2],
    // Free agents set replacement. The best free K (8) beats kA (7).
    qFA: ['QB', 12], rFA: ['RB', 6], wFA: ['WR', 6], tFA: ['TE', 5], kFA: ['K', 8], dFA: ['DEF', 7],
    // IR, back in two weeks at 18 a game. Its season total already left the
    // missed games out (6 x 18 + 5 x 18), like A.J. Brown's 167.
    zIR: ['WR', 18, 11 * 18, 2],
  };
  const lg = {
    id: 'toy-r2', name: 'Toy', is_dynasty: false, type: 0, status: 'in_season', week: 4, total_rosters: 4,
    playoff_teams: 2, settings: { playoff_week_start: 7 }, drafts: [], traded_picks: [],
    roster_positions: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN', 'BN'],
    rosters: [
      roster(1, ['qA', 'rA1', 'rA2', 'wA', 'xH', 'tA', 'kA', 'dA'], 1, 2),
      roster(2, ['qB', 'rB1', 'rB2', 'wB', 'xL', 'tB', 'kB', 'dB'], 2, 1),
      roster(3, ['qC', 'rC1', 'rC2', 'wC', 'wC2', 'tC', 'kC', 'dC'], 2, 1),
      roster(4, ['qD', 'rD1', 'rD2', 'wD', 'wD2', 'tD', 'kD', 'dD'], 1, 2),
    ],
  };
  const win = {
    PLAYERS: Object.fromEntries(Object.entries(R).map(([id, [pos, , , out]]) =>
      [id, { id, name: id, pos, team: `N${id}`, age: 26, injury_status: out ? 'IR' : null }])),
    WEEKLY_RANKINGS: { currentWeek: 4, players: Object.entries(R).map(([id, [pos, w, , out]]) => ({ id, name: id, pos, sleeper: weeks(w, out) })) },
    // Season projections, like the real feed: no K or DEF.
    OFFENSE_PROJ: { offense: { players: Object.entries(R).filter(([, [pos]]) => !['K', 'DEF'].includes(pos))
      .map(([id, [pos, w, blend]]) => ({ id, name: id, pos, team: `N${id}`, blend: blend || w * 17 })) } },
    FANTASY_SCHEDULE: { leagues: { 'toy-r2': { medianScoring: false,
      weeks: { 4: { 1: 2, 2: 1, 3: 4, 4: 3 }, 5: { 1: 3, 3: 1, 2: 4, 4: 2 }, 6: { 1: 4, 4: 1, 2: 3, 3: 2 } } } } },
  };
  const H = load(win);

  // ---- H1: waiver fill flips the kicker case ---------------------------------
  // Side A ships kA and a sub-waiver RB for Side B's RB1. A manager who ships his
  // kicker claims kFA, who is better, so the K slot costs A nothing.
  const kSend = new Set(['kA', 'rA2']), kGet = new Set(['rB1']);
  const kImpA = H.tradeLineupImpact(lg, 1, kSend, kGet), kImpB = H.tradeLineupImpact(lg, 2, kGet, kSend);
  assert.equal(H.tradeLineupImpact(lg, 1, new Set(['kA']), new Set()).delta, 0,
    'shipping a kicker below the best free one must cost 0: the free agent fills his slot');
  assert.equal(kImpA.emptied, 0, 'a slot the waiver wire can fill is not an empty slot');
  assert(kImpA.delta > 0 && kImpB.delta < 0, `A gains the RB1, B loses him: ${kImpA.delta} / ${kImpB.delta}`);
  const kVerdict = H.KT.redraftVerdict(2, 1, kImpA, kImpB, null);
  assert.equal(kVerdict.label, 'WIN FOR A', `the kicker case must read as A's win, got ${kVerdict.label} (${kVerdict.note})`);

  // ---- H2: the verdict before the odds run is the verdict after it -----------
  // xH and xL carry the same weekly lines; xL's season blend is half of his.
  // The lineup calls the swap even, and so must the title odds of the same lines.
  const labSims = H.SIM.tradeSimBudget;   // redraft prices one season
  const labOdds = (whatIf) => H.titleOddsByYear(lg, { years: 1, sims: labSims, whatIf })[0].byRoster;
  const sSend = new Set(['xH']), sGet = new Set(['xL']);
  const sImpA = H.tradeLineupImpact(lg, 1, sSend, sGet), sImpB = H.tradeLineupImpact(lg, 2, sGet, sSend);
  const pre = H.KT.redraftVerdict(1, 1, sImpA, sImpB, null);
  assert.equal(pre.label, 'FAIR', `identical lines must read FAIR before the odds run, got ${pre.label}`);
  const base = labOdds(null), swap = labOdds(H.tradeTitleWhatIf(1, 2, sSend, sGet, lg));
  // Conservative unpaired band (2 SE of two independent rates): if the change
  // clears even this, it is not noise.
  const side = (rid) => {
    const p0 = base.get(rid), p1 = swap.get(rid), d = (p1 - p0) * 100;
    return { d, sig: Math.abs(d) > 2 * Math.sqrt((p0 * (1 - p0) + p1 * (1 - p1)) / labSims) * 100 };
  };
  const a = side(1), b = side(2);
  const post = H.KT.redraftVerdict(1, 1, sImpA, sImpB, { a: a.d, b: b.d, sigA: a.sig, sigB: b.sig });
  assert.equal(post.label, pre.label, `the odds run switched the verdict ${pre.label} -> ${post.label}: A ${a.d.toFixed(1)}, B ${b.d.toFixed(1)}`);
  // And no double count: the IR player's rate is his per-game line, his absence
  // the two null weeks, not season / 17 and then a 6-week designation on top.
  const z = H.simPool({ players: ['zIR'], taxi: [], reserve: [] }, lg, 'ros').find(p => p.pid === 'zIR');
  assert(z, 'the rest-of-season simulator must price an IR player who has lines');
  assert.equal(z.mean, 18, `IR player rate must be his per-game line, got ${z && z.mean}`);
  assert.equal(z.startOut, 2, `IR player absence must come from his lines, got ${z && z.startOut}`);

  // ---- M: a Finder row never shows a partner loss at the Lab's sim count ------
  // Every shown row re-priced the way the Lab's "Run title odds" prices it: same
  // what-if (waiver claims included), same seed, SIM.tradeSimBudget simulations.
  // The row must read exactly that, so the partner's gain and my 2 SE are the
  // Lab's. The old rows read the finder's own screen (800 sims live).
  const R2 = {
    q1: ['QB', 20], r1: ['RB', 18], r2: ['RB', 7], w1: ['WR', 19], w2: ['WR', 16], w3: ['WR', 8], t1: ['TE', 4],
    q2: ['QB', 19], r3: ['RB', 17], r9: ['RB', 15], r10: ['RB', 11], w4: ['WR', 7], t2: ['TE', 16], t3: ['TE', 13],
    q3: ['QB', 18], r4: ['RB', 16], r5: ['RB', 12], w6: ['WR', 15], w7: ['WR', 12], t4: ['TE', 12],
    q4: ['QB', 17], r6: ['RB', 15], r7: ['RB', 11], w8: ['WR', 14], w9: ['WR', 11], t5: ['TE', 11],
    qFA: ['QB', 15], rFA: ['RB', 6], wFA: ['WR', 6], tFA: ['TE', 4],
  };
  const fl = { ...lg, id: 'toy-f', roster_positions: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN', 'BN', 'BN', 'BN'],
    rosters: [roster(1, ['q1', 'r1', 'r2', 'w1', 'w2', 'w3', 't1'], 1, 2), roster(2, ['q2', 'r3', 'r9', 'r10', 'w4', 't2', 't3'], 2, 1),
      roster(3, ['q3', 'r4', 'r5', 'w6', 'w7', 't4'], 2, 1), roster(4, ['q4', 'r6', 'r7', 'w8', 'w9', 't5'], 1, 2)] };
  const winF = {
    PLAYERS: Object.fromEntries(Object.entries(R2).map(([id, [pos]]) => [id, { id, name: id, pos, team: `N${id}`, age: 26, injury_status: null }])),
    WEEKLY_RANKINGS: { currentWeek: 4, players: Object.entries(R2).map(([id, [pos, w]]) => ({ id, name: id, pos, sleeper: weeks(w) })) },
    OFFENSE_PROJ: { offense: { players: Object.entries(R2).map(([id, [pos, w]]) => ({ id, name: id, pos, team: `N${id}`, blend: w * 17 })) } },
    FANTASY_SCHEDULE: { leagues: { 'toy-f': win.FANTASY_SCHEDULE.leagues['toy-r2'] } },
  };
  const F = load(winF);
  const found = await F.findTrades(fl, { sims: 3000 });
  assert(found.proposals.length, 'the toy must surface a deal, or this proves nothing');
  const champsOf = (whatIf) => { const c = []; F.championshipOdds(fl, { sims: F.SIM.tradeSimBudget, whatIf, champions: c }); return c; };
  const labBase = champsOf(null);
  for (const p of found.proposals) {
    const rid = p.them.roster_id, after = champsOf(F.tradeTitleWhatIf(1, rid, new Set(p.send.keys), new Set(p.get.keys), fl));
    const paired = (id) => {
      const d = after.map((c, k) => (c === id) - (labBase[k] === id)), m = d.reduce((s, x) => s + x, 0) / d.length;
      return { delta: m * 100, se: Math.sqrt(Math.max(0, d.reduce((s, x) => s + x * x, 0) / d.length - m * m) / d.length) * 100 };
    };
    const me = paired(1), them = paired(rid), deal = `${p.send.keys}>${p.get.keys}`;
    assert(them.delta > 0, `${deal}: the partner loses at the Lab's count (${them.delta.toFixed(2)}), the finder showed ${p.their.delta.toFixed(2)}`);
    assert(me.delta > 2 * me.se, `${deal}: my gain ${me.delta.toFixed(2)} is under 2 SE (${me.se.toFixed(2)}) at the Lab's count`);
    assert(Math.abs(p.my.delta - me.delta) < 1e-9 && Math.abs(p.their.delta - them.delta) < 1e-9,
      `${deal}: finder ${p.my.delta.toFixed(2)} / ${p.their.delta.toFixed(2)} vs Lab ${me.delta.toFixed(2)} / ${them.delta.toFixed(2)}`);
  }

  // ---- M: a dynasty roster that ships its QB for an "upgrade" gets no stronger
  // [pos, season points, KTC / 100]. fW is free and already beats my FLEX, so
  // bW upgrades nothing a waiver claim would not; the QB slot goes to fQB.
  const D = {
    mQ: ['QB', 300, 20], mW1: ['WR', 250, 50], mW2: ['WR', 220, 40], mF: ['WR', 90, 10],
    bQ: ['QB', 280, 25], bW: ['WR', 260, 60], bW2: ['WR', 200, 35], bF: ['WR', 150, 15],
    fW: ['WR', 150, 30], fQ: ['QB', 100, 2],
  };
  const dl = { id: 'toy-d', name: 'Toy D', is_dynasty: true, type: 2, status: 'pre_season', week: 1, total_rosters: 2,
    playoff_teams: 2, settings: { playoff_week_start: 7 }, drafts: [], traded_picks: [],
    roster_positions: ['QB', 'WR', 'WR', 'FLEX', 'BN', 'BN'],
    rosters: [roster(1, ['mQ', 'mW1', 'mW2', 'mF']), roster(2, ['bQ', 'bW', 'bW2', 'bF'])] };
  const winD = {
    PLAYERS: Object.fromEntries(Object.entries(D).map(([id, [pos]]) => [id, { id, name: id, pos, team: `N${id}`, age: 26, injury_status: null }])),
    OFFENSE_PROJ: { offense: { players: Object.entries(D).map(([id, [pos, pts]]) => ({ id, name: id, pos, team: `N${id}`, blend: pts })) } },
    FANTASY_SCHEDULE: { leagues: {} },
  };
  const DH = load(winD, Object.entries(D).map(([id, [pos, , v]]) => ({ name: id, pos, _sleeperId: id, ktcValue: v * 100 })));
  const noQB = DH.simulateRosterStrength(dl, 1, new Set(['mQ']), new Set(['bW']));
  assert(noQB.delta <= 0, `a roster left with no QB must not read stronger: ${noQB.before} -> ${noQB.after}`);
  // Control: a swap that empties nothing still reads as the gain it is.
  const up = DH.simulateRosterStrength(dl, 1, new Set(['mW2']), new Set(['bW']));
  assert(up.delta > 0, `a straight WR upgrade must still read stronger: ${up.before} -> ${up.after}`);

  // ---- M: trade-sim.js prices 2026 on the Trade Lab's inputs -----------------
  // The Lab's inputs are every data file index.html loads; the simulator is the
  // same slice of app.js trade-sim.js runs. Same trade, same seed, same odds.
  const T = require('./trade-sim.js');
  const html = fs.readFileSync(`${__dirname}/../index.html`, 'utf8');
  const labCtx = { window: {}, console };
  for (const [, f] of html.matchAll(/<script src="(data\/[^"]+\.js)"/g)) vm.runInNewContext(fs.readFileSync(`${__dirname}/../${f}`, 'utf8'), labCtx);
  const cut = (x, y) => slice(x, y);
  const LabH = new Function('window', `${cut('  const CURRENT_SEASON', '  // Position aging curves')}
     function rosterOwnedPicks() { return []; }
     ${cut('function isDynastyLeague(lg)', '  // The league whose format defines VOR replacement')}
     ${cut('  let _rosPts = null;', '  // Replacement level on the SAME rest-of-season basis')}
     ${cut('function offenseStarterCount', '  // Starting-lineup strength')}
     ${cut('function projUnitData()', 'function buildWhatIfTray')}
     return { championshipOdds };`)(labCtx.window);
  const labLg = labCtx.window.LEAGUES.find(l => l.id === T.lg.id);
  const me = T.lg.rosters.find(r => r.is_me), them = T.lg.rosters.find(r => !r.is_me);
  const give = me.players.find(p => (labCtx.window.PLAYERS[p] || {}).pos === 'WR'), take = them.players.find(p => (labCtx.window.PLAYERS[p] || {}).pos === 'WR');
  const whatIf = { [me.roster_id]: { drop: [give], add: [take] }, [them.roster_id]: { drop: [take], add: [give] } };
  const odds = (fn, league) => new Map(fn(league, { sims: 400, whatIf, seed: 424242 }).map(o => [o.rosterId, [o.title, o.playoff, o.expWins]]));
  const cli = odds(T.H.championshipOdds, T.lg), lab = odds(LabH.championshipOdds, labLg);
  for (const [rid, v] of lab) assert.deepEqual(cli.get(rid), v, `roster ${rid}: trade-sim.js ${cli.get(rid)} vs Trade Lab ${v}`);

  console.log(`trade-lab-r2.test.js: all assertions passed (kicker case ${kVerdict.label}, even swap ${pre.label} -> ${post.label}, `
    + `${found.proposals.length} finder rows re-priced, no-QB strength ${noQB.before} -> ${noQB.after}, CLI = Lab on ${lab.size} rosters)`);
})().catch((err) => { console.error(err); process.exit(1); });
