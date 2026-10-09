// The 2027 mock-draft consensus is a projection: every pre-draft capital rating built from it
// carries projected: true, sits apart from the drafted ratings, and the card says "Projected".
// Run from the repo root: node site/js/mock-consensus.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = {};
for (const f of ['prospect-model.js', 'mock-consensus.js', 'capital-ratings.js']) require(path.join(__dirname, '..', 'data', f));
const { PROSPECT_MODEL: M, MOCK_CONSENSUS: MC, CAPITAL_RATINGS: CR } = window;
const college = new Map(M.college.map(r => [String(r.cid), r]));

// Consensus: 2027 class only, real sources, range holds the median.
assert.equal(MC.class, 2027);
const ids = new Set(MC.sources.map(s => s.id));
for (const [cid, c] of Object.entries(MC.players)) {
  assert.equal(college.get(cid).cls, 2027, `${cid}: 2027 class only`);
  assert(c.lo <= c.pick && c.pick <= c.hi && c.n === c.src.length, `${cid}: median inside range`);
  assert(c.src.every(([id]) => ids.has(id)), `${cid}: every pick names a source that loaded`);
}

// Capital: projected block is flagged, keyed by college id, and fed by the consensus pick.
const P = CR.projected;
assert(P && P.class === 2027 && Object.keys(P.players).length, 'projected block missing');
for (const [cid, v] of Object.entries(P.players)) {
  assert.equal(v.projected, true, `${cid}: projected flag`);
  assert.equal(college.get(cid).cls, 2027, `${cid}: 2027 class only`);
  assert.equal(v.pick, MC.players[cid].pick, `${cid}: consensus pick`);
  assert(v.F1 >= 0 && v.F1 <= 100, `${cid}: F1 rating`);
}
assert(Object.values(CR.players).every(v => !('projected' in v)), 'drafted ratings carry no projected flag');

// Card: the 2027 tile says Projected with range, mock count and date; no consensus, no tile.
const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const start = app.indexOf('  // College prospect model (window.PROSPECT_MODEL)');
const end = app.indexOf('  // weather.js keys teams by nflverse code', start);
const h = (tag, attrs, ...kids) => ({ tag, attrs: attrs || {}, kids: kids.flat(Infinity).filter(k => k != null && k !== false) });
const text = (n) => n == null ? '' : typeof n !== 'object' ? String(n) : n.kids.map(text).join(' ');
const { collegeProspectBlock } = new Function('h', 'window', `${app.slice(start, end)}; return { collegeProspectBlock };`)(h, window);
const tile = (r) => (function find(n) {
  if (!n || typeof n !== 'object') return null;
  if (n.attrs.class === 'adv-stat' && text(n).startsWith('Projected round')) return n;
  for (const k of n.kids) { const f = find(k); if (f) return f; }
  return null;
})(collegeProspectBlock(r));
const [cid, c] = Object.entries(MC.players).find(([, x]) => x.n > 1);
const t = tile(college.get(cid));
assert(t, 'consensus player shows the projected tile');
assert.match(text(t), new RegExp(`R${Math.min(7, Math.ceil(c.pick / 32))} .*picks ${c.lo}-${c.hi}, ${c.n} mocks, ${c.date}`), text(t));
assert.match(t.attrs.title, /^Projected from public mock drafts/);
assert.equal(tile(M.college.find(r => r.cls !== 2027)), null, 'later class: no projected tile');
assert.equal(tile(M.college.find(r => r.cls === 2027 && !MC.players[r.cid])), null, 'no consensus: no projected tile');
delete window.MOCK_CONSENSUS;
assert.equal(tile(college.get(cid)), null, 'no data file: no tile, no crash');

console.log('mock-consensus.test.js: all assertions passed');
