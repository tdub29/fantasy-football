/* Public Sleeper account selection. No authentication or credentials. */
(function (root) {
  'use strict';
  const API = 'https://api.sleeper.app/v1';
  const ACCOUNT_KEY = 'ff-account-v1';
  const snapKey = (uid, season) => `ff-account-snap-v2::${uid}::${season}`;
  const STALE_MS = 15 * 60 * 1000;   // focus or revisit older than this refetches
  const POLL_MS = 30 * 60 * 1000;    // while the tab is open and visible
  const LEAGUE_CONCURRENCY = 2;      // ~20 calls per league; docs ask < 1000/min
  const WEEKLY_WEIGHTS = { pass_yd:0.04,pass_td:4,pass_int:-1,rush_yd:0.1,rush_td:6,rec:1,rec_yd:0.1,rec_td:6,fum_lost:-2,pass_2pt:2,rush_2pt:2,rec_2pt:2 };
  // Turnover and 2-pt weights move a week by about a point (Password is taco and
  // Phi Kap pay INT -2), so they never void the shared lines; volume and TD weights must match.
  // ponytail: fixed key list; rescore per league if a turnover-heavy format joins.
  const MINOR_WEIGHTS = new Set(['pass_int', 'fum_lost', 'pass_2pt', 'rush_2pt', 'rec_2pt']);
  function weeklyMismatch(sc, season) {
    return Number(season) !== Number(root.WEEKLY_RANKINGS?.season)
      || Object.entries(WEEKLY_WEIGHTS).some(([k,v]) => !MINOR_WEIGHTS.has(k) && (sc[k] || 0) !== v)
      || Object.entries(sc).some(([k,v]) => v && /^(pass_|rush_|rec_|bonus_)/.test(k) && !(k in WEEKLY_WEIGHTS));
  }

  class SleeperError extends Error {
    constructor(kind, msg) { super(msg || kind); this.kind = kind; }
  }

  // fetch -> JSON with two retries on network failure, 429 and 5xx. Abort passes
  // straight through so a switched account stops its old pull.
  function makeGet(fetchFn, { signal, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
    return async url => {
      for (let attempt = 0, wait = 600; ; attempt++, wait *= 2) {
        let r;
        const request = new AbortController();
        const cancel = () => request.abort();
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        signal?.addEventListener('abort', cancel, { once: true });
        const timeout = setTimeout(cancel, 12000);
        try { r = await fetchFn(url, { signal: request.signal, cache: 'no-store' }); }
        catch (e) {
          if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
          if (attempt >= 2) throw new SleeperError('network', 'Could not reach Sleeper');
          await sleep(wait); continue;
        } finally { clearTimeout(timeout); signal?.removeEventListener('abort', cancel); }
        if (r.status === 429 || r.status >= 500) {
          if (attempt >= 2) throw new SleeperError(r.status === 429 ? 'rate_limit' : 'network', `Sleeper ${r.status}`);
          await sleep(r.status === 429 ? wait * 3 : wait); continue;
        }
        if (!r.ok) throw new SleeperError('http', `Sleeper ${r.status}`);
        return r.json();
      }
    };
  }

  // Sleeper answers an unknown username with 200 and a JSON null.
  async function resolveUser(get, input) {
    const name = String(input || '').trim().replace(/^@/, '');
    if (!name || !/^[A-Za-z0-9_.-]{1,40}$/.test(name)) throw new SleeperError('invalid', 'Enter a Sleeper username');
    const u = await get(`${API}/user/${encodeURIComponent(name)}`);
    if (!u || !u.user_id) throw new SleeperError('not_found', `No Sleeper user named ${name}`);
    return { user_id: String(u.user_id), username: u.username || name, display_name: u.display_name || u.username || name, avatar: u.avatar || null };
  }

  async function pool(items, n, fn) {
    const out = new Array(items.length);
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
    }));
    return out;
  }

  // A matchup is a pair; anything else has no single opponent (build_site_data).
  function pairs(rows) {
    const sides = {}, opp = {};
    for (const m of rows || []) if (m && m.matchup_id != null && m.roster_id != null) (sides[m.matchup_id] = sides[m.matchup_id] || []).push(m.roster_id);
    for (const s of Object.values(sides)) if (s.length === 2) { opp[s[0]] = s[1]; opp[s[1]] = s[0]; }
    return { sides, opp };
  }

  // Same league shape build_site_data.py writes, so app.js reads it unchanged.
  // buy_in is null: Sleeper does not publish it, and unknown is not $0.
  async function loadLeague(get, lg, userId, week) {
    const id = String(lg.league_id), st = lg.settings || {};
    const playoffStart = Number(st.playoff_week_start) || 15;
    const missing = [];
    const optional = async (url, feed) => { try { return await get(url); } catch (e) { if (e.name === 'AbortError') throw e; missing.push(feed); return []; } };
    const [users, rosters, drafts, traded] = await Promise.all([
      get(`${API}/league/${id}/users`), get(`${API}/league/${id}/rosters`),
      optional(`${API}/league/${id}/drafts`, 'Drafts'), optional(`${API}/league/${id}/traded_picks`, 'Traded picks')]);
    // ponytail: regular-season weeks only; playoff pairings are seeded later and
    // the simulator builds its own bracket from playoff_week_start.
    const weeks = Array.from({ length: Math.max(0, Math.min(18, playoffStart - 1)) }, (_, i) => i + 1);
    const wkRows = await pool(weeks, 2, w => optional(`${API}/league/${id}/matchups/${w}`, `Week ${w} matchups`));
    const sched = { name: lg.name, playoffStart, medianScoring: !!st.league_average_match, weeks: {} };
    weeks.forEach((w, i) => {
      const { sides, opp } = pairs(wkRows[i]);
      const wk = {};
      for (const ids of Object.values(sides)) for (const rid of ids) wk[rid] = opp[rid] ?? null;
      if (Object.keys(wk).length) sched.weeks[w] = wk;
    });
    const cur = weeks.includes(week) ? pairs(wkRows[weeks.indexOf(week)]).opp
      : pairs(await optional(`${API}/league/${id}/matchups/${week}`, 'Current matchup')).opp;
    const byId = {};
    for (const u of users || []) byId[u.user_id] = u;
    const outRosters = (rosters || []).slice().sort((a, b) => a.roster_id - b.roster_id).map(r => {
      const o = byId[r.owner_id] || {}, s = r.settings || {};
      return {
        roster_id: r.roster_id, owner_id: r.owner_id || null,
        owner_name: o.display_name || `Roster ${r.roster_id}`,
        team_name: (o.metadata || {}).team_name || o.display_name || `Roster ${r.roster_id}`,
        is_me: (r.owner_id != null && String(r.owner_id) === userId) || (r.co_owners || []).map(String).includes(userId),
        opponent_roster_id: cur[r.roster_id] ?? null,
        starters: r.starters || [], players: r.players || [], taxi: r.taxi || [], reserve: r.reserve || [],
        wins: s.wins || 0, losses: s.losses || 0, ties: s.ties || 0,
        fpts: (s.fpts || 0) + (s.fpts_decimal || 0) / 100,
        fpts_against: (s.fpts_against || 0) + (s.fpts_against_decimal || 0) / 100,
        ppts: s.ppts == null ? null : s.ppts + (s.ppts_decimal || 0) / 100,
        waiver_budget_used: s.waiver_budget_used || 0, waiver_position: s.waiver_position,
      };
    });
    // A live draft has not stamped rosters yet; fold its picks in (build_site_data).
    for (const d of (drafts || []).filter(d => d.status === 'drafting')) {
      const picks = await optional(`${API}/draft/${d.draft_id}/picks`, 'Live draft picks');
      for (const p of picks || []) {
        const t = outRosters.find(r => r.roster_id === p.roster_id);
        if (t && p.player_id && !t.players.includes(p.player_id)) t.players.push(p.player_id);
      }
    }
    const pos = lg.roster_positions || [];
    const scoringMismatch = weeklyMismatch(lg.scoring_settings || {}, lg.season);
    return {
      league: {
        id, missing, name: lg.name, short_name: lg.name, buy_in: null, week, season: lg.season, status: lg.status,
        total_rosters: lg.total_rosters, roster_positions: pos, scoring: lg.scoring_settings || {},
        forecast_unavailable:scoringMismatch ? 'League scoring or season is not covered by the shared weekly projection model.' : null,
        projection_unavailable:st.type !== 2 && scoringMismatch,
        last_scored_leg: st.last_scored_leg,
        divisions: st.divisions || 0, playoff_seed_type: st.playoff_seed_type,
        playoff_round_type: st.playoff_round_type, start_week: st.start_week,
        league_average_match: st.league_average_match,
        is_superflex: pos.includes('SUPER_FLEX'),
        is_idp: pos.some(p => p.startsWith('IDP') || ['LB', 'DB', 'DL'].includes(p)),
        type: st.type, is_dynasty: st.type === 2,
        playoff_teams: st.playoff_teams, playoff_week_start: st.playoff_week_start, trade_deadline: st.trade_deadline,
        taxi_slots: st.taxi_slots, reserve_slots: st.reserve_slots, waiver_type: st.waiver_type, waiver_budget: st.waiver_budget,
        rosters: outRosters,
        users: (users || []).map(u => ({ user_id: u.user_id, display_name: u.display_name, team_name: (u.metadata || {}).team_name })),
        drafts: (drafts || []).map(d => ({ draft_id: d.draft_id, type: d.type, status: d.status, season: d.season,
          start_time: d.start_time, draft_order: d.draft_order || {}, settings: d.settings || {} })),
        traded_picks: traded || [],
      },
      schedule: sched,
    };
  }

  // Everything one account needs. A league that fails is listed in `failed`
  // (partial) rather than failing the account; zero leagues is a valid result.
  async function loadAccount(get, userId, now) {
    userId = String(userId);
    const st = await get(`${API}/state/nfl`) || {};
    const season = String(st.league_season || st.season || '');
    if (!/^20\d{2}$/.test(season)) throw new SleeperError('network', 'Sleeper season unavailable');
    const week = Math.max(1, Math.min(18, Number(st.week) || Number(st.display_week) || 1));
    const u = await get(`${API}/user/${userId}`);
    if (!u || !u.user_id) throw new SleeperError('not_found', 'That Sleeper account no longer exists');
    const user = { user_id: String(u.user_id), username: u.username, display_name: u.display_name || u.username, avatar: u.avatar || null };
    const list = (await get(`${API}/user/${userId}/leagues/nfl/${season}`)) || [];
    const failed = [], leagues = [], schedule = { leagues: {} };
    await pool(list, LEAGUE_CONCURRENCY, async lg => {
      try {
        const r = await loadLeague(get, lg, userId, week);
        leagues.push(r.league);
        schedule.leagues[r.league.id] = r.schedule;
      } catch (e) {
        if (e && e.name === 'AbortError') throw e;
        failed.push({ id: String(lg.league_id), name: lg.name, kind: e.kind || 'network' });
      }
    });
    const order = list.map(l => String(l.league_id));
    leagues.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    if (list.length && !leagues.length) throw new SleeperError(failed[0]?.kind === 'rate_limit' ? 'rate_limit' : 'network', 'No league could be read');
    return { version: 2, user, season, week, leagues, schedule, failed, syncedAt: now };
  }

  // Linked Sleeper users fold into one view: their leagues join the login's
  // (the login's copy wins a shared league), with is_me set for whichever
  // linked user owns the team. A linked user that fails is listed, not fatal.
  async function loadMerged(get, userId, extras, now) {
    const data = await loadAccount(get, userId, now);
    for (const x of extras) {
      try {
        const more = await loadAccount(get, x.user_id, now);
        for (const l of more.leagues) if (!data.leagues.some(y => y.id === l.id)) {
          data.leagues.push({ ...l, linked_user: more.user.username });
          data.schedule.leagues[l.id] = more.schedule.leagues[l.id];
        }
        data.failed.push(...more.failed);
      } catch (e) {
        if (e && e.name === 'AbortError') throw e;
        data.failed.push({ id: `user:${x.user_id}`, name: `Linked user ${x.username}`, kind: e.kind || 'network' });
      }
    }
    return data;
  }

  function createAccounts({ storage, fetchFn, now = () => Date.now(), onData = () => {}, onStatus = () => {} }) {
    const read = k => { try { return JSON.parse(storage.getItem(k) || 'null'); } catch { return null; } };
    const write = (k, v) => { try { storage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
    const { extras: savedExtras = [], ...saved } = read(ACCOUNT_KEY) || {};
    const active = saved.user_id ? saved : null;
    const cached = active && read(snapKey(active.user_id, active.season));
    const snap = cached && cached.version === 2 && String(cached.user?.user_id) === String(active.user_id)
      && cached.season === active.season && Array.isArray(cached.leagues) ? cached : null;
    const S = { active, extras: active ? savedExtras : [], snap, status: snap ? 'stale' : 'idle', error: null, gen: 0, ctrl: null, pending: null, input: '', nextTryAt: 0 };
    const remember = () => write(ACCOUNT_KEY, S.extras.length ? { ...S.active, extras: S.extras } : S.active);
    const set = (status, error = null) => { S.status = status; S.error = error; onStatus(S); };
    function begin() {
      S.ctrl?.abort();
      S.ctrl = new AbortController();
      S.pending = null;
      return { gen: ++S.gen, get: makeGet(fetchFn, { signal: S.ctrl.signal }) };
    }
    function accept(data, extras) {
      S.active = { ...data.user, season: data.season };
      S.extras = extras;
      S.nextTryAt = 0;
      data.syncedAt = now();
      S.snap = data;
      const remembered = remember();
      S.remembered = remembered;
      write(snapKey(data.user.user_id, data.season), data);
      onData(data);
      set(data.leagues.length === 0 ? 'no_leagues' : data.failed.length || data.leagues.some(l => l.missing.length) ? 'partial' : 'ok');
      if (!remembered) { S.error = new SleeperError('storage', 'Connected for this visit. This browser could not remember the account.'); onStatus(S); }
      return data;
    }
    function failed(e, gen) {
      if (gen !== S.gen || e.name === 'AbortError') return null;
      S.nextTryAt = now() + 60000;
      set('error', e instanceof SleeperError ? e : new SleeperError('network', e.message));
      return null;
    }
    function connect(input, extras = []) {
      const username = String(input || '').trim().replace(/^@/, '');
      if (S.pending && S.input === username) return S.pending;
      const { gen, get } = begin();
      S.input = username;
      set('loading');
      const task = (async () => {
        const user = await resolveUser(get, username);
        const data = await loadMerged(get, user.user_id, extras, now());
        if (gen !== S.gen) return null;
        return accept(data, extras);
      })().catch(e => failed(e, gen)).finally(() => { if (S.pending === task) S.pending = null; });
      S.pending = task;
      return task;
    }
    function disconnect() {
      begin();
      S.remembered = true;
      if (S.active) try { storage.removeItem(snapKey(S.active.user_id, S.active.season)); } catch {}
      try { storage.removeItem(ACCOUNT_KEY); } catch {}
      S.active = null; S.snap = null; S.extras = [];
      onData(null);
      set('idle');
    }
    function refresh({ force = false } = {}) {
      if (!S.active) return Promise.resolve(null);
      if (S.pending) return S.pending;
      if (!force && now() < S.nextTryAt) return Promise.resolve(S.snap);
      if (!force && S.snap && now() - S.snap.syncedAt < STALE_MS) return Promise.resolve(S.snap);
      const uid = S.active.user_id, extras = S.extras;
      const { gen, get } = begin();
      S.input = '';
      set('loading');
      const task = loadMerged(get, uid, extras, now()).then(data => gen === S.gen ? accept(data, extras) : null)
        .catch(e => failed(e, gen)).finally(() => { if (S.pending === task) S.pending = null; });
      S.pending = task;
      return task;
    }
    function link(input) {
      if (!S.active) return Promise.resolve(null);
      const { gen, get } = begin();
      S.input = '';
      set('loading');
      const task = (async () => {
        const u = await resolveUser(get, input);
        if (u.user_id === S.active.user_id || S.extras.some(x => x.user_id === u.user_id)) throw new SleeperError('linked', `${u.username} is already linked`);
        if (S.extras.length >= 7) throw new SleeperError('linked', 'Up to 7 extra Sleeper users can be linked');
        const extras = [...S.extras, { user_id: u.user_id, username: u.username }];
        const data = await loadMerged(get, S.active.user_id, extras, now());
        return gen === S.gen ? accept(data, extras) : null;
      })().catch(e => failed(e, gen)).finally(() => { if (S.pending === task) S.pending = null; });
      S.pending = task;
      return task;
    }
    // Replace the linked users and pull again; an in-flight pull used the old list.
    function setExtras(list) {
      if (!S.active) return Promise.resolve(null);
      S.extras = list.map(x => ({ user_id: String(x.user_id), username: String(x.username) }));
      remember();
      S.ctrl?.abort(); S.pending = null;
      return refresh({ force: true });
    }
    const unlink = userId => setExtras(S.extras.filter(x => x.user_id !== String(userId)));
    return { S, connect, disconnect, refresh, link, unlink, setExtras };
  }

  function applyGlobals(win, acct, snap) {
    win.LEAGUES = snap ? snap.leagues : [];
    win.FANTASY_SCHEDULE = snap ? snap.schedule : { leagues: {} };
    win.MY_USER_ID = acct?.user_id || null;
    win.MY_USERNAME = acct?.username || null;
    win.TRADE_HISTORY = null;
  }

  // ---- browser wiring
  function ago(ms) {
    const m = Math.round(ms / 60000);
    return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
  }
  const MESSAGES = {
    invalid: () => 'Enter a Sleeper username (letters, numbers, underscore).',
    not_found: e => `${e.message}. Check the spelling.`,
    rate_limit: () => 'Sleeper is limiting requests. Wait a minute, then retry.',
    network: () => 'Could not reach Sleeper. Check the connection, then retry.',
    http: e => `Sleeper answered with an error (${e.message}). Retry later.`,
    no_leagues: e => `${e.message}.`,
    linked: e => `${e.message}.`,
  };

  function boot(win) {
    const doc = win.document;
    let A, E;
    const el = (tag, attrs = {}, ...kids) => {
      const n = doc.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
      }
      for (const c of kids.flat()) if (c != null) n.append(c);
      return n;
    };
    const season = () => A.S.snap?.season || '';
    const label = () => A.S.active?.display_name || A.S.active?.username || 'Accounts and leagues';
    const buildUserId = String(win.MY_USER_ID || '');
    const savedConfig = new Map((win.LEAGUES || []).map(l => [String(l.id), { buy_in: l.buy_in }]));
    const imported = (win.LEAGUES || []).filter(l => l.platform && l.platform !== 'sleeper');
    const importedSchedule = win.FANTASY_SCHEDULE?.leagues || {};
    function configure(snap) {
      if (!snap) return;
      if (String(snap.user.user_id) === buildUserId) {
        for (const l of imported) if (String(l.season) === snap.season && !snap.leagues.some(x => String(x.id) === String(l.id))) {
          snap.leagues.push({ ...l, account_source: 'imported', missing: [] });
          if (importedSchedule[l.id]) snap.schedule.leagues[l.id] = importedSchedule[l.id];
        }
      }
      for (const l of snap.leagues) {
        if (l.platform !== 'espn') {
          const mismatch = weeklyMismatch(l.scoring || {}, l.season);
          l.forecast_unavailable = mismatch ? 'League scoring or season is not covered by the shared weekly projection model.' : null;
          l.projection_unavailable = l.type !== 2 && mismatch;
        }
        if (String(snap.user.user_id) === buildUserId && savedConfig.has(l.id)) Object.assign(l, savedConfig.get(l.id));
        const unknown = new Set(l.rosters.flatMap(r => r.players || []).filter(pid => pid !== '0' && !win.PLAYERS?.[pid]));
        const message = `${unknown.size} rostered players have no shared player information`;
        if (unknown.size && !l.missing.includes(message)) l.missing.push(message);
      }
    }
    // Synced login: one profile per Cloudflare Access identity on the hosted
    // bundle (Fantasy Football/cloudflare/functions/ff/api/profile.js).
    // profileState: undefined = no sync here (file://, local server), else the
    // last list read or saved as JSON.
    let profileState, espnSync = null;
    const espnEntries = () => (E?.links || []).map(l => ({ league_id: l.id, season: String(l.season), team_id: String(l.teamId) }));
    async function profile(method, body) {
      if (!/^https?:$/.test(win.location.protocol)) return undefined;
      const ctrl = new AbortController(), t = win.setTimeout(() => ctrl.abort(), 10000);
      try {
        const r = await win.fetch('/ff/api/profile', { method, cache: 'no-store', credentials: 'same-origin', signal: ctrl.signal,
          keepalive: method !== 'GET', headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
        return r.ok && /json/.test(r.headers.get('content-type') || '') ? await r.json() : undefined;
      } catch { return undefined; } finally { win.clearTimeout(t); }
    }
    function saveProfile() {
      if (profileState === undefined || !A.S.active || espnSync) return;
      const body = { sleeper: [{ user_id: A.S.active.user_id, username: A.S.active.username }, ...A.S.extras], espn: espnEntries() };
      if (JSON.stringify(body) === profileState) return;
      profileState = JSON.stringify(body);
      profile('PUT', body);
    }
    // The profile wins over this browser's account, so every device shows the same login.
    async function loadProfile() {
      const p = await profile('GET');
      if (p === undefined) return;
      const list = p?.sleeper || [];
      profileState = JSON.stringify({ sleeper: list, espn: p?.espn || [] });
      if (!list.length) { if (A.S.active) saveProfile(); else openPanel(); return; }
      const [primary, ...extras] = list;
      if (A.S.active?.user_id !== primary.user_id) A.connect(primary.user_id, extras);
      else {
        // ESPN links follow the profile too. A profile saved before ESPN sync has
        // no list, so this browser's links fill it instead. espnSync holds saves
        // until the adopted leagues land, so no half list overwrites the profile.
        if (Array.isArray(p.espn)) espnSync = E.adopt(p.espn);
        if (JSON.stringify(A.S.extras) !== JSON.stringify(extras)) A.setExtras(extras);
        await espnSync; espnSync = null;
        saveProfile();
      }
      renderPanel();
    }
    async function signOut() {
      if (profileState !== undefined) { await profile('DELETE'); profileState = '[]'; }
      A.disconnect();
    }
    let inputValue = '';
    let espnValue = '';
    let dialog = null;
    function renderPanel() {
      if (!dialog) return;
      const S = A.S, a = S.active, snap = S.snap;
      const body = dialog.querySelector('.acct-body');
      const oldInput = body.querySelector('#acct-user');
      const hadFocus = oldInput === doc.activeElement;
      if (oldInput) inputValue = oldInput.value;
      const oldEspn = body.querySelector('#acct-espn-link');
      if (oldEspn) espnValue = oldEspn.value;
      const espnOpen = body.querySelector('.acct-espn')?.open;
      body.replaceChildren();
      const built = win.BUILD_INFO && win.BUILD_INFO.files && win.BUILD_INFO.files['leagues.js'];
      const synced = profileState !== undefined;
      body.append(el('p', { class: 'acct-now' }, a
        ? ['Signed in as ', el('strong', {}, a.username), '.']
        : `Create your login with your Sleeper username.${synced ? ' It signs you in on every device you open this on.' : ''}`));
      if (a) body.append(el('ul', { class: 'acct-users' },
        el('li', {}, el('strong', {}, a.username), ' (your login)'),
        S.extras.map(x => el('li', {}, x.username, ' ',
          el('button', { type: 'button', class: 'ghost', disabled: S.status === 'loading', onclick: () => { A.unlink(x.user_id); saveProfile(); } }, 'Remove')))));
      const meta = el('dl', { class: 'acct-meta' });
      if (a) {
        meta.append(el('dt', {}, 'Last Sleeper sync'), el('dd', { class: 'tnum' }, snap ? `${new Date(snap.syncedAt).toLocaleString()} (${ago(Date.now() - snap.syncedAt)})` : 'not yet'));
        if (snap) meta.append(el('dt', {}, 'Leagues'), el('dd', { class: 'tnum' }, `${snap.leagues.length}${snap.failed.length ? ` of ${snap.leagues.length + snap.failed.length}` : ''}`));
      }
      const sources = win.BUILD_INFO?.files || {};
      const sourceTime = sources['rankings.js'] || sources['ktc.js'];
      if (sourceTime) meta.append(el('dt', {}, 'Shared sources built'), el('dd', { class: 'tnum' }, new Date(sourceTime).toLocaleString()));
      if (snap?.leagues.some(l => l.account_source === 'imported')) meta.append(el('dt', {}, 'Imported ESPN data'), el('dd', {}, built ? `Snapshot built ${new Date(built).toLocaleString()}. Not refreshed by Sleeper.` : 'Saved snapshot. Not refreshed by Sleeper.'));
      body.append(meta);
      const msg = S.error?.kind === 'storage' ? S.error.message : S.status === 'loading' ? 'Loading from Sleeper...'
        : S.status === 'error' && S.error ? (MESSAGES[S.error.kind] || MESSAGES.network)(S.error)
        : S.status === 'no_leagues' ? 'No Sleeper NFL leagues this season on this account.'
        : (S.status === 'partial' || (snap && snap.failed.length)) ? `Some Sleeper data is unavailable: ${[...snap.failed.map(f => f.name), ...snap.leagues.flatMap(l => l.missing.map(m => `${l.name}: ${m}`))].join(', ')}. Refresh to retry.`
        : '';
      body.append(el('p', { class: `acct-status${S.status === 'error' ? ' err' : ''}`, role: 'status', 'aria-live': 'polite' }, msg));
      const input = el('input', { id: 'acct-user', type: 'text', name: 'sleeper-username', autocomplete: 'off', autocapitalize: 'off',
        spellcheck: 'false', value: inputValue, required: true, maxlength: '40', placeholder: 'username', 'aria-describedby': 'acct-note' });
      const form = el('form', { class: 'acct-form', onsubmit: e => {
        e.preventDefault(); inputValue = input.value;
        (a ? A.link : A.connect)(input.value).then(r => {
          const box = r && a && dialog.querySelector('#acct-user');
          if (box) { box.value = ''; renderPanel(); }
        });
      } },
        el('label', { for: 'acct-user' }, a ? 'Add another Sleeper user' : 'Sleeper username'),
        el('div', { class: 'acct-row' }, input,
          el('button', { type: 'submit', class: 'primary', disabled: S.status === 'loading' }, a ? 'Add user' : 'Create login')));
      body.append(form,
        el('p', { id: 'acct-note', class: 'acct-note' }, `${a ? 'Their leagues join yours in one view. ' : ''}Public Sleeper data only. A username does not verify account ownership. No password needed.`));
      if (a) body.append(el('div', { class: 'acct-actions' },
        el('button', { type: 'button', disabled: S.status === 'loading', onclick: () => { A.refresh({ force: true }); E.refresh(true); } }, 'Refresh now'),
        el('button', { type: 'button', onclick: signOut }, synced ? 'Sign out everywhere' : 'Sign out')));
      body.append(el('p', { class: 'acct-note' }, 'Refreshes on each visit, after 15 minutes on focus, and every 30 minutes while visible. A closed app refreshes next time you open it.'));
      const espnInput = el('input', { id:'acct-espn-link', type:'text', value:espnValue, required:true, placeholder:'ESPN league URL or ID', autocomplete:'off', 'aria-describedby':'acct-espn-note' });
      const section = el('details', { class:'acct-espn', open:espnOpen || E?.preview || E?.error },
        el('summary', {}, 'Link ESPN league'),
        el('form', { class:'acct-form', onsubmit:e => { e.preventDefault(); espnValue = espnInput.value; E.inspect(espnValue); } },
          el('label', { for:'acct-espn-link' }, 'Public ESPN football league'),
          el('div', { class:'acct-row' }, espnInput, el('button', { type:'submit', disabled:E?.busy }, E?.busy ? 'Loading...' : 'Find league'))),
        el('p', { id:'acct-espn-note', class:'acct-note' }, `Public leagues only. Choose the team to view. No ESPN password or cookies needed. ${a ? `Links are saved for ${a.username}.` : "Links are saved in this browser. Connecting Sleeper switches to that account's saved links."}`));
      if (E?.error) section.append(el('p', { class:'acct-status err', role:'status' }, E.error));
      if (E?.preview) {
        const choose = el('select', { id:'acct-espn-team', required:true }, el('option', { value:'' }, 'Choose your team'),
          E.preview.raw.teams.map(t => el('option', { value:t.id }, t.name || t.abbrev || `Team ${t.id}`)));
        section.append(el('form', { class:'acct-form', onsubmit:e => { e.preventDefault(); E.link(choose.value); } },
          el('label', { for:'acct-espn-team' }, E.preview.raw.settings.name),
          el('div', { class:'acct-row' }, choose, el('button', { type:'submit', class:'primary' }, 'Link league'))));
      }
      for (const item of E?.links || []) section.append(el('div', { class:'acct-espn-linked' },
        el('div', {}, el('strong', {}, item.snapshot.league.name),
          el('p', { class:'acct-note' }, `${item.season}. ${item.snapshot.league.rosters.find(r => r.is_me)?.team_name || 'Team unavailable'}. Synced ${new Date(item.snapshot.syncedAt).toLocaleString()}.`),
          item.error ? el('p', { class:'acct-status err', role:'status' }, `${item.error} Showing the last successful snapshot.`) : null,
          item.snapshot.league.import_limitations.length ? el('p', { class:'acct-note' }, item.snapshot.league.import_limitations.join('. ')) : null),
        el('button', { type:'button', onclick:() => E.unlink(item.id) }, 'Unlink')));
      if (!a && E?.links.length) section.append(el('button', { type:'button', onclick:() => E.refresh(true) }, 'Refresh ESPN'));
      body.append(section);
      if (hadFocus) input.focus();
    }

    function openPanel(platform) {
      if (!dialog) {
        dialog = el('dialog', { class: 'acct-dialog', 'aria-labelledby': 'acct-title' },
          el('div', { class: 'acct-head' },
            el('h2', { id: 'acct-title' }, 'Accounts and leagues'),
            el('button', { type: 'button', class: 'ghost acct-x', 'aria-label': 'Close', onclick: () => dialog.close() }, '×')),
          el('div', { class: 'acct-body' }));
        dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
        dialog.addEventListener('close', () => { const b = doc.querySelector('.acct-btn'); if (b) b.focus(); });
        doc.body.append(dialog);
      }
      renderPanel();
      if (!dialog.open) dialog.showModal();
      const f = dialog.querySelector('#acct-user');
      if (f) f.focus();
      if (platform === 'espn') { dialog.querySelector('.acct-espn').open = true; dialog.querySelector('#acct-espn-link').focus(); }
    }

    function onStatus() {
      renderPanel();
      const b = doc.querySelector('.acct-btn');
      if (b) b.replaceWith(sidebarNode());
    }

    function sidebarNode() {
      const s = A.S;
      const warn = s.status === 'stale' || s.status === 'error' || s.status === 'partial' || s.status === 'no_leagues';
      const when = s.active && s.snap ? `, synced ${ago(Date.now() - s.snap.syncedAt)}` : '';
      return el('button', { type: 'button', class: `sub acct-btn${warn ? ' warn' : ''}`, 'aria-haspopup': 'dialog',
        'aria-label': `Accounts and leagues: ${label()}${when}`, title: 'Accounts and leagues', onclick: () => openPanel() },
        el('span', { class: 'acct-name' }, `${label()}${season() ? ` · ${season()}` : ''}`),
        el('span', { class: 'acct-chip', 'aria-hidden': 'true' }, s.status === 'loading' ? 'syncing' : warn ? 'check' : 'change'));
    }

    A = createAccounts({
      storage: { getItem: k => win.localStorage.getItem(k), setItem: (k, v) => win.localStorage.setItem(k, v), removeItem: k => win.localStorage.removeItem(k) },
      fetchFn: (u, o) => win.fetch(u, o), onStatus,
      onData: snap => {
        const oldId = win.MY_USER_ID;
        if (oldId !== A.S.active?.user_id) E?.reset();
        configure(snap);
        applyGlobals(win, A.S.active, snap);
        E?.merge(win);
        saveProfile();
        doc.title = `The Fantasy Hub${A.S.active ? `, ${A.S.active.username}` : ''}`;
        if (win.__app && oldId !== win.MY_USER_ID && A.S.remembered !== false) {
          win.history.replaceState(null, '', '#dashboard');
          win.location.reload();
          return;
        }
        win.dispatchEvent(new win.CustomEvent('ff-account-data'));
      },
    });
    E = win.FF_ESPN.create({
      storage: { getItem:k => win.localStorage.getItem(k), setItem:(k,v) => win.localStorage.setItem(k,v) },
      players:win.PLAYERS, owner:() => A.S.active?.user_id,
      season:() => A.S.snap?.season || win.WEEKLY_RANKINGS?.season || new Date().getFullYear(),
      sharedSeason:() => win.WEEKLY_RANKINGS?.season,
      onStatus:renderPanel,
      onChange:() => { configure(A.S.snap); applyGlobals(win, A.S.active, A.S.snap); E.merge(win); saveProfile(); win.dispatchEvent(new win.CustomEvent('ff-account-data')); },
    });
    // Only Trevor's stable ID may migrate the legacy personal keys. Never read
    // these unscoped keys for another user, even in one of the same leagues.
    function storageKey(base) {
      const uid = A.S.active?.user_id || 'disconnected';
      const key = `${base}::account:${uid}`;
      if (uid === buildUserId) try {
        if (win.localStorage.getItem(key) === null) {
          const old = win.localStorage.getItem(base);
          if (old !== null) { win.localStorage.setItem(key, old); win.localStorage.removeItem(base); }
        }
      } catch {}
      return key;
    }
    win.FF_ACCOUNT = { ...A, espn:E, get active() { return A.S.active; }, storageKey,
      get syncedAt() { return A.S.snap?.syncedAt || 0; }, sidebarNode, openPanel };
    configure(A.S.snap);
    applyGlobals(win, A.S.active, A.S.snap);
    E.merge(win);
    doc.title = `The Fantasy Hub${A.S.active ? `, ${A.S.active.username}` : ''}`;
    win.addEventListener('DOMContentLoaded', () => { A.refresh({ force: true }); E.refresh(true); loadProfile(); });
    const maybe = () => { if (doc.visibilityState === 'visible') { A.refresh(); E.refresh(); } };
    doc.addEventListener('visibilitychange', maybe);
    win.addEventListener('focus', maybe);
    win.addEventListener('online', () => { A.refresh({ force: true }); E.refresh(true); });
    win.setInterval(maybe, POLL_MS);
  }
  boot(root);
})(window);
