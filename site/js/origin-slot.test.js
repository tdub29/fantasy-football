// Projected draft slot must follow STARTING-lineup strength, not total roster
// value. Regression: originSlot ranked teams by the sum of every rostered
// player, so a rebuilding team that hoarded 30 ranked bodies was projected as
// one of the two best rosters and its future first was priced as a 1.09.
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const start = app.indexOf('const _originSlotCache = new Map();');
const end = app.indexOf('function pickYearsOut', start);
assert(start >= 0 && end > start, 'originSlot source not found');

// Inject the ONE dependency originSlot is allowed to have. If the code goes
// back to summing whole rosters (projectedPlayerStrength / computePlayerStrength)
// this throws ReferenceError instead of quietly returning the wrong slot.
const STARTERS = 11;
function startingStrength(roster) {
  return roster.vals.slice().sort((a, b) => b - a).slice(0, STARTERS).reduce((a, b) => a + b, 0);
}
const originSlot = new Function('startingStrength',
  `${app.slice(start, end)}; return originSlot;`)(startingStrength);

// A: hoarder. 30 replacement-level bodies. Biggest roster total in the league,
// worst starting lineup. B: 12 studs, thin bench. C..: middling.
const rosters = [
  { roster_id: 1, vals: Array(40).fill(20) },                        // sum 800, starters 220
  { roster_id: 2, vals: Array(12).fill(60) },                        // sum 720, starters 660
  { roster_id: 3, vals: Array(15).fill(40) },                        // sum 600, starters 440
];
const league = { id: 'test', total_rosters: 3, rosters };

const slotOf = (id) => originSlot(id, league, 0);
assert.equal(slotOf(1), 1, 'weakest starters must pick first');
assert.equal(slotOf(3), 2, 'middle starters pick second');
assert.equal(slotOf(2), 3, 'best starters pick last');
// The hoarder has neither the largest nor the smallest roster sum, so this
// ordering is only reachable through the starting lineup.
assert(rosters[0].vals.reduce((a, b) => a + b, 0) > rosters[1].vals.reduce((a, b) => a + b, 0),
  'fixture must keep the hoarder above the stud team by roster total');

// Unknown roster -> middle of the draft, never a crash or slot 0.
assert.equal(originSlot(99, league, 0), 2, 'unknown origin falls back to mid-draft');
assert.equal(originSlot(null, league, 0), 2, 'missing origin falls back to mid-draft');

// yearsOut is passed through to startingStrength (future slots re-rank on aged
// rosters), and each yearsOut gets its own cache entry.
let sawYears = [];
const originSlot2 = new Function('startingStrength',
  `${app.slice(start, end)}; return originSlot;`)((r, lg, y) => { sawYears.push(y); return r.roster_id; });
originSlot2(1, league, 0);
originSlot2(1, league, 2);
assert.deepEqual([...new Set(sawYears)], [0, 2], 'yearsOut must reach startingStrength and not be cached across years');

console.log('ok: originSlot ranks by starting lineup, not roster hoard');
