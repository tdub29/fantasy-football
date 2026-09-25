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
// Every rank is PPR. The only header mark is the asterisk on a column this
// site converted from half-PPR data, and it has to say so where a user hovers.
assert.match(app, /sortHdr\('weekly-gibbs-x', 'Gibbs\*'[\s\S]{0,120}converted by this site from Jacob Gibbs's half-PPR/);
assert.match(app, /if \(filter\.sort === 'weekly-gibbs-x'\) return gibbsRosPprRank/,
  'ROS* must sort on the converted ranks it shows');
// The view names the period, so the header does not: plain 'Gibbs'.
assert.match(app, /sortHdr\('weekly-gibbs-wk', 'Gibbs',/, 'week header carries no scoring or period tag');
assert.doesNotMatch(app, /'Gibbs Wk'|'Gibbs ROS\*'|'FP ROS'/, 'no header repeats the view name');
assert.doesNotMatch(app, /\(half\)|Gibbs ROS PPR\*|Gibbs Wk PPR\*|GIBBS_PPR_WEEK/,
  'no half column, no second PPR column');

// One lookup, two boards. Two copies of this drifted apart is the thing the
// shared helper exists to prevent.
assert.match(app, /function gibbsBoardRank\(board, sleeperId\)/,
  'both boards must share one lookup');
assert.match(app, /const gibbsRosPprRank = \(id\) => gibbsBoardRank\('GIBBS_PPR_ROS', id\)/);
assert.match(app, /const gibbsWeekRank = \(id\) => gibbsBoardRank\('GIBBS_WEEK', id\)/);

// The board has to be loaded before any of the above can see it.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.match(html, /data\/gibbs-week\.js/, 'gibbs-week.js must be loaded by the page');

// And the built board must actually carry that distinction.
const wk = fs.readFileSync(path.join(__dirname, '..', 'data', 'gibbs-week.js'), 'utf8');
const data = JSON.parse(wk.slice(wk.indexOf('{'), wk.lastIndexOf('}') + 1));
assert.equal(data.board, 'week');
// Last week's board must never sit beside this week's numbers: the payload
// names its week and the column hides when that is not the site's week.
assert(Number.isInteger(data.week), 'week board must carry its week number');
assert.match(app, /window\.GIBBS_WEEK\.week === currentWeek/, 'stale week board must hide');

// RB, WR and TE come from his FantasyPros week board, the board he posts to X
// titled PPR ("Week 3 - FLEX Top-100 ... (PPR)", 2026-09-24, 94/100 exact).
// His title is the label. The CBS page it replaced sat a mean 11 flex spots
// off that post, which is why it went.
for (const pos of ['QB', 'RB', 'WR', 'TE']) {
  assert.equal(data.formatByPosition[pos], 'ppr', `${pos} is the board he titles PPR`);
}
assert.match(data.provenance, /FantasyPros/);
assert.match(data.provenance, /filters=1576:1576/);
assert.match(data.provenance, /total_experts=1/, 'must say it refused consensus');
assert.match(data.scoringWarning, /QB, RB, TE, WR are his FULL PPR ranks/);
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
// His flex list is shallower than the three positional lists together, so the
// top of each carries it and nothing below the flex depth does.
const flex = ['RB', 'WR', 'TE'].flatMap((pos) => data.positions[pos])
  .map((r) => r.flexRank).filter(Number.isInteger).sort((a, b) => a - b);
assert(flex.length >= 100, `flex rank should cover his top 100+, got ${flex.length}`);
assert.deepEqual(flex.slice(0, 100), Array.from({ length: 100 }, (_, i) => i + 1),
  'flex ranks 1..100 must each appear exactly once');
assert.equal(data.teamMismatches.length, 0, 'every printed team should match Sleeper');

console.log('gibbs-week-column tests ok');
