const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const start = app.indexOf('function tradeTitleWhatIf');
const end = app.indexOf('// Middle summary builds DOM once', start);
assert(start >= 0 && end > start, 'tradeTitleWhatIf source not found');
const tradeTitleWhatIf = new Function('isPickKey', `${app.slice(start, end)}; return tradeTitleWhatIf;`)(
  key => String(key).startsWith('pick:'),
);

const got = tradeTitleWhatIf(
  1,
  2,
  new Set(['player-a', 'pick:2027:1:1']),
  new Set(['player-b', 'player-c', 'pick:2028:2:2']),
);
assert.deepEqual(got, {
  1: { drop: ['player-a'], add: ['player-b', 'player-c'] },
  2: { drop: ['player-b', 'player-c'], add: ['player-a'] },
});
assert.throws(
  () => tradeTitleWhatIf(1, 1, new Set(['player-a']), new Set(['player-b'])),
  /different rosters/,
);

console.log('trade-title-odds.test.js: all assertions passed');
