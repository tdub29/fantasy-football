const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const start = app.indexOf('function starterByeCost');
const end = app.indexOf('\n  function fantasySos', start);
assert(start >= 0 && end > start, 'starterByeCost source missing');
const starterByeCost = new Function(`${app.slice(start, end)}; return starterByeCost;`)();

const players = new Map([
  ['a', { sleeper:[10, null, 12] }],
  ['b', { sleeper:[5, 6, 7] }],
  ['c', { sleeper:[null, null, null] }],
]);
assert.deepEqual(starterByeCost({ starters:['a', 'b', 'c'] }, 2, players, 3), { slots:1, points:11 });
assert.match(app, /starterByeCost\(byRoster\.get\(w\.opp\), w\.wk, pm, lastWeek\)/,
  'bye cost must read the scheduled opponent, not the row team');

console.log('fantasy-sos.test.js: all assertions passed');
