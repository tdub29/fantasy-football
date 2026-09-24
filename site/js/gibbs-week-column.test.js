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

for (const key of ['weekly-gibbs-x', 'weekly-gibbs-wk', 'weekly-gibbs-wk-ppr', 'weekly-gibbs-ros-ppr']) {
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
assert.match(dirBlock, /key === 'weekly-gibbs-wk-ppr'/, 'derived PPR week rank must default ascending');
assert.match(dirBlock, /key === 'weekly-gibbs-ros-ppr'/, 'derived PPR ROS rank must default ascending');
// The derived columns must say they are derived, in the header a user hovers.
assert.match(app, /sortHdr\('weekly-gibbs-wk-ppr', 'Gibbs Wk PPR\*'[\s\S]{0,200}DERIVED by this site, not published by him/);

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
assert.equal(data.board, 'week');

// RB, WR and TE come from his CBS board. CBS files it under PPR but its order
// is his HALF-PPR board (checked 2026-09-24 against his FantasyPros half and
// PPR boards), so it must be labelled half-PPR. Calling it PPR is exactly the
// mislabel that made a half-PPR opinion read as a full-PPR one.
for (const pos of ['RB', 'WR', 'TE']) {
  assert.equal(data.formatByPosition[pos], 'half_ppr', `${pos} is his half-PPR order`);
  assert.match(data.sourceByPosition[pos], /CBS/, `${pos} must come from CBS`);
}
// QB is the exception and has to stay labelled as one: CBS has no per-position
// page for him, so those ranks are still the NON-PPR X card.
assert.equal(data.formatByPosition.QB, 'non_ppr');
assert.equal(data.format, 'mixed', 'PPR skill positions beside a non-PPR QB card');

// The caveat must be position-accurate. A blanket "not a full-PPR board" is
// now false for three quarters of the rows, and a caveat that is usually
// wrong gets ignored on the one position where it matters.
assert.match(data.scoringWarning, /HALF-PPR/);
assert.match(data.scoringWarning, /QB is NON-PPR/);
assert.doesNotMatch(data.scoringWarning, /not a full-PPR board/);

const depth = Object.values(data.positions).reduce((n, r) => n + r.length, 0);
assert(depth >= 100, `board should be deep, got ${depth} players`);
for (const [pos, rows] of Object.entries(data.positions)) {
  assert.deepEqual(rows.map((r) => r.rank), rows.map((_, i) => i + 1),
    `${pos} ranks must be 1..n with no hole`);
  assert(rows.every((r) => r.sleeperId), `${pos} must resolve every player to Sleeper`);
}
// The flex rank is what this source adds over a per-position card: it is the
// only way to compare an RB against a WR for one flex slot.
for (const pos of ['RB', 'WR', 'TE']) {
  assert(data.positions[pos].every((r) => Number.isInteger(r.flexRank)),
    `${pos} rows must carry the overall flex rank`);
}
assert.equal(data.teamMismatches.length, 0, 'every printed team should match Sleeper');

console.log('gibbs-week-column tests ok');
