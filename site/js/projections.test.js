// Runtime test for the Projections view logic (offense + defense, source-selectable)
// against real leagues.js + projections.js data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const root = `${__dirname}/..`;
const ctx = { window: {} };
for (const f of ['leagues.js', 'projections.js']) {
  vm.runInNewContext(fs.readFileSync(`${root}/data/${f}`, 'utf8'), ctx);
}
const O = ctx.window.OFFENSE_PROJ;
assert(O && O.offense.players.length > 100 && O.defense.players.length > 100, 'projections.js empty');
assert.equal(O.offense.default, 'pp', 'offense default must be pp');
assert.equal(O.defense.default, 'clay', 'defense default must be clay');
assert.equal(O.offense.sources.join(','), 'blend,pp,sleeper');
assert.equal(O.defense.sources.join(','), 'blend,clay,sleeper');
// stat lines present
assert(O.offense.players[0].stats && O.offense.players[0].stats.pp, 'offense stat line missing');
assert(O.defense.players[0].stats && O.defense.players[0].stats.clay, 'defense stat line missing');

const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
// optimalOffense now runs through the SHARED lineup machinery (slot model, legal
// filler, startable filter, league rescoring), so the harness needs both blocks.
const sharedStart = app.indexOf('function offenseStarterCount');
const sharedEnd = app.indexOf('  // Starting-lineup strength', sharedStart);
const start = app.indexOf('function projUnitData()');
const end = app.indexOf('function viewProjections(');
assert(sharedStart >= 0 && sharedEnd > sharedStart, 'shared lineup helpers not found');
assert(start >= 0 && end > start, 'projection helpers not found');
const helpers = new Function('window',
  `${app.slice(sharedStart, sharedEnd)}\n${app.slice(start, end)}
   return { offenseStartingSlots, idpSlotCount, optimalOffense, optimalDefense, projPosGroup,
            startableIds, leagueScorePoints, projPoints, isSidelined };`
)(ctx.window);

const yuH = ctx.window.LEAGUES.find(l => l.short_name === 'yuH');
const me = yuH.rosters.find(r => r.is_me);

const slots = helpers.offenseStartingSlots(yuH);
assert.equal(slots.length, 8, 'yuH offense slots != 8');
assert.equal(helpers.idpSlotCount(yuH), 2, 'yuH IDP slots != 2');
assert.equal(helpers.projPosGroup('CB'), 'DB');
assert.equal(helpers.projPosGroup('EDGE'), 'DL');

// Taxi and IR are not startable. This is the regression that mattered: the old
// code read roster.players raw and started stashed players.
const stashed = [...(me.taxi || []), ...(me.reserve || [])].map(String);
const startable = helpers.startableIds(me);
for (const pid of stashed) assert(!startable.includes(pid), `taxi/IR player ${pid} must not be startable`);
assert.equal(helpers.startableIds(me, { includeStashed: true }).length, (me.players || []).length);
if (stashed.length) assert(startable.length < (me.players || []).length, 'startable set must shrink');

// League scoring is applied from the raw stat line, not the file's fixed baseline.
const taco = ctx.window.LEAGUES.find(l => l.short_name === 'Password is taco');
assert.equal(taco.scoring.pass_int, -2, 'taco is the INT -2 league this test relies on');
const qb = O.offense.players.find(p => p.pos === 'QB' && (p.stats.blend || {}).pass_int > 0);
const tacoPts = helpers.leagueScorePoints(qb.stats.blend, taco);
const stdPts = helpers.leagueScorePoints(qb.stats.blend, { scoring: { pass_int: -1 } });
assert(tacoPts < stdPts, 'INT -2 must score a picky QB lower than INT -1');
assert.equal(Math.round((stdPts - tacoPts) * 10) / 10, Math.round(qb.stats.blend.pass_int * 10) / 10);
// No stat line -> null, so the caller falls back instead of reporting a zero.
assert.equal(helpers.leagueScorePoints({}, taco), null);
assert.equal(helpers.leagueScorePoints(null, taco), null);
assert.equal(helpers.projPoints({ blend: 123.4, stats: {} }, taco, 'blend'), 123.4, 'must fall back to the file total');

// IDP scoring comes from the league too. This is the gap that shipped: the weight
// table had no IDP terms, so every defender scored 0 through leagueScorePoints
// and optimalDefense fell back to the baked blend, silently ignoring that yuH
// pays 5.0 an interception and 3.0 a pass defensed.
const idp = O.defense.players.find(p => (p.stats.blend || {}).solo > 0 && (p.stats.blend || {}).sack > 0);
assert(idp, 'need a defender with a real stat line');
const yuhIdp = helpers.leagueScorePoints(idp.stats.blend, yuH);
assert(yuhIdp > 0, `yuH IDP scoring must not be zero, got ${yuhIdp}`);
// Double the sack rate and the score has to move by exactly yuH's sack weight.
const sackW = yuH.scoring.idp_sack;
const plusOne = helpers.leagueScorePoints({ ...idp.stats.blend, sack: idp.stats.blend.sack + 1 }, yuH);
assert.equal(Math.round((plusOne - yuhIdp) * 10) / 10, Math.round(sackW * 10) / 10,
  `one more sack must be worth idp_sack (${sackW})`);
