// The dynasty-* skills quote measured numbers as doctrine. A data refresh can quietly
// invalidate them, and a stale doctrine number reads exactly like a fresh one. This
// pins the claims that would change an actual recommendation if they moved, with
// bands wide enough to survive a routine rebuild and tight enough to catch a real shift.
//
// Run: node site/js/dynasty-claims.test.js
// Sources of truth: .agents/skills/dynasty-replacement-level, dynasty-league-format-leverage,
// dynasty-player-evaluation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const root = `${__dirname}/..`;
const ctx = { window: {} };
for (const f of ['leagues.js', 'ktc.js', 'projections.js', 'players.js']) {
  vm.runInNewContext(fs.readFileSync(`${root}/data/${f}`, 'utf8'), ctx);
}
const { LEAGUES, PLAYERS, OFFENSE_PROJ, RANKINGS_SOURCES } = ctx.window;
const KTC = RANKINGS_SOURCES.find(s => s.id === 'keeptradecut');
const oneqb = KTC.rankings.find(r => r.id === 'ktc-oneqb').players;
const sflex = KTC.rankings.find(r => r.id === 'ktc-superflex').players;
const taco = LEAGUES.find(l => l.short_name === 'Password is taco');

const SKILL_POS = new Set(['QB', 'RB', 'WR', 'TE']);
const norm = s => String(s).toLowerCase().replace(/[^a-z]/g, '');
const pts = p => p.blend != null ? p.blend : (p.pp != null ? p.pp : p.sleeper);
const median = a => {
  const b = [...a].sort((x, y) => x - y);
  return b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2;
};
const near = (got, want, tol, what) =>
  assert(Math.abs(got - want) <= tol, `${what}: got ${got}, doctrine says ${want} +/- ${tol}`);

// --- Replacement level: the free pool is deep, and that is the whole skill ---
const projSkill = OFFENSE_PROJ.offense.players.filter(p => SKILL_POS.has(p.pos));
const rostered = new Set();
for (const r of taco.rosters) for (const p of (r.players || [])) rostered.add(String(p));
const free = projSkill.filter(p => !rostered.has(String(p.id)));
const freeShare = free.length / projSkill.length;

near(projSkill.length, 559, 60, 'projected skill players');
near(freeShare, 0.46, 0.06, 'free-agent share of projected skill players');
assert(freeShare > 0.35,
  'free share collapsed below 35%: the "waivers are an acquisition channel" doctrine no longer holds');

// The QB baseline is the load-bearing one. A startable QB being free is why the
// skills say roster one QB. If the best free QB stops being startable, that inverts.
const bestFree = {};
for (const pos of ['QB', 'RB', 'WR', 'TE']) {
  const f = free.filter(p => p.pos === pos).sort((a, b) => pts(b) - pts(a));
  bestFree[pos] = f[0] ? pts(f[0]) : 0;
}
near(bestFree.QB, 196, 45, 'best free-agent QB points');
assert(bestFree.QB > 150,
  `best free QB fell to ${bestFree.QB}: "keep exactly one QB" assumes a startable QB is free`);
assert(bestFree.TE > bestFree.RB,
  'TE/RB free-pool ordering flipped; the depth-surplus advice per position needs re-deriving');

// --- The 1QB discount: relative, not raw. This is what stops a superflex price ---
// being pasted into a 1QB trade.
const sfByName = new Map(sflex.map(p => [norm(p.name), p]));
const ratios = { QB: [], RB: [], WR: [], TE: [] };
let paired = 0;
for (const p of oneqb) {
  const s = sfByName.get(norm(p.name));
  if (!s || !p.ktcValue || !s.ktcValue || !ratios[p.pos]) continue;
  ratios[p.pos].push(p.ktcValue / s.ktcValue);
  paired++;
}
assert(paired > 250, `only ${paired} players paired across the two KTC boards; the ratio fit is too thin`);
const skillBaseline = median([...ratios.RB, ...ratios.WR, ...ratios.TE]);
const qbRelative = median(ratios.QB) / skillBaseline;
near(qbRelative, 0.70, 0.06, 'QB value relative to skill players, 1QB vs superflex');
assert(qbRelative < 0.85,
  `QB relative discount is ${qbRelative.toFixed(2)}: the "multiply a quoted QB price by 0.70" rule is stale`);

