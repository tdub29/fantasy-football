// What each package actually costs the STARTING LINEUP, not the KTC ledger.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root=`${__dirname}/..`; const ctx={window:{},console};
for(const f of ['leagues.js','projections.js','players.js','ktc.js']) vm.runInNewContext(fs.readFileSync(`${root}/data/${f}`,'utf8'),ctx);
const app=fs.readFileSync(`${__dirname}/app.js`,'utf8');
const cut=(a,b)=>{const i=app.indexOf(a),j=app.indexOf(b,i);assert(i>=0&&j>i,a);return app.slice(i,j);};
const H=new Function('window',`${cut('  const CURRENT_SEASON','  // Position aging curves')}
 function rosterOwnedPicks(){return [];}
 ${cut('function offenseStarterCount','  // Starting-lineup strength')}
 ${cut('function projUnitData()','function buildWhatIfTray')}
 return { optimalOffense, projMap, projPoints };`)(ctx.window);
const lg=ctx.window.LEAGUES.find(l=>l.short_name==='Password is taco');
const me=lg.rosters.find(r=>r.is_me), dj=lg.rosters.find(r=>r.roster_id===8);
const ID={HIGGINS:'6801',LANCE:'13420',CALEB:'11560',JLOVE:'6804',QJ:'9754',DOWNS:'9500',WATSON:'8167',BRISSETT:'3257',GESICKI:'4033'};
const map=H.projMap('offense');
for(const [k,v] of Object.entries(ID)){const p=map.get(v);console.log(k.padEnd(10),p?`${p.name} ${H.projPoints(p,lg,'blend').toFixed(1)}`:'NOT FOUND '+v);}
const v=(roster,add,drop)=>H.optimalOffense({...roster,players:[...(roster.players||[]).filter(p=>!drop.includes(String(p))),...add]},lg,'blend').total;
const base=v(me,[],[]);
const deals={
 'A  Lance + 27 3rd + 28 2nd':[[ID.HIGGINS],[ID.LANCE]],
 'B  Lance + own 2029 1st':[[ID.HIGGINS],[ID.LANCE]],
 'C  Caleb Williams straight':[[ID.HIGGINS],[ID.CALEB]],
 'D  Jordan Love + Lance':[[ID.HIGGINS],[ID.JLOVE,ID.LANCE]],
 'E  Quentin Johnston + Lance':[[ID.HIGGINS],[ID.QJ,ID.LANCE]],
 'F  Josh Downs + Lance':[[ID.HIGGINS],[ID.DOWNS,ID.LANCE]],
 'G  Christian Watson straight':[[ID.HIGGINS],[ID.WATSON]],
 'H  Jordan Love + 2029 2nd':[[ID.HIGGINS],[ID.JLOVE]],
 '(control) Higgins for free':[[ID.HIGGINS],[]],
};
console.log('\nyour best legal lineup, base',base.toFixed(1),'season points');
for(const [n,[a,d]] of Object.entries(deals)) console.log('  '+n.padEnd(30), '+'+(v(me,a,d)-base).toFixed(1));
const db=v(dj,[],[]);
console.log('\ndjcomstock base',db.toFixed(1));
for(const [n,d] of Object.entries({'gets Caleb':[ID.CALEB],'gets Jordan Love':[ID.JLOVE],'gets Love+Lance':[ID.JLOVE,ID.LANCE],'gets QJ+Lance':[ID.QJ,ID.LANCE],'gets Lance only':[ID.LANCE],'gets Watson':[ID.WATSON]}))
  console.log('  '+n.padEnd(20),(v(dj,d,[ID.HIGGINS])-db).toFixed(1));
