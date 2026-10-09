// A linked Sleeper user's league reads that user's trades, drafts and draft
// slot, not the login's. Primary-user leagues keep using MY_USER_ID.
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const slice = (from, to) => {
  const a = app.indexOf(from), b = app.indexOf(to, a);
  assert(a >= 0 && b > a, `slice missing: ${from}`);
  return app.slice(a, b);
};
const tradeSrc = slice('function leagueUserId', '\n  // Strip above the Trade Lab');
const draftSrc = slice('let _myDrafts = null', '\n  let _draftTimer');

const primary = { id: 'P', rosters: [{ roster_id: 1, owner_id: 'login', is_me: true }] };
const linked = { id: 'L', linked_user: 'buddy', rosters: [
  { roster_id: 1, owner_id: 'rival', is_me: false },
  { roster_id: 2, owner_id: 'buddyId', is_me: true },
] };
const window = { MY_USER_ID: 'login', LEAGUES: [primary, linked] };

const urls = [];
const routes = {
  'league/L': { season: '2026', previous_league_id: null },
  'league/L/rosters': [{ roster_id: 1, owner_id: 'rival' }, { roster_id: 2, owner_id: 'buddyId' }],
  'league/L/users': [{ user_id: 'rival', display_name: 'Rival' }, { user_id: 'buddyId', display_name: 'buddy' }],
  'league/L/transactions/3': [{ type: 'trade', status: 'complete', leg: 3, status_updated: 5,
    roster_ids: [1, 2], adds: { p1: 2, p2: 1 }, drops: { p1: 1, p2: 2 }, draft_picks: [] }],
  'league/L/drafts': [],
  'user/login/drafts/nfl/2026': [{ draft_id: 'd1' }, { draft_id: 'shared' }],
  'user/buddyId/drafts/nfl/2026': [{ draft_id: 'd2' }, { draft_id: 'shared' }],
};
const fetch = async (u) => {
  const key = u.replace('https://api.sleeper.app/v1/', '');
  urls.push(key);
  return key in routes ? { ok: true, json: async () => routes[key] } : { ok: false };
};
const localStorage = { getItem: () => null, setItem: () => {} };
const deps = { window, fetch, localStorage, accountKey: k => k, PARTNER_TTL: 0,
  partnerCache: new Map(), partnerPending: new Map() };
const run = (src, ret) => new Function(...Object.keys(deps), `${src}; return { ${ret} };`)(...Object.values(deps));
const { leagueUserId, loadTradePartnerHistory } = run(tradeSrc, 'leagueUserId, loadTradePartnerHistory');

assert.equal(leagueUserId(primary), 'login');
assert.equal(leagueUserId(linked), 'buddyId');
assert.equal(leagueUserId(null), 'login', 'a mock draft with no league stays on the login');

(async () => {
  const hist = await loadTradePartnerHistory(linked);
  assert.equal(hist.partners.length, 1);
  const [rival] = hist.partners;
  assert.equal(rival.uid, 'rival');
  assert.deepEqual(rival.trades[0].got, ['p1']);
  assert.deepEqual(rival.trades[0].sent, ['p2']);

  // Draft slot: renderDraftBoard keys draft_order on the league's own user.
  const draftOrder = { rival: 1, buddyId: 2 };
  assert.equal(draftOrder[leagueUserId(linked)], 2);
  assert.match(app, /const meUid = leagueUserId\(lg\._knownLeague\);\s*const mySlot = \(d\.draft_order \|\| \{\}\)\[meUid\]/);

  const { myDrafts } = run(`${slice('function leagueUserId', '\n  function pickTraceKey')}\n${draftSrc}`, 'myDrafts');
  const real = Date.prototype.getFullYear;
  Date.prototype.getFullYear = () => 2026;
  const drafts = await myDrafts();
  Date.prototype.getFullYear = real;
  assert(urls.includes('user/buddyId/drafts/nfl/2026'), 'linked user drafts must be fetched');
  assert.deepEqual(drafts.map(d => d.draft_id), ['d1', 'shared', 'd2'], 'drafts merged and deduped');

  console.log('linked-user-league.test.js: all assertions passed');
})().catch(e => { console.error(e); process.exit(1); });
