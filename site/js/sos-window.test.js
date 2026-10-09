const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const start = app.indexOf('  function sosWindowWeeks');
const end = app.indexOf('  // Stats Lab', start);
assert(start >= 0 && end > start, 'SOS window helpers missing');
const { sosWindowWeeks, sosWindowRows, sosSortRows } = new Function(
  `${app.slice(start, end)}; return { sosWindowWeeks, sosWindowRows, sosSortRows };`)();

// Fixed grid, one position. Ranks: higher = easier opponent.
// AAA: W1 r1, W2 r2, W3 bye, W4 r30, W5 r32
// BBB: W1 r32, W2 r31, W3 r5, W4 r4, W5 bye
// CCC: W1 r10, W2 opponent with no rank, W3 r10, W4 bye, W5 r10
const g = (week, rank) => ({ week, opp: 'X', home: true, rank, fpa: rank == null ? null : 10 });
const grid = {
  AAA: [g(1, 1), g(2, 2), g(4, 30), g(5, 32)],
  BBB: [g(1, 32), g(2, 31), g(3, 5), g(4, 4)],
  CCC: [g(1, 10), g(2, null), g(3, 10), g(5, 10)],
};
const teams = ['AAA', 'BBB', 'CCC'];
const byes = { AAA:[3], BBB:[5], CCC:[4] };
const fixtureRows = (teams, weeks) => sosWindowRows(grid, teams, weeks, byes);
const byTeam = (rows) => Object.fromEntries(rows.map(r => [r.team, r]));
const playoff = { startWeek: 15, lastWeek: 17 };

// windows and labels
assert.deepEqual(sosWindowWeeks('full', 4, playoff).weeks.length, 18);
assert.equal(sosWindowWeeks('full', 4, playoff).label, 'W1-18');
const rem = sosWindowWeeks('remaining', 4, playoff);
assert.deepEqual(rem.weeks[0], 4);
assert.equal(rem.label, 'W4-18');
assert.equal(sosWindowWeeks('playoffs', 4, playoff).label, 'W15-17');
// differing playoff windows per league, clamped to W18
assert.equal(sosWindowWeeks('playoffs', 4, { startWeek: 14, lastWeek: 16 }).label, 'W14-16');
assert.equal(sosWindowWeeks('playoffs', 4, { startWeek: 16, lastWeek: 19 }).label, 'W16-18');
// week rollover: Remaining drops the week that just completed
assert.equal(sosWindowWeeks('remaining', 5, playoff).label, 'W5-18');
assert.equal(sosWindowWeeks('remaining', 18, playoff).label, 'W18');
assert.deepEqual(sosWindowWeeks('remaining', 19, playoff).weeks, []);
assert.equal(sosWindowWeeks('remaining', 19, playoff).label, 'no weeks');

// full: completed games count
let r = byTeam(fixtureRows(teams, [1, 2, 3, 4, 5]));
assert.equal(r.AAA.avg, (1 + 2 + 30 + 32) / 4);
assert.equal(r.AAA.byes, 1);
assert.equal(r.BBB.avg, (32 + 31 + 5 + 4) / 4);
// missing opponent rank: unavailable, not 0 and not a bye
assert.equal(r.CCC.avg, 10);
assert.equal(r.CCC.rated, 3);
assert.equal(r.CCC.unrated, 1);
assert.equal(r.CCC.byes, 1);
assert.deepEqual([r.BBB.rank, r.AAA.rank, r.CCC.rank], [1, 2, 3]);

// remaining from W4: W1-3 completed games excluded, rank and average change
r = byTeam(fixtureRows(teams, [4, 5]));
assert.equal(r.AAA.avg, 31);
assert.equal(r.BBB.avg, 4);
assert.equal(r.BBB.byes, 1);
assert.equal(r.CCC.avg, 10);
assert.deepEqual([r.AAA.rank, r.CCC.rank, r.BBB.rank], [1, 2, 3]);

// all-bye window: no average, no rank, still a row
r = byTeam(fixtureRows(teams, [3]));
assert.equal(r.AAA.avg, null);
assert.equal(r.AAA.rank, null);
assert.equal(r.AAA.byes, 1);
// window with only an unrated opponent: unavailable, not a bye
r = byTeam(fixtureRows(teams, [2]));
assert.equal(r.CCC.avg, null);
assert.equal(r.CCC.unrated, 1);
assert.equal(r.CCC.byes, 0);
// no games at all (season over)
r = fixtureRows(teams, []);
assert(r.every(x => x.avg == null && x.rank == null));
// team with no schedule is unavailable, not on bye
r = byTeam(fixtureRows([...teams, 'DDD'], [4, 5]));
assert.equal(r.DDD.noSchedule, true);
assert.equal(r.DDD.byes, 0);
assert.equal(r.DDD.avg, null);

// ties share a rank
r = byTeam(sosWindowRows({ A: [g(1, 10)], B: [g(1, 10)], C: [g(1, 5)] }, ['A', 'B', 'C'], [1]));
assert.deepEqual([r.A.rank, r.B.rank, r.C.rank], [1, 1, 3]);

// sorting: avg desc = easiest first, blanks last both directions; week sort
const rows = fixtureRows(teams, [4, 5]);
assert.deepEqual(sosSortRows(rows, { key: 'avg', dir: 'desc' }).map(x => x.team), ['AAA', 'CCC', 'BBB']);
assert.deepEqual(sosSortRows(rows, { key: 'avg', dir: 'asc' }).map(x => x.team), ['BBB', 'CCC', 'AAA']);
assert.deepEqual(sosSortRows(rows, { key: 5, dir: 'desc' }).map(x => x.team), ['AAA', 'CCC', 'BBB']);
assert.deepEqual(sosSortRows(rows, { key: 5, dir: 'asc' }).map(x => x.team), ['CCC', 'AAA', 'BBB']);
const blank = fixtureRows(teams, [3]);
assert.equal(sosSortRows(blank, { key: 'avg', dir: 'asc' }).at(-1).team, 'AAA');
assert.equal(sosSortRows(blank, { key: 'avg', dir: 'desc' }).at(-1).team, 'AAA');

// position filter: each position reads its own grid
const multi = { RB: { AAA: [g(1, 3)] }, WR: { AAA: [g(1, 29)] } };
assert.equal(sosWindowRows(multi.RB, ['AAA'], [1])[0].avg, 3);
assert.equal(sosWindowRows(multi.WR, ['AAA'], [1])[0].avg, 29);

// A missing week is unavailable unless the complete schedule proves a bye.
const partial = sosWindowRows({ A:[g(1,10)] }, ['A'], [1,2]);
assert.equal(partial[0].byes, 0);
assert.equal(partial[0].unrated, 1);
assert.equal(partial[0].avg, 10);
console.log('sos-window.test.js: all assertions passed');
