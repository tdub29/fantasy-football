const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'styles.css'), 'utf8');

const start = app.indexOf('function weeklyMatchupFor');
const end = app.indexOf('\n  function renderLeaguePlayers', start);
assert(start >= 0 && end > start, 'weeklyMatchupFor source missing');
const weeklyMatchupFor = new Function('window', 'teamSos',
  `${app.slice(start, end)}; return weeklyMatchupFor;`)(
  { SOS_GRID:{ grid:{ QB:{ PHI:[{ week:2, opp:'TEN', home:false, rank:20, fpa:17 }] } } } },
  () => ({ schedule:[{ week:2, opp:'TEN', home:false, implied_pf:25, posted:true }] }),
);

assert.deepEqual(weeklyMatchupFor('PHI', 'QB', 2),
  { week:2, opp:'TEN', home:false, implied_pf:25, posted:true, rank:20, fpa:17 });
assert.equal(weeklyMatchupFor('PHI', 'QB', 3), null);
assert.equal(weeklyMatchupFor('FA', 'QB', 2), null);

const idpMatchupFor = new Function('window', 'teamSos',
  `${app.slice(start, end)}; return weeklyMatchupFor;`)(
  { SOS_GRID:{ grid:{} } },
  () => ({ schedule:[{ week:2, opp:'TEN', home:false }] }),
);
assert.deepEqual(idpMatchupFor('PHI', 'LB', 2), { week:2, opp:'TEN', home:false });

assert.match(app, /class:'center weekly-opp'.*weekly-opp-team/s);
assert.match(app, /weeklyOpponentCell\(p\), h\('td', null, o\.cell\)/);
assert.match(app, /if \(!team \|\| team === 'FA'\).*'·'/);
assert.match(app, /const onBye = !game && !!teamSos\(sleeper\.team\)/);
assert.match(app, /noProjection \? cell\('projected', '·'\)/);
assert.match(app, /class:'wb-profile-mobile'/);

const standingsMobile = css.slice(
  css.indexOf('@media (max-width: 480px)', css.indexOf('/* --- Standings row type scale')),
  css.indexOf('/* --- Multi-player slots stack', css.indexOf('/* --- Standings row type scale')),
);
assert.match(standingsMobile, /grid-template-columns: 72px minmax\(0, 1fr\)/);
assert.match(standingsMobile, /\.score-cell[\s\S]*grid-column: 1;[\s\S]*grid-row: 3;/);
assert.match(standingsMobile, /\.str-traj[\s\S]*grid-column: 2;[\s\S]*grid-row: 3;/);

const waiverCss = css.slice(css.indexOf('.waiver-card'), css.indexOf('Target / trade-block marks'));
assert.match(waiverCss, /\.waiver-table \{ table-layout: fixed; \}/);
assert.match(waiverCss, /\.waiver-table \.wb-profile \{ display: none; \}/);
assert.match(waiverCss, /\.waiver-table th:nth-child\(5\), \.waiver-table td:nth-child\(5\),[\s\S]*th:nth-child\(7\), \.waiver-table td:nth-child\(7\) \{ display: none; \}/);
assert.match(waiverCss, /\.waiver-table \.wb-profile-mobile[\s\S]*display: block;/);

console.log('weekly-matchup-mobile.test.js: all assertions passed');
