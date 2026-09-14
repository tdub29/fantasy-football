// Verifies the team-FV future-pick model (interpPickValue): a weaker roster's
// pick (earlier projected slot) is worth strictly more, values move monotonically
// with slot, and everything stays inside KTC's published early..late range.
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const start = app.indexOf('function interpPickValue');
const end = app.indexOf('function projectedPickNote', start);
assert(start >= 0 && end > start, 'interpPickValue source not found');
const interpPickValue = new Function(`${app.slice(start, end)}; return interpPickValue;`)();

// Real 2026 SF R1 anchors from data/ktc.js: early 5612, mid 4631, late 3928.
const map = new Map([
  ['2027|early|1', { ktcValue: 5612 }],
  ['2027|mid|1',   { ktcValue: 4631 }],
  ['2027|late|1',  { ktcValue: 3928 }],
]);
const N = 12;
const vals = [];
for (let slot = 1; slot <= N; slot++) vals.push(interpPickValue(map, '2027', 1, slot, N));

// 1. Weak team (slot 1) worth strictly more than strong team (slot 12).
assert(vals[0] > vals[N - 1], 'weak-team pick must beat strong-team pick');
// 2. Monotonic non-increasing across slots (earlier = higher).
for (let i = 1; i < vals.length; i++) assert(vals[i] <= vals[i - 1], `slot ${i + 1} must not exceed slot ${i}`);
// 3. Bounded by the KTC anchors (never invents value outside early..late).
assert.equal(vals[0], 56.1, 'slot 1 == KTC early/100');
assert.equal(vals[N - 1], 39.3, 'slot N == KTC late/100');
for (const v of vals) assert(v <= 56.1 && v >= 39.3, 'value escaped KTC early..late range');
// 4. Middle slot lands on the KTC mid anchor.
assert.equal(interpPickValue(map, '2027', 1, (1 + N) / 2, N), 46.3, 'middle slot == KTC mid/100');
// 5. Missing anchors -> null so pickValue falls back to bucket/strategy.js.
assert.equal(interpPickValue(new Map(), '2099', 3, 5, N), null, 'missing anchors must return null');

console.log(`ok: pick-FV slots 1..12 =`, vals.join(', '));
