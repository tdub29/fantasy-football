// Price the djcomstock Tee Higgins offer in TITLE ODDS, both sides, both variants.
//
//   node site/js/trade-sim-higgins.js
//   SEED=777001 node site/js/trade-sim-higgins.js
//   SCALE=1.3 node site/js/trade-sim-higgins.js
//
// Variant A is the proposal on the Sleeper screen: Bryce Lance + the 2027 3rd and the
// 2028 2nd that came FROM djcomstock, back to djcomstock, for Tee Higgins.
// Variant B is the one he asked about in text: Bryce Lance + his own 2029 1st.
//
// 2029 is not in KTC (it stops at 2028), so a 2029 class is synthesized as the 2028
// anchors times DECAY and handed to EVERY roster, not just his, so the baseline is fair.
// DECAY=0.88 by default; the 2027->2028 step measured on live KTC is 0.82-0.86 and that
// step also unwinds the Jeremiah Smith premium sitting on 2027, so 0.88 is the honest
// middle. Run DECAY=0.80 and DECAY=1.00 before trusting a sign.
'use strict';
const T = require('./trade-sim.js');
const { lg, H, ME, PICKS, pv, pick, label, slotsUnder, startingKtc, ktcOf, repriceUnder } = T;

const DJ = lg.rosters.find(r => (r.display_name || r.owner || '').toLowerCase().includes('djcomstock'))?.roster_id
        ?? Number(process.env.DJ || 8);
const SCALE = Number(process.env.SCALE || 1);
const DECAY = Number(process.env.DECAY || 0.88);
const YEARS = Number(process.env.YEARS || 7);
const SIMS = Number(process.env.SIMS || 2500);

const HIGGINS = '6801', LANCE = '13420';

// ---- give every roster its own 2029 class, priced off 2028 x DECAY.
const p29 = (round, rid, whatIf) => ({
  season: '2029', round, originRosterId: rid,
  label: `2029 R${round} (from R${rid})`,
  value: Math.round(pv('2028', round, rid, whatIf) * DECAY * SCALE * 10) / 10,
});
for (const r of lg.rosters) {
  for (let round = 1; round <= 4; round++) PICKS[r.roster_id].push(p29(round, r.roster_id));
}

const L27_3 = label('2027', 3, DJ);     // djcomstock's own 2027 3rd, currently his
const L28_2 = label('2028', 2, DJ);     // djcomstock's own 2028 2nd, currently his
const L29_1 = `2029 R1 (from R${ME})`;  // his own, and his ONLY future first

const dealA = {
  [ME]: { add: [HIGGINS], drop: [LANCE], spendPicks: [L27_3, L28_2] },
  [DJ]: { add: [LANCE], drop: [HIGGINS],
          gainPicks: [pick('2027', 3, DJ), pick('2028', 2, DJ)] },
};
const dealB = {
  [ME]: { add: [HIGGINS], drop: [LANCE], spendPicks: [L29_1] },
  [DJ]: { add: [LANCE], drop: [HIGGINS], gainPicks: [p29(1, ME)] },
};
// Control: is Higgins worth anything at all on this roster, ignoring price?
const free = { [ME]: { add: [HIGGINS] }, [DJ]: { drop: [HIGGINS] } };
// Control: what does Lance alone cost him?
const lanceOnly = { [ME]: { drop: [LANCE] }, [DJ]: { add: [LANCE] } };

const SCENARIOS = {
  'Stand pat': null,
  'A: Lance + 27 3rd + 28 2nd for Higgins': dealA,
  'B: Lance + own 2029 1st for Higgins': dealB,
  'ceiling: Higgins for free': free,
  'floor: drop Lance for nothing': lanceOnly,
};

const rows = Object.entries(SCENARIOS).map(([n, wi]) => T.run(n, wi));
const pad = (x, n) => String(x).padEnd(n), rp = (x, n) => String(x).padStart(n);
const W = Math.max(...rows.map(r => r.name.length)) + 2;
const base = rows[0];
console.log('');
console.log(`Password is taco | ${YEARS} seasons | ${SIMS} sims | seed ${process.env.SEED || 20260912} | SCALE ${SCALE} | DECAY ${DECAY}`);
console.log(pad('scenario', W) + rp('title26', 9) + rp('playoff', 9) + rp('rank', 6) + rp('equity', 9) + rp('d-equity', 10));
for (const r of rows) {
  console.log(pad(r.name, W) + rp(`${(r.y0.title * 100).toFixed(2)}%`, 9)
    + rp(`${(r.y0.playoff * 100).toFixed(1)}%`, 9) + rp(r.y0.rank, 6)
    + rp((r.equity * 100).toFixed(2), 9)
    + rp(((r.equity - base.equity) * 100).toFixed(2), 10));
}
console.log('');
console.log('per-year title odds (%)');
for (const r of rows) console.log('  ' + pad(r.name, W) + r.byYear.map(y => `${y.season}:${(y.title * 100).toFixed(1)}`).join('  '));

console.log('');
console.log('pick prices, before the deal vs after it (site scale, KTC/100)');
const reprice = (name, wi) => {
  console.log(`  -- ${name}`);
  for (const row of repriceUnder(wi, [['2027', 3, DJ, `2027 3rd (djcomstock's own)`], ['2028', 2, DJ, `2028 2nd (djcomstock's own)`]]))
    console.log(`     ${pad(row.name, 34)} ${rp(row.before, 7)} -> ${rp(row.after, 7)}  (${row.diff >= 0 ? '+' : ''}${row.diff})`);
  const b = pv('2028', 1, ME), a = pv('2028', 1, ME, wi);
  console.log(`     ${pad('2029 1st (his own, via 2028x' + DECAY + ')', 34)} ${rp((b * DECAY).toFixed(1), 7)} -> ${rp((a * DECAY).toFixed(1), 7)}`);
};
reprice('deal A', dealA); reprice('deal B', dealB);

console.log('');
console.log('projected draft slots (1 = picks first = weakest starting lineup)');
const s0 = slotsUnder(null), sA = slotsUnder(dealA), sB = slotsUnder(dealB);
for (const r of lg.rosters.slice().sort((x, y) => s0.get(x.roster_id) - s0.get(y.roster_id))) {
  const tag = r.roster_id === ME ? ' <- you' : (r.roster_id === DJ ? ' <- djcomstock' : '');
  console.log(`   slot ${rp(s0.get(r.roster_id), 2)}  R${rp(r.roster_id, 2)}  startKTC ${rp(startingKtc(r, null), 7)}  (A:${sA.get(r.roster_id)} B:${sB.get(r.roster_id)})${tag}`);
}

console.log('');
console.log(`KTC ledger (raw, 1QB): Higgins ${ktcOf(HIGGINS)} | Lance ${ktcOf(LANCE)}`);
console.log(`  deal A out: Lance ${ktcOf(LANCE)} + 2027R3@dj ${(pv('2027', 3, DJ, dealA) * 100).toFixed(0)} + 2028R2@dj ${(pv('2028', 2, DJ, dealA) * 100).toFixed(0)}`);
console.log(`  deal B out: Lance ${ktcOf(LANCE)} + 2029R1@me ${(pv('2028', 1, ME, dealB) * DECAY * 100).toFixed(0)}`);
