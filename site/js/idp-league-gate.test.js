// IDP positions only exist in IDP leagues. The League (superflex, no IDP slots)
// used to list LB Carson Schwesinger and DL Maxx Crosby as Cornerstone-A buys, and
// Jack Campbell's card offered a Target button in every league, a VOR priced in
// Password is taco and a Week 3 projection of 0.5 off the offense PPR feed. Each
// of those surfaces now routes through leagueFitsPos / contextLeagueFor.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const root = `${__dirname}/..`;
const ctx = { window: {} };
for (const f of ['players.js', 'leagues.js', 'projections.js', 'weekly-rankings.js', 'strategy.js'])
  vm.runInNewContext(fs.readFileSync(`${root}/data/${f}`, 'utf8'), ctx);
const W = ctx.window;

const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const slice = (a, b) => {
  const i = app.indexOf(a), j = app.indexOf(b, i);
  assert(i >= 0 && j > i, `slice not found: ${a}`);
  return app.slice(i, j);
};

// Minimal DOM stand-ins: h() builds a plain tree the assertions can walk.
const h = (tag, attrs, ...kids) => ({ tag, attrs: attrs || {}, kids: kids.flat() });
const fmt = { decimal: (v, d) => Number(v).toFixed(d) };
const T = new Function('window', 'h', 'fmt', [
  'const SIM = { gamesPlayed: 17 };',
  'const weeklyMatchupFor = () => null, teamSos = () => null;',
  'const norm = (s) => String(s || "").toLowerCase();',
  'let RANKED = []; const rankIndex = () => ({ all: RANKED });',
  slice('function isDynastyLeague(lg)', '  // Colored VOR chip.'),
  slice('let _projByPidIdx = null;', '  // PP vs Sleeper POSITIONAL RANK difference'),
  slice('function targetStartersByPos(league)', '  // Is this player startable league-wide'),
  slice('function leagueScorePoints(stats, league)', '  // Fill the legal best lineup'),
  slice('function projPosGroup(pos)', '  function optimalOffense'),
  slice('function suggestBuysSells(', '  // Walk window.STRATEGY.coaching_tips'),
  slice('function markKindFor(', '  // The toggle itself'),
  slice('function thisWeekBlock(', '  function historyBlock('),
  slice('function vorForSleeper(', '  // Every figure here was already computed'),
].join('\n') + `
return { setRanked: (r) => { RANKED = r; }, isIdpPos, leagueFitsPos, contextLeagueFor, primaryLeague,
  suggestBuysSells, markKindFor, thisWeekBlock, vorForSleeper, vorForPlayer };`)(W, h, fmt);

const byId = (id) => W.LEAGUES.find(l => l.id === id);
const THE_LEAGUE = byId('1314860638501076992');
const YUH = byId('1312276370583220224');
assert(THE_LEAGUE && !THE_LEAGUE.is_idp, 'The League missing or flagged IDP');
assert(YUH && YUH.is_idp, 'yuH missing or not flagged IDP');
const CAMPBELL = '10880', GIBBS = '9221', SCHWESINGER = '12578', CROSBY = '5991';

// 1. The shared predicate covers the base IDP groups and every Sleeper alias.
for (const pos of ['LB', 'DL', 'DB', 'DE', 'DT', 'NT', 'CB', 'S', 'lb'])
  assert.equal(T.isIdpPos(pos), true, `${pos} should be IDP`);
