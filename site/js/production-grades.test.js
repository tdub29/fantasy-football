// Production grades on the prospect card: a percentile against drafted players at the position
// since 2010, a letter from bands in code, and the sample size, for the metrics public play-by-play
// computes. A metric with no value or no public source gets no grade at all, never a zero.
// Run from the repo root: node site/js/production-grades.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
global.window = {};
for (const f of ['prospect-model.js', 'production-grades.js']) require(path.join(__dirname, '..', 'data', f));
const M = window.PROSPECT_MODEL, G = window.PRODUCTION_GRADES;
assert(M && G, 'prospect-model.js or production-grades.js missing');

const start = app.indexOf('  // College prospect model (window.PROSPECT_MODEL)');
const end = app.indexOf('  // weather.js keys teams by nflverse code', start);
assert(start >= 0 && end > start, 'prospect model block missing');
const h = (tag, attrs, ...kids) => ({ tag, attrs: attrs || {}, kids: kids.flat(Infinity).filter(k => k != null && k !== false) });
const text = (n) => n == null ? '' : typeof n !== 'object' ? String(n) : n.kids.map(text).join(' ');
const find = (n, pred, out = []) => {
  if (n && typeof n === 'object') { if (pred(n)) out.push(n); n.kids.forEach(k => find(k, pred, out)); }
  return out;
};
const { pmPctile, pmGrade, collegeProspectBlock, prospectModelBlock } = new Function('h', 'window',
  `${app.slice(start, end)}; return { pmPctile, pmGrade, collegeProspectBlock, prospectModelBlock };`)(h, window);

// One percentile function: mid-rank ties, and direction flips for lower-is-better metrics.
assert.equal(pmPctile([1, 2, 2, 3], 2), 50);
assert.equal(pmPctile([1, 2, 3, 4], 4), 88);
assert.equal(pmPctile([1, 2, 3, 4], 4, true), 13);
assert.equal(pmPctile([1, 2, 3, 4], 1, true), 88);
assert.equal(pmPctile([5, 5, 5], 5), 50);
assert.equal(pmPctile([5, 5, 5], 5, true), 50);
assert.equal(pmPctile([1, 2, 3], null), null);
assert.equal(pmPctile([], 2), null);
// The two directions mirror each other (each side rounds a half up, so a tie can sum to 101).
for (const v of [0, 1, 2.5, 4, 9]) assert(Math.abs(pmPctile([1, 2, 3, 4], v) + pmPctile([1, 2, 3, 4], v, true) - 100) <= 1);

// Bands: Dynasty Domain's letter map on the rounded decile; the reference size is the sample shown.
const ref = window.PRODUCTION_GRADES.ref.WR.dom;
assert.equal(pmGrade('WR', 'dom', ref[ref.length - 1]).g, 'A+');
assert.equal(pmGrade('WR', 'dom', ref[0]).g, 'F');
assert.equal(pmGrade('WR', 'dom', ref[0]).n, ref.length);
G.ref.X = { dom: Array.from({ length: 100 }, (_, i) => i + 1) };   // value v sits at percentile v - 0.5
assert.deepEqual([100, 95, 94, 85, 84, 55, 54, 5, 4, 1].map(v => pmGrade('X', 'dom', v).g),
  ['A+', 'A+', 'A', 'A', 'B+', 'B-', 'C+', 'D', 'F', 'F']);
delete G.ref.X;
assert.equal(pmGrade('QB', 'comp', 0.7), null, 'adjusted comp % is PFF-only');
assert.equal(pmGrade('WR', 'dom', null), null);
// A younger breakout grades higher.
assert(pmGrade('WR', 'ba', 19).pct > pmGrade('WR', 'ba', 22).pct);

// Only dominator, breakout age and RB YPC are graded; QB has nothing public to grade.
assert.deepEqual(Object.keys(G.ref).sort(), ['QB', 'RB', 'TE', 'WR']);
assert.deepEqual(G.ref.QB, {});
assert.deepEqual(Object.keys(G.ref.RB).sort(), ['ba', 'dom', 'ypc']);
for (const p of ['WR', 'TE']) assert.deepEqual(Object.keys(G.ref[p]).sort(), ['ba', 'dom']);

const SUB = /^[ABCDF][+-]?, \d+(st|nd|rd|th) pct, n=(\d+)$/;
const tiles = (card) => find(card, n => n.attrs.class === 'adv-stat');
const grades = (card) => Object.fromEntries(tiles(card).map(t => [text(t.kids[0]), t.kids[2] ? text(t.kids[2]) : null]));
const PFF = /\b(YPRR|YAC|YCO|MTF|BTT|TWP)\b|missed tackle|big-time|turnover-worthy|adj(usted)? comp/i;   // \b: Koyack is not YAC
const cards = [
  ...M.college.map(r => [r, collegeProspectBlock(r), G.ypc.college[r.cid]]),
  ...Object.entries(M.nfl).filter(([, r]) => r.st).map(([id, r]) => [r, prospectModelBlock({ id }), G.ypc.nfl[id]]),
];
let graded = 0;
for (const [r, card, ypc] of cards) {
  const g = grades(card), all = text(card) + find(card, n => n.attrs.title).map(n => n.attrs.title).join(' ');
  assert.doesNotMatch(all, PFF, `${r.n}: a PFF metric leaked onto the card`);
  if (r.p === 'QB') { assert(!Object.values(g).some(s => SUB.test(s || '')), `${r.n}: QB graded`); continue; }
  const want = { Dominator: r.st.dom, 'Breakout year': r.ba, YPC: r.p === 'RB' ? ypc : undefined };
  for (const [label, v] of Object.entries(want)) {
    if (v == null) { assert(!(label in g), `${r.n}: ${label} shown with no value`); continue; }
    const key = { Dominator:'dom', 'Breakout year':'ba', YPC:'ypc' }[label];
    const m = SUB.exec(g[label] || '');
    assert(m, `${r.n}: ${label} has no grade (${g[label]})`);
    assert.equal(Number(m[2]), G.ref[r.p][key].length, `${r.n}: ${label} sample size`);
    assert(g[label].startsWith(pmGrade(r.p, key, v).g), `${r.n}: ${label} letter`);
    graded++;
  }
  // The other stat tiles keep no grade line: there is no drafted reference for them here.
  for (const label of Object.keys(g)) if (!(label in want)) assert(!SUB.test(g[label] || ''), `${r.n}: ${label} graded`);
}
assert(graded > 1000, `only ${graded} grades rendered`);

console.log(`production-grades.test.js: all assertions passed (${graded} grades on ${cards.length} cards)`);
