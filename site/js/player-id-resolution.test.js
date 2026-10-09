// Ranked names must land on the right Sleeper id, or the Team and Owner cells
// read a stranger's (or FA). Run from the repo root: node site/js/player-id-resolution.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const start = app.indexOf('  const norm = (s)');
const end = app.indexOf('  // Build a unified ranking lookup', start);
assert(start >= 0 && end > start, 'name matching block missing');

const PLAYERS = {};
const add = (id, name, pos, team, extra = {}) => {
  const [first, ...rest] = name.split(' ');
  PLAYERS[id] = { id, name, first, last: rest.join(' '), pos, team, ...extra };
};
// Order matters: the name map keeps the FIRST player of a name.
add('8337', 'Haskell Garrett', 'DL', 'FA');
add('3973', 'Myles Garrett', 'DE', 'LAR');
add('4961', 'DJ Moore', 'CB', 'FA');
add('4983', 'DJ Moore', 'WR', 'BUF');
add('1430', 'Chris Jones', 'DT', 'FA');
add('3558', 'Chris Jones', 'DT', 'KC');
add('7762', 'James Wiggins', 'DB', 'FA');
add('11656', 'Nate Wiggins', 'CB', 'BAL');
add('12530', 'Travis Hunter', 'DB', 'JAX', { fantasy_positions: ['DB', 'WR'] });
add('94', 'Kyle Williams', 'DT', 'FA');
add('8130', 'Chig Okonkwo', 'TE', 'WAS');

const window = { PLAYERS };
const { sleeperIdForFuzzy } = new Function('window',
  `${app.slice(start, end)}; return { sleeperIdForFuzzy };`)(window);

assert.equal(sleeperIdForFuzzy('Myles Garrett', 'DL'), '3973', 'DE ranked as DL resolves to him, not a FA "DL" Garrett');
assert.equal(sleeperIdForFuzzy('Nate Wiggins', 'DB'), '11656', 'CB ranked as DB');
assert.equal(sleeperIdForFuzzy('D.J. Moore', 'WR'), '4983', 'WR behind a same-named CB');
assert.equal(sleeperIdForFuzzy('Chris Jones', 'DL'), '3558', 'active namesake over a retired one');
assert.equal(sleeperIdForFuzzy('Travis Hunter', 'WR'), '12530', 'two-way player via fantasy_positions');
assert.equal(sleeperIdForFuzzy('Kyle Williams', 'WR'), null, 'a same name at another position is not him');
assert.equal(sleeperIdForFuzzy('Chigoziem Okonkwo', 'TE'), '8130', 'last-name fallback still works');

// Team chips speak Sleeper codes, whatever the ranked entry carried.
const chipStart = app.indexOf('  const KTC_TEAM');
const chipEnd = app.indexOf('  function rookieBadge', chipStart);
assert(chipStart >= 0 && chipEnd > chipStart, 'KTC team map missing from teamChip');
// The chip's text child; the logo img ahead of it is not text.
const h = (tag, attrs, ...kids) => ({tag, attrs, kids: kids.filter(k => k != null)});
const teamChip = new Function('h', `${app.slice(chipStart, chipEnd)}; return teamChip;`)(h);
for (const [raw, text, logo] of [['SFO','SF','sf'], ['NEP','NE','ne'], ['LA','LAR','lar'],
  ['WSH','WAS','was'], ['ARZ','ARI','ari'], ['OAK','OAK','lv'], ['SD','SD','lac'], ['STL','STL','lar']]) {
  const chip = teamChip(raw);
  assert.equal(chip.kids.at(-1), text);
  assert.equal(chip.kids[0].attrs.src, `https://sleepercdn.com/images/team_logos/nfl/${logo}.png`);
  assert.equal(chip.kids[0].attrs.alt, '');
}
for (const [raw, text] of [[null,'FA'], ['fa','FA'], ['XYZ','XYZ']]) {
  assert.deepEqual(teamChip(raw).kids, [text]);
}
let removed = false;
const chip = teamChip('LAR');
chip.kids[0].attrs.onerror({target:{remove(){removed = true;}}});
assert.ok(removed, 'a failed logo leaves its text and does not retry');
assert.equal(chip.kids.at(-1), 'LAR');

// And the built data carries no KTC-only code in the first place.
const sandbox = {};
new Function('window', fs.readFileSync(`${__dirname}/../data/players.js`, 'utf8'))(sandbox);
new Function('window', fs.readFileSync(`${__dirname}/../data/ktc.js`, 'utf8'))(sandbox);
const sleeperTeams = new Set(Object.values(sandbox.PLAYERS).map(p => p.team));
const ktcTeams = new Set(sandbox.RANKINGS_SOURCES.flatMap(s => s.rankings.flatMap(r => r.players.map(p => p.team))));
const foreign = [...ktcTeams].filter(t => !sleeperTeams.has(t));
assert.deepEqual(foreign, [], `ktc.js carries non-Sleeper team codes: ${foreign.join(', ')}`);

console.log('player-id-resolution.test.js: all assertions passed');