// A league that pays nothing for tackles must score the same player lower than
// yuH, which pays 1.0 a solo. Proves the weights are read per league.
const noTkl = helpers.leagueScorePoints(idp.stats.blend, { scoring: { ...yuH.scoring, idp_tkl_solo: 0 } });
assert(noTkl < yuhIdp, 'idp_tkl_solo must change the total');
assert.equal(Math.round((yuhIdp - noTkl) * 10) / 10,
  Math.round(idp.stats.blend.solo * yuH.scoring.idp_tkl_solo * 10) / 10);

for (const s of ['pp', 'sleeper', 'blend']) {
  const r = helpers.optimalOffense(me, yuH, s);
  assert(r.total > 0 && r.picks.length <= 8, `offense ${s} bad: ${JSON.stringify(r).slice(0,80)}`);
}
for (const s of ['clay', 'sleeper', 'blend']) {
  const r = helpers.optimalDefense(me, yuH, s);
  assert(r.total > 0 && r.picks.length <= 2, `defense ${s} bad: ${JSON.stringify(r).slice(0,80)}`);
}
// Injury gating. Synthetic PLAYERS map so this doesn't depend on who is hurt
// this week — the rule is what's under test, not the current injury report.
ctx.window.PLAYERS = {
  healthy: { name: 'Healthy', injury_status: null, status: 'Active' },
  q:       { name: 'Q',       injury_status: 'Questionable', status: 'Active' },
  out:     { name: 'Out',     injury_status: 'Out', status: 'Active' },
  doubt:   { name: 'Doubt',   injury_status: 'Doubtful', status: 'Active' },
  ir:      { name: 'IR',      injury_status: 'IR', status: 'Inactive' },
  irList:  { name: 'IRList',  injury_status: null, status: 'Injured Reserve' },
};
assert.equal(helpers.isSidelined('healthy'), false);
assert.equal(helpers.isSidelined('q'), false, 'Questionable still starts — benching every Q would gut in-season projections');
assert.equal(helpers.isSidelined('out'), true);
assert.equal(helpers.isSidelined('doubt'), true);
assert.equal(helpers.isSidelined('ir'), true);
assert.equal(helpers.isSidelined('irList'), true, 'roster status Injured Reserve counts even with a null injury_status');
assert.equal(helpers.isSidelined('nobody'), false, 'an unknown id is not sidelined');

// What-if splice: additive, and adding a player already on the roster is a no-op
// once the caller de-dupes, so the same set always yields the same lineup.
const taco2 = ctx.window.LEAGUES.find(l => l.short_name === 'Password is taco');
const tacoMe = taco2.rosters.find(r => r.is_me);
const baseline = helpers.optimalOffense(tacoMe, taco2, 'blend');
const spliced = (extra) => helpers.optimalOffense(
  { ...tacoMe, players: [...helpers.startableIds(tacoMe), ...extra] }, taco2, 'blend');
assert.equal(spliced([]).total, baseline.total, 'an empty what-if must not move the number');
// Pick the best projected WR who is NOT already rostered. Hardcoding a name here
// broke the day Trevor traded for him: the splice became a no-op and the assertion
// failed on real data rather than on a real defect.
const onRoster = new Set(helpers.startableIds(tacoMe).map(String));
const freeWr = O.offense.players
  .filter(p => p.pos === 'WR' && !onRoster.has(String(p.id)) && p.blend != null)
  .sort((a, b) => b.blend - a.blend)[0];
assert(freeWr, 'no unrostered WR to splice, the what-if assertion would prove nothing');
const withHim = spliced([freeWr.id]);
assert(withHim.total > baseline.total, `adding ${freeWr.name} (WR1-tier, unrostered) must raise the lineup`);
assert.equal(spliced([freeWr.id]).total, withHim.total, 'the same what-if must be idempotent');
assert.equal(withHim.picks.length, baseline.picks.length, 'a what-if fills slots, it does not add them');
// Re-adding a player who is ALREADY STARTING must not double-count him. Picking
// a bench body here would let the assertion pass for the wrong reason.
const projById = new Map(O.offense.players.map(p => [String(p.id), p]));
const startingId = helpers.startableIds(tacoMe)
  .find(id => baseline.picks.some(c => c.name === projById.get(id)?.name));
assert(startingId, 'expected at least one of my starters to be resolvable');
assert.equal(spliced([startingId]).total, baseline.total, 'a starter added twice must not score twice');
assert.equal(spliced([startingId, freeWr.id]).total, withHim.total, 'dupes are inert alongside a real add');

const offPP = helpers.optimalOffense(me, yuH, 'pp');
const defClay = helpers.optimalDefense(me, yuH, 'clay');
console.log(`PASS projections: ${me.team_name} offense(PP)=${offPP.total} [${offPP.picks.length} st], IDP(Clay)=${defClay.total} [${defClay.picks.map(p=>p.name).join(', ')}]`);
