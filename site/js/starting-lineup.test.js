// startingStrength must field a LEGAL lineup, not a naive top-K. The bug this
// guards: in a 1QB league the old top-K "started" two quarterbacks whenever the
// QB2 outvalued a flex body, inflating PV/FV for QB-hoarding rosters.
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const start = app.indexOf('function offenseStartingSlots');
const end = app.indexOf('  // Starting-lineup strength', start);
assert(start >= 0 && end > start, 'lineup-fill source not found');
const { offenseStartingSlots, fillLineup, rookieStartability } = new Function(
  `${app.slice(start, end)}; return { offenseStartingSlots, fillLineup, rookieStartability };`,
)();

// Password is taco: QB, RB, RB, WR, WR, TE, FLEX x4 = 10 offense slots.
const taco = { roster_positions: ['QB','RB','RB','WR','WR','TE','FLEX','FLEX','FLEX','FLEX', ...Array(15).fill('BN')] };
const slots = offenseStartingSlots(taco);
assert.equal(slots.length, 10, 'bench slots must not count');
assert.equal(slots.filter(s => s.flex).length, 4);

const sum = (l) => Math.round(l.reduce((a, b) => a + b.v, 0) * 10) / 10;
const at = (l, pos) => l.filter(x => x.pos === pos).length;

// Two elite QBs, thin flex. The QB2 outvalues three flex bodies and would have
// been "started" by the old top-K.
const twoQB = [
  { n:'QB1', pos:'QB', v:70 }, { n:'QB2', pos:'QB', v:57 },
  { n:'RB1', pos:'RB', v:74 }, { n:'RB2', pos:'RB', v:60 }, { n:'RB3', pos:'RB', v:30 },
  { n:'WR1', pos:'WR', v:58 }, { n:'WR2', pos:'WR', v:50 }, { n:'WR3', pos:'WR', v:46 },
  { n:'TE1', pos:'TE', v:75 }, { n:'TE2', pos:'TE', v:28 }, { n:'WR4', pos:'WR', v:27 },
];
const legal = fillLineup(twoQB, slots);
assert.equal(legal.length, 10);
assert.equal(at(legal, 'QB'), 1, 'a 1QB league must never start two QBs');
assert(!legal.some(x => x.n === 'QB2'), 'QB2 has no legal slot');
// Naive top-K would have taken QB2 (57) over WR4 (27) — 30 points of phantom value.
const naive = twoQB.slice().sort((a, b) => b.v - a.v).slice(0, 10);
assert(sum(naive) > sum(legal), 'top-K overstates when QB2 is valuable');
// QB 70 | RB 74+60 | WR 58+50 | TE 75 | FLEX 46+30+28+27
assert.equal(sum(legal), 518);

// Superflex: the same QB2 is legal and should be started.
const sf = offenseStartingSlots({ roster_positions: ['QB','RB','RB','WR','WR','TE','FLEX','SUPER_FLEX'] });
assert.equal(at(fillLineup(twoQB, sf), 'QB'), 2, 'SUPER_FLEX must accept a second QB');

// A pick is position-unknown, so it's eligible anywhere — but it takes a FLEX
// before a dedicated slot, so it can never evict the only startable QB.
const withPick = [
  { n:'QB1', pos:'QB', v:70 }, { n:'PICK1', pos:'PICK', v:99 },
  ...twoQB.filter(x => x.pos !== 'QB'),
];
const picked = fillLineup(withPick, slots);
assert(picked.some(x => x.n === 'PICK1'), 'a top pick must make the lineup');
assert(picked.some(x => x.n === 'QB1'), 'the pick must not take the QB slot');

// Degenerate roster: fewer assets than slots, and a position with no takers.
const thin = fillLineup([{ n:'WR1', pos:'WR', v:40 }, { n:'K', pos:'K', v:99 }], slots);
assert.deepEqual(thin.map(x => x.n), ['WR1'], 'ineligible positions are dropped, no crash');

// Rookie startability: a converted pick can't start at its full dynasty value.
// Calibrated at 0.75 in the draft year (measured rookie median), ramping to 1.0.
assert.equal(rookieStartability(0), 0.75, 'draft-year pick must be discounted');
assert(rookieStartability(0) < rookieStartability(1), 'the ramp must be monotone');
assert(rookieStartability(1) < rookieStartability(2));
assert.equal(rookieStartability(3), 1);
assert.equal(rookieStartability(9), 1, 'far-out picks clamp to parity, not past it');
assert.equal(rookieStartability(-1), 0.75, 'a negative horizon cannot read off the front');

console.log('starting-lineup.test.js: all assertions passed');
