const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const start = app.indexOf('function pickTraceKey');
const end = app.indexOf('\n  async function tradePartnerHistory', start);
assert(start >= 0 && end > start, 'historical pick helpers missing');
const { pickTraceKey, historicalPickLabel } = new Function(
  `${app.slice(start, end)}; return { pickTraceKey, historicalPickLabel };`,
)();

assert.equal(pickTraceKey('2025', 3, 'karl'), '2025|3|karl');
assert.equal(historicalPickLabel({
  season:'2025', round:1,
  outcome:{ playerName:'Colston Loveland', pickInRound:7 },
}), '2025 R1 (1.07 → Colston Loveland)');
assert.equal(historicalPickLabel({
  season:'2025', round:3,
  outcome:{ playerName:'Elic Ayomanor', pickInRound:9 },
}), '2025 R3 (3.09 → Elic Ayomanor)');
assert.equal(historicalPickLabel({
  season:'2027', round:3, outcome:null,
}), '2027 R3');

assert.match(app, /const originUid = ownerOf\.get\(String\(pick\.roster_id\)\)/,
  'pick origin must resolve through season roster ownership');
assert.match(app, /Object\.entries\(draft\.draft_order \|\| \{\}\)/,
  'draft result must resolve original slot through stable user IDs');
assert.doesNotMatch(app, /now held by|drafted by you|original;/,
  'history should show the pick result without ownership-chain clutter');
assert.match(app, /username: usernames\.get\(uid\) \|\| ''/,
  'trade partners should retain Sleeper usernames beside team names');
assert.match(app, /partnerPending\.has\(lg\.id\)/,
  'concurrent Trade Lab renders must share one historical API request');
assert.match(app, /window\.TRADE_HISTORY\?\.leagues/,
  'generated history must render before the live API fallback');

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(`${__dirname}/../data/trade-history.js`, 'utf8'), ctx);
const taco = ctx.window.TRADE_HISTORY.leagues['1341184676601028608'];
const karl = taco.partners.find(p => p.name === 'Karl Havoc');
assert.equal(karl.username, 'JCon4');
const labels = karl.trades.flatMap(t => [...t.gotPicks, ...t.sentPicks]).map(historicalPickLabel);
for (const expected of [
  '2025 R1 (1.07 → Colston Loveland)',
  '2025 R2 (2.07 → Tre Harris)',
  '2025 R3 (3.07 → Elijah Arroyo)',
  '2025 R3 (3.09 → Elic Ayomanor)',
]) assert(labels.includes(expected), `missing generated outcome: ${expected}`);

console.log('trade-history-picks.test.js: all assertions passed');
