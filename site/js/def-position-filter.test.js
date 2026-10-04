// Team defense on a league's Players table. Washington (ESPN, starts a D/ST)
// had no DST button off the Weekly view and labelled it DEF where it did show.
// The button follows the league's own lineup slots, takes the DST alias, and
// defenses never leak into ALL or into the dynasty-asset Stats view.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const root = `${__dirname}/..`;
const ctx = { window: {} };
for (const f of ['leagues.js', 'weekly-rankings.js'])
  vm.runInNewContext(fs.readFileSync(`${root}/data/${f}`, 'utf8'), ctx);
const W = ctx.window;

const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const slice = (a, b) => {
  const i = app.indexOf(a), j = app.indexOf(b, i);
  assert(i >= 0 && j > i, `slice not found: ${a}`);
  return app.slice(i, j);
};
const h = (tag, attrs, ...kids) => ({ tag, attrs: attrs || {}, kids: kids.flat() });
const T = new Function('h', [
  slice('const IDP_POSITIONS', '  function leagueFitsPos'),
  slice('function posChip(pos)', '  // KeepTradeCut'),
  slice('function offenseStartingSlots(league)', '  // Sleeper\'s `players` array'),
  slice('function leaguePlayerPosOptions(', '  function renderLeaguePlayers'),
].join('\n') + '\nreturn { posChip, leaguePlayerPosOptions, leaguePlayerRowFits };')(h);

const WASHINGTON = W.LEAGUES.find(l => l.platform === 'espn' && /Washington/.test(l.name));
const TACO = W.LEAGUES.find(l => l.id === '1341184676601028608');
const YUH = W.LEAGUES.find(l => l.id === '1312276370583220224');
assert(WASHINGTON && WASHINGTON.roster_positions.includes('DEF'), 'Washington missing or starts no defense');
assert(TACO && !TACO.roster_positions.some(s => s === 'DEF' || s === 'DST'), 'Password is taco now starts a defense');

// 1. Washington offers DST wherever its rows carry defenses, nowhere else.
for (const view of ['weekly', 'sleeper-weeks'])
  assert(T.leaguePlayerPosOptions(WASHINGTON, view).includes('DEF'), `no DST on ${view}`);
for (const view of ['stats', 'ros', 'sos'])
  assert(!T.leaguePlayerPosOptions(WASHINGTON, view).includes('DEF'), `DST on ${view}`);
// K stays on its Weekly board only.
assert(T.leaguePlayerPosOptions(WASHINGTON, 'weekly').includes('K'));
assert(!T.leaguePlayerPosOptions(WASHINGTON, 'sleeper-weeks').includes('K'));

// 2. A league with no defense slot never gets the button; a DST-named slot does.
for (const view of ['weekly', 'sleeper-weeks', 'stats'])
  assert(!T.leaguePlayerPosOptions(TACO, view).includes('DEF'), `Password is taco got DST on ${view}`);
const dstNamed = { ...TACO, roster_positions: [...TACO.roster_positions, 'DST'] };
assert(T.leaguePlayerPosOptions(dstNamed, 'weekly').includes('DEF'), 'DST slot alias ignored');

// 3. Rows: real Sleeper defense rows fill the DST board, and only it.
const defs = W.WEEKLY_RANKINGS.players.filter(p => p.pos === 'DEF');
assert(defs.length >= 30, `only ${defs.length} defense rows in weekly data`);
const wk = W.WEEKLY_RANKINGS.currentWeek;
assert(defs.filter(p => p.sleeper?.[wk - 1] != null).length >= 25, 'defense rows lack week projections');
const opts = T.leaguePlayerPosOptions(WASHINGTON, 'weekly');
const fits = (filterPos, pos, lg = WASHINGTON, o = opts) => T.leaguePlayerRowFits(lg, o, filterPos, pos);
for (const pos of ['DEF', 'DST']) {
  assert.equal(fits('DEF', pos), true, `${pos} row missing from DST board`);
  assert.equal(fits('ALL', pos), false, `${pos} row leaked into ALL`);
  assert.equal(fits('DEF', pos, WASHINGTON, T.leaguePlayerPosOptions(WASHINGTON, 'stats')), false,
    `${pos} row on the dynasty-asset Stats view`);
  assert.equal(fits('DEF', pos, TACO, T.leaguePlayerPosOptions(TACO, 'weekly')), false,
    `${pos} row in a league with no defense slot`);
}
assert.equal(fits('DEF', 'WR'), false, 'offense row on the DST board');
assert.equal(fits('FLEX', 'TE'), true);
assert.equal(fits('FLEX', 'QB'), false);
assert.equal(fits('ALL', 'P'), false);

// 4. IDP stays separate from team defense.
assert.equal(fits('ALL', 'LB'), false, 'LB in a non-IDP league');
assert.equal(fits('ALL', 'LB', YUH, T.leaguePlayerPosOptions(YUH, 'stats')), true, 'yuH lost its LBs');
assert(!T.leaguePlayerPosOptions(YUH, 'weekly').includes('DEF'), 'yuH starts no team defense');

// 5. The user sees DST for either alias, in the DEF colour.
for (const pos of ['DEF', 'DST']) {
  const chip = T.posChip(pos);
  assert.equal(chip.kids[0], 'DST');
  assert.equal(chip.attrs.class, 'pos-chip DEF');
}
assert.equal(T.posChip('WR').kids[0], 'WR');

console.log('def-position-filter: ok');
