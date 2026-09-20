const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const site = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

const start = app.indexOf('function compareNullableNumbers');
const end = app.indexOf('\n  function renderLeaguePlayers', start);
assert(start >= 0 && end > start, 'nullable number comparator missing');
const compareNullableNumbers = new Function(
  `${app.slice(start, end)}; return compareNullableNumbers;`,
)();

const values = [null, 3, 1, undefined, 2];
assert.deepEqual(values.slice().sort((a, b) => compareNullableNumbers(a, b, 1)), [1, 2, 3, null, undefined]);
assert.deepEqual(values.slice().sort((a, b) => compareNullableNumbers(a, b, -1)), [3, 2, 1, null, undefined]);

const weeklySortGate = app.slice(
  app.indexOf("if (filter.sort === 'weekly-vegas'"),
  app.indexOf('const weeklyValue', app.indexOf("if (filter.sort === 'weekly-vegas'")),
);
assert.match(weeklySortGate, /startsWith\('weekly-x:'\)/, 'tracked experts must use weekly numeric sort');
assert.match(weeklySortGate, /startsWith\('kicker-'\)/, 'kicker model columns must use weekly numeric sort');
assert.match(app, /key\.startsWith\('weekly-x:'\)[\s\S]{0,100}\? 'asc' : 'desc'/,
  'expert rank headers must default to low-rank-first');

assert.doesNotMatch(app, /hash:'#kickers'/, 'kickers must not remain in Reference nav');
assert.doesNotMatch(app, /case 'kickers'/, 'standalone kicker route must be removed');
assert.match(app, /filter\.view === 'weekly' && leagueHasKicker\) posOptions\.push\('K'\)/);
for (const [key, label] of [['kicker-exp','K Proj'], ['kicker-floor','Floor'], ['kicker-ceil','Ceil'], ['kicker-pGe15','15+']]) {
  assert.ok(app.includes(`sortHdr('${key}', '${label}'`), `${label} kicker column missing`);
}

const context = { window: {} };
vm.createContext(context);
for (const file of ['players.js', 'leagues.js', 'weekly-rankings.js', 'kickers.js']) {
  vm.runInContext(fs.readFileSync(path.join(site, 'data', file), 'utf8'), context);
}
const normalize = value => String(value || '').toLowerCase().replace(/[.']/g, '').replace(/[^a-z0-9 -]/g, '').replace(/\s+/g, ' ').trim();
const byInitial = new Map(Object.entries(context.window.PLAYERS)
  .filter(([, player]) => player.pos === 'K')
  .map(([id, player]) => [normalize(`${player.first[0]} ${player.last}`), id]));
const matched = context.window.KICKER_MODEL.kickers.filter(kicker =>
  byInitial.has(normalize(kicker.name.replace(/^([A-Za-z])\./, '$1 '))));
assert.equal(matched.length, context.window.KICKER_MODEL.kickers.length, 'every model kicker should match one Sleeper kicker');
assert.equal(context.window.LEAGUES.filter(league => league.roster_positions.includes('K')).length, 2);

console.log('weekly-sorting-kickers.test.js: all assertions passed');
