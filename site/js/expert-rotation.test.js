const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const start = app.indexOf('  function fpData()');
const end = app.indexOf('\n  function fpContrarian', start);
assert(start >= 0 && end > start, 'expert rotation helpers missing');

const window = {
  WEEKLY_RANKINGS: {
    season: 2026,
    currentWeek: 2,
    trackedExperts: [
      { id: 1576, players: 2 },
      { id: 7666, players: 1 },
    ],
  },
  FP_EXPERTS: {
    season: 2026,
    week: 2,
    experts: [
      { id: 1576, name: 'Jacob Gibbs' },
      { id: 7666, name: 'Hayden Winks' },
      { id: 747, name: 'Matt Harmon' },
    ],
    boards: {
      QB: {
        sleeperIds: ['1', '2'],
        ranks: { 1576: [1, null], 7666: [2, 1], 747: [null, 3] },
      },
    },
  },
};
const state = { settings: { weeklyExpertIds: null } };
let saves = 0;
const helpers = new Function('window', 'state', 'saveSettings',
  `${app.slice(start, end)}\nreturn {
    fpDefaultRotationIds, fpRotationIds, fpSetRotation, fpRotationExperts, fpWeeklyRank
  };`,
)(window, state, () => { saves += 1; });

assert.deepEqual(helpers.fpRotationIds(), ['1576', '7666']);
assert.deepEqual(helpers.fpRotationExperts().map(expert => expert.name), ['Jacob Gibbs', 'Hayden Winks']);
assert.equal(helpers.fpWeeklyRank(1576, 'QB', '1'), 1);
assert.equal(helpers.fpWeeklyRank(1576, 'QB', '2'), null);
assert.equal(helpers.fpWeeklyRank(1576, 'WR', '1'), null);

helpers.fpSetRotation(747, true);
assert.equal(saves, 1);
assert.deepEqual(helpers.fpRotationIds(), ['1576', '7666', '747']);
helpers.fpSetRotation(1576, false);
assert.deepEqual(helpers.fpRotationIds(), ['7666', '747']);

state.settings.weeklyExpertIds = [];
assert.deepEqual(helpers.fpRotationIds(), [], 'saved empty rotation must not restore defaults');
assert.deepEqual(helpers.fpRotationExperts({ season: 2026, currentWeek: 3 }), [],
  'stale expert boards must not enter current weekly ranks');

assert.match(app, /Available FantasyPros experts/);
// Weekly expert columns still come from the saved rotation, but never on the
// ROS view (a weekly rank under a rest-of-season heading), and never Gibbs's
// FantasyPros board, which his dedicated Gibbs Wk column supersedes.
assert.match(app, /const trackedExperts = \(filter\.view === 'ros' \? \[\] : fpRotationExperts\(weeklyData\)\)/,
  'Weekly columns must use saved expert rotation, and not on the ROS view');
assert.match(app, /\.filter\(expert => String\(expert\.id\) !== '1576'\)/,
  "Gibbs's FantasyPros weekly board must not appear as a tracked expert column");
assert.match(app, /fpWeeklyRank\(t\.id, p\.pos, p\._sleeperId\)/,
  'Weekly cells must read arbitrary selected expert boards');
assert.doesNotMatch(app.slice(app.indexOf('function viewExperts'), app.indexOf('function fpExpertTable')),
  /fpPlayerLookup\(\)/);
console.log('expert-rotation.test.js: all assertions passed');
