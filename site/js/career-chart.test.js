// careerChart drops a series with under two points and opens on the first usable one.
// That is the whole contract: a player with no KTC history must still get his PPG
// chart, and a player with no PPG must not render an empty plate.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const cut = (a, b) => {
  const i = app.indexOf(a), j = app.indexOf(b, i);
  assert.ok(i >= 0 && j > i, `slice failed: ${a}`);
  return app.slice(i, j);
};

// Minimal DOM for the h() helper plus the tab clicks.
// h() assigns el.className, and nodes are appended only when truthy with .nodeType,
// so the stub has to carry both and classList has to read through to className.
const el = (tag) => ({
  tagName: tag, nodeType: 1, className: '', children: [],
  classList: {
    get _s() { return new Set(String(this._el.className || '').split(/\s+/).filter(Boolean)); },
    add(...c) { const s = this._s; c.forEach(x => s.add(x)); this._el.className = [...s].join(' '); },
    toggle(c, on) { const s = this._s; on ? s.add(c) : s.delete(c); this._el.className = [...s].join(' '); },
    contains(c) { return this._s.has(c); },
  },
  dataset: {}, style: {}, attrs: {}, _html: '',
  set innerHTML(v) { this._html = v; if (v === '') this.children = []; },
  get innerHTML() { return this._html; },
  setAttribute(k, v) { this.attrs[k] = v; },
  addEventListener(ev, fn) { (this._on = this._on || {})[ev] = fn; },
  click() { if (this._on && this._on.click) this._on.click(); },
  appendChild(c) { if (c) this.children.push(c); return c; },
});
const make = (tag) => { const n = el(tag); n.classList._el = n; return n; };
const ctx = {
  console,
  document: { createElement: make, createTextNode: (t) => ({ text: String(t) }) },
  window: {},
  location: { hash: '' },
};
vm.createContext(ctx);
vm.runInContext(`
  ${cut('  const h = (', '  const fmt = {')}
  ${cut('  function fmtStat(', '  function sparkline(')}
  ${cut('  function careerChart(', '  function historyBlock(')}
  globalThis.careerChart = careerChart;
`, ctx);

const seasons = [{ y: '2023', v: 4.9 }, { y: '2024', v: 6.9 }, { y: '2025', v: 11.5 }];
const weekly = Array.from({ length: 185 }, (_, i) => ({ y: `2023-0${(i % 9) + 1}`, v: 4000 + i * 10 }));

// Both series present: tabs render, one per usable series.
const both = ctx.careerChart([
  { key: 'ppg', label: 'PPG', unit: 'PPR per game', pts: seasons },
  { key: 'ktc', label: 'KTC value', unit: 'KTC dynasty value', pts: weekly },
]);
assert.ok(both, 'two usable series should render');
const tabsNode = both.children.find(c => c.classList.contains('cchart-tabs'));
assert.equal(tabsNode.children.length, 2, 'one tab per usable series');
assert.ok(tabsNode.children[0].classList.contains('active'), 'first series opens active');

// KTC missing, which is every player until the crawl has run for him.
const ppgOnly = ctx.careerChart([
  { key: 'ppg', label: 'PPG', unit: 'PPR per game', pts: seasons },
  { key: 'ktc', label: 'KTC value', unit: 'KTC dynasty value', pts: [] },
]);
assert.ok(ppgOnly, 'PPG alone must still render');
assert.ok(!ppgOnly.children.some(c => c.classList.contains('cchart-tabs')),
  'a single series shows no tab bar');

// Nothing usable: no empty plate.
assert.equal(ctx.careerChart([{ key: 'ppg', label: 'PPG', unit: 'x', pts: [{ y: '2025', v: 3 }] }]), null,
  'a one-point series is not a chart');
assert.equal(ctx.careerChart([]), null, 'no series is not a chart');

console.log('career-chart tests passed');
