// Every way to buy Tee Higgins off djcomstock, priced in title odds, both sides.
//
//   SEED=20260912 SIMS=6000 node site/js/trade-sim-higgins-counters.js
//
// The lineup answer is already known and is the same for every row: Higgins enters the
// 4th FLEX and pushes Quentin Johnston out, +57.5 season points, no matter what leaves.
// So the only thing separating these is PRICE, and price is what this prices.
'use strict';
const assert = require('node:assert/strict');
const T = require('./trade-sim.js');
const { lg, H, ME, PICKS, pv, pick, label, ktcOf, slotsUnder, startingKtc } = T;

const DJ = Number(process.env.DJ || 8);
const SCALE = Number(process.env.SCALE || 1);
const DECAY = Number(process.env.DECAY || 0.88);
const YEARS = Number(process.env.YEARS || 7);

const HIGGINS='6801', LANCE='13420', CALEB='11560', JLOVE='6804', QJ='9754', DOWNS='9500', WATSON='8167';
const BRISSETT = '3257';   // best unrostered QB: what QB2 insurance actually costs to replace

// 2029 is past the last class KTC publishes. `pv` in trade-sim.js synthesizes it now (one
// DECAY per year beyond the last published class), so this only has to extend the slate; run
// with HORIZON=3 and trade-sim builds it for every roster and this block is a no-op.
const p29 = (round, rid, whatIf) => pick('2029', round, rid, whatIf);
if (!PICKS[lg.rosters[0].roster_id].some(p => p.season === '2029')) {
  for (const r of lg.rosters) for (let rd = 1; rd <= 4; rd++) PICKS[r.roster_id].push(p29(rd, r.roster_id));
}

const L27_3 = label('2027', 3, DJ), L28_2 = label('2028', 2, DJ), L29_1 = `2029 R1 (from R${ME})`;
const L29_2 = `2029 R2 (from R${ME})`, L28_3 = label('2028', 3, ME);

const deal = (drop, spend = [], gainForDj = [], addBack = []) => ({
  [ME]: { add: [HIGGINS, ...addBack], drop, spendPicks: spend },
  [DJ]: { add: drop, drop: [HIGGINS], gainPicks: gainForDj },
});

const SCENARIOS = {
  'Stand pat': null,
  'A  Lance + 27 3rd + 28 2nd':        deal([LANCE], [L27_3, L28_2], [pick('2027', 3, DJ), pick('2028', 2, DJ)]),
  'B  Lance + own 2029 1st':           deal([LANCE], [L29_1], [p29(1, ME)]),
  'C  Caleb Williams straight up':     deal([CALEB]),
  'C+ Caleb, claim a waiver QB2':      deal([CALEB], [], [], [BRISSETT]),
  'D  Jordan Love + Lance':            deal([JLOVE, LANCE]),
  'E  Quentin Johnston + Lance':       deal([QJ, LANCE]),
  'F  Josh Downs + Lance':             deal([DOWNS, LANCE]),
  'G  Christian Watson straight up':   deal([WATSON]),
  'H  Jordan Love + own 2029 2nd':     deal([JLOVE], [L29_2], [p29(2, ME)]),
  'ceiling  Higgins for free':         { [ME]: { add: [HIGGINS] }, [DJ]: { drop: [HIGGINS] } },
};

