// SUPERSEDED 2026-09-16. First pass at the Tee Higgins lineup question, kept because it is
// what the numbers were first read off. Use _lineup-cost.js (lineup delta per package, both
// rosters) and _depth-cost.js (what thinning the bench costs) instead: they cover this and the
// bench-robustness case this one misses, and one of the ids in here was wrong.
// What Tee Higgins actually does to the starting lineup, in projected points.
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const root = `${__dirname}/..`;
const ctx = { window: {}, console };
for (const f of ['leagues.js', 'projections.js', 'players.js', 'ktc.js']) {
  vm.runInNewContext(fs.readFileSync(`${root}/data/${f}`, 'utf8'), ctx);
}
const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const cut = (a, b) => { const i = app.indexOf(a), j = app.indexOf(b, i); assert(i >= 0 && j > i, `slice failed: ${a}`); return app.slice(i, j); };
const H = new Function('window',
  `${cut('  const CURRENT_SEASON', '  // Position aging curves')}
   function rosterOwnedPicks(){ return []; }
   ${cut('function offenseStarterCount', '  // Starting-lineup strength')}
   ${cut('function projUnitData()', 'function buildWhatIfTray')}
   return { optimalOffense, offenseStartingSlots, startableIds, isSidelined, projPoints, projMap, fillLineup };`
)(ctx.window);

const lg = ctx.window.LEAGUES.find(l => l.short_name === 'Password is taco');
const me = lg.rosters.find(r => r.is_me);
const dj = lg.rosters.find(r => r.roster_id === 8);
const HIGGINS = '6801', LANCE = '13420';
console.log('slots:', H.offenseStartingSlots(lg).join(','));

const variant = (roster, add, drop) => {
  const r = { ...roster, players: [...(roster.players || []).filter(p => !drop.includes(String(p))), ...add] };
  return H.optimalOffense(r, lg, 'blend');
};
const show = (tag, res) => {
  console.log(`\n${tag}  TOTAL ${res.total}`);
  for (const p of res.picks) console.log(`   ${String(p.pos).padEnd(3)} ${p.name.padEnd(24)} ${p.pts.toFixed(1)}`);
};
const base = variant(me, [], []);
const withH = variant(me, [HIGGINS], []);
const withHnoL = variant(me, [HIGGINS], [LANCE]);
show('YOU, today', base);
show('YOU, + Tee Higgins - Bryce Lance', withHnoL);
console.log(`\nweekly starting-lineup delta: ${(withHnoL.total - base.total).toFixed(1)} pts  (${((withHnoL.total/base.total-1)*100).toFixed(1)}%)`);
const djb = variant(dj, [], []);
const dja = variant(dj, [LANCE], [HIGGINS]);
show('djcomstock, today', djb);
console.log(`\ndjcomstock delta after the deal: ${(dja.total - djb.total).toFixed(1)} pts`);

// Who on your bench is already better than the man Higgins displaces?
const map = H.projMap('offense');
const rows = [...new Set(H.startableIds(me))].map(pid => {
  const p = map.get(pid); if (!p) return null;
  return { name: p.name, pos: p.pos, pts: H.projPoints(p, lg, 'blend'), out: H.isSidelined(pid) };
}).filter(x => x && x.pos === 'WR').sort((a, b) => (b.pts || 0) - (a.pts || 0));
const hig = map.get(HIGGINS);
console.log('\nyour WR room by 2026 projected points (blend):');
for (const r of rows) console.log(`   ${r.name.padEnd(22)} ${String(r.pts == null ? '-' : r.pts.toFixed(1)).padStart(7)}${r.out ? '   [sidelined]' : ''}`);
console.log(`   ---- Tee Higgins would enter at ${H.projPoints(hig, lg, 'blend').toFixed(1)}`);
