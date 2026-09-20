// Replacement level at QB and FLEX in THIS league, today. Decides what QB2/QB3 is worth.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root=`${__dirname}/..`; const ctx={window:{},console};
for(const f of ['leagues.js','projections.js','players.js','ktc.js']) vm.runInNewContext(fs.readFileSync(`${root}/data/${f}`,'utf8'),ctx);
const app=fs.readFileSync(`${__dirname}/app.js`,'utf8');
const cut=(a,b)=>{const i=app.indexOf(a),j=app.indexOf(b,i);assert(i>=0&&j>i,a);return app.slice(i,j);};
const H=new Function('window',`${cut('  const CURRENT_SEASON','  // Position aging curves')}
 function rosterOwnedPicks(){return [];}
 ${cut('function offenseStarterCount','  // Starting-lineup strength')}
 ${cut('function projUnitData()','function buildWhatIfTray')}
 return { projMap, projPoints };`)(ctx.window);
const lg=ctx.window.LEAGUES.find(l=>l.short_name==='Password is taco');
const rostered=new Set(lg.rosters.flatMap(r=>r.players||[]).map(String));
const map=H.projMap('offense');
const free=[];
for(const [pid,p] of map){ if(rostered.has(String(pid))) continue;
  const pts=H.projPoints(p,lg,'blend'); if(pts==null) continue; free.push({name:p.name,pos:p.pos,pts}); }
free.sort((a,b)=>b.pts-a.pts);
for(const pos of ['QB','RB','WR','TE']){
  const top=free.filter(f=>f.pos===pos).slice(0,4);
  console.log(pos, top.map(t=>`${t.name} ${t.pts.toFixed(1)}`).join(' | '));
}
console.log('\nbest unrostered FLEX-eligible:', free.filter(f=>f.pos!=='QB').slice(0,5).map(t=>`${t.name} ${t.pts.toFixed(1)}`).join(' | '));
console.log('rostered players in league:', rostered.size);
