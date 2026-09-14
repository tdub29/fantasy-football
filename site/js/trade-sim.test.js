// trade-sim.js re-implements two things app.js already does (projected draft slot, pick
// value by slot) because the CLI cannot drag half the app in. Two implementations drift,
// so these pin the invariants that must hold in both.
//
// The one that actually bites: `spendPicks` matches on a LABEL STRING. A typo does not
// throw, it silently leaves the pick on the roster and the trade reads as free.
const assert = require('node:assert/strict');
const T = require('./trade-sim.js');

const N = T.lg.rosters.length;

// --- slot order is a permutation of 1..N -----------------------------------
const slots = [...T.slotOf.values()].sort((a, b) => a - b);
assert.equal(T.slotOf.size, N, 'every roster gets a projected slot');
assert.deepEqual(slots, Array.from({ length: N }, (_, i) => i + 1), 'slots are 1..N, no ties, no gaps');

// --- a weaker team picks earlier and its pick is worth MORE -----------------
// This is the direction that shipped backwards once: summing whole rosters ranked a
// hoarder as a contender and priced a rebuilder's first like a 1.09.
const bySlot = [...T.slotOf.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
const worst = bySlot[0], best = bySlot[N - 1];
for (const round of [1, 2]) {
  const early = T.pv(2027, round, worst), late = T.pv(2027, round, best);
  assert(early > late, `round ${round}: the worst team's pick (${early}) must beat the best team's (${late})`);
}
// and it is monotonic the whole way down, not just at the ends
for (let i = 1; i < N; i++) {
  assert(T.pv(2027, 1, bySlot[i - 1]) >= T.pv(2027, 1, bySlot[i]),
    `pick value must not rise as the origin team gets stronger (slot ${i} to ${i + 1})`);
}

// --- a pick's price moves with the trade that moves it ----------------------
// The error this pins, shipped 2026-09-12: pricing a buyer's own picks at his PRE-trade
// slot said his own 2027 2nd was dearer than one acquired from a better team, so the
// advice was to send the acquired pick. Buying starters makes your own picks cheaper in
// the same instant, and it inverts.
{
  const me = T.ME;
  const roster = T.lg.rosters.find(r => r.roster_id === me);
  const best = [...T.slotOf.entries()].sort((a, b) => b[1] - a[1])[0][0];   // strongest roster
  const stars = [...(T.lg.rosters.find(r => r.roster_id === best).players || [])]
    .sort((a, b) => T.ktcOf(b) - T.ktcOf(a)).slice(0, 5);   // his five best, not his first five
  const buying = { [me]: { add: stars }, [best]: { drop: stars } };
  const slotBefore = T.slotOf.get(me), slotAfter = T.slotsUnder(buying).get(me);
  assert(slotAfter > slotBefore,
    `buying the strongest roster's five best must push the buyer LATER in the draft (${slotBefore} -> ${slotAfter})`);
  // Strict: equal prices mean pv() ignored the whatIf, which is the bug, not a pass.
  const before = T.pv(2028, 1, me), after = T.pv(2028, 1, me, buying);
  assert(after < before,
    `the buyer's own pick must get CHEAPER once the trade lands (${before} -> ${after})`);
  const sellerBefore = T.pv(2028, 1, best), sellerAfter = T.pv(2028, 1, best, buying);
  assert(sellerAfter > sellerBefore,
    `the seller's own pick must get DEARER once he sells his starters (${sellerBefore} -> ${sellerAfter})`);
}

// --- every pick in the window is owned exactly once -------------------------
const owned = Object.values(T.PICKS).flat();
const seen = new Set(owned.map(p => p.label));
assert.equal(seen.size, owned.length, 'no pick is owned twice');
assert.equal(owned.length % N, 0, 'the slate divides evenly across rosters');

// --- every label a scenario spends is a pick that roster actually owns -------
for (const [name, whatIf] of Object.entries(T.SCENARIOS)) {
  if (!whatIf) continue;
  for (const [rosterId, wi] of Object.entries(whatIf)) {
    const has = new Set((T.PICKS[rosterId] || []).map(p => p.label));
    for (const lbl of (wi.spendPicks || [])) {
      assert(has.has(lbl), `"${name}": roster ${rosterId} cannot spend ${lbl}, it does not own it`);
    }
    for (const p of (wi.gainPicks || [])) {
      assert(p.label && p.value > 0, `"${name}": gained pick ${p.label} has no value`);
    }
  }
}

console.log('trade-sim: ok');
