// yuH: the McCaffrey package Nathanmetz was sent, priced in title odds, both sides.
//
//   LEAGUE=yuH SEED=20260912 SIMS=6000 node site/js/trade-sim-yuh-cmc.js
//   LEAGUE=yuH SEED=777001  SIMS=6000 node site/js/trade-sim-yuh-cmc.js
//   LEAGUE=yuH SCALE=1.3 ... node ...   # the sensitivity that decides picks-for-players
//
// The real proposal is NOT Breece straight up. You send Hall, MarShawn Lloyd AND your
// own 2027 1st, and get McCaffrey plus Nathanmetz's 2027 3rd. Both versions are priced
// here because the straight-up row is the ceiling the real one is measured against.
//
// McCaffrey is 30 and Hall is 25, so CLAUDE.md's rule applies: a multi-year
// picks-for-players verdict is not done until SCALE=1.3 has been run.
'use strict';
process.env.LEAGUE = process.env.LEAGUE || 'yuH';
const T = require('./trade-sim.js');
const { ME, lg, PICKS, pick, label, pv, ktcOf } = T;

const CMC = '4034', BREECE = '8155', LLOYD = '11581';
const NATHAN = 7;   // McCaffrey's owner, verified against the live pull

const L27_1_ME = label('2027', 1, ME);    // your own first, the real cost
const L27_3_NA = label('2027', 3, NATHAN);

const SCENARIOS = {
  'Stand pat': null,
  'As proposed: Hall + Lloyd + your 27 1st': {
    [ME]:     { add: [CMC], drop: [BREECE, LLOYD],
                spendPicks: [L27_1_ME], gainPicks: [pick('2027', 3, NATHAN)] },
    [NATHAN]: { add: [BREECE, LLOYD], drop: [CMC],
                spendPicks: [L27_3_NA], gainPicks: [pick('2027', 1, ME)] },
  },
  'For reference: Hall straight up': {
    [ME]:     { add: [CMC], drop: [BREECE] },
    [NATHAN]: { add: [BREECE], drop: [CMC] },
  },
};

const rows = Object.entries(SCENARIOS).map(([n, wi]) => T.run(n, wi));
const pad = (x, n) => String(x).padEnd(n), rp = (x, n) => String(x).padStart(n);
const W = Math.max(...rows.map(r => r.name.length)) + 2;
const base = rows[0];
console.log('');
console.log(`yuH  |  ${process.env.YEARS || 7} seasons  |  ${process.env.SIMS || 2500} sims  `
          + `|  seed ${process.env.SEED || 20260912}  |  SCALE ${process.env.SCALE || 1}`);
console.log(pad('scenario', W) + rp('title26', 9) + rp('playoff', 9) + rp('equity', 9) + rp('vs pat', 9));
for (const r of rows) {
  console.log(pad(r.name, W) + rp(`${(r.y0.title * 100).toFixed(2)}%`, 9)
    + rp(`${(r.y0.playoff * 100).toFixed(1)}%`, 9)
    + rp((r.equity * 100).toFixed(2), 9)
    + rp(r === base ? '' : ((r.equity - base.equity) * 100).toFixed(2), 9));
}
// What the package actually costs on the ledger, picks slotted AFTER the deal.
const deal = SCENARIOS['As proposed: Hall + Lloyd + your 27 1st'];
const out = ktcOf(BREECE) + ktcOf(LLOYD) + pv('2027', 1, ME, deal) * 100;
const back = ktcOf(CMC) + pv('2027', 3, NATHAN, deal) * 100;
console.log('');
console.log(`KTC ledger, post-deal slotting: you send ${Math.round(out)}, you get ${Math.round(back)}`
          + `  (${out > back ? '+' : ''}${Math.round((out / back - 1) * 100)}% overpay)`);
console.log(`  Hall ${ktcOf(BREECE)} + Lloyd ${ktcOf(LLOYD)} + your 2027 1st ${Math.round(pv('2027',1,ME,deal)*100)}`);
console.log(`  McCaffrey ${ktcOf(CMC)} + his 2027 3rd ${Math.round(pv('2027',3,NATHAN,deal)*100)}`);
