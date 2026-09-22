const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const start = app.indexOf('function playerMatchesScopes');
const end = app.indexOf('\n  function renderLeaguePlayers', start);
assert(start >= 0 && end > start, 'player scope matcher missing');
const playerMatchesScopes = new Function(
  `${app.slice(start, end)}; return playerMatchesScopes;`,
)();

const mine = { is_me: true };
const other = { is_me: false };
assert.equal(playerMatchesScopes(['all'], null), true);
assert.equal(playerMatchesScopes(['free'], null), true);
assert.equal(playerMatchesScopes(['free'], mine), false);
assert.equal(playerMatchesScopes(['mine'], mine), true);
assert.equal(playerMatchesScopes(['mine'], other), false);
assert.equal(playerMatchesScopes(['free', 'mine'], null), true);
assert.equal(playerMatchesScopes(['free', 'mine'], mine), true);
assert.equal(playerMatchesScopes(['free', 'mine'], other), false);
assert.equal(playerMatchesScopes(['rostered'], mine), true);
assert.equal(playerMatchesScopes(['rostered'], other), true);
assert.equal(playerMatchesScopes(['rostered'], null), false);

assert.match(app, /'aria-label':'Player ownership scope'/);
assert.match(app, /'aria-pressed':filter\.scopes\.includes\(k\)/);
assert.match(app, /const next = new Set\(filter\.scopes\)/);

console.log('player-scope.test.js: all assertions passed');
