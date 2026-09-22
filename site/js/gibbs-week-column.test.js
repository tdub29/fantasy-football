// The Gibbs X (rest-of-season) column shipped with a handler the comparator
// could never reach: `weekly-gibbs-x` was tested INSIDE weeklyValue but never
// listed in the `if` that routes to weeklyValue at all, so clicking the header
// sorted nothing and the code underneath was dead. It looked correct in the
// diff, it rendered correctly on screen, and only a click showed it.
//
// The weekly board column added beside it would have inherited the same hole,
// so both are asserted here: routed into the comparator, handled inside it,
// and defaulting to ascending because they are ranks and rank 1 belongs first.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

const gateStart = app.indexOf("if (filter.sort === 'weekly-vegas'");
assert(gateStart >= 0, 'weekly sort gate missing');
const gate = app.slice(gateStart, app.indexOf('const weeklyValue', gateStart));

for (const key of ['weekly-gibbs-x', 'weekly-gibbs-wk']) {
  assert.match(gate, new RegExp(`filter\\.sort === '${key}'`),
    `${key} must be routed into the weekly comparator, or its handler is dead code`);
  assert.match(app, new RegExp(`if \\(filter\\.sort === '${key}'\\) return gibbs\\w+Rank`),
    `${key} must resolve to a rank inside weeklyValue`);
}

// Ranks sort low-first on the first click. Without this a click puts his
// worst-ranked player on top, which reads as a broken column.
const dirStart = app.indexOf("|| key === 'weekly-ecr'");
assert(dirStart >= 0, 'default sort direction block missing');
const dirBlock = app.slice(dirStart, app.indexOf("? 'asc' : 'desc'", dirStart));
assert(dirBlock.length > 0, 'default sort direction block is empty');
assert.match(dirBlock, /key === 'weekly-gibbs-x'/, 'Gibbs ROS rank must default ascending');
assert.match(dirBlock, /key === 'weekly-gibbs-wk'/, 'Gibbs week rank must default ascending');

// One lookup, two boards. Two copies of this drifted apart is the thing the
// shared helper exists to prevent.
assert.match(app, /function gibbsBoardRank\(board, sleeperId\)/,
  'both boards must share one lookup');
assert.match(app, /const gibbsRosRank = \(id\) => gibbsBoardRank\('GIBBS_ROS', id\)/);
assert.match(app, /const gibbsWeekRank = \(id\) => gibbsBoardRank\('GIBBS_WEEK', id\)/);

// The board has to be loaded before any of the above can see it.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.match(html, /data\/gibbs-week\.js/, 'gibbs-week.js must be loaded by the page');

// Scoring is per position on his cards. A single hardcoded "half-PPR" label
// would be wrong for the QB board, which he publishes NON-PPR.
assert.match(app, /function gibbsScoringLabel\(data, pos\)/,
  'the scoring label must be read off the data, not hardcoded');
assert.doesNotMatch(
  app.slice(app.indexOf("sortHdr('weekly-gibbs-wk'"), app.indexOf("sortHdr('weekly-gibbs-wk'") + 700),
  /HALF-PPR/,
  'the week column header must not hardcode half-PPR: his QB card is non-PPR');

// And the built board must actually carry that distinction.
const wk = fs.readFileSync(path.join(__dirname, '..', 'data', 'gibbs-week.js'), 'utf8');
const data = JSON.parse(wk.slice(wk.indexOf('{'), wk.lastIndexOf('}') + 1));
assert.equal(data.board, 'week-3');
assert.equal(data.format, 'mixed', 'week 3 mixes non-PPR QB with half-PPR skill positions');
assert.equal(data.formatByPosition.QB, 'non_ppr');
assert.equal(data.formatByPosition.RB, 'half_ppr');
for (const [pos, rows] of Object.entries(data.positions)) {
  assert.equal(rows.length, 12, `${pos} card is a top-12`);
  assert.deepEqual(rows.map((r) => r.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    `${pos} ranks must be 1..12 with no hole`);
  assert(rows.every((r) => r.sleeperId), `${pos} must resolve every player to Sleeper`);
}

console.log('gibbs-week-column tests ok');
