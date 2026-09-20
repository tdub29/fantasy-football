// Roster shape for the Higgins call: concentration, startable bodies, value share, age.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root=`${__dirname}/..`; const ctx={window:{},console};
for(const f of ['leagues.js','projections.js','players.js','ktc.js']) vm.runInNewContext(fs.readFileSync(`${root}/data/${f}`,'utf8'),ctx);
const app=fs.readFileSync(`${__dirname}/app.js`,'utf8');
const cut=(a,b)=>{const i=app.indexOf(a),j=app.indexOf(b,i);assert(i>=0&&j>i,a);return app.slice(i,j);};
const H=new Function('window',`${cut('  const CURRENT_SEASON','  // Position aging curves')}
 function rosterOwnedPicks(){return [];}
 ${cut('function offenseStarterCount','  // Starting-lineup strength')}
 ${cut('function projUnitData()','function buildWhatIfTray')}
 return { projMap, projPoints, startableIds, isSidelined };`)(ctx.window);
const lg=ctx.window.LEAGUES.find(l=>l.short_name==='Password is taco');
const rank=ctx.window.RANKINGS_SOURCES.find(s=>s.id==='keeptradecut').rankings.find(r=>r.id==='ktc-oneqb');
const norm=s=>(s||'').normalize('NFD').replace(/[^a-zA-Z]/g,'').toLowerCase();
const ktc=new Map(rank.players.map(p=>[norm(p.name),p.ktcValue]));
const anchor=new Map(rank.picks.map(p=>[`${p.season}|${p.slot}|${p.round}`,p.ktcValue]));
const map=H.projMap('offense');
const me=lg.rosters.find(r=>r.is_me);
const N=lg.rosters.length;

const rows=[...new Set(me.players||[])].map(pid=>{
  const p=ctx.window.PLAYERS[pid]; if(!p) return null;
  const pr=map.get(pid);
  return { pid, name:p.name, pos:p.pos, age:p.age, v:ktc.get(norm(p.name))||0,
           pts: pr?H.projPoints(pr,lg,'blend'):null, taxi:(me.taxi||[]).includes(pid), ir:(me.reserve||[]).includes(pid) };
}).filter(Boolean).sort((a,b)=>b.v-a.v);
const tot=rows.reduce((s,r)=>s+r.v,0);
console.log('roster KTC total (players only):',tot);
console.log('top 3:',rows.slice(0,3).map(r=>`${r.name} ${r.v}`).join(', '));
console.log('top-3 share:',((rows.slice(0,3).reduce((s,r)=>s+r.v,0)/tot)*100).toFixed(1)+'%');
// Count by SLOT, not by headcount. Three of these are quarterbacks and this is a 1QB league,
// so a raw 14 reads as "13-14 target, no depth problem" while the non-QB room that fills 9 of
// the 10 slots is much thinner. Caught by an adversarial pass 2026-09-16.
const live=rows.filter(r=>!r.taxi&&!r.ir&&(r.pts||0)>=136);
const qbSlots=(lg.roster_positions||[]).filter(s=>s==='QB').length;
const superflex=(lg.roster_positions||[]).some(s=>s==='SUPER_FLEX');
const nonQbSlots=(lg.roster_positions||[]).filter(s=>!['BN','IR','TAXI','QB'].includes(s)).length;
const liveQb=live.filter(r=>r.pos==='QB').length, liveOther=live.length-liveQb;
console.log('startable bodies over replacement (>=136 season pts):',live.length,'=',liveQb,'QB +',liveOther,'non-QB');
console.log(`  slots to fill: ${qbSlots} QB + ${nonQbSlots} non-QB${superflex?' (superflex, QBs are flex-eligible)':''}`);
console.log(`  real coverage: ${liveOther} non-QB bodies for ${nonQbSlots} non-QB slots`+(superflex?'':`, and the ${liveQb-qbSlots} spare QB(s) cover none of them`));
console.log('bodies with any projection:',rows.filter(r=>!r.taxi&&!r.ir&&r.pts!=null).length);
// value share across the league, players + picks
const leagueVals=lg.rosters.map(r=>{
  const pv=[...new Set(r.players||[])].reduce((s,pid)=>{const p=ctx.window.PLAYERS[pid];return s+(p?(ktc.get(norm(p.name))||0):0);},0);
  return { id:r.roster_id, pv };
});
const lt=leagueVals.reduce((s,r)=>s+r.pv,0);
console.log('\nplayer-value share (no picks), baseline',(100/N).toFixed(2)+'%');
for(const r of leagueVals.sort((a,b)=>b.pv-a.pv)) console.log(`   R${String(r.id).padStart(2)} ${String(r.pv).padStart(7)}  ${((r.pv/lt)*100).toFixed(2)}%${r.id===me.roster_id?'  <- you':''}`);
console.log('\nyour roster, by KTC');
for(const r of rows) console.log(`   ${String(r.v).padStart(5)}  ${r.pos} ${String(r.age).padStart(2)}  ${r.name.padEnd(22)} ${String(r.pts==null?'-':r.pts.toFixed(0)).padStart(5)}${r.taxi?' taxi':''}${r.ir?' IR':''}`);
// WR age concentration
// !r.ir as well as !r.taxi: a man on IR is not part of the age profile you can field.
const wrs=rows.filter(r=>r.pos==='WR'&&!r.taxi&&!r.ir);
const wrIr=rows.filter(r=>r.pos==='WR'&&r.ir);
const wv=wrs.reduce((s,r)=>s+r.v,0);
console.log('\nWR room:',wrs.length,'fieldable bodies,',wv,'KTC =',((wv/tot)*100).toFixed(0)+'% of your player value');
if(wrIr.length) console.log('   excluded, on IR:',wrIr.map(r=>`${r.name} (${r.age})`).join(', '));
for(const band of [[21,24],[25,28],[29,40]]){
  const g=wrs.filter(r=>r.age>=band[0]&&r.age<=band[1]);
  console.log(`   age ${band[0]}-${band[1]}: ${g.length} bodies, ${g.reduce((s,r)=>s+r.v,0)} KTC, ${g.map(r=>r.name).join(', ')}`);
}
