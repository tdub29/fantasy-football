// College prospects open a card built from their own model record, and that card leads with
// what differs player to player, not the round curve every player at a draft-only position shares.
// Run from the repo root: node site/js/prospect-cards.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
global.window = {};
require(path.join(__dirname, '..', 'data', 'prospect-model.js'));
const M = window.PROSPECT_MODEL;
assert(M && M.college.length, 'prospect-model.js missing');

const start = app.indexOf('  // College prospect model (window.PROSPECT_MODEL)');
const end = app.indexOf('  // weather.js keys teams by nflverse code', start);
assert(start >= 0 && end > start, 'prospect model block missing');

const h = (tag, attrs, ...kids) => ({ tag, attrs: attrs || {}, kids: kids.flat(Infinity).filter(k => k != null && k !== false),
  appendChild(n) { this.kids.push(n); }, set innerHTML(_) { this.kids = []; } });
const text = (n) => n == null ? '' : typeof n !== 'object' ? String(n) : n.kids.map(text).join(' ');
const find = (n, pred, out = []) => {
  if (n && typeof n === 'object') { if (pred(n)) out.push(n); n.kids.forEach(k => find(k, pred, out)); }
  return out;
};
const main = { kids: [], set innerHTML(_) { this.kids = []; }, appendChild(n) { this.kids.push(n); } };
const calls = [];
const env = {
  h, window, $: () => main, navigate: () => {}, appendTable: (host, tbl) => host.kids.push(tbl),
  breadcrumbs: () => null, pageHeader: () => null, tabBar: () => null,
  openPlayerDetail: (...a) => calls.push(['nfl', ...a]),
  playerModal: (...a) => { calls.push(['modal', ...a]); return null; },
  document: { body: { appendChild: () => {} } },
};
const { collegeProspectBlock, viewProspects, pmPct } = new Function(...Object.keys(env),
  `${app.slice(start, end)}; return { collegeProspectBlock, viewProspects, pmPct };`)(...Object.values(env));

// Every college player at every position and class gets a card, from his own record.
for (const r of M.college) {
  const t = text(collegeProspectBlock(r));
  assert.match(t, new RegExp(`first eligible for the ${r.cls} draft`), `${r.n}: eligibility`);
  assert(t.includes(pmPct(r.tp)), `${r.n}: his own college-only hit chance`);
  assert(!/Sleeper/.test(t), `${r.n}: no Sleeper identity on a college card`);
}
assert(new Set(M.college.map(r => r.cls)).size >= 2, 'both the next class and later classes are covered');

// The verbose trust paragraph is gone (Trevor, 2026-10-04); the shared curve stays as a position reference.
const wr = M.college.filter(r => r.p === 'WR').sort((a, b) => b.ts - a.ts);
const top = text(collegeProspectBlock(wr[0]));
assert.match(top, /one draft-slot curve for every WR/);
assert.doesNotMatch(top, /no calibration check|Read it as optimistic/);
assert.match(top, /early-declare flag/);
assert.notEqual(pmPct(wr[0].tp), pmPct(wr[wr.length - 1].tp));
assert.doesNotMatch(text(collegeProspectBlock(M.college.find(r => r.p === 'RB'))), /early-declare/);

// Table rows open the right card, by keyboard button or row click, for every position and class
// filter. 'next' and 'later' are the legacy routes and must still land on the matching class.
const years = [...new Set(M.college.map(r => r.cls))];
for (const pos of ['ALL', 'QB', 'RB', 'WR', 'TE']) {
  for (const mode of ['all', 'next', 'later', 'rookies', ...years.map(String)]) {
    viewProspects(pos, mode);
    const buttons = find({ attrs: {}, kids: main.kids }, n => n.tag === 'button' && /player-name-button/.test(n.attrs.class || ''));
    const rows = find({ attrs: {}, kids: main.kids }, n => n.tag === 'tr' && n.attrs.onclick);
    assert.equal(buttons.length, rows.length, `${pos} ${mode}: one name button per row`);
    if (!rows.length) continue;
    calls.length = 0;
    buttons[0].attrs.onclick({ stopPropagation() {} });
    rows[rows.length - 1].attrs.onclick();
    for (const [kind, name, a, b, rec] of calls) {
      if (mode === 'rookies') {
        assert.equal(kind, 'nfl');
        assert.equal(M.nfl[a].n, name, 'rookie card resolves by his Sleeper id');
      } else {
        assert.equal(kind, 'modal');
        assert.equal(a, null); assert.equal(b, null);
        assert.equal(rec.n, name);
        if (pos !== 'ALL') assert.equal(rec.p, pos, `${name}: right position`);
        const want = mode === 'next' ? M.season + 1 : mode === 'later' ? M.season + 2 : Number(mode);
        if (mode !== 'all') assert.equal(rec.cls, want, `${name}: right class`);
      }
    }
    // One table, filtered by a Class select: the old per-class mode buttons are gone.
    assert.equal(find({ attrs: {}, kids: main.kids }, n => n.tag === 'table').length, rows.length ? 1 : 0, `${pos} ${mode}: one table`);
    assert.equal(find({ attrs: {}, kids: main.kids }, n => n.tag === 'select' && n.attrs['aria-label'] === 'Filter by draft class').length, 1);
    if (mode === 'all' && pos !== 'ALL') assert.equal(rows.length, M.college.filter(r => r.p === pos).length, `${pos}: all classes in one table`);
    // No explanation block above the table (Trevor, 2026-10-04): header, filters, then the board.
    assert.equal(find({ attrs: {}, kids: main.kids }, n => /prm-notes/.test(n.attrs.class || '')).length, 0, `${pos} ${mode}: no notes block`);
  }
}

assert.match(app, /function playerModal\(name, ranked, sleeper, college = null\)/);
assert.match(app, /college \? collegeProspectBlock\(college\) : prospectModelBlock\(sleeper\)/);
assert.match(app, /\(college \? \[\] : activeExpertSources\(\)\)/);
assert.match(app, /college \? null : playerInfoBlock\(name, sleeper\)/);   // no namesake video intel

console.log('prospect-cards.test.js: all assertions passed');
