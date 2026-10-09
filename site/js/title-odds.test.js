// Championship-odds simulator. A Monte Carlo can't be checked by eye — a wrong
// number looks exactly like a right one — so this pins the invariants that must
// hold no matter how the constants are tuned.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const root = `${__dirname}/..`;
const ctx = { window: {} };
for (const f of ['leagues.js', 'projections.js']) {
  vm.runInNewContext(fs.readFileSync(`${root}/data/${f}`, 'utf8'), ctx);
}
const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const css = fs.readFileSync(`${root}/css/styles.css`, 'utf8');
assert.equal((app.match(/class:'trade-title-side'/g) || []).length, 2,
  'championship odds must stack labeled Side A and Side B rows');
assert.equal((app.match(/class:'trade-lineup-side'/g) || []).length, 2,
  'starting-lineup comparisons must stack labeled Side A and Side B rows');
assert.match(css, /\.trade-title-value,\s*\.trade-lineup-value\s*\{[^}]*white-space:\s*normal/s,
  'long lineup and odds comparisons must wrap instead of colliding');
assert.match(css, /@media \(min-width:\s*1281px\)\s*\{\s*\.trade-middle\s*\{\s*position:\s*sticky/s,
  'the verdict may become sticky only when the three-column trade layout fits');
const cut = (a, b) => {
  const i = app.indexOf(a), j = app.indexOf(b, i);
  assert(i >= 0 && j > i, `slice failed: ${a}`);
  return app.slice(i, j);
};
// The multi-year path reaches CURRENT_SEASON and the pick helpers, which live
// in other parts of the file. Stub the two globals the pick chain needs rather
// than dragging half the app into the harness — pick VALUES are not under test
// here (pick-fv.test.js owns those), only what the simulator does with them.
const loadModel = () => new Function('window',
  `${cut('  const CURRENT_SEASON', '  // Position aging curves')}
   function rosterOwnedPicks(rosterId, league, horizon = 2) {
     return (window.__TEST_PICKS && window.__TEST_PICKS[rosterId]) || [];
   }
   ${cut('function isDynastyLeague(lg)', '  // The league whose format defines VOR replacement')}
   ${cut('  let _rosPts = null;', '  // Replacement level on the SAME rest-of-season basis')}
   ${cut('function offenseStarterCount', '  // Starting-lineup strength')}
   ${cut('  const ODDS_CACHE', '  const PROJ_SRC_LABEL')}
   ${cut('function projUnitData()', 'function buildWhatIfTray')}
   return { championshipOdds, titleEquity, simPool, injuryHazard, mulberry32, makeNormal, playoffSettings,
            productionRetention, pickRookiePoints, projectLeagueForward, pickValueBySlot, CURRENT_SEASON,
            SIM, offenseStartingSlots, startableIds, forecastWeeks, standingsForecast };`
)(ctx.window);
const H = loadModel();

const lg = ctx.window.LEAGUES.find(l => l.short_name === 'Password is taco');
const me = lg.rosters.find(r => r.is_me);
ctx.window.PLAYERS = ctx.window.PLAYERS || {};

// --- RNG: deterministic, uniform, in range ---
const r1 = H.mulberry32(42), r2 = H.mulberry32(42);
const draws = Array.from({ length: 5000 }, () => r1());
assert.deepEqual(draws.slice(0, 50), Array.from({ length: 50 }, () => r2()), 'same seed must replay exactly');
assert(draws.every(x => x >= 0 && x < 1), 'RNG must stay in [0,1)');
const mean = draws.reduce((a, b) => a + b, 0) / draws.length;
assert(Math.abs(mean - 0.5) < 0.02, `uniform mean off: ${mean}`);

// --- Normal: right moments ---
const nrm = H.makeNormal(H.mulberry32(7));
const ns = Array.from({ length: 20000 }, () => nrm());
const nMean = ns.reduce((a, b) => a + b, 0) / ns.length;
const nSd = Math.sqrt(ns.reduce((a, b) => a + (b - nMean) ** 2, 0) / ns.length);
assert(Math.abs(nMean) < 0.04, `normal mean off: ${nMean}`);
assert(Math.abs(nSd - 1) < 0.04, `normal sd off: ${nSd}`);

// --- Injury hazard: monotone in age, ordered by position, always a probability ---
assert(H.injuryHazard('RB', 30) > H.injuryHazard('RB', 24), 'older RB must break down more');
assert(H.injuryHazard('RB', 25) > H.injuryHazard('QB', 25), 'RBs miss more time than QBs');
assert.equal(H.injuryHazard('WR', 22), H.injuryHazard('WR', 25), 'below the shoulder, age is flat');
for (const pos of ['QB', 'RB', 'WR', 'TE']) {
  for (const age of [21, 25, 30, 36, 44]) {
    const hz = H.injuryHazard(pos, age);
    assert(hz > 0 && hz < 1, `hazard out of range: ${pos} ${age} -> ${hz}`);
  }
}
assert(H.injuryHazard('WR', undefined) > 0, 'unknown age must not produce NaN');

// --- Playoff shape comes from league settings, not a hardcode ---
const cfg = H.playoffSettings(lg);
assert.equal(cfg.teams, 6);
assert.equal(cfg.startWeek, 15);
assert.equal(cfg.regularWeeks, 14);

// --- The pool ---
const pool = H.simPool(me, lg, 'blend', null);
assert(pool.length > 10, 'pool too small to field a lineup');
const stash = new Set([...(me.taxi || []), ...(me.reserve || [])].map(String));
for (const a of pool) {
  assert(!stash.has(String(a.pid)), `taxi/IR player ${a.name} must not be simulated`);
  assert(a.mean > 0 && a.sd > 0, `${a.name} has a degenerate distribution`);
  assert(['QB', 'RB', 'WR', 'TE'].includes(a.pos), `non-offense ${a.pos} in the offense pool`);
}
// Every field the hot loop touches must exist up front (shape stability).
for (const k of ['mult', 'bye', 'outUntil', 'v', 'hazard', 'startOut', 'questionable']) {
  assert(k in pool[0], `simPool must predeclare ${k}`);
}

// --- The simulation itself ---
const odds = H.championshipOdds(lg, { sims: 400 });
assert.equal(odds.length, lg.rosters.length, 'every roster needs a row');
const sum = odds.reduce((s, o) => s + o.title, 0);
assert(Math.abs(sum - 1) < 1e-9, `exactly one champion per season; got ${sum}`);
const playoffSum = odds.reduce((s, o) => s + o.playoff, 0);
assert(Math.abs(playoffSum - cfg.teams) < 1e-9, `${cfg.teams} playoff teams per season; got ${playoffSum}`);
assert(Math.abs(odds.reduce((s, o) => s + o.final, 0) - 2) < 1e-9, 'exactly two teams reach the final');
for (const o of odds) {
  assert(o.title <= o.final + 1e-9, `${o.teamName} cannot win more finals than it reaches`);
  assert(o.final <= o.playoff + 1e-9, `${o.teamName} cannot reach a final without making the playoffs`);
  assert(o.bye <= o.playoff + 1e-9, `${o.teamName} cannot get a bye without making the playoffs`);
  assert(o.expWins >= 0 && o.expWins <= cfg.regularWeeks, `${o.teamName} impossible win total`);
}
const totalWins = odds.reduce((s, o) => s + o.expWins, 0);
assert(Math.abs(totalWins - cfg.regularWeeks * lg.rosters.length / 2) < 0.3,
  `wins must sum to one per matchup; got ${totalWins}`);
assert(odds[0].title >= odds[odds.length - 1].title, 'results must be sorted by title odds');

// --- Determinism: same inputs, same answer. A jittering percentage is useless
// for comparing two trades. ---
const again = H.championshipOdds(lg, { sims: 400 });
assert.deepEqual(again.map(o => o.title), odds.map(o => o.title), 'same seed must give the same odds');
const other = H.championshipOdds(lg, { sims: 400, seed: 999 });
assert(other.some((o, i) => o.title !== odds[i].title), 'a different seed should move something');

// --- Monotonicity: adding a stud must not lower your own title odds. This is
// the assertion that catches a broken lineup filler or a scrambled what-if. ---
const proj = ctx.window.OFFENSE_PROJ.offense.players;
const stud = proj.slice().sort((a, b) => b.blend - a.blend).find(p => p.pos === 'WR');
const before = H.championshipOdds(lg, { sims: 1500 }).find(o => o.isMe);
const after = H.championshipOdds(lg, { sims: 1500, whatIf: { [me.roster_id]: { add: [stud.id], drop: [] } } }).find(o => o.isMe);
assert(after.title >= before.title, `adding ${stud.name} must not hurt: ${before.title} -> ${after.title}`);
assert(after.expPts > before.expPts, 'adding a WR1 must raise expected points');

// Dropping your best player must not help you.
const worst = H.championshipOdds(lg, { sims: 1500, whatIf: { [me.roster_id]: { add: [], drop: [pool[0].pid] } } }).find(o => o.isMe);
assert(worst.expPts < before.expPts, `dropping ${pool[0].name} must lower expected points`);

// --- A what-if for one roster must not silently rewrite another's ---
const rival = odds.find(o => !o.isMe).rosterId;
const withMine = H.championshipOdds(lg, { sims: 800, whatIf: { [me.roster_id]: { add: [stud.id], drop: [] } } });
const rivalPts = withMine.find(o => o.rosterId === rival).expPts;
const rivalBase = H.championshipOdds(lg, { sims: 800 }).find(o => o.rosterId === rival).expPts;
assert(Math.abs(rivalPts - rivalBase) < rivalBase * 0.02, 'a what-if must not leak across rosters');

// --- Multi-year: production aging + converted picks ---
// Production aging is NOT dynasty-value aging. A 32-year-old WR still produces;
// he just isn't worth much in a dynasty trade. These two curves must not be
// confused, so pin the shape.
const pr = H.productionRetention;
assert.equal(pr('WR', 27, 0), 1, 'year zero is always identity');
assert(pr('RB', 21, 2) > 1, 'a 21-year-old RB should still be climbing');
assert(pr('RB', 29, 2) < pr('WR', 29, 2), 'RBs fall off faster than WRs');
assert(pr('QB', 30, 3) > pr('RB', 30, 3), 'QBs age best');
assert(pr('WR', 27, 3) < pr('WR', 27, 1), 'decline compounds with time');
assert(pr('WR', 34, 3) < pr('WR', 30, 3), 'older starts lower');
for (const pos of ['QB', 'RB', 'WR', 'TE']) {
  for (const age of [21, 27, 33, 40]) {
    const f = pr(pos, age, 3);
    assert(f >= 0 && f < 3 && Number.isFinite(f), `retention out of range: ${pos} ${age} -> ${f}`);
  }
}

// A pick converts to rookie production monotone in its value, and never negative.
assert(H.pickRookiePoints(70) > H.pickRookiePoints(40), 'a better pick yields a better rookie');
assert.equal(H.pickRookiePoints(0), 0, 'a worthless pick yields nothing');
assert(H.pickRookiePoints(-5) === 0, 'no negative rookies');

// Give every roster the same two 2027 firsts so the future-season assertions
// exercise pick conversion without depending on real league pick ownership.
ctx.window.__TEST_PICKS = Object.fromEntries(lg.rosters.map(r => [r.roster_id, [
  { season: String(H.CURRENT_SEASON + 1), round: 1, label: '2027 R1', value: 62.7 },
  { season: String(H.CURRENT_SEASON + 1), round: 1, label: '2027 R1 (from Breece’s Pieces)', value: 71.3 },
]]));

// Future seasons still produce a valid probability distribution.
for (const y of [1, 2]) {
  const fut = H.championshipOdds(lg, { sims: 300, yearsOut: y });
  assert(Math.abs(fut.reduce((s, o) => s + o.title, 0) - 1) < 1e-9, `year +${y}: champion mass must stay 1`);
  assert(Math.abs(fut.reduce((s, o) => s + o.playoff, 0) - cfg.teams) < 1e-9, `year +${y}: playoff mass must stay ${cfg.teams}`);
  assert(fut.every(o => o.expPts > 0), `year +${y}: every roster must still score`);
}

// Spending a pick must cost you in the season it would have converted, and a
// rival who receives it must gain. This is the whole point of pricing a trade
// over a window instead of a season.
const myPicks = H.championshipOdds(lg, { sims: 1200, yearsOut: 1 }).find(o => o.isMe);
const spentLabels = ['2027 R1', '2027 R1 (from Breece’s Pieces)'];
const noPicks = H.championshipOdds(lg, {
  sims: 1200, yearsOut: 1, whatIf: { [me.roster_id]: { add: [], drop: [], spendPicks: spentLabels } },
}).find(o => o.isMe);
assert(noPicks.expPts < myPicks.expPts, 'spending your 2027 firsts must cost 2027 production');
const gained = H.championshipOdds(lg, {
  sims: 1200, yearsOut: 1,
  whatIf: { [me.roster_id]: { add: [], drop: [], gainPicks: [{ label: 'extra', season: '2027', value: 70 }] } },
}).find(o => o.isMe);
assert(gained.expPts > myPicks.expPts, 'acquiring a 2027 first must add 2027 production');
// And in the CURRENT season a pick is worth exactly nothing.
const spentNow = H.championshipOdds(lg, {
  sims: 800, whatIf: { [me.roster_id]: { add: [], drop: [], spendPicks: spentLabels } },
}).find(o => o.isMe);
const baseNow = H.championshipOdds(lg, { sims: 800 }).find(o => o.isMe);
assert.equal(spentNow.expPts, baseNow.expPts, 'picks contribute zero to the season in progress');

// --- Draft-position feedback ---
// This is the engine that makes a rebuild work at all. Without it, losing buys
// you nothing and the model will always say "contend", which is the exact error
// this simulator exists to avoid.
const slotBest = H.pickValueBySlot(60, 10, 10);   // worst roster
const slotWorst = H.pickValueBySlot(60, 1, 10);   // best roster
assert(slotBest > 60 && slotWorst < 60, 'the worst team must pick highest and the best team lowest');
assert(slotBest > slotWorst * 1.4, 'the slot spread must be big enough to matter');
assert(H.pickValueBySlot(60, 5, 10) > H.pickValueBySlot(60, 4, 10), 'monotone in finishing position');
assert(H.pickValueBySlot(60, 3, 1) === 60, 'a one-team league cannot be slotted');
assert(H.pickValueBySlot(60, 5, 10) > 0, 'slotting never goes negative');

// --- titleEquity: the multi-year roll-up ---
const eq = H.titleEquity(lg, { years: 3, sims: 250, discount: 0.9 });
assert.equal(eq.byYear.length, 3, 'one row per season');
assert.equal(eq.byYear[0].season, H.CURRENT_SEASON, 'starts in the current season');
assert(eq.byYear.every(y => y.title >= 0 && y.title <= 1), 'every year is a probability');
assert(eq.equity <= eq.raw + 1e-9, 'discounting cannot increase equity');
assert(Math.abs(eq.byYear.reduce((s, y, i) => s + y.title * Math.pow(0.9, i), 0) - eq.equity) < 1e-9,
  'equity must equal the discounted sum of its own yearly odds');
const undisc = H.titleEquity(lg, { years: 3, sims: 250, discount: 1 });
assert(Math.abs(undisc.equity - undisc.raw) < 1e-9, 'discount 1 means equity equals raw');
// A longer horizon can only add non-negative terms.
const short = H.titleEquity(lg, { years: 2, sims: 250, discount: 0.9 });
const long = H.titleEquity(lg, { years: 4, sims: 250, discount: 0.9 });
assert(long.equity >= short.equity - 1e-9, 'extending the horizon cannot reduce equity');
// The horizon must actually change the ranking of strategies, or the whole
// exercise is theatre. Judging a rebuild on too short a window is the bug.
assert(long.byYear.length > short.byYear.length);

console.log(`title-odds.test.js: all assertions passed (champion mass ${sum.toFixed(6)}, my title ${(before.title * 100).toFixed(1)}%)`);

// Standings contract: one outcome per game, preserved records, fixed qualifiers.
for (const f of ['weekly-rankings.js', 'schedule.js'])
  vm.runInNewContext(fs.readFileSync(`${root}/data/${f}`, 'utf8'), ctx);
const forecastLeague = ctx.window.LEAGUES.find(l => l.short_name === 'Password is taco');
const F = loadModel();
const taxiIds = new Set((me.taxi || []).map(String));
assert(F.simPool(me, lg, 'ros', null).every(a => !taxiIds.has(String(a.pid))),
  'current-season ROS pools must exclude taxi players even when weekly lines exist');
const taxiStarter = String(me.starters[0]);
assert(F.simPool({ ...me, taxi:[...(me.taxi || []), taxiStarter] }, lg, 'ros', null)
  .every(a => String(a.pid) !== taxiStarter), 'moving an otherwise projected starter to taxi excludes him');
const fw = F.forecastWeeks(forecastLeague);
assert.equal(fw.ok, true, fw.reason);
assert.deepEqual(fw.remaining, [5,6,7,8,9,10,11,12,13,14]);
const finalOdds = F.championshipOdds(forecastLeague, { sims:64 });
assert(Math.abs(finalOdds.reduce((a,o) => a + o.playoff,0) - 6) < 1e-9);
assert(Math.abs(finalOdds.reduce((a,o) => a + o.bye,0) - 2) < 1e-9);
assert(Math.abs(finalOdds.reduce((a,o) => a + o.expWins,0) - 140) < 1e-9,
  'head-to-head and median each conserve one win per pair');
assert(finalOdds.every(o => o.expWins >= o.roster.wins + o.roster.ties / 2));
const noBye = F.championshipOdds({ ...forecastLeague, playoff_teams:4 }, { sims:16 });
assert.equal(noBye.reduce((a,o) => a+o.bye,0), 0);
assert.equal(F.forecastWeeks({ ...forecastLeague, divisions:2 }).ok, false, 'divisions without membership stay gated');
// Sleeper seeds division winners first: a one-team division always makes the field with a bye.
const divLeague = { ...forecastLeague, divisions:2, playoff_seed_type:1,
  rosters: forecastLeague.rosters.map((r, i) => ({ ...r, division: i < forecastLeague.rosters.length - 1 ? 1 : 2 })) };
assert.equal(F.forecastWeeks(divLeague).ok, true, F.forecastWeeks(divLeague).reason);
const lone = F.championshipOdds(divLeague, { sims:32 }).find(o => o.roster.division === 2);
assert.deepEqual([lone.playoff, lone.bye], [1, 1]);
assert.equal(F.forecastWeeks({ ...forecastLeague, last_scored_leg:3 }).ok, false);
const forecast = F.standingsForecast(forecastLeague, { sims:64 });
assert.equal(forecast.ok, true, forecast.reason);
for (const r of forecast.rows.values()) assert(Math.abs(r.expW+r.expL+r.expT-28) < 1e-9);
console.log('standings forecast invariants passed');

// Final-week seeding: preserve ties, apply higher PA, no false bye in a 2-team field.
const ended = { ...forecastLeague, id:'completed-fixture', playoff_teams:2, playoff_week_start:3,
  last_scored_leg:2, rosters:forecastLeague.rosters.slice(0,4).map((r,i) => ({...r,
    wins:1, losses:1, ties:2, fpts:100, fpts_against:100+i})) };
ctx.window.FANTASY_SCHEDULE.leagues[ended.id]={medianScoring:true,weeks:{}};
const completedForecast=F.standingsForecast(ended,{sims:8});
assert.equal(completedForecast.ok,true,completedForecast.reason);
assert.deepEqual([...completedForecast.rows].filter(([,r]) => r.playoff === 1).map(([id]) => id).sort(),[3,4]);
for(const r of completedForecast.rows.values()) assert.deepEqual([r.expW,r.expL,r.expT,r.bye],[1,1,2,null]);
console.log('completed ties and higher-PA seeding passed');
