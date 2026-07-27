// Runtime test for buildTeamNeeds (Trade Lab "Team Needs" section).
// Extracts the function from app.js and runs it against the real league data
// with a stub `h` (captures the node tree) + faithful data-dep stubs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const root = `${__dirname}/..`;
const ctx = { window: {} };
for (const f of ['leagues.js', 'players.js', 'ktc.js']) {
  vm.runInNewContext(fs.readFileSync(`${root}/data/${f}`, 'utf8'), ctx);
}
const { LEAGUES, PLAYERS, RANKINGS_SOURCES } = ctx.window;

// --- extract buildTeamNeeds source by brace matching ---
const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const start = app.indexOf('function buildTeamNeeds(lg) {');
assert(start >= 0, 'buildTeamNeeds not found');
let depth = 0, end = -1;
for (let i = app.indexOf('{', start); i < app.length; i++) {
  if (app[i] === '{') depth++;
  else if (app[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
assert(end > start, 'could not brace-match buildTeamNeeds');
const src = app.slice(start, end);

// --- faithful data-dep stubs ---
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function targetStartersByPos(league) {
  let qb = 0, rb = 0, wr = 0, te = 0, flex = 0, sf = 0;
  for (const p of (league.roster_positions || [])) {
    if (p === 'QB') qb++; else if (p === 'RB') rb++; else if (p === 'WR') wr++;
    else if (p === 'TE') te++; else if (p === 'FLEX') flex++; else if (p === 'SUPER_FLEX') sf++;
  }
  return { QB: qb + sf, RB: rb + flex * 0.4, WR: wr + flex * 0.5, TE: te + flex * 0.1 };
}
const oneqb = RANKINGS_SOURCES.find(s => s.id === 'keeptradecut').rankings.find(r => r.format === 'dynasty_1qb');
const byName = new Map();
for (const p of oneqb.players) byName.set(norm(p.name), { pos: p.pos, ktcValue: p.ktcValue, ktcPosRank: p.ktcPosRank });
const rankIndex = () => ({ bySleeperId: new Map(), byName });
const tierValue = (p) => (p.ktcValue || 0) / 100; // offense scale matches real tierValue
const fmt = { decimal: (v, d) => Number(v).toFixed(d) };
const h = (tag, props, ...kids) => ({
  tag, props: props || {},
  children: kids.flat(Infinity).filter(x => x != null),
  appendChild(c) { this.children.push(c); return c; },
});

const buildTeamNeeds = new Function(
  'rankIndex', 'targetStartersByPos', 'norm', 'tierValue', 'fmt', 'h', 'window',
  `${src}; return buildTeamNeeds;`,
)(rankIndex, targetStartersByPos, norm, tierValue, fmt, h, { PLAYERS });

// --- run against yuH ---
const yuH = LEAGUES.find(l => l.short_name === 'yuH' || /yuh/i.test(l.name));
assert(yuH, 'yuH league not found');
const wrap = buildTeamNeeds(yuH);

// flatten text
function text(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  return (node.children || []).map(text).join(' ');
}
function findAll(node, tag, out = []) {
  if (node && typeof node === 'object') {
    if (node.tag === tag) out.push(node);
    (node.children || []).forEach(c => findAll(c, tag, out));
  }
  return out;
}

const flat = text(wrap);
assert(flat.includes('Biggest TE need:'), 'headline missing');
const headline = flat.slice(flat.indexOf('Biggest TE need:'), flat.indexOf('Biggest TE need:') + 80);
assert(headline.includes('MT EVEREST'), `neediest TE team should be MT EVEREST, got: ${headline}`);

const tbody = findAll(wrap, 'tbody')[0];
assert(tbody, 'no tbody');
const rows = tbody.children.filter(c => c.tag === 'tr');
assert.equal(rows.length, yuH.rosters.length, `expected ${yuH.rosters.length} team rows, got ${rows.length}`);

// first row (neediest TE) is MT EVEREST and its TE cell says NEED
assert(text(rows[0]).includes('MT EVEREST'), 'top row should be MT EVEREST');
assert(text(rows[0]).includes('NEED'), 'MT EVEREST should carry a NEED label');

console.log(`PASS team-needs: ${rows.length} teams, biggest TE need = ${headline.replace('Biggest TE need: ', '').split('—')[0].trim()}`);
