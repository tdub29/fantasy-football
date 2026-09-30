// Live Sleeper pull: an injury, roster move or final score after the build has to
// reach the title odds without a rebuild. Achane (ACL, 2026-09-29) is the case: the
// build still had his weekly lines, the live feed has none, so he must go null.
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const s = app.indexOf('  // ---- live sleeper'), e = app.indexOf('  // ---- end live sleeper', s);
assert(s >= 0 && e > s, 'live sleeper block missing');
const { fetchLive, applyLive } = new Function(`${app.slice(s, e)}\nreturn { fetchLive, applyLive };`)();

const proj = (pid, pts, inj = null, pos = 'RB') => ({ player_id: pid, team: 'MIA',
  stats: pts == null ? { adp_dd_ppr: 1000 } : { pts_ppr: pts },
  player: { injury_status: inj, position: pos, first_name: 'P', last_name: pid } });
const feed = {
  'https://api.sleeper.app/v1/state/nfl': { season: '2026', week: 17 },
  'https://api.sleeper.app/v1/league/L1/rosters': [
    { roster_id: 1, players: ['A', 'B'], starters: ['B'], reserve: null, taxi: null,
      settings: { wins: 12, losses: 4, fpts: 1500, fpts_decimal: 55, fpts_against: 1400, fpts_against_decimal: 5 } },
    { roster_id: 2, players: ['C'], starters: ['C'], reserve: ['X'], settings: { wins: 4, losses: 12 } }],
  'https://api.sleeper.app/v1/league/L1/matchups/17': [
    { roster_id: 1, matchup_id: 3 }, { roster_id: 2, matchup_id: 3 }],
};
const url = w => `https://api.sleeper.com/projections/nfl/2026/${w}?season_type=regular&position%5B%5D=QB&position%5B%5D=RB&position%5B%5D=WR&position%5B%5D=TE&position%5B%5D=K&position%5B%5D=DEF`;
feed[url(17)] = [proj('A', null, 'IR'), proj('B', 14.2), proj('N', 9.1, null, 'WR'), proj('Q', 11, 'Questionable')];
feed[url(18)] = [proj('A', null, 'IR'), proj('B', 15.04), proj('N', 8.8, null, 'WR'), proj('Q', 12)];
const get = async u => { if (!(u in feed)) throw new Error(`unexpected ${u}`); return feed[u]; };

(async () => {
  const live = await fetchLive(get, ['L1'], 123);
  assert.equal(live.week, 17);
  assert.deepEqual(live.lines.B, { 17: 14.2, 18: 15 });
  assert.equal(live.lines.A, undefined, 'no projection is no line');
  assert.equal(live.meta.A.inj, 'IR');
  assert.deepEqual(live.leagues.L1.opp, { 1: 2, 2: 1 });

  // Any failed week drops the whole pull: a missing week read as null benches everyone.
  const broken = async u => (u === url(18) ? Promise.reject(new Error('503')) : get(u));
  await assert.rejects(fetchLive(broken, ['L1'], 1));
  // A league with no matchups posted still pulls, just without an opponent.
  const noMatch = async u => (u.includes('/matchups/') ? Promise.reject(new Error('404')) : get(u));
  assert.deepEqual((await fetchLive(noMatch, ['L1'], 1)).leagues.L1.opp, {});

  const baked = w => Array.from({ length: 18 }, (_, i) => (i + 1 >= w ? 16.5 : 10));
  const wr = { season: 2026, currentWeek: 16, players: [
    { id: 'A', pos: 'RB', sleeper: baked(1) }, { id: 'B', pos: 'RB', sleeper: baked(1) }] };
  const players = { A: { injury_status: null }, Q: { injury_status: null } };
  const lg = { id: 'L1', week: 16, rosters: [{ roster_id: 1, players: ['A'], wins: 11, reserve: [] }, { roster_id: 2 }] };
  const espn = { id: 'E1', week: 16, rosters: [{ roster_id: 1, wins: 3 }] };
  assert.equal(applyLive(live, wr, players, [lg, espn]), true);

  const A = wr.players.find(p => p.id === 'A');
  assert.deepEqual(A.sleeper.slice(15), [16.5, null, null], 'weeks before the live week stay; the rest empty');
  assert.equal(wr.players.find(p => p.id === 'B').sleeper[16], 14.2);
  assert.equal(wr.liveWeek, 17);
  assert.equal(players.A.injury_status, 'IR');
  assert.equal(players.Q.injury_status, 'Questionable');
  const N = wr.players.find(p => p.id === 'N');
  assert.deepEqual([N.pos, N.sleeper[16], N.sleeper[17]], ['WR', 9.1, 8.8], 'a promoted backup joins');

  const [r1, r2] = lg.rosters;
  assert.equal(lg.week, 17);
  assert.deepEqual([r1.players, r1.reserve, r1.wins, r1.losses, r1.opponent_roster_id], [['A', 'B'], [], 12, 4, 2]);
  assert.ok(Math.abs(r1.fpts - 1500.55) < 1e-9 && Math.abs(r1.fpts_against - 1400.05) < 1e-9);
  assert.deepEqual([r2.reserve, r2.wins], [['X'], 4]);
  assert.deepEqual([espn.week, espn.rosters[0].wins], [16, 3], 'ESPN leagues keep the build');

  assert.equal(applyLive({ ...live, season: 2027 }, wr, players, [lg]), false, 'another season never overwrites');
  console.log('live-sleeper: ok');
})().catch(err => { console.error(err); process.exit(1); });
