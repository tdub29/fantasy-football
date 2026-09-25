// Price a trade in TITLE ODDS, from the command line.
//
// The Trade Lab in the browser answers "is this fair on KTC". This answers the only
// question that decides a season: what does it do to the odds. It runs the site's own
// `championshipOdds` / `titleEquity` over a set of what-if scenarios, ages the whole
// league forward, converts everyone's picks to rookies, and reports paired seeds.
//
//   YEARS=7 SIMS=2500 SEED=20260912 node site/js/trade-sim.js
//   SEED=777001 node site/js/trade-sim.js        # second seed, same scenarios
//
// Edit SCENARIOS at the bottom. Each is `rosterId -> whatIf`, where whatIf takes
// `add` / `drop` (Sleeper player ids) and `spendPicks` / `gainPicks` (pick labels and
// pick objects). Model BOTH sides or the answer is wrong: buying a starter off a
// contender costs that contender, and the model is what prices it.
//
// Two traps this file exists to keep you out of:
//   1. `simPool` has NO waiver pool. A scenario that ships every backup at a position
//      is charged an EMPTY starting slot, not the gap over replacement. If a scenario
//      empties a position, `add` the free agent that would actually be claimed.
//   2. A pick's value depends on where its ORIGIN team finishes, so the slot order is
//      recomputed here from KTC starting strength rather than pinned. A rebuilder's
//      own first is an early pick and is worth more, not less.
//   3. That price is ENDOGENOUS to the trade itself. `pv(season, round, rid, whatIf)`
//      slots off the rosters as they will look AFTER the deal, because the deal is what
//      changes them. Price a buyer's own picks pre-trade and you will tell him to keep
//      the wrong ones; that error shipped on 2026-09-12 and he caught it.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const SITE = path.resolve(__dirname, '..');
const LEAGUE_NAME = process.env.LEAGUE || 'Password is taco';
const YEARS = Number(process.env.YEARS || 7);
const SIMS = Number(process.env.SIMS || 2500);
const SEED = Number(process.env.SEED || 20260912);

const ctx = { window: {}, console };
// The simulator's inputs, the same files index.html gives the Trade Lab: without
// schedule.js the season in progress replayed from 0-0 on random pairings, and
// without weekly-rankings.js a redraft league had no rest-of-season lines.
for (const f of ['leagues.js', 'projections.js', 'players.js', 'ktc.js', 'weekly-rankings.js', 'schedule.js']) {
  vm.runInNewContext(fs.readFileSync(`${SITE}/data/${f}`, 'utf8'), ctx);
}

// Pull the simulator out of app.js the same way site/js/title-odds.test.js does: slice
// the functions, stub the one global that would drag half the app in. Keep the slice
// markers identical to that test so both break together if app.js is restructured.
const app = fs.readFileSync(`${SITE}/js/app.js`, 'utf8');
const cut = (a, b) => {
  const i = app.indexOf(a), j = app.indexOf(b, i);
  assert(i >= 0 && j > i, `slice failed: ${a}`);
  return app.slice(i, j);
};
const H = new Function('window',
  `${cut('  const CURRENT_SEASON', '  // Position aging curves')}
   function rosterOwnedPicks(rosterId, league, horizon = 2) {
     return (window.__TEST_PICKS && window.__TEST_PICKS[rosterId]) || [];
   }
   ${cut('function isDynastyLeague(lg)', '  // The league whose format defines VOR replacement')}
   ${cut('  let _rosPts = null;', '  // Replacement level on the SAME rest-of-season basis')}
   ${cut('function offenseStarterCount', '  // Starting-lineup strength')}
   ${cut('function projUnitData()', 'function buildWhatIfTray')}
   return { championshipOdds, titleEquity, CURRENT_SEASON, offenseStartingSlots };`
)(ctx.window);

const lg = ctx.window.LEAGUES.find(l => l.short_name === LEAGUE_NAME);
assert(lg, `no league named ${LEAGUE_NAME}`);
const ME = lg.rosters.find(r => r.is_me).roster_id;
const N = lg.rosters.length;

// ---- projected draft order, the way originSlot does it: rank by the KTC value of the
// STARTING lineup, weakest first. Summing whole rosters ranks a hoarder as a contender
// and slots his first last; that shipped once.
const ranking = ctx.window.RANKINGS_SOURCES.find(s => s.id === 'keeptradecut')
  .rankings.find(r => r.id === (lg.is_superflex ? 'ktc-superflex' : 'ktc-oneqb'));
