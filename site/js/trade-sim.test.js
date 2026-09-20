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

// --- classes past the end of KTC ------------------------------------------
// KTC publishes three rookie classes and stops. Before 2026-09-16 a question about a 2029
// pick died on `assert(KTC missing 2029 R1)`, so the only way to price one was to synthesize
// it in the caller, where nothing checked it. These pin the synthesis in the one place that
// owns it. The failure they exist to catch is silent: a decay that does not compound, or one
// applied to the buyer and not to his rivals, reads as a normal number and is not a normal
// number.
{
  const S = T.LAST_KTC_SEASON;
  assert(Number.isFinite(S) && S > 2000, `LAST_KTC_SEASON should be a real year, got ${S}`);
  const rid = T.ME;

  // a synthesized class is cheaper than the last published one, and it compounds
  const last = T.pv(S, 1, rid);
  const one = T.pv(S + 1, 1, rid);
  const two = T.pv(S + 2, 1, rid);
  const cmp = T.PICK_DECAY < 1 ? (a, b) => a < b : (a, b) => a <= b;   // DECAY=1 is the no-decay control
  assert(cmp(one, last), `${S + 1} R1 (${one}) must not cost more than ${S} R1 (${last})`);
  assert(cmp(two, one), `${S + 2} R1 (${two}) must not cost more than ${S + 1} R1 (${one})`);
  // pv rounds to one decimal on the site scale, so compare to that precision, not to 1e-9.
  const tol = 0.1 / Math.min(last, one);   // the rounding step, as a fraction of the smaller value
  const step1 = one / last, step2 = two / one;
  assert(Math.abs(step1 - step2) < tol, `decay must compound evenly, got ${step1} then ${step2}`);
  assert(Math.abs(step1 - T.PICK_DECAY) < tol, `one year past KTC must be DECAY, got ${step1}`);

  // the decay does NOT touch a class KTC actually publishes
  for (const season of [S - 1, S]) {
    const fromAnchor = T.pv(season, 2, rid);
    assert(fromAnchor > 0, `published class ${season} must still price`);
  }
  assert(T.pv(S, 1, rid) > T.pv(S, 2, rid), 'a first must still beat a second in a published class');

  // and a synthesized class keeps the slot ordering: the worst team's pick is still worth more
  const order = [...T.slotOf.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
  assert(T.pv(S + 1, 1, order[0]) > T.pv(S + 1, 1, order[order.length - 1]),
    'slot interpolation must survive into a synthesized class');

  // The slate covers HORIZON classes. Per-roster counts differ, and must: djcomstock holds
  // six 2027 firsts and roster 10 holds none, which is the whole reason this file exists.
  // What cannot differ is the total, one pick per roster per round per class.
  const all = Object.values(T.PICKS).flat();
  const seasons = new Set(all.map(p => p.season));
  assert.equal(all.length % (T.HORIZON * order.length), 0,
    `the slate must be a whole number of rounds: ${all.length} over ${T.HORIZON} classes and ${order.length} rosters`);
  assert.equal(seasons.size, T.HORIZON, `the slate must cover HORIZON=${T.HORIZON} classes, saw ${[...seasons]}`);
  assert.deepEqual([...seasons].sort(), [...T.SEASONS].sort(), 'slate seasons must match SEASONS');
}

console.log('trade-sim: post-KTC classes ok');

// --- taxi and IR cannot set the draft slot -------------------------------
// `startableIds(roster)` in app.js exists because Sleeper's `players` array includes taxi
// and IR. This file re-implements the lineup and for months re-implemented it without that
// filter, so five taxi bodies across three rosters were counted inside starting lineups and
// inflated the input to the draft-slot ranking: djcomstock read 39,378 against a real 38,142.
// Found by an adversarial pass 2026-09-16. It did not move the slot ORDER or any pick price
// in the set it was found on, which is exactly why a test is the only thing that keeps it
// fixed: nothing downstream would have complained.
{
  const withTaxi = T.lg.rosters.filter(r => (r.taxi || []).length || (r.reserve || []).length);
  assert(withTaxi.length, 'no taxi or IR anywhere in this league, so this test proves nothing');

  // Promoting the hidden bodies can only ever ADD to a best-lineup total, never subtract.
  for (const r of withTaxi) {
    const promoted = { ...r, taxi: [], reserve: [] };
    assert(T.startingKtc(promoted, null) >= T.startingKtc(r, null),
      `roster ${r.roster_id}: promoting taxi/IR lowered the starting total, which is impossible`);
  }

  // And on at least one roster it must strictly add, which is the proof the live path is
  // actually excluding them. A `>=` alone passes just as happily against the old buggy code.
  const movers = withTaxi.filter(r =>
    T.startingKtc({ ...r, taxi: [], reserve: [] }, null) > T.startingKtc(r, null));
  assert(movers.length,
    'no roster has a taxi/IR body good enough to crack its lineup, so the filter is untested; ' +
    'if this fires after a roster change, widen it rather than deleting it');
  const m = movers[0];
  assert(!(m.taxi || []).some(pid => false), 'sanity');
}

console.log(`trade-sim: taxi and IR excluded from the slot input ok`);
