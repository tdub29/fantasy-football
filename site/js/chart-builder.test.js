// Stats Lab chart builder and field maps: the pure math every chart leans on.
// Ticks must cover the data on round steps, the trend line must be least
// squares, labels must never overlap, and a location grid must sum the way
// build_location_splits.py wrote it.
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const start = app.indexOf('  // ---- chart math');
const end = app.indexOf('  // ---- end chart math', start);
assert(start >= 0 && end > start, 'chart math block missing');
const lib = new Function(`${app.slice(start, end)}; return { chartTicks, chartFit, chartLabels, chartPct, locSum, locCell, locValue };`)();
const { chartTicks, chartFit, chartLabels, chartPct, locSum, locCell, locValue } = lib;

// Ticks: round steps whose ends cover the data.
assert.deepEqual(chartTicks(-0.62, 0.58), [-1, -0.5, 0, 0.5, 1]);
assert.deepEqual(chartTicks(0, 0.44), [0, 0.2, 0.4, 0.6]);
assert.deepEqual(chartTicks(0, 0.38), [0, 0.1, 0.2, 0.3, 0.4]);
assert.deepEqual(chartTicks(3, 97), [0, 25, 50, 75, 100]);
for (const [lo, hi] of [[0.013, 0.271], [-25.4, 13.1], [1, 1], [0, 1e-9 + 0.3]]) {
  const t = chartTicks(lo, hi);
  assert.ok(t.length >= 2 && t[0] <= lo && t[t.length - 1] >= hi, `ticks cover ${lo}..${hi}: ${t}`);
  const step = t[1] - t[0];
  assert.ok(t.every((v, i) => !i || Math.abs(v - t[i - 1] - step) < 1e-9), `even steps: ${t}`);
  assert.ok(t.every(v => String(v).length < 12), `no float noise: ${t}`);
}
assert.deepEqual(chartTicks(NaN, 1), []);

// Least squares: an exact line comes back exactly, r follows the sign.
const fit = chartFit([{ x:0, y:1 }, { x:1, y:3 }, { x:2, y:5 }, { x:3, y:7 }]);
assert.ok(Math.abs(fit.m - 2) < 1e-12 && Math.abs(fit.b - 1) < 1e-12 && Math.abs(fit.r - 1) < 1e-12);
assert.ok(chartFit([{ x:0, y:3 }, { x:1, y:2 }, { x:2, y:0 }]).r < -0.9);
assert.equal(chartFit([{ x:1, y:1 }, { x:1, y:2 }, { x:1, y:3 }]), null, 'no x spread, no line');
assert.equal(chartFit([{ x:1, y:1 }, { x:2, y:2 }]), null, 'two points is not a trend');

// Labels: none overlap, none leave the box, a crowded one flips left or drops.
const box = { x0:0, x1:300, y0:0, y1:200 };
const placed = chartLabels([
  { x:100, y:100, text:'J. Chase CIN' }, { x:104, y:102, text:'T. Higgins CIN' },
  { x:290, y:50, text:'J. Jefferson MIN' }, { x:100, y:101, text:'Dup' },
], box);
const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
for (const [i, a] of placed.entries()) {
  assert.ok(a.r.x0 >= box.x0 && a.r.x1 <= box.x1 && a.r.y0 >= box.y0 && a.r.y1 <= box.y1, `${a.text} inside`);
  for (const b of placed.slice(i + 1)) assert.ok(!hit(a.r, b.r), `${a.text} overlaps ${b.text}`);
}
assert.equal(placed[0].text, 'J. Chase CIN', 'first candidate always wins its spot');
assert.equal(placed.find(p => p.text === 'J. Jefferson MIN').anchor, 'end', 'a label at the right edge flips left');
assert.ok(placed.length < 4, 'the fourth label has nowhere to go');

// Percentile: share below plus half the ties.
assert.equal(chartPct([1, 2, 3, 4], 4), 88);
assert.equal(chartPct([1, 2, 3, 4], 1), 13);
assert.equal(chartPct([5, 5, 5, 5], 5), 50);
assert.equal(chartPct([], 3), null);

// Location grids: seasons add cell by cell; Q/R cells are [n, cmp, yds, epa,
// ftn, catch], U cells [n, yds, epa, succ], EPA in hundredths.
const q = (cells) => { const a = new Array(14 * 6).fill(0); for (const [i, v] of Object.entries(cells)) a.splice(i * 6, 6, ...v); return a; };
const L1 = { players:{ 7:{ p:'QB', Q:q({ 0:[10, 7, 60, 50, 8, 6], 11:[4, 1, 45, -80, 4, 2], 13:[2, 0, 0, -150, 2, 0] }) } } };
const L2 = { players:{ 7:{ p:'QB', Q:q({ 0:[5, 4, 30, 25, 0, 0] }) }, 9:{ p:'QB' } } };
const a = locSum([L1, L2], '7', 'Q');
assert.deepEqual(a.slice(0, 6), [15, 11, 90, 75, 8, 6]);
assert.equal(L1.players[7].Q[0], 10, 'summing never mutates the payload');
assert.equal(locSum([L2], '9', 'Q'), null);
const grid = locCell(a, 'Q', [...Array(12).keys()]);
assert.deepEqual([grid.n, grid.cmp, grid.yds, grid.epa, grid.ftn, grid.catch], [19, 12, 135, -5, 12, 8]);
assert.equal(locValue(grid, 'ypa'), 135 / 19);
assert.equal(locValue(grid, 'epa'), -0.05 / 19);
assert.equal(locValue(grid, 'catch'), 8 / 12, 'catchable divides by FTN-charted plays only');
assert.equal(locValue(locCell(a, 'Q', [5]), 'cmp'), null, 'an empty cell has no rate');
assert.equal(locValue(locCell(a, 'Q', [5]), 'att'), 0);
const u = [3, 12, 30, 2, ...new Array(7 * 4).fill(0)];
const run = locCell(u, 'U', [0]);
assert.deepEqual([run.n, run.yds, run.epa, run.succ], [3, 12, 30, 2]);
assert.equal(locValue(run, 'succ'), 2 / 3);

console.log('chart-builder tests passed');
