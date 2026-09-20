// SUPERSEDED 2026-09-16. First pass at the Tee Higgins lineup question, kept because it is
// what the numbers were first read off. Use _lineup-cost.js (lineup delta per package, both
// rosters) and _depth-cost.js (what thinning the bench costs) instead: they cover this and the
// bench-robustness case this one misses, and one of the ids in here was wrong.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root=`${__dirname}/..`; const ctx={window:{},console};
for(const f of ['leagues.js','projections.js','players.js','ktc.js']) vm.runInNewContext(fs.readFileSync(`${root}/data/${f}`,'utf8'),ctx);
const app=fs.readFileSync(`${__dirname}/app.js`,'utf8');
const cut=(a,b)=>{const i=app.indexOf(a),j=app.indexOf(b,i);assert(i>=0&&j>i,a);return app.slice(i,j);};
const H=new Function('window',`${cut('  const CURRENT_SEASON','  // Position aging curves')}
 function rosterOwnedPicks(){return [];}
 ${cut('function offenseStarterCount','  // Starting-lineup strength')}
 ${cut('function projUnitData()','function buildWhatIfTray')}
 return { projMap, projPoints, optimalOffense };`)(ctx.window);
const lg=ctx.window.LEAGUES.find(l=>l.short_name==='Password is taco');
const map=H.projMap('offense');
for(const [pid,nm] of [['11560','Caleb Williams'],['6804','Jordan Love'],['4984','Josh Allen'],['6801','Tee Higgins'],['13420','Bryce Lance']]){
  const p=map.get(pid); console.log(nm.padEnd(18), p?H.projPoints(p,lg,'blend').toFixed(1):'--');
}
// counters, in lineup points
const me=lg.rosters.find(r=>r.is_me), dj=lg.rosters.find(r=>r.roster_id===8);
const v=(roster,add,drop)=>H.optimalOffense({...roster,players:[...(roster.players||[]).filter(p=>!drop.includes(String(p))),...add]},lg,'blend');
const b=v(me,[],[]).total, db=v(dj,[],[]).total;
const deals={
 'A: Lance+27.3+28.2 -> Higgins':[['6801'],['13420']],
 'B: Lance+2029 1st -> Higgins':[['6801'],['13420']],
 'C: Caleb Williams -> Higgins':[['6801'],['11560']],
 'D: Jordan Love+Lance -> Higgins':[['6801'],['6804','13420']],
 'E: Quentin Johnston+Lance -> Higgins':[['6801'],['9997','13420']],
};
console.log('\nyour starting-lineup season points, base',b);
for(const [n,[add,drop]] of Object.entries(deals)) console.log('  '+n.padEnd(40), (v(me,add,drop).total-b).toFixed(1));
console.log('\ndjcomstock base',db);
const djd={'C: gets Caleb, loses Higgins':[['11560'],['6801']],'D: gets Love+Lance':[['6804','13420'],['6801']],'A/B: gets Lance':[['13420'],['6801']]};
for(const [n,[add,drop]] of Object.entries(djd)) console.log('  '+n.padEnd(40),(v(dj,add,drop).total-db).toFixed(1));
