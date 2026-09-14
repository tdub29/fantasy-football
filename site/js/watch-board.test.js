// What to Look For board. The whole point of the page is that the ORDER is by
// dollars and not by points, and a sort that quietly fell back to raw points
// would still render a plausible-looking board, so the buy-in weighting gets a
// synthetic case where the two orders disagree.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const root = `${__dirname}/..`;
const ctx = { window: {} };
for (const f of ['leagues.js', 'weekly-rankings.js', 'players.js']) {
  vm.runInNewContext(fs.readFileSync(`${root}/data/${f}`, 'utf8'), ctx);
}
const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const cut = (a, b) => {
  const i = app.indexOf(a), j = app.indexOf(b, i);
  assert(i >= 0 && j > i, `slice failed: ${a}`);
  return app.slice(i, j);
};
const H = new Function('window',
  `${cut('  const LEAGUE_SWATCHES', '  function viewWatch()')}
   return { watchBoard, weeklyProjFor, leagueSwatch };`
)(ctx.window);

// --- Data contract: the board is worthless if the build stopped emitting either field ---
const mine = ctx.window.LEAGUES.filter(lg => lg.rosters.some(r => r.is_me));
assert(mine.length >= 4, `expected my leagues in leagues.js, got ${mine.length}`);
for (const lg of mine) {
  assert(Number(lg.buy_in) > 0, `${lg.short_name} has no buy_in`);
  const me = lg.rosters.find(r => r.is_me);
  assert(me.opponent_roster_id != null, `${lg.short_name} has no opponent for week ${lg.week}`);
  assert(lg.rosters.some(r => r.roster_id === me.opponent_roster_id),
    `${lg.short_name} opponent ${me.opponent_roster_id} is not a roster in the league`);
}

const board = H.watchBoard();

// --- Panels partition the field: nobody is in two panels, nobody is dropped.
// unpriced is the fourth bucket, not a leak: a kicker with no weekly projection
// is deliberately held out of the ranked panels but still has to be accounted
// for, or a projection feed that quietly went empty would look like a clean board.
const ids = [...board.rooting, ...board.hating, ...board.split, ...board.unpriced].map(r => r.pid);
assert.equal(new Set(ids).size, ids.length, 'a player appears in more than one panel');
const expected = new Set();
for (const lg of mine) {
  const me = lg.rosters.find(r => r.is_me);
  const opp = lg.rosters.find(r => r.roster_id === me.opponent_roster_id);
  for (const pid of me.starters.concat(opp ? opp.starters : [])) {
    if (pid && pid !== '0') expected.add(String(pid));
  }
}
assert.equal(ids.length, expected.size, `board has ${ids.length} players, starters total ${expected.size}`);
for (const r of board.unpriced) {
  assert.equal(r.gross, 0, `${r.pid} is held out as unpriced but carries ${r.gross}`);
}
for (const r of [...board.rooting, ...board.hating, ...board.split]) {
  assert(r.gross > 0, `${r.pid} scores 0 and belongs in unpriced, not a ranked panel`);
}

// --- Sign discipline: rooting is never negative, hate-watching is never positive ---
for (const r of board.rooting) {
  assert(r.index >= 0, `${r.pid} is in Rooting with index ${r.index}`);
  assert(r.entries.every(e => e.side > 0), `${r.pid} is in Rooting with an opposing entry`);
}
for (const r of board.hating) {
  assert(r.index <= 0, `${r.pid} is in Hate watching with index ${r.index}`);
  assert(r.entries.every(e => e.side < 0), `${r.pid} is in Hate watching with an entry on my side`);
}
for (const r of board.split) {
  assert(r.entries.some(e => e.side > 0) && r.entries.some(e => e.side < 0),
    `${r.pid} is in the split panel with only one side`);
  assert(r.gross >= Math.abs(r.index) - 1e-9, `${r.pid} gross ${r.gross} < |net| ${r.index}`);
}

// --- Sorted descending, each by its own panel's measure ---
const desc = (arr, of, label) => arr.forEach((r, i) => {
  if (i) assert(of(arr[i - 1]) >= of(r) - 1e-9, `${label} is out of order at row ${i + 1}`);
});
desc(board.rooting, r => r.index, 'Rooting');
desc(board.hating, r => -r.index, 'Hate watching');
desc(board.split, r => r.gross, 'Good and bad');