// Steepest at the top is the counterintuitive half, and the one most likely to rot.
const qbSorted = oneqb.filter(p => p.pos === 'QB' && p.ktcValue && sfByName.get(norm(p.name)))
  .sort((a, b) => b.ktcValue - a.ktcValue);
const tierRel = (lo, hi) => median(qbSorted.slice(lo, hi)
  .map(p => p.ktcValue / sfByName.get(norm(p.name)).ktcValue)) / skillBaseline;
assert(tierRel(0, 6) < tierRel(24, qbSorted.length),
  'elite QBs no longer lose more converting to 1QB than late ones; the tier table is inverted');

// --- Rostership: owned% is a second market price, the owned-minus-started gap is not ---
const rows = [];
for (const p of projSkill) {
  const pl = PLAYERS[String(p.id)];
  if (!pl || pl.owned == null || pl.started == null) continue;
  rows.push({ owned: pl.owned, gap: pl.owned - pl.started, y: pts(p) });
}
const corr = (a, b) => {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; }
  return sab / Math.sqrt(saa * sbb);
};
assert(rows.length > 250, `only ${rows.length} players carry rostership data`);
const rOwned = corr(rows.map(r => r.owned), rows.map(r => r.y));
const rGap = corr(rows.map(r => r.gap), rows.map(r => r.y));
near(rOwned, 0.88, 0.10, 'owned% vs projected points correlation');
assert(rOwned > 3 * rGap,
  `owned% (r=${rOwned.toFixed(2)}) no longer dominates the owned-minus-started gap (r=${rGap.toFixed(2)}); ` +
  'the "depth trap flag is weak, use VOR" ruling needs re-deriving');

// --- Taxi: the gating question the skills used to leave unanswered ---
const taxiUsed = taco.rosters.map(r => (r.taxi || []).length);
assert(taxiUsed.some(n => n > 0),
  'no team carries taxi players; the "charge zero for a stash" ruling assumes taxi is open');
const mine = taco.rosters.find(r => r.is_me);
assert(mine, 'owner roster not found');
assert((mine.taxi || []).length <= Math.max(...taxiUsed),
  'owner taxi usage exceeds the league max, which is impossible');

// --- Player evaluation: the value-implied fit must actually be fittable ---
const kByName = new Map(oneqb.map(p => [norm(p.name), p]));
for (const pos of ['QB', 'RB', 'WR', 'TE']) {
  const R = projSkill.filter(p => p.pos === pos)
    .map(p => ({ k: kByName.get(norm(p.name)), y: pts(p) }))
    .filter(r => r.k && r.k.ktcValue)
    .map(r => ({ v: r.k.ktcValue / 100, y: r.y }));
  assert(R.length >= 25, `${pos}: only ${R.length} players on both the 1QB board and the projection list`);
  const n = R.length;
  const mx = R.reduce((s, r) => s + r.v, 0) / n, my = R.reduce((s, r) => s + r.y, 0) / n;
  let sxy = 0, sxx = 0;
  for (const r of R) { sxy += (r.v - mx) * (r.y - my); sxx += (r.v - mx) ** 2; }
  assert(sxy / sxx > 0, `${pos}: value-implied slope is not positive; divergence would invert sign`);
}

// The KTC boards truncate at 350, which is why "absent from the board" is not "worthless".
assert(oneqb.length <= 400 && oneqb.length >= 300,
  `1QB board is ${oneqb.length} entries; the truncation caveat in dynasty-player-evaluation assumes ~350`);
assert(projSkill.some(p => !kByName.has(norm(p.name)) && pts(p) > 100),
  'no projected 100+ point player is missing from the KTC board; the truncation caveat may be obsolete');

console.log('dynasty-claims: ok');
console.log(`  free pool ${free.length}/${projSkill.length} (${(freeShare * 100).toFixed(0)}%), best free QB ${bestFree.QB.toFixed(0)}`);
console.log(`  QB relative discount ${qbRelative.toFixed(3)}x over ${paired} paired players`);
console.log(`  owned% r=${rOwned.toFixed(3)}, gap r=${rGap.toFixed(3)}, n=${rows.length}`);
console.log(`  taxi used per team [${taxiUsed.join(', ')}], owner ${(mine.taxi || []).length}`);
