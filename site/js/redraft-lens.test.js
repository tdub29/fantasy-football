// Redraft leagues must not be priced in dynasty currency. KTC prices a career the
// manager never keeps, so a redraft league values a player on season VOR instead,
// counts no rookie picks, and renders none of the multi-year surfaces. These are
// asserted rather than eyeballed because the flag is silent: a wrong lens renders
// a complete, plausible, wrong page.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const root = `${__dirname}/..`;
const ctx = { window: {} };
for (const f of ['rankings.js', 'ktc.js', 'players.js', 'leagues.js', 'projections.js', 'strategy.js'])
  vm.runInNewContext(fs.readFileSync(`${root}/data/${f}`, 'utf8'), ctx);

const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const slice = (a, b) => {
  const i = app.indexOf(a), j = app.indexOf(b, i);
  assert(i >= 0 && j > i, `slice not found: ${a}`);
  return app.slice(i, j);
};
const helpers = new Function('window', [
  slice('function projPosGroup(pos)', '  // A projection scored under THIS league'),
  slice('let _projByPidIdx = null;', '  // PP vs Sleeper POSITIONAL RANK difference'),
  slice('function targetStartersByPos(league)', '  // Is this player startable league-wide'),
  slice('function isDynastyLeague(lg)', '  // The league whose format defines VOR replacement'),
  slice('const REDRAFT_VOR_SCALE', '  // League-aware starter slots'),
].join('\n') + '\nreturn { tierValue, isDynastyLeague, vorByPid, REDRAFT_VOR_SCALE };')(ctx.window);

const leagues = ctx.window.LEAGUES;
const dyn = leagues.filter(l => helpers.isDynastyLeague(l));
const red = leagues.filter(l => !helpers.isDynastyLeague(l));
assert(dyn.length && red.length, 'need both lenses present to prove they differ');

// Every league resolves to exactly one lens, and the flag is what decides it.
for (const lg of leagues) assert.equal(helpers.isDynastyLeague(lg), lg.is_dynasty !== false);
// An unknown league reads as dynasty so a missing flag never silently strips the UI.
assert.equal(helpers.isDynastyLeague({}), true);
assert.equal(helpers.isDynastyLeague(null), true);

// Pick a player who is expensive in KTC and cheap this season. In the dynasty
// lens he is worth a lot; in redraft he is worth his VOR, and the two must differ.
// RANKINGS_SOURCES holds ranking SETS, each with its own players[] array, and the
// entries carry no Sleeper id: the app resolves those at runtime. Join on name here
// so tierValue gets the _sleeperId its redraft branch needs.
const idByName = new Map();
for (const sp of Object.values(ctx.window.PLAYERS || {}))
  if (sp.name && !idByName.has(sp.name)) idByName.set(sp.name, String(sp.id));
const ranked = [];
for (const src of (ctx.window.RANKINGS_SOURCES || []))
  for (const set of (src.rankings || []))
    for (const p of (set.players || [])) {
      const pid = idByName.get(p.name);
      if (p.ktcValue && pid) ranked.push({ ...p, _sleeperId: pid });
    }
assert(ranked.length > 50, `only ${ranked.length} ranked players with KTC value loaded`);

const redLg = red[0], dynLg = dyn[0];
let differed = 0, redraftZero = 0;
for (const p of ranked.slice(0, 300)) {
  const dv = helpers.tierValue(p, dynLg);
  const rv = helpers.tierValue(p, redLg);
  if (dv !== rv) differed++;
  if (dv > 0 && rv === 0) redraftZero++;
}
assert(differed > 100, `the two lenses priced ${differed} of 300 players differently, expected the currencies to diverge`);
assert(redraftZero > 0, 'no player was valuable in dynasty and worthless in redraft, so the lens is not actually switching');

// Cross-league callers pass {}, which must keep the dynasty currency or every
// league-agnostic table would silently reprice.
const sample = ranked.find(p => helpers.tierValue(p, dynLg) > 0);
assert.equal(helpers.tierValue(sample, {}), helpers.tierValue(sample, dynLg),
  'a format-less call must not fall into the redraft branch');

// Redraft value is floored at 0: a deep-bench body cannot subtract from strength.
for (const p of ranked.slice(0, 300)) assert(helpers.tierValue(p, redLg) >= 0);

// Scale sanity: the best redraft asset lands in the same band as the best dynasty
// one, so PV stays legible side by side even though the units differ.
const bestRed = Math.max(...ranked.map(p => helpers.tierValue(p, redLg)));
const bestDyn = Math.max(...ranked.map(p => helpers.tierValue(p, dynLg)));
assert(bestRed > 40 && bestRed < bestDyn * 1.6,
  `redraft ceiling ${bestRed} is off the dynasty ceiling ${bestDyn}; retune REDRAFT_VOR_SCALE`);

// The source-level gates: picks excluded, dynasty blocks gated on the lens.
assert(app.includes('const ownedPicks = dynasty ? rosterOwnedPicks(roster.roster_id, league) : [];'),
  'redraft rosters must not accrue rookie-pick value');
assert(app.includes('const yrHorizons = rosterDynasty ? [0, 1, 2, 3, 4, 5] : [0];'),
  'redraft roster table must collapse to today');
assert(app.includes('if (coachingTips.length && rosterDynasty) {'),
  'dynasty coaching tips must not render in a redraft league');

console.log(`ok: redraft lens, ${dyn.length} dynasty + ${red.length} redraft leagues, ` +
  `${differed}/300 players repriced, ceilings dyn ${bestDyn.toFixed(1)} vs red ${bestRed.toFixed(1)}`);
