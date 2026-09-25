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

// Dynasty lens (yuH): playerValue resolves the ranking entry exactly as the app does.
const isDynastyLeague = (lg) => lg.is_dynasty !== false;
const playerValue = (pid) => {
  const sp = PLAYERS[pid]; const r = sp && byName.get(norm(sp.name));
  return r ? tierValue(r) : 0;
};
const buildTeamNeeds = new Function(
  'rankIndex', 'targetStartersByPos', 'norm', 'tierValue', 'fmt', 'h', 'window', 'isDynastyLeague', 'playerValue',
  `${src}; return buildTeamNeeds;`,
)(rankIndex, targetStartersByPos, norm, tierValue, fmt, h, { PLAYERS }, isDynastyLeague, playerValue);

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

const tbody = findAll(wrap, 'tbody')[0];
assert(tbody, 'no tbody');
const rows = tbody.children.filter(c => c.tag === 'tr');
assert.equal(rows.length, yuH.rosters.length, `expected ${yuH.rosters.length} team rows, got ${rows.length}`);

// Assert the CONTRACT, not a snapshot of who happens to be neediest. Naming a team
// here made this test fail on a data refresh that changed nothing but the tie-break:
// two teams sat on the same best-TE value (38) and swapped places.
// td layout: [team, QB, RB, WR, TE, top-need] — POS = ['QB','RB','WR','TE'].
const teVal = (row) => {
  const tds = row.children.filter(c => c.tag === 'td');
  assert.equal(tds.length, 6, `expected 6 cells per row, got ${tds.length}`);
  const v = parseFloat(text(tds[4]).trim().split(/\s+/)[0]);
  assert(Number.isFinite(v), `unparseable TE value in row: ${text(row)}`);
  return v;
};
const teVals = rows.map(teVal);
for (let i = 1; i < teVals.length; i++) {
  assert(teVals[i] >= teVals[i - 1],
    `rows must sort by ascending best-TE value (neediest first); row ${i} (${teVals[i]}) < row ${i - 1} (${teVals[i - 1]})`);
}

// The headline names the same team as the top row, and that row's TE cell is flagged.
const topTeam = text(rows[0].children.filter(c => c.tag === 'td')[0]).replace('YOU', '').trim();
assert(headline.includes(topTeam), `headline should name the top row team ${topTeam}, got: ${headline}`);
assert(/NEED|THIN/.test(text(rows[0].children.filter(c => c.tag === 'td')[4])),
  `neediest team's TE cell should carry NEED or THIN, got: ${text(rows[0])}`);

console.log(`PASS team-needs: ${rows.length} teams, biggest TE need = ${topTeam} (TE value ${teVals[0]}, max ${teVals[teVals.length - 1]})`);
