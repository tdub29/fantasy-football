// What a pick is actually worth in POINTS to the roster that holds it, through the same
// chain projectLeagueForward uses: pickRookiePoints(pickValueBySlot(value, originRank)) then
// productionRetention while it is held. The slot step is the one easy to quote past: it runs
// off the ORIGIN team's projected finish, so a contender's own first converts LOWER than its
// face value and a rebuilder's picks convert HIGHER.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root=`${__dirname}/..`; const ctx={window:{},console};
for(const f of ['leagues.js','projections.js','players.js','ktc.js']) vm.runInNewContext(fs.readFileSync(`${root}/data/${f}`,'utf8'),ctx);
const app=fs.readFileSync(`${__dirname}/app.js`,'utf8');
const cut=(a,b)=>{const i=app.indexOf(a),j=app.indexOf(b,i);assert(i>=0&&j>i,a);return app.slice(i,j);};
const H=new Function('window',`${cut('  const CURRENT_SEASON','  // Position aging curves')}
 function rosterOwnedPicks(){return [];}
 ${cut('function offenseStarterCount','  // Starting-lineup strength')}
 ${cut('function projUnitData()','function buildWhatIfTray')}
 return { pickRookiePoints, pickValueBySlot, productionRetention };`)(ctx.window);
const T = require('./trade-sim.js');
const N = T.lg.rosters.length, ME = T.ME, DJ = 8;
// strengthRank 1 = strongest. slotOf is 1 = weakest, so rank = N + 1 - slot.
const rankOf = rid => N + 1 - T.slotOf.get(rid);
const row = (name, season, round, origin, held) => {
  const face = T.pv(String(season), round, origin);
  const slotted = H.pickValueBySlot(face, rankOf(origin), N);
  const raw = H.pickRookiePoints(slotted);
  const aged = raw * H.productionRetention('WR', 22, held);
  console.log(`  ${name.padEnd(30)} face ${String(Math.round(face*100)).padStart(5)}  slotted ${String(Math.round(slotted*100)).padStart(5)}  rookie pts ${raw.toFixed(1).padStart(6)}  after ${held}y ${aged.toFixed(1).padStart(6)}`);
  return aged;
};
console.log(`origin ranks (1 = strongest): you ${rankOf(ME)} of ${N}, djcomstock ${rankOf(DJ)} of ${N}`);
console.log('replacement-level FLEX in this league: 104.9 season points (Mike Gesicki, unrostered)');
console.log('\nwhat each pick in these packages converts to:');
row('your own 2029 1st', 2029, 1, ME, 3);
row("djcomstock's 2027 3rd", 2027, 3, DJ, 1);
row("djcomstock's 2028 2nd", 2028, 2, DJ, 2);
row('your own 2029 2nd', 2029, 2, ME, 3);
console.log('\nheld=0, the year each converts, no aging:');
row('your own 2029 1st', 2029, 1, ME, 0);
row("djcomstock's 2027 3rd", 2027, 3, DJ, 0);
row("djcomstock's 2028 2nd", 2028, 2, DJ, 0);