const norm = (s) => (s || '').normalize('NFD').replace(/[^a-zA-Z]/g, '').toLowerCase();
const ktcByName = new Map(ranking.players.map(p => [norm(p.name), p.ktcValue]));
const anchor = new Map(ranking.picks.map(p => [`${p.season}|${p.slot}|${p.round}`, p.ktcValue]));
const SLOTS = (lg.roster_positions || []).filter(s => s !== 'BN' && s !== 'IR' && s !== 'TAXI');
const FLEXOK = { FLEX: ['RB', 'WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'], REC_FLEX: ['WR', 'TE'] };
const BENCHED = new Set(['Out', 'Doubtful', 'IR', 'PUP', 'NA', 'Sus']);

function startingKtc(roster, whatIf) {
  // The trade being priced changes the lineup that sets the slot, so apply it FIRST.
  const wi = (whatIf && whatIf[roster.roster_id]) || {};
  const drop = new Set((wi.drop || []).map(String));
  // Taxi and IR are in `players` and cannot start, which is the whole point of
  // `startableIds(roster)` in app.js. This file re-implements the lineup and for months
  // re-implemented it WITHOUT that filter, so five taxi bodies were being counted inside
  // starting lineups and inflating the draft-slot input: djcomstock read 39,378 against a
  // real 38,142 (Cyrus Allen 3,463 and Pat Bryant 3,290 are on his taxi). Caught by an
  // adversarial pass 2026-09-16. It did not move the slot ORDER or any pick price in the
  // Tee Higgins set, checked both ways, but a closer call would have priced wrong.
  const sidelined = new Set([...(roster.taxi || []), ...(roster.reserve || [])].map(String));
  const ids = [
    ...(roster.players || []).filter(p => !drop.has(String(p)) && !sidelined.has(String(p))),
    ...(wi.add || []),
  ];
  const pool = ids
    .map(pid => ctx.window.PLAYERS[pid])
    .filter(p => p && ['QB', 'RB', 'WR', 'TE'].includes(p.pos) && !BENCHED.has(p.injury_status))
    .map(p => ({ v: ktcByName.get(norm(p.name)) || 0, pos: p.pos }))
    .sort((a, b) => b.v - a.v);
  const used = new Set();
  let total = 0;
  for (const slot of SLOTS) {
    const ok = FLEXOK[slot] || [slot];
    const hit = pool.findIndex((p, i) => !used.has(i) && ok.includes(p.pos));
    if (hit >= 0) { used.add(hit); total += pool[hit].v; }
  }
  return total;
}

// A pick's price is ENDOGENOUS to the trade that moves it. Slot it off the rosters as
// they will look AFTER the deal, never before. Measured 2026-09-12 on the JoeysYIDS +
// Deal A pair: pricing pre-trade put roster 10 at slot 3 and called his own 2027 2nd
// (4,321) dearer than the one he had acquired from a better team (4,074), so the advice
// was to send the acquired pick. Post-trade he is slot 8 and it inverts: his own is
// 3,995 against the acquired 4,153. Buying five starters makes YOUR picks cheap and the
// seller's dear, in the same instant the trade lands.
// ponytail: slots off TODAY's lineup for every future class, where app.js `originSlot`
// ages the roster by `yearsOut` first. Checked 2026-09-12 against an aged python build:
// same ordering, values within ~5%, and the pre-vs-post inversion identical. Add the
// ageRetention pass if a future call turns on a gap that small.
function slotsUnder(whatIf) {
  return new Map(
    lg.rosters
      .map(r => ({ id: r.roster_id, s: startingKtc(r, whatIf) }))
      .sort((a, b) => a.s - b.s)        // weakest first: the worst team picks 1.01
      .map((r, i) => [r.id, i + 1])
  );
}
const slotOf = slotsUnder(null);