// ONLY=A,B trims the slate to a few scenarios so a contested pair can be re-run at a sim count
// that actually resolves it. At 4,000 sims the SE of a two-path difference is about 0.67pp and
// the A-against-B gap is 1.01, which is a consistent sign and not a resolved magnitude.
const ONLY = (process.env.ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
const chosen = ONLY.length
  ? Object.entries(SCENARIOS).filter(([n]) => n === 'Stand pat' || ONLY.some(k => n.startsWith(k)))
  : Object.entries(SCENARIOS);
assert(chosen.length, `ONLY=${process.env.ONLY} matched no scenario`);
const rows = chosen.map(([n, wi]) => T.run(n, wi));
const pad = (x, n) => String(x).padEnd(n), rp = (x, n) => String(x).padStart(n);
const W = Math.max(...rows.map(r => r.name.length)) + 2;
const base = rows[0];

// price of each package on the KTC ledger, picks slotted AFTER the deal
const priceOf = {
  'A  Lance + 27 3rd + 28 2nd': () => ktcOf(LANCE) + pv('2027', 3, DJ, SCENARIOS['A  Lance + 27 3rd + 28 2nd']) * 100 + pv('2028', 2, DJ, SCENARIOS['A  Lance + 27 3rd + 28 2nd']) * 100,
  'B  Lance + own 2029 1st': () => ktcOf(LANCE) + pv('2029', 1, ME, SCENARIOS['B  Lance + own 2029 1st']) * 100,
  'C  Caleb Williams straight up': () => ktcOf(CALEB),
  'C+ Caleb, claim a waiver QB2': () => ktcOf(CALEB),
  'D  Jordan Love + Lance': () => ktcOf(JLOVE) + ktcOf(LANCE),
  'E  Quentin Johnston + Lance': () => ktcOf(QJ) + ktcOf(LANCE),
  'F  Josh Downs + Lance': () => ktcOf(DOWNS) + ktcOf(LANCE),
  'G  Christian Watson straight up': () => ktcOf(WATSON),
  'H  Jordan Love + own 2029 2nd': () => ktcOf(JLOVE) + pv('2029', 2, ME, SCENARIOS['H  Jordan Love + own 2029 2nd']) * 100,
};
const HIG = ktcOf(HIGGINS);

console.log('');
console.log(`Password is taco | ${YEARS} seasons | ${process.env.SIMS || 2500} sims | seed ${process.env.SEED || 20260912} | SCALE ${SCALE} | DECAY ${DECAY}`);
console.log(pad('scenario', W) + rp('title26', 9) + rp('playoff', 9) + rp('equity', 9) + rp('d-equity', 10) + rp('KTC out', 9) + rp('vs 5779', 9));
for (const r of rows) {
  const p = priceOf[r.name] ? Math.round(priceOf[r.name]()) : null;
  console.log(pad(r.name, W) + rp(`${(r.y0.title * 100).toFixed(2)}%`, 9)
    + rp(`${(r.y0.playoff * 100).toFixed(1)}%`, 9)
    + rp((r.equity * 100).toFixed(2), 9)
    + rp(((r.equity - base.equity) * 100).toFixed(2), 10)
    + rp(p == null ? '-' : p, 9)
    + rp(p == null ? '-' : `${((p / HIG - 1) * 100).toFixed(0)}%`, 9));
}
console.log('');
console.log('per-year title odds (%)');
for (const r of rows) console.log('  ' + pad(r.name, W) + r.byYear.map(y => `${y.season}:${(y.title * 100).toFixed(1)}`).join('  '));

// headliner / consolidation check, the site's own rule
function consolidationPremium(aSize, bSize, aHead, bHead) {
  if (!aSize || !bSize || aHead <= 0 || bHead <= 0) return { side: null, pct: 0 };
  const aBigger = aHead >= bHead, hiHead = aBigger ? aHead : bHead, loHead = aBigger ? bHead : aHead;
  const hiSize = aBigger ? aSize : bSize, loSize = aBigger ? bSize : aSize;
  const gap = 1 - loHead / hiHead, extra = Math.max(0, loSize - hiSize), spread = Math.min(1, extra / 3);
  return { side: (0.15 * gap * spread) > 0 ? (aBigger ? 'A' : 'B') : null, pct: 0.15 * gap * spread };
}
const packages = {
  'A  Lance + 27 3rd + 28 2nd': [ktcOf(LANCE), pv('2027', 3, DJ) * 100, pv('2028', 2, DJ) * 100],
  'B  Lance + own 2029 1st': [ktcOf(LANCE), pv('2029', 1, ME) * 100],
  'C  Caleb Williams straight up': [ktcOf(CALEB)],
  'D  Jordan Love + Lance': [ktcOf(JLOVE), ktcOf(LANCE)],
  'E  Quentin Johnston + Lance': [ktcOf(QJ), ktcOf(LANCE)],
  'F  Josh Downs + Lance': [ktcOf(DOWNS), ktcOf(LANCE)],
  'G  Christian Watson straight up': [ktcOf(WATSON)],
  'H  Jordan Love + own 2029 2nd': [ktcOf(JLOVE), pv('2029', 2, ME) * 100],
};
console.log('');
console.log('site Trade Lab verdict (headliner rule + consolidation premium)');
console.log('  ' + pad('package', W) + rp('out', 8) + rp('head', 7) + rp('prem', 7) + rp('fairness', 10) + '  verdict');
for (const [name, parts] of Object.entries(packages)) {
  const out = parts.reduce((s, x) => s + x, 0), head = Math.max(...parts);
  const prem = consolidationPremium(parts.length, 1, head, HIG);
  const adjDj = HIG * (1 + (prem.side === 'B' ? prem.pct : 0));
  const fair = Math.min(out, adjDj) / Math.max(out, adjDj) * 100;
  const verdict = fair >= 90 ? 'FAIR' : fair >= 75 ? 'CLOSE' : (out > adjDj ? 'WIN FOR DJCOMSTOCK' : 'WIN FOR YOU');
  console.log('  ' + pad(name, W) + rp(Math.round(out), 8) + rp(Math.round(head), 7)
    + rp(`${(prem.pct * 100).toFixed(1)}%`, 7) + rp(`${fair.toFixed(0)}%`, 10) + '  ' + verdict);
}
