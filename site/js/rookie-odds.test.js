// Champ % and 1.01 % in standings. Each is one outcome per simulated season, so
// a column must sum to 100%; a rule the site cannot model shows no number at all.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const root = `${__dirname}/..`;
const ctx = { window: {} };
for (const f of ['leagues.js', 'projections.js', 'schedule.js']) vm.runInNewContext(fs.readFileSync(`${root}/data/${f}`, 'utf8'), ctx);
const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const cut = (a, b) => {
  const i = app.indexOf(a), j = app.indexOf(b, i);
  assert(i >= 0 && j > i, `slice failed: ${a}`);
  return app.slice(i, j);
};
const H = new Function('window',
  `${cut('  const CURRENT_SEASON', '  // Position aging curves')}
   function rosterOwnedPicks() { return []; }
   ${cut('function isDynastyLeague(lg)', '  // The league whose format defines VOR replacement')}
   ${cut('  let _rosPts = null;', '  // Replacement level on the SAME rest-of-season basis')}
   ${cut('function offenseStarterCount', '  // Starting-lineup strength')}
   ${cut('  const ODDS_CACHE', '  const PROJ_SRC_LABEL')}
   ${cut('function projUnitData()', 'function buildWhatIfTray')}
   return { championshipOdds, standingsForecast, rookieOrderRule, rookieOrderNote };`
)(ctx.window);
ctx.window.PLAYERS = ctx.window.PLAYERS || {};
const byName = name => ctx.window.LEAGUES.find(l => l.short_name === name);
const sum = (rows, k) => rows.reduce((s, o) => s + o[k], 0);

const expected = { 'The League': 'maxpf', 'Password is taco': 'lottery', yuH: 'record' };
for (const [name, rule] of Object.entries(expected)) {
  const lg = byName(name);
  assert.equal(H.rookieOrderRule(lg), rule, `${name} rookie rule`);
  const res = H.championshipOdds(lg, { sims: 1500, withMaxPf: true });
  assert.equal(res.meta.rookie, rule, `${name} must model its rule`);
  assert(Math.abs(sum(res, 'title') - 1) < 1e-9, `${name} Champ % sums to ${sum(res, 'title')}`);
  assert(Math.abs(sum(res, 'first') - 1) < 1e-9, `${name} 1.01 % sums to ${sum(res, 'first')}`);
  // 1.01 never goes to a team that made the playoffs in that season.
  for (const o of res) assert(o.first <= 1 - o.playoff + 1e-9, `${name} ${o.teamName}: 1.01 ${o.first} vs playoff ${o.playoff}`);
  if (rule === 'lottery') assert(res.every(o => o.first <= 0.4 + 1e-9), 'no taco team beats the top lottery weight');
  const fc = H.standingsForecast(lg, { sims: 1500 });
  if (fc.ok) {
    assert.equal(fc.rookie, rule);
    assert(Math.abs([...fc.rows.values()].reduce((s, f) => s + f.first, 0) - 1) < 1e-9, `${name} forecast 1.01 sum`);
  }
}

// Max PF missing once games are played: n/a, never a guess.
const tl = byName('The League');
const stripped = H.championshipOdds({ ...tl, rosters: tl.rosters.map(r => ({ ...r, ppts: null })) }, { sims: 200, withMaxPf: true });
assert(stripped.meta.played, 'seeded from real standings, so accrued Max PF is required');
assert.equal(stripped.meta.rookie, null, 'missing Max PF must not be modeled');
assert(stripped.every(o => o.first === null && o.expMaxPf === null), 'no projected Max PF without accrued Max PF');

// Projected Max PF = accrued Max PF plus future best lineups, so it never falls
// below either the accrued Max PF or the projected points for.
const tlOdds = H.championshipOdds(tl, { sims: 300, withMaxPf: true });
assert(H.championshipOdds(tl, { sims: 50 }).every(o => o.expMaxPf === null && o.first === null), 'Max PF stays opt-in');
for (const o of tlOdds) {
  assert(o.expMaxPf >= o.roster.ppts - 1e-6, `${o.teamName} projected Max PF below accrued`);
  assert(o.expMaxPf >= o.expPts - 1e-6, `${o.teamName} projected Max PF below projected PF`);
}
// Remaining weeks are scaled to the league's own Max PF pace, so the league
// average projects at exactly that pace over the full regular season.
const m = tlOdds.meta, avg = f => tlOdds.reduce((s, o) => s + f(o), 0) / tlOdds.length;
assert(Math.abs(avg(o => o.expMaxPf) / m.regularWeeks - avg(o => o.roster.ppts) / m.played) < 1e-6, 'league projects at its Max PF pace');
assert.match(H.rookieOrderNote(tl, tl.rosters[0], false), /Max PF is missing/);

// Redraft has no rookie draft.
const redraft = byName('Phi Kap Fantasy');
if (redraft) assert.equal(H.rookieOrderRule(redraft), null, 'redraft gets no 1.01 column');

// The tooltip names whoever holds a traded next-season R1.
const tp = (tl.traded_picks || []).find(p => String(p.season) === String(Number(tl.season) + 1) && p.round === 1 && p.owner_id !== p.roster_id);
if (tp) {
  const origin = tl.rosters.find(r => r.roster_id === tp.roster_id), holder = tl.rosters.find(r => r.roster_id === tp.owner_id);
  assert(H.rookieOrderNote(tl, origin, true).includes(holder.team_name), 'note names the pick holder');
}
console.log('rookie odds checks passed');
