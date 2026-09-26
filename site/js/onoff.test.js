// Stats Lab On/Off tab: the pure math behind the on/off and game-split tables, and
// the shape of every onoff-YYYY.js on disk. Off is team minus on, so the two sides
// must add back to the team; a teammate's on counts can never exceed his totals;
// every game lands in exactly one starting-QB group and one playcaller group.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const app = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
const s = app.indexOf('  // ---- on/off math'), e = app.indexOf('  // ---- end on/off math', s);
assert(s >= 0 && e > s, 'on/off math block missing');
const { ooDiv, ooSide, ooSplit, ooMates, ooGroupRows } =
  new Function(`${app.slice(s, e)}\nreturn { ooDiv, ooSide, ooSplit, ooMates, ooGroupRows };`)();

const T = ['plays', 'pass', 'db', 'epa', 'succ', 'tgt'];
const team = { games:17, tot:[1000, 540, 580, 30, 450, 470],
  r:{ B:[120, 500], C:[80, 450] },
  on:{ A:{ s:800, v:[800, 450, 480, 20, 350, 400], m:{ B:[100, 420], C:[60, 380] } } } };

// One side: rates per play, and an empty side has no rate instead of NaN.
const on = ooSide(team.on.A.v, T);
assert.deepEqual([on.plays, on.db, on.tgt], [800, 480, 400]);
assert.equal(on.epa, 0.025);
assert.equal(on.pass, 450 / 800);
assert.equal(ooSide([0, 0, 0, 0, 0, 0], T).epa, null);
assert.equal(ooDiv(3, 0), null);

// Off is the team total minus on.
const sp = ooSplit(team, team.on.A, T);
assert.deepEqual([sp.off.plays, sp.off.db, sp.off.tgt], [200, 100, 70]);
assert.equal(sp.on.plays + sp.off.plays, team.tot[0]);
assert.ok(Math.abs(sp.off.epa - 10 / 200) < 1e-12);

// Teammates: share over the team's targets on that side, Tgt/DB over his own dropbacks.
const b = ooMates(team, team.on.A, T).find(r => r.pid === 'B');
assert.deepEqual([b.tgtOn, b.tgtOff, b.dbOn, b.dbOff], [100, 20, 420, 80]);
assert.equal(b.shareOn, 100 / 400);
assert.equal(b.shareOff, 20 / 70);
assert.equal(b.tpdbOn, 100 / 420);
assert.equal(b.tpdbOff, 20 / 80);

// Game splits: one row per player across groups, most PPR first, a gap where he did not play.
const rows = ooGroupRows([{ id:'Q1', g:15, tgt:450, P:{ B:[15, 210, 110], C:[14, 90, 60], Z:[3, 0, 0] } },
  { id:'Q2', g:2, tgt:60, P:{ B:[2, 20, 12] } }]);
assert.deepEqual(rows.map(r => r.pid), ['B', 'C'], 'a player with no points and no targets drops out');
assert.equal(rows[0].cells[0].ppg, 14);
assert.equal(rows[0].cells[1].share, 0.2);
assert.equal(rows[1].cells[1], null);

// Every published file: on + off adds back, teammate on <= total, groups cover every game.
const win = {};
const files = fs.readdirSync(`${__dirname}/../data`).filter(f => /^onoff-\d{4}\.js$/.test(f));
for (const f of files) vm.runInNewContext(fs.readFileSync(`${__dirname}/../data/${f}`, 'utf8'), { window:win });
const all = Object.values(win.ONOFF_BY_SEASON || {});
assert.ok(all.some(F => F.level === 'play') && all.some(F => F.level === 'game'), 'a play-level and a game-level season');
for (const F of all) {
  assert.equal(JSON.stringify(F.T), JSON.stringify(T), `${F.season}: T fields`);   // another realm's array
  for (const [tm, t] of Object.entries(F.teams)) {
    for (const [pid, v] of Object.entries(t.on)) {
      assert.ok(v.s >= F.minSnaps, `${F.season} ${tm} ${pid}: under the snap floor`);
      const sp = ooSplit(t, v, F.T);
      assert.ok(sp.off.plays >= 0 && sp.off.db >= 0 && sp.off.tgt >= 0, `${F.season} ${tm} ${pid}: negative off side`);
      if (F.level === 'game') assert.ok(v.g <= t.games, `${F.season} ${tm} ${pid}: more games than the team`);
      for (const r of ooMates(t, v, F.T)) {
        assert.ok(r.tgtOff >= 0 && r.dbOff >= 0 && r.tgtOn <= r.dbOn + r.dbOff, `${F.season} ${tm} ${pid} -> ${r.pid}`);
      }
    }
    for (const k of ['qb', 'pc']) {
      const n = t[k].reduce((a, g) => a + g.g, 0);
      assert.ok(n > 0 && t[k].every(g => g.g > 0 && g.pl > 0), `${F.season} ${tm} ${k}: empty group`);
      assert.equal(n, t[k === 'qb' ? 'pc' : 'qb'].reduce((a, g) => a + g.g, 0), `${F.season} ${tm}: QB and playcaller games disagree`);
    }
  }
}

// The Data Suite example: A.J. Brown on vs off for the 2025 Eagles, with DeVonta Smith as a teammate.
const P25 = (win.ONOFF_BY_SEASON || {})[2025];
if (P25) {
  const id = (n) => Object.keys(P25.names).find(k => P25.names[k][0] === n);
  const aj = P25.teams.PHI.on[id('A.J. Brown')];
  assert.ok(aj && aj.m[id('DeVonta Smith')], 'A.J. Brown 2025 has DeVonta Smith as a teammate row');
}
console.log(`onoff.test.js: ${files.length} season files ok`);
