const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

// --- Jacob Gibbs generated data (unchanged; still the first expert source) ---
const context = { window: {} };
vm.runInNewContext(fs.readFileSync('site/data/jacob-gibbs.js', 'utf8'), context);
const data = context.window.JACOB_GIBBS_RANKINGS;

assert.equal(data.source, 'Jacob Gibbs');
assert.equal(data.format, 'redraft_half_ppr');
assert.equal(data.updatedAt, '2026-08-30');
assert.equal(data.players[0].name, 'Jahmyr Gibbs');
assert.equal(data.players[0].rank, 1);
assert.equal(data.players[0].posRank, 1);
// 199, not 200: rank 94 fell between his two screenshots (page 1 closes at 93 with the
// table border under it, page 2 opens at 95), so that row was never captured. The gap is
// asserted by number below rather than tolerated, so a second lost row cannot hide.
assert.equal(data.players.length, 199);
assert(data.players.every(player => ['QB', 'RB', 'WR', 'TE'].includes(player.pos)));
assert(data.players.every(player => player.sleeperId));
assert.equal(new Set(data.players.map(player => player.rank)).size, data.players.length);

// The board is hand-transcribed from two published images, so guard the shape the
// transcription can break: contiguous 1..200, 17 tiers that never move backwards,
// dense positional ranks, a real bye week, and the known first/last names.
const MISSING_RANKS = [94];
assert.deepEqual(data.players.map(p => p.rank),
  Array.from({ length: 200 }, (_, i) => i + 1).filter(n => !MISSING_RANKS.includes(n)),
  'ranks must be 1..200 minus exactly the rows never captured');
const tiers = data.players.map(player => player.tier);
assert.deepEqual([...new Set(tiers)].sort((a, b) => a - b), Array.from({ length: 16 }, (_, i) => i + 1));
assert(tiers.every((tier, i) => i === 0 || tier >= tiers[i - 1]), 'tier decreases as rank grows');
assert(data.players.every(p => p.bye >= 4 && p.bye <= 14), 'bye out of range');
assert.equal(data.players[data.players.length - 1].name, 'Darnell Mooney');
for (const pos of ['QB', 'RB', 'WR', 'TE']) {
  const ranks = data.players.filter(p => p.pos === pos).map(p => p.posRank).sort((a, b) => a - b);
  assert.deepEqual(ranks, ranks.map((_, i) => i + 1), `${pos} posRank not dense`);
}

// --- Expert-rankings registry data (extensible expert columns) ---
const erCtx = { window: {} };
vm.runInNewContext(fs.readFileSync('site/data/expert-rankings.js', 'utf8'), erCtx);
const sources = erCtx.window.EXPERT_RANKINGS;
assert(Array.isArray(sources), 'EXPERT_RANKINGS must be an array');
for (const s of sources) {
  assert(s.id && s.expert, `source missing id/expert: ${JSON.stringify(s).slice(0, 80)}`);
  assert(Array.isArray(s.players) && s.players.length, `source ${s.id} has no players`);
  for (const p of s.players) {
    assert(p.name && p.pos, `player missing name/pos in ${s.id}`);
    // positional sources rank within a position; overall sources carry an overall rank
    if (s.scope && s.scope !== 'overall') assert(p.posRank != null, `${s.id}/${p.name} missing posRank`);
    else assert(p.rank != null, `${s.id}/${p.name} missing overall rank`);
  }
  // ranks unique within a (source, position)
  const seen = new Set();
  for (const p of s.players) {
    const key = `${p.pos}|${s.scope && s.scope !== 'overall' ? p.posRank : p.rank}`;
    assert(!seen.has(key), `${s.id} duplicate rank ${key}`);
    seen.add(key);
  }
}

// --- app.js wires the GENERIC expert-column layer, not a hardcoded Gibbs one ---
const app = fs.readFileSync('site/js/app.js', 'utf8');
// generic renderers exist
assert(app.includes('function expertHeaders('), 'expertHeaders() renderer missing');
assert(app.includes('function expertCells('), 'expertCells() renderer missing');
assert(app.includes('function activeExpertSources('), 'activeExpertSources() missing');
// Gibbs is adapted into the registry (generated file stays the source of truth)
assert(app.includes("id:'gibbs'") && app.includes('window.JACOB_GIBBS_RANKINGS'), 'Gibbs adapter missing');
assert(app.includes('window.EXPERT_RANKINGS'), 'registry not read');
// every table that showed the Gibbs column now spreads the expert columns
assert.equal((app.match(/^\s+\.\.\.expertHeaders\(\),$/gm) || []).length, 5, 'expected 5 expert-header sites');
assert.equal((app.match(/^\s+\.\.\.expertCells\(/gm) || []).length, 7, 'expected 7 expert-cell sites');
// per-source sortable columns via xr:<id> keys
assert(app.includes("startsWith('xr:')"), 'xr: sort branch missing');
assert(app.includes("sortHdr('xr:'"), 'per-source sort headers missing');
// The projections table is a players table too, and the Sources page promises the
// columns appear beside players in EVERY table. It gates on the offense unit because
// the expert boards rank offense only, and a header without its cell (or the reverse)
// silently shifts every stat column one to the left.
assert.equal((app.match(/\.\.\.\(PROJ_STATE\.unit === 'offense' \? expertHeaders\(\) : \[\]\)/g) || []).length, 1,
  'projections table lost its expert headers');
assert.equal((app.match(/\.\.\.\(PROJ_STATE\.unit === 'offense' \? expertCells\(/g) || []).length, 1,
  'projections table lost its expert cells');
// Two tables build their own sortable header inline rather than calling expertHeaders():
// the per-league Players tab and the Draft Room board. They are counted separately or
// they look like missing headers. 5 bare expertHeaders() sites + 2 inline = 7, which is
// the bare expertCells() count above. That equality IS the invariant: a header without
// its cell silently shifts every stat column one to the left.
assert.equal((app.match(/activeExpertSources\(\)\.map\(src => sortHdr\('xr:' \+ src\.id/g) || []).length, 2,
  'expected 2 inline expert-header tables (league Players tab, Draft Room board)');
// visibility toggle setting
assert(app.includes('enabledExpertCols'), 'expert-column toggle setting missing');

console.log(`ok: ${data.players.length} Gibbs ranks + ${sources.length} extra expert source(s) [${sources.map(s => s.id).join(', ')}]`);
