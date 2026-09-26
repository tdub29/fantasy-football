// Stats Lab Routes tab: the pure math behind the targeted route tree. Every
// nflverse route label must land on exactly one spoke or the off-tree list,
// share must divide by ALL his targets, a rate must not rank under the route
// minimum, and the pool average must pool targets for a rate.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const block = (a, b) => {
  const s = app.indexOf(a), e = app.indexOf(b, s);
  assert(s >= 0 && e > s, `${a} block missing`);
  return app.slice(s, e);
};
const lib = new Function(`${block('  // ---- chart math', '  // ---- end chart math')}
${block('  // ---- route tree math', '  // ---- end route tree math')}
return { RT_SPOKES, RT_OTHER, RT_METRICS, RT_RATE, RT_POOL_MIN, RT_ROUTE_MIN, rtSum, rtValue, rtPool, rtRate };`)();
const { RT_SPOKES, RT_OTHER, RT_METRICS, RT_POOL_MIN, RT_ROUTE_MIN, rtSum, rtValue, rtPool, rtRate } = lib;

// Eight spokes, the Data Suite's, and nothing counted twice.
assert.deepEqual(RT_SPOKES.map(s => s.k), ['GO', 'POST', 'CORNER', 'IN', 'OUT', 'HITCH', 'CROSS', 'SLANT']);
const labels = RT_SPOKES.concat(RT_OTHER).flatMap(s => s.src);
assert.equal(new Set(labels).size, labels.length, 'a label maps to one spoke only');
assert.deepEqual(RT_METRICS.map(m => m[0]), ['share', 'tgt', 'catch', 'ypt', 'air', 'epa', 'td']);

// Every label in every published coverage file is mapped, so a new nflverse
// label fails here instead of silently falling off the tree.
const win = {};
for (const f of fs.readdirSync(`${__dirname}/../data`).filter(f => /^coverage-\d{4}\.js$/.test(f))) {
  vm.runInNewContext(fs.readFileSync(`${__dirname}/../data/${f}`, 'utf8'), { window:win });
}
const pubd = Object.values(win.COVERAGE_BY_SEASON || {}).filter(C => C.published);
assert.ok(pubd.length >= 2, 'at least two published seasons of targeted routes');
for (const C of pubd) {
  for (const t of Object.values(C.targetedRoutes)) for (const [r, a] of Object.entries(t)) {
    assert.ok(labels.includes(r), `${C.season}: unmapped route label ${r}`);
    assert.equal(a.length, 6, `${C.season} ${r}: [tgt, rec, yds, td, epa, air]`);
  }
}

// Out is quick out plus deep out; missing labels add nothing.
const tree = { 'QUICK OUT':[6, 5, 40, 0, 1.5, 18], 'DEEP OUT':[4, 2, 50, 1, 2.1, 52], GO:[10, 3, 120, 2, 3.4, 250], SLANT:[2, 2, 20, 0, 0.8, 10] };
const out = RT_SPOKES.find(s => s.k === 'OUT');
assert.deepEqual(rtSum(tree, out.src), [10, 7, 90, 1, 3.6, 70]);
assert.deepEqual(rtSum(tree, ['CORNER']), [0, 0, 0, 0, 0, 0]);
assert.deepEqual(rtSum(undefined, ['GO']), [0, 0, 0, 0, 0, 0]);

// Values: share over ALL targets (40 here, 22 of them charted), rates per target.
const go = rtSum(tree, ['GO']);
assert.equal(rtValue(go, 'share', 40), 0.25);
assert.equal(rtValue(go, 'tgt', 40), 10);
assert.equal(rtValue(go, 'catch', 40), 0.3);
assert.equal(rtValue(go, 'ypt', 40), 12);
assert.equal(rtValue(go, 'air', 40), 25);
assert.ok(Math.abs(rtValue(go, 'epa', 40) - 0.34) < 1e-12);
assert.equal(rtValue(go, 'td', 40), 2);
assert.equal(rtValue([0, 0, 0, 0, 0, 0], 'catch', 40), null, 'no targets, no rate');
assert.equal(rtValue([0, 0, 0, 0, 0, 0], 'share', 40), 0, 'no targets is a 0% share');

// Pool: his position, RT_POOL_MIN+ season targets.
const R = (tgt) => [[100, tgt, 0, 0, 0, 0, 0]];
const C = { fields:{ R:['db', 'tgt', 'rec', 'yds', 'td', 'epa', 'air'] }, players:{}, targetedRoutes:{} };
for (let i = 0; i < 10; i++) {
  C.players[`w${i}`] = { p:'WR', R:R(40) };
  C.targetedRoutes[`w${i}`] = { GO:[i, Math.floor(i / 2), i * 10, 0, i * 0.1, i * 20] };
}
C.players.thin = { p:'WR', R:R(RT_POOL_MIN - 1) };
C.targetedRoutes.thin = { GO:[19, 19, 900, 5, 30, 400] };
C.players.te = { p:'TE', R:R(60) };
const pool = rtPool(C, 'WR');
assert.equal(pool.length, 10, 'under the minimum and other positions stay out');
assert.ok(pool.every(m => m.total === 40));

// A count ranks the whole pool, zeros included; its average is the mean.
const src = ['GO'];
const cnt = rtRate(pool, [9, 4, 90, 0, 0.9, 180], 40, src, 'tgt');
assert.equal(cnt.ok, true);
assert.equal(cnt.pct, 95, 'best of ten: 9 below plus half of the one tie');
assert.equal(cnt.avg, 4.5);
// A rate ranks only on RT_ROUTE_MIN+ route targets: w5..w9 are the pool here.
const rate = rtRate(pool, [9, 4, 90, 0, 0.9, 180], 40, src, 'ypt');
assert.equal(rate.v, 10);
assert.equal(rate.pct, 50, 'every qualified WR averages 10 Y/Tgt on the go');
// The rate average pools targets over the WHOLE pool: sum(yds) / sum(tgt).
assert.equal(rate.avg, 450 / 45);
const dnq = rtRate(pool, [RT_ROUTE_MIN - 1, 4, 90, 1, 2, 90], 40, src, 'catch');
assert.equal(dnq.ok, false, 'under the route minimum does not qualify');
assert.equal(dnq.pct, null);
assert.equal(dnq.v, 1, 'the value still prints');
const none = rtRate(pool, [0, 0, 0, 0, 0, 0], 40, src, 'epa');
assert.equal(none.v, null);
assert.equal(none.ok, false);
// Fewer than five to rank against: no percentile, still an average.
const few = rtRate(pool.slice(0, 3), [6, 3, 60, 0, 0, 0], 40, src, 'share');
assert.equal(few.pct, null);
assert.ok(Math.abs(few.avg - 0.025) < 1e-12, "mean share of w0..w2: 0, 1 and 2 of 40");

console.log('route-tree tests passed');
