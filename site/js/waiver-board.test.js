const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const start = app.indexOf('  function faabLeagueRecord');
const end = app.indexOf('\n  function waiverBoard', start);
assert(start >= 0 && end > start, 'waiver helper source missing');
const helpers = new Function(`${app.slice(start, end)}; return {
  faabLeagueRecord, waiverExperienceProfile, waiverPositionProfile,
  waiverBidRange, rankWaiverCandidates, leagueRosteredIds,
  waiverComps, waiverThresholds, waiverWinOdds, waiverBidForOdds, waiverBundleOdds, waiverSolveBundle
};`)();

const {
  faabLeagueRecord, waiverExperienceProfile, waiverPositionProfile,
  waiverBidRange, rankWaiverCandidates, leagueRosteredIds,
  waiverComps, waiverThresholds, waiverWinOdds, waiverBidForOdds, waiverBundleOdds, waiverSolveBundle,
} = helpers;

assert.equal(
  faabLeagueRecord({ leagues: { 'The League': { id: 1 } } }, { name: 'The League ' }).id,
  1,
  'league history lookup must ignore trailing whitespace',
);
assert.equal(waiverExperienceProfile({ exp: null }, 'RB'), 'unknown');
assert.equal(waiverExperienceProfile({ exp: '' }, 'WR'), 'unknown');
assert.equal(waiverExperienceProfile({ exp: 0 }, 'RB'), 'NFL year 1 (rookie)');
assert.equal(waiverExperienceProfile({ exp: 1 }, 'RB'), 'NFL years 2-3');
assert.equal(waiverPositionProfile('NT'), 'IDP');

const exactClaims = [0, 0, 5, 10, 20].map(pct => ({
  pct, position: 'RB', experience: 'NFL years 2-3',
}));
const exact = waiverBidRange(exactClaims, {
  position: 'RB', experience: 'NFL years 2-3', profile: 'Years 2-3 · RB',
}, 100);
assert.deepEqual(
  { lo: exact.lo, hi: exact.hi, n: exact.n, exact: exact.exact },
  { lo: 0, hi: 10, n: 5, exact: true },
  '$0 adds must remain in recommended range',
);

const fallbackClaims = [
  ...[1, 2].map(pct => ({ pct, position: 'RB', experience: 'NFL year 1 (rookie)' })),
  ...[3, 4, 5, 6].map(pct => ({ pct, position: 'RB', experience: 'NFL years 4-7' })),
];
const fallback = waiverBidRange(fallbackClaims, {
  position: 'RB', experience: 'NFL year 1 (rookie)', profile: 'Rookie · RB',
}, 100);
assert.equal(fallback.source, 'RB claims');
assert.equal(fallback.n, 6);
assert.equal(fallback.exact, false);

assert.deepEqual(exact.pcts, [0, 0, 5, 10, 20], 'range must hand its sample to the odds');

// Win odds: comps' winning prices stand in for the top rival bid; a tie splits.
const close = (a, b, msg) => assert(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);
assert.deepEqual(waiverThresholds([10, 2.5], 201), [5.03, 20.1], 'thresholds rescale to this budget, in cents');
const ts = [0, 0, 5, 10, 20];
close(waiverWinOdds(ts, 0), 1.5 / 6, '$0 ties the $0 adds');
close(waiverWinOdds(ts, 10), 4 / 6, 'a tie counts half');
close(waiverWinOdds(ts, 1000), 5.5 / 6, 'odds never reach 100%');
assert.equal(waiverBidForOdds(ts, 0.5, 100), 5, 'cheapest bid reaching the target');
assert.equal(waiverBidForOdds(ts, 0.95, 100), null, 'unreachable target says so');
assert.equal(waiverBidForOdds(ts, 0.9, 15), null, 'target past what is left says so');
close(waiverBundleOdds([0.5, 0.5]), 0.75, 'at least one of two coin flips');

const bigPool = Array.from({ length: 60 }, (_, i) => ({
  phase: 'in-season', position: 'RB', proj: i / 4, pct: i % 7, season: 2026, week: 1 + (i % 17),
}));
assert.equal(waiverComps(bigPool, { position: 'RB', proj: 5 }, 2026).length, 30, 'comps default to 30');

