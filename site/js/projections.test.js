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
const start = app.indexOf('function projUnitData()');
const end = app.indexOf('function viewProjections(');
assert(start >= 0 && end > start, 'projection helpers not found');
const helpers = new Function('window',
  `${app.slice(start, end)}; return { offenseSlots, idpSlotCount, optimalOffense, optimalDefense, projPosGroup };`
)(ctx.window);

const yuH = ctx.window.LEAGUES.find(l => l.short_name === 'yuH');
const me = yuH.rosters.find(r => r.is_me);

const slots = helpers.offenseSlots(yuH);
assert.equal(slots.qb + slots.rb + slots.wr + slots.te + slots.flex + slots.sf, 8, 'yuH offense slots != 8');
assert.equal(helpers.idpSlotCount(yuH), 2, 'yuH IDP slots != 2');
assert.equal(helpers.projPosGroup('CB'), 'DB');
assert.equal(helpers.projPosGroup('EDGE'), 'DL');

for (const s of ['pp', 'sleeper', 'blend']) {
  const r = helpers.optimalOffense(me, yuH, s);
  assert(r.total > 0 && r.picks.length <= 8, `offense ${s} bad: ${JSON.stringify(r).slice(0,80)}`);
}
for (const s of ['clay', 'sleeper', 'blend']) {
  const r = helpers.optimalDefense(me, yuH, s);
  assert(r.total > 0 && r.picks.length <= 2, `defense ${s} bad: ${JSON.stringify(r).slice(0,80)}`);
}
const offPP = helpers.optimalOffense(me, yuH, 'pp');
const defClay = helpers.optimalDefense(me, yuH, 'clay');
console.log(`PASS projections: ${me.team_name} offense(PP)=${offPP.total} [${offPP.picks.length} st], IDP(Clay)=${defClay.total} [${defClay.picks.map(p=>p.name).join(', ')}]`);
