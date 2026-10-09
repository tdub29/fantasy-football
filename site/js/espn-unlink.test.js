const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/espn-account.js', 'utf8');
const window = {};
vm.runInNewContext(source, { window, structuredClone });
const plain = x => JSON.parse(JSON.stringify(x));
const built = { id: '123', season: '2026', platform: 'espn', account_source: 'imported', name: 'Built-in ESPN' };
const cached = { name: 'Account source', leagues: {
  '123': { name: 'Built-in schedule', weeks: { 1: { 1: 2 } } },
  '456': { name: 'Sleeper schedule', weeks: { 1: { 3: 4 } } },
} };
const before = plain(cached);
const linkedSchedule = { name: 'Linked schedule', weeks: { 1: { 1: 3 } } };
const snapshot = { syncedAt: 1,
  league: { id: '123', season: '2026', platform: 'espn', account_source: 'linked', rosters: [], import_limitations: [] },
  schedule: linkedSchedule,
};
const link = { id: '123', season: '2026', snapshot };
const saved = new Map([
  ['ff-espn-links-v1::owner', JSON.stringify([link])],
  ['ff-espn-links-v1::owner:hidden', JSON.stringify(['123'])],
]);
const win = { LEAGUES: [], FANTASY_SCHEDULE: cached };
let owner = 'owner';
let C;
function restoreAccount() {
  win.LEAGUES = [built, { id: '456', platform: 'sleeper' }];
  win.FANTASY_SCHEDULE = cached;
  C.merge(win);
}
C = window.FF_ESPN.create({
  storage: { getItem: k => saved.get(k), setItem: (k, v) => saved.set(k, v) },
  players: {}, owner: () => owner, season: () => '2026', sharedSeason: () => '2026',
  onChange: restoreAccount,
});
restoreAccount();
assert.deepEqual(plain(cached), before, 'linked overlay must not overwrite cached account schedule');
assert.equal(win.LEAGUES.find(l => l.id === '123').account_source, 'linked');
assert.deepEqual(plain(win.FANTASY_SCHEDULE.leagues['123']), linkedSchedule);
win.FANTASY_SCHEDULE.leagues['123'].weeks[1][1] = 99;
assert.equal(C.links[0].snapshot.schedule.weeks[1][1], 3, 'display edits must not change saved ESPN snapshot');
C.unlink('123');
assert.equal(C.links.length, 0, 'unlink removes the saved overlay');
assert.deepEqual(plain(cached), before, 'unlink leaves the cached schedule intact');
assert.equal(win.LEAGUES.find(l => l.id === '123').account_source, 'imported', 'unlink restores the built-in league with the same ID');
assert.deepEqual(plain(win.FANTASY_SCHEDULE.leagues['123']), before.leagues['123']);
assert.deepEqual(plain(win.FANTASY_SCHEDULE.leagues['456']), before.leagues['456']);
// Persisted legacy tombstones must no longer hide the built-in data after reload.
C = window.FF_ESPN.create({
  storage: { getItem: k => saved.get(k), setItem: (k, v) => saved.set(k, v) },
  players: {}, owner: () => owner, season: () => '2026', sharedSeason: () => '2026', onChange: restoreAccount,
});
restoreAccount();
assert.equal(win.LEAGUES.find(l => l.id === '123').account_source, 'imported');
owner = 'other';
restoreAccount();
assert.equal(C.links.length, 0, 'links remain scoped to the selected account');
assert.deepEqual(plain(cached), before);
console.log('ESPN unlink: ok (restore built-in league, immutable schedules, legacy tombstones, account isolation)');
