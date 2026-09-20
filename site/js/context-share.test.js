const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const start = app.indexOf('function showRushShareFor');
const end = app.indexOf('\n  function shareCell', start);
assert(start >= 0 && end > start, 'showRushShareFor source missing');
const showRushShareFor = new Function(
  `${app.slice(start, end)}; return showRushShareFor;`,
)();

assert.equal(showRushShareFor('WR'), false);
assert.equal(showRushShareFor('TE'), false);
assert.equal(showRushShareFor('RB'), true);
assert.equal(showRushShareFor('QB'), true);
assert.match(app, /if \(rush && showRushShareFor\(pos\)\)/);
assert.match(app, /showRushShareFor\(playerPos\) \? h\('div', \{ class:'mini-kpi' \}/);

console.log('context-share.test.js: all assertions passed');
