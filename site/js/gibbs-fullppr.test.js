// The full-PPR board is DERIVED from Gibbs' half-PPR board, not published by him.
// build_gibbs_fullppr.py re-sorts only RB/WR/TE, only by the reception bonus, and
// leaves his tier sizes and every QB slot alone. Those three promises are what make
// it honest to show beside his name, so they are asserted here rather than trusted.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const half = (() => {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync('site/data/jacob-gibbs.js', 'utf8'), ctx);
  return ctx.window.JACOB_GIBBS_RANKINGS.players;
})();
const er = { window: {} };
vm.runInNewContext(fs.readFileSync('site/data/expert-rankings.js', 'utf8'), er);
const full = (er.window.EXPERT_RANKINGS || []).find(s => s.id === 'gibbs-ppr-2026-08');

assert(full, 'gibbs-ppr-2026-08 missing from expert-rankings.js');
assert.match(full.expert, /adaptation/i, 'the derived board must not read as his own');
assert.equal(full.scope, 'overall');
assert.equal(full.players.length, half.length);
// The derived board re-orders his slots, so it must carry the SAME slot numbers, not a
// contiguous 1..N. Those were the same thing until the 2026-08-30 board arrived with rank 94
// missing; renumbering over that gap shifted every player after it and quietly broke the
// promise that a quarterback holds his slot.
assert.deepEqual(full.players.map(p => p.rank).sort((a, b) => a - b),
  half.map(p => p.rank).sort((a, b) => a - b), 'derived board must carry the half board\'s slots');

// Same population, no one invented or dropped.
const ids = s => new Set(s.map(p => String(p.sleeperId)));
assert.deepEqual([...ids(full.players)].sort(), [...ids(half)].sort());

const halfById = new Map(half.map(p => [String(p.sleeperId), p]));

// 1. QBs do not move. PPR does not change how many starting QB jobs exist.
for (const p of full.players.filter(p => p.pos === 'QB')) {
  assert.equal(p.rank, halfById.get(String(p.sleeperId)).rank,
    `${p.name} is a QB and must hold his slot, moved to ${p.rank}`);
}

// 2. Tier sizes are his, exactly.
const sizes = board => {
  const out = new Map();
  for (const p of board) out.set(p.tier, (out.get(p.tier) || 0) + 1);
  return [...out.entries()].sort((a, b) => a[0] - b[0]);
};
assert.deepEqual(sizes(full.players), sizes(half), 'tier sizes must survive the re-sort');

// 3. Nobody passes anybody without out-catching him. Slot value is handed out
//    strictly in his order and is non-increasing, so the only way a flex player
//    overtakes one Gibbs had ahead of him is a bigger reception bonus. Every
//    flipped pair is checked, not just neighbours: an adjacent-only version of
//    this passed a deliberately corrupted board and was testing nothing.
// Sort by rank rather than trusting array order: the file happens to be written in
// rank order, and a check that silently depends on that would stop working the day
// something reorders the array.
const flex = full.players.filter(p => p.pos !== 'QB').sort((a, b) => a.rank - b.rank);
let flips = 0;
for (let i = 0; i < flex.length; i++) {
  for (let j = i + 1; j < flex.length; j++) {
    const [a, b] = [flex[i], flex[j]];               // a is ahead of b now
    const aWasBehind = halfById.get(String(a.sleeperId)).rank
      > halfById.get(String(b.sleeperId)).rank;
    if (!aWasBehind) continue;                        // no flip, nothing to prove
    flips++;
    assert(a.projRec > b.projRec,
      `${a.name} passed ${b.name} without out-catching him ` +
      `(${a.projRec} vs ${b.projRec})`);
  }
}
assert(flips > 0, 'no pair flipped, so this assertion proved nothing');

// 4. The move field agrees with the two boards.
for (const p of full.players) {
  assert.equal(p.move, halfById.get(String(p.sleeperId)).rank - p.rank,
    `${p.name}: move field disagrees with the boards`);
}

const moved = full.players.filter(p => p.move !== 0);
const byPos = {};
for (const p of full.players) {
  byPos[p.pos] = (byPos[p.pos] || 0) + p.move;
}
// Direction sanity: pass catchers gain in aggregate, backs lose.
assert(byPos.TE > 0 && byPos.WR > 0, 'TE and WR must gain in aggregate under full PPR');
assert(byPos.RB < 0, 'RB must lose in aggregate under full PPR');

console.log(`ok: full-PPR board, ${moved.length}/${full.players.length} moved, ` +
  `net RB ${byPos.RB}, WR +${byPos.WR}, TE +${byPos.TE}, QB ${byPos.QB}`);
