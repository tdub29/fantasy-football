const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const start = app.indexOf('  function sortStandingRows');
const end = app.indexOf('\n  // Persistent settings', start);
assert(start >= 0 && end > start, 'sortStandingRows source missing');
const { sortStandingRows, standingDefaultDir } = new Function(
  `${app.slice(start, end)}; return { sortStandingRows, standingDefaultDir };`,
)();

const rows = [
  { dataset: { pv:'120', record:'0.4', strengthRank:'1' } },
  { dataset: { pv:'90', record:'0.8', strengthRank:'3' } },
  { dataset: { pv:'105', record:'0.8', strengthRank:'2' } },
];
assert.deepEqual(sortStandingRows(rows, 'pv', 'desc').map(r => r.dataset.pv), ['120', '105', '90']);
assert.deepEqual(sortStandingRows(rows, 'record', 'desc').map(r => r.dataset.strengthRank), ['2', '3', '1']);
assert.equal(rows[0].dataset.pv, '120', 'sort must not mutate source order');
assert.equal(standingDefaultDir('pa'), 'asc', 'lower points against should come first');
assert.equal(standingDefaultDir('record'), 'desc', 'better records should come first');
