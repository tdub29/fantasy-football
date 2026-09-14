// Gibbs publishes the board as images, so every number in jacob-gibbs.js was typed
// by hand off a picture. The TSV below is a SECOND transcription of those same
// images, made without reading the build CSV, and this test pins the generated board
// to it field by field. That check only means something because the two were typed
// independently: regenerate the TSV from the CSV and this file stops testing anything.
//
// 2026-08-30 board: four readers ran, two per page, none seeing another's output. Page 1
// agreed on all 93 rows. Page 2 disagreed on four cells, each settled by cropping that row
// out of the image at 4x and reading it directly. The CSV took one pass, this TSV the other.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const TSV = 'site/data/_sources/jacob-gibbs-2026-08-30_independent-transcription.tsv';
const rows = fs.readFileSync(TSV, 'utf8')
  .split(/\r?\n/)
  .filter(l => l && !l.startsWith('###'))
  .slice(1)                              // header
  .map(l => l.split('\t'))
  .map(([rank, tier, name, team, bye, pos, printedRank]) => ({
    rank: Number(rank), tier: Number(tier), name, team, bye: Number(bye), pos,
    printedRank: Number(printedRank),
  }));

// The board is 199 of 200. Rank 94 fell between the two screenshots: page 1 closes at 93
// with the table border under it, page 2 opens at 95. The gap is asserted by NUMBER rather
// than tolerated, so a second lost row cannot hide behind the first.
const MISSING_RANKS = [94];
const present = new Set(rows.map(r => r.rank));
const missing = [];
for (let n = 1; n <= 200; n += 1) if (!present.has(n)) missing.push(n);
assert.deepEqual(missing, MISSING_RANKS,
  `expected exactly rank(s) ${MISSING_RANKS} to be missing, got ${missing}`);
assert.equal(rows.length, 200 - MISSING_RANKS.length, 'tier sheet row count');

// His sheet skips 164 and prints 165 twice. Column order breaks the tie: the first of the
// two takes the vacant 164 and keeps 165 in printedRank. Pinned to exactly that row, so a
// future board cannot quietly inherit an adjudicated rank.
const renumbered = rows.filter(r => r.rank !== r.printedRank);
assert.deepEqual(renumbered.map(r => r.rank), [164],
  'only rank 164 may carry an adjudicated rank');
assert(renumbered.every(r => r.printedRank === 165),
  'the adjudicated row prints 165 and is read as 164');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync('site/data/jacob-gibbs.js', 'utf8'), ctx);
const built = ctx.window.JACOB_GIBBS_RANKINGS.players;
assert.equal(built.length, rows.length, 'generated Gibbs board lost or gained players');
for (const [i, want] of rows.entries()) {
  const got = built[i];
  for (const key of ['rank', 'tier', 'name', 'team', 'bye', 'pos']) {
    assert.equal(got[key], want[key], `row ${want.rank} ${want.name}: ${key} is ${got[key]}, sheet says ${want[key]}`);
  }
}

// Bye weeks are a team property, so every player on a team must share one. This is what
// caught the transcription being right in the first place. One row on this board breaks it
// in the source itself: rank 196 prints "Fernando Mendoza LV (11)" with Michael Mayer LV (13)
// directly beneath, confirmed at 4x. The exception is pinned to that exact row, so any OTHER
// team disagreeing with itself still fails.
const KNOWN_BYE_CONFLICTS = ['Fernando Mendoza'];
const byeOf = new Map();
const conflicts = [];
for (const p of built) {
  if (byeOf.has(p.team)) {
    if (byeOf.get(p.team) !== p.bye) conflicts.push(p.name);
  } else byeOf.set(p.team, p.bye);
}
assert.deepEqual(conflicts, KNOWN_BYE_CONFLICTS,
  `unexpected bye disagreement: ${conflicts.filter(n => !KNOWN_BYE_CONFLICTS.includes(n))}`);
assert.equal(byeOf.size, 32, 'expected all 32 teams represented');
assert(built.every(p => p.sleeperId), 'every board row must resolve to a Sleeper id');

// The deeper pre-tier-sheet Gibbs board survives as a toggled-off expert column.
const er = { window: {} };
vm.runInNewContext(fs.readFileSync('site/data/expert-rankings.js', 'utf8'), er);
const deep = (er.window.EXPERT_RANKINGS || []).find(s => s.id === 'gibbs-fp-2026-07');
assert(deep, 'gibbs-fp-2026-07 deep board missing from expert-rankings.js');
assert.equal(deep.players.length, 315);
assert.equal(deep.defaultEnabled, false, 'deep board should not add a column by default');
assert(deep.players.every(p => p.sleeperId), 'deep board lost Sleeper ids');

console.log(`ok: ${rows.length} tier-sheet rows match the source TSV (rank ${MISSING_RANKS} never captured), ${byeOf.size} teams, deep board ${deep.players.length} players`);