// KTC publishes three rookie classes and stops. A question about a 2029 pick is a real
// question and "KTC missing 2029 R1" is not an answer, so anything past the last published
// class is synthesized from it: one more year out is one more DECAY. It applies to EVERY
// roster, so the comparison stays fair. 0.88 is the honest middle. The live 2027 -> 2028 step
// measures 0.82 to 0.86 per slot, and that step is also unwinding the Jeremiah Smith premium
// sitting on 2027 (see strategy.js::pick_class_premium), which a plain year of time discount
// is not. Run DECAY=0.80 and DECAY=1.00 before trusting a sign that turns on a synthesized
// class; measured 2026-09-16 on the Tee Higgins pair, the ordering did not move.
const PICK_DECAY = Number(process.env.DECAY || 0.88);
const LAST_KTC_SEASON = Math.max(...ranking.picks.map(p => Number(p.season)));
function anchorAt(season, slot, round) {
  const want = Number(season);
  const v = anchor.get(`${Math.min(want, LAST_KTC_SEASON)}|${slot}|${round}`);
  return v == null ? null : v * Math.pow(PICK_DECAY, Math.max(0, want - LAST_KTC_SEASON));
}

// Interpolates between KTC's early / mid / late anchors by exact projected slot, same as
// interpPickValue in app.js. Site scale is KTC / 100. Pass the trade's whatIf to price a
// pick at what it is worth once that trade has happened.
function pv(season, round, originRid, whatIf) {
  const at = (b) => anchorAt(season, b, round);
  const vE = at('early'), vM = at('mid'), vL = at('late');
  assert(vE != null && vM != null && vL != null, `KTC missing R${round} in every published class`);
  const mid = (1 + N) / 2;
  const sm = whatIf ? slotsUnder(whatIf) : slotOf;
  const s = Math.min(Math.max(sm.get(originRid), 1), N);
  const k = s <= mid ? vE + (vM - vE) * (s - 1) / (mid - 1) : vM + (vL - vM) * (s - mid) / (N - mid);
  return Math.round(k / 100 * 10) / 10;
}
// SCALE stress-tests the assumption that decides every picks-for-players verdict:
// `pickRookiePoints` prices a converted pick's rookie season off the pick's value, so
// scaling value here scales how much a pick is worth as a future player. It applies to
// EVERY roster, so the comparison stays fair. Measured 2026-09-12: the seven-year sign
// on a picks-for-players trade flips at about SCALE=1.07, while the current season does
// not move at all. Run 1.0 and 1.3 before trusting any multi-year verdict.
const SCALE = Number(process.env.SCALE || 1);
const label = (season, round, rid) => `${season} R${round} (from R${rid})`;
const pick = (season, round, rid, whatIf) =>
  ({ season: String(season), round, originRosterId: rid, label: label(season, round, rid), value: pv(season, round, rid, whatIf) * SCALE });

// What a set of picks is worth before a trade vs after it. Use this, not a mental model,
// whenever you are deciding WHICH of two same-round picks to send.
function repriceUnder(whatIf, picks) {
  return picks.map(([season, round, rid, name]) => {
    const before = pv(season, round, rid), after = pv(season, round, rid, whatIf);
    return { name: name || label(season, round, rid), before, after, diff: Math.round((after - before) * 10) / 10 };
  });
}

// ---- who owns which pick, from traded_picks
// KTC prices rounds 1 to 4 and stops, so a deeper rookie draft is clamped to what it
// actually prices rather than having a 5th-round anchor invented for it. yuH drafts 5
// rounds and that assertion-failed every run here until 2026-09-17. A 5th in a 10-team
// league is a near-zero asset, so clamping costs the model almost nothing; fabricating
// its value would not be free. Clamped loudly, never silently.
const LAST_KTC_ROUND = Math.max(...ranking.picks.map(p => Number(p.round)));
const DRAFT_ROUNDS = Math.max(4, ...(lg.drafts || []).map(d => Number(d.settings?.rounds) || 0));
const ROUNDS = Math.min(DRAFT_ROUNDS, LAST_KTC_ROUND);
if (DRAFT_ROUNDS > ROUNDS) {
  console.log(`note: ${LEAGUE_NAME} drafts ${DRAFT_ROUNDS} rounds, KTC prices ${ROUNDS}. `
            + `Rounds ${ROUNDS + 1} to ${DRAFT_ROUNDS} are left out of every roster's slate.`);
}
// HORIZON classes forward. Two by default, which is what KTC publishes and what every
// scenario before 2026-09-16 assumed. Raise it to reach a 2029 pick; `pv` synthesizes the
// anchors past KTC's last class and hands the extra slate to all ten rosters, never just one.
const HORIZON = Number(process.env.HORIZON || 2);
const SEASONS = Array.from({ length: HORIZON }, (_, i) => String(H.CURRENT_SEASON + 1 + i));
const moved = new Map((lg.traded_picks || []).map(t => [`${t.season}|${t.round}|${t.roster_id}`, Number(t.owner_id)]));
const PICKS = Object.fromEntries(lg.rosters.map(r => [r.roster_id, []]));
for (const season of SEASONS) {
  for (let round = 1; round <= ROUNDS; round++) {
    for (const r of lg.rosters) {
      const owner = moved.get(`${season}|${round}|${r.roster_id}`) ?? r.roster_id;
      PICKS[owner].push(pick(season, round, r.roster_id));
    }
  }
}
ctx.window.__TEST_PICKS = PICKS;

