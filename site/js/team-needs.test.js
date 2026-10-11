// Runtime test for buildTeamNeeds (Trade Lab "Roster Needs by Position").
// Extracts the function from app.js and runs it on the real yuH rosters with a
// stub `h` that captures the node tree. Grades come from positionGrades, the
// Overview heatmap's own source, stubbed here so the test pins the grid contract:
// one row per team, sorted by Overall, and each position cell's hover list is
// that team's top five there, best first.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const root = `${__dirname}/..`;
const ctx = { window: {} };
for (const f of ['leagues.js', 'players.js']) vm.runInNewContext(fs.readFileSync(`${root}/data/${f}`, 'utf8'), ctx);
const { LEAGUES, PLAYERS } = ctx.window;

const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const start = app.indexOf('  const needsSort = ');
assert(start >= 0, 'buildTeamNeeds not found');
let depth = 0, end = -1;
for (let i = app.indexOf('{', app.indexOf('function buildTeamNeeds(lg) {')); i < app.length; i++) {
  if (app[i] === '{') depth++;
  else if (app[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const src = app.slice(start, end);

const h = (tag, props, ...kids) => ({
  tag, props: props || {}, children: kids.flat(Infinity).filter(x => x != null),
  appendChild(c) { this.children.push(c); return c; },
  replaceChildren(...c) { this.children = c; },
});
const GRADE_KEYS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'Bench', 'Draft'];
// Deterministic fake value per player, so "top five, best first" is checkable.
const worthOf = (pid) => (Number(pid) % 97) + 1;
const positionGrades = (r) => {
  const players = (r.players || []).filter(pid => PLAYERS[pid])
    .map(pid => ({ pid, sleeper: PLAYERS[pid], ranked: { pos: PLAYERS[pid].pos } }));
  const g = Object.fromEntries(GRADE_KEYS.map((k, i) => [k, (r.roster_id * 7 + i) % 10]));
  return { players, slots: { slots: [] }, g, overall: (r.roster_id * 3) % 10 + 0.5 };
};
const heatGradeCell = (key, val, lg, pop) => ({ tag: 'cell', key, val, pop, children: pop ? [pop] : [] });
const build = new Function('h', 'GRADE_KEYS', 'positionGrades', 'heatGradeCell', 'gradeColor', 'isDynastyLeague',
  'playerValue', 'rosPointsByPid', 'rosPosRank', 'projPosGroup', 'fmt', 'navigate',
  `${src}; return buildTeamNeeds;`)(h, GRADE_KEYS, positionGrades, heatGradeCell, () => 'c', () => true,
  worthOf, () => new Map(), () => null, (p) => p, { decimal: (v, d) => Number(v).toFixed(d) }, () => {});

const yuH = LEAGUES.find(l => l.short_name === 'yuH' || /yuh/i.test(l.name));
assert(yuH, 'yuH league not found');
const wrap = build(yuH);
const grid = wrap.children.find(c => c.props.class === 'heatmap needs');
const rows = () => grid.children.slice(1);
assert.equal(rows().length, yuH.rosters.length, 'one row per team');

const overall = (row) => Number(row.children.at(-1).children[0]);
const ov = rows().map(overall);
assert.deepEqual(ov, ov.slice().sort((a, b) => b - a), 'default sort is Overall, best first');

const text = (n) => n == null ? '' : typeof n === 'string' ? n : (n.children || []).map(text).join(' ');
for (const row of rows()) {
  for (const cell of row.children.filter(c => c.tag === 'cell' && ['QB', 'RB', 'WR', 'TE'].includes(c.key))) {
    const ul = cell.pop.children.find(c => c.tag === 'ul');
    if (!ul) continue;
    const vals = ul.children.map(li => Number(text(li.children[1]).trim()));
    assert(vals.length <= 5, 'at most five players');
    assert.deepEqual(vals, vals.slice().sort((a, b) => b - a), `${cell.key} list is best first`);
  }
}

// A header click sorts by that column, neediest (lowest grade) first.
const teHead = grid.children[0].children.find(c => text(c).startsWith('TE'));
teHead.props.onclick();
const te = rows().map(r => r.children.find(c => c.key === 'TE').val);
assert.deepEqual(te, te.slice().sort((a, b) => a - b), 'TE header sorts neediest first');
console.log(`PASS team-needs: ${rows().length} teams, hover lists capped at five, sortable`);