// --- The load-bearing claim: buy-in beats raw points ---
// Cheap league, big projection against a rich league, small projection. Points
// alone would rank the cheap one first; the board must not.
const fake = {
  LEAGUES: [
    { id: 'rich', short_name: 'Rich', buy_in: 150, week: 1, rosters: [
      { roster_id: 1, is_me: true, opponent_roster_id: 2, starters: ['smallProj'] },
      { roster_id: 2, is_me: false, starters: ['villain'] },
    ] },
    { id: 'cheap', short_name: 'Cheap', buy_in: 30, week: 1, rosters: [
      { roster_id: 1, is_me: true, opponent_roster_id: 2, starters: ['bigProj'] },
      { roster_id: 2, is_me: false, starters: ['villain'] },
    ] },
  ],
  WEEKLY_RANKINGS: { currentWeek: 1, players: [
    { id: 'smallProj', vegas: 12 },
    { id: 'bigProj',   vegas: 24 },
    { id: 'villain',   vegas: 20 },
  ] },
};
const H2 = new Function('window',
  `${cut('  const LEAGUE_SWATCHES', '  function viewWatch()')}
   return { watchBoard };`
)(fake);
const b2 = H2.watchBoard();
assert.deepEqual(b2.rooting.map(r => r.pid), ['smallProj', 'bigProj'],
  'half the points in a 5x league must still outrank the cheap league');
assert.equal(b2.rooting[0].index, 150 * 12 / 100);
assert.equal(b2.rooting[1].index, 30 * 24 / 100);
// The villain starts against me in BOTH leagues, so he is pure hate-watching
// and his index stacks across leagues rather than resolving to one of them.
assert.deepEqual(b2.hating.map(r => r.pid), ['villain']);
assert.equal(b2.unpriced.length, 0);
assert.equal(b2.hating[0].index, -(150 * 20 / 100) - (30 * 20 / 100));
assert.equal(b2.split.length, 0);
assert.equal(b2.atStake, 180);

// --- Split classification: same player, both sides, net is the difference ---
fake.LEAGUES[1].rosters[0].starters = ['villain'];
fake.LEAGUES[1].rosters[1].starters = ['bigProj'];
const b3 = new Function('window',
  `${cut('  const LEAGUE_SWATCHES', '  function viewWatch()')}
   return watchBoard;`
)(fake)();
const villain = b3.split.find(r => r.pid === 'villain');
assert(villain, 'villain starts on both sides now and belongs in the split panel');
assert.equal(villain.index, -(150 * 20 / 100) + (30 * 20 / 100)); // -30 + 6
assert.equal(villain.gross, (150 * 20 / 100) + (30 * 20 / 100));  // 30 + 6

// --- Projection fallback: Vegas wins, Sleeper model covers the rest, 0 is the floor ---
const probe = new Function('window',
  `${cut('  const LEAGUE_SWATCHES', '  function viewWatch()')}
   return weeklyProjFor;`
)({ WEEKLY_RANKINGS: { currentWeek: 3, players: [
  { id: 'a', vegas: 11, sleeper: [1, 2, 3] },
  { id: 'b', sleeper: [1, 2, 3] },
  { id: 'c', sleeper: [] },
] } });
assert.deepEqual(probe('a', 3), { pts: 11, source: 'vegas' });
assert.deepEqual(probe('b', 3), { pts: 3, source: 'sleeper' });
assert.deepEqual(probe('c', 3), { pts: 0, source: null });
assert.deepEqual(probe('nobody', 3), { pts: 0, source: null });

// --- A starter with no projection anywhere is held out, not ranked at zero ---
fake.LEAGUES[1].rosters[0].starters = ['kicker'];
fake.LEAGUES[1].rosters[1].starters = ['bigProj'];
const b4 = new Function('window',
  `${cut('  const LEAGUE_SWATCHES', '  function viewWatch()')}
   return watchBoard;`
)(fake)();
assert.deepEqual(b4.unpriced.map(r => r.pid), ['kicker']);
assert(!b4.rooting.some(r => r.pid === 'kicker'), 'kicker leaked into a ranked panel');

console.log(`watch-board.test.js OK  week ${board.week}, ${board.leagues.length} leagues, `
  + `$${board.atStake} live, ${board.rooting.length} rooting / ${board.split.length} split / `
  + `${board.hating.length} hating / ${board.unpriced.length} unpriced`);