function run(name, whatIf) {
  const eq = H.titleEquity(lg, { years: YEARS, sims: SIMS, whatIf, seed: SEED });
  const y0 = eq.byYear[0];
  process.stderr.write(`ran: ${name}${String.fromCharCode(10)}`);
  return { name, y0, equity: eq.equity, byYear: eq.byYear };
}

// ---------------------------------------------------------------------------
// SCENARIOS. Edit these. Ids are Sleeper player ids.
//
// The 2026-09-12 JoeysYIDS + Deal A pair that this file was written for is DONE: roster 10
// now rosters Collins, Waddle, Downs, Watson and Johnston, and holds no first-round pick
// before 2029. History is in docs/TRADE-DECISION-2026-09-joeysyids.md. What is left open is
// the quarterback surplus: three QBs in a one-QB league, about 10,400 KTC that cannot start.
// ---------------------------------------------------------------------------
const ALLEN = '4984', CALEB = '11560', LOVE = '6804';
const BRISSETT = '3257';   // best unrostered QB, 158.8 proj: the real cost of selling depth
const EVANS = '2216', BOUTTE = '9504', JENNINGS = '7049';

const SCENARIOS = {
  'Stand pat': null,
  'Sell Caleb Williams, keep Love': { [ME]: { drop: [CALEB] } },
  'Sell Jordan Love, keep Caleb': { [ME]: { drop: [LOVE] } },
  'Sell both, claim the waiver QB': { [ME]: { drop: [CALEB, LOVE], add: [BRISSETT] } },
  'Sell Evans (33) while he still projects 206': { [ME]: { drop: [EVANS] } },
};

const ktcOf = (pid) => ktcByName.get(norm((ctx.window.PLAYERS[pid] || {}).name)) || 0;
module.exports = { lg, H, slotOf, slotsUnder, startingKtc, ktcOf, pv, pick, label, repriceUnder, PICKS, SCENARIOS, run, ME,
                   LAST_KTC_SEASON, PICK_DECAY, HORIZON, SEASONS };

if (require.main === module) {
  const rows = Object.entries(SCENARIOS).map(([name, wi]) => run(name, wi));
  const pad = (x, n) => String(x).padEnd(n);
  const rp = (x, n) => String(x).padStart(n);
  const W = Math.max(...rows.map(r => r.name.length)) + 2;
  console.log('');
  console.log(`${LEAGUE_NAME}  |  ${YEARS} seasons  |  ${SIMS} sims  |  seed ${SEED}`);
  console.log(pad('scenario', W) + rp('title', 8) + rp('playoff', 9) + rp('rank', 6) + rp('equity', 9));
  for (const r of rows) {
    console.log(pad(r.name, W) + rp(`${(r.y0.title * 100).toFixed(2)}%`, 8)
      + rp(`${(r.y0.playoff * 100).toFixed(1)}%`, 9) + rp(r.y0.rank, 6) + rp((r.equity * 100).toFixed(2), 9));
  }
  console.log('');
  console.log('per-year title odds (%)');
  for (const r of rows) console.log('  ' + pad(r.name, W) + r.byYear.map(y => `${y.season}:${(y.title * 100).toFixed(1)}`).join('  '));
  console.log('');
  console.log('Run a second SEED before believing any delta. At these sim counts the noise');
  console.log('floor is a few tenths of a point, and a sign that flips between seeds is noise.');
}
