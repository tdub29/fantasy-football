// Stats Lab calculated columns: the expression compiler must compute valid
// arithmetic over column keys and reject everything else without evaluating it.
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const start = app.indexOf('  function statsExprCompile');
const end = app.indexOf('  // ---- end statsExprCompile', start);
assert(start >= 0 && end > start, 'statsExprCompile source missing');
const src = app.slice(start, end);

// The compiler itself never hands user text to a code evaluator.
assert.doesNotMatch(src, /\beval\s*\(|\bFunction\s*\(|setTimeout|setInterval|import\(/);

const statsExprCompile = new Function(`${src}; return statsExprCompile;`)();
const keys = ['rec_yds', 'targets', 'games', 'snap_pct', 'calc1'];
const row = { rec_yds: 300, targets: 24, games: 3, snap_pct: 0.8, calc1: 2, constructor: 5 };
const run = (expr, r = row) => {
  const cx = statsExprCompile(expr, keys);
  assert.ok(cx.fn, `${expr} should compile, got ${cx.error}`);
  return cx.fn(r);
};
const rejects = (expr, why) => {
  const cx = statsExprCompile(expr, keys);
  assert.ok(!cx.fn && typeof cx.error === 'string' && cx.error, `${expr} must be rejected (${why})`);
};

// Valid expressions compute.
assert.equal(run('rec_yds / targets'), 12.5);
assert.equal(run('rec_yds/games'), 100);
assert.equal(run('1 + 2 * 3'), 7, 'multiplication binds tighter');
assert.equal(run('(1 + 2) * 3'), 9, 'parentheses group');
assert.equal(run('10 - 4 - 3'), 3, 'subtraction is left associative');
assert.equal(run('12 / 3 / 2'), 2, 'division is left associative');
assert.equal(run('-targets + 30'), 6, 'unary minus');
assert.equal(run('2 - -3'), 5);
assert.equal(run('snap_pct * 100'), 80);
assert.equal(run('.5 * games'), 1.5);
assert.equal(run('calc1 * (targets - 4) / 10'), 4);
assert.equal(run('  targets  '), 24);
// Missing data and division by zero give an empty cell, not NaN or Infinity.
assert.equal(run('rec_yds / (games - 3)'), null);
assert.equal(run('rec_yds / targets', { rec_yds: 10 }), null);
assert.equal(run('rec_yds + 1', { rec_yds: 'Q' }), null);

// Letters outside the column keys are rejected.
rejects('foo + 1', 'unknown name');
rejects('constructor', 'prototype key is not a column');
rejects('__proto__', 'prototype key is not a column');
rejects('this', 'not a column');
rejects('window', 'not a column');
rejects('targets + e5', 'unknown name');
rejects('1e5', 'exponent letter is not a column');
// Function calls are rejected, even on a real key.
rejects('alert(1)', 'call');
rejects('targets(2)', 'call on a key');
rejects('Math.max(targets, 1)', 'member call');
// Any other character is rejected.
for (const bad of ['targets; 1', 'a[0]', 'targets ** 2', '"x"', "'x'", '`x`', 'targets % 2',
  'targets = 1', 'targets > 1', '!targets', 'targets.length', '1,2', '{}', 'targets\n1', '$x', '#']) {
  rejects(bad, 'bad character or grammar');
}
// Malformed grammar is rejected.
for (const bad of ['', '   ', '1 +', '(1 + 2', '1 + 2)', '* 3', 'targets games', '1.2.3', '()']) {
  rejects(bad, 'malformed');
}

console.log('stats-expr.test.js: all assertions passed');
