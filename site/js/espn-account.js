/* Public ESPN league reads only. No credentials, cookies or proxy. */
(() => {
  'use strict';
  // Same normalized slots, teams and core scoring keys as build_site_data.py.
  const SLOTS = { 0: 'QB', 2: 'RB', 4: 'WR', 6: 'TE', 7: 'SUPER_FLEX', 16: 'DEF', 17: 'K', 20: 'BN', 21: 'IR', 23: 'FLEX' };
  const POS = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DEF' };
  const TEAMS = { 1:'ATL',2:'BUF',3:'CHI',4:'CIN',5:'CLE',6:'DAL',7:'DEN',8:'DET',9:'GB',10:'TEN',11:'IND',12:'KC',13:'LV',14:'LAR',15:'MIA',16:'MIN',17:'NE',18:'NO',19:'NYG',20:'NYJ',21:'PHI',22:'ARI',23:'PIT',24:'LAC',25:'SF',26:'SEA',27:'TB',28:'WAS',29:'CAR',30:'JAX',33:'BAL',34:'HOU' };
  const SCORING = { 3:'pass_yd',4:'pass_td',19:'pass_2pt',20:'pass_int',24:'rush_yd',25:'rush_td',26:'rush_2pt',42:'rec_yd',43:'rec_td',44:'rec_2pt',53:'rec',68:'fum_lost' };
  const norm = n => String(n || '').normalize('NFKD').replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/gi, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const STALE = 15 * 60000;
  function create({ storage, players, owner, season, sharedSeason, onChange, onStatus }) {
    let preview = null, error = '', busy = false, revision = 0, controller = null;
    const pending = new Map();
    const cache = new Map();
    const key = () => `ff-espn-links-v1::${owner() || 'disconnected'}`;
    const read = () => { const k = key(); if (!cache.has(k)) { try { const saved = JSON.parse(storage.getItem(k) || '[]'); cache.set(k, Array.isArray(saved) ? saved.filter(l => l && /^\d{1,12}$/.test(l.id) && /^20\d{2}$/.test(l.season) && Array.isArray(l.snapshot?.league?.rosters) && Array.isArray(l.snapshot?.league?.import_limitations)).slice(0,8) : []); } catch { cache.set(k, []); } } return cache.get(k); };
    const save = links => { cache.set(key(), links); try { storage.setItem(key(), JSON.stringify(links)); return true; } catch { error = 'Linked for this visit. This browser could not remember the league.'; return false; } };
    const status = () => onStatus?.();
    const names = new Map();
    for (const [id, p] of Object.entries(players || {})) { const n = norm(p.name || p.full_name); if (n) names.set(n, [...names.get(n) || [], { id, p }]); }
    function resolve(p) {
      if (p.defaultPositionId === 16) return TEAMS[p.proTeamId] || null;
      const candidates = (names.get(norm(p.fullName)) || []).filter(x => (x.p.fantasy_positions || [x.p.pos || x.p.position]).includes(POS[p.defaultPositionId]));
      const exact = candidates.filter(x => x.p.team === TEAMS[p.proTeamId]);
      return exact.length === 1 ? exact[0].id : candidates.length === 1 ? candidates[0].id : null;
    }
    function parse(input) {
      let id = String(input || '').trim(), year = String(season());
      if (!/^\d{1,12}$/.test(id)) {
        let u; try { u = new URL(id); } catch { throw new Error('Paste an ESPN fantasy football league URL or numeric league ID.'); }
        if (u.hostname !== 'fantasy.espn.com' || !u.pathname.startsWith('/football/')) throw new Error('Use a fantasy.espn.com/football league URL.');
        id = u.searchParams.get('leagueId') || '';
        year = u.searchParams.get('seasonId') || year;
      }
      if (!/^\d{1,12}$/.test(id) || !/^20\d{2}$/.test(year)) throw new Error('That ESPN link needs a league ID and valid season.');
      return { id, season: year };
    }
    async function fetchLeague(config, signal) {
      const request = new AbortController();
      const cancel = () => request.abort();
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
      const timeout = setTimeout(cancel, 12000);
      try {
        const u = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${config.season}/segments/0/leagues/${config.id}?view=mSettings&view=mTeam&view=mRoster&view=mStandings&view=mMatchup`;
        const r = await fetch(u, { credentials: 'omit', cache: 'no-store', signal: request.signal });
        if (r.status === 401 || r.status === 403) throw new Error('This ESPN league is private. Only public leagues can be linked; no passwords or cookies are used.');
        if (r.status === 429) throw new Error('ESPN is limiting requests. Wait a minute, then refresh.');
        if (!r.ok) throw new Error('ESPN could not find that public league for this season. Check the link and season.');
        const raw = await r.json();
        if (String(raw.id) !== config.id || String(raw.seasonId) !== config.season || !raw.teams?.length) throw new Error('ESPN returned incomplete or mismatched league data. Try again later.');
        if (raw.settings?.isPublic !== true) throw new Error('This ESPN league is private. Make it public in ESPN before linking it here.');
        return raw;
      } catch (e) {
        if (signal?.aborted) throw e;
        if (e.name === 'AbortError' || e instanceof TypeError) throw new Error('Could not reach ESPN. Check your connection and retry. Private leagues cannot be read here.');
        throw e;
      } finally { clearTimeout(timeout); signal?.removeEventListener('abort', cancel); }
    }
    function normalize(raw, teamId) {
      const settings = raw.settings, roster = settings.rosterSettings || {}, schedule = settings.scheduleSettings || {};
      const slots = roster.lineupSlotCounts || {}, positions = [], limitations = [], unmatched = [];
      let unmatchedOffense = false;
      for (const [slot, count] of Object.entries(slots)) {
        if (!count) continue;
        if (!SLOTS[slot]) limitations.push(`Unsupported lineup slot ${slot}`);
        else positions.push(...Array(Number(count)).fill(SLOTS[slot]));
      }
      const scoring = {}, unsupportedOffense = [];
      for (const item of settings.scoringSettings?.scoringItems || []) {
        const mapped = SCORING[item.statId];
        if (mapped) scoring[mapped] = Number(item.points) || 0;
        const active = item.points || Object.values(item.pointsOverrides || {}).some(Boolean);
        if ((mapped && (item.isReverseItem || Object.keys(item.pointsOverrides || {}).length)) || (!mapped && active && (item.statId < 69 || item.statId >= 188))) unsupportedOffense.push(item.statId);
      }
      if (unsupportedOffense.length) limitations.push('Custom offensive scoring rules are unavailable in projections');
      const weeklyWeights = { pass_yd:0.04,pass_td:4,pass_int:-1,rush_yd:0.1,rush_td:6,rec:1,rec_yd:0.1,rec_td:6,fum_lost:-2,pass_2pt:2,rush_2pt:2,rec_2pt:2 };
      const weeklyMismatch = Object.entries(weeklyWeights).some(([k,v]) => (scoring[k] || 0) !== v);
      if (weeklyMismatch) limitations.push('League scoring differs from the shared weekly projection model');
      const historical = Number(raw.seasonId) !== Number(sharedSeason());
      if (historical) limitations.push('Shared weekly projections do not cover this season');
      if (positions.some(p => p === 'K' || p === 'DEF')) limitations.push('Kicker and team-defense projections are not covered');
      if (settings.scoringSettings?.scoringType !== 'H2H_POINTS') limitations.push('Scoring format is unavailable in projections');
      const week = Number(raw.status?.currentMatchupPeriod || raw.scoringPeriodId || 1), weeks = {}, opponents = {};
      for (const game of raw.schedule || []) {
        const h = game.home?.teamId, a = game.away?.teamId, w = game.matchupPeriodId;
        if (h == null || a == null || !w) continue;
        const pair = weeks[w] || (weeks[w] = {}); pair[h] = a; pair[a] = h;
        if (Number(w) === week) { opponents[h] = a; opponents[a] = h; }
      }
      const members = new Map((raw.members || []).map(m => [m.id, m]));
      const rosters = raw.teams.slice().sort((a,b) => a.id-b.id).map(t => {
        const own = members.get(t.primaryOwner || t.owners?.[0]) || {}, ids = [], starters = [], reserve = [];
        for (const e of t.roster?.entries || []) {
          const p = e.playerPoolEntry?.player || {}, id = resolve(p);
          if (!id) { unmatched.push(p.fullName || String(e.playerId)); if (![5,16].includes(p.defaultPositionId)) unmatchedOffense = true; continue; }
          ids.push(id);
          if (e.lineupSlotId === 21) reserve.push(id); else if (e.lineupSlotId !== 20) starters.push(id);
        }
        const record = t.record?.overall || {};
        if (!Array.isArray(t.roster?.entries)) limitations.push(`Roster unavailable for ${t.name || `Team ${t.id}`}`);
        if (['wins','losses','ties','pointsFor','pointsAgainst'].some(k => !Number.isFinite(record[k]))) limitations.push('Some current records are unavailable');
        return { roster_id:t.id, owner_id:`espn-team-${t.id}`, owner_name:own.displayName || own.firstName || 'ESPN owner', team_name:t.name || t.abbrev || `Team ${t.id}`,
          is_me:Number(t.id) === Number(teamId), opponent_roster_id:opponents[t.id] ?? null, players:ids, starters, reserve, taxi:[],
          wins:record.wins ?? null, losses:record.losses ?? null, ties:record.ties ?? null, fpts:record.pointsFor ?? null, fpts_against:record.pointsAgainst ?? null };
      });
      if (!rosters.some(r => r.is_me)) throw new Error('Choose a team from this ESPN league.');
      if (unmatched.length) limitations.push(`${unmatched.length} roster entries could not be matched to the shared player data`);
      if (!raw.schedule?.length) limitations.push('Matchup schedule unavailable');
      limitations.push('ESPN playoff forecasting is unavailable for these league rules');
      const multiWeek = Object.values(schedule.matchupPeriods || {}).some(w => Array.isArray(w) && w.length > 1);
      if (multiWeek) limitations.push('Multi-week matchup projections are unavailable');
      const firstPlayoff = schedule.matchupPeriods?.[Number(schedule.matchupPeriodCount) + 1]?.[0];
      const league = { id:String(raw.id), name:settings.name || `ESPN ${raw.id}`, short_name:settings.name || 'ESPN', season:String(raw.seasonId), week,
        platform:'espn', account_source:'linked', type:0, is_dynasty:false, my_team_id:Number(teamId), buy_in:null,
        status:raw.status?.isActive ? 'in_season' : 'pre_draft', total_rosters:rosters.length, roster_positions:positions,
        scoring, espn_scoring:settings.scoringSettings, is_superflex:positions.includes('SUPER_FLEX'), is_idp:false,
        playoff_teams:schedule.playoffTeamCount, playoff_week_start:Number.isInteger(firstPlayoff) ? firstPlayoff : null,
        espn_schedule_settings:schedule, espn_status:raw.status, forecast_unavailable:'ESPN playoff rules are not supported by this forecast.',
        waiver_type:settings.acquisitionSettings?.acquisitionType, waiver_budget:settings.acquisitionSettings?.acquisitionBudget,
        reserve_slots:Number(slots[21]) || 0, taxi_slots:0, trade_deadline:null, drafts:[], traded_picks:[], rosters,
        users:rosters.map(r => ({user_id:r.owner_id,display_name:r.owner_name,team_name:r.team_name})),
        external_url:`https://fantasy.espn.com/football/league?leagueId=${raw.id}&seasonId=${raw.seasonId}`,
        unsupported_scoring_stats:unsupportedOffense,
        import_unmatched:unmatched, import_limitations:[...new Set(limitations)], missing:[...new Set(limitations)], projection_unavailable:historical || multiWeek || unmatchedOffense || weeklyMismatch || unsupportedOffense.length > 0 || limitations.some(x => /Scoring format|lineup|Roster unavailable/.test(x)),
      };
      return { league, schedule:{name:league.name,playoffStart:league.playoff_week_start,weeks}, syncedAt:Date.now() };
    }
    function reset() { revision++; controller?.abort(); for (const ctrl of pending.values()) ctrl.abort(); controller = null; preview = null; error = ''; busy = false; pending.clear(); }
    async function inspect(input) {
      reset(); const rev = revision, scope = key(); busy = true; status();
      controller = new AbortController();
      try { const config = parse(input), raw = await fetchLeague(config, controller.signal); if (rev !== revision || scope !== key()) return; preview = { config, raw }; }
      catch (e) { if (rev === revision && scope === key()) error = e.message; }
      finally { if (rev === revision) { busy = false; status(); } }
    }
    function link(teamId) {
      try {
        if (!preview) return;
        const snapshot = normalize(preview.raw, teamId), links = read().filter(l => l.id !== preview.config.id);
        if (links.length >= 8) throw new Error('Eight linked ESPN leagues is the limit. Unlink one before adding another.');
        links.push({ ...preview.config, teamId:Number(teamId), snapshot }); save(links); preview = null; onChange(); status();
      } catch(e) { error = e.message; status(); }
    }
    // The synced profile's list wins: drop leagues it no longer has, fetch the ones
    // this browser lacks. onChange waits for the end so nothing saves a half list.
    // ponytail: a fetch that fails here drops that league from the profile on the
    // next save; add a retry if ESPN proves flaky.
    async function adopt(entries) {
      const scope = key(), want = new Map(entries.map(e => [String(e.league_id), e]));
      save(read().filter(l => want.has(l.id)));
      for (const [id, e] of want) {
        if (read().some(l => l.id === id)) continue;
        try {
          const raw = await fetchLeague({ id, season: String(e.season) }, null);
          if (scope !== key()) return;
          if (!read().some(l => l.id === id)) save([...read(), { id, season: String(e.season), teamId: Number(e.team_id), snapshot: normalize(raw, e.team_id) }]);
        } catch {}
      }
      onChange(); status();
    }
    function unlink(id) { pending.get(id)?.abort(); save(read().filter(l => l.id !== id)); onChange(); status(); }
    async function refresh(force = false) {
      const scope = key(), rev = revision;
      for (const item of read().slice(0, 8)) {
        if (scope !== key() || rev !== revision) return;
        if (pending.has(item.id) || (!force && Date.now() - (item.lastAttempt || item.snapshot?.syncedAt || 0) < STALE)) continue;
        item.lastAttempt = Date.now();
        const ctrl = new AbortController(); pending.set(item.id, ctrl);
        try { const raw = await fetchLeague(item, ctrl.signal); if (scope !== key() || rev !== revision || !read().includes(item)) continue; item.snapshot = normalize(raw, item.teamId); item.error = ''; save(read()); onChange(); }
        catch(e) { if (scope === key() && rev === revision) { item.error = e.message; save(read()); } }
        finally { if (pending.get(item.id) === ctrl) pending.delete(item.id); status(); }
      }
    }
    function merge(win) {
      // Display overlays must not mutate the account snapshot reused on refresh.
      win.FANTASY_SCHEDULE = { ...win.FANTASY_SCHEDULE, leagues: { ...win.FANTASY_SCHEDULE.leagues } };
      for (const item of read()) {
        if (!item.snapshot?.league || String(item.snapshot.league.id) !== item.id) continue;
        const l = item.snapshot.league;
        const existing = win.LEAGUES.find(x => x.platform === 'espn' && String(x.id) === item.id);
        const buy_in = existing?.buy_in ?? l.buy_in;
        win.LEAGUES = win.LEAGUES.filter(x => !(x.platform === 'espn' && String(x.id) === item.id));
        win.LEAGUES.push({ ...l, buy_in, projection_unavailable:l.projection_unavailable || Number(l.season) !== Number(sharedSeason()), account_synced_at:item.snapshot.syncedAt });
        win.FANTASY_SCHEDULE.leagues[l.id] = structuredClone(item.snapshot.schedule);
      }
    }
    return { inspect, link, unlink, refresh, adopt, merge, reset, get links() { return read(); }, get preview() { return preview; }, get error() { return error; }, get busy() { return busy; } };
  }
  window.FF_ESPN = { create };
})();
