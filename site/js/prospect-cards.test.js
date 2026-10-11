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
  h, window, $: () => main, gradeColor: (v) => `g${Math.floor(v)}`, navigate: () => {}, appendTable: (host, tbl) => host.kids.push(tbl),
  breadcrumbs: () => null, pageHeader: () => null, tabBar: () => null,
  openPlayerDetail: (...a) => calls.push(['nfl', ...a]),
  playerModal: (...a) => { calls.push(['modal', ...a]); return null; },
  document: { body: { appendChild: () => {} } },
  history: { replaceState: (...a) => calls.push(['replace', ...a]) },
};
const { collegeProspectBlock, prospectModelBlock, viewProspects, pmPct } = new Function(...Object.keys(env),
  `${app.slice(start, end)}; return { collegeProspectBlock, prospectModelBlock, viewProspects, pmPct };`)(...Object.values(env));

// Every college player at every position and class gets a card, from his own record.
for (const r of M.college) {
  const t = text(collegeProspectBlock(r));
  assert.match(t, new RegExp(`first eligible for the ${r.cls} draft`, 'i'), `${r.n}: eligibility`);
  assert(t.includes(pmPct(r.tp)), `${r.n}: his own college-only hit chance`);
  assert(!/Sleeper/.test(t), `${r.n}: no Sleeper identity on a college card`);
}
assert(new Set(M.college.map(r => r.cls)).size >= 2, 'both the next class and later classes are covered');

// The verbose trust paragraph is gone (Trevor, 2026-10-04); the shared curve stays as a one-line
// position reference and the WR early-declare caveat rides on the College % tooltip (2026-10-06).
const titles = (n) => find(n, x => x.attrs && x.attrs.title).map(x => x.attrs.title).join(' ');
const wr = M.college.filter(r => r.p === 'WR').sort((a, b) => b.ts - a.ts);
const topCard = collegeProspectBlock(wr[0]);
const top = text(topCard);
assert.match(top, /If drafted \(one draft-slot curve for every WR\): Round 1 \d+%, Round 2 \d+%, Round 3 \d+%, Day 3 \d+%/);
assert.doesNotMatch(top, /no calibration check|Read it as optimistic|Once he is drafted|early-declare/);
const collegeTile = find(topCard, x => x.attrs.class === 'adv-stat' && text(x).startsWith('College %'))[0];
assert.match(collegeTile.attrs.title, /early-declare flag/);
assert.equal((titles(topCard).match(/early-declare/g) || []).length, 1, 'caveat sits on the College % tile only');
assert.notEqual(pmPct(wr[0].tp), pmPct(wr[wr.length - 1].tp));
const rbCard = collegeProspectBlock(M.college.find(r => r.p === 'RB'));
assert.doesNotMatch(text(rbCard) + titles(rbCard), /early-declare/);

// Table rows open the right card, by keyboard button or row click, for every position and class
// filter. The Class select is exactly All classes, Future classes and each upcoming year (Trevor,
// 2026-10-05). Future classes is the default; All classes adds every drafted class, whose rows open
// the NFL card. Legacy routes: 'next' and 'later' land on the matching year, 'rookies' and a drafted
// year on All classes.
const years = [...new Set(M.college.map(r => r.cls))].sort((a, b) => a - b);
const nfl = Object.values(M.nfl);
for (const pos of ['ALL', 'QB', 'RB', 'WR', 'TE']) {
  const at = (r) => pos === 'ALL' || r.p === pos;
  for (const mode of [undefined, 'all', 'future', 'next', 'later', 'rookies', String(M.season), ...years.map(String)]) {
    calls.length = 0;
    viewProspects(pos, mode);
    const hist = mode === 'all' || mode === 'rookies' || mode === String(M.season);
    const replaced = calls.filter(c => c[0] === 'replace').map(c => c[3]);
    if (mode === 'rookies' || mode === String(M.season)) assert.deepEqual(replaced, [`#prospects/${pos}/all`], `${pos} ${mode}: lands on All classes`);
    if (!mode || years.includes(Number(mode))) assert.deepEqual(replaced, [], `${pos} ${mode}: address kept`);
    const sel = find({ attrs: {}, kids: main.kids }, n => n.tag === 'select' && n.attrs['aria-label'] === 'Filter by draft class');
    assert.equal(sel.length, 1);
    const opts = find(sel[0], n => n.tag === 'option');
    assert.deepEqual(opts.map(o => text(o)), ['All classes', 'Future classes', ...years.map(String)], `${pos} ${mode}: class options`);
    assert.equal(opts.filter(o => o.attrs.selected === '').map(o => o.attrs.value).join(),
      hist ? 'all' : mode === 'next' ? String(M.season + 1) : mode === 'later' ? String(M.season + 2) : years.includes(Number(mode)) ? mode : 'future');
    const buttons = find({ attrs: {}, kids: main.kids }, n => n.tag === 'button' && /player-name-button/.test(n.attrs.class || ''));
    const rows = find({ attrs: {}, kids: main.kids }, n => n.tag === 'tr' && n.attrs.onclick);
    assert.equal(buttons.length, rows.length, `${pos} ${mode}: one name button per row`);
    const up = M.college.filter(at).length;
    if (hist) assert.equal(rows.length, up + nfl.filter(at).length, `${pos} ${mode}: every class, history included`);
    if (!mode || mode === 'future') assert.equal(rows.length, up, `${pos} ${mode}: upcoming only`);
    // Each table row opens its own card: drafted players the NFL card, college players their own.
    calls.length = 0;
    rows.forEach(r => r.attrs.onclick());
    buttons.forEach(b => b.attrs.onclick({ stopPropagation() {} }));
    assert.equal(calls.length, rows.length * 2);
    const want = mode === 'next' ? M.season + 1 : mode === 'later' ? M.season + 2 : Number(mode);
    for (const [kind, name, a, b, rec] of calls) {
      if (kind === 'nfl') {
        assert(hist, `${pos} ${mode}: drafted rows only under All classes`);
        assert.equal(M.nfl[a].n, name); if (pos !== 'ALL') assert.equal(M.nfl[a].p, pos);
        continue;
      }
      assert.equal(kind, 'modal');
      assert.equal(a, null); assert.equal(b, null);
      assert.equal(rec.n, name);
      assert(rec.cls > M.season, `${name}: upcoming class`);
      if (pos !== 'ALL') assert.equal(rec.p, pos, `${name}: right position`);
      if (years.includes(want)) assert.equal(rec.cls, want, `${name}: right class`);
    }
    if (hist) {
      const heads = find({ attrs: {}, kids: main.kids }, n => n.tag === 'th').map(text);
      assert(['Class', 'Pick', 'Hit %'].every(x => heads.some(t => t.startsWith(x))), `${pos} ${mode}: drafted rows are marked`);
      assert(find({ attrs: {}, kids: main.kids }, n => /prm-school/.test(n.attrs.class || '') && /^(.* · )?NFL, \d{4} pick \d+$/.test(text(n))).length >= nfl.filter(at).length);
    }
    assert.equal(find({ attrs: {}, kids: main.kids }, n => n.tag === 'table').length, rows.length ? 1 : 0, `${pos} ${mode}: one table`);
    // No explanation block above the table (Trevor, 2026-10-04): header, filters, then the board.
    assert.equal(find({ attrs: {}, kids: main.kids }, n => /prm-notes/.test(n.attrs.class || '')).length, 0, `${pos} ${mode}: no notes block`);
  }
}