for (const pos of ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', '', null])
  assert.equal(T.isIdpPos(pos), false, `${pos} should not be IDP`);
// Every defensive position in the player dump is caught, so no alias slips past.
const offense = new Set(['QB', 'RB', 'WR', 'TE', 'FB', 'K', 'DEF']);
for (const p of Object.values(W.PLAYERS))
  if (p.pos && !offense.has(p.pos)) assert.equal(T.isIdpPos(p.pos), true, `unhandled position ${p.pos}`);

// 2. Buys and sells: no defender in The League, defenders still offered in yuH.
const ranked = (name, pos, pid, extra) => ({ name, pos, _sleeperId: pid, category: 'cornerstone', tier: 'A', ...extra });
T.setRanked([
  ranked('Carson Schwesinger', 'LB', SCHWESINGER),
  ranked('Maxx Crosby', 'DL', CROSBY),
  ranked('Jahmyr Gibbs', 'RB', GIBBS),
  ranked('Rookie Safety', 'DB', 'x1', { category: 'upside_premier', tier: 'S', rookie: true }),
]);
const lbOnRoster = [{ pid: CAMPBELL, sleeper: { name: 'Jack Campbell', age: 34 },
  ranked: { name: 'Jack Campbell', pos: 'LB', subtype: 'depreciating_pillar', category: 'mainstay' } }];
const tl = T.suggestBuysSells(lbOnRoster, THE_LEAGUE);
const tlBuys = tl.buys.map(b => `${b.player.pos} ${b.player.name}`);
assert.deepEqual(tl.buys.filter(b => T.isIdpPos(b.player.pos)), [], `IDP buys in The League: ${tlBuys}`);
assert(tlBuys.includes('RB Jahmyr Gibbs'), `offensive buy dropped from The League: ${tlBuys}`);
assert.deepEqual(tl.sells, [], 'an IDP sell was offered in The League');
const yuh = T.suggestBuysSells(lbOnRoster, YUH);
const yuhBuys = yuh.buys.map(b => `${b.player.pos} ${b.player.name}`);
for (const want of ['LB Carson Schwesinger', 'DL Maxx Crosby', 'DB Rookie Safety', 'RB Jahmyr Gibbs'])
  assert(yuhBuys.includes(want), `yuH lost buy ${want}: ${yuhBuys}`);
assert.equal(yuh.sells.length, 1, 'yuH should still price an IDP sell');

// 3. Target / Trade block: Campbell only in yuH, Gibbs in every league I play in.
const myLeagues = W.LEAGUES.filter(l => l.rosters.some(r => r.is_me));
for (const lg of myLeagues) {
  const k = T.markKindFor(lg.id, CAMPBELL);
  if (lg.is_idp) assert(k === 'target' || k === 'block', `no mark button for Campbell in ${lg.name}`);
  else assert.equal(k, null, `Campbell got a ${k} button in ${lg.name}`);
  assert.notEqual(T.markKindFor(lg.id, GIBBS), null, `Gibbs lost his mark button in ${lg.name}`);
}

// 4. VOR: a defender is priced in yuH, an offensive player where he always was.
const primary = T.primaryLeague();
const vC = T.vorForSleeper(W.PLAYERS[CAMPBELL]);
assert(vC && vC.league.id === YUH.id, `Campbell VOR league ${vC && vC.league.name}`);
assert(vC.v > 0, `Campbell, an LB1, should beat LB replacement in yuH, got ${vC.v}`);
const vG = T.vorForSleeper(W.PLAYERS[GIBBS]);
const gRec = W.OFFENSE_PROJ.offense.players.find(p => p.id === GIBBS);
assert(vG && vG.league.id === primary.id, 'Gibbs VOR moved off the primary league');
assert.equal(vG.v, T.vorForPlayer(gRec, primary, 'offense', W.OFFENSE_PROJ.offense.default));

// 5. Card week band: Campbell's week is yuH-scored per game, Gibbs keeps the feed.
const cellValue = (tree, label) => {
  let hit = null;
  const walk = (n) => {
    if (!n || typeof n !== 'object' || hit) return;
    if (n.attrs && n.attrs.class === 'tw-cell' && n.kids[1] && n.kids[1].kids[0] === label) hit = n.kids[0].kids[0];
    (n.kids || []).forEach(walk);
  };
  walk(tree);
  return hit;
};
const week = W.WEEKLY_RANKINGS.currentWeek;
const cRow = W.WEEKLY_RANKINGS.players.find(p => p.id === CAMPBELL);
assert(cRow && cRow.sleeper[week - 1] != null, 'fixture: Campbell needs a feed value this week');
const cWeek = Number(cellValue(T.thisWeekBlock(W.PLAYERS[CAMPBELL]), 'projected'));
assert(cWeek > 5, `Campbell week ${week} projection ${cWeek}, expected yuH-scored LB1 points, not the offense feed`);
const gRow = W.WEEKLY_RANKINGS.players.find(p => p.id === GIBBS);
const gWant = gRow.vegas != null ? gRow.vegas : gRow.sleeper[week - 1];
assert.equal(cellValue(T.thisWeekBlock(W.PLAYERS[GIBBS]), 'projected'), fmt.decimal(gWant, 1), 'Gibbs week band changed');

console.log(`idp-league-gate.test.js: all assertions passed (Campbell wk${week} ${cWeek.toFixed(1)}, VOR +${vC.v} in yuH)`);
