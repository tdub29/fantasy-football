// What each counter costs in DEPTH, not in the starting lineup. The lineup number is
// identical for A/B/C/D/E; the difference only appears when a starter misses.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root=`${__dirname}/..`; const ctx={window:{},console};
for(const f of ['leagues.js','projections.js','players.js','ktc.js']) vm.runInNewContext(fs.readFileSync(`${root}/data/${f}`,'utf8'),ctx);
const app=fs.readFileSync(`${__dirname}/app.js`,'utf8');
const cut=(a,b)=>{const i=app.indexOf(a),j=app.indexOf(b,i);assert(i>=0&&j>i,a);return app.slice(i,j);};
const H=new Function('window',`${cut('  const CURRENT_SEASON','  // Position aging curves')}
 function rosterOwnedPicks(){return [];}
 ${cut('function offenseStarterCount','  // Starting-lineup strength')}
 ${cut('function projUnitData()','function buildWhatIfTray')}
 return { optimalOffense, injuryHazard };`)(ctx.window);
const lg=ctx.window.LEAGUES.find(l=>l.short_name==='Password is taco');
const me=lg.rosters.find(r=>r.is_me);
const ID={HIG:'6801',LANCE:'13420',CALEB:'11560',JLOVE:'6804',QJ:'9754'};
const roster=(add,drop)=>({...me,players:[...(me.players||[]).filter(p=>!drop.includes(String(p))),...add]});
const tot=r=>H.optimalOffense(r,lg,'blend').total;
const PKG={
 'today':roster([],[]),
 'A/B  Lance out':roster([ID.HIG],[ID.LANCE]),
 'C    Caleb out':roster([ID.HIG],[ID.CALEB]),
 'D    Love+Lance out':roster([ID.HIG],[ID.JLOVE,ID.LANCE]),
 'E    Johnston+Lance out':roster([ID.HIG],[ID.QJ,ID.LANCE]),
};
// knock out each of the 10 starters in turn, see what the lineup falls to
console.log('lineup after losing ONE starter for the season, worst case by starter');
const base={};
for(const [n,r] of Object.entries(PKG)){
  const picks=H.optimalOffense(r,lg,'blend').picks;
  const full=tot(r); base[n]=full;
  let worst=1e9, worstName='';
  for(const s of picks){
    const pid=[...new Set(r.players)].find(p=>(ctx.window.PLAYERS[p]||{}).name===s.name);
    const t=tot({...r,players:r.players.filter(p=>String(p)!==String(pid))});
    if(t<worst){worst=t;worstName=s.name;}
  }
  const avg=picks.reduce((acc,s)=>{
    const pid=[...new Set(r.players)].find(p=>(ctx.window.PLAYERS[p]||{}).name===s.name);
    return acc+tot({...r,players:r.players.filter(p=>String(p)!==String(pid))});
  },0)/picks.length;
  console.log(`  ${n.padEnd(24)} full ${full.toFixed(1)}   avg after one loss ${avg.toFixed(1)} (-${(full-avg).toFixed(1)})   worst ${worst.toFixed(1)} losing ${worstName}`);
}
console.log('\ndepth cost of each counter vs the A/B version (which keeps Johnston):');
for(const n of ['C    Caleb out','D    Love+Lance out','E    Johnston+Lance out']){
  console.log(`  ${n.padEnd(24)} same lineup, ${(base[n]-base['A/B  Lance out']).toFixed(1)} starting points`);
}
