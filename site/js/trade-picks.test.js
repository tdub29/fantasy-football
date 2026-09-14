const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const root = `${__dirname}/..`;
const dataContext = { window: {} };
vm.runInNewContext(fs.readFileSync(`${root}/data/leagues.js`, 'utf8'), dataContext);

const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const helperStart = app.indexOf('function knownDraftSlot');
const helperEnd = app.indexOf('// Estimate origin roster', helperStart);
assert(helperStart >= 0 && helperEnd > helperStart, 'draft slot helpers not found');
const { knownDraftSlot, draftPickLabel } = new Function(
  `${app.slice(helperStart, helperEnd)}; return { knownDraftSlot, draftPickLabel };`,
)();
const start = app.indexOf('function rosterOwnedPicks');
const end = app.indexOf('\n  function buildTradeSide', start);
assert(start >= 0 && end > start, 'rosterOwnedPicks source not found');
assert.match(app, /onclick:\s*\(\)\s*=>\s*KT\.toggle\(label,\s*k,\s*'add'\)/, 'pick click must add');
assert.match(app, /row\.setAttribute\('aria-pressed'/, 'pick selection state must sync');
assert(app.includes("draftPickLabel(yr, round, originRosterId, lg).replace"), 'draft-capital chips must use exact labels');

const rosterOwnedPicks = new Function(
  'pickValue',
  'draftPickLabel',
  `${app.slice(start, end)}; return rosterOwnedPicks;`,
)(() => 1, draftPickLabel);

const league = dataContext.window.LEAGUES.find(item => item.short_name === 'yuH');
const roster = league.rosters.find(item => item.is_me);
const picks = rosterOwnedPicks(roster.roster_id, league);
const keys = picks.map(item => `${item.season}:${item.round}:${item.originRosterId}`);

// status is live Sleeper state that flips pre_draft -> drafting -> complete across
// a season; assert it's a valid phase, not a fixed value that rots each year.
assert(['pre_draft', 'drafting', 'complete', 'paused'].includes(league.drafts[0].status), 'unexpected draft status');
assert.equal(Object.keys(league.drafts[0].draft_order).length, 10);
// The 2026 rookie draft has completed, so owned picks are the next undrafted
// seasons (2027-2028). rosterOwnedPicks correctly excludes a completed draft;
// retarget these from 2026 to current live pick ownership for roster 5.
assert(keys.includes('2027:3:5'), 'missing own 2027 R3');
assert(keys.includes('2027:1:2'), 'missing acquired 2027 R1 (from Wake N Baker)');
assert(keys.includes('2028:1:5'), 'missing future-season 2028 R1');
assert.equal(new Set(keys).size, keys.length, 'duplicate pick keys');

const matthew = league.rosters.find(item => item.owner_name === 'matthewarmstrong02');
// A completed-draft season still carries its draft_order, so knownDraftSlot
// resolves the exact slot; a future season with no order falls back to 'R{n}'.
assert.equal(knownDraftSlot('2026', 1, matthew.roster_id, league), 6);
assert.equal(draftPickLabel('2026', 1, matthew.roster_id, league), '2026 1.06');
assert.equal(draftPickLabel('2027', 1, matthew.roster_id, league), '2027 R1');
assert(rosterOwnedPicks(matthew.roster_id, league).some(item => item.label === '2028 R1'), 'Matthew should own a 2028 first');

const snake = {
  total_rosters: 10,
  rosters: [{ roster_id: 7, owner_id: 'owner-7', team_name: 'Snake Team' }],
  drafts: [{ season: '2026', type: 'snake', draft_order: { 'owner-7': 3 }, settings: { teams: 10 } }],
};
assert.equal(knownDraftSlot('2026', 2, 7, snake), 8);
assert.equal(draftPickLabel('2026', 2, 7, snake), '2026 2.08');

console.log('ok: yuH owned picks retarget to 2027-2028 post-2026-draft; slot labels + acquired picks resolve');