const fs2 = require('node:fs');
const ctx0 = { window: {} };
vm.runInNewContext(fs2.readFileSync(`${__dirname}/../data/faab.js`, 'utf8'), ctx0);
const taco = Object.values(ctx0.window.FAAB_ARCHETYPES.leagues).find(l => l.budget === 201);
const sets = [4, 7, 10, 14].map(proj => {
  const r = waiverBidRange(taco.claims, { position: 'RB', experience: 'x', proj }, taco.budget, 5, 2026);
  assert(r?.comps, 'real RB comps must exist');
  return waiverThresholds(r.pcts, taco.budget);
});
// The solver is exact: it must match a brute force over every pair of bids.
for (const [i, j] of [[0, 1], [1, 2], [2, 3], [0, 3]]) {
  for (const target of [0.7, 0.9, 0.95]) {
    const left = 90;
    const got = waiverSolveBundle([sets[i], sets[j]], target, left);
    let best = null;
    for (let a = 0; a <= left; a++) for (let b = 0; a + b <= left; b++) {
      const p = waiverBundleOdds([waiverWinOdds(sets[i], a), waiverWinOdds(sets[j], b)]);
      if (p >= target - 1e-9 && (best == null || a + b < best)) best = a + b;
    }
    assert.equal(got.reached, best != null, `reachability ${i}/${j} at ${target}`);
    if (best != null) {
      assert.equal(got.total, best, `bundle ${i}/${j} at ${target} must be the cheapest`);
      assert(got.combined >= target - 1e-9, 'solved bids must reach the target');
    }
    assert(got.total <= left, 'bids together must fit what is left');
  }
}
const short = waiverSolveBundle([sets[3], sets[2]], 0.98, 6);
assert(!short.reached && short.total <= 6, 'out of reach returns the best the budget buys');
close(short.combined, waiverSolveBundle([sets[3], sets[2]], 0.999, 6).combined, 'best odds do not depend on the target');

const leagueA = leagueRosteredIds({ rosters: [{
  players: ['1'], taxi: ['2'], reserve: ['3'], starters: ['4'],
}] });
const leagueB = leagueRosteredIds({ rosters: [{ players: ['5'] }] });
assert.deepEqual([...leagueA].sort(), ['1', '2', '3', '4']);
assert.deepEqual([...leagueB], ['5']);
assert(!leagueA.has('5') && !leagueB.has('1'), 'ownership must stay league-specific');

const cands = [];
for (const [position, base] of [['QB', 100], ['RB', 80], ['WR', 70], ['TE', 60]]) {
  for (let i = 0; i < 8; i++) cands.push({ position, sortValue: base - i });
}
const ranked = rankWaiverCandidates(cands, { QB: 1, RB: 3, WR: 3, TE: 1 });
assert(ranked.slice(0, 8).filter(c => c.position === 'QB').length <= 1,
  '1QB waiver board must not fill with quarterbacks');

const board = app.slice(app.indexOf('  function waiverBoard'), app.indexOf('\n  function faabPanel'));
assert(!board.includes("'Own'"), 'global ownership column must stay removed');
assert(!board.includes('.owned'), 'waiver board must not use global Sleeper ownership');
assert(board.includes('b.hi > left'), 'any range exceeding remaining budget must be flagged');
assert(board.includes("'NT'"), 'IDP nose tackles must be startable');
assert.match(board, /const startable = new Set\(Object\.entries\(targets\)/,
  'waiver positions must come from this league\'s starter slots');
assert(board.includes('waiverSolveBundle('), 'bundle panel must use the solver');
assert(board.includes("h('tbody', { class: 'wb-group' }"), 'each candidate keeps his odds line in his own tbody');
assert(board.includes("'aria-expanded'"), 'the chart toggle must announce its state');
assert.match(board, /'data-player-id': c\.pid/,
  'rendered candidates must expose stable ids for league ownership verification');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(`${__dirname}/../data/faab.js`, 'utf8'), ctx);
const data = ctx.window.FAAB_ARCHETYPES;
assert(data && data.leagues, 'FAAB data missing');
assert(!data.leagues['Washington Football League'], 'ESPN league must not borrow Sleeper history');
let zeroClaims = 0;
for (const [leagueName, league] of Object.entries(data.leagues)) {
  assert(!Object.hasOwn(league.dims, 'production'),
    `${leagueName}: post-claim production must not appear in bid-time profiles`);
  const paid = league.claims.filter(c => (c.bid || 0) > 0);
  const zero = league.claims.filter(c => (c.bid || 0) === 0);
  zeroClaims += zero.length;
  assert.equal(paid.length, league.priced, `${leagueName}: priced count mismatch`);
  assert.equal(zero.length, league.zeroDollar, `${leagueName}: $0 count mismatch`);
  for (const [dimension, rows] of Object.entries(league.dims)) {
    for (const row of rows) {
      const drill = paid.filter(c => c[dimension] === row.situation);
      assert.equal(drill.length, row.n,
        `${leagueName}: ${dimension} ${row.situation} drilldown mismatch`);
    }
  }
}
assert(zeroClaims > 0, '$0 claims must ship for honest recommendations');

console.log('waiver-board.test.js: all assertions passed');
