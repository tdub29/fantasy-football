// Owning browser boundary: a late lookup must not replace the selected account;
// same-league users must have independent marks and snapshots. Real generated
// league/player fixtures exercise the app's normal roster and derived-data paths.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { chromium } = require('playwright');
const fixtures = { window: {} };
vm.runInNewContext(fs.readFileSync(`${__dirname}/../data/leagues.js`, 'utf8'), fixtures);
const league = fixtures.window.LEAGUES[0];
// Public ESPN response captured 2026-10-07, trimmed to fields the loader reads.
const espn = JSON.parse(fs.readFileSync(`${__dirname}/../../projections/_fixtures/espn-public-league.json`, 'utf8'));
const espnId = String(espn.id);
const url = process.env.FF_TEST_URL || 'http://localhost:8793';

(async () => {
  const hardStop = setTimeout(() => { console.error('Account lifecycle exceeded 180 seconds'); process.exit(1); }, 180000);
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    page.setDefaultTimeout(60000);
    await page.route(`${url}/**`, async route => {
      const pathname = new URL(route.request().url()).pathname;
      const file = path.join(__dirname, '..', pathname === '/' ? 'index.html' : pathname);
      const ext = path.extname(file);
      const contentType = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[ext] || 'application/octet-stream';
      await route.fulfill({ body: fs.readFileSync(file), contentType });
    });
    await page.route(/https:\/\/(fonts\.|sleepercdn\.)/, route => route.abort());
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://lm-api-reads.fantasy.espn.com/**', route => route.fulfill({
      status:route.request().url().includes('/leagues/999?') ? 403 : 200,
      contentType:'application/json', headers:{'access-control-allow-origin':'*'}, body:JSON.stringify(espn),
    }));
    const linkEspn = async () => {
      await page.evaluate(() => FF_ACCOUNT.openPanel('espn'));
      await page.locator('#acct-espn-link').fill(`https://fantasy.espn.com/football/league?leagueId=${espnId}&seasonId=2026`);
      await page.getByRole('button', { name:'Find league', exact:true }).click();
      await page.locator('#acct-espn-team').selectOption('9');
      await page.getByRole('button', { name:'Link league', exact:true }).click();
      await page.waitForFunction(id => LEAGUES.some(l => l.id === id && l.account_source === 'linked'), espnId);
    };
    let rename = false, changed = false, partial = false, season = '2026', stateCalls = 0;
    let releaseSlow;
    const slowGate = new Promise(resolve => { releaseSlow = resolve; });
    const slowStop = setTimeout(() => releaseSlow(), 1500);
    const connect = async name => {
      const loaded = page.waitForEvent('domcontentloaded');
      await page.evaluate(name => { FF_ACCOUNT.connect(name); }, name);
      await loaded;
      await page.waitForFunction(() => window.FF_ACCOUNT?.S.status === 'ok' || window.FF_ACCOUNT?.S.status === 'no_leagues');
    };
    await page.route('https://api.sleeper.app/v1/**', async route => {
      const path = new URL(route.request().url()).pathname.slice(3);
      const reply = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      if (path === '/state/nfl') { stateCalls++; return reply({ season, league_season: season, week: 5 }); }
      if (path === '/user/slow') { await slowGate; return reply({ user_id: '100', username: 'alpha' }); }
      if (path.startsWith('/user/') && !path.includes('/leagues/')) {
        const who = path.split('/')[2];
        if (who === 'missing') return reply(null);
        const uid = ['beta', '200'].includes(who) ? '200' : who === 'none' || who === '300' ? '300' :
          who === 'tdub1329' || who === fixtures.window.MY_USER_ID ? fixtures.window.MY_USER_ID : '100';
        return reply({ user_id: uid, username: uid === '100' ? (rename ? 'alpha-renamed' : 'alpha') : uid === '200' ? 'beta' : 'none', display_name: uid === '100' ? 'Alpha' : uid === '200' ? 'Beta' : 'None' });
      }
      if (path.includes('/leagues/nfl/')) return reply(path.includes('/300/') ? [] : [{
        league_id: 'shared', name: 'Shared fixture league', season, total_rosters: league.rosters.length,
        roster_positions: league.roster_positions, scoring_settings: league.scoring,
        settings: { type: 2, playoff_week_start: 3, playoff_teams: 4 },
      }]);
      if (path.endsWith('/users')) return reply(league.rosters.map((r, i) => ({ user_id: i === 0 ? '100' : i === 1 ? '200' : `other-${i}`, display_name: i === 0 ? 'Alpha team' : i === 1 ? 'Beta team' : r.owner_name })));
      if (path.endsWith('/rosters')) return reply(league.rosters.map((r, i) => ({ ...r,
        owner_id: i === 0 ? '100' : i === 1 ? '200' : `other-${i}`,
        players: changed && i === 0 ? [] : r.players,
        settings: { wins: changed && i === 0 ? 9 : r.wins, losses: r.losses, fpts: r.fpts },
      })));
      if (path.endsWith('/drafts')) return reply([{ draft_id: 'draft', season, status: 'complete', settings: { rounds: 4 } }]);
      if (path.endsWith('/traded_picks')) return reply([]);
      if (path.includes('/matchups/')) {
        if (partial) return route.fulfill({ status: 404, body: '{}' });
        return reply(league.rosters.map((r, i) => ({ roster_id: r.roster_id, matchup_id: Math.floor(i / 2) + 1 })));
      }
      throw new Error(`Unexpected account request ${path}`);
    });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.FF_ACCOUNT && window.__app);
    assert.equal(await page.evaluate(() => window.LEAGUES.length), 0, 'unconnected never displays the build owner');
    await page.evaluate(() => FF_ACCOUNT.openPanel('espn'));
    await page.locator('#acct-espn-link').fill('999');
    await page.getByRole('button', { name:'Find league', exact:true }).click();
    await page.waitForFunction(() => FF_ACCOUNT.espn.error.includes('private'));
    assert.equal(await page.evaluate(() => LEAGUES.length), 0, 'private league never links');
    await linkEspn();
    const linked = await page.evaluate(id => LEAGUES.find(l => l.id === id), espnId);
    assert.equal(linked.rosters.find(r => r.is_me).roster_id, 9, 'selected ESPN team owns the view');
    assert.equal(linked.scoring.rec, 1, 'real public PPR rules are normalized');
    assert.equal(linked.playoff_week_start, 15, 'ESPN schedule defines the first playoff week');
    assert.ok(linked.rosters.find(r => r.is_me).players.length > 10, 'real ESPN roster matches shared players');
    assert.equal(linked.projection_unavailable, true, 'custom offense is not approximated');
    await page.screenshot({ path:`${process.env.TEMP}/ff-account-desktop.png` });
    await page.setViewportSize({ width:360, height:800 });
    await page.screenshot({ path:`${process.env.TEMP}/ff-account-phone.png` });
    const bounds = await page.locator('.acct-dialog').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 361, 'account panel fits a phone');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.acct-dialog').evaluate(d => d.open), false);
    await page.setViewportSize({ width:1280, height:900 });
    await page.reload({ waitUntil:'domcontentloaded' });
    await page.waitForFunction(id => window.FF_ACCOUNT && LEAGUES.some(l => l.id === id), espnId);
    await page.evaluate(() => FF_ACCOUNT.openPanel());
    await page.locator('#acct-user').fill('missing');
    await page.locator('.acct-dialog').getByRole('button', {name:'Connect Sleeper',exact:true}).click();
    await page.waitForFunction(() => FF_ACCOUNT.S.error?.kind === 'not_found');
    assert.match(await page.locator('.acct-status').innerText(), /Check the spelling/);
    // Two overlapping requests, with the old username lookup released last.
    await page.evaluate(() => { FF_ACCOUNT.connect('slow'); });
    await connect('beta');
    releaseSlow();
    clearTimeout(slowStop);
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => MY_USER_ID), '200');
    assert.equal(await page.evaluate(id => LEAGUES.some(l => l.id === id), espnId), false, 'disconnected ESPN persona does not leak into a Sleeper account');
    assert.equal(await page.evaluate(() => LEAGUES[0].rosters.find(r => r.is_me).roster_id), league.rosters[1].roster_id);
    await connect('alpha');
    // Set an actual player mark through the existing player-card UI.
    await page.goto(`${url}/#league/shared/players`);
    await page.locator('.mark-btn').first().click();
    const saved = await page.evaluate(() => localStorage.getItem(FF_ACCOUNT.storageKey('tier-sheet-marks-v1')));
    assert.ok(saved && saved.includes('shared:'), 'league-scoped mark is persisted');
    const before = await page.evaluate(() => __app.computeRosterStrength(LEAGUES[0].rosters[0], LEAGUES[0]));
    rename = changed = true;
    const count = stateCalls;
    await page.evaluate(() => Promise.all([FF_ACCOUNT.refresh({ force: true }), FF_ACCOUNT.refresh({ force: true })]));
    assert.equal(stateCalls, count + 1, 'one in-flight refresh serves both requests');
    assert.equal(await page.evaluate(() => MY_USERNAME), 'alpha-renamed', 'rename keeps stable ID');
    assert.equal(await page.evaluate(() => LEAGUES[0].rosters[0].wins), 9);
    const after = await page.evaluate(() => __app.computeRosterStrength(LEAGUES[0].rosters[0], LEAGUES[0]));
    assert.notDeepEqual(after, before, 'derived roster data follows the refreshed roster');
    await connect('beta');
    assert.equal(await page.evaluate(() => localStorage.getItem(FF_ACCOUNT.storageKey('tier-sheet-marks-v1'))), null);
    assert.equal(await page.evaluate(() => FF_ACCOUNT.S.snap.user.user_id), '200');
    partial = true;
    await page.evaluate(() => FF_ACCOUNT.refresh({ force: true }));
    assert.equal(await page.evaluate(() => FF_ACCOUNT.S.status), 'partial');
    assert.equal(await page.evaluate(() => LEAGUES.length), 1, 'failed optional matchups keep the roster available');
    partial = false; season = '2027';
    await page.evaluate(() => FF_ACCOUNT.refresh({ force: true }));
    assert.equal(await page.evaluate(() => FF_ACCOUNT.S.snap.season), '2027', 'NFL state drives season rollover');
    const disconnected = page.waitForEvent('domcontentloaded');
    await page.evaluate(() => { FF_ACCOUNT.disconnect(); });
    await disconnected;
    await page.waitForFunction(id => window.FF_ACCOUNT && !FF_ACCOUNT.active && LEAGUES.some(l => l.id === id), espnId);
    await page.evaluate(() => FF_ACCOUNT.openPanel('espn'));
    await page.locator('.acct-espn-linked').getByRole('button', {name:'Unlink',exact:true}).click();
    assert.equal(await page.evaluate(() => LEAGUES.length), 0, 'disconnected ESPN links can be removed');
    await connect('none');
    await page.waitForFunction(() => FF_ACCOUNT.active?.user_id === '300' && FF_ACCOUNT.S.status === 'no_leagues');
    assert.equal(await page.evaluate(() => LEAGUES.length), 0);
    season = '2026';
    await connect('tdub1329');
    assert.equal(await page.evaluate(id => LEAGUES.filter(l => l.id === id).length, espnId), 1, 'Trevor keeps his same-season imported ESPN league');
    await page.evaluate(() => FF_ACCOUNT.refresh({ force: true }));
    assert.equal(await page.evaluate(id => LEAGUES.filter(l => l.id === id).length, espnId), 1, 'refresh does not duplicate the imported league');
    await linkEspn();
    assert.equal(await page.evaluate(id => LEAGUES.filter(l => l.id === id).length, espnId), 1, 'link replaces the baked ESPN snapshot');
    await page.locator('.acct-espn-linked').getByRole('button', {name:'Unlink',exact:true}).click();
    await page.evaluate(() => FF_ACCOUNT.refresh({force:true}));
    assert.equal(await page.evaluate(id => LEAGUES.some(l => l.id === id && l.account_source === 'imported'), espnId), true, 'unlink restores the built-in snapshot on refresh');
    await connect('beta');
    assert.equal(await page.evaluate(id => LEAGUES.some(l => l.id === id), espnId), false, 'other accounts never receive Trevor imported league');
    assert.deepEqual(errors, [], 'account flows produce no app runtime errors');
    console.log('account-lifecycle: ok (race, isolation, refresh, ESPN link/persist/unlink, phone/desktop)');
  } catch (e) { console.error(e); throw e; }
  finally { await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 5000))]); clearTimeout(hardStop); }
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
