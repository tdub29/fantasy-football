// Self-check for the trade-calc headliner / consolidation premium.
// Slices the pure consolidationPremium() out of app.js and asserts the KTC-style
// "Value Adjustment": the side giving up the bigger single asset gets a boost,
// zero for a true 1-for-1, capped at the documented 15% consolidation premium.
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const start = app.indexOf('function consolidationPremium');
const end = app.indexOf('KT.consolidationPremium = consolidationPremium');
assert(start >= 0 && end > start, 'consolidationPremium source not found');
const consolidationPremium = new Function(
  `${app.slice(start, end)}; return consolidationPremium;`,
)();

// 1-for-1 star swap: no consolidation, no premium.
let p = consolidationPremium(1, 1, 9000, 8500);
assert.equal(p.side, null, '1-for-1 must give no premium');
assert.equal(p.pct, 0);

// Empty / incomplete side: no premium.
assert.equal(consolidationPremium(0, 2, 9000, 4000).side, null);
assert.equal(consolidationPremium(2, 0, 4000, 9000).side, null);

// Stud (A) for a 3-piece pile (B), A gave the headliner -> boost A.
p = consolidationPremium(1, 3, 9000, 4000);
assert.equal(p.side, 'A', 'headliner side A must get the premium');
assert.ok(p.pct > 0.04 && p.pct < 0.07, `expected ~5.6%, got ${(p.pct * 100).toFixed(2)}%`);

// Mirror: stud on B side -> boost B, same magnitude.
const pm = consolidationPremium(3, 1, 4000, 9000);
assert.equal(pm.side, 'B', 'headliner side B must get the premium');
assert.ok(Math.abs(pm.pct - p.pct) < 1e-9, 'premium must be symmetric across sides');

// Never exceeds the documented 15% ceiling, even in the most extreme spread.
p = consolidationPremium(1, 8, 9000, 900);
assert.ok(p.pct <= 0.15 + 1e-9, `premium must cap at 15%, got ${(p.pct * 100).toFixed(2)}%`);
assert.ok(p.pct > 0.10, 'extreme consolidation should approach the ceiling');

// Bigger headliner gap => bigger premium (monotonic in gap).
const near = consolidationPremium(1, 3, 9000, 8000).pct; // small gap
const far  = consolidationPremium(1, 3, 9000, 2000).pct; // large gap
assert.ok(far > near, 'wider headliner gap must earn a larger premium');

// More pile pieces => bigger premium (monotonic in spread), up to the cap.
const few  = consolidationPremium(1, 2, 9000, 3000).pct;
const many = consolidationPremium(1, 4, 9000, 3000).pct;
assert.ok(many > few, 'more lesser pieces must earn a larger premium');

// Equal headliners but B piles on a sweetener: not substitution, no premium.
assert.equal(consolidationPremium(1, 2, 9000, 9000).side, null, 'equal headliners = no consolidation');

console.log('trade-consolidation.test.js: all assertions passed');