// Rookie model cards stay reachable from the NFL player card.
assert.match(app, /prospectModelBlock\(sleeper\)/);
assert(Object.keys(M.nfl).length > 0, 'rookie model records still ship');
assert.match(app, /function playerModal\(name, ranked, sleeper, college = null\)/);
assert.match(app, /college \? collegeProspectBlock\(college\) : prospectModelBlock\(sleeper\)/);
assert.match(app, /\(college \? \[\] : activeExpertSources\(\)\)/);
assert.match(app, /college \? null : playerInfoBlock\(name, sleeper\)/);   // no namesake video intel

console.log('prospect-cards.test.js: all assertions passed');

// Card face (2026-10-10): hero band with logo and class rank, bio cells with listed size,
// a grades panel of bars and letters, and the tier ladder with its n.
require(path.join(__dirname, '..', 'data', 'college-bio.js'));
require(path.join(__dirname, '..', 'data', 'prospect.js'));
for (const p of ['QB', 'RB', 'WR']) {
  const r = M.college.find(x => x.p === p && x.cls === 2027 && window.COLLEGE_BIO.players[x.cid]);
  const card = collegeProspectBlock(r);
  const head = find(card, n => n.attrs.class === 'prm-head')[0];
  assert(head, `${p} card has no header`);
  const t = text(head);
  assert.match(t, new RegExp(`${p}[0-9]+ of [0-9]+ in the 2027 class`), t);
  assert(find(head, n => n.tag === 'img').length, `${p} header lost the school logo`);
  const all = text(card);
  assert.match(all, /Height \d'\d+" +Weight \d+ lb/, all);
  assert(!/age today/.test(all) && !/NaN|undefined|Infinity/.test(all), all);
  assert(!/Draft-capital rating/.test(all), `${p}: no empty capital tile on a college card`);
  const grades = find(card, n => n.attrs.class === 'prm-grade');
  assert(grades.length >= 3, `${p}: grades panel`);
  assert(grades.every(g => /^[A-F][+-]?$|^·$/.test(text(g.kids[3]))), `${p}: letter per grade row`);
  assert.match(all, /hit rate \d+ players/, `${p}: tier ladder shows n`);
}

// Drafted players: hit or miss, best finish, and the rung reached, lit once.
const sid = (want) => Object.keys(M.nfl).find(id => M.nfl[id].out && want(M.nfl[id].out));
for (const [id, verdict] of [[sid(o => o[0] && o[2] <= 12), 'Hit'], [sid(o => !o[0] && o[2] > 40), 'Miss']]) {
  const me = M.nfl[id], card = prospectModelBlock({ id });
  assert.equal(text(find(card, n => /prm-verdict/.test(n.attrs.class || ''))[0]), verdict, me.n);
  assert.match(text(card), new RegExp(`Best finish ${me.p}${me.out[2]} `), me.n);
  const lit = find(card, n => /prm-bucket on/.test(n.attrs.class || '')).map(text);
  assert.deepEqual(lit, [verdict === 'Hit' ? `${me.p}1` : `Below ${me.p}3`], me.n);
}
console.log('prospect-cards.test.js: card face assertions passed');
