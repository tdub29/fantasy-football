/* The Fantasy Hub, Fantasy Football site app
 * Vanilla JS, hash router, no dependencies.
 * Loads window.RANKINGS_SOURCES, window.PLAYERS, window.LEAGUES from data/*.js
 */

(() => {
  'use strict';

  // ============================================================
  // Helpers
  // ============================================================
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const h = (tag, props={}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class' || k === 'className') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  };
  // Player headshot from Sleeper's public CDN, keyed by the same Sleeper id the
  // site uses everywhere. A DEF "player" id is its team code, which gets the team
  // logo instead. Decorative (the name sits beside it), so alt is empty, and a
  // player Sleeper has no photo for hides the image rather than showing a broken one.
  const headshot = (pid, size = 28) => {
    if (!pid) return null;
    const id = String(pid);
    const isDef = /^[A-Z]{2,3}$/.test(id);
    const src = isDef ? `https://sleepercdn.com/images/team_logos/nfl/${id.toLowerCase()}.png`
      : `https://sleepercdn.com/content/nfl/players/${size > 40 ? '' : 'thumb/'}${id}.jpg`;
    return h('img', { class:'headshot', src, alt:'', width:size, height:size,
      loading:'lazy', decoding:'async', onerror:(e) => { e.target.style.visibility = 'hidden'; } });
  };
  const fmt = {
    pct: (n) => `${(n*100).toFixed(0)}%`,
    num: (n) => Number(n||0).toLocaleString(),
    decimal: (n, d=1) => (Number(n||0)).toFixed(d),
  };
  function sortStandingRows(rows, key, dir) {
    const direction = dir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
      const primary = ((Number(a.dataset[key]) || 0) - (Number(b.dataset[key]) || 0)) * direction;
      if (primary) return primary;
      return (Number(a.dataset.strengthRank) || 999) - (Number(b.dataset.strengthRank) || 999);
    });
  }
  function standingDefaultDir(key) { return key === 'pa' ? 'asc' : 'desc'; }

  // Persistent settings
  const SETTINGS_KEY = 'ff-site-settings-v2';
  const defaults = {
    enabledRankings: {},   // { rankingId: true/false }
    enabledSources:  {},   // { sourceId: true/false }
    enabledExpertCols: {}, // { expertSourceId: true/false } - expert rank columns
    weeklyExpertIds: null, // null seeds current tracked experts; [] means none selected
    customSources: [],     // user-added sources, same shape as built-ins
    retiredGibbsHalfCol: false, // one-shot migration marker, see ensureExpertColDefaults
  };
  function loadSettings() {
    try { return Object.assign({}, defaults, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); }
    catch { return Object.assign({}, defaults); }
  }
  function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); }

  // Toast notification
  function toast(msg, kind='info') {
    let host = $('#toasts');
    if (!host) { host = h('div', { id:'toasts', class:'toasts' }); document.body.appendChild(host); }
    const t = h('div', { class:`toast ${kind}` }, msg);
    host.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(8px)'; }, 2400);
    setTimeout(() => { try { t.remove(); } catch {} }, 2800);
  }

  // ============================================================
  // State
  // ============================================================
  const state = {
    settings: loadSettings(),
  };

  function getAllSources() {
    return [...(window.RANKINGS_SOURCES || []), ...(state.settings.customSources || [])];
  }

  // Initialize per-source toggles to enabled by default if undefined
  function ensureSourceDefaults() {
    for (const src of getAllSources()) {
      if (state.settings.enabledSources[src.id] === undefined) state.settings.enabledSources[src.id] = true;
      for (const r of src.rankings || []) {
        if (state.settings.enabledRankings[r.id] === undefined) {
          state.settings.enabledRankings[r.id] = r.defaultEnabled !== false;
        }
      }
    }
  }

  // ============================================================
  // Player matching: rankings -> Sleeper IDs
  // ============================================================
  const norm = (s) => (s || '')
    .toString()
    .toLowerCase()
    .replace(/[\.\']/g, '')
    .replace(/\s+jr\b|\s+sr\b|\s+iii\b|\s+ii\b|\s+iv\b/g, '')
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Build a Sleeper-ID-by-name map once
  let _sleeperByName = null;
  let _sleeperNamesakes = null;      // norm name -> every pid carrying it
  function sleeperByName() {
    if (_sleeperByName) return _sleeperByName;
    const m = new Map();
    const same = new Map();
    const PLAYERS = window.PLAYERS || {};
    for (const pid in PLAYERS) {
      const p = PLAYERS[pid];
      const k1 = norm(p.name);
      const k2 = norm(`${p.first} ${p.last}`);
      if (k1 && !m.has(k1)) m.set(k1, pid);
      if (k2 && !m.has(k2)) m.set(k2, pid);
      for (const k of new Set([k1, k2])) if (k) (same.get(k) || same.set(k, []).get(k)).push(pid);
      // common nicknames
      if (p.first && p.last) {
        const initialed = norm(`${p.first[0]} ${p.last}`); // e.g., "j allen"
        if (initialed && !m.has(initialed)) m.set(initialed, pid);
      }
    }
    // hand-tuned aliases
    const aliases = [
      ['JSN', 'Jaxon Smith-Njigba'],
      ['ARSB', 'Amon-Ra St. Brown'],
      ['BTJ', 'Brian Thomas'],
      ['Tetairoa McMillan', 'Tet McMillan'],
    ];
    for (const [alias, real] of aliases) {
      const realKey = norm(real);
      const pid = m.get(realKey);
      if (pid) m.set(norm(alias), pid);
    }
    _sleeperByName = m;
    _sleeperNamesakes = same;
    return m;
  }
  function sleeperIdFor(name) {
    return sleeperByName().get(norm(name)) || null;
  }

  // Last-name + position fallback. Catches mismatches like
  // "Chigoziem Okonkwo" (KTC's full birth name) vs "Chig Okonkwo" (Sleeper's
  // common name), or "T.J. Hockenson" vs "TJ Hockenson". Only used as a
  // fallback when the primary name match returns null. Returns null if the
  // last name + position combo is ambiguous in the Sleeper dictionary.
  // Sleeper files IDPs under sub-positions (DE, DT, CB, S) while rankings and
  // lineup slots say DL and DB, so positions compare on the slot. Comparing raw
  // strings left Myles Garrett (DE) unresolved and the last-name fallback then
  // handed his row to a free-agent "DL" Garrett. fantasy_positions is carried in
  // players.js only for multi-slot players (Travis Hunter: DB and WR).
  const POS_SLOT = { DE:'DL', DT:'DL', NT:'DL', CB:'DB', S:'DB' };
  const posSlot = (pos) => POS_SLOT[pos] || pos;
  function fitsPos(pid, pos) {
    const p = window.PLAYERS?.[pid];
    return !!p && [p.pos, ...(p.fantasy_positions || [])].some(x => posSlot(x) === posSlot(pos));
  }
  let _sleeperByLastPos = null;
  function sleeperByLastNamePos() {
    if (_sleeperByLastPos) return _sleeperByLastPos;
    const m = new Map();
    for (const pid in (window.PLAYERS || {})) {
      const p = window.PLAYERS[pid];
      if (!p.last || !p.pos) continue;
      const key = `${norm(p.last)}|${posSlot(p.pos)}`;
      if (!m.has(key)) m.set(key, pid);
      else if (m.get(key) !== 'AMBIGUOUS') m.set(key, 'AMBIGUOUS');
    }
    _sleeperByLastPos = m;
    return m;
  }
  function sleeperIdForFuzzy(name, pos) {
    const direct = sleeperIdFor(name);
    if (!pos) return direct;
    // The name map keeps the first player of a name, so the WR DJ Moore behind a
    // retired CB DJ Moore is only reachable by filtering namesakes on position,
    // and the KC Chris Jones behind a retired DT Chris Jones by his NFL team.
    let namesakes = (_sleeperNamesakes.get(norm(name)) || []).filter(pid => fitsPos(pid, pos));
    if (namesakes.length > 1) namesakes = namesakes.filter(pid => window.PLAYERS[pid].team !== 'FA');
    if (namesakes.length === 1) return namesakes[0];
    if (direct && fitsPos(direct, pos)) return direct;
    const last = norm(name).split(' ').filter(Boolean).slice(-1)[0];
    if (!last || last.length < 3) return null;
    const found = sleeperByLastNamePos().get(`${last}|${posSlot(pos)}`);
    return (found && found !== 'AMBIGUOUS') ? found : null;
  }

  // Build a unified ranking lookup from enabled sources
  // Returns: { byName: Map(normName -> {category, tier, ...}), bySleeperId: Map(pid -> {...}), all: [{...}] }
  let _rankIndex = null;
  let _rankIndexKey = null;
  // Data freshness from window.BUILD_INFO (written by build_all.py). Returns
  // { name, ageH, ageLabel, stale } per tracked file + the staleest critical one.
  const FRESH_CRITICAL = ['ktc.js', 'players.js', 'leagues.js', 'projections.js', 'weekly-rankings.js',
    'categories.js', 'sos.js', 'sos-grid.js', 'faab.js'];
  // Plain-English names for each data file (used in freshness UI, no jargon).
  const DATA_LABEL = {
    'ktc.js': 'Player values', 'players.js': 'Rosters & players', 'leagues.js': 'Leagues',
    'projections.js': 'Projections', 'categories.js': 'Tiers & categories',
    'environment.js': 'Team offenses', 'sos.js': 'Schedule strength', 'sos-grid.js': 'Matchup grid',
    'faab.js': 'Waiver prices',
    'sleeper-idp.js': 'Defense rankings', 'player-info.js': 'Player info', 'jacob-gibbs.js': 'Gibbs ranks',
    'expert-rankings.js': 'Expert ranks',
    'sleeper-market.js': 'Trending adds/drops', 'context.js': 'Player context', 'history.js': 'Player history',
  };
  function dataFreshness() {
    const info = window.BUILD_INFO;
    if (!info || !info.files) return null;
    const now = Date.now();
    const ageLabel = (h) => h < 1 ? `${Math.round(h * 60)}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
    const rows = Object.entries(info.files).map(([name, iso]) => {
      const ageH = (now - new Date(iso).getTime()) / 3.6e6;
      return { name, iso, ageH, ageLabel: ageLabel(ageH) };
    });
    const critical = rows.filter(r => FRESH_CRITICAL.includes(r.name));
    const stalest = critical.sort((a, b) => b.ageH - a.ageH)[0] || null;
    return { rows, stalest, stale: stalest ? stalest.ageH > 72 : false };
  }
  function rankIndex() {
    const enabledKey = JSON.stringify({s:state.settings.enabledSources, r:state.settings.enabledRankings});
    if (_rankIndex && _rankIndexKey === enabledKey) return _rankIndex;
    // Aggregate across enabled rankings. Each player's "source rank" is their
    // 1-based index in the source's list (which is itself ordered top to bottom
    // by the analyst, with tiers as clusters inside that ordering). The overall
    // rank is the AVERAGE of source ranks across rankings that mention the
    // player, with players appearing in more rankings prioritized first.
    const byName = new Map();        // norm(name) -> canonical entry
    const bySleeperId = new Map();
    const sourceRanks = new Map();   // norm(name) -> [{src, ranking, rank}]
    for (const src of getAllSources()) {
      if (!state.settings.enabledSources[src.id]) continue;
      for (const r of src.rankings || []) {
        if (!state.settings.enabledRankings[r.id]) continue;
        const players = r.players || [];
        for (let i = 0; i < players.length; i++) {
          const p = players[i];
          const key = norm(p.name);
          const pid = sleeperIdForFuzzy(p.name, p.pos);
          const entry = Object.assign({}, p, { _src: src.id, _ranking: r.id, _sleeperId: pid });
          if (!byName.has(key)) byName.set(key, entry);
          else {
            // Merge richer fields from later sources onto canonical (first wins for
            // category/tier from the highest-priority source, but KTC market data
            // from any source that supplies it is always preserved).
            const cur = byName.get(key);
            for (const k of ['ktcValue','ktcAdp','ktcPosRank']) if (entry[k] != null && cur[k] == null) cur[k] = entry[k];
          }
          if (pid && !bySleeperId.has(pid)) bySleeperId.set(pid, entry);
          (sourceRanks.get(key) || sourceRanks.set(key, []).get(key))
            .push({ src: src.id, ranking: r.id, rank: i + 1 });
        }
      }
    }
    // Compute aggregated overall rank for each entry
    for (const [key, entry] of byName) {
      const ranks = sourceRanks.get(key) || [];
      entry._sourceCount = ranks.length;
      entry._avgSourceRank = ranks.reduce((s,x)=>s+x.rank, 0) / Math.max(1, ranks.length);
      entry._sourceRanks = ranks;
    }
    // Build the flat ordered list: sort primarily by avg source rank ascending
    // (lower is better), with ties broken by tier value desc, then name.
    const sorted = Array.from(byName.values()).sort((a, b) => {
      if (a._avgSourceRank !== b._avgSourceRank) return a._avgSourceRank - b._avgSourceRank;
      const tv = (window.TIER_VALUES[b.category]?.[b.tier] || 0) - (window.TIER_VALUES[a.category]?.[a.tier] || 0);
      if (tv !== 0) return tv;
      return a.name.localeCompare(b.name);
    });
    // Dedup by Sleeper id: two source spellings of one player (e.g. "Jordyn" vs
    // "Jordan" Tyson) become separate name entries that resolve to the SAME id,
    // and show as duplicate rows. Keep the best-ranked (list is sorted, so first
    // wins) and drop the rest. Null ids (unresolved) can't be deduped, keep all.
    const seenId = new Set();
    const all = sorted.filter(p => {
      if (!p._sleeperId) return true;
      if (seenId.has(p._sleeperId)) return false;
      seenId.add(p._sleeperId); return true;
    });
    // Stamp 1-based overall rank + positional rank
    const posCounters = {};
    all.forEach((p, i) => {
      p._overallRank = i + 1;
      posCounters[p.pos] = (posCounters[p.pos] || 0) + 1;
      p._posRank = posCounters[p.pos];
    });
    _rankIndex = { byName, bySleeperId, all };
    _rankIndexKey = enabledKey;
    return _rankIndex;
  }
  function invalidateRankIndex() {
    _rankIndex = null; _rankIndexKey = null;
    _pickIndex = null; _pickIndexKey = null;
    _leaguePickAvgCache.clear();
    _valueShareCache.clear();
    _originSlotCache.clear();
    _stanceCache.clear();
    _mispriceIdx = null; _mispriceKey = null;
  }

  // Mispricing: within each position, compare a player's SEASON-projection rank to
  // his DYNASTY-value (KTC) rank. gap = valueRank - projRank. Positive = he produces
  // better than the market prices him (a value/buy lean); negative = priced above
  // production (a sell lean). This is the single highest-signal targeting metric the
  // data already supports, projections and value both exist, the DELTA didn't.
  // Read WITH the age column: a young ascending player projecting below his dynasty
  // price is normal (not a sell); an aging producer above his price is a sell-high.
  let _mispriceIdx = null, _mispriceKey = null;
  function mispricingIndex() {
    const key = JSON.stringify({ s: state.settings.enabledSources, r: state.settings.enabledRankings });
    if (_mispriceIdx && _mispriceKey === key) return _mispriceIdx;
    const m = new Map();
    const O = window.OFFENSE_PROJ?.offense;
    if (!O) { _mispriceIdx = m; _mispriceKey = key; return m; }
    const idx = rankIndex();
    const byPos = {};
    for (const p of O.players || []) {
      if (!p.id) continue;
      const pts = p.blend ?? p.pp ?? p.sleeper;
      if (pts == null) continue;
      const ranked = idx.bySleeperId.get(p.id);
      const val = ranked ? tierValue(ranked, {}) : 0;
      (byPos[p.pos] = byPos[p.pos] || []).push({ pid: p.id, pts, val });
    }
    for (const pos in byPos) {
      const arr = byPos[pos];
      const projRank = new Map([...arr].sort((a, b) => b.pts - a.pts).map((x, i) => [x.pid, i + 1]));
      const valRank = new Map([...arr].sort((a, b) => b.val - a.val).map((x, i) => [x.pid, i + 1]));
      for (const x of arr) {
        const pr = projRank.get(x.pid), vr = valRank.get(x.pid), gap = vr - pr;
        m.set(x.pid, { pos, pts: x.pts, projRank: pr, valRank: vr, gap,
          signal: gap >= 6 ? 'buy' : gap <= -6 ? 'sell' : 'hold' });
      }
    }
    _mispriceIdx = m; _mispriceKey = key; return m;
  }
  // One-line buy/sell/hold verdict, synthesizing the mispricing gap with the
  // position age curve. This is the "so what" the player card was missing: every
  // input existed, nothing concluded. Returns { label, tone, why } or null.
  function playerVerdict(ranked, sleeper) {
    if (!ranked) return null;
    const pid = sleeper?.id || ranked._sleeperId;
    const mp = pid && mispricingIndex().get(String(pid));
    const age = ageOf(pid, ranked.age ?? sleeper?.age);
    const curve = window.STRATEGY?.age_curve?.[ranked.pos];
    const aging = curve && age != null ? age >= (curve.sell_age ?? 99) : false;
    const nearPeak = curve && age != null ? age <= (curve.peak_avg ?? 0) : true;
    const gap = mp?.gap ?? 0;
    const rk = mp ? `${ranked.pos}${mp.valRank} value vs ${ranked.pos}${mp.projRank} projection` : '';
    if (gap <= -6 && aging) return { label: 'SELL HIGH', tone: 'sell', why: `Priced above production (${rk}) and past the ${ranked.pos} sell age (${age}). Move him for value before the market catches down.` };
    if (gap <= -6) return { label: 'MARKET AHEAD', tone: 'hold', why: `Priced above this season’s projection (${rk}) but still young, so the price is paying for upside, not current output. Hold unless a buyer overpays.` };
    if (gap >= 6 && !aging) return { label: 'BUY', tone: 'buy', why: `Outproduces his price (${rk}) and ${nearPeak ? 'at/before peak' : 'in his prime'}. Undervalued, buy the production.` };
    if (gap >= 6 && aging) return { label: 'WIN-NOW BUY', tone: 'buy', why: `Outproduces his price now (${rk}) but aging: a cheap win-now piece for a contender, not a long-term hold.` };
    if (aging) return { label: 'AGING HOLD', tone: 'hold', why: `Fairly priced but past the ${ranked.pos} sell age${age != null ? ` (${age})` : ''}; start planning an exit while value holds.` };
    return { label: 'HOLD', tone: 'hold', why: mp ? `Fairly priced against projection (${rk}).` : 'No season projection to price against, judge on dynasty value + age.' };
  }
  // ===== Value Over Replacement (VOR), league-aware =====
  // Replacement level at a position = the projected points of the LAST startable
  // player leaguewide (starters-per-pos × teams, flex distributed via
  // targetStartersByPos). VOR = a player's projection minus that. Unlike raw
  // points, VOR is cross-position comparable (a QB's 350 and an RB's 250 aren't;
  // their VOR is), it's how much a player beats a freely-available replacement,
  // i.e. real starting-lineup value. Superflex correctly deepens QB replacement.
  let _projByPidIdx = null;
  function projByPid() {
    if (_projByPidIdx) return _projByPidIdx;
    const m = new Map();
    for (const unit of ['offense', 'defense'])
      for (const p of (window.OFFENSE_PROJ?.[unit]?.players || [])) if (p.id) m.set(String(p.id), { p, unit });
    _projByPidIdx = m; return m;
  }
  const _vorLevelCache = new Map();
  function vorLevels(league, unit, src) {
    const key = `${league.id}::${unit}::${src}`;
    if (_vorLevelCache.has(key)) return _vorLevelCache.get(key);
    const O = window.OFFENSE_PROJ?.[unit];
    const targets = targetStartersByPos(league);
    const teams = league.total_rosters || 10;
    const bins = {};
    for (const p of (O?.players || [])) {
      const pts = p[src] ?? p.blend ?? p.pp ?? p.sleeper;
      if (pts == null) continue;
      const g = projPosGroup(p.pos);
      (bins[g] = bins[g] || []).push(pts);
    }
    const levels = {};
    for (const g in bins) {
      bins[g].sort((a, b) => b - a);
      const R = Math.max(1, Math.round((targets[g] || 0) * teams));
      levels[g] = bins[g][Math.min(R, bins[g].length) - 1] ?? 0;
    }
    _vorLevelCache.set(key, levels);
    return levels;
  }
  // VOR from an OFFENSE_PROJ player object (projections page has this directly).
  function vorForPlayer(p, league, unit, src) {
    if (!p) return null;
    const pts = p[src] ?? p.blend ?? p.pp ?? p.sleeper;
    if (pts == null) return null;
    const lvl = vorLevels(league, unit, src)[projPosGroup(p.pos)];
    return lvl == null ? null : Math.round((pts - lvl) * 10) / 10;
  }
  // VOR by sleeper id (tables that only have a pid). Finds the player in offense
  // or defense automatically. src falls back to blend when the requested one is
  // absent (e.g. PP has no IDP).
  function vorByPid(pid, league, src) {
    if (!pid || !window.OFFENSE_PROJ) return null;
    const hit = projByPid().get(String(pid));
    if (!hit) return null;
    const use = hit.p[src] != null ? src : 'blend';
    return vorForPlayer(hit.p, league, hit.unit, use);
  }
  // PP vs Sleeper POSITIONAL RANK difference. Within each position, rank everyone
  // by PrizePicks (Vegas market) points and by Sleeper (model) points; the signal
  // is sleeperRank − ppRank. Positive = PP ranks him HIGHER (better) than Sleeper,
  // i.e. the sharp market likes him more than the public model → undervalued lean.
  // Rank-based (not points) so it's comparable across positions. Needs BOTH sources,
  // so it's offense-only and skips players PrizePicks didn't board.
  let _ppRankIdx = null;
  function ppRankIndex() {
    if (_ppRankIdx) return _ppRankIdx;
    const m = new Map();
    const O = window.OFFENSE_PROJ?.offense;
    if (!O) { _ppRankIdx = m; return m; }
    const byPos = {};
    for (const p of O.players || []) {
      if (p.id == null || p.pp == null || p.sleeper == null) continue;
      const g = projPosGroup(p.pos);
      (byPos[g] = byPos[g] || []).push(p);
    }
    for (const g in byPos) {
      const arr = byPos[g];
      const ppRank = new Map([...arr].sort((a, b) => b.pp - a.pp).map((x, i) => [String(x.id), i + 1]));
      const slpRank = new Map([...arr].sort((a, b) => b.sleeper - a.sleeper).map((x, i) => [String(x.id), i + 1]));
      for (const x of arr) {
        const pr = ppRank.get(String(x.id)), sr = slpRank.get(String(x.id));
        m.set(String(x.id), { pos: g, ppRank: pr, slpRank: sr, diff: sr - pr });
      }
    }
    _ppRankIdx = m; return m;
  }
  function ppEdge(rec) { return rec && rec.id != null ? (ppRankIndex().get(String(rec.id))?.diff ?? null) : null; }
  function ppEdgeByPid(pid) { return pid == null ? null : (ppRankIndex().get(String(pid))?.diff ?? null); }
  function ppEdgeChip(pid) {
    const r = pid != null && ppRankIndex().get(String(pid));
    if (!r) return null;
    const d = r.diff;
    const color = d >= 4 ? 'var(--green)' : d <= -4 ? 'var(--red)' : 'var(--fg-3)';
    return h('span', { class: 'tnum', style: { color, fontWeight: 600 },
      title: `PrizePicks ranks him ${r.pos}${r.ppRank}, Sleeper ranks him ${r.pos}${r.slpRank}, PP ${d > 0 ? 'higher' : d < 0 ? 'lower' : 'even'} by ${Math.abs(d)} spot${Math.abs(d) === 1 ? '' : 's'}. ${d > 0 ? 'Sharp market likes him more than the public model, undervalued lean.' : d < 0 ? 'Sleeper ranks him higher than the market, may overrate.' : 'Market and model agree.'}` },
      `${d > 0 ? '+' : ''}${d}`);
  }
  // Redraft leagues have no dynasty half. Rookie picks, future value, position
  // age curves and rebuild/contend stance all price a career the manager never
  // gets to keep, so every one of those surfaces is gated on this flag.
  // build_site_data.py writes is_dynasty explicitly (Sleeper settings.type:
  // 2 = dynasty, 1 = keeper, 0 = redraft; ESPN leagues are set false in the
  // ESPN ingest path). The type fallback covers a leagues.js generated before
  // that field existed, and an unknown league reads as dynasty so a missing
  // flag never silently strips the UI.
  function isDynastyLeague(lg) {
    if (!lg) return true;
    if (typeof lg.is_dynasty === 'boolean') return lg.is_dynasty;
    return lg.type !== 0;
  }

  // The league whose format defines VOR replacement in cross-league contexts.
  function primaryLeague() {
    return (window.LEAGUES || []).find(l => l.rosters.some(r => r.is_me)) || (window.LEAGUES || [])[0] || null;
  }
  // IDP positions, Sleeper's aliases included. A defender only exists in a league
  // whose is_idp flag is set; anywhere else he cannot start, so he is no buy, no
  // target, and no number priced in that league.
  const IDP_POSITIONS = new Set(['LB','DB','DL','CB','S','DT','DE','NT']);
  function isIdpPos(pos) { return IDP_POSITIONS.has(String(pos || '').toUpperCase()); }
  function leagueFitsPos(lg, pos) { return !isIdpPos(pos) || !!(lg && lg.is_idp); }
  // The league a cross-league figure (VOR, week projection, card value) is scored
  // in: a defender in the IDP league he can start in, everyone else in primaryLeague.
  function contextLeagueFor(pos) {
    if (!isIdpPos(pos)) return primaryLeague();
    const L = window.LEAGUES || [];
    return L.find(l => l.is_idp && l.rosters.some(r => r.is_me)) || L.find(l => l.is_idp) || primaryLeague();
  }
  // Colored VOR chip. Positive green (a startable edge), ~0 grey (replacement),
  // negative red (below a freely-available player). Null when no projection.
  // src 'ros' is the redraft value's basis: rest-of-season points over the best
  // free body at the position in this league.
  function vorChip(pid, league, src) {
    const lg = league || primaryLeague();
    if (!lg) return null;
    const ros = src === 'ros';
    const v = ros ? rosVorByPid(pid, lg, null, DEPTH_TIER) : vorByPid(pid, lg, src || 'blend');
    if (v == null) return null;
    const color = v >= 30 ? 'var(--green)' : v >= 0 ? 'var(--fg-1)' : 'var(--red)';
    const pos = ros ? rosPointsByPid(lg).get(String(pid))?.pos : projByPid().get(String(pid))?.p?.pos;
    return h('span', { class: 'tnum', style: { color, fontWeight: 600 },
      title: `Value over replacement: ${v > 0 ? '+' : ''}${v} ${ros ? 'rest-of-season' : 'projected'} pts vs the ${ros ? 'best free' : 'last startable'} ${pos || ''} in ${lg.short_name || lg.name}. Cross-position comparable, higher = more lineup value.` },
      `${v > 0 ? '+' : ''}${fmt.decimal(v, 0)}`);
  }
  // Small colored chip for the mispricing gap. +N green (produces above price),
  // -N red (priced above production). Null when the player has no projection.
  function mispriceChip(pid) {
    const mp = pid && mispricingIndex().get(String(pid));
    if (!mp) return null;
    const g = mp.gap;
    const color = g >= 6 ? 'var(--green)' : g <= -6 ? 'var(--red)' : 'var(--fg-3)';
    return h('span', { class: 'tnum', style: { color, fontWeight: 700 },
      title: `Season projection: ${mp.pos}${mp.projRank} · Dynasty value: ${mp.pos}${mp.valRank}. ${g > 0 ? 'Produces above its price (value lean)' : g < 0 ? 'Priced above production (sell lean)' : 'Fairly priced'}. Read with age.` },
      `${g > 0 ? '+' : ''}${g}`);
  }

  // KTC pick valuations: lookup by "season|slot|round" → { ktcValue, name }.
  // Exact Sleeper draft order wins when known; originSlot() projects unknown
  // future slots into KTC's Early / Mid / Late buckets.
  let _pickIndex = null;
  let _pickIndexKey = null;
  function pickIndex() {
    const key = JSON.stringify({ s: state.settings.enabledSources, r: state.settings.enabledRankings });
    if (_pickIndex && _pickIndexKey === key) return _pickIndex;
    const oneqb = new Map();
    const sf    = new Map();
    // Two passes. Pass 1 ingests enabled rankings (so an enabled alternative
    // pick source could override KTC). Pass 2 backfills missing keys from ALL
    // rankings, enabled or not: pick values are KTC-canonical and their format
    // is determined by the LEAGUE, not by which player-ranking lists are toggled
    // on. The ktc-superflex list defaults OFF, but SF leagues still need SF pick
    // values, without this backfill they fall through to the legacy strategy.js
    // table (a 2027 1st reads 30 instead of ~49-71).
    const ingest = (onlyEnabled) => {
      for (const src of (window.RANKINGS_SOURCES || [])) {
        if (onlyEnabled && !state.settings.enabledSources[src.id]) continue;
        for (const r of (src.rankings || [])) {
          if (onlyEnabled && !state.settings.enabledRankings[r.id]) continue;
          const target = r.format === 'dynasty_sf' ? sf
                       : r.format === 'dynasty_1qb' ? oneqb
                       : null;
          if (!target) continue;
          for (const p of (r.picks || [])) {
            const k = `${p.season}|${p.slot}|${p.round}`;
            if (!target.has(k)) target.set(k, p);
          }
        }
      }
    };
    ingest(true);
    ingest(false);
    _pickIndex = { oneqb, sf };
    _pickIndexKey = key;
    return _pickIndex;
  }

  // Bucket a 1-N slot (1 = weakest = first pick = "early") to KTC's slot label.
  // 12-team default: 1-4 → early, 5-8 → mid, 9-12 → late. Scales for 10/14.
  function slotToBucket(slot, totalRosters) {
    const N = totalRosters || 12;
    const early = Math.ceil(N / 3);
    const mid   = Math.ceil(2 * N / 3);
    if (slot <= early) return 'early';
    if (slot <= mid)   return 'mid';
    return 'late';
  }

  // A redraft league's top asset should land near the same ceiling KTC's top
  // dynasty asset does (max ktcValue 9997 / 100 ~= 100, max league VOR ~= 200),
  // so PV stays comparable across leagues on the My Leagues page.
  const REDRAFT_VOR_SCALE = 0.55;

  // ---- Rest-of-season value (redraft) ----------------------------------
  // A redraft league has no Future Value column, so its ONE number has to be
  // the value that is still to come. Two errors used to cancel out badly here:
  // the full-season projection counted weeks already played, and an injured
  // player was removed from the roster entirely, so a stud on IR graded as
  // zero while a healthy scrub graded above him.
  //
  // WEEKLY_RANKINGS carries Sleeper's per-week projections, and they are
  // already injury-aware: measured 2026-09-16, A.J. Brown is null for weeks 2
  // through 7 and returns at about 16 a week, so summing from the current week
  // prices the games he will miss without erasing the ten he will play. That
  // makes this self-maintaining as the injury news moves.
  // The sum stops at the league's last fantasy week (its title game), because
  // NFL week 18 is played after every fantasy season here is over: it put 19.9
  // phantom points on McCaffrey. With no league (a data-presence check) it runs
  // to the end of the feed. One map per last week, `_rosPts` holds them.
  let _rosPts = null;
  function rosPointsByPid(lg = null) {
    const last = lg ? playoffSettings(lg).lastWeek : Infinity;
    _rosPts = _rosPts || new Map();
    if (_rosPts.has(last)) return _rosPts.get(last);
    const out = new Map();
    _rosPts.set(last, out);
    const wr = window.WEEKLY_RANKINGS;
    if (!wr || !wr.players) return out;
    const from = Math.max(1, wr.currentWeek || 1);
    for (const p of wr.players) {
      const wk = p.sleeper || [];
      // `away`: weeks from now before his first line, his known absence.
      let sum = 0, games = 0, away = 0;
      for (let w = from; w <= Math.min(wk.length, last); w++) {
        const v = wk[w - 1];
        if (v != null) { sum += v; games++; } else if (!games) away++;
      }
      if (games) out.set(String(p.id), { pts: Math.round(sum * 10) / 10, games, pos: p.pos, out: away });
    }
    return out;
  }

  // Replacement level on the SAME rest-of-season basis, or the comparison is
  // meaningless. Same slot math as vorLevels: the last startable body at the
  // position given this league's lineup and size.
  // Replacement is TIERED, not one flat line per position. Measuring every RB
  // against the last startable RB conflated "I own an elite RB1" with "I own
  // depth", and it is not the choice a manager faces: if your RB1 goes, your
  // RB2 slides up and the hole opens at the bottom.
  //
  // So the k-th best player at a position on a roster is priced against overall
  // rank n*k+1 at that position, n being the league size: in a 12-team league
  // the RB1 tier is measured against RB13 and the RB2 tier against RB25.
  //
  // That formula holds only inside the starting slots. Past them it inverts,
  // because rank n*k+1 is still on somebody's roster and is not available to
  // you: measured 2026-09-16, a 6th WR priced against WR73 came out at -75,
  // reading a cuttable bench body as a large liability. Beyond the last
  // starting tier the baseline therefore flattens to the best player actually
  // free in THIS league, and the whole thing floors at zero because a bench
  // player you can drop is never worth less than nothing.
  const _rosBoardCache = new Map();
  function rosBoard(league) {
    const key = String(league.id);
    if (_rosBoardCache.has(key)) return _rosBoardCache.get(key);
    const rostered = new Set();
    for (const r of (league.rosters || [])) {
      for (const pid of (r.players || [])) rostered.add(String(pid));
    }
    const byPos = {};
    for (const [pid, v] of rosPointsByPid(league)) {
      const g = projPosGroup(v.pos);
      (byPos[g] = byPos[g] || []).push({ pid, pts: v.pts, free: !rostered.has(pid) });
    }
    for (const g in byPos) byPos[g].sort((a, b) => b.pts - a.pts);
    const out = { byPos, teams: league.total_rosters || 10, starterTiers: {}, freeLevel: {} };
    const targets = targetStartersByPos(league);
    for (const g in byPos) {
      // A fractional flex share still buys a real tier, so round up.
      out.starterTiers[g] = Math.max(1, Math.ceil(targets[g] || 0));
      const firstFree = byPos[g].find(x => x.free);
      out.freeLevel[g] = firstFree ? firstFree.pts : 0;
    }
    _rosBoardCache.set(key, out);
    return out;
  }

  // Baseline for the k-th best player at a position (k is 1-based).
  function rosBaseline(league, posGroup, tier) {
    const b = rosBoard(league);
    const lst = b.byPos[posGroup];
    if (!lst) return 0;
    if (tier <= (b.starterTiers[posGroup] || 1)) {
      const idx = b.teams * tier;               // rank n*k+1, zero-indexed
      return lst[Math.min(idx, lst.length - 1)].pts;
    }
    return b.freeLevel[posGroup] || 0;
  }

  // Same ratio used by dynasty slot grades, but with rest-of-season points on
  // both sides. Mixing VOR in the numerator with dynasty order in the reference
  // made ordinary redraft starters look worthless.
  function redraftSlotGrade(pid, referencePoints, league) {
    const rec = rosPointsByPid(league).get(String(pid));
    if (!rec || !(referencePoints > 0)) return 0;
    const grade = rec.pts / referencePoints * 10;
    return Math.round(Math.max(0, Math.min(10, grade)) * 10) / 10;
  }

  // Tier of a player within his own roster at his position, 1-based.
  function rosTierOf(league, roster, pid) {
    const me = rosPointsByPid(league).get(String(pid));
    if (!me) return null;
    const g = projPosGroup(me.pos);
    let better = 0;
    for (const other of (roster.players || [])) {
      if (String(other) === String(pid)) continue;
      const o = rosPointsByPid(league).get(String(other));
      if (o && projPosGroup(o.pos) === g && o.pts > me.pts) better++;
    }
    return better + 1;
  }

  // Positional rank for THIS format: dynasty leagues keep the KTC rank, redraft
  // leagues rank by rest-of-season points, which is the only thing that matters
  // when there is no next year.
  const _rosRankCache = new Map();
  function rosPosRank(pid, league) {
    const key = String(league.id);
    if (!_rosRankCache.has(key)) {
      const byPos = {};
      for (const [id, v] of rosPointsByPid(league)) {
        const g = projPosGroup(v.pos);
        (byPos[g] = byPos[g] || []).push({ id, pts: v.pts });
      }
      const ranks = new Map();
      for (const g in byPos) {
        byPos[g].sort((a, b) => b.pts - a.pts);
        byPos[g].forEach((x, i) => ranks.set(x.id, i + 1));
      }
      _rosRankCache.set(key, ranks);
    }
    return _rosRankCache.get(key).get(String(pid)) || null;
  }

  // What to show, and what to call it, given the league.
  function posRankFor(entry, league) {
    const dyn = isDynastyLeague(league);
    if (dyn) {
      return entry && entry._posRank
        ? { rank: entry._posRank, label: 'Dynasty position rank (KTC)' } : null;
    }
    const pid = entry && (entry._sleeperId != null ? entry._sleeperId : entry.sleeperId);
    const r = pid != null ? rosPosRank(pid, league) : null;
    return r ? { rank: r, label: 'Position rank by rest-of-season projected points' } : null;
  }

  // Any tier past a position's starter tiers gets the same baseline: the best body
  // actually available for free. So one sentinel prices every bench row.
  const DEPTH_TIER = 99;
  function rosVorByPid(pid, league, roster = null, tierOverride = null) {
    const rec = rosPointsByPid(league).get(String(pid));
    if (!rec) return null;
    const g = projPosGroup(rec.pos);
    const tier = tierOverride != null ? tierOverride
               : (roster ? (rosTierOf(league, roster, pid) || 1) : 1);
    return Math.round((rec.pts - rosBaseline(league, g, tier)) * 10) / 10;
  }


  // Who fills a slot is an ORDERING question, and tierValue is the wrong key for it.
  // tierValue floors redraft VOR at 0 so a bench body cannot subtract from roster
  // strength, which ties every receiver outside the startable tier at exactly 0. On
  // Phi Kap that tied Flowers (241.2 rest-of-season), Adams (197.1), Sutton (170.6)
  // and Bryant (96.9), and array order handed WR2 to the WR79. Order on the real
  // number, grade on tierValue.
  function orderValue(p, league) {
    if (league && league.id && !isDynastyLeague(league)) {
      const pid = p._sleeperId != null ? p._sleeperId : p.sleeperId;
      const rec = pid != null ? rosPointsByPid(league).get(String(pid)) : null;
      if (rec) return rec.pts;
    }
    return tierValue(p, league);
  }

  // Signed VOR for display. tierValue() floors at 0 so a bench body cannot subtract
  // from roster strength, which is correct when summing a roster and wrong when
  // grading a single slot: it collapses "exactly replacement" and "20 points below
  // replacement" into the same 0. Returns null outside redraft, where the currency
  // is KTC market value and a negative has no meaning.
  function signedVor(p, league, tierOverride = null) {
    if (!p || !league || !league.id || isDynastyLeague(league)) return null;
    const pid = p._sleeperId != null ? p._sleeperId : p.sleeperId;
    if (pid == null) return null;
    const v = rosVorByPid(pid, league, null, tierOverride);
    return v == null ? null : Math.round(v * REDRAFT_VOR_SCALE * 10) / 10;
  }

  function tierValue(p, format, roster = null, tierOverride = null) {
    if (!p) return 0;
    // Redraft prices a season, not a career. VOR is the redraft currency: it is
    // rest-of-season points over replacement in THIS league, so it is
    // cross-position comparable, continuous, and already knows the slots.
    // Floored at 0 because a deep-bench body should not subtract from roster
    // strength. No projection means no season value, which is the honest answer
    // in a format where next year never arrives. Cross-league callers pass {},
    // which has no id, so they keep the dynasty currency.
    if (format && format.id && !isDynastyLeague(format)) {
      const pid = p._sleeperId != null ? p._sleeperId : p.sleeperId;
      // Rest-of-season first. Full-season VOR is the fallback for a player with
      // no weekly line, and it overstates him by the weeks already played.
      // With no roster there is no tier, so the baseline is replacement: the best
      // body free in THIS league (DEPTH_TIER). Defaulting to tier 1 measured every
      // player against rank n+1 and floored 162 of Phi Kap's 210 rostered players
      // to 0, depth and flex bodies included.
      const tier = roster || tierOverride != null ? tierOverride : DEPTH_TIER;
      let vor = pid != null ? rosVorByPid(pid, format, roster, tier) : null;
      if (vor == null && pid != null) vor = vorByPid(pid, format, 'blend');
      return vor == null ? 0 : Math.round(Math.max(0, vor) * REDRAFT_VOR_SCALE * 10) / 10;
    }
    let val;
    // Prefer KTC's actual market value when available; it captures the true
    // non-linear curve (one elite player > two mid). Normalize ~0-10000 to ~0-110.
    if (p.ktcValue) {
      val = p.ktcValue / 100;
    } else {
      const tbl = window.TIER_VALUES[p.category];
      if (!tbl) return 0;
      val = tbl[p.tier] || 0;
    }
    if (format && format.is_superflex && window.SUPERFLEX_POS_MULT[p.pos]) val *= window.SUPERFLEX_POS_MULT[p.pos];
    if (format && format.is_idp && window.IDP_POS_MULT[p.pos]) val *= window.IDP_POS_MULT[p.pos];
    return Math.round(val * 10) / 10;
  }

  // League-aware starter slots. Distributes FLEX over RB/WR/TE, SUPER_FLEX as
  // 2nd QB, and IDP_FLEX over LB/DB/DL.
  function targetStartersByPos(league) {
    let qb=0, rb=0, wr=0, te=0, flex=0, sf=0, lb=0, db=0, dl=0, idp_flex=0, k=0, def=0;
    for (const p of (league.roster_positions || [])) {
      if (p === 'QB') qb++;
      else if (p === 'RB') rb++;
      else if (p === 'WR') wr++;
      else if (p === 'TE') te++;
      else if (p === 'FLEX') flex++;
      else if (p === 'SUPER_FLEX') sf++;
      else if (p === 'LB') lb++;
      else if (p === 'DB' || p === 'CB' || p === 'S') db++;
      else if (p === 'DL' || p === 'DT' || p === 'DE' || p === 'NT') dl++;
      else if (p === 'IDP_FLEX' || p === 'IDP') idp_flex++;
      else if (p === 'K') k++;
      else if (p === 'DEF' || p === 'DST') def++;
    }
    return {
      QB: qb + sf * 1.0,
      RB: rb + flex * 0.40,
      WR: wr + flex * 0.50,
      TE: te + flex * 0.10,
      LB: lb + idp_flex * 0.55,
      DB: db + idp_flex * 0.30,
      DL: dl + idp_flex * 0.15,
      // Only leagues that actually roster the slot get a target, so a dynasty
      // league keeps K and DST out of its asset views as before.
      K: k,
      DEF: def,
    };
  }

  // Is this player startable league-wide? Uses positional rank vs league slots.
  function isStartable(p, league) {
    if (!p || !p._posRank) return false;
    const targets = targetStartersByPos(league);
    const total = league.total_rosters || 10;
    const leagueSlots = Math.ceil((targets[p.pos] || 0) * total);
    return p._posRank <= leagueSlots;
  }

  // Surplus (>0) or shortage (<0) of startable players per position on a roster.
  // For IDP leagues we also report LB/DB/DL slots. Note: my ranking sources
  // (Domain + KTC) are offense-only, so IDP "startable" is approximated by
  // count of rostered players at that position (best we can do without IDP ranks).
  function rosterSurplusShortage(rosterPlayers, league) {
    const targets = targetStartersByPos(league);
    const out = {};
    const offensePos = ['QB','RB','WR','TE'];
    const idpPos = ['LB','DB','DL'];
    const positions = league.is_idp ? [...offensePos, ...idpPos] : offensePos;
    for (const pos of positions) {
      if (!targets[pos]) continue;
      const isIDP = idpPos.includes(pos);
      // RANKED startables (used everywhere downstream that expects p.ranked)
      const rankedStartables = rosterPlayers.filter(p =>
        p.ranked && p.ranked.pos === pos && isStartable(p.ranked, league));
      // ROSTER-COUNT (includes unranked IDPs) for the lineup composition view
      const rosterCount = isIDP
        ? rosterPlayers.filter(p => p.sleeper && p.sleeper.pos === pos).length
        : rankedStartables.length;
      const need = Math.ceil(targets[pos] || 0);
      out[pos] = {
        startables: rosterCount,
        need,
        surplus: rosterCount - need,
        startablePlayers: rankedStartables, // always ranked-only, safe for downstream
        idp_no_rankings: isIDP, // UI hint
      };
    }
    return out;
  }

  // Player-only strength (no picks): total value of every rostered player. This
  // is an inventory number (value share, roster-strength breakdown), NOT a
  // finish projection, it rewards depth. Projected finish is startingStrength()
  // via originSlot(); keeping picks out of both is what breaks the cycle
  // computeRosterStrength → rosterOwnedPicks → pickValue → originSlot.
  function computePlayerStrength(roster, league) {
    const idx = rankIndex();
    const breakdown = { cornerstone:0, foundational:0, upside_premier:0, mainstay:0, productive_vet:0, short_term:0, unranked:0 };
    let total = 0;
    let rankedCount = 0;
    const rankedPlayers = [];
    const unranked = [];
    for (const pid of (roster.players || [])) {
      const sleeper = window.PLAYERS[pid];
      if (!sleeper) continue;
      const ranked = idx.bySleeperId.get(pid) || idx.byName.get(norm(sleeper.name));
      if (ranked) {
        const v = tierValue(ranked, league);
        total += v;
        breakdown[ranked.category] = (breakdown[ranked.category] || 0) + v;
        rankedCount++;
        rankedPlayers.push({ sleeper, ranked, value: v });
      } else {
        breakdown.unranked++;
        unranked.push(sleeper);
      }
    }
    return {
      total: Math.round(total*10)/10,
      breakdown,
      rankedCount,
      rankedPlayers,
      unranked,
      totalCount: (roster.players||[]).length,
    };
  }

  // Aging retention for a player N years out. KTC value is forward-looking
  // but only one year deep; for picks 2-3 seasons away we need to age the
  // roster ourselves. Curve thresholds come from STRATEGY.age_curve
  // (Apex Fantasy peak-age studies, distilled in strategy.js).
  //
  //   futureAge ≤ peak_avg              → 1.00  (still climbing / at peak)
  //   peak_avg < futureAge ≤ sell_age   → 0.85  (mild decline, sell window)
  //   sell_age < futureAge ≤ hard_sell  → 0.85 → 0.30 linear (steep drop)
  //   futureAge > hard_sell_age         → 0.10  (replacement-level)
  //
  // Positions without a curve (defenders, K) decay 5% per year as a default.
  function ageRetention(age, pos, yearsOut) {
    if (!yearsOut) return 1;
    if (!age) return Math.pow(0.95, yearsOut); // unknown age → modest decay
    const futureAge = age + yearsOut;
    const curve = window.STRATEGY?.age_curve?.[pos];
    if (!curve) return Math.pow(0.95, yearsOut);
    const { peak_avg, sell_age, hard_sell_age } = curve;
    if (futureAge <= peak_avg) return 1.0;
    if (futureAge <= sell_age) return 0.92;
    if (futureAge <= hard_sell_age) {
      const t = (futureAge - sell_age) / Math.max(1, hard_sell_age - sell_age);
      return 0.92 - 0.45 * t; // → 0.47 at hard-sell
    }
    return 0.25;
  }

  // Value share: this roster's player-only strength as a fraction of the
  // league-wide total player-only strength. Picks excluded (per Dynasty
  // Domain's framework, value share measures on-field assets, not stockpile).
  // Cached per (league, enabled-rankings signature) since standings views
  // compute it for every roster.
  const _valueShareCache = new Map();
  function leagueValueTotals(lg) {
    const key = `${lg.id}::${JSON.stringify({ s: state.settings.enabledSources, r: state.settings.enabledRankings })}`;
    const hit = _valueShareCache.get(key);
    if (hit) return hit;
    const totals = {};
    let leagueTotal = 0;
    for (const r of lg.rosters) {
      const t = computePlayerStrength(r, lg).total;
      totals[r.roster_id] = t;
      leagueTotal += t;
    }
    const out = { totals, leagueTotal, baseline: 1 / Math.max(1, lg.rosters.length) };
    _valueShareCache.set(key, out);
    return out;
  }
  function valueShareFor(roster, lg) {
    const { totals, leagueTotal, baseline } = leagueValueTotals(lg);
    const mine = totals[roster.roster_id] || 0;
    const share = leagueTotal > 0 ? mine / leagueTotal : 0;
    return { share, baseline, mine, leagueTotal };
  }
  // Dynasty Domain bands: baseline = 1/N, contender-lock ~ 1.24× baseline,
  // rebuild-floor ~ 0.72× baseline. Returns a label + color cue.
  function classifyValueShare(share, baseline) {
    const sf = window.STRATEGY?.share_framework;
    const contenderLock = sf ? sf.contender_lock : baseline * 1.24;
    const rebuildFloor  = sf ? sf.rebuild_floor  : baseline * 0.72;
    if (share >= contenderLock) return { label: 'CONTENDER', tone: 'good',  delta: share - baseline };
    if (share >= baseline)      return { label: 'ABOVE AVG', tone: 'mild',  delta: share - baseline };
    if (share >= rebuildFloor)  return { label: 'BELOW AVG', tone: 'mild',  delta: share - baseline };
    return                            { label: 'REBUILD',   tone: 'bad',   delta: share - baseline };
  }

  function computeRosterStrength(roster, league) {
    const base = computePlayerStrength(roster, league);
    // Picks: each owned pick contributes KTC value scaled to tierValue range.
    // Pick value uses exact draft order when known. Unknown future slots use
    // current player-only strength as best proxy for finish.
    // Redraft has no rookie draft to spend a pick on, so an owned pick carries no
    // value the manager ever realizes. Counting them would inflate a redraft team
    // by an asset class that does not exist in the format.
    const dynasty = isDynastyLeague(league);
    let picksValue = 0;
    const ownedPicks = dynasty ? rosterOwnedPicks(roster.roster_id, league) : [];
    for (const p of ownedPicks) picksValue += p.value || 0;
    const total = base.total + picksValue;
    return {
      ...base,
      total: Math.round(total * 10) / 10,
      breakdown: { ...base.breakdown, picks: Math.round(picksValue * 10) / 10 },
      ownedPicks,
      picksValue: Math.round(picksValue * 10) / 10,
    };
  }

  // ============================================================
  // Layout: sidebar + content
  // ============================================================
  const ROUTES = [
    { hash:'#dashboard',    label:'Dashboard',        icon:'◆',  section:'Overview' },
    { hash:'#action',       label:'Action Center',    icon:'!',  section:'Overview' },
    { hash:'#watch',        label:'What to Look For', icon:'◉',  section:'Tools' },
    { hash:'#trade',        label:'Trade Calculator', icon:'⇄',  section:'Tools' },
    { hash:'#sos',          label:'Strength of Sched', icon:'▦',  section:'Tools' },
    { hash:'#games',        label:'Games',            icon:'◐',  section:'Tools' },
    { hash:'#stats',        label:'Stats Lab',        icon:'∑',  section:'Tools' },
    { hash:'#draft',        label:'Draft Room',       icon:'▣',  section:'Tools' },
    { hash:'#prospects',    label:'Prospects',        icon:'◈',  section:'Tools' },
    { hash:'#rankings',     label:'My Rankings',      icon:'#',  section:'Reference' },
    { hash:'#experts',      label:'Experts',          icon:'◎',  section:'Reference' },
    { hash:'#strategy',     label:'Framework',        icon:'◇',  section:'Reference' },
    { hash:'#sources',      label:'Sources',          icon:'▶',  section:'Reference' },
    { hash:'#about',        label:'About',            icon:'?',  section:'Reference' },
  ];

  // ============================================================
  // Tabs + breadcrumb helpers (sub-route nesting)
  // ============================================================
  // Sub-tab is the trailing path segment after a primary view's required args.
  // `viewRoster` parses #roster/:lg/:rid/:tab, `viewLeague` parses #league/:id/:tab,
  // `viewDashboard` parses #dashboard/:tab. Always falls back to the first tab.
  function tabBar(tabs, activeKey, hashFor) {
    const active = activeKey || tabs[0].key;
    return h('nav', { class:'tab-bar', role:'tablist' },
      ...tabs.map(t => h('a', {
        href: hashFor(t.key),
        role: 'tab',
        'aria-selected': String(t.key === active),
        class: `tab${t.key === active ? ' active' : ''}`,
      },
        t.icon ? h('span', { class:'tab-icon' }, t.icon) : null,
        h('span', { class:'tab-label' }, t.label),
        t.count != null ? h('span', { class:'tab-count tnum' }, String(t.count)) : null,
      ))
    );
  }

  function breadcrumbs(crumbs) {
    // crumbs: [{ label, hash? }] - last one renders as plain text (current page)
    const out = h('nav', { class:'crumbs', 'aria-label':'Breadcrumb' });
    crumbs.forEach((c, i) => {
      const isLast = i === crumbs.length - 1;
      if (i > 0) out.appendChild(h('span', { class:'crumb-sep', 'aria-hidden':'true' }, '/'));
      if (c.hash && !isLast) out.appendChild(h('a', { href: c.hash, class:'crumb-link' }, c.label));
      else out.appendChild(h('span', { class:`crumb${isLast ? ' crumb-current' : ''}`, 'aria-current': isLast ? 'page' : null }, c.label));
    });
    return out;
  }

  function pageHeader({ eyebrow, title, sub, actions, badge }) {
    return h('div', { class:'page-header' },
      h('div', null,
        eyebrow ? h('div', { class:'page-eyebrow' }, eyebrow) : null,
        h('h1', { class:'page-title' }, title, badge ? h('span', { class:'page-title-badge' }, badge) : null),
        sub ? h('p', { class:'page-sub' }, sub) : null
      ),
      h('div', { class:'page-actions' }, ...(actions || []))
    );
  }

  function setMobileNav(open, returnFocus = false) {
    document.body.classList.toggle('nav-open', open);
    const toggle = document.getElementById('nav-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', String(open));
    if (open) requestAnimationFrame(() => document.querySelector('.sidebar-close')?.focus());
    else if (returnFocus && toggle) toggle.focus();
  }

  function renderSidebar() {
    const sidebar = $('#sidebar');
    sidebar.innerHTML = '';
    sidebar.appendChild(h('div', { class:'brand' },
      h('img', { class:'logo', src:'img/logo-192.png', alt:'', width:44, height:44 }),
      h('div', null,
        h('div', { class:'name' }, 'The Fantasy Hub'),
        h('div', { class:'sub' }, 'tdub1329 · 2026'),
      ),
      // Mobile close button (only visible <960px when expanded)
      h('button', {
        class:'sidebar-close',
        'aria-label':'Close navigation',
        onclick: () => setMobileNav(false, true)
      }, '×')
    ));

    // Determine which league is currently in context (for highlighting + pinning)
    const hash = location.hash || '#dashboard';
    let activeLgId = null;
    const m = hash.match(/^#(?:league|roster|trade|compare)\/([^\/]+)/);
    if (m) activeLgId = m[1];

    // Preserve original ROUTES order while grouping by section.
    const sections = [];
    const seen = new Map();
    for (const r of ROUTES) {
      if (!seen.has(r.section)) { seen.set(r.section, sections.length); sections.push({ name: r.section, items: [] }); }
      sections[seen.get(r.section)].items.push(r);
    }

    for (const sec of sections) {
      sidebar.appendChild(h('div', { class:'nav-section-title' }, sec.name));
      const nav = h('div', { class:'nav' });
      for (const r of sec.items) {
        const a = h('a', { href:r.hash, dataset:{ route: r.hash }, onclick: () => setMobileNav(false) },
          h('span', { class:'icon' }, r.icon),
          h('span', { class:'nav-label' }, r.label)
        );
        nav.appendChild(a);
      }
      sidebar.appendChild(nav);
    }

    // Quick league shortcuts. The active league (if any) gets a "context"
    // sub-list under it with sub-tabs for the workspace.
    const allLeagues = window.LEAGUES || [];
    const leagueGroups = [{ label: 'Leagues', leagues: allLeagues }].filter(g => g.leagues.length);
    for (const group of leagueGroups) {
    sidebar.appendChild(h('div', { class:'nav-section-title' }, group.label));
    const lnav = h('div', { class:'nav' });
    for (const lg of group.leagues) {
      const me = (lg.rosters || []).find(r => r.is_me);
      const myTeam = me ? me.team_name : lg.short_name;
      const isActive = lg.id === activeLgId;
      // The dot carries the format instead of a text badge: shape is the lineup
      // (diamond superflex, square TE premium, circle standard) and color is the
      // horizon (dynasty vs redraft). Superflex wins the shape when a league is
      // both, because a second QB slot moves more than a reception bonus.
      const tePrem = ((lg.scoring || {}).bonus_rec_te || 0) > 0;
      const shape = lg.is_superflex ? 'sf' : (tePrem ? 'tep' : 'std');
      const redraft = !isDynastyLeague(lg);
      // Shape and color alone are not an accessible label, so the words stay on
      // the link itself for hover and for a screen reader.
      const formatWords = [
        redraft ? 'Redraft' : 'Dynasty',
        lg.is_superflex ? 'superflex' : 'one QB',
        tePrem ? 'TE premium' : null,
        lg.is_idp ? 'IDP' : null,
        lg.platform === 'espn' ? 'ESPN' : null,
      ].filter(Boolean).join(', ');
      const a = h('a', {
        href:`#league/${lg.id}`,
        class: isActive ? 'is-context' : '',
        title: `${lg.name}: ${formatWords}`,
        onclick: () => setMobileNav(false),
      },
        h('span', { class:`nav-shape nav-shape-${shape} ${redraft ? 'is-redraft' : 'is-dynasty'}`,
                    'aria-hidden':'true' }),
        h('span', { class:'nav-label' }, myTeam),
        h('span', { class:'sr-only' }, formatWords),
      );
      lnav.appendChild(a);

      // Inline sub-nav for the active league: jump to its key sub-tabs.
      if (isActive && me) {
        const sub = h('div', { class:'nav-sub' },
          h('a', { href: `#league/${lg.id}`,          onclick: () => setMobileNav(false) },
            h('span', { class:'sub-bullet' }, '·'), 'Standings'),
          h('a', { href: `#league/${lg.id}/players`,  onclick: () => setMobileNav(false) },
            h('span', { class:'sub-bullet' }, '·'), 'Players'),
          lg.platform !== 'espn' ? h('a', { href: `#league/${lg.id}/transactions`, onclick: () => setMobileNav(false) },
            h('span', { class:'sub-bullet' }, '·'), 'Transactions') : null,
          // Same gate as the league's FAAB tab. Without a link here, the longest
          // match fell back to Standings and lit it while FAAB was open.
          (faabLeagueRecord(window.FAAB_ARCHETYPES, lg)?.dims?.situation || []).length
            ? h('a', { href: `#league/${lg.id}/faab`, onclick: () => setMobileNav(false) },
              h('span', { class:'sub-bullet' }, '·'), 'FAAB') : null,
          h('a', { href: `#roster/${lg.id}/${me.roster_id}/snapshot`, onclick: () => setMobileNav(false) },
            h('span', { class:'sub-bullet' }, '·'), 'My Roster'),
          h('a', { href: `#trade/${lg.id}`,           onclick: () => setMobileNav(false) },
            h('span', { class:'sub-bullet' }, '·'), 'Trade Lab'),
        );
        lnav.appendChild(sub);
      }
    }
    sidebar.appendChild(lnav);
    }

    // Data freshness footer: staleest critical dataset age. Amber if >3 days old.
    const fr = dataFreshness();
    if (fr && fr.stalest) {
      const tip = fr.rows.map(r => `${DATA_LABEL[r.name] || r.name}: ${r.ageLabel} ago`).join('\n');
      sidebar.appendChild(h('div', { class:'data-fresh', title: `Last updated:\n${tip}`, onclick:()=>navigate('#about') },
        h('span', { class:'data-fresh-dot', style:{ background: fr.stale ? 'var(--amber)' : 'var(--green)' } }),
        h('span', { class:'data-fresh-label' }, fr.stale ? 'Refresh' : 'Data'),
        h('span', { class:'data-fresh-age tnum' }, `${fr.stalest.ageLabel} ago`),
      ));
    }
  }

  function setActiveNav() {
    const hash = location.hash || '#dashboard';
    for (const a of $$('#sidebar .nav a')) {
      const href = a.getAttribute('href');
      // Match nested routes: e.g., #roster/123/45 should keep `#roster` and the
      // owning league active. We compare path prefixes after the # to avoid
      // false positives like `#leagues` matching `#league`.
      const isActive = (() => {
        if (!href) return false;
        if (href === hash) return true;
        const hp = href.replace(/^#/, '').split('/');
        const cp = hash.replace(/^#/, '').split('/');
        // every segment in href must equal the corresponding segment in hash
        for (let i = 0; i < hp.length; i++) {
          if (hp[i] !== cp[i]) return false;
        }
        return true;
      })();
      a.classList.toggle('active', isActive);
      if (isActive) a.dataset.navDepth = String(href.replace(/^#/, '').split('/').length);
      else delete a.dataset.navDepth;
    }
    // Longest match wins, within each nav group. Standings owns the bare
    // #league/<id> URL while its siblings are #league/<id>/players and so on, so
    // prefix matching lit Standings up on every sub-page of the league. Scoping
    // it per group keeps the league's own parent link (a different container)
    // highlighted as context, which is the one place prefix matching is wanted.
    const groups = new Map();
    for (const a of $$('#sidebar .nav a.active')) {
      const g = a.parentElement;
      const d = Number(a.dataset.navDepth || 0);
      groups.set(g, Math.max(groups.get(g) || 0, d));
    }
    for (const a of $$('#sidebar .nav a.active')) {
      if (Number(a.dataset.navDepth || 0) < groups.get(a.parentElement)) a.classList.remove('active');
    }
  }

  // ============================================================
  // Common cell renderers
  // ============================================================
  function pillCategory(category) {
    if (!category) return null;
    return h('span', { class:`pill ${category}` }, window.CATEGORY_LABELS[category] || category);
  }
  // Tier chip styling is category-aware: only cornerstone/foundational/upside_premier
  // get the gold/violet/sky/mint hue treatment. Within mainstay+ categories the
  // tier letter still appears (for the framework completeness) but rendered in a
  // muted gray so an "S within mainstay" doesn't look like an "S cornerstone."
  function tierChip(tier, category) {
    if (!tier) return null;
    const isElite = ['cornerstone','foundational','upside_premier'].includes(category);
    return h('span', { class:`tier-chip ${tier}${isElite || category == null ? '' : ' muted'}` }, tier);
  }
  function posChip(pos) {
    return h('span', { class:`pos-chip ${pos}` }, pos);
  }
  // KeepTradeCut's own codes. build_ktc.py maps them now; this covers an older
  // ktc.js and any row whose team falls back to the ranked entry.
  const KTC_TEAM = { SFO:'SF', NOS:'NO', KCC:'KC', JAC:'JAX', GBP:'GB', TBB:'TB', LVR:'LV', NEP:'NE' };
  function teamChip(team) {
    return h('span', { class:'team-chip' }, KTC_TEAM[team] || team || 'FA');
  }
  function rookieBadge(p) {
    return p.rookie ? h('span', { class:'badge rookie' }, 'Rookie') : null;
  }
  function uncertainBadge(p) {
    return p.uncertain ? h('span', { class:'badge uncertain', title:'Verify against source' }, 'Verify') : null;
  }
  function depBadge(p) {
    return p.subtype === 'depreciating_pillar' ? h('span', { class:'badge depreciating', title:'Depreciating pillar' }, 'DP') : null;
  }

  // ---- Expert ranking columns ------------------------------------------------
  // A "source" is one analyst's ranking set, shown as a context column beside
  // players. Registry = window.EXPERT_RANKINGS (data/expert-rankings.js) plus the
  // generated Jacob Gibbs set, adapted to the same shape. Add a source to the
  // registry to add a column; toggle visibility per source on the Sources page.
  // Match order: sleeperId, then normalized name. scope 'overall' cells show the
  // overall rank (#N); positional sources (scope 'RB'/'WR'/…) show pos+posRank.
  let _expertSources = null;
  // Depth and tier count come off the board, never a literal: he republishes it and
  // the old copy read "175 in 16 tiers" for a 200-in-17 board.
  function gibbsBoardShape(){
    const ps = (window.JACOB_GIBBS_RANKINGS||{}).players || [];
    const tiers = new Set(ps.map(p=>p.tier)).size;
    return { count: ps.length, tiers, text: `${ps.length} in ${tiers} tiers` };
  }

  // Gibbs's REST OF SEASON positional board, straight from his X posts.
  // Separate from JACOB_GIBBS_RANKINGS, which is his OVERALL draft board: this
  // one is per-position, has no tiers, and he refreshes it weekly. His
  // FantasyPros board lagged this by a day when it was captured, and the
  // positional ROS boards never appear there at all.
  //
  // Every rank on the site is PPR. GIBBS_WEEK is his week board, which he posts
  // titled PPR, so it shows as is. His ROS board is half-PPR (his cards say
  // so), so the table shows GIBBS_PPR_ROS, converted by build_gibbs_ppr.py,
  // under a starred header. One lookup serves every board.
  const _gibbsIdx = new Map();
  function gibbsBoardRank(board, sleeperId) {
    const data = window[board];
    if (!data) return null;
    if (!_gibbsIdx.has(board)) {
      const m = new Map();
      for (const [pos, rows] of Object.entries(data.positions || {})) {
        for (const r of rows) if (r.sleeperId) m.set(String(r.sleeperId), { ...r, pos });
      }
      _gibbsIdx.set(board, m);
    }
    return _gibbsIdx.get(board).get(String(sleeperId)) || null;
  }
  const gibbsWeekRank = (id) => gibbsBoardRank('GIBBS_WEEK', id);
  const gibbsRosPprRank = (id) => gibbsBoardRank('GIBBS_PPR_ROS', id);

  function expertSources() {
    if (_expertSources) return _expertSources;
    // Every rank column is PPR. His half-PPR preseason board (JACOB_GIBBS_RANKINGS)
    // is not offered as a column; the converted `gibbs-ppr-*` source, labelled
    // with *, covers it, and the half board still drives gibbs-tiers.html.
    const list = [];
    for (const s of (window.EXPERT_RANKINGS || [])) list.push(s);
    return (_expertSources = list);
  }
  function ensureExpertColDefaults() {
    // One-shot: the half-PPR Gibbs column used to default ON, so a saved
    // `true` would survive the default change forever. Retire it once, then
    // leave the toggle alone so turning it back on in Sources sticks.
    if (!state.settings.retiredGibbsHalfCol) {
      state.settings.retiredGibbsHalfCol = true;
      state.settings.enabledExpertCols.gibbs = false;
      saveSettings();
    }
    for (const s of expertSources()) {
      if (state.settings.enabledExpertCols[s.id] === undefined) {
        state.settings.enabledExpertCols[s.id] = s.defaultEnabled !== false;
      }
    }
  }
  function activeExpertSources() {
    return expertSources().filter(s => state.settings.enabledExpertCols[s.id] !== false);
  }
  const _expertIdx = new Map();
  function expertIndex(src) {
    let idx = _expertIdx.get(src.id);
    if (idx) return idx;
    const byId = new Map(), byName = new Map();
    for (const p of src.players || []) {
      if (p.sleeperId) byId.set(String(p.sleeperId), p);
      if (!byName.has(norm(p.name))) byName.set(norm(p.name), p);
    }
    idx = { byId, byName };
    _expertIdx.set(src.id, idx);
    return idx;
  }
  function expertEntry(src, name, sleeperId) {
    const idx = expertIndex(src);
    return (sleeperId && idx.byId.get(String(sleeperId))) || idx.byName.get(norm(name)) || null;
  }
  // Sort value: overall rank if present, else positional rank. Lower = better.
  function expertRankOf(src, name, sleeperId) {
    const e = expertEntry(src, name, sleeperId);
    if (!e) return null;
    return e.rank != null ? e.rank : (e.posRank != null ? e.posRank : null);
  }
  function ymd(s) { const p = (s || '').split('-'); return p.length === 3 ? `${Number(p[1])}/${Number(p[2])}` : (s || ''); }
  function expertColLabel(src) {
    return (src.label || src.expert || src.id) + (src.dateSuffix && src.updatedAt ? ' ' + ymd(src.updatedAt) : '');
  }
  function expertHeaders() {
    return activeExpertSources().map(src => {
      const title = `${src.expert || src.label} · ${src.title || 'rankings'}${src.updatedAt ? ', updated ' + src.updatedAt : ''}`;
      return h('th', { class:'right gibbs-rank-col expert-rank-col', title },
        h('span', { 'aria-label': title }, expertColLabel(src)));
    });
  }
  function expertCellText(src, e) {
    if (!e) return null;
    if (src.scope && src.scope !== 'overall') return `${e.pos}${e.posRank != null ? e.posRank : ''}`;
    return `#${e.rank}`;
  }
  function expertCells(name, sleeperId) {
    return activeExpertSources().map(src => {
      const e = expertEntry(src, name, sleeperId);
      const txt = expertCellText(src, e);
      const overall = e && e.rank != null;
      const title = e
        ? `${src.expert || src.label}: ${overall ? '#' + e.rank + ' overall' : e.pos + (e.posRank != null ? e.posRank : '')}` +
          `${overall && e.pos ? `, ${e.pos}${e.posRank != null ? e.posRank : ''}` : ''}` +
          `${e.tier ? `, tier ${e.tier}` : ''}${src.updatedAt ? `, updated ${src.updatedAt}` : ''}${e.note ? ` · ${e.note}` : ''}`
        : `Not ranked by ${src.expert || src.label}`;
      return h('td', { class:'right tnum gibbs-rank-col expert-rank-col', title },
        txt ? txt : h('span', { class:'muted' }, '.'));
    });
  }

  function playerRow(p, opts={}) {
    const click = () => openPlayerDetail(p.name, p._sleeperId);
    return h('div', { class:'player-row', onclick: click },
      tierChip(p.tier, p.category),
      h('div', { class:'meta' },
        h('div', { class:'name' }, p.name),
        h('div', { class:'sub' },
          posChip(p.pos),
          teamChip(p.team),
          p.age ? h('span', { class:'muted' }, `age ${p.age}`) : null,
          rookieBadge(p),
          depBadge(p),
          uncertainBadge(p)
        )
      ),
      opts.right ? opts.right : null
    );
  }

  // ============================================================
  // ROUTE: Dashboard
  // ============================================================
  function viewDashboard(tabArg) {
    const main = $('#main');
    main.innerHTML = '';
    const _validTabs = ['overview','trajectory','market','cornerstones'];
    if (tabArg === 'leagues') history.replaceState(null, '', '#dashboard');
    const tab = _validTabs.includes(tabArg) ? tabArg : 'overview';

    main.appendChild(h('div', { class:'page-header' },
      h('div', null,
        h('div', { class:'page-eyebrow' }, 'OVERVIEW'),
        h('h1', { class:'page-title' }, 'Dashboard'),
        h('p', { class:'page-sub' }, 'All leagues, roster strength, and weekly decisions in one place.')
      )
    ));

    main.appendChild(tabBar([
      { key:'overview',     label:'Overview',     icon:'◆' },
      { key:'trajectory',   label:'Trajectory',   icon:'↗' },
      { key:'market',       label:'Market',       icon:'⇅' },
      { key:'cornerstones', label:'Cornerstones', icon:'★' },
    ], tab, (k) => k === 'overview' ? '#dashboard' : `#dashboard/${k}`));

    const myRosters = [];
    for (const lg of window.LEAGUES || []) {
      const me = lg.rosters.find(r => r.is_me);
      if (!me) continue;
      myRosters.push({ league: lg, roster: me });
    }

    if (tab === 'overview') {
      main.appendChild(h('h2', { class:'page-title', style:{ fontSize:'1.2rem', marginTop:'8px' } }, 'My Leagues'));
      leaguesComparison(main);
    }

    const cornerstones = [];
    for (const { league, roster } of myRosters) {
      const s = computeRosterStrength(roster, league);
      for (const rp of s.rankedPlayers) {
        if (rp.ranked.category !== 'cornerstone') continue;
        cornerstones.push({ league, player: rp.ranked, sleeper: rp.sleeper, value: rp.value });
      }
    }
    // Sleeper Market: Risers / Fallers panel
    if (tab === 'market' && window.SLEEPER_MARKET) {
      const market = window.SLEEPER_MARKET;
      // DSTs and kickers are not dynasty assets (CLAUDE.md), so they never list here.
      const top = (arr, n=8) => arr.filter(m => !['DEF', 'K'].includes((window.PLAYERS[m.player_id] || {}).pos)).slice(0, n);
      const renderMover = (m, sign) => {
        const sp = window.PLAYERS[m.player_id];
        const ranked = sp ? (rankIndex().bySleeperId.get(m.player_id) || rankIndex().byName.get(norm(sp.name))) : null;
        return h('div', { class:'mover-row', onclick: () => sp ? openPlayerDetail(sp.name, m.player_id) : null },
          h('span', { class:'mover-arrow', style:{ color: sign > 0 ? 'var(--green)' : 'var(--red)' } }, sign > 0 ? '↑' : '↓'),
          h('div', { class:'mover-meta' },
            h('div', { class:'name' }, sp ? sp.name : `Player ${m.player_id}`),
            h('div', { class:'tip' },
              sp ? `${sp.pos} · ${sp.team || 'FA'}` : '',
              ranked ? ` · ${window.CATEGORY_LABELS[ranked.category]} ${ranked.tier}` : ''
            )
          ),
          h('span', { class:'tnum tip' }, fmt.num(m.count))
        );
      };
      main.appendChild(h('h2', { class:'page-title', style:{ fontSize:'1.2rem', marginTop:'24px' } },
        'Sleeper Market, Risers & Fallers',
        h('span', { class:'tip', style:{ fontSize:'.78rem', fontWeight:400, marginLeft:'10px' } }, '7-day adds/drops across Sleeper')
      ));
      main.appendChild(h('div', { class:'card-grid cols-2' },
        h('div', { class:'card' },
          h('div', { class:'card-title' }, h('span', { style:{ color:'var(--green)' } }, '↑ Trending Adds')),
          ...top(market.risers).map(m => renderMover(m, 1))
        ),
        h('div', { class:'card' },
          h('div', { class:'card-title' }, h('span', { style:{ color:'var(--red)' } }, '↓ Trending Drops')),
          ...top(market.fallers).map(m => renderMover(m, -1))
        )
      ));
    } // end market tab (sleeper market)

    if (tab === 'overview') {
    // ===== Positional Grade Heatmap =====
    // Replaces the plain table with a visual heatmap. Each cell is a horizontal
    // bar sized to the grade and tinted by category color; the number sits on
    // top in tabular nums. Lets the user scan strong/weak positions across
    // leagues in one glance.
    main.appendChild(h('h2', { class:'page-title', style:{ fontSize:'1.2rem', marginTop:'24px' } }, 'Positional Grade Heatmap'));
    const heatmap = h('div', { class:'heatmap' });
    // Header row. New layout: per-position averages from slot-by-slot grades,
    // plus a dedicated FLEX column, plus Bench / Draft / Overall.
    heatmap.appendChild(h('div', { class:'heatmap-row heatmap-head' },
      h('div', { class:'heatmap-cell heatmap-leaguecell' }, 'League'),
      ...['QB','RB','WR','TE','FLEX','Bench','Draft'].map(p => h('div', { class:'heatmap-cell' }, p)),
      h('div', { class:'heatmap-cell heatmap-overallcell' }, 'Overall'),
    ));
    for (const { league, roster } of myRosters) {
      const players = getRosterPlayers(roster);
      const slotResult = gradeLineupSlots(players, league);
      const g = {
        QB: gradePositionFromSlots(slotResult, 'QB') || gradePosition(players, 'QB', league),
        RB: gradePositionFromSlots(slotResult, 'RB') || gradePosition(players, 'RB', league),
        WR: gradePositionFromSlots(slotResult, 'WR') || gradePosition(players, 'WR', league),
        TE: gradePositionFromSlots(slotResult, 'TE') || gradePosition(players, 'TE', league),
        FLEX: gradePositionFromSlots(slotResult, 'FLEX') || gradePositionFromSlots(slotResult, 'SF') || 0,
        Bench: gradeBench(players, league),
        Draft: isDynastyLeague(league) ? gradeDraftCapital(roster, league.id) : null,
      };
      const overall = slotResult.overall || ((g.QB + g.RB*1.1 + g.WR*1.2 + g.TE*0.8 + g.Bench*0.5 + (g.Draft || 0)*0.4) / 5);
      const heatCell = (key, val) => {
        if (val == null) return h('div', {
          class:'heatmap-cell heatmap-grade',
          dataset:{ gradeKey:key, grade:'na' },
          title:'Not used in redraft',
        }, h('span', { class:'heatmap-num tip' }, 'N/A'));
        const color = val >= 7.5 ? 'var(--green)' : val >= 5.5 ? 'var(--amber)' : val >= 3.5 ? 'var(--cat-vet)' : 'var(--red)';
        const pct = Math.max(4, Math.min(100, val*10));
        const title = !isDynastyLeague(league)
          ? `${key}: ${val.toFixed(1)}/10. Redraft grade compares rest-of-season points with the matching lineup reference.`
          : `${key}: ${val.toFixed(1)}/10.`;
        return h('div', { class:'heatmap-cell heatmap-grade', dataset:{ gradeKey:key, grade:String(val) }, title },
          h('div', { class:'heatmap-bar', style:{ width: `${pct}%`, background: color } }),
          h('span', { class:'heatmap-num tnum', style:{ color } }, val.toFixed(1)),
        );
      };
      const overallColor = overall >= 7.5 ? 'var(--green)' : overall >= 5.5 ? 'var(--amber)' : 'var(--red)';
      heatmap.appendChild(h('div', {
        class:'heatmap-row',
        dataset:{ leagueId:String(league.id), format:isDynastyLeague(league) ? 'dynasty' : 'redraft' },
        onclick: () => navigate(`#roster/${league.id}/${roster.roster_id}`),
      },
        h('div', { class:'heatmap-cell heatmap-leaguecell' },
          h('div', { class:'heatmap-leaguename' }, league.short_name),
          h('div', { class:'heatmap-team tip' }, roster.team_name + (league.is_superflex ? ' · SF' : league.is_idp ? ' · IDP' : '')),
        ),
        heatCell('QB', g.QB), heatCell('RB', g.RB), heatCell('WR', g.WR), heatCell('TE', g.TE), heatCell('FLEX', g.FLEX), heatCell('Bench', g.Bench), heatCell('Draft', g.Draft),
        h('div', { class:'heatmap-cell heatmap-overallcell tnum', dataset:{ gradeKey:'Overall', grade:String(overall) }, style:{ color: overallColor } }, overall.toFixed(1)),
      ));
    }
    main.appendChild(heatmap);
    } // end overview tab (heatmap)

    if (tab === 'trajectory') {
      main.appendChild(h('h2', { class:'page-title', style:{ fontSize:'1.2rem', marginTop:'8px' } },
        'Roster Value Trajectory',
        h('span', { class:'tip', style:{ fontSize:'.78rem', fontWeight:400, marginLeft:'10px' } },
          `${CURRENT_SEASON} through ${CURRENT_SEASON + PROJECTION_YEARS - 1}, projected with position-aware aging curves`)
      ));

      // Build year labels once
      const yearLabels = [];
      for (let y = 0; y < PROJECTION_YEARS; y++) yearLabels.push(String(CURRENT_SEASON + y));

      // Compute curves for every league. Stash so we can scale all axes to a
      // common max for cross-league readability.
      const leagueCurves = myRosters.map(({ league, roster }) => {
        const rp = getRosterPlayers(roster);
        const curve = rosterValueCurve(rp, league);
        return { league, roster, rp, curve };
      });
      const globalMax = Math.max(1, ...leagueCurves.flatMap(lc => lc.curve.totals));

      // ===== Aggregate Present vs Future bar (across all my rosters) =====
      const empire = leagueCurves.reduce((acc, lc) => {
        for (let y = 0; y < PROJECTION_YEARS; y++) acc.totals[y] += lc.curve.totals[y];
        acc.pv += lc.curve.pv;
        acc.fv += lc.curve.fv;
        return acc;
      }, { totals: new Array(PROJECTION_YEARS).fill(0), pv: 0, fv: 0 });
      const pvShare = empire.pv / (empire.pv + empire.fv || 1);

      const pvFvBar = h('div', { class:'pv-fv-bar' },
        h('div', { class:'pv-fv-fill present', style:{ width: `${(pvShare * 100).toFixed(1)}%` } },
          h('span', { class:'pv-fv-label' }, `Present ${(pvShare * 100).toFixed(0)}%`),
        ),
        h('div', { class:'pv-fv-fill future', style:{ width: `${((1 - pvShare) * 100).toFixed(1)}%` } },
          h('span', { class:'pv-fv-label' }, `Future ${((1 - pvShare) * 100).toFixed(0)}%`),
        ),
      );
      main.appendChild(h('section', { class:'empire' },
        h('div', { class:'empire-head' },
          h('div', { class:'empire-title' }, 'Empire: Present vs Future'),
          h('div', { class:'empire-meta' },
            `${fmt.decimal(empire.pv, 0)} PV`,
            h('span', { class:'sep' }, '·'),
            `${fmt.decimal(empire.fv, 0)} FV (weighted ${yearLabels.slice(1).join(', ')})`,
          ),
        ),
        pvFvBar,
        h('div', { class:'tip', style:{ marginTop:'8px' } },
          'PV (Present Value) = ' + CURRENT_SEASON + ' projected value. FV (Future Value) = decay-weighted average of ' +
          (PROJECTION_YEARS - 1) + ' subsequent seasons. Aging curves are position-specific (RBs cliff hard at 27, WRs gentler at 30, QBs longest peak, TEs slow decline).'
        ),
      ));

      // ===== Per-league trajectory rows =====
      const tableWrap = h('div', { class:'traj-grid' });
      tableWrap.appendChild(h('div', { class:'traj-row traj-head' },
        h('div', { class:'traj-cell traj-leaguecell' }, 'League · Team'),
        h('div', { class:'traj-cell traj-pvcell' }, 'PV / FV'),
        h('div', { class:'traj-cell traj-sparkcell' }, yearLabels.map(y => h('span', { class:'traj-year tnum' }, y))),
        h('div', { class:'traj-cell traj-arrowcell' }, 'Δ ' + CURRENT_SEASON + '→' + (CURRENT_SEASON + PROJECTION_YEARS - 1)),
      ));
      for (const { league, roster, curve } of leagueCurves) {
        const last = curve.totals[PROJECTION_YEARS - 1];
        const first = curve.totals[0];
        const delta = last - first;
        const deltaPct = first > 0 ? (delta / first) * 100 : 0;
        const deltaColor = delta >= 0 ? 'var(--green)' : delta < -first * 0.20 ? 'var(--red)' : 'var(--amber)';
        const myPvShare = curve.pv / (curve.pv + curve.fv || 1);
        const archetypeColor = myPvShare > 0.58 ? 'var(--cat-vet)' : myPvShare < 0.42 ? 'var(--green)' : 'var(--amber)';
        const archetypeLabel = myPvShare > 0.58 ? 'WIN-NOW' : myPvShare < 0.42 ? 'FUTURE' : 'BALANCED';

        // Sparkline bars: one column per projected year, height scaled to globalMax
        const spark = h('div', { class:'traj-spark' },
          ...curve.totals.map((v, i) => {
            const pct = Math.max(2, (v / globalMax) * 100);
            const isPresent = i === 0;
            return h('div', { class:'traj-bar-wrap', title: `${yearLabels[i]}: ${fmt.decimal(v, 0)}` },
              h('div', {
                class: `traj-bar ${isPresent ? 'present' : 'future'}`,
                style:{ height: pct + '%' }
              }),
              h('div', { class:'traj-bar-val tnum' }, fmt.decimal(v, 0)),
            );
          })
        );

        tableWrap.appendChild(h('div', {
          class:'traj-row',
          onclick: () => navigate(`#roster/${league.id}/${roster.roster_id}`),
        },
          h('div', { class:'traj-cell traj-leaguecell' },
            h('div', { class:'traj-leaguename' }, league.short_name),
            h('div', { class:'traj-team tip' }, roster.team_name + (league.is_superflex ? ' · SF' : league.is_idp ? ' · IDP' : '')),
          ),
          h('div', { class:'traj-cell traj-pvcell' },
            h('div', { class:'traj-pvfv-mini' },
              h('div', { class:'traj-pvfv-fill present', style:{ width: `${(myPvShare * 100).toFixed(0)}%` } }),
              h('div', { class:'traj-pvfv-fill future',  style:{ width: `${((1 - myPvShare) * 100).toFixed(0)}%` } }),
            ),
            h('div', { class:'tip', style:{ marginTop:'4px', color: archetypeColor, fontWeight:600 } },
              archetypeLabel,
              h('span', { class:'muted', style:{ marginLeft:'6px', fontWeight:400, color:'var(--fg-3)' } },
                `${fmt.decimal(curve.pv, 0)} · ${fmt.decimal(curve.fv, 0)}`),
            ),
          ),
          h('div', { class:'traj-cell traj-sparkcell' }, spark),
          h('div', { class:'traj-cell traj-arrowcell tnum', style:{ color: deltaColor, fontWeight: 700 } },
            (delta >= 0 ? '+' : '') + fmt.decimal(delta, 0),
            h('div', { class:'tip', style:{ marginTop:'2px' } }, (deltaPct >= 0 ? '+' : '') + deltaPct.toFixed(0) + '%'),
          ),
        ));
      }
      main.appendChild(tableWrap);

      // ===== Aging-cliff watchlist: who loses the most value over the window =====
      const allRanked = [];
      for (const { league, rp } of leagueCurves) {
        for (const r of rp) {
          if (!r.ranked) continue;
          const curve = projectPlayerValue(r.ranked, league);
          allRanked.push({ p: r.ranked, league, curve, drop: curve[0] - curve[PROJECTION_YEARS - 1] });
        }
      }
      allRanked.sort((a, b) => b.drop - a.drop);
      const watch = allRanked.slice(0, 8);
      if (watch.length) {
        main.appendChild(h('h2', { class:'page-title', style:{ fontSize:'1.1rem', marginTop:'20px' } }, 'Aging-Cliff Watchlist'));
        main.appendChild(h('div', { class:'tip', style:{ marginTop:'-4px', marginBottom:'8px' } },
          `Ranked players whose ${CURRENT_SEASON}→${CURRENT_SEASON + PROJECTION_YEARS - 1} projected value falls the most. Lock in trade value before the cliff.`
        ));
        const watchCard = h('div', { class:'card', style:{ padding:0, overflow:'hidden' } });
        const watchTbl = h('table', { class:'data snug' },
          h('thead', null, h('tr', null,
            h('th', null, 'Player'),
            ...expertHeaders(),
            h('th', null, 'Age · League'),
            h('th', { class:'right' }, CURRENT_SEASON + ' Val'),
            h('th', { class:'right' }, (CURRENT_SEASON + PROJECTION_YEARS - 1) + ' Val'),
            h('th', { class:'right' }, 'Drop'),
          )),
          h('tbody', null, ...watch.map(w => h('tr', { onclick: () => openPlayerDetail(w.p.name, w.p._sleeperId) },
            h('td', null, h('div', { class:'name-cell' },
              posChip(w.p.pos),
              h('span', { class:'name' }, w.p.name),
            )),
            ...expertCells(w.p.name, w.p._sleeperId),
            h('td', null, `age ${w.p.age || '?'} · ${w.league.short_name}`),
            h('td', { class:'right tnum' }, fmt.decimal(w.curve[0], 0)),
            h('td', { class:'right tnum', style:{ color: 'var(--fg-2)' } }, fmt.decimal(w.curve[PROJECTION_YEARS - 1], 0)),
            h('td', { class:'right tnum', style:{ color: 'var(--red)', fontWeight: 700 } },
              '−' + fmt.decimal(w.drop, 0)),
          )))
        );
        watchCard.appendChild(watchTbl);
        main.appendChild(watchCard);
      }
    } // end trajectory tab

    if (tab === 'cornerstones') {
    // Cornerstone summary
    main.appendChild(h('h2', { class:'page-title', style:{ fontSize:'1.2rem', marginTop:'8px' } }, 'Your Cornerstones'));
    cornerstones.sort((a,b) => b.value - a.value);
    if (!cornerstones.length) {
      main.appendChild(h('div', { class:'empty' }, 'No Cornerstones detected yet, check your roster mappings.'));
    } else {
      const cs = h('div', { class:'card' });
      const tbl = h('table', { class:'data snug' },
        h('thead', null, h('tr', null,
          h('th', null, 'Player'),
          ...expertHeaders(),
          h('th', null, 'Tier'),
          h('th', null, 'League'),
          h('th', { class:'right' }, 'Value'),
        )),
        h('tbody', null, ...cornerstones.map(c => {
          const sup = c.league.is_superflex && window.SUPERFLEX_POS_MULT[c.player.pos] > 1;
          return h('tr', { onclick:()=>openPlayerDetail(c.player.name, c.player._sleeperId) },
            h('td', null, h('div', { class:'name-cell' },
              posChip(c.player.pos), teamChip(c.player.team),
              h('span', { class:'name' }, c.player.name)
            )),
            ...expertCells(c.player.name, c.player._sleeperId),
            h('td', null, ourTierChip(c.player._sleeperId) || tierChip(c.player.tier, c.player.category)),
            h('td', null, c.league.short_name, sup ? h('span', { class:'badge', style:{ marginLeft:'6px' } }, 'SF Bonus') : null),
            h('td', { class:'right tnum' }, fmt.decimal(c.value, 1))
          );
        }))
      );
      cs.appendChild(tbl);
      main.appendChild(cs);
    }
    } // end cornerstones tab
  }
  // Auto-generates 3-4 narrative insight cards from the roster set.
  function insightsStrip(myRosters) {
    if (!myRosters || !myRosters.length) return h('div');
    const insights = [];

    // 1. Strongest position across leagues
    let best = null, worst = null;
    for (const { league, roster } of myRosters) {
      const rp = getRosterPlayers(roster);
      for (const pos of ['QB','RB','WR','TE']) {
        const g = gradePosition(rp, pos, league);
        if (!best || g > best.g) best = { g, pos, league: league.short_name };
        if (!worst || g < worst.g) worst = { g, pos, league: league.short_name };
      }
    }
    if (best) insights.push({
      icon:'★', tone:'good',
      label:'Strongest position',
      body:`${best.pos} in ${best.league}, ${best.g.toFixed(1)} of 10`,
    });
    if (worst) insights.push({
      icon:'⚠', tone:'bad',
      label:'Needs attention',
      body:`${worst.pos} in ${worst.league}, ${worst.g.toFixed(1)} of 10`,
    });

    // 2. Trending player I own (or nearly own)
    if (window.SLEEPER_MARKET && window.SLEEPER_MARKET.risers) {
      const myPids = new Set();
      for (const { roster } of myRosters) for (const pid of (roster.players || [])) myPids.add(pid);
      const myRiser = window.SLEEPER_MARKET.risers.find(m => myPids.has(m.player_id));
      if (myRiser) {
        const sp = window.PLAYERS[myRiser.player_id];
        insights.push({
          icon:'↑', tone:'good',
          label:'Owned riser',
          body: sp ? `${sp.name}, +${fmt.num(myRiser.count)} adds this week` : `Trending player on your roster`,
        });
      }
      const topFaller = window.SLEEPER_MARKET.fallers.find(m => myPids.has(m.player_id));
      if (topFaller) {
        const sp = window.PLAYERS[topFaller.player_id];
        insights.push({
          icon:'↓', tone:'bad',
          label:'Owned faller',
          body: sp ? `${sp.name}, ${fmt.num(topFaller.count)} drops this week` : `Falling player on your roster`,
        });
      }
    }

    // 3. Stance summary
    const stances = myRosters.map(({ league, roster }) => {
      const rp = getRosterPlayers(roster);
      const s = computeRosterStrength(roster, league);
      const rk = rankInLeague(league, roster.roster_id);
      const cs = s.rankedPlayers.filter(p => p.ranked.category === 'cornerstone').length;
      const tier = classifyValueTier(s, rk, league.total_rosters, cs);
      const arch = classifyValueArchetype(rp);
      return { league: league.short_name, tier: tier.tier, arch: arch.tag, stance: stanceOf(tier.tier, arch.tag) };
    });
    const contendCount = stances.filter(s => s.stance === 'contend').length;
    const rebuildCount = stances.filter(s => s.stance === 'rebuild').length;
    if (contendCount && contendCount === stances.length) {
      insights.push({ icon:'⚡', tone:'good', label:'All systems contending', body:'Every roster is in win-now mode. Trade futures for established starters.' });
    } else if (rebuildCount && rebuildCount === stances.length) {
      insights.push({ icon:'⏳', tone:'neutral', label:'Full rebuild', body:'Every roster is rebuilding. Stack picks, sell aging vets, fade temptation to chase.' });
    } else {
      const detail = stances.map(s => `${s.league}: ${s.tier}`).join(', ');
      insights.push({ icon:'◇', tone:'neutral', label:'Mixed stance', body: detail });
    }

    return h('div', { class:'insights' },
      ...insights.slice(0, 4).map(it => h('div', { class:`insight insight-${it.tone}` },
        h('div', { class:'insight-icon' }, it.icon),
        h('div', { class:'insight-meta' },
          h('div', { class:'insight-label' }, it.label),
          h('div', { class:'insight-body' }, it.body),
        )
      ))
    );
  }

  function kpiCard(label, value, sub) {
    return h('div', { class:'card' },
      h('div', { class:'stat-num' }, value),
      h('div', { class:'stat-label' }, label),
      sub ? h('div', { class:'stat-delta', style:{ color:'var(--fg-3)' } }, sub) : null,
    );
  }

  // ============================================================
  // ROUTE: Rankings
  // ============================================================
  const RANKINGS_FILTER = { pos:'ALL', cat:'ALL', q:'', hideUncertain:false, order:'mine' };
  // Short league tag for a one-line chip row: initials, skipping filler words
  // after the first ("Password is taco" is PT, not PIT, which reads as a team).
  // A one-word name keeps itself (yuH).
  function leagueCode(name) {
    const words = String(name || '').trim().split(/\s+/)
      .filter((w, i) => i === 0 || !/^(is|of|the|a|an|and)$/i.test(w));
    return words.length > 1 ? words.map(w => w[0]).join('').toUpperCase() : (words[0] || '');
  }

  function viewRankings() {
    const main = $('#main');
    let focusPid = null;
    main.innerHTML = '';
    main.appendChild(h('div', { class:'page-header' },
      h('div', null,
        h('div', { class:'page-eyebrow' }, 'PLAYERS'),
        h('h1', { class:'page-title' }, 'My Rankings'),
        h('p', { class:'page-sub' }, 'Your saved player order, seeded from Gibbs full-PPR. Edit ranks here without starting a draft.')
      ),
      h('div', { class:'page-actions' },
        h('a', { href:'#sources' }, h('button', { class:'ghost' }, 'Manage Sources'))
      )
    ));

    // Filter bar
    const filterBar = h('div', { class:'filters' });
    const search = h('input', { type:'search', placeholder:'Search players', value: RANKINGS_FILTER.q,
      oninput: (e)=>{ RANKINGS_FILTER.q = e.target.value.trim(); renderList(); }
    });
    filterBar.appendChild(h('div', { class:'group' }, h('label', null, 'Search'), search));

    const orderBtns = h('div', { class:'toggle-group' },
      h('button', { class:`toggle ${RANKINGS_FILTER.order === 'mine' ? 'active' : ''}`,
        onclick: () => { RANKINGS_FILTER.order = 'mine'; viewRankings(); } }, 'Mine'),
      h('button', { class:`toggle ${RANKINGS_FILTER.order === 'consensus' ? 'active' : ''}`,
        onclick: () => { RANKINGS_FILTER.order = 'consensus'; viewRankings(); } }, 'Consensus'));
    filterBar.appendChild(h('div', { class:'group' }, h('label', null, 'Order'), orderBtns));
    const undoButton = h('button', {
      disabled: myRanksUndoDepth() ? null : '',
      title: myRanksUndoDepth() ? `Undo the last change (${myRanksUndoDepth()} steps back available)` : 'Nothing to undo yet',
      onclick: () => { if (undoMyRanks()) { toast('Reverted'); viewRankings(); } },
    }, 'Undo');
    filterBar.appendChild(h('div', { class:'group' }, h('label', null, 'My board'),
      undoButton,
      h('button', {
        title: `Throw away your edits and re-seed from the full-PPR Gibbs board (${myRanks().order.length} players).`,
        onclick: () => {
          if (!confirm('Reset your rankings to the full-PPR Gibbs board? Your edits are lost.')) return;
          resetMyRanks(); toast('Rankings reset to the Gibbs full-PPR board'); viewRankings();
        },
      }, 'Reset')));

    const posBtns = h('div', { class:'toggle-group rankings-pos-toggle' });
    const rkPosOptions = ['ALL','QB','RB','WR','TE','FLEX', ...((window.LEAGUES||[]).some(l=>l.is_idp) ? ['LB','DB','DL'] : [])];
    for (const p of rkPosOptions) {
      posBtns.appendChild(h('button', {
        class:`toggle ${RANKINGS_FILTER.pos===p?'active':''}`,
        onclick: (e)=>{ RANKINGS_FILTER.pos = p; renderList(); [...posBtns.children].forEach(b=>b.classList.toggle('active', b===e.target)); }
      }, p));
    }
    filterBar.appendChild(h('div', { class:'group' }, h('label', null, 'Pos'), posBtns));

    const catSel = h('select', { 'aria-label':'Filter by category', onchange: (e)=>{ RANKINGS_FILTER.cat = e.target.value; renderList(); } });
    catSel.appendChild(h('option', { value:'ALL' }, 'All Categories'));
    for (const [cid, label] of Object.entries(window.CATEGORY_LABELS)) {
      catSel.appendChild(h('option', { value:cid, selected: RANKINGS_FILTER.cat===cid }, label));
    }
    filterBar.appendChild(h('div', { class:'group' }, h('label', null, 'Category'), catSel));

    const u = h('input', { type:'checkbox', checked: RANKINGS_FILTER.hideUncertain ? '' : null,
      onchange:(e)=>{ RANKINGS_FILTER.hideUncertain = e.target.checked; renderList(); } });
    filterBar.appendChild(h('div', { class:'group' }, h('label', null, u, ' Hide unverified')));

    main.appendChild(filterBar);

    const tableWrap = h('div', { class:'card', style:{ padding:0, overflow:'hidden' } });
    main.appendChild(tableWrap);

    function renderList() {
      tableWrap.innerHTML = '';
      undoButton.disabled = !myRanksUndoDepth();
      undoButton.title = myRanksUndoDepth()
        ? `Undo the last change (${myRanksUndoDepth()} steps back available)` : 'Nothing to undo yet';
      const idx = rankIndex();
      const mine = myRankIndex();
      const consensus = new Map(idx.all.map((p, i) => [String(p._sleeperId || ''), i + 1]));
      // Dynasty-asset filter: rankings sources don't cover DEF/DST/K/P as
      // dynasty assets. IDP positions stay only if any of the user's leagues
      // is IDP; otherwise they'd pollute a 1QB/SF-only view.
      const anyIdp = (window.LEAGUES || []).some(l => l.is_idp);
      const idpPositions = new Set(['LB','DB','DL','CB','S','DT','DE','NT']);
      const irrelevantPositions = new Set(['DST','DEF','K','P']);
      const isDynastyAssetPos = (pos) => {
        if (irrelevantPositions.has(pos)) return false;
        if (!anyIdp && idpPositions.has(pos)) return false;
        return true;
      };
      const filtered = idx.all.filter(p => {
        if (!isDynastyAssetPos(p.pos)) return false;
        if (RANKINGS_FILTER.pos === 'FLEX') { if (!['RB','WR','TE'].includes(p.pos)) return false; }
        else if (RANKINGS_FILTER.pos !== 'ALL' && p.pos !== RANKINGS_FILTER.pos) return false;
        if (RANKINGS_FILTER.cat !== 'ALL' && p.category !== RANKINGS_FILTER.cat) return false;
        if (RANKINGS_FILTER.hideUncertain && p.uncertain) return false;
        if (RANKINGS_FILTER.q && !norm(p.name).includes(norm(RANKINGS_FILTER.q))) return false;
        return true;
      });
      if (RANKINGS_FILTER.order === 'mine') {
        filtered.sort((a, b) => (mine.get(String(a._sleeperId)) || 9999) - (mine.get(String(b._sleeperId)) || 9999));
      }

      if (!filtered.length) {
        tableWrap.appendChild(h('div', { class:'empty' }, 'No players match these filters.'));
        return;
      }

      // Build owner overlay
      const ownerMap = new Map();
      for (const lg of window.LEAGUES || []) {
        for (const r of lg.rosters || []) {
          for (const pid of (r.players || [])) {
            (ownerMap.get(pid) || ownerMap.set(pid, []).get(pid))
              .push({ league: lg.short_name, leagueId: lg.id, team: r.team_name, owner: r.owner_name, isMe: r.is_me, stance: rosterStance(r, lg) });
          }
        }
      }
      const stanceLabels = { tank:'Tank', seller:'Seller', mid:'Mid', buyer:'Buyer', contender:'Contender' };

      // Compute position rank within filter (e.g., QB1, QB2)
      const posCounters = {};

      const tbl = h('table', { class:'data' },
        h('thead', null, h('tr', null,
          h('th', { class:'right', style:{ width:'64px' }, title:'Your saved rank. Click to type a number. In Mine order, drag this cell or use arrow keys.' }, 'Mine'),
          h('th', { class:'right', style:{ width:'74px' }, title:'Rank from enabled sources' }, 'Consensus'),
          h('th', null, 'Player'),
          ...expertHeaders(),
          h('th', null, 'Pos'),
          h('th', null, 'Team'),
          h('th', { class:'right' }, 'Age'),
          h('th', null, 'Category'),
          h('th', { class:'center', style:{ width:'48px' } }, 'Tier'),
          h('th', { class:'right', title:'Dynasty value (KTC market, ~0-110)' }, 'Value'),
          h('th', { class:'right', title:'Value vs projection: positional value rank minus season-projection rank. + = produces above price (buy lean), − = priced above production (sell lean). Read with Age.' }, 'Gap'),
          h('th', { class:'right' }, 'Own%'),
          h('th', { class:'right' }, 'Start%'),
          h('th', { title:`Leagues where he is rostered. Gold = yours. ${(window.LEAGUES || []).map(l => `${leagueCode(l.short_name)} ${l.short_name}`).join(', ')}` }, 'Owners'),
        )),
        h('tbody', null, ...filtered.map((p, i) => {
          posCounters[p.pos] = (posCounters[p.pos] || 0) + 1;
          const posRank = `${p.pos}${posCounters[p.pos]}`;
          const sleeperId = p._sleeperId;
          const myRank = sleeperId ? mine.get(String(sleeperId)) || null : null;
          const reorderable = RANKINGS_FILTER.order === 'mine' && myRank != null;
          const sleeper = sleeperId ? window.PLAYERS[sleeperId] : null;
          const owned = sleeper?.owned;
          const started = sleeper?.started;
          // "Depth trap": owned but rarely started, sell signal
          const isDepth = owned != null && started != null && owned > 30 && started < 25 && owned - started > 30;
          const owners = sleeperId ? (ownerMap.get(sleeperId) || []) : [];
          const ownColor = owned == null ? 'var(--fg-3)' : owned > 80 ? 'var(--green)' : owned > 40 ? 'var(--amber)' : 'var(--fg-2)';
          const startColor = started == null ? 'var(--fg-3)' : started > 60 ? 'var(--green)' : started > 25 ? 'var(--amber)' : 'var(--red)';
          // No gold row here. With five leagues nearly every good player is yours
          // somewhere, so a gold row stopped meaning anything; the gold now sits on
          // the one league chip where he is yours.
          return h('tr', { dataset:{ pid:sleeperId || '' }, class: reorderable ? 'draft-reorder' : '',
            onclick: (e) => { if (!e.target.closest('.my-rank')) openPlayerDetail(p.name, sleeperId); }, title: p.note || '' },
            myRankCell({ pid:sleeperId, name:p.name, mine:myRank }, reorderable, renderList, (pid) => { focusPid = pid; }),
            h('td', { class:'right tnum', style:{ color:'var(--fg-2)' } }, consensus.get(String(sleeperId)) || '·'),
            h('td', null, h('div', { class:'name-cell' },
              h('span', { class:'name' }, p.name),
              injuryChip(sleeperId),
              p.rookie ? h('span', { class:'badge rookie', style:{ marginLeft:'4px' } }, 'Rookie') : null,
              p.uncertain ? h('span', { class:'badge uncertain', style:{ marginLeft:'4px' } }, 'Verify') : null,
              p.subtype === 'depreciating_pillar' ? h('span', { class:'badge depreciating', style:{ marginLeft:'4px' } }, 'DP') : null,
              isDepth ? h('span', { class:'badge depreciating', style:{ marginLeft:'4px' }, title:'Owned but rarely started; depth piece, not a starter.' }, 'DEPTH') : null,
            )),
            ...expertCells(p.name, sleeperId),
            h('td', null, h('div', { style:{ display:'flex', alignItems:'center', gap:'6px' } },
              posChip(p.pos),
              h('span', { class:'tip tnum' }, posRank)
            )),
            h('td', null, teamChip(p.team)),
            h('td', { class:'right tnum' }, (() => { const a = ageOf(p._sleeperId, p.age); return a != null ? fmt.decimal(a, 1) : h('span', { class:'muted' }, '.'); })()),
            h('td', null, ourCatChip(p._sleeperId) || pillCategory(p.category)),
            h('td', { class:'center' }, ourTierChip(p._sleeperId) || tierChip(p.tier, p.category)),
            h('td', { class:'right tnum' }, fmt.decimal(tierValue(p, {}), 0)),
            h('td', { class:'right' }, mispriceChip(sleeperId) || h('span', { class:'muted' }, '·')),
            h('td', { class:'right tnum', style:{ color: ownColor } }, owned != null ? owned.toFixed(0) + '%' : '.'),
            h('td', { class:'right tnum', style:{ color: startColor } }, started != null ? started.toFixed(0) + '%' : '.'),
            h('td', null,
              owners.length
                ? (() => {
                  // One gold chip for every league where he is yours, then the
                  // rivals as bare stance-coloured tags, all on one line.
                  const mine = owners.filter(o => o.isMe), rivals = owners.filter(o => !o.isMe);
                  return h('div', { class:'owner-chips' },
                    mine.length ? h('span', { class:'badge you',
                      title: mine.map(o => `${o.league}: ${o.team}, yours`).join('\n') },
                      mine.map(o => leagueCode(o.league)).join(' ')) : null,
                    ...rivals.map(o => h('span', { class:`badge stance-${o.stance}`,
                      title: `${o.league}: ${o.team} (${o.owner}) · ${stanceLabels[o.stance] || ''}` },
                      leagueCode(o.league))));
                })()
                : h('span', { class:'muted' }, '.')
            ),
          );
        }))
      );
      tableWrap.appendChild(h('div', { style:{ overflowX:'auto' } }, tbl));
      if (RANKINGS_FILTER.order === 'mine') wireMyRankReorder(tbl.querySelector('tbody'), renderList);
      tableWrap.appendChild(h('div', { class:'tip', style:{ padding:'10px 14px', borderTop:'1px solid var(--border)' } },
        RANKINGS_FILTER.order === 'mine'
          ? `Showing ${filtered.length} players. Drag Mine cells, use arrow keys, or click a rank to type. ${myRanks().order.length} ranks saved in this browser.`
          : `Showing ${filtered.length} players ordered by enabled sources. Mine stays editable.`
      ));
      if (focusPid) {
        const refocus = focusPid;
        focusPid = null;
        requestAnimationFrame(() => {
          wrapDataTables();
          const cell = tableWrap.querySelector(`tr[data-pid="${refocus}"] .my-rank`);
          if (cell) { cell.focus({ preventScroll:true }); cell.scrollIntoView({ block:'nearest' }); }
        });
      }
    }
    renderList();
  }

  // ============================================================
  // ROUTE: All Players (Sleeper-side)
  // ============================================================
  const ALL_FILTER = { pos:'ALL', q:'', team:'ALL' };
  function viewAllPlayers() {
    const main = $('#main');
    main.innerHTML = '';
    main.appendChild(h('div', { class:'page-header' },
      h('div', null,
        h('div', { class:'page-eyebrow' }, 'PLAYERS'),
        h('h1', { class:'page-title' }, 'All Players'),
        h('p', { class:'page-sub' }, 'Searchable Sleeper player database, overlaid with your enabled rankings.')
      )
    ));

    const filterBar = h('div', { class:'filters' });
    const q = h('input', { type:'search', placeholder:'Search 9000+ players…', value: ALL_FILTER.q,
      oninput:(e)=>{ ALL_FILTER.q = e.target.value.trim(); render(); } });
    filterBar.appendChild(h('div', { class:'group' }, h('label', null, 'Search'), q));

    const posBtns = h('div', { class:'toggle-group' });
    for (const p of ['ALL','QB','RB','WR','TE','FLEX','K','DEF','LB','DB','DL']) {
      posBtns.appendChild(h('button', {
        class:`toggle ${ALL_FILTER.pos===p?'active':''}`,
        onclick:(e)=>{ ALL_FILTER.pos=p; $$('.toggle-group .toggle').forEach(b=>b.classList.remove('active')); e.target.classList.add('active'); render(); }
      }, p));
    }
    filterBar.appendChild(h('div', { class:'group' }, h('label', null, 'Pos'), posBtns));

    main.appendChild(filterBar);
    const tableWrap = h('div', { class:'card', style:{ padding:0, overflow:'hidden' } });
    main.appendChild(tableWrap);

    function render() {
      tableWrap.innerHTML = '';
      const idx = rankIndex();
      const PLAYERS = window.PLAYERS;
      // Build owner map: pid -> [{league, team_name, roster_id, is_me}, ...]
      const ownerMap = new Map();
      for (const lg of window.LEAGUES || []) {
        for (const r of lg.rosters || []) {
          for (const pid of (r.players || [])) {
            (ownerMap.get(pid) || ownerMap.set(pid, []).get(pid))
              .push({ league: lg.short_name, leagueId: lg.id, team: r.team_name, owner: r.owner_name, isMe: r.is_me });
          }
        }
      }

      // Filter
      const arr = [];
      for (const pid in PLAYERS) {
        const p = PLAYERS[pid];
        if (ALL_FILTER.pos === 'FLEX') { if (!['RB','WR','TE'].includes(p.pos)) continue; }
        else if (ALL_FILTER.pos !== 'ALL' && p.pos !== ALL_FILTER.pos) continue;
        if (ALL_FILTER.q && !norm(p.name).includes(norm(ALL_FILTER.q))) continue;
        // Skip unrostered + unranked + retired feel: include if ranked OR rostered OR active w/ team
        const ranked = idx.bySleeperId.get(pid) || idx.byName.get(norm(p.name));
        const owners = ownerMap.get(pid) || [];
        if (!ALL_FILTER.q) {
          // limit default view to ranked OR rostered
          if (!ranked && !owners.length && p.team === 'FA') continue;
        }
        arr.push({ pid, p, ranked, owners });
      }
      arr.sort((a,b) => {
        // ranked first, by tier_value desc; otherwise by name
        const av = a.ranked ? tierValue(a.ranked, {}) : -1;
        const bv = b.ranked ? tierValue(b.ranked, {}) : -1;
        if (av !== bv) return bv - av;
        return a.p.name.localeCompare(b.p.name);
      });

      const limited = arr.slice(0, 250);

      const tbl = h('table', { class:'data' },
        h('thead', null, h('tr', null,
          h('th', null, 'Player'),
          ...expertHeaders(),
          h('th', null, 'Pos'),
          h('th', null, 'Team'),
          h('th', null, 'Category'),
          h('th', null, 'Tier'),
          h('th', null, 'Owners'),
        )),
        h('tbody', null, ...limited.map(({pid,p,ranked,owners}) => {
          return h('tr', { onclick: ()=>openPlayerDetail(p.name, pid) },
            h('td', null, h('div', { class:'name-cell' },
              h('span', { class:'name' }, p.name),
              p.age ? h('span', { class:'muted' }, ` · ${p.age}`) : null,
            )),
            ...expertCells(p.name, pid),
            h('td', null, posChip(p.pos)),
            h('td', null, teamChip(p.team)),
            h('td', null, ranked ? (ourCatChip(ranked._sleeperId) || pillCategory(ranked.category)) : h('span', { class:'muted' }, ',')),
            h('td', null, ranked ? (ourTierChip(ranked._sleeperId) || tierChip(ranked.tier, ranked.category)) : h('span', { class:'muted' }, ',')),
            h('td', null,
              ...(owners.length ? owners.slice(0,3).map(o => h('span', {
                class:'badge' + (o.isMe ? ' you' : ''),
                title: `${o.team} (${o.owner}), ${o.league}`,
                style:{ marginRight:'4px' }
              }, o.league)) : [h('span', { class:'muted' }, ',')]),
              owners.length > 3 ? h('span', { class:'muted' }, `+${owners.length-3}`) : null
            )
          );
        }))
      );
      // Wrap in a horizontal scroller so the 7-col table scrolls inside the card
      // on narrow widths instead of being clipped by the card's overflow.
      tableWrap.appendChild(h('div', { style:{ overflowX:'auto' } }, tbl));
      if (arr.length > limited.length) {
        tableWrap.appendChild(h('div', { class:'tip', style:{ padding:'10px 14px' } }, `Showing 250 of ${arr.length}. Refine search to see more.`));
      }
    }
    render();
  }

  // ============================================================
  // ROUTE: Leagues list
  // ============================================================
  // The cross-league comparison, as a component so the dashboard's Leagues
  // tab can host it. It used to be its own route and its own page.
  function leaguesComparison(main) {
    const STANCE_LABEL = { tank:'Tank', seller:'Seller', mid:'Mid', buyer:'Buyer', contender:'Contender' };
    const stanceTone = { contender:'var(--green)', buyer:'var(--blue)', mid:'var(--fg-2)', seller:'var(--amber)', tank:'var(--red)' };
    // ===== Cross-league comparison table (the reason this page exists) =====
    const mine = (window.LEAGUES || []).map(lg => { const me = lg.rosters.find(r => r.is_me); return me ? { lg, me } : null; }).filter(Boolean);
    if (mine.length) {
      const rowsData = mine.map(({ lg, me }) => {
        const rank = lineupRankInLeague(lg, me.roster_id);
        const pv = startingStrength(me, lg);
        // Redraft has no year-4 lineup to project, so FV and stance stay blank
        // rather than rendering a number that prices a career the manager
        // never keeps. Skipping the call also skips the aging model entirely.
        const dyn = isDynastyLeague(lg);
        const fv = dyn ? startingStrength(me, lg, 4, true) : null;
        const ss = rosterSurplusShortage(getRosterPlayers(me), lg);
        const needs = ['QB','RB','WR','TE'].map(p => ({ p, s: ss[p]?.surplus ?? 0 })).filter(x => x.s <= -1).sort((a, b) => a.s - b.s);
        const rec = `${me.wins || 0}-${me.losses || 0}${me.ties ? '-' + me.ties : ''}`;
        const format = lg.platform === 'espn' || lg.type === 0 ? 'Redraft' : lg.is_superflex ? 'Superflex' : lg.is_idp ? 'IDP' : '1QB';
        return { lg, me, rank, pv, fv, dyn, format, stance: dyn ? rosterStance(me, lg) : null, need: needs.map(n => n.p).join('/') || '·', rec };
      });
      main.appendChild(h('div', { class:'card leagues-table-card' },
        h('table', { class:'data leagues-table' },
          h('thead', null, h('tr', null,
            h('th', null, 'League'), h('th', null, 'Format'), h('th', { class:'right' }, 'Record'),
            h('th', { class:'right', title:'Lineup rank: your best legal starting lineup against the league, picks excluded. The roster Snapshot also shows roster value rank, picks included.' }, 'Rank'),
            h('th', { class:'right', title:'Present Value: your best LEGAL starting lineup today (positions respected, taxi/IR/Out benched). Dynasty rows are KTC asset value (PV); redraft rows are season value over replacement (VOR), a different unit, so compare the rank, not the number.' }, 'PV / VOR'),
            h('th', { class:'right', title:'Future Value: the same lineup 4 years out, each player aged by his position curve, with owned picks folded in once they convert. A converted pick is discounted in its rookie year (0.75x, ramping to parity) because dynasty value prices a whole career, not one season.' }, 'FV'),
            h('th', null, 'Stance'), h('th', null, 'Biggest Need'))),
          h('tbody', null, ...rowsData.map(d => h('tr', { style:{ cursor:'pointer' }, onclick:()=>navigate(`#league/${d.lg.id}`) },
            h('td', null, h('div', { class:'name-cell' },
              h('span', { class:'name' }, d.me.team_name),
              h('span', { class:'league-table-meta tip' }, `${d.lg.short_name} · ${d.format}`),
            )),
            h('td', { class:'tip' }, `${d.format} · ${d.lg.total_rosters}tm`),
            h('td', { class:'right tnum' }, d.rec),
            h('td', { class:'right tnum', style:{ fontWeight:700, color: d.rank <= Math.ceil(d.lg.total_rosters*0.3) ? 'var(--green)' : d.rank > Math.ceil(d.lg.total_rosters*0.6) ? 'var(--red)' : 'var(--fg-1)' } }, `#${d.rank}`),
            h('td', { class:'right tnum', title: d.dyn
              ? 'Dynasty PV: KTC asset value of your best legal starting lineup.'
              : 'Redraft PV: season value over replacement of your best legal starting lineup. A different unit from the dynasty rows, so compare the rank, not the number.' },
              fmt.decimal(d.pv, 0),
              d.dyn ? null : h('span', { class:'badge unit-vor' }, 'VOR')),
            h('td', { class:'right tnum', style:{ color:'var(--fg-3)' }, title: d.dyn ? null : 'Redraft league, no future value.' }, d.dyn ? fmt.decimal(d.fv, 0) : '·'),
            h('td', null, d.dyn
              ? h('span', { class:`badge stance-${d.stance}`, style:{ color: stanceTone[d.stance] } }, STANCE_LABEL[d.stance] || d.stance)
              : h('span', { class:'muted', title:'Redraft league, no rebuild or contend stance.' }, '·')),
            h('td', { style:{ color: d.need === '·' ? 'var(--green)' : 'var(--red)', fontWeight:600 } }, d.need),
          ))),
        )
      ));
    }

  }

  // ============================================================
  // ROUTE: Single league
  // ============================================================
  function rankInLeague(league, rosterId) {
    const all = league.rosters.map(r => ({ id:r.roster_id, score: computeRosterStrength(r, league).total }));
    all.sort((a,b)=>b.score-a.score);
    return all.findIndex(x => x.id === rosterId) + 1;
  }
  // Best legal starting lineup, picks excluded: the rank Dashboard and Standings show.
  // rankInLeague above is total roster value WITH picks, a different model, so a
  // screen that prints one should say which.
  function lineupRankInLeague(league, rosterId) {
    const all = league.rosters.map(r => ({ id:r.roster_id, s: startingStrength(r, league) }));
    all.sort((a,b)=>b.s-a.s);
    return all.findIndex(x => x.id === rosterId) + 1;
  }

  // Number of starting (non-bench) OFFENSE slots, the value model is offense-only,
  // so we compare best-lineup value over these slots.
  function offenseStarterCount(league) {
    let n = 0;
    for (const s of (league.roster_positions || [])) if (['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX'].includes(s)) n++;
    return n || 9;
  }

  // The actual offense slots a league starts, in roster_positions order. A slot
  // knows which positions it accepts; `flex` marks the ones that aren't tied to
  // a single position. Used to fill a legal lineup instead of a naive top-K,
  // which in a 1QB league happily "started" two quarterbacks.
  function offenseStartingSlots(league) {
    const slots = [];
    for (const s of (league.roster_positions || [])) {
      if (s === 'QB' || s === 'RB' || s === 'WR' || s === 'TE') slots.push({ pos: s, flex: false });
      else if (s === 'K') slots.push({ pos: 'K', flex: false });
      else if (s === 'DEF' || s === 'DST') slots.push({ pos: 'DEF', flex: false });
      else if (s === 'FLEX') slots.push({ pos: 'FLEX', flex: true });
      else if (s === 'SUPER_FLEX') slots.push({ pos: 'SUPER_FLEX', flex: true });
    }
    return slots;
  }
  const SLOT_TAKES = {
    QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'],
    FLEX: ['RB', 'WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
    K: ['K'], DEF: ['DEF', 'DST'],
  };

  // Sleeper's `players` array includes taxi and IR bodies, neither of which can
  // be put in a starting lineup. Anything scoring a LINEUP has to filter them
  // out first; anything scoring future value should not, because taxi
  // eligibility expires and a stashed rookie is a real future starter.
  function startableIds(roster, { includeStashed = false } = {}) {
    const all = (roster?.players || []).map(String);
    if (includeStashed) return all;
    const out = new Set([...(roster?.taxi || []), ...(roster?.reserve || [])].map(String));
    return all.filter(pid => !out.has(pid));
  }

  // Injury designations that keep a player out of a lineup. Questionable is NOT
  // one of them, a Q player starts most weeks, and benching every Q would gut
  // every roster's projection in-season. Sleeper carries this on the player
  // record (`injury_status`), separate from the roster's IR list, so a banged-up
  // starter the manager hasn't IR'd still gets caught.
  const OUT_INJURY = new Set(['Out', 'Doubtful', 'IR', 'PUP', 'NA', 'Sus', 'DNR', 'COV']);
  function isSidelined(pid) {
    const sp = window.PLAYERS?.[pid];
    if (!sp) return false;
    return OUT_INJURY.has(sp.injury_status) || sp.status === 'Injured Reserve';
  }

  // projections.js ships each player's raw stat line per source, but the `pp` /
  // `sleeper` / `blend` point totals baked into it are scored under ONE fixed
  // rule set (1 PPR, 4pt pass TD, INT -1), see score_offense.py. Rescore from
  // the stat line so a league that differs (Password is taco is INT -2) gets its
  // own number. Returns null when there's no stat line to score, so the caller
  // can fall back to the precomputed total rather than reporting a zero.
  function leagueScorePoints(stats, league) {
    if (!stats || !Object.keys(stats).length) return null;
    const sc = league?.scoring || {};
    const g = (k, dflt) => (sc[k] != null ? sc[k] : dflt);
    const w = {
      pass_yd: g('pass_yd', 0.04), pass_td: g('pass_td', 4), pass_int: g('pass_int', -1),
      rush_yd: g('rush_yd', 0.1), rush_td: g('rush_td', 6),
      rec: g('rec', 1), rec_yd: g('rec_yd', 0.1), rec_td: g('rec_td', 6),
      fum_lost: g('fum_lost', -2),
      pass_2pt: g('pass_2pt', 2), rush_2pt: g('rush_2pt', 2), rec_2pt: g('rec_2pt', 2),
      // IDP. The defense stat lines use short keys (solo, ast, tfl, pass_def)
      // while Sleeper's scoring uses idp_* names, so the weight is looked up
      // under the scoring name and applied to the stat name. Without these the
      // whole IDP half of a lineup scored 0 through this function, which is why
      // optimalDefense used to read the baked blend and miss the league's own
      // weights entirely: yuH pays 1.0 a solo tackle, 3.0 a sack, 5.0 an
      // interception and 3.0 a pass defensed, none of which the blend knows.
      solo: g('idp_tkl_solo', 1), ast: g('idp_tkl_ast', 0.5),
      sack: g('idp_sack', 2), tfl: g('idp_tkl_loss', 0),
      int: g('idp_int', 3), ff: g('idp_ff', 3),
      pass_def: g('idp_pass_def', 1), qb_hit: g('idp_qb_hit', 0),
      fum_rec: g('idp_fum_rec', 3), def_td: g('idp_def_td', 6),
      safe: g('idp_safe', 3), blk_kick: g('idp_blk_kick', 3),
    };
    let pts = 0;
    for (const k in w) pts += (stats[k] || 0) * w[k];
    // TE premium is a per-reception bonus on top of PPR, not a separate stat.
    if (sc.bonus_rec_te && stats._isTE) pts += (stats.rec || 0) * sc.bonus_rec_te;
    return Math.round(pts * 10) / 10;
  }

  // Fill the legal best lineup from valued assets, greedily by value. Sorting
  // desc and giving each asset its most-constrained eligible slot first
  // (dedicated before flex) is optimal here because slot eligibility nests:
  // QB ⊂ SUPER_FLEX, and RB/WR/TE ⊂ FLEX ⊂ SUPER_FLEX.
  // A pick is a rookie of unknown position, so it's eligible anywhere, but it
  // tries flex slots FIRST, so it can't evict a QB from the only QB slot.
  // `presorted` lets a caller that already holds assets in the order it wants
  // them started skip the sort. The championship simulator does: its pool is
  // sorted once on the projection, and re-sorting 27 assets on every team-week
  // was most of the runtime.
  // `bySlot` returns the slot-aligned array (length === slots.length, holes kept
  // as null) instead of just the filled assets. The Draft Room needs it to draw
  // an empty QB row in the QB slot rather than inferring which slots are missing
  // by diffing a compacted list, which cannot tell two identical slots apart.
  function fillLineup(assets, slots, presorted = false, bySlot = false) {
    const sorted = presorted ? assets : assets.slice().sort((a, b) => b.v - a.v);
    const n = slots.length;
    const filled = new Array(n).fill(null);
    let count = 0;
    for (const a of sorted) {
      if (count === n) break;
      const isPick = a.pos === 'PICK';
      let best = -1;
      // Two passes over the slots in roster order. Players take a dedicated slot
      // before a flex one; picks take a flex slot before a dedicated one. Walking
      // the slots directly (rather than building and sorting a candidate list per
      // asset) keeps this allocation-free.
      for (let pass = 0; pass < 2 && best < 0; pass++) {
        const wantFlex = isPick ? pass === 0 : pass === 1;
        for (let i = 0; i < n; i++) {
          if (filled[i] || slots[i].flex !== wantFlex) continue;
          if (!isPick && !(SLOT_TAKES[slots[i].pos] || []).includes(a.pos)) continue;
          best = i; break;
        }
      }
      if (best >= 0) { filled[best] = a; count++; }
    }
    if (bySlot) return filled;
    const out = [];
    for (let i = 0; i < n; i++) if (filled[i]) out.push(filled[i]);
    return out;
  }

  // Dynasty value prices an asset's whole remaining career; a starting lineup
  // only cares about one season. Those diverge most for the young, so a pick
  // folded into a future lineup at full KTC value overstates what it actually
  // starts in its rookie year.
  // Calibrated against this repo's own numbers, 2026 blended projections
  // (projections/offense-projections.json) vs KTC 1QB value, 330 matched
  // offense players. Median actual points / value-implied points by age:
  //   21-22 0.85 | 23 0.74 | 24 0.93 | 25 0.98 | 26-27 1.09 | 28-29 1.30 | 30+ 1.42
  // and for true rookies specifically 0.75 (RB 0.75, WR 0.84, TE 0.60, n=37).
  // So: rookie season 0.75, then ramp to parity as the modeled player ages in.
  // Only picks get this. Rostered players keep full value, the same bias runs
  // through every value view on the site, and quietly rescaling half of one
  // metric would make it incomparable to the rest.
  const ROOKIE_STARTABILITY = [0.75, 0.85, 0.93, 1.0];
  function rookieStartability(seasonsSinceDraft) {
    return ROOKIE_STARTABILITY[Math.min(Math.max(0, seasonsSinceDraft), ROOKIE_STARTABILITY.length - 1)];
  }

  // Starting-lineup strength: value of the best LEGAL starting lineup a roster
  // can field (one asset per slot, positions respected). This is the contention
  // signal, NOT the sum of every rostered player, which just rewards hoarding
  // depth and mislabels a deep-but-weak-starter roster as a contender.
  // yearsOut=0 -> Present Value (starters now). yearsOut>0 -> Future Value: each
  // player's value aged by the position age-curve, then the lineup re-filled (so a
  // young riser can crack the future lineup over an aging vet).
  // `picks` overrides the roster's owned picks, for a trade that moves some.
  // `waiver` (Present Value only) lets the lineup claim the best free agents too,
  // so a trade that empties a slot is charged the gap to the waiver body, and an
  // "upgrade" over a starter the wire already beats is no upgrade. The trade
  // delta passes it; the standings and draft-slot callers do not.
  function startingStrength(roster, league, yearsOut = 0, includePicks = false, picks = null, waiver = false) {
    // Redraft has no Future Value column to hold an injured player's worth, and
    // his rest-of-season points already price the weeks he misses, so he stays
    // on the books. It has no future lineup and no picks either.
    if (!isDynastyLeague(league)) return redraftLineup(startableIds(roster, { includeStashed: true }), league).strength;
    const idx = rankIndex();
    const vals = [];
    // Present Value is what you can start TODAY, so taxi and IR are out. Future
    // Value includes them: taxi eligibility expires and injuries heal, so a
    // stashed rookie is a real future starter, not a phantom.
    const ids = startableIds(roster, { includeStashed: yearsOut > 0 });
    for (const pid of (waiver && !yearsOut ? ids.concat(waiverIds(league)) : ids)) {
      const sp = window.PLAYERS[pid]; if (!sp) continue;
      if (!yearsOut && isSidelined(pid)) continue;
      const r = idx.bySleeperId.get(pid) || idx.byName.get(norm(sp.name));
      if (r) {
        let v = tierValue(r, league);
        if (yearsOut) v *= ageRetention(sp.age, r.pos || sp.pos, yearsOut);
        vals.push({ v, pos: r.pos || sp.pos });
      }
    }
    // Future lineups only: fold in owned picks that have CONVERTED to players by
    // the projected season (pick season <= that year). A pick isn't on the field
    // now (PV, yearsOut=0 skips this) but by its draft year it becomes a rookie
    // competing for a best-K starter slot. Base value = pickValue (KTC rookie-pick
    // scale, same units as tierValue); then aged from its draft year as an age-22
    // WR (the same convention rosterValueCurve uses), so a 2027 first is worth its
    // rookie value in 2027 and gently declines out to 2030 rather than staying flat.
    if (includePicks && yearsOut) {
      const projSeason = CURRENT_SEASON + yearsOut;
      // Fold in owned picks across every future draft class up to the projected
      // season, the extended horizon means each team's own 2029/2030 firsts are
      // assumed too (default slate), so the out-years reload instead of only aging.
      for (const p of (picks || rosterOwnedPicks(roster.roster_id, league, Math.max(2, yearsOut + 1)))) {
        const ps = parseInt(p.season, 10);
        if (ps <= projSeason) {
          const held = Math.max(0, projSeason - ps);
          vals.push({ v: (p.value || 0) * ageRetention(22, 'WR', held) * rookieStartability(held), pos: 'PICK' });
        }
      }
    }
    const slots = offenseStartingSlots(league);
    // No parseable roster_positions (custom/partial league payload): fall back to
    // the old position-blind top-K so the metric still returns something sane.
    const lineup = slots.length ? fillLineup(vals, slots)
      : vals.slice().sort((a, b) => b.v - a.v).slice(0, offenseStarterCount(league));
    return Math.round(lineup.reduce((a, b) => a + b.v, 0) * 10) / 10;
  }

  // The redraft lineup: rest-of-season points, K and DEF included, filled by the
  // one filler and ordered on points (floored VOR ties every sub-replacement body
  // at 0). Strength is the lineup's points over replacement, replacement being the
  // best FREE body each slot takes. The waiver wire is in the pool, before and
  // after alike: a manager who ships his kicker claims the best free one, so an
  // emptied slot costs his points minus the free agent's, floored at 0 (Phi Kap's
  // best free K, 137.7, beats every rostered kicker). `empty` counts the slots
  // even the waiver wire cannot fill; one scores 0.
  function redraftLineup(ids, league) {
    const ros = rosPointsByPid(league), free = rosBoard(league).freeLevel;
    const assets = [];
    for (const pid of new Set([...ids].map(String).concat(waiverIds(league)))) {
      const rec = ros.get(pid);
      if (rec) assets.push({ pid, pos: projPosGroup(rec.pos), v: rec.pts });
    }
    const slots = offenseStartingSlots(league);
    const filled = fillLineup(assets, slots, false, true);
    let points = 0, over = 0, empty = 0;
    slots.forEach((s, i) => {
      const base = Math.max(0, ...SLOT_TAKES[s.pos].map(p => free[projPosGroup(p)] || 0));
      const pts = filled[i] ? filled[i].v : 0;
      if (!filled[i]) empty++;
      points += pts; over += pts - base;
    });
    return { points: Math.round(points * 10) / 10, strength: Math.round(over * REDRAFT_VOR_SCALE * 10) / 10, empty };
  }

  // This league's free-agent pool on the current-season basis its lineups use:
  // rest-of-season lines in redraft (K and DEF included), the league-scored season
  // projection in dynasty (offense, nobody sidelined). Best first. Every lineup and
  // every simulated what-if claims from this one list, so a slot a trade empties is
  // filled the way it would be in the league, never left empty.
  const _freeAgents = new Map();
  function freeAgents(lg) {
    const key = String(lg.id);
    if (!_freeAgents.has(key)) {
      let out;
      if (!isDynastyLeague(lg)) {
        out = Object.entries(rosBoard(lg).byPos).flatMap(([pos, lst]) => lst.filter(x => x.free).map(x => ({ pid: x.pid, pos, pts: x.pts })));
      } else {
        const owned = new Set((lg.rosters || []).flatMap(r => (r.players || []).map(String)));
        out = [...projMap('offense').values()].filter(p => !owned.has(String(p.id)) && !isSidelined(String(p.id)))
          .map(p => ({ pid: String(p.id), pos: p.pos, pts: projPoints(p, lg, 'blend') || 0 }));
      }
      out.sort((a, b) => b.pts - a.pts);
      // The ones who could start: the best few at each position, as many as the
      // league has starting slots that take it.
      const slots = offenseStartingSlots(lg), taken = {};
      const starters = out.filter(fa => {
        const cap = slots.filter(s => SLOT_TAKES[s.pos].includes(fa.pos)).length;
        return (taken[fa.pos] = (taken[fa.pos] || 0) + 1) <= cap;
      }).map(fa => fa.pid);
      _freeAgents.set(key, { all: out, starters });
    }
    return _freeAgents.get(key).all;
  }
  function waiverIds(lg) { freeAgents(lg); return _freeAgents.get(String(lg.id)).starters; }

  // 5-level buy/sell stance for a fantasy roster, league-relative. Quintile of
  // STARTING-lineup strength (best-K, picks excluded): a true contender fields
  // strong starters. Ranking by total roster value instead would reward a team
  // that hoards mediocre depth, that was mislabeling weak-starter rosters as
  // contenders.
  const _stanceCache = new Map();
  function rosterStance(roster, league) {
    if (!roster || !league) return 'mid';
    const cacheKey = `${league.id}::${roster.roster_id}`;
    if (_stanceCache.has(cacheKey)) return _stanceCache.get(cacheKey);
    const scored = (league.rosters || []).map(r => ({
      id: r.roster_id,
      score: startingStrength(r, league),
    })).sort((a, b) => b.score - a.score);
    const rank = scored.findIndex(x => x.id === roster.roster_id) + 1;
    const total = scored.length;
    const pct = total > 1 ? (rank - 1) / (total - 1) : 0;
    let stance;
    if (pct < 0.20) stance = 'contender';
    else if (pct < 0.40) stance = 'buyer';
    else if (pct < 0.60) stance = 'mid';
    else if (pct < 0.80) stance = 'seller';
    else stance = 'tank';
    _stanceCache.set(cacheKey, stance);
    return stance;
  }
  function viewLeague(leagueId, tabArg) {
    const main = $('#main');
    const lg = (window.LEAGUES || []).find(l => l.id === leagueId);
    if (!lg) { main.innerHTML = ''; main.appendChild(h('div', { class:'empty' }, 'League not found.')); return; }
    const me = lg.rosters.find(r => r.is_me);

    // 'timeline' kept as an alias so old bookmarks still resolve to Transactions.
    const validTabs = lg.platform === 'espn' ? ['standings','players','faab'] : ['standings','players','transactions','faab'];
    const requestedTab = tabArg === 'timeline' ? 'transactions' : tabArg;
    const tab = validTabs.includes(requestedTab) ? requestedTab : 'standings';

    main.innerHTML = '';

    main.appendChild(breadcrumbs([
      { label:'My Leagues', hash:'#dashboard' },
      { label: lg.short_name || lg.name },
    ]));

    const formatTag = lg.type === 0 ? 'REDRAFT' : (lg.is_superflex ? 'SUPERFLEX' : (lg.is_idp ? 'IDP' : '1QB'));
    const formatRule = lg.is_superflex
      ? 'A second QB can start in the SUPER_FLEX slot. Top-12 QBs are treated as Cornerstone-tier and QB values get a 1.40x position multiplier in team strength.'
      : lg.is_idp
        ? 'This league has IDP_FLEX slots. Defensive players (LB/DB/DL) score, and LBs get a 1.10x multiplier in team strength.'
        : null;
    main.appendChild(h('div', { class:'page-header' },
      h('div', null,
        h('div', { class:'page-eyebrow' },
          'LEAGUE',
          h('span', { class:'page-eyebrow-tag', title: formatRule, tabindex: formatRule ? '0' : null }, formatTag),
          lg.platform === 'espn' ? h('span', { class:'page-eyebrow-tag' }, 'ESPN') : null,
          lg.status === 'pre_draft' ? h('span', { class:'page-eyebrow-tag' }, 'PRE-DRAFT') : null,
        ),
        h('h1', { class:'page-title' }, lg.name),
        h('p', { class:'page-sub' }, `${me?.team_name || ','} · ${lg.total_rosters}-team`)
      ),
      h('div', { class:'page-actions' },
        me ? h('a', { href:`#roster/${lg.id}/${me.roster_id}` }, h('button', { class:'primary' }, 'My Roster →')) : null,
        h('div', { class:'btn-group' },
          // Trade Lab moved into the tab bar beside Standings / Players /
          // Transactions, so it is not also a header button.
          h('a', { href:lg.external_url || `https://sleeper.com/leagues/${lg.id}/standings`, target:'_blank', rel:'noopener' },
            h('button', { class:'ghost' }, `Open in ${lg.platform === 'espn' ? 'ESPN' : 'Sleeper'} ↗`)),
        )
      )
    ));

    const leagueTabs = [
      { key:'standings', label:'Standings', icon:'⚑', count: lg.total_rosters },
      { key:'players',   label:'Players',   icon:'★' },
    ];
    if (lg.platform !== 'espn') leagueTabs.push({ key:'transactions', label:'Transactions', icon:'⇄' });
    // FAAB prices are a league view like the others. Buried in the Transactions feed
    // and behind a collapsed panel in the Action Center, it read as unimplemented.
    // Claim history is league-specific. A format-wide fallback makes a local
    // market look precise when it is not, and one trailing space in a league
    // name used to trigger that fallback for The League.
    const faabDims = faabLeagueRecord(window.FAAB_ARCHETYPES, lg)?.dims || null;
    const faabCount = faabDims ? (faabDims.situation || []).length : 0;
    if (faabCount) leagueTabs.push({ key:'faab', label:'FAAB', icon:'$', count: faabCount });
    // Trade Lab has its own route; the tab links out to it rather than duplicating
    // the view, so it sits beside its siblings without a second implementation.
    leagueTabs.push({ key:'trade', label:'Trade Lab', icon:'⇄', href:`#trade/${lg.id}` });
    const leagueTabBar = tabBar(leagueTabs, tab, (k) => {
      const t = leagueTabs.find(x => x.key === k);
      if (t && t.href) return t.href;
      return k === 'standings' ? `#league/${lg.id}` : `#league/${lg.id}/${k}`;
    });
    if (tab === 'standings') leagueTabBar.classList.add('standings-tab-bar');
    main.appendChild(leagueTabBar);

    if (tab === 'standings') {
    // Standings / Strength rankings
    const lgDynasty = isDynastyLeague(lg);
    main.appendChild(h('h2', { class:'page-title standings-heading' }, 'Team Strength Rankings'));

    // 5-year value outlook per team. Sparkline bars + the dedicated line chart both
    // read this trajectory: projected starting-lineup value for CURRENT_SEASON..+4
    // (position-aware aging, best-K re-picked each year, owned picks folded in once
    // they convert). year-0 == PV, last year == FV.
    const TRAJ_YEARS = 5;
    const trajLabels = [];
    for (let y = 0; y < TRAJ_YEARS; y++) trajLabels.push(String(CURRENT_SEASON + y));

    // Trajectory is the STARTING-lineup curve (same scale as PV/FV), not the
    // full-roster value curve, so bar[0] == PV, bar[last] == FV and the slope
    // matches the FV%. Ages each starter yearsOut and re-picks best-K per year.
    // Redraft stops at year 0. There is no year-4 roster to project, so the
    // aging model never runs and traj is a single point.
    const trajYears = lgDynasty ? TRAJ_YEARS : 1;
    const computed = lg.rosters.map(r => {
      const s = computeRosterStrength(r, lg);
      // Future bars fold in owned picks (converted to rookie starters by their
      // draft year); PV (year 0) stays player-only.
      const traj = [];
      for (let y = 0; y < trajYears; y++) traj.push(startingStrength(r, lg, y, true));
      return { r, s, traj, st: traj[0], fv: traj[trajYears - 1] };
    });
    // Share = a roster's starting-lineup value as a fraction of the league total,
    // computed at PV (now) and FV (last bar). Baseline = 1/N. Bands via the same
    // Dynasty Domain classifier used elsewhere.
    const leaguePV = computed.reduce((a, c) => a + c.st, 0) || 1;
    const leagueFV = computed.reduce((a, c) => a + c.fv, 0) || 1;
    const shareBaseline = 1 / Math.max(1, computed.length);
    const shareTone = (t) => t === 'good' ? 'var(--green)' : t === 'bad' ? 'var(--red)' : 'var(--fg-2)';
    // Rank by STARTING-lineup strength (best-K), not sum of every rostered player, // total-value rewards hoarding depth and buries a strong-starters/thin team.
    computed.sort((a,b) => b.st - a.st);
    const maxTotal = computed[0].st || 1;
    // Common sparkline scale across all teams. Zoom the y-axis to the actual
    // [min,max] across every team-year rather than starting at 0, dynasty
    // value only swings ~5-20% over 3 years, so a 0-based axis flattens the
    // slope to invisibility. Zoomed, bar height still ranks teams (taller =
    // stronger) AND the within-team slope shows the trend.
    const allTrajVals = computed.flatMap(c => c.traj);
    const trajMax = Math.max(...allTrajVals);
    const trajMin = Math.min(...allTrajVals);
    const trajSpan = (trajMax - trajMin) || 1;
    const trajH = (v) => 12 + ((v - trajMin) / trajSpan) * 88; // 12-100% band

    // One panel holding the rows, not a dozen plates floating on the turf. The
    // reference always puts a row list inside a single periwinkle panel, and the
    // caption that explains the panel belongs inside it rather than floating on
    // the turf above it.
    const standings = h('div', { class:'card standings-list' });
    const sortState = { key:'pv', dir:'desc' };
    const sortBar = h('div', { class:'standings-sort', role:'group', 'aria-label':'Sort standings' });
    // Redraft has no future lineup, so "future" would sort by the same number.
    const sortOptions = [
      ...(lgDynasty ? [['pv', 'Strength now'], ['fv', 'Future strength']] : [['pv', 'Strength']]),
      ['record', 'Record'], ['pf', 'Points for'], ['diff', 'Point differential'], ['pa', 'Points against'],
    ];
    const sortSelect = h('select', { 'aria-label':'Sort teams by' }, ...sortOptions.map(([key, label]) =>
      h('option', { value:key, selected:key === sortState.key ? '' : null }, label)));
    const dirButton = h('button', { type:'button', class:'ghost standings-dir' });
    const applyStandingsSort = () => {
      sortStandingRows(standings.querySelectorAll('.strength-row'), sortState.key, sortState.dir)
        .forEach(row => standings.appendChild(row));
      dirButton.textContent = sortState.dir === 'desc' ? 'High first ↓' : 'Low first ↑';
      dirButton.setAttribute('aria-label', `Order ${dirButton.textContent.toLowerCase()}`);
    };
    sortSelect.onchange = () => { sortState.key = sortSelect.value; sortState.dir = standingDefaultDir(sortState.key); applyStandingsSort(); };
    dirButton.onclick = () => { sortState.dir = sortState.dir === 'desc' ? 'asc' : 'desc'; applyStandingsSort(); };
    sortBar.appendChild(h('label', { class:'standings-sort-label' }, h('span', null, 'Sort by'), sortSelect));
    sortBar.appendChild(dirButton);
    applyStandingsSort();
    standings.appendChild(sortBar);
    standings.appendChild(h('p', { class:'tip standings-note' },
      lgDynasty
        ? `Starting-lineup value projected ${trajLabels[0]} to ${trajLabels[TRAJ_YEARS-1]} (position-aware aging, best-K re-picked each year, owned picks fold in once they convert). Year 1 = PV, year 5 = FV.`
        : 'Best legal starting lineup today (positions respected, taxi/IR/Out benched). Redraft, so there is no multi-year projection.'));
    computed.forEach((row, i) => {
      const r = row.r, s = row.s, st = row.st;
      const isMe = r.is_me;
      const cs = s.rankedPlayers.filter(p => p.ranked.category === 'cornerstone').length;
      const fnd = s.rankedPlayers.filter(p => p.ranked.category === 'foundational').length;
      const ups = s.rankedPlayers.filter(p => p.ranked.category === 'upside_premier').length;

      // Value share split PV vs FV: starting-lineup value as a fraction of the
      // league total, now and at the last bar. Each classified into a band.
      const pvShare = st / leaguePV, fvShare = row.fv / leagueFV;
      const pvCls = classifyValueShare(pvShare, shareBaseline);
      const fvCls = classifyValueShare(fvShare, shareBaseline);

      // 3-year trajectory: Δ direction + magnitude drive both the figure and the
      // one-word tag. Rising = accumulating value, Aging = bleeding it.
      const traj = row.traj;
      const tFirst = traj[0] || 0, tLast = traj[traj.length - 1] || 0;
      const tDelta = tLast - tFirst;
      const tPct = tFirst > 0 ? (tDelta / tFirst) * 100 : 0;
      const tDir = tPct >= 4 ? 'up' : tPct <= -10 ? 'down' : 'flat';
      const tColor = tDir === 'up' ? 'var(--green)' : tDir === 'down' ? 'var(--amber)' : 'var(--blue)';
      const tLabel = tDir === 'up' ? 'RISING' : tDir === 'down' ? 'AGING' : 'STEADY';
      const spark = h('div', { class:'str-spark' }, ...traj.map((v, yi) =>
        h('div', { class:'sp-bar-wrap', title:`${trajLabels[yi]}: ${fmt.decimal(v, 0)}` },
          h('span', { class:'sp-bar-val tnum' }, fmt.decimal(v, 0)),
          h('div', { class:'sp-bar', style:{ height: trajH(v) + '%', background: tColor, opacity: yi === traj.length - 1 ? 1 : 0.55 } }))));

      const strengthRow = h('div', {
        class:`strength-row ${isMe?'you':''}`,
        dataset:{
          strengthRank:i + 1,
          pv:st,
          fv:row.fv,
          record:((r.wins ?? 0) + ((r.ties ?? 0) * 0.5)) / Math.max(1, (r.wins ?? 0) + (r.losses ?? 0) + (r.ties ?? 0)),
          pf:r.fpts ?? 0,
          pa:r.fpts_against ?? 0,
          diff:(r.fpts ?? 0) - (r.fpts_against ?? 0),
        },
        onclick:()=>navigate(`#roster/${lg.id}/${r.roster_id}`),
      },
        h('div', { class:'rank', title:'Strength rank by current starting-lineup value' }, `#${i+1}`),
        h('div', { class:'team' },
          h('div', { class:'team-name' },
            r.team_name,
            isMe ? h('span', { class:'badge you', style:{ marginLeft:'8px' } }, 'YOU') : null
          ),
          h('div', { class:'owner' }, r.owner_name),
        ),
        h('div', { class:'strength-detail' },
            // Season to date, from the roster itself. Sorting stays by starting
            // strength; this is what HAS happened beside what the lineup projects.
            (r.wins != null || r.losses != null) ? h('span', { class:'seg ytd', title:'Record, season to date' },
              h('span', { class:'tnum ytd-rec' },
                `${r.wins ?? 0}-${r.losses ?? 0}${r.ties ? `-${r.ties}` : ''}`),
              h('span', { class:'ytd-lab' }, 'REC')) : null,
            r.fpts != null ? h('span', { class:'seg ytd', title:'Points scored, season to date' },
              h('span', { class:'tnum ytd-val' }, fmt.decimal(r.fpts, 0)),
              h('span', { class:'ytd-lab' }, 'PF')) : null,
            r.fpts_against != null ? h('span', { class:'seg ytd', title:'Points allowed, season to date' },
              h('span', { class:'tnum ytd-val' }, fmt.decimal(r.fpts_against, 0)),
              h('span', { class:'ytd-lab' }, 'PA')) : null,
            // Point differential is the one derived number worth printing: record
            // hides a team that lost three close games to the top of the league.
            (r.fpts != null && r.fpts_against != null) ? h('span', { class:'seg ytd', title:'Points scored minus points allowed' },
              h('span', { class:'tnum ytd-val', style:{ color: r.fpts - r.fpts_against >= 0 ? 'var(--green)' : 'var(--red)' } },
                `${r.fpts - r.fpts_against >= 0 ? '+' : ''}${fmt.decimal(r.fpts - r.fpts_against, 0)}`),
              h('span', { class:'ytd-lab' }, 'DIFF')) : null,
            lgDynasty ? h('span', { class:'seg' }, h('span', { class:'dot', style:{ background:'var(--cat-cornerstone)' } }), `${cs} CS`) : null,
            lgDynasty ? h('span', { class:'seg' }, h('span', { class:'dot', style:{ background:'var(--cat-foundational)' } }), `${fnd} FND`) : null,
            lgDynasty ? h('span', { class:'seg' }, h('span', { class:'dot', style:{ background:'var(--cat-upside)' } }), `${ups} UP`) : null,
            h('span', { class:'seg', title: `PV share: ${(pvShare*100).toFixed(1)}% of league starting ${lgDynasty ? 'value' : 'value over replacement'} now (baseline ${(shareBaseline*100).toFixed(1)}%). ${pvCls.label} band.` },
              h('span', { class:'tnum', style:{ color: shareTone(pvCls.tone), fontWeight:700 } }, `${(pvShare*100).toFixed(1)}%`),
              h('span', { style:{ color:'var(--fg-3)', marginLeft:'4px', fontSize:'0.7rem', textTransform:'uppercase', letterSpacing:'0.04em' } }, 'PV share'),
            ),
            lgDynasty ? h('span', { class:'seg', title: `FV share: ${(fvShare*100).toFixed(1)}% of league ${trajLabels[TRAJ_YEARS-1]} starting value (baseline ${(shareBaseline*100).toFixed(1)}%). ${fvCls.label} band.` },
              h('span', { class:'tnum', style:{ color: shareTone(fvCls.tone), fontWeight:700 } }, `${(fvShare*100).toFixed(1)}%`),
              h('span', { style:{ color:'var(--fg-3)', marginLeft:'4px', fontSize:'0.7rem', textTransform:'uppercase', letterSpacing:'0.04em' } }, 'FV share'),
            ) : null,
        ),
        h('div', { class:'score-cell' },
          h('div', { class:'score', title:'PV: present starting-lineup value (now)' }, fmt.decimal(st,1)),
          lgDynasty ? (() => { const fv = row.fv, d = st > 0 ? (fv - st) / st * 100 : 0; const c = d >= 2 ? 'var(--green)' : d <= -8 ? 'var(--amber)' : 'var(--fg-2)'; return h('div', { class:'delta', style:{ color: c }, title:`FV: starting-lineup value in ${trajLabels[TRAJ_YEARS-1]} (same scale as the ${trajLabels[TRAJ_YEARS-1].slice(2)} bar)` }, `FV ${fmt.decimal(fv, 0)} · ${d >= 0 ? '+' : ''}${d.toFixed(0)}%`); })() : null,
          lgDynasty ? h('div', { class:'arch', style:{ color: tColor } }, tLabel) : null,
        ),
        lgDynasty ? h('div', { class:'str-traj' }, spark) : null
      );
      standings.appendChild(strengthRow);
    });
    main.appendChild(standings);
    const sp = fantasySosPanel(lg);
    if (sp) main.appendChild(sp);
    // IDP leagues get the mirror grid: which offences feed defenders. Returns
    // null for the other four leagues, so no guard is needed here.
    const idp = idpMatchupBlock(lg);
    if (idp) main.appendChild(idp);
    } // end standings tab

    if (tab === 'players') renderLeaguePlayers(main, lg);
    if (tab === 'transactions') renderLeagueTimeline(main, lg);
    if (tab === 'faab') {
      // This week's board first, because it is the live decision; the archetype
      // tables underneath are the reference it is priced against.
      const wb = waiverBoard(lg);
      if (wb) main.appendChild(wb);
      const fp = faabPanel(lg);
      main.appendChild(fp || h('div', { class:'card' },
        h('div', { class:'card-title' }, 'No priced claims'),
        h('p', { class:'tip', style:{ margin:0 } },
          'No waiver claims in this format carried a bid, so there is no market to show.')));
    }
  }

  // ============================================================
  // viewLeague subviews: Players + Timeline
  // ============================================================
  // League-scoped player rankings. Shows the full dynasty ranking list
  // overlaid with ownership in THIS league (which roster has them, or FA).
  // Filters: position, category, ownership scope.
  function weeklyMatchupFor(team, pos, week) {
    const teamKey = String(team || '').toUpperCase();
    const posKey = String(pos || '').toUpperCase();
    const weekNum = Number(week);
    if (!teamKey || teamKey === 'FA' || !weekNum) return null;
    const gridGame = (window.SOS_GRID?.grid?.[posKey]?.[teamKey] || [])
      .find(game => Number(game.week) === weekNum);
    const scheduleGame = (teamSos(teamKey)?.schedule || [])
      .find(game => Number(game.week) === weekNum);
    return gridGame || scheduleGame ? { ...(scheduleGame || {}), ...(gridGame || {}) } : null;
  }

  // Numeric table blanks always stay at the bottom. Multiplying a sentinel by
  // the requested direction used to pull missing expert ranks to the top when
  // the same column was sorted the other way.
  function compareNullableNumbers(av, bv, dir, aName='', bName='') {
    if (av == null && bv == null) return aName.localeCompare(bName);
    if (av == null) return 1;
    if (bv == null) return -1;
    return (Number(av) - Number(bv)) * dir || aName.localeCompare(bName);
  }

  function playerMatchesScopes(scopes, ownerRoster) {
    const selected = new Set(Array.isArray(scopes) && scopes.length ? scopes : ['all']);
    if (selected.has('all')) return true;
    return (selected.has('rostered') && !!ownerRoster)
      || (selected.has('free') && !ownerRoster)
      || (selected.has('mine') && !!ownerRoster?.is_me);
  }

  function renderLeaguePlayers(main, lg) {
    const leagueDynasty = isDynastyLeague(lg);
    const idx = rankIndex();
    const weeklyData = window.WEEKLY_RANKINGS || {};
    const currentWeek = weeklyData.currentWeek || 1;
    const rankedByPid = new Map(idx.all.filter(p => p._sleeperId).map(p => [String(p._sleeperId), p]));
    const weeklyPlayers = (weeklyData.players || []).map(player => ({
      ...(rankedByPid.get(String(player.id)) || {}),
      _sleeperId:String(player.id), _weekly:player,
      name:player.name, pos:player.pos, team:player.team,
    }));
    const weeklyByPid = new Map(weeklyPlayers.map(p => [p._sleeperId, p._weekly]));
    // Mean Sleeper projection over the weeks still to play. The SOS view drops a
    // free agent under 5 a game: a matchup grid is a start/sit tool, and a
    // third-string TE nobody rosters was padding every team block.
    const SOS_FA_FLOOR = 5;
    const restOfSeasonPpg = (pid) => {
      const wk = (weeklyByPid.get(String(pid))?.sleeper || []).slice(currentWeek - 1).filter(v => v != null);
      return wk.length ? wk.reduce((s, v) => s + v, 0) / wk.length : null;
    };
    // Per-roster ownership lookup keyed by Sleeper player id.
    const ownerByPid = new Map();
    for (const r of lg.rosters) {
      for (const pid of (r.players || [])) ownerByPid.set(pid, r);
    }
    // Projection lookup (offense + defense) for the Proj column + source toggle.
    const projO = new Map(), projD = new Map();
    for (const p of (window.OFFENSE_PROJ?.offense?.players || [])) if (p.id) projO.set(p.id, p);
    for (const p of (window.OFFENSE_PROJ?.defense?.players || [])) if (p.id) projD.set(p.id, p);
    const hasProj = projO.size || projD.size;
    const projPointsFor = (pid, src) => {
      if (!pid) return null;
      const rec = projO.get(pid) || projD.get(pid);
      return rec && rec[src] != null ? rec[src] : null;
    };
    // Filter state lives on a per-league key in localStorage so settings
    // survive nav between leagues.
    const lsKey = `tier-sheet-league-players::${lg.id}`;
    const filter = Object.assign(
      { pos:'ALL', cat:'ALL', team:'ALL', scopes:null, q:'',
        sort:lg.type === 0 ? 'weekly-sleeper' : 'rank', dir:lg.type === 0 ? 'desc' : 'asc',
        proj:'blend', view:lg.type === 0 ? 'weekly' : 'stats' },
      JSON.parse(localStorage.getItem(lsKey) || '{}')
    );
    if (!Array.isArray(filter.scopes)) filter.scopes = [filter.scope || 'all'];
    delete filter.scope;
    // A redraft filter persisted from before the gate could still name a column
    // that no longer renders. Fall back to the view's natural sort.
    if (!leagueDynasty && filter.sort === 'value') {
      filter.sort = 'weekly-sleeper'; filter.dir = 'desc';
    }
    const teamOfP = (p) => (window.PLAYERS[p._sleeperId] || {}).team || p.team || null;
    const persist = () => { try { localStorage.setItem(lsKey, JSON.stringify(filter)); } catch {} };

    // No title here: the active Players tab above already names the view, and on
    // a phone a second plaque costs 41px of the screen to say it twice.

    // Filter bar
    const filterBar = h('div', { class:'filters' });
    const search = h('input', { type:'search', placeholder:'Search players', value: filter.q,
      oninput:(e) => { filter.q = e.target.value.trim(); persist(); render(); } });
    filterBar.appendChild(h('div', { class:'group' }, h('label', null, 'Search'), search));

    const viewBtns = h('div', { class:'toggle-group player-table-views', role:'group', 'aria-label':'Player table view' });
    for (const [key, label, sort, dir] of [
      ['stats','Stats','rank','asc'], ['weekly','Weekly','weekly-sleeper','desc'],
      // ROS is the same table as Weekly, opened on the rest-of-season column
      // instead of the week's Sleeper projection. It is a tab and not just a
      // column because the column is the 10th of eighteen inside a view named
      // after the WEEK, and nothing in the navigation said "ROS" at all, so
      // "it's unclear to me where ROS rankings are in the site" (2026-09-16)
      // was a fair reading of the UI rather than a miss.
      ['ros','ROS','weekly-ros','asc'],
      ['sleeper-weeks','Sleeper weeks',`sw:${currentWeek}`,'desc'], ['sos','SOS',`wk:${currentWeek}`,'desc'],
    ]) {
      viewBtns.appendChild(h('button', {
        class:`toggle ${filter.view===key?'active':''}`,
        'aria-pressed':filter.view===key ? 'true' : 'false',
        onclick:() => {
          filter.view = key; filter.sort = sort; filter.dir = dir; persist();
          viewLeague(lg.id, 'players');
        },
      }, label));
    }
    filterBar.appendChild(h('div', { class:'group' }, h('label', null, 'View'), viewBtns));

    const posBtns = h('div', { class:'toggle-group rankings-pos-toggle' });
    // 'ros' renders the weekly table; keep the two in one predicate so a later
    // column or layout change cannot land on Weekly and skip ROS.
    const weeklyTable = filter.view === 'weekly' || filter.view === 'ros';
    const weeklyView = weeklyTable || filter.view === 'sleeper-weeks';
    const leagueHasKicker = (lg.roster_positions || []).includes('K');
    const posOptions = lg.is_idp && !weeklyView
      ? ['ALL','QB','RB','WR','TE','FLEX','LB','DB','DL']
      : ['ALL','QB','RB','WR','TE','FLEX'];
    if (filter.view === 'weekly' && leagueHasKicker) posOptions.push('K');
    if (!posOptions.includes(filter.pos)) { filter.pos = 'ALL'; persist(); }
    for (const p of posOptions) {
      posBtns.appendChild(h('button', {
        class:`toggle ${filter.pos===p?'active':''}`,
        onclick:(e) => {
          filter.pos = p;
          if (p === 'K') { filter.sort = 'kicker-exp'; filter.dir = 'desc'; }
          else if (String(filter.sort).startsWith('kicker-')) { filter.sort = 'weekly-sleeper'; filter.dir = 'desc'; }
          persist();
          posBtns.querySelectorAll('.toggle').forEach(b => b.classList.toggle('active', b===e.target));
          render(); }
      }, p));
    }
    filterBar.appendChild(h('div', { class:'group' }, h('label', null, 'Pos'), posBtns));

    if (filter.view === 'stats') {
      const catSel = h('select', { 'aria-label':'Filter by category', onchange:(e) => { filter.cat = e.target.value; persist(); render(); } });
      catSel.appendChild(h('option', { value:'ALL' }, 'All Categories'));
      for (const [cid, label] of Object.entries(window.CATEGORY_LABELS)) {
        catSel.appendChild(h('option', { value:cid, selected: filter.cat===cid?'':null }, label));
      }
      filterBar.appendChild(h('div', { class:'group' }, h('label', null, 'Category'), catSel));
    }

    const teamSel = h('select', { 'aria-label':'Filter by NFL team', onchange:(e) => { filter.team = e.target.value; persist(); render(); } });
    teamSel.appendChild(h('option', { value:'ALL' }, 'All Teams'));
    for (const t of [...new Set(idx.all.map(teamOfP).filter(Boolean))].sort()) {
      teamSel.appendChild(h('option', { value:t, selected: filter.team===t?'':null }, t));
    }
    filterBar.appendChild(h('div', { class:'group' }, h('label', null, 'Team'), teamSel));

    const scopeBtns = h('div', { class:'toggle-group', role:'group', 'aria-label':'Player ownership scope' });
    for (const [k, lbl] of [['all','All'],['rostered','Rostered'],['free','Free Agent'],['mine',"You"]]) {
      scopeBtns.appendChild(h('button', {
        class:`toggle ${filter.scopes.includes(k)?'active':''}`,
        'data-scope':k,
        'aria-pressed':filter.scopes.includes(k) ? 'true' : 'false',
        onclick:() => {
          const next = new Set(filter.scopes);
          if (k === 'all') { next.clear(); next.add('all'); }
          else {
            next.delete('all');
            if (next.has(k)) next.delete(k); else next.add(k);
            if (!next.size) next.add('all');
          }
          filter.scopes = [...next]; persist();
          scopeBtns.querySelectorAll('.toggle').forEach(button => {
            const active = filter.scopes.includes(button.dataset.scope);
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
          });
          render(); }
      }, lbl));
    }
    filterBar.appendChild(h('div', { class:'group' }, h('label', null, 'Scope'), scopeBtns));

    if (hasProj && filter.view === 'stats') {
      const projBtns = h('div', { class:'toggle-group' });
      for (const [k, lbl] of [['blend','Blended'],['pp','PP'],['sleeper','Sleeper'],['clay','Clay']]) {
        projBtns.appendChild(h('button', {
          class:`toggle ${filter.proj===k?'active':''}`,
          title: k==='pp' ? 'PrizePicks (offense only)' : k==='clay' ? 'Clay (IDP only)' : '',
          onclick:(e) => { filter.proj = k; persist();
            projBtns.querySelectorAll('.toggle').forEach(b => b.classList.toggle('active', b===e.target));
            render(); }
        }, lbl));
      }
      filterBar.appendChild(h('div', { class:'group' }, h('label', null, 'Proj Src'), projBtns));
    }
    main.appendChild(filterBar);

    const tableWrap = h('div', { class:'card', style:{ padding:0, overflow:'hidden' } });
    main.appendChild(tableWrap);

    // Position scope: this league's lineup positions only. IDP positions
    // (LB/DB/DL/CB/S/DT/DE/NT) only show in IDP leagues. K appears only on its
    // own Weekly position board, and only when this league starts one. Without
    // this gate, special teams pollute every league's all-player view.
    const idpPositions = new Set(['LB','DB','DL','CB','S','DT','DE','NT']);
    const irrelevantPositions = new Set(['DST','DEF','P']);
    const isLeagueRelevantPos = (pos) => {
      if (pos === 'K') return filter.view === 'weekly' && leagueHasKicker && filter.pos === 'K';
      if (irrelevantPositions.has(pos)) return false;
      if (!lg.is_idp && idpPositions.has(pos)) return false;
      return true;
    };

    const kickerByPid = new Map((window.KICKER_MODEL?.kickers || []).map(kicker => {
      const initialAndLast = String(kicker.name || '').replace(/^([A-Za-z])\./, '$1 ');
      return [sleeperIdForFuzzy(initialAndLast, 'K'), kicker];
    }).filter(([pid]) => pid));
    const kickerProjectionFor = (player) => kickerByPid.get(String(player._sleeperId)) || null;

    function render() {
      tableWrap.innerHTML = '';
      if (weeklyView && !weeklyPlayers.length) {
        tableWrap.appendChild(h('div', { class:'empty' }, 'Weekly data unavailable.'));
        return;
      }
      const filtered = (weeklyView ? weeklyPlayers : idx.all).filter(p => {
        if (!isLeagueRelevantPos(p.pos)) return false;
        if (filter.pos === 'FLEX') { if (!['RB','WR','TE'].includes(p.pos)) return false; }
        else if (filter.pos !== 'ALL' && p.pos !== filter.pos) return false;
        if (filter.view === 'stats' && filter.cat !== 'ALL' && p.category !== filter.cat) return false;
        if (filter.team !== 'ALL' && teamOfP(p) !== filter.team) return false;
        if (filter.q && !norm(p.name).includes(norm(filter.q))) return false;
        const ownerRoster = p._sleeperId ? ownerByPid.get(p._sleeperId) : null;
        if (!playerMatchesScopes(filter.scopes, ownerRoster)) return false;
        if (filter.view === 'sos' && !ownerRoster && !(restOfSeasonPpg(p._sleeperId) >= SOS_FA_FLOOR)) return false;
        return true;
      });
      if (!filtered.length) {
        tableWrap.appendChild(h('div', { class:'empty' }, 'No players match these filters.'));
        return;
      }
      // Vegas minus Sleeper for the CURRENT week only. Only 247 of 420 rows
      // carry a market line, so most of this column is legitimately blank.
      const vsDelta = (row) => {
        if (!row) return null;
        const model = row.sleeper?.[currentWeek - 1];
        if (row.vegas == null || model == null) return null;
        return row.vegas - model;
      };
      // Every market projection borrows something from Sleeper. The share of
      // projected POINTS that came from a fill is what separates a real market
      // read from Sleeper wearing a market label, and past 40 percent the delta
      // is mostly Sleeper against Sleeper.
      const BORROWED_HEAVY = 0.40;
      const builtExpertMeta = new Map((weeklyData.trackedExperts || [])
        .map(expert => [String(expert.id), expert]));
      // Gibbs (FantasyPros 1576) is excluded: his dedicated Gibbs Wk column
      // reads the FantasyPros board he actually posts (stored under half-PPR),
      // while the one FantasyPros stores under PPR for him is not his posted
      // board. On
      // 2026-09-24 it had Rashee Rice WR16 against WR29 on his own half-PPR
      // board, WR27 on CBS and WR28 on X, and the column was labelled only
      // "J. Gibbs", so it read as his opinion. It was not.
      // Weekly expert columns are also kept off the ROS view: a weekly rank
      // under a rest-of-season heading is the same misread.
      const trackedExperts = (filter.view === 'ros' ? [] : fpRotationExperts(weeklyData))
        .filter(expert => String(expert.id) !== '1576').map(expert => {
        const built = builtExpertMeta.get(String(expert.id));
        return {
          id: String(expert.id),
          key: built?.key || `fp-${expert.id}`,
          name: expert.name,
          label: built?.label || expert.name.split(/\s+/).pop(),
          players: expert.total || 0,
        };
      });
      // An old saved sort on his FantasyPros column now lands on his real one.
      if (filter.sort === 'weekly-gibbs' || filter.sort === 'weekly-x:gibbs' || filter.sort === 'weekly-x:fp-1576'
          || filter.sort === 'weekly-gibbs-wk-ppr') {
        filter.sort = 'weekly-gibbs-wk'; filter.dir = 'asc'; persist();
      }
      if (filter.sort === 'weekly-gibbs-ros-ppr') {
        filter.sort = 'weekly-gibbs-x'; filter.dir = 'asc'; persist();
      }
      // A saved sort can name a column the other view hides; fall back to
      // that view's default rather than sorting by something off screen.
      const rosOnlySort = ['weekly-ros', 'weekly-gibbs-x'].includes(filter.sort);
      const weekOnlySort = ['weekly-vegas', 'weekly-sleeper', 'weekly-vsdelta', 'weekly-ecr',
        'weekly-gibbs-wk'].includes(filter.sort)
        || /^(weekly-x:|wc:)/.test(filter.sort || '');
      if (filter.view === 'ros' ? weekOnlySort : rosOnlySort) {
        [filter.sort, filter.dir] = filter.view === 'ros' ? ['weekly-ros', 'asc'] : ['weekly-sleeper', 'desc'];
        persist();
      }
      if (String(filter.sort).startsWith('weekly-x:')
          && !trackedExperts.some(expert => expert.key === String(filter.sort).slice(9))) {
        filter.sort = 'weekly-sleeper'; filter.dir = 'desc'; persist();
      }
      // Sort.
      const dir = filter.dir === 'desc' ? -1 : 1;
      const cmp = (a, b) => {
        let av, bv;
        if (filter.sort === 'weekly-vegas' || filter.sort === 'weekly-sleeper'
            || filter.sort === 'weekly-ecr' || filter.sort === 'weekly-gibbs'
            || filter.sort === 'weekly-ros'
            || filter.sort === 'weekly-vsdelta'
            // Both Gibbs X columns were handled INSIDE weeklyValue but never
            // listed here, so the comparator never routed to them and clicking
            // either header sorted nothing. The handler below was dead code.
            || filter.sort === 'weekly-gibbs-x' || filter.sort === 'weekly-gibbs-wk'
            || (typeof filter.sort === 'string' && filter.sort.startsWith('weekly-x:'))
            || (typeof filter.sort === 'string' && filter.sort.startsWith('kicker-'))
            || (typeof filter.sort === 'string' && filter.sort.startsWith('sw:'))
            || (typeof filter.sort === 'string' && filter.sort.startsWith('wc:'))) {
          const weeklyValue = (player) => {
            const row = player._weekly || {};
            // wc: = one expected stat behind the Vegas total. Absent stat sorts
            // as missing, not as zero, so a QB never outranks a WR on receptions.
            if (filter.sort.startsWith('wc:')) return row.vegasStats?.[filter.sort.slice(3)];
            if (filter.sort === 'weekly-vegas') return row.vegas;
            if (filter.sort === 'weekly-sleeper') return row.sleeper?.[currentWeek - 1];
            if (filter.sort === 'weekly-ecr') return row.ecr;
            if (filter.sort === 'weekly-gibbs') return row.gibbs;
            if (String(filter.sort).startsWith('weekly-x:')) {
              const key = String(filter.sort).slice(9);
              const expert = trackedExperts.find(item => item.key === key);
              return expert ? fpWeeklyRank(expert.id, player.pos, player._sleeperId) : null;
            }
            if (String(filter.sort).startsWith('kicker-')) {
              const kicker = kickerProjectionFor(player);
              return kicker?.[String(filter.sort).slice(7)];
            }
            if (filter.sort === 'weekly-ros') return row.ros;
            // `player`, not `p`. weeklyValue's parameter is named `player`, and
            // `p` resolves to nothing here, so this threw ReferenceError and
            // took the whole table render down with it. It never surfaced
            // because the comparator was not routed to these keys either: two
            // bugs that hid each other, and the column just looked inert.
            if (filter.sort === 'weekly-gibbs-x') return gibbsRosPprRank(player._sleeperId)?.rank ?? null;
            if (filter.sort === 'weekly-gibbs-wk') return gibbsWeekRank(player._sleeperId)?.rank ?? null;
            // Null either side means no comparison exists, so the row stays
            // blank. The null branch below pushes it last in BOTH directions,
            // which is the whole point: a missing line is not a zero edge.
            if (filter.sort === 'weekly-vsdelta') return vsDelta(row);
            return row.sleeper?.[Number(filter.sort.slice(3)) - 1];
          };
          av = weeklyValue(a); bv = weeklyValue(b);
          return compareNullableNumbers(av, bv, dir, a.name, b.name);
        }
        if (typeof filter.sort === 'string' && filter.sort.startsWith('wk:')) {
          const wnum = +filter.sort.slice(3);
          const oppPA = (p) => { const s = teamSos((window.PLAYERS[p._sleeperId] || {}).team || p.team); if (!s) return null; const g = s.schedule.find(x => x.week === wnum); if (!g) return null; const e = teamEnv(g.opp); return e ? e.implied_pa : null; };
          av = oppPA(a); bv = oppPA(b);
          if (av !== bv) {
            if (av == null) return 1; if (bv == null) return -1;
            return (av - bv) * dir; // desc = weakest opponent D (easiest) first
          }
          // A whole team shares one opponent, so the week column ties by the
          // dozen. Break it on that week's projection, best first either way.
          return compareNullableNumbers(weeklyByPid.get(String(a._sleeperId))?.sleeper?.[wnum - 1],
            weeklyByPid.get(String(b._sleeperId))?.sleeper?.[wnum - 1], -1, a.name, b.name);
        }
        if (typeof filter.sort === 'string' && filter.sort.startsWith('xr:')) {
          const src = expertSources().find(s => s.id === filter.sort.slice(3));
          const rk = (p) => (src && expertRankOf(src, p.name, p._sleeperId)) ?? 9999;
          av = rk(a); bv = rk(b); return (av - bv) * dir; // asc = better rank first
        }
        switch (filter.sort) {
          // dir is -1 for desc, so (av - bv) * dir puts the highest first on the first
          // click. These used (bv - av) * dir, flipping twice: Value ↓ listed 12.5 first.
          case 'value': av = tierValue(a, lg); bv = tierValue(b, lg); return (av - bv) * dir;
          case 'proj':  av = projPointsFor(a._sleeperId, filter.proj) ?? -1; bv = projPointsFor(b._sleeperId, filter.proj) ?? -1; return (av - bv) * dir;
          case 'gap':   av = mispricingIndex().get(String(a._sleeperId))?.gap ?? -999; bv = mispricingIndex().get(String(b._sleeperId))?.gap ?? -999; return (av - bv) * dir;
          case 'vor':   av = vorByPid(a._sleeperId, lg, filter.proj) ?? -9999; bv = vorByPid(b._sleeperId, lg, filter.proj) ?? -9999; return (av - bv) * dir;
          case 'ppslp': av = ppEdgeByPid(a._sleeperId) ?? -9999; bv = ppEdgeByPid(b._sleeperId) ?? -9999; return (av - bv) * dir;
          case 'age':   av = a.age ?? 99; bv = b.age ?? 99; return (av - bv) * dir;
          case 'pos':   av = `${a.pos}|${a._posRank||999}`; bv = `${b.pos}|${b._posRank||999}`; return av.localeCompare(bv) * dir;
          case 'name':  return a.name.localeCompare(b.name) * dir;
          default:      return ((a._overallRank||9999) - (b._overallRank||9999)) * dir;
        }
      };
      const sorted = filtered.slice().sort(cmp);
      const limit = weeklyView ? sorted.length : 250;
      const rows = sorted.slice(0, limit);

      const sortHdr = (key, label, opts={}) => {
        const isActive = filter.sort === key;
        const arrow = isActive ? (filter.dir === 'desc' ? ' ↓' : ' ↑') : '';
        const activate = () => {
          if (filter.sort === key) filter.dir = filter.dir === 'asc' ? 'desc' : 'asc';
          else {
            filter.sort = key;
            filter.dir = (key === 'rank' || key === 'age' || key === 'pos' || key === 'name'
              || key === 'weekly-ecr' || key === 'weekly-gibbs'
              || key === 'weekly-ros'
              // Both Gibbs X columns are RANKS. They were missing here, so the
              // first click sorted them descending and put his worst-ranked
              // player on top, which reads as a broken column rather than a
              // direction choice.
              || key === 'weekly-gibbs-x' || key === 'weekly-gibbs-wk'
              || (typeof key === 'string' && key.startsWith('weekly-x:'))
              || (typeof key === 'string' && key.startsWith('xr:'))) ? 'asc' : 'desc';
          }
          persist(); render();
        };
        return h('th', {
          class: `clickable${isActive ? ' sort-active' : ''}${opts.right ? ' right' : ''}${opts.center ? ' center' : ''}`,
          style: opts.style,
          title: opts.title,
          tabindex:'0', 'aria-sort':isActive ? (filter.dir === 'desc' ? 'descending' : 'ascending') : 'none',
          onclick:activate,
          onkeydown:(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault(); activate();
          },
        }, label + arrow);
      };

      // shared per-row helpers
      const projPl = (pid) => (projO.get(pid) || projD.get(pid));
      const teamOf = (pid) => (window.PLAYERS[pid] || {}).team;
      const schedCache = {};
      const schedFor = (team) => {
        if (!(team in schedCache)) { const s = teamSos(team), m = {}; if (s) for (const g of s.schedule) m[g.week] = g; schedCache[team] = m; }
        return schedCache[team];
      };
      const ownerInfo = (pid) => {
        const r = pid ? ownerByPid.get(pid) : null;
        const isMine = r && r.is_me;
        const stance = r ? rosterStance(r, lg) : null;
        const cell = r
          ? h('a', { href: `#roster/${lg.id}/${r.roster_id}`, class: `badge stance-${stance}${isMine ? ' you' : ''} owner-link`,
                     title: `${r.team_name} (${r.owner_name})`, onclick: (e) => e.stopPropagation() }, r.team_name)
          : h('span', { class:'badge', style:{ background:'transparent', color:'var(--fg-3)', borderColor:'var(--border)' } }, 'FA');
        return { r, isMine, cell };
      };
      const idCells = (p, i) => [
        h('td', { class:'right tnum', style:{ color:'var(--fg-3)' } }, String(i + 1)),
        h('td', { class:'right tnum', style:{ fontWeight:700 } }, String(p._overallRank || i+1)),
        h('td', null, h('div', { class:'name-cell' }, h('span', { class:'name' }, p.name),
          p.rookie ? h('span', { class:'badge rookie', style:{ marginLeft:'4px' } }, 'Rookie') : null,
          markButton(lg.id, p._sleeperId || p.id, p.name))),
        h('td', null, h('div', { style:{ display:'flex', alignItems:'center', gap:'6px' } }, posChip(p.pos),
          (() => { const pr = posRankFor(p, lg); return pr
            ? h('span', { class:'tip tnum', title: pr.label }, `${p.pos}${pr.rank}`) : null; })())),
        h('td', null, teamChip(teamOfP(p)), ' ', envChip(teamOf(p._sleeperId) || p.team)),
      ];
      const weeklyNameCell = (p) => h('td', null, h('div', { class:'name-cell' },
        h('button', {
          type:'button', class:'name player-name-button',
          onclick:(event)=>{ event.stopPropagation(); openPlayerDetail(p.name, p._sleeperId); },
        }, p.name),
        injuryChip(p._sleeperId),
        // Star him if he is not yours, block him if he is. One click from the list.
        markButton(lg.id, p._sleeperId, p.name)));
      const emptyValue = () => h('span', { class:'muted' }, '·');
      // The expected stat line behind the Vegas points column. Without it that
      // column is a number with no audit trail: a stale line and a real market
      // edge look identical. Decimals are kept on counting stats because these
      // are expected values, not box scores. 0.59 receiving TDs is the signal.
      const VEGAS_COMPONENTS = [
        { k:'pass_yd',  label:'PaYd', dp:0, pos:['QB'] },
        { k:'pass_td',  label:'PaTD', dp:2, pos:['QB'] },
        { k:'pass_int', label:'INT',  dp:2, pos:['QB'] },
        { k:'rush_yd',  label:'RuYd', dp:0 },
        { k:'rush_td',  label:'RuTD', dp:2 },
        { k:'rec',      label:'Rec',  dp:1 },
        { k:'rec_yd',   label:'ReYd', dp:0 },
        { k:'rec_td',   label:'ReTD', dp:2 },
      ];
      // A stat the market never priced was filled from Sleeper, so it is the
      // model wearing a market label. Dim it rather than dropping it: the value
      // still feeds the total and hiding it would make the row stop adding up.
      const componentCell = (weekly, c) => {
        const stats = weekly.vegasStats;
        const v = stats ? stats[c.k] : null;
        if (v == null) return h('td', { class:'right tnum' }, emptyValue());
        const filled = (weekly.vegasBorrowed || []).includes(c.k);
        return h('td', { class:'right tnum', style: filled ? { color:'var(--fg-3)' } : null,
          title: filled
            ? `${c.label} ${fmt.decimal(v, c.dp)} filled from Sleeper, no BettingPros market for it.`
            : `${c.label} ${fmt.decimal(v, c.dp)} from a priced BettingPros line.` },
          fmt.decimal(v, c.dp));
      };
      const pointCell = (value, title) => h('td', { class:'right tnum', title },
        value == null ? emptyValue() : fmt.decimal(value, 1));
      const rankCell = (p, value, opts={}) => h('td', {
        class:'right tnum', title:opts.title,
        style: opts.dim && value != null ? { color:'var(--fg-3)' } : null,
      }, value == null ? emptyValue() : `${p.pos}${value}`);

      // Rest-of-season boards are republished on the experts' own schedule, not
      // ours, so a fresh data refresh can still be serving a two-week-old board.
      // ROS_STALE_DAYS is where "worth reading" stops; past it the column is
      // dimmed and the age is stated rather than implied.
      const ROS_STALE_DAYS = 8;
      const rosMeta = (weeklyData.coverage || {}).ros || {};
      const rosStale = rosMeta.staleDays != null && rosMeta.staleDays >= ROS_STALE_DAYS;
      const rosAsOf = rosMeta.updated
        ? `Board as of ${rosMeta.updated}, ${Math.round(rosMeta.staleDays)}d old`
        : 'Board date unknown';
      const rosTitle = `FantasyPros rest-of-season PPR expert consensus positional rank`
        + ` (${rosMeta.experts || '?'} experts, a much thinner pool than the weekly board).`
        + ` ${rosAsOf}.${rosStale ? ' Stale, treat as a prior and not as a current read.' : ''}`;
      // He has no rest-of-season board today. Render the column only when one
      // exists, so it appears by itself the week he starts publishing.
      const hasGibbsRos = ((weeklyData.coverage || {}).gibbsRosPlayers || 0) > 0;
      // His X board is a separate, fresher source than his FantasyPros feed.
      const gibbsRosPosted = window.GIBBS_ROS ? window.GIBBS_ROS.postedAt : null;
      // Hidden when it is another week's board: a refresh that failed on a
      // Tuesday would otherwise show week 3 ranks beside week 4 projections.
      const gibbsWeekPosted = window.GIBBS_WEEK
        && (window.GIBBS_WEEK.week == null || window.GIBBS_WEEK.week === currentWeek)
        ? window.GIBBS_WEEK.postedAt : null;
      const gibbsRosThrough = window.GIBBS_ROS ? window.GIBBS_ROS.rosUpdatedThrough : null;
      const gibbsWeekUpdated = window.GIBBS_WEEK?.updatedLabel || null;
      const gibbsWeekDepth = window.GIBBS_WEEK
        ? Object.values(window.GIBBS_WEEK.positions || {}).reduce((n, r) => n + r.length, 0)
        : 0;
      // He publishes half-PPR and these leagues are full PPR, so the scoring of
      // his board is part of the number. The builder takes whichever scoring he
      // submitted last, which is not always the PPR one: measured 2026-09-19 his
      // PPR mirror sat three days behind with a different RB1.
      const weeklyOpponentCell = (p) => {
        const team = teamOfP(p);
        const pos = String(p.pos || '').toUpperCase();
        const game = weeklyMatchupFor(team, pos, currentWeek);
        if (!team || team === 'FA') return h('td', { class:'center muted weekly-opp' }, '·');
        if (!game) return h('td', { class:'center muted weekly-opp' }, 'BYE');
        const rank = game.rank ?? null;
        const n = window.SOS_GRID?.n_def || 32;
        const title = rank != null
          ? `Week ${currentWeek} ${game.home ? 'vs ' : '@ '}${game.opp}: D vs ${pos} #${rank}/${n} (${game.fpa ?? '?'} PPR/g allowed)`
          : `Week ${currentWeek} ${game.home ? 'vs ' : '@ '}${game.opp}; no defense-vs-position rank for ${pos || 'this position'}`;
        // Weather only for the week the forecast is for, and only when it
        // matters: a flag, never a temperature on every row.
        const wx = window.WEATHER && window.WEATHER.week === currentWeek ? gameWeatherFor(team) : null;
        const wxFlag = wx && wx.flag;
        const wxTitle = wxFlag ? ` Weather: ${Math.round(wx.temp_f)}°F, wind ${Math.round(wx.wind_mph)} mph (gusts ${Math.round(wx.gust_mph)}), ${Math.round(wx.precip_prob || 0)}% precip.` : '';
        return h('td', { class:'center weekly-opp', title: title + wxTitle, style:{ color:defRankColor(rank, n) } },
          h('div', { class:'weekly-opp-team' }, game.opp),
          h('div', { class:'weekly-opp-rank' }, rank != null ? `#${rank}` : '·'),
          wxFlag ? h('div', { class:'weekly-opp-wx' }, wxFlag.toUpperCase()) : null);
      };

      const kickerOnly = filter.view === 'weekly' && filter.pos === 'K' && leagueHasKicker;
      // Weekly columns belong on the Weekly view and rest-of-season columns on
      // the ROS view, never both: a weekly rank beside a ROS rank under the
      // same heading is how a WR16 for this week read as his ROS opinion.
      const isRosView = filter.view === 'ros';
      let tbl;
      if (weeklyTable) {
        tbl = h('table', { class:'data weekly-rankings-table' },
          h('thead', null, h('tr', null,
            h('th', { class:'right', style:{ width:'46px' } }, '#'),
            h('th', null, 'Player'), h('th', null, 'Pos'), h('th', null, 'Team'),
            h('th', { class:'center', title:`Week ${currentWeek} opponent and defense-vs-position rank` }, 'Opp'),
            h('th', null, 'Owner'),
            ...(kickerOnly ? [
              sortHdr('weekly-sleeper', 'Sleeper pts', { right:true, title:'Sleeper weekly kicker projection.' }),
              sortHdr('kicker-exp', 'K Proj', { right:true, title:`Week ${window.KICKER_MODEL?.week || currentWeek} expected kicker points from the dedicated model.` }),
              sortHdr('kicker-floor', 'Floor', { right:true, title:'20th-percentile kicker outcome.' }),
              sortHdr('kicker-ceil', 'Ceil', { right:true, title:'90th-percentile kicker outcome.' }),
              sortHdr('kicker-pGe15', '15+', { right:true, title:'Modelled chance of scoring 15 or more points.' }),
            ] : [
              isRosView ? null : sortHdr('weekly-vegas', 'Vegas pts', { right:true, title:'Week PPR projection from price-adjusted BettingPros player props. Missing scoring components are filled from Sleeper.' }),
              isRosView ? null : sortHdr('weekly-sleeper', 'Sleeper pts', { right:true, title:'Sleeper weekly PPR projection.' }),
              isRosView ? null : sortHdr('weekly-vsdelta', 'V−S', { right:true, title:`Vegas minus Sleeper for week ${currentWeek}. Green = the market projects him above the model, red = below. Blank when either side has no number; blanks sort last both ways. An asterisk means most of the Vegas projection was filled in from Sleeper, so that delta is the model against itself, not market signal.` }),
              isRosView ? null : sortHdr('weekly-ecr', 'FP ECR', { right:true, title:'FantasyPros weekly PPR expert consensus positional rank.' }),
              // The view says Weekly or ROS, so no header repeats it: FP ECR
              // is the week's consensus on Weekly and the ROS consensus on ROS.
              isRosView ? sortHdr('weekly-ros', 'FP ECR', { right:true, title:rosTitle }) : null,
              ...trackedExperts.map(t => sortHdr(`weekly-x:${t.key}`, t.label, { right:true,
                title:`${t.name} weekly PPR positional rank, isolated FantasyPros board ${t.id}. ${t.players} players ranked. Manage columns in Expert Rotation.` })),

            // Every rank on this table is PPR. An asterisk marks one this site
            // converted from half-PPR data, so the only thing a header has to
            // say is whether it was converted.
            gibbsRosPosted && window.GIBBS_PPR_ROS && isRosView ? sortHdr('weekly-gibbs-x', 'Gibbs*', { right:true,
              title:`* = PPR converted by this site from Jacob Gibbs's half-PPR rest-of-season board (his FantasyPros board, expert 1576, the one his ROS cards label half-PPR). His order sets the value slots, then each player gets +0.5 per projected catch and the list is re-sorted within position, so a player who catches nothing never rises on his own. His unconverted half-PPR rank is in each cell's tooltip. Board ${gibbsRosPosted}${gibbsRosThrough ? `, updates through ${gibbsRosThrough}` : ''}.` }) : null,
            gibbsWeekPosted && !isRosView ? sortHdr('weekly-gibbs-wk', 'Gibbs', { right:true,
              title:`Jacob Gibbs's own board for this week, the start/sit list; `
                + `the ROS view answers a different question. `
                + `Pulled ${gibbsWeekPosted}${gibbsWeekUpdated ? ` (${gibbsWeekUpdated})` : ''} from his FantasyPros board, the one he posts to X as his PPR flex ranks; `
                + `${gibbsWeekDepth} players ranked. A blank means he has not ranked that player, not that nobody rosters him.` }) : null,
              ...(isRosView ? [] : VEGAS_COMPONENTS).map(c => sortHdr(`wc:${c.k}`, c.label, { right:true,
                title:`Expected ${c.label} behind the Vegas points column. Greyed when that stat had no market line and was filled from Sleeper.` })),
            ]))),
          h('tbody', null, ...rows.map((p, i) => {
            const o = ownerInfo(p._sleeperId), weekly = p._weekly;
            return h('tr', { class:o.isMine ? 'you' : '', onclick:()=>openPlayerDetail(p.name, p._sleeperId) },
              h('td', { class:'right tnum muted' }, i + 1), weeklyNameCell(p),
              h('td', null, posChip(p.pos)), h('td', null, teamChip(teamOfP(p))),
              weeklyOpponentCell(p), h('td', null, o.cell),
              ...(kickerOnly ? (() => {
                const kicker = kickerProjectionFor(p);
                return [
                  pointCell(weekly.sleeper?.[currentWeek - 1], `Sleeper week ${currentWeek} kicker projection`),
                  pointCell(kicker?.exp, 'Dedicated kicker model expected points'),
                  pointCell(kicker?.floor, '20th-percentile outcome'),
                  pointCell(kicker?.ceil, '90th-percentile outcome'),
                  h('td', { class:'right tnum', title:'Modelled chance of 15 or more points' },
                    kicker?.pGe15 == null ? emptyValue() : `${Math.round(kicker.pGe15 * 100)}%`),
                ];
              })() : [
                isRosView ? null : pointCell(weekly.vegas, weekly.vegasBorrowed?.length
                  ? `Market stats plus Sleeper fills: ${weekly.vegasBorrowed.join(', ')}` : 'BettingPros market projection'),
                isRosView ? null : pointCell(weekly.sleeper?.[currentWeek - 1], `Sleeper week ${currentWeek} PPR projection`),
                isRosView ? null : (() => {
                  const d = vsDelta(weekly);
                  if (d == null) {
                    return h('td', { class:'right tnum', title: weekly.vegas == null
                      ? 'No BettingPros market line for this player.'
                      : `No Sleeper projection for week ${currentWeek}.` }, emptyValue());
                  }
                  const share = weekly.vegasBorrowedShare;
                  const heavy = share != null && share >= BORROWED_HEAVY;
                  const borrowedList = (weekly.vegasBorrowed || []).join(', ');
                  const title = heavy
                    ? `Vegas ${fmt.decimal(weekly.vegas, 1)} minus Sleeper ${fmt.decimal(weekly.sleeper[currentWeek - 1], 1)}. ${Math.round(share * 100)}% of the Vegas number was filled from Sleeper (${borrowedList}), so read this delta as noise, not market signal.`
                    : `Vegas ${fmt.decimal(weekly.vegas, 1)} minus Sleeper ${fmt.decimal(weekly.sleeper[currentWeek - 1], 1)}.${share != null ? ` ${Math.round(share * 100)}% filled from Sleeper${borrowedList ? ` (${borrowedList})` : ''}.` : ''}`;
                  return h('td', { class:`right tnum${d > 0 ? ' delta-up' : d < 0 ? ' delta-down' : ''}`, title },
                    `${d > 0 ? '+' : ''}${fmt.decimal(d, 1)}`,
                    heavy ? h('span', { class:'vs-borrowed', title }, '*') : null);
                })(),
              isRosView ? null : rankCell(p, weekly.ecr),
              isRosView ? rankCell(p, weekly.ros, { dim:rosStale, title:rosAsOf }) : null,
              ...trackedExperts.map(t => rankCell(p, fpWeeklyRank(t.id, p.pos, p._sleeperId))),

              gibbsRosPosted && window.GIBBS_PPR_ROS && isRosView ? (() => {
                const g = gibbsRosPprRank(p._sleeperId);
                if (!g) return h('td', { class:'right tnum' }, emptyValue());
                return h('td', { class:'right tnum', title:
                  `${g.pos}${g.rank} in PPR, converted from his half-PPR board, where he is `
                  + `${g.pos}${g.halfRank} (${g.rec} projected catches).`
                  + (g.noProjection ? ' No projection, so he holds the slot Gibbs gave him.' : '') },
                  `${g.pos}${g.rank}`);
              })() : null,
              gibbsWeekPosted && !isRosView ? (() => {
                const g = gibbsWeekRank(p._sleeperId);
                // Absent means he has not ranked him this week, which is
                // information, not a missing lookup, so it reads as a blank
                // rather than as a zero or a made-up rank.
                if (!g) return h('td', { class:'right tnum' }, emptyValue());
                // Against the PPR ROS* rank, so both sides are PPR.
                const ros = gibbsRosPprRank(p._sleeperId);
                const moved = ros && ros.pos === g.pos ? ros.rank - g.rank : null;
                return h('td', { class:'right tnum', title:
                  `${g.pos}${g.rank} on his week board`
                  + (g.flexRank ? `, #${g.flexRank} overall among flex starters` : '') + '.'
                  + (g.opp ? ` Opponent ${g.opp}.` : '')
                  + (moved ? ` He has him ${Math.abs(moved)} spot${Math.abs(moved) === 1 ? '' : 's'} `
                      + `${moved > 0 ? 'higher' : 'lower'} this week than on his rest-of-season board.` : '') },
                  `${g.pos}${g.rank}`,
                  moved ? h('span', { class: moved > 0 ? 'delta-up' : 'delta-down',
                    style:{ marginLeft:'4px', fontSize:'11px' } },
                    `${moved > 0 ? '+' : ''}${moved}`) : null);
              })() : null,
                ...(isRosView ? [] : VEGAS_COMPONENTS).map(c => componentCell(weekly, c)),
              ]));
          })));
      } else if (filter.view === 'sleeper-weeks') {
        const weeks = Array.from({ length:18 }, (_, index) => index + 1);
        tbl = h('table', { class:'data sleeper-weeks-table' },
          h('thead', null, h('tr', null,
            h('th', { class:'right', style:{ width:'46px' } }, '#'),
            h('th', null, 'Player'), h('th', null, 'Pos'), h('th', null, 'Team'), h('th', null, 'Owner'),
            ...weeks.map(week => sortHdr(`sw:${week}`, `W${week}`, { right:true, title:`Sort by Sleeper week ${week} PPR projection` })))),
          h('tbody', null, ...rows.map((p, i) => {
            const o = ownerInfo(p._sleeperId), weekly = p._weekly;
            return h('tr', { class:o.isMine ? 'you' : '', onclick:()=>openPlayerDetail(p.name, p._sleeperId) },
              h('td', { class:'right tnum muted' }, i + 1), weeklyNameCell(p),
              h('td', null, posChip(p.pos)), h('td', null, teamChip(teamOfP(p))), h('td', null, o.cell),
              ...weeks.map((week, index) => pointCell(weekly.sleeper?.[index], `Sleeper week ${week} PPR projection`)));
          })));
      } else if (filter.view === 'sos') {
        // SOS mode: weeks 1-18, cell = opponent + its defense strength (implied pts allowed), colored.
        const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);
        tbl = h('table', { class:'data data-sticky', style:{ fontSize:'11px' } },
          h('thead', null, h('tr', null,
            h('th', { class:'right' }, '#'), sortHdr('name', 'Player'), sortHdr('pos', 'Pos'), h('th', null, 'Tm'), h('th', null, 'Own'),
            ...WEEKS.map(w => h('th', { class:'center clickable', style:{ minWidth:'32px', cursor:'pointer' }, title:`Sort by week ${w} matchup (easiest first)`,
              onclick:() => { const k = 'wk:' + w; if (filter.sort === k) filter.dir = filter.dir === 'asc' ? 'desc' : 'asc'; else { filter.sort = k; filter.dir = 'desc'; } persist(); render(); } },
              'W' + w + (filter.sort === 'wk:' + w ? (filter.dir === 'desc' ? '↓' : '↑') : ''))))),
          h('tbody', null, ...rows.map((p, i) => {
            const o = ownerInfo(p._sleeperId);
            const sm = schedFor(teamOf(p._sleeperId) || p.team);
            return h('tr', { class: o.isMine ? 'you' : '', onclick:() => openPlayerDetail(p.name, p._sleeperId) },
              h('td', { class:'right tnum muted' }, String(i + 1)),
              h('td', null, h('span', { class:'name' }, p.name)),
              h('td', null, posChip(p.pos)),
              h('td', null, teamChip(p.team)),
              h('td', null, o.r ? h('span', { class:'badge sos-owner' + (o.isMine ? ' you' : ''),
                title:`${o.r.team_name} (${o.r.owner_name})` }, o.r.team_name || '') : h('span', { class:'muted' }, 'FA')),
              ...WEEKS.map(w => {
                const g = sm[w];
                if (!g) return h('td', { class:'center muted', style:{ fontSize:'9px' } }, 'BYE');
                const e = teamEnv(g.opp), v = e ? e.implied_pa : null;
                return h('td', { class:'center', title: `Wk${w} ${g.home ? 'vs ' : '@ '}${g.opp}: opponent D allows ${v ?? '?'} pts/g (#${e ? e.pa_rank : '?'} of 32)`, style:{ color: defColor(g.opp), lineHeight:1.05 } },
                  h('div', { style:{ fontWeight:700 } }, g.opp),
                  h('div', { style:{ fontSize:'9px', opacity:.85 } }, v != null ? fmt.decimal(v, 0) : ''));
              }));
          })));
      } else {
        // Stats mode: identity + rankings + our category/tier + projection + projected
        // stat line + offensive SOS rank + owner.
        const OFFCOLS = [['pass_yd','PaYd'],['pass_td','PaTD'],['pass_int','INT'],['rush_yd','RuYd'],['rush_td','RuTD'],['rec','Rec'],['rec_yd','ReYd'],['rec_td','ReTD']];
        tbl = h('table', { class:'data data-sticky' },
          h('thead', null, h('tr', null,
            h('th', { class:'right', style:{ width:'38px' }, title:'Position in current sort' }, '#'),
            sortHdr('rank', 'Rank', { right:true, style:{ width:'52px' } }),
            sortHdr('name', 'Player'),
            sortHdr('pos',  'Pos'),
            h('th', null, 'Team'),
            sortHdr('age',  'Age', { right:true }),
            h('th', null, 'Category'),
            h('th', { class:'center', style:{ width:'40px' } }, 'Tier'),
            leagueDynasty ? sortHdr('value','Value', { right:true, title:'KTC dynasty value in this league format.' }) : null,
            hasProj ? sortHdr('proj', 'Proj', { right:true, title:'Season fantasy projection (selected Proj Src)' }) : null,
            hasProj ? sortHdr('vor', 'VOR', { right:true, title:'Value over replacement: projected points above the last startable player at this position in THIS league. Cross-position comparable, higher = more starting-lineup value.' }) : null,
            hasProj ? sortHdr('gap', 'Gap', { right:true, title:'Value vs projection: positional dynasty-value rank minus season-projection rank. + = produces above its price (buy lean), − = priced above production (sell lean). Read with Age.' }) : null,
            hasProj ? sortHdr('ppslp', 'PP−Slp', { right:true, title:'PrizePicks vs Sleeper positional RANK difference. + = the Vegas market ranks him higher than the public model → undervalued lean. Offense only, needs both sources.' }) : null,
            h('th', null, 'Owner'),
            ...activeExpertSources().map(src => sortHdr('xr:' + src.id, expertColLabel(src),
              { right:true, title:`${src.expert || src.label} · ${src.title || 'rankings'}${src.updatedAt ? ', updated ' + src.updatedAt : ''}` })),
            h('th', { class:'right', title:'Offensive strength of schedule rank (1 = easiest)' }, 'SOS'),
            ...OFFCOLS.map(([, l]) => h('th', { class:'right' }, l)),
          )),
          h('tbody', null, ...rows.map((p, i) => {
            const o = ownerInfo(p._sleeperId);
            const line = (projPl(p._sleeperId)?.stats?.blend) || {};
            const sos = teamSos(teamOf(p._sleeperId) || p.team);
            return h('tr', { class: o.isMine ? 'you' : '', onclick:() => openPlayerDetail(p.name, p._sleeperId),
              title: o.r ? `Owned by ${o.r.team_name}` : 'Free agent' },
              ...idCells(p, i),
              h('td', { class:'right tnum' }, (() => { const a = ageOf(p._sleeperId, p.age); return a != null ? fmt.decimal(a, 1) : h('span', { class:'muted' }, '.'); })()),
              h('td', null, ourCatChip(p._sleeperId) || pillCategory(p.category)),
              h('td', { class:'center' }, ourTierChip(p._sleeperId) || tierChip(p.tier, p.category)),
              leagueDynasty ? h('td', { class:'right tnum' }, fmt.decimal(tierValue(p, lg), 1)) : null,
              hasProj ? h('td', { class:'right tnum' }, (() => { const v = projPointsFor(p._sleeperId, filter.proj); return v == null ? h('span', { class:'muted' }, '·') : fmt.decimal(v, 1); })()) : null,
              hasProj ? h('td', { class:'right' }, vorChip(p._sleeperId, lg, filter.proj) || h('span', { class:'muted' }, '·')) : null,
              hasProj ? h('td', { class:'right' }, mispriceChip(p._sleeperId) || h('span', { class:'muted' }, '·')) : null,
              hasProj ? h('td', { class:'right' }, ppEdgeChip(p._sleeperId) || h('span', { class:'muted' }, '·')) : null,
              h('td', null, o.cell),
              ...expertCells(p.name, p._sleeperId),
              h('td', { class:'right tnum', style:{ color: sos && sos.off_sos_rank <= 10 ? 'var(--green)' : sos && sos.off_sos_rank >= 23 ? 'var(--red)' : 'var(--fg-2)' } }, sos ? String(sos.off_sos_rank) : h('span', { class:'muted' }, '·')),
              ...OFFCOLS.map(([k]) => h('td', { class:'right tnum', style:{ color:'var(--fg-2)' } }, line[k] != null ? fmt.decimal(line[k], k.endsWith('_yd') ? 0 : 1) : h('span', { class:'muted' }, '·'))),
            );
          }))
        );
      }
      tableWrap.appendChild(h('div', { class:weeklyView ? 'rankings-table-scroll' : '', style:{ overflowX:'auto' } }, tbl));
      if (weeklyTable) {
        const coverage = weeklyData.coverage || {};
        const ecrCoverage = coverage.ecr || {}, gibbsCoverage = coverage.gibbs || {};
        const limitNote = ecrCoverage.limited && ecrCoverage.limitPerPosition
          ? ` · FantasyPros free API top ${ecrCoverage.limitPerPosition}/position` : '';
        const sourceNote = kickerOnly
          ? `Week ${window.KICKER_MODEL?.week || currentWeek} kickers · ${rows.length} shown · K Proj is expected points from the dedicated model. Floor and Ceil are its 20th and 90th percentile outcomes. Blank means no current model match.`
          : (filter.view === 'ros'
            ? `Rest-of-season PPR, sorted by the FP ROS column · ${rosMeta.available ? `${coverage.rosPlayers || 0} ranked as of ${rosMeta.updated}` : 'board unavailable'}${rosStale ? ', stale' : ''} · the other columns are week ${currentWeek}. `
            : '')
          + `Week ${currentWeek} PPR · ${rows.length} shown · Vegas ${coverage.vegasPlayers || 0}`
          + ` · ECR ${ecrCoverage.available ? coverage.ecrPlayers || 0 : 'unavailable'}`
          + ` · Gibbs ${gibbsCoverage.available ? `${coverage.gibbsPlayers || 0} as of ${gibbsCoverage.updated}` : 'unavailable'}${limitNote}`
          + ` · ROS ${rosMeta.available ? `${coverage.rosPlayers || 0} as of ${rosMeta.updated}` : 'unavailable'}`
          + `${rosStale ? ' (stale)' : ''}`
          + `${hasGibbsRos ? ` · Gibbs ROS ${coverage.gibbsRosPlayers} as of ${(coverage.gibbsRos || {}).updated}` : ' · Gibbs ROS not published'}.`
          // A single expert's board is a SUBMISSION with a date, and he revises it after
          // he records. On 2026-09-16 his video showed McConkey WR14 while the board he
          // published at 23:18 that night reads WR20, which looks like a bug in this
          // table until the date is on screen next to the number.
          + ` A single-expert column is his latest FantasyPros submission, so it can`
          + ` disagree with a video recorded earlier the same day.`;
        tableWrap.appendChild(h('div', { class:'tip rankings-source-note' }, sourceNote));
      } else if (filter.view === 'sleeper-weeks') {
        tableWrap.appendChild(h('div', { class:'tip rankings-source-note' },
          `${rows.length} players with Sleeper PPR projections · Click week heading to sort.`));
      }
      if (filtered.length > rows.length) {
        tableWrap.appendChild(h('div', { class:'tip', style:{ padding:'10px 14px' } },
          `Showing ${rows.length} of ${filtered.length}. Refine filters to narrow.`));
      }
    }
    render();
  }

  // ============================================================
  // Timeline: lazy-fetch Sleeper transactions for the league across all
  // 18 weeks + the off-season window, group chronologically, render as a
  // vertical feed of trades, waivers, free-agent moves, and the draft.
  // Cached in localStorage keyed by leagueId for 30 min.
  // ============================================================
  function renderLeagueTimeline(main, lg) {
    // Filter state per league.
    const fkey = `tier-sheet-timeline-filter::${lg.id}`;
    const filter = Object.assign(
      { trade:true, waiver:true, free_agent:true, draft:true, mineOnly:false },
      JSON.parse(localStorage.getItem(fkey) || '{}')
    );
    const persistF = () => { try { localStorage.setItem(fkey, JSON.stringify(filter)); } catch {} };

    const header = h('div', { style:{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginTop:'8px', gap:'12px', flexWrap:'wrap' } },
      h('h2', { class:'page-title', style:{ fontSize:'1.2rem', margin:0 } }, 'Transactions'),
      h('div', { class:'timeline-controls' }),
    );
    main.appendChild(header);

    const wrap = h('div', { class:'card' },
      h('div', { class:'tip' }, 'Loading league transactions from Sleeper, this can take a few seconds…')
    );
    main.appendChild(wrap);

    // Roster id → team name lookup for quick rendering.
    const teamName = (rid) => {
      const r = lg.rosters.find(x => x.roster_id === rid);
      return r ? r.team_name : `R${rid}`;
    };
    const isMyRoster = (rid) => lg.rosters.find(x => x.roster_id === rid)?.is_me;
    const playerName = (pid) => window.PLAYERS[pid]?.name || `#${pid}`;
    const playerVal = (pid) => {
      const sp = window.PLAYERS[pid]; if (!sp) return 0;
      const r = rankIndex().bySleeperId.get(pid) || rankIndex().byName.get(norm(sp.name));
      return r ? tierValue(r, lg) : 0;
    };

    // Cache key + TTL.
    const ckey = `tier-sheet-timeline::${lg.id}`;
    let cached = null;
    try {
      const raw = localStorage.getItem(ckey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.fetchedAt < 30 * 60 * 1000) cached = parsed;
      }
    } catch {}

    const fetchAll = async () => {
      // Sleeper API allows /league/{id}/transactions/{week}. Pre-season and
      // off-season activity lives at week 1. In-season weeks 1-18. We fetch
      // up to the current NFL week if the league is live, else all 18.
      const nflWeek = (() => {
        // Rough estimate: NFL season starts first Thursday of September.
        const now = new Date();
        if (now.getMonth() < 8) return 18; // before Sep, fetch all (off-season trades)
        const seasonStart = new Date(now.getFullYear(), 8, 1);
        const weeks = Math.min(18, Math.max(1, Math.ceil((now - seasonStart) / (7 * 24 * 3600 * 1000))));
        return weeks;
      })();
      const weeks = Array.from({ length: nflWeek }, (_, i) => i + 1);
      const results = await Promise.all(weeks.map(async (w) => {
        try {
          const r = await fetch(`https://api.sleeper.app/v1/league/${lg.id}/transactions/${w}`);
          if (!r.ok) return [];
          return await r.json();
        } catch { return []; }
      }));
      const flat = [];
      results.forEach((arr, i) => {
        for (const t of (arr || [])) flat.push({ ...t, week: i + 1 });
      });
      // Dedupe by transaction_id; sort newest-first by status_updated || created.
      const byId = new Map();
      for (const t of flat) byId.set(t.transaction_id, t);
      const out = Array.from(byId.values()).sort((a, b) =>
        (b.status_updated || b.created || 0) - (a.status_updated || a.created || 0));
      return out;
    };

    // Pick value helper for trade swing math. Uses KTC pickIndex with the
    // known draft slot when available, otherwise projected player-only strength.
    const pickAssetValue = (dp) => {
      const slot = draftPickSlot(dp.season, dp.round, dp.roster_id, lg);
      const bucket = slotToBucket(slot, lg.total_rosters);
      const ktcMap = lg.is_superflex ? pickIndex().sf : pickIndex().oneqb;
      const hit = ktcMap.get(`${dp.season}|${bucket}|${dp.round}`);
      return hit ? Math.round(hit.ktcValue / 100 * 10) / 10 : 0;
    };

    // Exact slot when Sleeper publishes draft order; generic round otherwise.
    const pickLabel = (dp) => {
      return draftPickLabel(dp.season, dp.round, dp.roster_id, lg, dp.roster_id !== dp.previous_owner_id);
    };

    const fmtDate = (ms) => {
      if (!ms) return 'Unknown';
      const d = new Date(ms);
      return d.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
    };
    const monthKey = (ms) => {
      if (!ms) return 'Unknown';
      const d = new Date(ms);
      return d.toLocaleDateString(undefined, { month:'long', year:'numeric' });
    };
    const matchesFilter = (item) => {
      if (item.kind === 'draft') return filter.draft;
      const t = item.tx;
      if (filter.mineOnly) {
        const involvesMe = (t.roster_ids || []).some(isMyRoster)
          || Object.values(t.adds || {}).some(isMyRoster)
          || Object.values(t.drops || {}).some(isMyRoster)
          || (t.draft_picks || []).some(dp => isMyRoster(dp.owner_id) || isMyRoster(dp.previous_owner_id));
        if (!involvesMe) return false;
      }
      if (t.type === 'trade')      return filter.trade;
      if (t.type === 'waiver')     return filter.waiver;
      if (t.type === 'free_agent') return filter.free_agent;
      return true;
    };

    // Build the filter pills + refresh button into the header.
    const buildControls = (txs, drafts) => {
      const ctrls = header.querySelector('.timeline-controls');
      if (!ctrls) return;
      ctrls.innerHTML = '';
      const pill = (key, label, count) => {
        const active = filter[key];
        const el = h('button', {
          class: `tab${active ? ' active' : ''}`,
          style:{ padding:'4px 10px', fontSize:'0.72rem' },
          onclick:() => { filter[key] = !filter[key]; persistF(); doRender(txs, drafts); }
        }, label, count != null ? h('span', { class:'tab-count tnum' }, String(count)) : null);
        return el;
      };
      const txByType = (type) => txs.filter(t => t.type === type).length;
      ctrls.appendChild(h('div', { style:{ display:'flex', gap:'4px', flexWrap:'wrap', alignItems:'center' } },
        pill('trade',      'Trades',     txByType('trade')),
        pill('waiver',     'Waivers',    txByType('waiver')),
        pill('free_agent', 'FA',         txByType('free_agent')),
        pill('draft',      'Drafts',     drafts.length),
        h('span', { style:{ borderLeft:'1px solid var(--border)', height:'18px', margin:'0 6px' } }),
        pill('mineOnly',   'My moves only'),
        h('button', { class:'ghost on-turf', style:{ padding:'4px 10px', fontSize:'0.72rem', marginLeft:'auto' }, onclick:() => {
          try { localStorage.removeItem(ckey); } catch {}
          cached = null;
          renderLeagueTimeline(main, lg);
        }}, '↻ Refresh'),
      ));
    };

    const doRender = (txs, drafts) => {
      wrap.innerHTML = '';
      buildControls(txs, drafts);
      // Combine + sort newest-first.
      const items = [
        ...drafts.map(d => ({ kind:'draft', ts: d.ts, status: d.status, season: d.season })),
        ...txs.map(t => ({ kind:'tx', tx: t, ts: t.status_updated || t.created || 0 })),
      ].sort((a, b) => b.ts - a.ts).filter(matchesFilter);

      if (!items.length) {
        wrap.appendChild(h('div', { class:'empty' }, 'No items match these filters.'));
        return;
      }
      let currentMonth = null;
      const feed = h('div', { class:'timeline-feed' });
      for (const item of items) {
        const m = monthKey(item.ts);
        if (m !== currentMonth) {
          currentMonth = m;
          feed.appendChild(h('div', { class:'timeline-month' }, m));
        }
        feed.appendChild(renderItem(item));
      }
      wrap.appendChild(feed);
      const cacheNote = cached ? `Cached ${Math.floor((Date.now() - cached.fetchedAt)/60000)}m ago` : 'Live';
      wrap.appendChild(h('div', { class:'tip', style:{ marginTop:'12px', textAlign:'center' } },
        `${items.length} of ${txs.length + drafts.length} events shown · ${cacheNote}`));
    };

    const render = (txs) => {
      const drafts = (lg.drafts || []).map(d => ({
        kind: 'draft',
        ts: d.start_time || d.last_picked || 0,
        status: d.status,
        season: d.season,
      }));
      doRender(txs, drafts);
    };

    // Pull common helpers up so renderItem can use them.
    var _fmtDate = fmtDate;
    var _pickAssetValue = pickAssetValue;
    var _pickLabel = pickLabel;

    const renderItem = (item) => {
      if (item.kind === 'draft') {
        const stateLbl = item.status === 'complete' ? 'Drafted' : item.status === 'drafting' ? 'In Progress' : 'Pre-Draft';
        return h('div', { class:'timeline-row timeline-draft' },
          h('div', { class:'timeline-icon', style:{ color:'var(--amber)' } }, '◆'),
          h('div', { class:'timeline-body' },
            h('div', { class:'timeline-headline' },
              h('span', { class:'timeline-eyebrow' }, 'DRAFT'),
              `${item.season} Rookie Draft`,
            ),
            h('div', { class:'tip' }, `${stateLbl} · ${item.ts ? fmtDate(item.ts) : '·'}`),
          )
        );
      }
      const t = item.tx;
      if (t.type === 'trade') {
        // Group adds/drops by roster_id to render "A sends, B sends" lines.
        const sides = {};
        for (const [pid, rid] of Object.entries(t.adds || {})) {
          (sides[rid] = sides[rid] || { receives:[], sends:[], inVal:0, outVal:0 }).receives.push({ pid, val: playerVal(pid) });
          sides[rid].inVal += playerVal(pid);
        }
        for (const [pid, rid] of Object.entries(t.drops || {})) {
          (sides[rid] = sides[rid] || { receives:[], sends:[], inVal:0, outVal:0 }).sends.push({ pid, val: playerVal(pid) });
          sides[rid].outVal += playerVal(pid);
        }
        for (const dp of (t.draft_picks || [])) {
          const pVal = _pickAssetValue(dp);
          const lbl = _pickLabel(dp);
          (sides[dp.owner_id] = sides[dp.owner_id] || { receives:[], sends:[], inVal:0, outVal:0 })
            .receives.push({ pick: lbl, val: pVal });
          sides[dp.owner_id].inVal += pVal;
          (sides[dp.previous_owner_id] = sides[dp.previous_owner_id] || { receives:[], sends:[], inVal:0, outVal:0 })
            .sends.push({ pick: lbl, val: pVal });
          sides[dp.previous_owner_id].outVal += pVal;
        }
        const sidesArr = Object.entries(sides);
        const renderAsset = (a) => a.pick
          ? h('span', { class:'tx-pick' }, a.pick, h('span', { class:'tnum tip', style:{ marginLeft:'6px' } }, fmt.decimal(a.val, 1)))
          : h('span', { class:'tx-player', onclick:(e) => { e.stopPropagation(); openPlayerDetail(playerName(a.pid), a.pid); } },
              playerName(a.pid),
              h('span', { class:'tnum tip', style:{ marginLeft:'6px' } }, fmt.decimal(a.val, 1))
            );
        return h('div', { class:'timeline-row' },
          h('div', { class:'timeline-icon', style:{ color:'var(--blue)' } }, '⇄'),
          h('div', { class:'timeline-body' },
            h('div', { class:'timeline-headline' },
              h('span', { class:'timeline-eyebrow' }, 'TRADE'),
              sidesArr.map(([rid, _], i) => h('span', { class: isMyRoster(parseInt(rid,10)) ? 'tx-team you' : 'tx-team' },
                teamName(parseInt(rid,10)) + (i < sidesArr.length-1 ? ' ⇄ ' : '')
              )),
            ),
            h('div', { class:'tx-grid' },
              ...sidesArr.map(([rid, sides]) => {
                const swing = sides.inVal - sides.outVal;
                const swingColor = Math.abs(swing) < 1 ? 'var(--fg-2)' : swing > 0 ? 'var(--green)' : 'var(--red)';
                return h('div', { class:'tx-side' },
                  h('div', { class:'tx-side-label' },
                    h('span', null, `${teamName(parseInt(rid,10))} gets`),
                    h('span', { class:'tnum', style:{ color: swingColor, fontWeight:700, fontSize:'0.74rem' } },
                      (swing >= 0 ? '+' : '') + fmt.decimal(swing, 1)),
                  ),
                  h('div', { class:'tx-assets' }, ...sides.receives.map(renderAsset))
                );
              }),
            ),
            h('div', { class:'tip', style:{ marginTop:'4px' } }, _fmtDate(item.ts), ` · Week ${t.week}`),
          )
        );
      }
      if (t.type === 'waiver' || t.type === 'free_agent') {
        const rid = (t.roster_ids || [])[0];
        const adds = Object.keys(t.adds || {});
        const drops = Object.keys(t.drops || {});
        const isMe = isMyRoster(rid);
        const status = t.status === 'failed' ? 'FAILED' : null;
        return h('div', { class:`timeline-row ${isMe?'is-me':''} ${status?'is-failed':''}` },
          h('div', { class:'timeline-icon', style:{ color: t.type==='waiver' ? 'var(--green)' : 'var(--fg-3)' } },
            t.type === 'waiver' ? '+' : '~'),
          h('div', { class:'timeline-body' },
            h('div', { class:'timeline-headline' },
              h('span', { class:'timeline-eyebrow' }, t.type === 'waiver' ? 'WAIVER' : 'FREE AGENT'),
              h('span', { class: isMe ? 'tx-team you' : 'tx-team' }, teamName(rid)),
              status ? h('span', { class:'badge depreciating', style:{ marginLeft:'8px' } }, status) : null,
            ),
            h('div', { class:'tx-fa-line' },
              adds.length ? h('span', null,
                h('span', { class:'tip' }, 'add '),
                ...adds.map(pid => h('span', { class:'tx-player', onclick:(e)=>{e.stopPropagation();openPlayerDetail(playerName(pid),pid);} }, playerName(pid)))
              ) : null,
              adds.length && drops.length ? h('span', { class:'tip', style:{ margin:'0 8px' } }, '·') : null,
              drops.length ? h('span', null,
                h('span', { class:'tip' }, 'drop '),
                ...drops.map(pid => h('span', { class:'tx-player muted', onclick:(e)=>{e.stopPropagation();openPlayerDetail(playerName(pid),pid);} }, playerName(pid)))
              ) : null,
            ),
            h('div', { class:'tip', style:{ marginTop:'4px' } }, fmtDate(item.ts), ` · Week ${t.week}`),
          )
        );
      }
      // Fallback (commissioner, draft pick trade outside trade type, etc.)
      return h('div', { class:'timeline-row' },
        h('div', { class:'timeline-icon' }, '·'),
        h('div', { class:'timeline-body' },
          h('div', { class:'timeline-headline' },
            h('span', { class:'timeline-eyebrow' }, (t.type || 'event').toUpperCase()),
          ),
          h('div', { class:'tip' }, fmtDate(item.ts))
        )
      );
    };

    if (cached) {
      render(cached.txs);
    } else {
      fetchAll().then(txs => {
        try { localStorage.setItem(ckey, JSON.stringify({ fetchedAt: Date.now(), txs })); } catch {}
        cached = { fetchedAt: Date.now(), txs };
        render(txs);
      }).catch(err => {
        wrap.innerHTML = '';
        wrap.appendChild(h('div', { class:'empty' }, `Failed to load transactions: ${err.message}`));
      });
    }
  }

  // ============================================================
  // ROUTE: Roster Blueprint
  // ============================================================

  // ---- Classification helpers ----
  function getRosterPlayers(roster) {
    return (roster.players || []).map(pid => {
      const sleeper = window.PLAYERS[pid];
      if (!sleeper) return null;
      const ranked = rankIndex().bySleeperId.get(pid) || rankIndex().byName.get(norm(sleeper.name));
      return { pid, sleeper, ranked };
    }).filter(Boolean);
  }
  function classifyValueTier(strength, leagueRank, total, cornerstones) {
    // Combination of relative rank + cornerstone count
    if (cornerstones >= 4 && leagueRank <= Math.ceil(total*0.3)) return { tier:'ELITE', desc:'Best-of-class, multiple Cornerstones, top of league.' };
    if (cornerstones >= 3 && leagueRank <= Math.ceil(total*0.5)) return { tier:'CHAMPIONSHIP', desc:'Built to win it all this year.' };
    if (cornerstones >= 2 || leagueRank <= Math.ceil(total*0.6)) return { tier:'CONTENDING', desc:'In the playoff hunt; one move from a championship roster.' };
    if (cornerstones >= 1 || strength.rankedPlayers.filter(p=>p.ranked.category==='upside_premier' && p.ranked.tier==='S').length >= 3) return { tier:'RELOAD', desc:'Pivoting, has assets to either contend or rebuild.' };
    return { tier:'REBUILD', desc:'Long-term play, accumulating youth + picks.' };
  }
  function classifyValueArchetype(rp) {
    if (!rp.length) return { tag:'BALANCED', desc:'No ranked players yet.' };
    const ranked = rp.filter(p=>p.ranked && p.sleeper.age);
    if (!ranked.length) return { tag:'BALANCED', desc:'Not enough age data.' };
    const top12 = ranked.slice().sort((a,b)=>(b.ranked ? tierValue(b.ranked,{}) : 0) - (a.ranked ? tierValue(a.ranked,{}) : 0)).slice(0,12);
    const avgAge = top12.reduce((s,p)=>s + (p.sleeper.age||25), 0) / top12.length;
    if (avgAge < 24.5) return { tag:'FUTURE VALUE', desc:`Top-12 average age ${avgAge.toFixed(1)}, long runway.` };
    if (avgAge > 27.5) return { tag:'WIN-NOW', desc:`Top-12 average age ${avgAge.toFixed(1)}, championship window is now.` };
    return { tag:'BALANCED', desc:`Top-12 average age ${avgAge.toFixed(1)}.` };
  }
  function classifyRosterArchetype(rp) {
    const ranked = rp.filter(p=>p.ranked);
    const byPos = { QB:0, RB:0, WR:0, TE:0 };
    const tierByPos = { QB:0, RB:0, WR:0, TE:0 };
    for (const p of ranked) {
      const pos = p.ranked.pos;
      if (byPos[pos] != null) {
        byPos[pos]++;
        tierByPos[pos] += tierValue(p.ranked, {});
      }
    }
    const totalVal = Object.values(tierByPos).reduce((a,b)=>a+b,0) || 1;
    const rbShare = tierByPos.RB / totalVal;
    const wrShare = tierByPos.WR / totalVal;
    const qbShare = tierByPos.QB / totalVal;
    const teShare = tierByPos.TE / totalVal;
    // Stars & scrubs: top-3 contribute >50% of value
    const sortedVals = ranked.map(p=>tierValue(p.ranked,{})).sort((a,b)=>b-a);
    const top3Val = sortedVals.slice(0,3).reduce((a,b)=>a+b,0);
    const topShare = top3Val / totalVal;
    if (topShare > 0.55 && ranked.length > 6) return { tag:'STARS & SCRUBS', desc:`Top 3 players = ${(topShare*100).toFixed(0)}% of value.` };
    if (rbShare > 0.40)  return { tag:'RB HEAVY', desc:`RBs hold ${(rbShare*100).toFixed(0)}% of value.` };
    if (wrShare > 0.50)  return { tag:'WR HEAVY', desc:`WRs hold ${(wrShare*100).toFixed(0)}% of value.` };
    if (qbShare > 0.30)  return { tag:'QB HEAVY', desc:`QBs hold ${(qbShare*100).toFixed(0)}% of value.` };
    if (teShare > 0.20)  return { tag:'TE PREMIUM', desc:`TEs hold ${(teShare*100).toFixed(0)}% of value.` };
    return { tag:'BALANCED', desc:'No position dominates.' };
  }
  function classifyTwoYearOutlook(valueTier, valueArchetype, draftPicksCount) {
    const youngAndPickRich = valueArchetype.tag === 'FUTURE VALUE' && draftPicksCount >= 4;
    if (['ELITE','CHAMPIONSHIP'].includes(valueTier.tier) && valueArchetype.tag === 'WIN-NOW') return { tag:'CONTEND', desc:'Window is open, go for it.' };
    // Young and pick-rich at the top of the league is rising, not rebuilding. Printing
    // REBUILD beside an ELITE tier read as the page contradicting itself.
    if (youngAndPickRich && ['ELITE','CHAMPIONSHIP','CONTENDING'].includes(valueTier.tier)) return { tag:'RISING', desc:'Young core plus 4+ picks: competitive now and still gaining value.' };
    if (valueTier.tier === 'REBUILD' || youngAndPickRich) return { tag:'REBUILD', desc:'Long-term runway; accumulate young talent + picks.' };
    if (valueTier.tier === 'CONTENDING' && valueArchetype.tag !== 'WIN-NOW') return { tag:'RELOAD', desc:'Pivot ready, could swing either direction.' };
    return { tag:'CONTEND', desc:'In position to compete.' };
  }

  // ============================================================
  // Player Value Trajectory (Present + Future Value)
  // ============================================================
  // Each ranked player gets a year-by-year value curve over the next
  // PROJECTION_YEARS seasons. The curve compounds position-specific aging
  // multipliers off the player's age + category context. The same engine
  // powers per-player charts, per-roster value curves, and the dashboard
  // Present-vs-Future split.
  const PROJECTION_YEARS = 5; // 2026..2030 (year 0 = current)
  const CURRENT_SEASON = (() => {
    const m = new Date();
    // Assume drafts/seasons rolled into next year by mid-Feb (Super Bowl over).
    return m.getMonth() >= 1 ? m.getFullYear() : m.getFullYear() - 1;
  })();

  // Position aging curves. Each curve gives the season-over-season value
  // multiplier as a function of the player's age IN THAT SEASON.
  // Numbers are calibrated against dynasty consensus age curves:
  //   - RBs peak 23-26 then cliff fast
  //   - WRs peak 25-29, gentler decline
  //   - QBs peak 27-33, long shoulders
  //   - TEs peak 26-30, slow decline
  // Picks (no age) compound at 0.93x/year (rookie pick value decays as the
  // draft class approaches and the unknown shrinks).
  function ageMultiplier(pos, age) {
    if (age == null || age < 19) return 1.00;
    const curves = {
      QB: [[24, 1.06], [27, 1.01], [33, 0.98], [35, 0.92], [37, 0.82], [40, 0.65]],
      RB: [[22, 1.08], [25, 1.00], [27, 0.92], [28, 0.82], [30, 0.65], [32, 0.45]],
      WR: [[23, 1.07], [26, 1.02], [29, 0.97], [31, 0.88], [33, 0.75], [35, 0.55]],
      TE: [[24, 1.05], [27, 1.00], [30, 0.95], [32, 0.86], [34, 0.72], [36, 0.55]],
      // IDP positions: treat like WR aging unless we add real curves
      LB: [[23, 1.06], [27, 1.00], [30, 0.94], [32, 0.84], [34, 0.70], [36, 0.55]],
      DB: [[23, 1.06], [27, 1.00], [30, 0.94], [32, 0.84], [34, 0.70], [36, 0.55]],
      DL: [[24, 1.06], [27, 1.00], [30, 0.94], [32, 0.84], [34, 0.70], [36, 0.55]],
    };
    const c = curves[pos] || curves.WR;
    // Walk the breakpoints; use the multiplier of the bracket the age falls in.
    let mult = c[0][1];
    for (let i = 0; i < c.length; i++) {
      if (age <= c[i][0]) { mult = c[i][1]; break; }
      mult = c[i][1];
      if (i === c.length - 1) {
        // Beyond the last bracket, decay an extra 10% per year past it
        const extra = Math.max(0, age - c[c.length - 1][0]);
        mult *= Math.pow(0.85, extra);
      }
    }
    return mult;
  }

  // Compute a per-year value array [v0, v1, v2, v3, v4] for a single player
  // (or draft pick asset). v0 is THIS season's value.
  function projectPlayerValue(p, league) {
    const yrs = PROJECTION_YEARS;
    const out = new Array(yrs);
    const baseVal = tierValue(p, league);
    // Draft picks: linear-ish growth into the next class, then decay as they
    // convert. Future 1st = appreciating asset for 1 year, then flat.
    if (p._isPick || p.pos === 'PICK') {
      for (let y = 0; y < yrs; y++) {
        // Pick value peaks the year before the draft conveys (y=0), then
        // decays as the asset becomes a known player. Approximate that with
        // 0.9^y compounding.
        out[y] = baseVal * Math.pow(0.90, y);
      }
      return out;
    }
    const age = p.age || 25;
    // Subtype + category adjustments. These bias the START rather than the
    // shape (depreciating_pillar = front-loaded; upside_premier = back-loaded).
    let presentBias = 1.00;
    let futureBias  = 1.00;
    if (p.subtype === 'depreciating_pillar') { presentBias *= 1.05; futureBias *= 0.80; }
    if (p.rookie)                            { presentBias *= 0.75; futureBias *= 1.15; }
    if (p.category === 'upside_premier')     { futureBias  *= 1.05; }
    if (p.category === 'productive_vet')     { presentBias *= 1.08; futureBias *= 0.85; }
    if (p.category === 'short_term')         { presentBias *= 1.10; futureBias *= 0.50; }

    for (let y = 0; y < yrs; y++) {
      // Compound through y years of aging.
      let mult = 1.0;
      for (let s = 1; s <= y; s++) {
        mult *= ageMultiplier(p.pos, age + s);
      }
      // Blend present/future biases: bias applies most strongly to its own
      // domain. Year 0 = pure present, last year = pure future.
      const futureWeight = y / Math.max(1, yrs - 1);
      const biasMult = presentBias * (1 - futureWeight) + futureBias * futureWeight;
      out[y] = baseVal * mult * biasMult;
    }
    return out;
  }

  // Aggregate a roster's value over the projection window. Returns an object
  // with per-year totals plus PV / FV summary (PV = year 0, FV = mean of years
  // 1..N-1, weighted toward nearer years).
  function rosterValueCurve(rosterPlayers, league, extraAssets) {
    const yrs = PROJECTION_YEARS;
    const totals = new Array(yrs).fill(0);
    const breakdownByPos = { QB:new Array(yrs).fill(0), RB:new Array(yrs).fill(0),
                             WR:new Array(yrs).fill(0), TE:new Array(yrs).fill(0),
                             PICK:new Array(yrs).fill(0), OTHER:new Array(yrs).fill(0) };
    const consider = [];
    for (const rp of rosterPlayers) {
      if (!rp.ranked) continue;
      consider.push(rp.ranked);
    }
    for (const a of (extraAssets || [])) consider.push(a);
    for (const p of consider) {
      const curve = projectPlayerValue(p, league);
      const bucket = breakdownByPos[p.pos] || breakdownByPos.OTHER;
      for (let y = 0; y < yrs; y++) {
        totals[y]  += curve[y];
        bucket[y]  += curve[y];
      }
    }
    // PV = this year. FV = weighted average of years 1..N-1 (decaying weight
    // so 2027 counts more than 2030 even in "future").
    const pv = totals[0];
    let fvNum = 0, fvDen = 0;
    for (let y = 1; y < yrs; y++) {
      const w = Math.pow(0.85, y - 1);
      fvNum += totals[y] * w;
      fvDen += w;
    }
    const fv = fvDen ? fvNum / fvDen : 0;
    return { totals, breakdownByPos, pv, fv, pvShare: pv / (pv + fv || 1) };
  }
  // Highest tierValue at a position across all enabled rankings. Used as the
  // 100% reference so a QB1-tier asset grades like a 10 even though no QB hits
  // the absolute global max (Chase). League-aware because format multipliers
  // (Superflex 1.40x QB) scale numerator and denominator together.
  function maxPosValue(pos, league) {
    const idx = rankIndex();
    let max = 0;
    for (const p of idx.all) {
      if (p.pos !== pos) continue;
      const v = tierValue(p, league);
      if (v > max) max = v;
    }
    return max || 1;
  }

  // 0-10 grade per position, normalized within-position. The QB1 in dynasty
  // grades 10, the RB1 grades 10, etc. Backup adds capped bonus (max 1.5).
  // Depth past the backup is intentionally ignored.
  // NOTE: Math.round (not ceil) on slot count so a 1.4-slot demand (TE in
  // 1QB+4FLEX) doesn't dilute a TE1's grade by treating it as a 2-slot need.
  // TE flex usage is rare; the +0.4 partial slot is captured by the backup bonus.
  function gradePosition(rosterPlayers, pos, league) {
    if (!isDynastyLeague(league)) {
      return gradePositionFromSlots(gradeLineupSlots(rosterPlayers, league), pos);
    }
    const targets = targetStartersByPos(league);
    const slotCount = Math.max(1, Math.round(targets[pos] || 0));
    const top = rosterPlayers.filter(p => p.ranked && p.ranked.pos === pos)
      .map(p => tierValue(p.ranked, league)).sort((a,b)=>b-a);
    const maxPV = maxPosValue(pos, league);
    let starterSum = 0;
    for (let i = 0; i < slotCount; i++) starterSum += (top[i] || 0);
    const starterMax = slotCount * maxPV;
    let grade = starterMax > 0 ? (starterSum / starterMax) * 10 : 0;
    grade = Math.min(grade, 10);
    const backup = top[slotCount] || 0;
    const backupBonus = Math.min((backup / maxPV) * 1.5, 1.5);
    grade = Math.min(10, grade + backupBonus);
    return Math.round(grade * 10) / 10;
  }

  // Slot-by-slot grade: walks the league's actual roster_positions and assigns
  // the best-available player to each starting slot, then grades that slot
  // against the n-th-best player at that slot's eligible position(s) across
  // all dynasty rankings. FLEX gets its own grade. SUPER_FLEX gets its own
  // grade. The OVERALL grade is the slot-weighted average.
  function gradeLineupSlots(rosterPlayers, league) {
    const idx = rankIndex();
    const dynasty = isDynastyLeague(league);
    const lineupOrder = (p) => {
      if (dynasty) return orderValue(p.ranked, league);
      const pid = p.sleeper?.id ?? p.ranked?._sleeperId ?? p.ranked?.sleeperId;
      return rosPointsByPid(league).get(String(pid))?.pts ?? -1;
    };
    // Pre-sort owned players by tierValue desc per position
    const byPos = { QB:[], RB:[], WR:[], TE:[], LB:[], DB:[], DL:[] };
    for (const p of rosterPlayers) {
      const pos = p.ranked?.pos || (!dynasty ? projPosGroup(p.sleeper?.pos) : null);
      if (!pos || !byPos[pos]) continue;
      if (p.ranked || rosPointsByPid(league).has(String(p.sleeper?.id))) byPos[pos].push(p);
    }
    for (const k of Object.keys(byPos)) {
      byPos[k].sort((a, b) => lineupOrder(b) - lineupOrder(a));
    }
    // For IDP positions, fall back to all rostered (no rank discrimination)
    if (league.is_idp) {
      for (const idpPos of ['LB','DB','DL']) {
        if (byPos[idpPos].length === 0) {
          for (const p of rosterPlayers) {
            if (p.sleeper && p.sleeper.pos === idpPos) byPos[idpPos].push(p);
          }
        }
      }
    }
    // n-th best player at a position across dynasty (0-indexed)
    const nthByPos = (pos, n) => {
      const all = idx.all.filter(x => x.pos === pos);
      return all[n] ? tierValue(all[n], league) : 0;
    };
    // n-th best FLEX-eligible (RB/WR/TE)
    const nthFlex = (n) => {
      const all = idx.all.filter(x => ['RB','WR','TE'].includes(x.pos))
        .sort((a, b) => tierValue(b, league) - tierValue(a, league));
      return all[n] ? tierValue(all[n], league) : 0;
    };
    const redraftBoard = dynasty ? null : rosBoard(league);
    const redraftFlex = dynasty ? [] : ['RB','WR','TE']
      .flatMap(pos => redraftBoard.byPos[pos] || [])
      .sort((a, b) => b.pts - a.pts);

    const usage = { QB:0, RB:0, WR:0, TE:0, LB:0, DB:0, DL:0 };
    let flexCount = 0, sfCount = 0, idpFlexCount = 0;
    const slots = [];

    for (const slot of (league.roster_positions || [])) {
      if (['BN','TAXI','IR'].includes(slot)) continue;

      let pick = null, refVal = 0, label = slot, valueTier = 1;
      if (['QB','RB','WR','TE'].includes(slot)) {
        const i = usage[slot];
        pick = byPos[slot][i];
        // Reference: max-equivalent at this slot rank in dynasty
        // (e.g., RB2 vs the 2nd-best RB available across rankings)
        const refPos = slot;
        const refIdx = league.rosters && league.rosters.length ? Math.min(i, league.rosters.length - 1) : i;
        refVal = dynasty
          ? nthByPos(refPos, refIdx)
          : (redraftBoard.byPos[refPos]?.[refIdx]?.pts || 0);
        label = `${slot}${i + 1}`;
        valueTier = i + 1;
        usage[slot]++;
      } else if (slot === 'FLEX') {
        const remainingFlex = ['RB','WR','TE'].flatMap(p => byPos[p].slice(usage[p]));
        remainingFlex.sort((a, b) => lineupOrder(b) - lineupOrder(a));
        pick = remainingFlex[0];
        if (pick) {
          const pos = pick.ranked?.pos || projPosGroup(pick.sleeper?.pos);
          valueTier = usage[pos] + 1;
          if (byPos[pos][usage[pos]] === pick) usage[pos]++;
        }
        // FLEX reference: next-best FLEX-eligible after the league fills its
        // dedicated RB/WR/TE slots. Approximate as 30 + flexCount in the
        // FLEX-eligible pool (top-40-ish across leagues).
        const flexRefIdx = (league.total_rosters || 10) * 3 + flexCount;
        refVal = dynasty ? nthFlex(flexRefIdx) : (redraftFlex[flexRefIdx]?.pts || 0);
        label = `FLEX${flexCount + 1}`;
        flexCount++;
      } else if (slot === 'SUPER_FLEX') {
        // Best remaining QB or FLEX player. Almost always a QB.
        const remainingQB = byPos.QB.slice(usage.QB);
        const remainingFlex = ['RB','WR','TE'].flatMap(p => byPos[p].slice(usage[p]));
        const candidates = [...remainingQB, ...remainingFlex]
          .sort((a, b) => lineupOrder(b) - lineupOrder(a));
        pick = candidates[0];
        if (pick) {
          const pos = pick.ranked?.pos || projPosGroup(pick.sleeper?.pos);
          valueTier = usage[pos] + 1;
          if (byPos[pos][usage[pos]] === pick) usage[pos]++;
        }
        // SF reference: 2nd-best QB available after each league's QB1 is taken
        const sfRefIdx = league.total_rosters || 10;
        refVal = dynasty ? nthByPos('QB', sfRefIdx) : (redraftBoard.byPos.QB?.[sfRefIdx]?.pts || 0);
        label = 'SF';
        sfCount++;
      } else if (['LB','DB','DL'].includes(slot)) {
        const i = usage[slot];
        pick = byPos[slot][i];
        // No IDP rank reference; use any non-zero baseline
        refVal = pick ? tierValue(pick.ranked || { ktcValue: 1500 }, league) : 1;
        label = `${slot}${i + 1}`;
        valueTier = i + 1;
        usage[slot]++;
      } else if (slot === 'IDP_FLEX' || slot === 'IDP') {
        const remaining = ['LB','DB','DL'].flatMap(p => byPos[p].slice(usage[p]));
        pick = remaining[0];
        if (pick) {
          const pos = pick.ranked?.pos || pick.sleeper.pos;
          valueTier = usage[pos] + 1;
          if (byPos[pos][usage[pos]] === pick) usage[pos]++;
        }
        refVal = pick ? (tierValue(pick.ranked, league) || 15) : 15;
        label = `IDP${idpFlexCount + 1}`;
        idpFlexCount++;
      } else continue;

      const pickPid = pick?.sleeper?.id ?? pick?.ranked?._sleeperId ?? pick?.ranked?.sleeperId;
      let myVal = pick ? tierValue(pick.ranked, league, null, valueTier) : 0;
      if (!dynasty && pickPid != null) {
        const rec = rosPointsByPid(league).get(String(pickPid));
        myVal = rec ? Math.round(rec.pts * 10) / 10 : 0;
      }
      const grade = !dynasty
        ? (pickPid != null ? redraftSlotGrade(pickPid, refVal, league) : 0)
        : (refVal > 0 ? Math.min(10, (myVal / refVal) * 10) : (pick && myVal > 0 ? 5 : 0));
      // Future grade: age this player's value 3 seasons, re-grade against the same
      // slot reference. Drives the FV tick on the slot bar (present grade is the fill).
      const myValFv = pick ? myVal * ageRetention(pick.sleeper?.age ?? pick.ranked?.age, pick.ranked?.pos || pick.sleeper?.pos, 3) : 0;
      const fvGrade = dynasty
        ? (refVal > 0 ? Math.min(10, (myValFv / refVal) * 10) : (pick && myValFv > 0 ? 5 : 0))
        : grade;
      const signedRaw = !dynasty && pickPid != null ? rosVorByPid(pickPid, league, null, valueTier) : null;
      const signed = !dynasty && signedRaw != null
        ? Math.round(signedRaw * REDRAFT_VOR_SCALE * 10) / 10
        : (pick ? signedVor(pick.ranked, league, valueTier) : null);
      const pickAge = pick ? (pick.sleeper?.age ?? pick.ranked?.age ?? null) : null;
      // Rest-of-season projected points, the number the grade is derived FROM.
      const pickPts = pickPid != null ? (rosPointsByPid(league).get(String(pickPid))?.pts ?? null) : null;
      slots.push({
        vor: signed,
        age: pickAge,
        pts: pickPts,
        pid: pickPid != null ? String(pickPid) : null,
        slot: label,
        player: pick?.sleeper?.name || '(empty)',
        injury: pick ? (window.PLAYERS?.[pickPid]?.injury_status || null) : null,
        myVal: Math.round(myVal * 10) / 10,
        refVal: Math.round(refVal * 10) / 10,
        grade: Math.round(grade * 10) / 10,
        fvGrade: Math.round(fvGrade * 10) / 10,
        rawSlot: slot,
      });
    }

    const overall = slots.length
      ? Math.round((slots.reduce((s, x) => s + x.grade, 0) / slots.length) * 10) / 10
      : 0;
    return { slots, overall };
  }
  // Helper: aggregated grade per high-level position group, derived from
  // gradeLineupSlots. Used by the dashboard heatmap.
  function gradePositionFromSlots(slotResult, posPrefix) {
    const matching = slotResult.slots.filter(s => s.slot.startsWith(posPrefix));
    if (!matching.length) return 0;
    return Math.round((matching.reduce((s, x) => s + x.grade, 0) / matching.length) * 10) / 10;
  }
  function redraftBenchRaw(rosterPlayers, lg) {
    const starters = new Set(gradeLineupSlots(rosterPlayers, lg).slots.map(s => s.pid).filter(Boolean));
    const board = rosBoard(lg);
    return rosterPlayers
      .filter(p => p.sleeper?.id != null && !starters.has(String(p.sleeper.id)))
      .map(p => {
        const rec = rosPointsByPid(lg).get(String(p.sleeper.id));
        if (!rec) return 0;
        const pos = projPosGroup(rec.pos);
        if (!['QB','RB','WR','TE'].includes(pos)) return 0;
        return Math.max(0, rec.pts - (board.freeLevel[pos] || 0));
      })
      .sort((a, b) => b - a)
      .slice(0, 5)
      .reduce((sum, value) => sum + value, 0);
  }
  function gradeBench(rosterPlayers, lg) {
    if (!isDynastyLeague(lg)) {
      const mine = redraftBenchRaw(rosterPlayers, lg);
      const best = Math.max(0, ...(lg.rosters || []).map(r => redraftBenchRaw(getRosterPlayers(r), lg)));
      return best > 0 ? Math.round(Math.min(10, mine / best * 10) * 10) / 10 : 0;
    }
    // Bench depth score from 4th-onward ranked-player tier values
    const sorted = rosterPlayers.filter(p=>p.ranked).map(p => tierValue(p.ranked, lg)).sort((a,b)=>b-a);
    const fromFourth = sorted.slice(3, 12);
    const total = fromFourth.reduce((a,b)=>a+b,0);
    return Math.round(Math.max(0, Math.min(10, total / 50)) * 10) / 10;
  }
  // League average pick-stockpile cache. The avg is identical for every
  // roster in a league, so the Roster Blueprint pages used to recompute it
  // O(N) times per view (once per gradeDraftCapital call × N rosters touched).
  // Key on leagueId + the enabled-rankings signature, so toggling sources
  // (which changes pickIndex) busts the cache.
  const _leaguePickAvgCache = new Map();
  function leaguePickAvg(lg) {
    const key = `${lg.id}::${JSON.stringify({s: state.settings.enabledSources, r: state.settings.enabledRankings})}`;
    const hit = _leaguePickAvgCache.get(key);
    if (hit != null) return hit;
    let leagueTotal = 0;
    for (const r of lg.rosters) {
      const ps = rosterOwnedPicks(r.roster_id, lg);
      leagueTotal += ps.reduce((s, p) => s + (p.value || 0), 0);
    }
    const avg = leagueTotal / Math.max(1, lg.rosters.length);
    _leaguePickAvgCache.set(key, avg);
    return avg;
  }

  function gradeDraftCapital(roster, leagueId) {
    const lg = window.LEAGUES.find(l => l.id === leagueId);
    if (!lg) return 0;
    // Value-weighted: total KTC value of currently-owned picks vs. the
    // league-wide average pick stockpile. A team holding a 2027 Early 1st
    // (KTC ~73) is graded much higher than one with three 4ths (~20 total),
    // even though raw counts would favor the latter.
    const myValue = rosterOwnedPicks(roster.roster_id, lg)
      .reduce((s, p) => s + (p.value || 0), 0);
    const avg = leaguePickAvg(lg);
    if (avg <= 0) return 5; // no data, neutral
    // 1.0× avg = grade 5; 1.6× avg = grade 10; 0.4× avg = grade 0. Linear.
    const ratio = myValue / avg;
    const grade = (ratio - 0.4) / 0.12;
    return Math.round(Math.max(0, Math.min(10, grade)) * 10) / 10;
  }
  function getDraftCapitalSummary(roster, leagueId) {
    const lg = window.LEAGUES.find(l => l.id === leagueId);
    if (!lg) return { years: {}, totalAcquired: 0, totalLost: 0 };
    // Only consider entries with a season; defensive against any contamination.
    const picks = (lg.traded_picks || []).filter(p => p && p.season);
    const draftRounds = (lg.drafts && lg.drafts[0]?.settings?.rounds) || 4;
    const currentSeason = String(new Date().getFullYear());
    // Show only seasons relevant for trading: current year + next year. Most
    // leagues don't allow trading picks 2+ years out yet. If the current
    // year's draft has finished, drop it from the display.
    const draftStatusBySeason = {};
    for (const d of (lg.drafts || [])) {
      if (d.season) draftStatusBySeason[d.season] = d.status;
    }
    const candidateSeasons = [currentSeason, String(parseInt(currentSeason) + 1)];
    const years = {};
    for (const yr of candidateSeasons) {
      // Skip the current season entirely if its draft is complete.
      if (yr === currentSeason && draftStatusBySeason[yr] === 'complete') continue;
      years[yr] = {
        default: Array.from({ length: draftRounds }, (_, i) => i + 1),
        mine: [],
        lost: [],
        in_progress: yr === currentSeason && draftStatusBySeason[yr] === 'drafting',
      };
    }

    let totalAcquired = 0, totalLost = 0;
    for (const p of picks) {
      const yr = p.season;
      const rd = p.round;
      if (!years[yr]) continue;
      if (p.owner_id === roster.roster_id && p.roster_id !== roster.roster_id) {
        years[yr].mine.push({ round: rd, from: p.roster_id });
        totalAcquired++;
      }
      if (p.roster_id === roster.roster_id && p.owner_id !== roster.roster_id) {
        years[yr].lost.push({ round: rd, to: p.owner_id });
        years[yr].default = years[yr].default.filter(d => d !== rd);
        totalLost++;
      }
    }
    return { years, totalAcquired, totalLost };
  }
  function suggestBuysSells(rosterPlayers, lg) {
    const buys = [], sells = [];
    // Sell windows price a player's remaining career. In redraft the roster
    // resets in February, so an age-curve sell is advice about a season the
    // manager will never play. Suppress the sell side entirely there.
    const curves = isDynastyLeague(lg) ? ((window.STRATEGY && window.STRATEGY.age_curve) || {}) : {};
    // SELLS: position-aware age curves + depreciating pillars.
    // Cornerstones are exempt because their value is insulated by definition.
    for (const p of rosterPlayers) {
      if (!p.ranked || !leagueFitsPos(lg, p.ranked.pos)) continue;
      const age = p.sleeper.age;
      const curve = curves[p.ranked.pos];
      if (!isDynastyLeague(lg)) continue;
      if (p.ranked.subtype === 'depreciating_pillar') {
        sells.push({
          player: p.ranked, sleeper: p.sleeper,
          intensity: age >= (curve?.hard_sell_age || 30) ? 'HARD SELL' : 'SOFT SELL',
          reason: 'Depreciating pillar. Value will decay year-over-year.',
        });
      } else if (curve && age && age >= curve.hard_sell_age && p.ranked.category !== 'cornerstone') {
        sells.push({
          player: p.ranked, sleeper: p.sleeper, intensity: 'HARD SELL',
          reason: `Age ${age} is past the ${p.ranked.pos} hard-sell window (${curve.hard_sell_age}). Move at any cost.`,
        });
      } else if (curve && age && age >= curve.sell_age && p.ranked.category !== 'cornerstone') {
        sells.push({
          player: p.ranked, sleeper: p.sleeper, intensity: 'SELL',
          reason: `${p.ranked.pos} sell window opens at ${curve.sell_age}. ${p.sleeper.name} is ${age}. Trade a year too early, not too late.`,
        });
      }
    }
    // BUYS: top-tier players I don't own. Match by Sleeper ID where possible,
    // and ALSO by normalized name so 2026 rookies who aren't yet in Sleeper's
    // player dictionary still get correctly excluded from the buy list.
    const myIds = new Set(rosterPlayers.map(p => p.pid));
    const myNames = new Set(rosterPlayers.map(p => norm(p.sleeper.name)));
    const owned = (p) => (p._sleeperId && myIds.has(p._sleeperId)) || myNames.has(norm(p.name));
    const idx = rankIndex();
    const topUnowned = idx.all.filter(p => p.category === 'cornerstone' && p.tier === 'A')
      .filter(p => !owned(p) && leagueFitsPos(lg, p.pos))
      .slice(0,4);
    for (const p of topUnowned) {
      buys.push({ player: p, sleeper: window.PLAYERS[p._sleeperId] || null, intensity: 'SOFT BUY', reason: 'Cornerstone-A talent. Buy on any dip.' });
    }
    const rookieBuys = idx.all.filter(p => p.rookie && p.category === 'upside_premier' && p.tier === 'S')
      .filter(p => !owned(p) && leagueFitsPos(lg, p.pos))
      .slice(0,3);
    for (const p of rookieBuys) {
      buys.push({ player: p, sleeper: window.PLAYERS[p._sleeperId] || null, intensity: 'BUY', reason: 'High-pedigree rookie with breakout path.' });
    }
    return { buys, sells: sells.slice(0,5) };
  }
  // Walk window.STRATEGY.coaching_tips and pick the rules whose `when`
  // predicate matches the roster context. Returns rendered text strings.
  function evaluateCoachingTips({ rosterPlayers, league, stance, archetype, valueTier, surplus, roster, strength }) {
    if (!window.STRATEGY) return [];
    const curves = window.STRATEGY.age_curve || {};
    const aging = (pos) => rosterPlayers.filter(p => p.ranked && p.ranked.pos === pos
      && p.sleeper.age && curves[pos]
      && p.sleeper.age >= curves[pos].sell_age
      && p.ranked.category !== 'cornerstone');
    // Detect "same tier glut": 3+ players at the same position in the same
    // (category, tier) bucket. Strong consolidation candidate signal.
    const tierBuckets = {};
    for (const p of rosterPlayers) {
      if (!p.ranked) continue;
      const key = `${p.ranked.pos}|${p.ranked.category}|${p.ranked.tier}`;
      (tierBuckets[key] = tierBuckets[key] || []).push(p);
    }
    const same_tier_glut = Object.values(tierBuckets)
      .filter(arr => arr.length >= 3 && ['RB','WR'].includes(arr[0].ranked.pos))
      .flatMap(arr => arr.map(p => ({ name: p.sleeper.name, pos: p.ranked.pos })));
    const ctx = {
      stance, archetype, valueTier, surplus, league,
      rookie_count: rosterPlayers.filter(p => p.ranked?.rookie).length,
      depreciating: rosterPlayers.filter(p => p.ranked?.subtype === 'depreciating_pillar')
        .map(p => ({ name: p.sleeper.name, age: p.sleeper.age })),
      aging_rb: aging('RB').map(p => ({ name: p.sleeper.name, age: p.sleeper.age })),
      aging_wr: aging('WR').map(p => ({ name: p.sleeper.name, age: p.sleeper.age })),
      aging_count: ['QB','RB','WR','TE'].reduce((n, pos) => n + aging(pos).length, 0),
      te_breakout: rosterPlayers.filter(p => p.ranked && p.ranked.pos === 'TE'
        && p.sleeper.age >= 25 && p.sleeper.age <= 27 && p.ranked.category === 'foundational')
        .map(p => ({ name: p.sleeper.name, age: p.sleeper.age })),
      same_tier_glut,
      // 2026 rookie class is generally regarded as shallow past pick 1.07
      // per Domain Dynasty. If the user has 2+ rookies past 1.06, warn.
      weak_class_warning: rosterPlayers.filter(p => p.ranked?.rookie
        && (p.ranked.category === 'mainstay' || p.ranked.category === 'productive_vet'
            || (p.ranked.category === 'upside_premier' && p.ranked.tier === 'B'))
      ).length >= 2,
      // Upside Premier count, used by rebuild-pick-ceiling-warning to see
      // if the rebuilder has any actual upside shots, not just pick stacks.
      upside_premier_count: rosterPlayers.filter(p => p.ranked?.category === 'upside_premier').length,

      // Dynasty Domain 27-pick framework. Walk owned picks via the league's
      // traded_picks state + default ownership rules; count 27 firsts and
      // late-bucket 27 firsts, plus compute pick value as % of total dynasty
      // value (the "liquidity" warning trigger).
      ...(() => {
        if (!roster || !league || !strength) return {
          future_first_count_27: 0, late_first_count_27: 0,
          pick_value_share: 0, value_share: 0,
        };
        const owned = rosterOwnedPicks(roster.roster_id, league);
        const first27 = owned.filter(p => String(p.season) === '2027' && p.round === 1);
        const late27 = first27.filter(p => {
          const slot = draftPickSlot(p.season, p.round, p.originRosterId, league);
          return slotToBucket(slot, league.total_rosters) === 'late';
        });
        const pickVal = owned.reduce((s, p) => s + (p.value || 0), 0);
        const pickShare = strength.total > 0 ? pickVal / strength.total : 0;
        const { share: valueShare } = valueShareFor(roster, league);
        return {
          future_first_count_27: first27.length,
          late_first_count_27: late27.length,
          pick_value_share: pickShare,
          value_share: valueShare,
        };
      })(),

      // QB-skill same-team stacks: QB + WR/TE on the same NFL team. Each
      // pair becomes a stack candidate.
      stack_pairs: (() => {
        const qbs = rosterPlayers.filter(p => p.ranked?.pos === 'QB' && p.ranked.team);
        const skills = rosterPlayers.filter(p => ['WR','TE'].includes(p.ranked?.pos) && p.ranked.team);
        const pairs = [];
        for (const qb of qbs) {
          for (const sk of skills) {
            if (qb.ranked.team === sk.ranked.team) {
              pairs.push({
                qb: qb.sleeper.name,
                skill: sk.sleeper.name,
                skill_pos: sk.ranked.pos,
                team: qb.ranked.team,
              });
            }
          }
        }
        return pairs;
      })(),
    };
    const out = [];
    for (const rule of window.STRATEGY.coaching_tips) {
      try {
        if (rule.when(ctx)) out.push(rule.text(ctx));
      } catch (e) { /* skip */ }
    }
    return out;
  }

  function topPriorities(rp, lg, valueTier, archetype) {
    const out = [];
    const grades = {
      QB: gradePosition(rp, 'QB', lg), RB: gradePosition(rp, 'RB', lg),
      WR: gradePosition(rp, 'WR', lg), TE: gradePosition(rp, 'TE', lg),
    };
    const weakPos = Object.entries(grades).filter(([_,g]) => g < 5).sort((a,b) => a[1]-b[1]);
    if (lg.is_superflex && grades.QB < 6) out.push({ icon:'★', text:`Acquire a top-10 QB, superflex makes this a need, not a want.` });
    if (weakPos.length) out.push({ icon:'⚠', text:`Strengthen ${weakPos[0][0]}, current grade is ${weakPos[0][1].toFixed(1)}/10.` });
    if (valueTier.tier === 'CHAMPIONSHIP' || valueTier.tier === 'ELITE') out.push({ icon:'⚡', text:'Trade futures for proven production, your window is now.' });
    if (valueTier.tier === 'REBUILD') out.push({ icon:'⏳', text:'Sell aging veterans for picks. Stack 2027 1sts.' });
    if (archetype.tag === 'STARS & SCRUBS') out.push({ icon:'⚖', text:'Spread risk, too much value concentrated in 3 players.' });
    if (out.length < 2) out.push({ icon:'◎', text:'Get the best player at every position you start.' });
    if (out.length < 3) out.push({ icon:'⬆', text:'Uptier wherever possible to raise starting-lineup ceiling.' });
    return out.slice(0, 4);
  }

  function viewRoster(leagueId, rosterId, tabArg) {
    const main = $('#main');
    const lg = (window.LEAGUES || []).find(l => l.id === leagueId);
    if (!lg) { main.innerHTML=''; main.appendChild(h('div', { class:'empty' }, 'League not found.')); return; }
    const r = lg.rosters.find(x => String(x.roster_id) === String(rosterId));
    if (!r) { main.innerHTML=''; main.appendChild(h('div', { class:'empty' }, 'Roster not found.')); return; }

    // Sub-tabs: snapshot (overview), strategy (advice; only on own roster),
    // roster (positional grid + draft picks + slot table). For non-self rosters
    // the strategy tab is replaced with a "Trade Angles" tab.
    const validTabs = r.is_me ? ['snapshot','strategy','roster'] : ['snapshot','angles','roster'];
    const tab = validTabs.includes(tabArg) ? tabArg : 'snapshot';

    main.innerHTML = '';

    main.appendChild(breadcrumbs([
      { label:'My Leagues', hash:'#dashboard' },
      { label: lg.short_name || lg.name, hash:`#league/${lg.id}` },
      { label: r.team_name },
    ]));

    main.appendChild(h('div', { class:'page-header' },
      h('div', null,
        h('div', { class:'page-eyebrow' },
          'TEAM BLUEPRINT',
          r.is_me ? h('span', { class:'page-eyebrow-tag', style:{ background:'rgba(45,212,191,.18)', color:'var(--cat-cornerstone)' } }, 'YOU') : null
        ),
        h('h1', { class:'page-title' }, r.team_name),
        h('p', { class:'page-sub' }, `${r.owner_name} · ${lg.name} · ${lg.total_rosters}-team ${lg.is_superflex ? 'SF' : '1QB'} · PPR`)
      ),
      h('div', { class:'page-actions' },
        h('a', { href:`#trade/${lg.id}` }, h('button', { class:'ghost' }, 'Trade Lab ⇄')),
        h('a', { href:`#league/${lg.id}` }, h('button', { class:'ghost' }, '← League'))
      )
    ));

    main.appendChild(tabBar(
      r.is_me
        ? [
            { key:'snapshot', label:'Snapshot', icon:'◆' },
            { key:'strategy', label:'Strategy', icon:'⇄' },
            { key:'roster',   label:'Roster',   icon:'⚑' },
          ]
        : [
            { key:'snapshot', label:'Snapshot',     icon:'◆' },
            { key:'angles',   label:'Trade Angles', icon:'⇄' },
            { key:'roster',   label:'Roster',       icon:'⚑' },
          ],
      tab,
      (k) => k === 'snapshot' ? `#roster/${lg.id}/${r.roster_id}` : `#roster/${lg.id}/${r.roster_id}/${k}`
    ));

    const rosterDynasty = isDynastyLeague(lg);
    const s = computeRosterStrength(r, lg);
    const myRank = rankInLeague(lg, r.roster_id);
    const lineupRank = lineupRankInLeague(lg, r.roster_id);
    const rp = getRosterPlayers(r);
    const cs = s.rankedPlayers.filter(p=>p.ranked.category==='cornerstone').length;
    const fnd = s.rankedPlayers.filter(p=>p.ranked.category==='foundational').length;
    const valueTier = classifyValueTier(s, myRank, lg.total_rosters, cs);
    const valueArchetype = classifyValueArchetype(rp);
    const rosterArchetype = classifyRosterArchetype(rp);
    const dcSummary = getDraftCapitalSummary(r, leagueId);
    const draftPicksCount = 8 + dcSummary.totalAcquired - dcSummary.totalLost;
    const outlook = classifyTwoYearOutlook(valueTier, valueArchetype, draftPicksCount);
    const slotResult = gradeLineupSlots(rp, lg);
    const grades = {
      QB: rosterDynasty ? gradePosition(rp, 'QB', lg) : gradePositionFromSlots(slotResult, 'QB'),
      RB: rosterDynasty ? gradePosition(rp, 'RB', lg) : gradePositionFromSlots(slotResult, 'RB'),
      WR: rosterDynasty ? gradePosition(rp, 'WR', lg) : gradePositionFromSlots(slotResult, 'WR'),
      TE: rosterDynasty ? gradePosition(rp, 'TE', lg) : gradePositionFromSlots(slotResult, 'TE'),
      Bench: gradeBench(rp, lg), Draft: rosterDynasty ? gradeDraftCapital(r, leagueId) : null,
    };
    const slotWeighted = (() => {
      let num = 0, den = 0;
      for (const s of slotResult.slots) {
        const w = slotPPG(s.slot, lg);
        num += s.grade * w; den += w;
      }
      return den ? num / den : 0;
    })();
    const overall = rosterDynasty
      ? slotWeighted * 0.75 + grades.Bench * 0.15 + grades.Draft * 0.10
      : slotWeighted * (0.75 / 0.90) + grades.Bench * (0.15 / 0.90);
    const buysSells = suggestBuysSells(rp, lg);
    const priorities = topPriorities(rp, lg, valueTier, rosterArchetype);

    // ===== Top Banner: Value Tier + Archetypes + Outlook =====
    // ===== Roster Blueprint (one-row) =====
    // Distilled: tier + 3 archetypes + 4 stats collapsed into a single banner.
    // Tier anchors left; three numeric stats sit in tabular columns; the
    // three archetype chips run as a meta-line under the tier label.
    const overallColor = overall >= 7.5 ? 'var(--green)'
                       : overall >= 5.5 ? 'var(--amber)'
                       : overall >= 3.5 ? '#fb923c'
                       : 'var(--red)';
    main.appendChild(h('div', { class:'blueprint-row' },
      h('div', { class:`br-tier vt-${valueTier.tier.toLowerCase()}` },
        h('div', { class:'br-eyebrow' }, 'Roster Value Tier'),
        h('div', { class:'br-tier-value' }, valueTier.tier),
        h('div', { class:'br-tier-desc' }, valueTier.desc),
        h('div', { class:'br-arch-line' },
          h('span', { class:'br-arch', title: valueArchetype.desc }, h('span', { class:'br-arch-tag' }, valueArchetype.tag), ' core'),
          h('span', { class:'br-arch-sep' }, '·'),
          h('span', { class:'br-arch', title: rosterArchetype.desc }, h('span', { class:'br-arch-tag' }, rosterArchetype.tag), ' roster'),
          rosterDynasty ? h('span', { class:'br-arch-sep' }, '·') : null,
          rosterDynasty ? h('span', { class:'br-arch', title: outlook.desc }, h('span', { class:'br-arch-tag' }, outlook.tag), ' outlook') : null,
        ),
      ),
      h('div', { class:'br-stat' },
        h('div', { class:'br-stat-num tnum' }, fmt.decimal(s.total,1)),
        h('div', { class:'br-eyebrow' }, rosterDynasty ? 'Roster value, picks included' : 'Roster value'),
        h('div', { class:'br-stat-sub', title:'Every rostered asset summed, future picks included.' },
          `Value rank #${myRank} of ${lg.total_rosters}`,
          (() => {
            // Liquidity: % of dynasty value sitting in future picks. Per
            // Dynasty Domain, >35% means you can't move until next offseason.
            if (!rosterDynasty) return null;
            const pickShare = s.total > 0 ? (s.picksValue || 0) / s.total : 0;
            if (pickShare < 0.05) return null;
            const pct = Math.round(pickShare * 100);
            const tone = pickShare > 0.35 ? 'var(--red)' : pickShare > 0.22 ? 'var(--amber)' : 'var(--fg-2)';
            return h('span', {
              class:'br-stat-chip tnum',
              title:'Share of total dynasty value held in future draft picks. >35% = liquidity-locked per Dynasty Domain.',
              style:{ color: tone, marginLeft:'8px' },
            }, `${pct}% picks`);
          })()
        ),
        h('div', { class:'br-stat-sub', title:'Best legal starting lineup, picks excluded: the rank Dashboard and Standings show.' },
          `Lineup rank #${lineupRank} of ${lg.total_rosters}`),
      ),
      // ===== Value Share (Dynasty Domain framework) =====
      // % of total league dynasty value (player-only) you hold. Baseline =
      // 1/N. Above 1.24× baseline = contender-lock. Below 0.72× baseline =
      // rebuild territory. Color-coded against those bands.
      (() => {
        if (!rosterDynasty) return null;
        const vs = valueShareFor(r, lg);
        const cls = classifyValueShare(vs.share, vs.baseline);
        const pct = (vs.share * 100).toFixed(1);
        const basePct = (vs.baseline * 100).toFixed(1);
        const deltaPct = (cls.delta * 100);
        const tone = cls.tone === 'good' ? 'var(--green)'
                   : cls.tone === 'bad'  ? 'var(--red)'
                   : 'var(--amber)';
        return h('div', { class:'br-stat' },
          h('div', { class:'br-stat-num tnum', style:{ color: tone } }, `${pct}%`),
          h('div', { class:'br-eyebrow' }, 'Value Share'),
          h('div', { class:'br-stat-sub',
            title:`Your % of league-wide player-only dynasty value. Baseline ${basePct}%. ${cls.label} band per Dynasty Domain framework.`,
          },
            `${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}pp vs base`,
            h('span', { class:'br-stat-chip tnum', style:{ color: tone, marginLeft:'8px' } }, cls.label),
          ),
        );
      })(),
      rosterDynasty
        ? h('div', { class:'br-stat' },
            h('div', { class:'br-stat-num tnum' }, `${cs} / ${fnd}`),
            h('div', { class:'br-eyebrow' }, 'Cornerstones / Foundational'),
            h('div', { class:'br-stat-sub' }, 'Premier + building blocks'),
          )
        // Redraft has no premier/building-block split to count. What matters is
        // how many of this week's starting slots are filled by a player who
        // actually beats the waiver wire.
        : (() => {
            const slots = offenseStartingSlots(lg).length;
            const above = getRosterPlayers(r)
              .filter(pp => (vorByPid(pp._sleeperId, lg, 'blend') || 0) > 0).length;
            return h('div', { class:'br-stat' },
              h('div', { class:'br-stat-num tnum' }, `${Math.min(above, slots)} / ${slots}`),
              h('div', { class:'br-eyebrow' }, 'Starters above replacement'),
              h('div', { class:'br-stat-sub' }, 'Slots beating the waiver wire'),
            );
          })(),
      h('div', { class:'br-stat br-stat-grade' },
        h('div', { class:'br-stat-num tnum', style:{ color: overallColor } }, fmt.decimal(overall, 1) + '/10'),
        h('div', { class:'br-eyebrow' }, 'Overall Grade'),
        h('div', { class:'br-grade-bar' },
          h('div', { class:'br-grade-fill', style:{ width: Math.max(2, overall*10) + '%', background: overallColor } }),
        ),
      ),
    ));

    if (tab === 'snapshot') {
    // ===== Per-slot grade circles =====
    // Each starting lineup slot gets its own circular grade. The league's
    // roster_positions drives the slot list (QB1, RB1, RB2, WR1, WR2, TE1,
    // FLEX1-N, SF, IDP_FLEX 1-N etc). Bench depth + Draft Capital cap the row.
    main.appendChild(h('h2', { class:'section-title' }, 'Slot Grades'));
    // Position-specific depth: QB Depth (next best QB), TE Depth (next best TE),
    // FLEX Depth (next best RB/WR/TE). Each gives a quick look at injury insurance
    // for the part of the lineup that matters most.
    const benchDepth = (() => {
      const used = new Set(slotResult.slots
        .filter(s => s.player !== '(empty)')
        .map(s => s.player));
      const idx = rankIndex();
      const flexCount = (lg.roster_positions || []).filter(p => p === 'FLEX').length;
      const totalTeams = lg.total_rosters || 10;

      const bestUnusedAtPos = (positions) => {
        return rp.filter(p => p.ranked && positions.includes(p.ranked.pos) && !used.has(p.sleeper.name))
          .sort((a, b) => tierValue(b.ranked, lg) - tierValue(a.ranked, lg))[0];
      };
      // Reference values: roughly the n-th-best player at the position
      // representing where dynasty depth-buyer attention drops off.
      // dv() is the depth currency: in redraft, points over the best FREE body at the
      // position. Grading a bench piece against a starter baseline is what made this
      // whole block read 0.0 for three genuinely rosterable receivers.
      const dv = (x) => tierValue(x, lg, null, DEPTH_TIER);
      const nthAtPos = (pos, n) => {
        const sorted = idx.all.filter(x => x.pos === pos);
        return sorted[n] ? dv(sorted[n]) : 1;
      };
      const flexRef = (() => {
        const flexEligible = idx.all.filter(x => ['RB','WR','TE'].includes(x.pos))
          .sort((a, b) => dv(b) - dv(a));
        // ~3rd best FLEX-eligible past dedicated league slots
        return flexEligible[totalTeams * 3 + flexCount + 2];
      })();

      const out = [];
      // Backup QB = next QB after all starting QB slots filled. Label
      // matches the slot index so 1QB uses QB2, SF uses QB3, etc.
      const backupQb = bestUnusedAtPos(['QB']);
      if (backupQb) {
        const refV = nthAtPos('QB', totalTeams);
        const startedQbs = (lg.roster_positions || []).filter(p => p === 'QB' || p === 'SUPER_FLEX').length;
        out.push({
          slot: `QB${startedQbs + 1}`,
          player: backupQb.sleeper.name,
          myVal: dv(backupQb.ranked),
          refVal: refV,
          grade: refV > 0 ? Math.min(10, Math.round(dv(backupQb.ranked) / refV * 10 * 10) / 10) : 0,
          isDepth: true,
        });
      }
      // Backup TE
      const backupTe = bestUnusedAtPos(['TE']);
      if (backupTe) {
        const refV = nthAtPos('TE', totalTeams);
        out.push({
          slot: 'TE2',
          player: backupTe.sleeper.name,
          myVal: dv(backupTe.ranked),
          refVal: refV,
          grade: refV > 0 ? Math.min(10, Math.round(dv(backupTe.ranked) / refV * 10 * 10) / 10) : 0,
          isDepth: true,
        });
      }
      // FLEX Depth = average of the next 3 best unused FLEX-eligible (RB/WR/TE),
      // excluding the player already counted as Backup TE so we don't double-count.
      const teDepthName = backupTe ? backupTe.sleeper.name : null;
      const flexCandidates = rp.filter(p => p.ranked
          && ['RB','WR','TE'].includes(p.ranked.pos)
          && !used.has(p.sleeper.name)
          && p.sleeper.name !== teDepthName)
        .sort((a, b) => dv(b.ranked) - dv(a.ranked))
        .slice(0, 3);
      // One row per depth body. Averaging three into a single FLEX DEP bar hid which
      // of them was carrying the grade: "Pollard / Deebo / Jennings, 9.0" cannot tell
      // you that two are replacement-level and one is not.
      const refV = flexRef ? dv(flexRef) : 1;
      flexCandidates.forEach((p, i) => {
        const v = dv(p.ranked);
        out.push({
          slot: `DEP${i + 1}`,
          player: p.sleeper.name,
          vor: signedVor(p.ranked, lg, DEPTH_TIER),
          age: p.sleeper?.age ?? p.ranked?.age ?? null,
          pts: rosPointsByPid(lg).get(String(p.sleeper.id))?.pts ?? null,
          myVal: v,
          refVal: refV,
          grade: refV > 0 ? Math.min(10, Math.round(v / refV * 10 * 10) / 10) : 0,
          isDepth: true,
        });
      });
      return out;
    })();
    // Find the player attached to each slot for the bar label
    const slotPlayer = (s) => s.player && s.player !== '(empty)' ? s.player : '(empty)';
    const allBars = [
      ...slotResult.slots.map(s => ({ slot: s.slot, grade: s.grade, fvGrade: s.fvGrade, player: slotPlayer(s), myVal: s.myVal, refVal: s.refVal, vor: s.vor, age: s.age, pts: s.pts, injury: s.injury, isDepth: false })),
      ...benchDepth.map(s => ({ slot: s.slot, grade: s.grade, player: s.player, myVal: s.myVal, refVal: s.refVal, vor: s.vor, age: s.age, pts: s.pts, isDepth: true })),
      { slot: 'Bench', grade: gradeBench(rp, lg), player: 'roster depth', myVal: null, refVal: null, isDepth: true, isMeta: true },
      // Future picks are not an asset a redraft manager keeps, so the bar and
      // its share of the overall grade both come off there.
      rosterDynasty ? { slot: 'Draft', grade: gradeDraftCapital(r, leagueId), player: 'future picks', myVal: null, refVal: null, isDepth: true, isMeta: true } : null,
    ].filter(Boolean);
    // Track widths scale by PPG importance. All tracks share a common right
    // edge so the eye scans grade fills cleanly.
    const ppgs = allBars.map(s => slotPPG(s.slot, lg));
    const maxPPG = Math.max(...ppgs, 1);
    const rankIdx = rankIndex();
    const buildPosRankChip = (playerName) => {
      if (!playerName || typeof playerName !== 'string') return null;
      const entry = rankIdx.byName.get(norm(playerName));
      const pr = posRankFor(entry, lg);
      if (!pr) return null;
      return h('span', { class:'slot-bar-posrank tnum', title: pr.label }, `${entry.pos}${pr.rank}`);
    };

    const anyVor = allBars.some(x => x.vor != null);
    const buildSlotRow = (s, i) => {
      // Track width = how much that slot matters (PPG impact). Fill % = grade.
      const ratio = ppgs[i] / maxPPG;
      const trackPct = Math.round(25 + ratio * 75);
      const fillPct = Math.max(2, Math.min(100, s.grade * 10));
      const color = s.grade >= 7.5 ? 'var(--green)'
                  : s.grade >= 5.5 ? 'var(--amber)'
                  : s.grade >= 3.5 ? '#fb923c'
                  : 'var(--red)';
      // A signed VOR, where one exists, is the honest number for a slot: it can say
      // this man is BELOW what the waiver wire offers, which a 0-to-10 grade cannot.
      const vorTag = s.vor != null
        ? h('span', { class:'slot-bar-vor tnum' + (s.vor < 0 ? ' neg' : ''),
                      title:`Projected points ${s.vor < 0 ? 'BELOW' : 'above'} the best body available for free at this position` },
            `${s.vor > 0 ? '+' : ''}${fmt.decimal(s.vor, 0)}`)
        : null;
      const detail = (s.myVal != null && s.refVal != null)
        ? `${fmt.decimal(s.myVal, 1)}/${fmt.decimal(s.refVal, 1)}`
        : null;
      const isClickable = !s.isMeta && typeof s.player === 'string' && s.player !== '(empty)';
      const onClick = isClickable ? () => openPlayerDetail(s.player) : null;
      const fvPct = Math.max(0, Math.min(100, (s.fvGrade ?? s.grade) * 10));
      const fvDir = s.fvGrade != null ? (s.fvGrade > s.grade + 0.2 ? 'rising' : s.fvGrade < s.grade - 0.2 ? 'aging' : 'steady') : 'steady';
      const titleText = `${s.slot}: ${typeof s.player === 'string' ? s.player : s.player.join(', ')}. PV grade ${s.grade.toFixed(1)}/10${s.fvGrade != null ? `, FV (3-yr) ${s.fvGrade.toFixed(1)} (${fvDir})` : ''}${detail ? ` · value ${detail}` : ''}.`;

      const nameCol = Array.isArray(s.player)
        ? h('span', { class:'slot-bar-name' },
            ...s.player.flatMap((name, idx) => [
              idx > 0 ? h('span', { class:'slot-bar-namesep' }, ' · ') : null,
              h('span', {
                class:'slot-bar-nameitem',
                onclick: (e) => { e.stopPropagation(); openPlayerDetail(name); },
              }, name),
            ]).filter(Boolean))
        : h('span', { class:'slot-bar-name' }, s.player);

      const INJ_SHORT = { Questionable: 'Q', Doubtful: 'D', Out: 'OUT', IR: 'IR',
                          PUP: 'PUP', 'Injured Reserve': 'IR', Sus: 'SUS', COV: 'COV' };
      const injChip = s.injury
        ? h('span', { class: 'slot-bar-inj' + (s.injury === 'Questionable' ? ' is-q' : ''),
                      title: `${s.player} is listed ${s.injury}. He still holds this slot because he projects for the most points here.` },
            INJ_SHORT[s.injury] || String(s.injury).slice(0, 3).toUpperCase())
        : null;
      const posRankChip = !Array.isArray(s.player) ? buildPosRankChip(s.player) : null;

      return h('tr', {
        class: 'slot-row' + (isClickable ? ' clickable' : ''),
        title: titleText,
        onclick: onClick,
      },
        h('td', { class:'sr-slot' }, s.slot),
        h('td', { class:'sr-name' }, nameCol,
          injChip ? h('span', { class:'slot-bar-chips' }, injChip) : null),
        h('td', { class:'sr-pos' }, posRankChip),
        h('td', { class:'sr-num tnum', title: s.pts != null ? 'Projected points, rest of season' : '' },
          s.pts != null ? fmt.decimal(s.pts, 0) : '·'),
        h('td', { class:'sr-num sr-age tnum', title: s.age != null ? 'Age' : '' },
          s.age != null ? fmt.decimal(s.age, 1) : '·'),
        anyVor ? h('td', { class:'sr-num sr-vor tnum' + (s.vor != null && s.vor < 0 ? ' neg' : ''),
                  title: s.vor != null ? `Projected points ${s.vor < 0 ? 'BELOW' : 'above'} the best body available for free at this position` : '' },
          s.vor != null ? `${s.vor > 0 ? '+' : ''}${fmt.decimal(s.vor, 0)}` : '·') : null,
        h('td', { class:'sr-bar' },
          h('span', { class:'slot-bar-track', style:{ width: trackPct + '%' },
                      title: rosterDynasty
                        ? 'Bar length = how much this slot matters (points per game). Fill = how good your man is at it, 0 to 10. The faint mark at 70% is the line between an adequate starter and a hole. ◆ = the same grade three years from now.'
                        : 'Bar length = how much this slot matters (points per game). Fill = how good your man is at it, 0 to 10. The faint mark at 70% is the line between an adequate starter and a hole.' },
            h('span', { class:'slot-bar-fill', style:{ width: fillPct + '%', background: color } }),
            h('span', { class:'slot-bar-tick', style:{ left: '70%' } }),
            // Clamped so a 10.0 diamond sits inside the track instead of half past its end.
            (rosterDynasty && s.fvGrade != null) ? h('span', { class:`slot-bar-fv ${fvDir}`, style:{ left: `clamp(7px, ${fvPct}%, calc(100% - 7px))` }, title:`FV (3-yr): ${s.fvGrade.toFixed(1)} (${fvDir})` }) : null,
          ),
        ),
        h('td', { class:'sr-grade tnum', style:{ color } }, s.grade.toFixed(1)),
      );
    };

    // Two tables, starters and depth. Every number gets a column heading, which is
    // what the old bar rows lacked: "330  29.0" said nothing about what it was.
    const slotHead = () => h('thead', null, h('tr', null,
      h('th', null, 'Slot'),
      h('th', null, 'Player'),
      h('th', null, 'Rank'),
      h('th', { class:'right', title:'Projected points, rest of season' }, 'Proj'),
      h('th', { class:'right' }, 'Age'),
      anyVor ? h('th', { class:'right', title:'Projected points above or below the best freely available body at the position' }, 'VOR') : null,
      h('th', null, ''),
      h('th', { class:'right', title:'Slot grade out of 10' }, 'Grade'),
    ));
    const panel = (title) => {
      const body = h('tbody');
      const wrap = h('div', { class:'slot-bars-panel' },
        h('div', { class:'slot-bars-heading on-turf' }, title),
        h('table', { class:'data slot-table' }, slotHead(), body));
      return { wrap, body };
    };
    const starters = panel('Starters'), depth = panel('Depth');
    allBars.forEach((s, i) => {
      (s.isDepth ? depth.body : starters.body).appendChild(buildSlotRow(s, i));
    });
    main.appendChild(h('div', { class:'slot-bars-grid' }, starters.wrap, depth.wrap));
    main.appendChild(h('div', { class:'slot-bars-legend tip' },
      h('span', null, 'Bar length = how much the slot matters (pts/game).'),
      h('span', { class:'sep' }, '·'),
      h('span', null, 'Fill = how good your man is at it, 0 to 10.'),
      h('span', { class:'sep' }, '·'),
      h('span', null, 'The faint mark at 70% is the starter/hole line.'),
      rosterDynasty ? h('span', { class:'sep' }, '·') : null,
      rosterDynasty ? h('span', null, h('span', { class:'slot-bar-fv', style:{ position:'relative', display:'inline-block', top:'1px', left:0, transform:'rotate(45deg)', width:'8px', height:'8px' } }), ' = grade in 3 yrs (FV): green rising, amber aging.') : null,
    ));

    // ===== Owned draft picks =====
    // Redraft rookie picks are not tradeable assets that carry across a season,
    // so the chip strip is dynasty only.
    const snapPicks = rosterDynasty ? rosterOwnedPicks(r.roster_id, lg) : [];
    if (snapPicks.length) {
      main.appendChild(h('div', { class:'card picks-strip' },
        h('div', { class:'card-title' }, `Draft Picks · ${snapPicks.length}`),
        h('div', { class:'picks-chips' }, ...snapPicks.map(p => h('span', {
          class:'pick-chip', title:`Projected pick value ${fmt.decimal(p.value, 0)}${p.originRosterId && p.originRosterId !== r.roster_id ? ' (acquired)' : ''}`,
        },
          h('span', { class:'pick-chip-label' }, p.label),
          h('span', { class:'pick-chip-val tnum' }, fmt.decimal(p.value, 0)),
        ))),
      ));
    }

    // (Slot Detail table removed: bars carry the data; the table was redundant.)

    // ===== Lineup Composition (startable surplus / shortage) =====
    // For my own rosters, render Lineup Composition + Top Priorities side
    // by side so the diagnostic and the recommended actions read together.
    const ss = rosterSurplusShortage(rp, lg);
    const lineupCard = h('div', { class:'card lineup-comp' });
    (lg.is_idp ? ['QB','RB','WR','TE','LB','DB','DL'] : ['QB','RB','WR','TE'])
      .filter(pos => ss[pos])
      .forEach(pos => {
        const info = ss[pos];
        const color = info.surplus >= 1 ? 'var(--green)' : info.surplus <= -1 ? 'var(--red)' : 'var(--fg-2)';
        const sign = info.surplus > 0 ? '+' : '';
        const top3 = info.startablePlayers
          .map(p => ({ p, val: tierValue(p.ranked, lg) }))
          .sort((a,b) => b.val - a.val).slice(0,3);
        lineupCard.appendChild(h('div', { class:'lc-row' },
          h('div', { class:'lc-pos' }, pos),
          h('div', { class:'lc-stat' },
            h('span', { class:'lc-num tnum' }, String(info.startables)),
            h('span', { class:'lc-slash' }, '/'),
            h('span', { class:'lc-num tnum' }, String(info.need)),
            h('span', { class:'lc-eyebrow' }, 'startable / need'),
          ),
          h('div', { class:'lc-surplus tnum', style:{ color } },
            sign + info.surplus,
            h('span', { class:'lc-eyebrow' }, info.surplus > 0 ? 'surplus' : info.surplus < 0 ? 'short' : 'even'),
          ),
          h('div', { class:'lc-top' },
            top3.length
              ? top3.map(({p,val}) => h('span', { class:'lc-player', onclick:()=>openPlayerDetail(p.sleeper.name, p.sleeper.id) },
                  p.sleeper.name,
                  h('span', { class:'lc-pval tnum' }, fmt.decimal(val,0)),
                ))
              : [h('span', { class:'muted' }, 'no startable players at this position')]
          ),
        ));
      });
    const lineupNote = h('div', { class:'tip', style:{ marginTop:'6px' } },
      `Startable thresholds use league-wide positional slots (1QB target = ${(targetStartersByPos(lg).QB).toFixed(1)} per team, RB ${(targetStartersByPos(lg).RB).toFixed(1)}, WR ${(targetStartersByPos(lg).WR).toFixed(1)}, TE ${(targetStartersByPos(lg).TE).toFixed(1)}). Surplus ≥ 1 means you have spare startable assets to trade.`
    );

    if (r.is_me) {
      // Two-column: Lineup Composition (left) | Top Priorities (right).
      const prioritiesCard = h('div', { class:'card priorities-card' },
        ...priorities.map(p => h('div', { class:'priority-card' },
          h('div', { class:'priority-icon' }, p.icon),
          h('div', { class:'priority-text' }, p.text),
        ))
      );
      main.appendChild(h('div', { class:'lineup-priorities-grid' },
        h('div', null,
          h('h2', { class:'section-title' }, 'Lineup Composition'),
          lineupCard,
          lineupNote,
        ),
        h('div', null,
          h('h2', { class:'section-title' }, 'Top Priorities'),
          prioritiesCard,
        ),
      ));
    } else {
      main.appendChild(h('h2', { class:'section-title' }, 'Lineup Composition'));
      main.appendChild(lineupCard);
      main.appendChild(lineupNote);
    }
    } // end snapshot tab

    // The advice blocks below only fire on the user's own roster on the
    // 'strategy' sub-tab. Telling someone else's team to "sell Cooper Kupp"
    // is irrelevant; non-self rosters get the 'angles' tab instead.
    if (r.is_me && tab === 'strategy') {

    // ===== Coaching Tips (strategy.js context-aware rules) =====
    const coachingTips = evaluateCoachingTips({
      rosterPlayers: rp, league: lg, roster: r,
      stance: stanceOf(valueTier.tier, valueArchetype.tag),
      archetype: rosterArchetype.tag,
      valueTier: valueTier.tier,
      surplus: rosterSurplusShortage(rp, lg),
      strength: s,
    });
    if (coachingTips.length && rosterDynasty) {
      main.appendChild(h('h2', { class:'section-title' }, 'Coaching Tips'));
      main.appendChild(h('div', { class:'priorities' },
        ...coachingTips.slice(0, 4).map(t => h('div', { class:'priority-card', style:{ borderLeftColor:'var(--blue)' } },
          h('div', { class:'priority-icon', style:{ color:'var(--blue)' } }, '◆'),
          h('div', { class:'priority-text' }, t),
        ))
      ));
    }

    // ===== Buys / Sells / Market gauge =====
    main.appendChild(h('h2', { class:'section-title' }, 'Recommended Trade Activity'));
    main.appendChild(h('div', { class:'trade-grid' },
      h('div', { class:'card' },
        h('div', { class:'card-title' }, h('span', { style:{color:'var(--green)'} }, '↑ Buys')),
        buysSells.buys.length
          ? h('div', null, ...buysSells.buys.map(b => buyRow(b, false)))
          : h('div', { class:'tip' }, 'No high-priority targets right now.')
      ),
      h('div', { class:'card' },
        h('div', { class:'card-title' }, h('span', { style:{color:'var(--red)'} }, '↓ Sells')),
        buysSells.sells.length
          ? h('div', null, ...buysSells.sells.map(b => buyRow(b, true)))
          : h('div', { class:'tip' }, 'No glaring sell candidates.')
      ),
      marketGauge(buysSells)
    ));

    // ===== Trade Strategy =====
    const ts = tradeStrategy(rp, lg);
    if (ts.downtier.length || ts.uptier.length || ts.pivot.length) {
      main.appendChild(h('h2', { class:'section-title' }, 'Trade Strategy'));
      main.appendChild(h('div', { class:'card-grid cols-3' },
        tradeScenarioCard('↓ Downtier', ts.downtier, 'var(--blue)', lg),
        tradeScenarioCard('↑ Uptier',   ts.uptier,   'var(--green)', lg),
        tradeScenarioCard('⇄ Pivot',    ts.pivot,    'var(--accent-hot)', lg),
      ));
      const ssWeak = ts.surplus[ts.weakPos];
      const ssStrong = ts.surplus[ts.strongPos];
      main.appendChild(h('div', { class:'tip', style:{ marginTop:'8px' } },
        `Pivot trades your ${ts.strongPos} surplus (${ssStrong.startables} startable, need ${ssStrong.need}, +${ssStrong.surplus}) for help at ${ts.weakPos} (${ssWeak.startables} of ${ssWeak.need} startable, ${ssWeak.surplus < 0 ? ssWeak.surplus : '+'+ssWeak.surplus}).`
      ));
    }

    // ===== Ideal Trade Partners + Age tracker =====
    main.appendChild(h('h2', { class:'section-title' }, 'Ideal Trade Partners'));
    const partners = idealTradePartners(r, lg);
    const stanceColor = (s) => s === 'contend' ? 'var(--amber)' : s === 'rebuild' ? 'var(--green)' : 'var(--blue)';
    main.appendChild(h('div', { class: rosterDynasty ? 'card-grid cols-2' : 'card-grid' },
      h('div', { class:'card', style:{ padding:0, overflow:'hidden' } },
        h('table', { class:'data snug' },
          h('thead', null, h('tr', null,
            h('th', null, '#'),
            h('th', null, 'Team'),
            h('th', null, 'Stance'),
            h('th', null, 'Why'),
            h('th', { class:'right' }, 'Score'),
          )),
          h('tbody', null, ...partners.map((p, i) => h('tr', { onclick:()=>navigate(`#roster/${lg.id}/${p.roster.roster_id}`) },
            h('td', { class:'tnum' }, `${i+1}`),
            h('td', null, h('div', null,
              h('div', { class:'name' }, p.roster.team_name),
              h('div', { class:'tip' }, p.roster.owner_name)
            )),
            h('td', null,
              h('span', { class:'badge', style:{ color: stanceColor(p.theirStance), borderColor: stanceColor(p.theirStance), background: 'transparent' } }, p.theirValueTier.tier),
              h('div', { class:'tip', style:{ marginTop:'2px' } }, p.theirArchetype.tag)
            ),
            h('td', null, p.notes.length ? h('div', { class:'tip' }, p.notes.slice(0,2).join('. ')) : h('span', { class:'muted' }, '.')),
            h('td', { class:'right tnum', style:{ fontWeight:700 } }, fmt.decimal(p.fit, 1)),
          )))
        )
      ),
      rosterDynasty ? positionalAgeTracker(rp) : null,
    ));
    // Compact callout: explain my own stance to anchor the reader
    if (rosterDynasty && partners[0]) {
      const myStance = partners[0].myStance;
      const stanceLabel = { contend:'Contender', rebuild:'Rebuilder', reload:'Reloader' }[myStance];
      const advice = myStance === 'contend' ? 'Target rebuilders. Trade picks and youth for established starters.'
                   : myStance === 'rebuild' ? 'Target contenders. Trade established starters for picks and youth.'
                   : 'Watch for asymmetric matchups. Look at the rebuilders for stars; the contenders for picks.';
      main.appendChild(h('div', { class:'tip', style:{ marginTop:'8px' } },
        `Your stance: ${stanceLabel}. ${advice}`
      ));
    }

    } // end if (r.is_me && tab === 'strategy'), advice block

    if (tab === 'roster') {
    // ===== Roster by Position =====
    main.appendChild(h('h2', { class:'section-title' }, 'Roster by Position'));
    const byPos = { QB:[], RB:[], WR:[], TE:[], OTHER:[] };
    for (const p of rp) {
      const pos = p.sleeper.pos;
      if (byPos[pos]) byPos[pos].push(p);
      else byPos.OTHER.push(p);
    }
    for (const arr of Object.values(byPos)) arr.sort((a,b) => (b.ranked ? tierValue(b.ranked,lg) : 0) - (a.ranked ? tierValue(a.ranked,lg) : 0));
    main.appendChild(h('div', { class:'pos-grid' },
      posColumn('QB', byPos.QB, lg),
      posColumn('RB', byPos.RB, lg),
      posColumn('WR', byPos.WR, lg),
      posColumn('TE', byPos.TE, lg),
      byPos.OTHER.length ? posColumn('IDP / Other', byPos.OTHER, lg) : null,
    ));

    // ===== Draft Capital =====
    if (rosterDynasty) {
    main.appendChild(h('h2', { class:'section-title' }, 'Draft Capital'));
    main.appendChild(h('div', { class:'card-grid cols-2' },
      draftCapitalCard(dcSummary, r.roster_id, lg),
      h('div', { class:'card' },
        h('div', { class:'card-title' }, 'Pick Trades Net'),
        h('div', { class:'stat-num' }, `${dcSummary.totalAcquired - dcSummary.totalLost > 0 ? '+' : ''}${dcSummary.totalAcquired - dcSummary.totalLost}`),
        h('div', { class:'stat-label' }, `Acquired ${dcSummary.totalAcquired}, traded away ${dcSummary.totalLost}`),
        h('div', { style:{ marginTop:'10px' } },
          h('div', { class:'tip' }, dcSummary.totalLost > dcSummary.totalAcquired ? 'Net pick seller, tilt back toward picks if rebuilding.' : 'Net pick buyer, strong rookie-draft ammo.'),
        ),
      ),
    ));
    }

    } // end roster tab (Roster by Position + Draft Capital)

    // ===== "How to Trade With This Owner" panel =====
    // Only shown when viewing someone else's roster AND user has a roster
    // in this league. Frames trade angles from MY perspective looking at THEM.
    if (!r.is_me && tab === 'angles') {
      const myRoster = lg.rosters.find(rr => rr.is_me);
      if (myRoster) {
        const myRP_in_lg = getRosterPlayers(myRoster);
        const mySurplus = rosterSurplusShortage(myRP_in_lg, lg);
        const theirSurplus = rosterSurplusShortage(getRosterPlayers(r), lg); // viewed roster's needs
        const myStrength = computeRosterStrength(myRoster, lg);
        const myCs = myStrength.rankedPlayers.filter(p => p.ranked.category === 'cornerstone').length;
        const myValueTier = classifyValueTier(myStrength, rankInLeague(lg, myRoster.roster_id), lg.total_rosters, myCs);
        const myArch = classifyValueArchetype(myRP_in_lg);
        const myStance = stanceOf(myValueTier.tier, myArch.tag);
        const theirStance = stanceOf(valueTier.tier, valueArchetype.tag);

        const angles = [];
        for (const pos of ['QB','RB','WR','TE']) {
          if (mySurplus[pos].surplus >= 1 && theirSurplus[pos].surplus <= -1) {
            angles.push({
              direction: 'send',
              pos,
              text: `Send your spare ${pos} (you have ${mySurplus[pos].startables} startable, need ${mySurplus[pos].need}). They have ${theirSurplus[pos].startables} of ${theirSurplus[pos].need} ${pos}s. Ask for: ${(theirSurplus[Object.keys(theirSurplus).find(p2 => theirSurplus[p2].surplus >= 1) || pos]?.surplus >= 1 ? 'their surplus position' : 'a future 1st')}.`
            });
          }
          if (theirSurplus[pos].surplus >= 1 && mySurplus[pos].surplus <= -1) {
            angles.push({
              direction: 'receive',
              pos,
              text: `Target their spare ${pos} (they have ${theirSurplus[pos].startables} startable, need ${theirSurplus[pos].need}). You have ${mySurplus[pos].startables} of ${mySurplus[pos].need} ${pos}s. Offer: a player from your strongest position or a 1st.`
            });
          }
        }

        const stanceMessage = (myStance === 'contend' && theirStance === 'rebuild')
          ? "They're rebuilding, you're contending. They want picks + youth; you have starters they can't get from contenders. CLASSIC ASYMMETRIC."
          : (myStance === 'rebuild' && theirStance === 'contend')
            ? "They're contending, you're rebuilding. Their stars are stale to them; offer picks for their depth."
            : (myStance === theirStance)
              ? `Both ${myStance}. Hard to find asymmetric trades; only meaningful angle is positional surplus/shortage match.`
              : `You: ${myStance}. Them: ${theirStance}. Mid-asymmetry; positional fit must do the work.`;

        main.appendChild(h('h2', { class:'section-title' }, `How to Trade With ${r.team_name}`));
        main.appendChild(h('div', { class:'card' },
          h('div', { class:'tip', style:{ marginBottom:'10px' } }, stanceMessage),
          angles.length
            ? h('div', null, ...angles.map(a => h('div', { class:'priority-card', style:{ borderColor: `color-mix(in oklab, ${a.direction === 'send' ? 'var(--green)' : 'var(--blue)'} 42%, var(--border))`, marginBottom:'6px' } },
                h('div', { class:'priority-icon', style:{ color: a.direction === 'send' ? 'var(--green)' : 'var(--blue)' } }, a.direction === 'send' ? '→' : '←'),
                h('div', { class:'priority-text' }, a.text)
              )))
            : h('div', { class:'tip' }, 'No clean positional fit; trades will need to be value-for-value swaps within the same position.'),
          h('div', { style:{ marginTop:'12px', display:'flex', gap:'8px' } },
            h('a', { href:`#trade/${lg.id}` , onclick: () => {
              TRADE_STATE.leagueId = lg.id;
              TRADE_STATE.sideA = { rosterId: myRoster.roster_id, picks: new Set() };
              TRADE_STATE.sideB = { rosterId: r.roster_id,        picks: new Set() };
            }}, h('button', { class:'primary' }, 'Open Trade Calculator with This Pairing →'))
          )
        ));
      }
    }

    if (tab === 'roster') {
    // ===== Roster (slot-by-slot) =====
    main.appendChild(h('h2', { class:'section-title' }, 'Roster'));
    const sections = [
      ['Starters', r.starters],
      ['Bench',    (r.players||[]).filter(p => !r.starters.includes(p) && !r.taxi.includes(p) && !r.reserve.includes(p))],
      ['Taxi',     r.taxi],
      ['IR/Reserve', r.reserve],
    ];
    // Redraft never reaches +1y, and Category/Tier price a career, so the roster
    // table collapses to today's value in a redraft league.
    const yrHorizons = rosterDynasty ? [0, 1, 2, 3, 4, 5] : [0];
    // Color a projected-value cell by its retention vs today (yearsOut=0).
    // >1.05 grew (cornerstone young player); 0.85-1.05 hold; 0.6-0.85 fade;
    // <0.6 cliff. The "Today" column shows raw value with no relative tint.
    const retentionClass = (ratio) => {
      if (ratio >= 1.05) return 'val-grow';
      if (ratio >= 0.85) return 'val-hold';
      if (ratio >= 0.60) return 'val-fade';
      return 'val-cliff';
    };
    for (const [title, ids] of sections) {
      if (!ids.length) continue;
      main.appendChild(h('div', { class:'roster-section' },
        h('h3', null, title, ' ', h('span', { class:'muted' }, `(${ids.length})`)),
        h('div', { class:'card', style:{ padding:0, overflow:'hidden' } },
          h('table', { class:'data' },
            h('thead', null, h('tr', null,
              h('th', null, 'Player'),
              ...expertHeaders(),
              h('th', null, 'Pos'),
              h('th', null, 'Team'),
              h('th', null, 'Age'),
              rosterDynasty ? h('th', null, 'Category') : null,
              rosterDynasty ? h('th', null, 'Tier') : null,
              ...yrHorizons.map(n => h('th', { class:'right' }, n === 0 ? 'Today' : `+${n}y`)),
            )),
            h('tbody', null, ...ids.map(pid => {
              const sp = window.PLAYERS[pid];
              if (!sp) return h('tr', null, h('td', { colspan: (rosterDynasty ? 6 : 4) + activeExpertSources().length + yrHorizons.length }, h('span', { class:'muted' }, `Unknown ${pid}`)));
              const ranked = rankIndex().bySleeperId.get(pid) || rankIndex().byName.get(norm(sp.name));
              const v0 = ranked ? tierValue(ranked, lg) : 0;
              const yrCells = yrHorizons.map(n => {
                if (!ranked || !v0) return h('td', { class:'right' }, h('span', { class:'muted' }, '.'));
                const vN = projectAssetValue(v0, sp.age, ranked.pos, n);
                const cls = n === 0 ? '' : retentionClass(vN / v0);
                return h('td', { class:`right tnum val-cell ${cls}` }, fmt.decimal(vN, 1));
              });
              return h('tr', { onclick:()=>openPlayerDetail(sp.name, pid) },
                h('td', null, h('div', { class:'name-cell' },
                  headshot(pid),
                  h('span', { class:'name' }, sp.name),
                  markButton(lg.id, pid, sp.name))),
                ...expertCells(sp.name, pid),
                h('td', null, posChip(sp.pos)),
                h('td', null, teamChip(sp.team)),
                h('td', null, sp.age ?? ','),
                rosterDynasty ? h('td', null, ranked ? (ourCatChip(ranked._sleeperId) || pillCategory(ranked.category)) : h('span', { class:'muted' }, ',')) : null,
                rosterDynasty ? h('td', null, ranked ? (ourTierChip(ranked._sleeperId) || tierChip(ranked.tier, ranked.category)) : h('span', { class:'muted' }, ',')) : null,
                ...yrCells,
              );
            }))
          )
        )
      ));
    }
    } // end roster tab (slot-by-slot table)
  }

  // ---- Blueprint sub-components ----
  function archetypeChip(label, tag, desc) {
    return h('div', { class:'arch-chip', title: desc },
      h('div', { class:'arch-label' }, label),
      h('div', { class:'arch-tag' }, tag),
      h('div', { class:'arch-desc' }, desc),
    );
  }
  // Approximate PPR fantasy points per game contributed by the n-th best
  // player at a slot, used to size each grade circle proportionally to
  // lineup impact. Numbers reflect dynasty-startable averages.
  function slotPPG(label, league) {
    const isSF = league?.is_superflex;
    const tep = (league?.scoring?.bonus_rec_te || 0) * 4; // ~4 receptions/game
    const t = {
      'QB1': isSF ? 22 : 20,
      'SF':  18,
      'RB1': 18, 'RB2': 14,
      'WR1': 16, 'WR2': 13,
      'TE1': 9 + tep,
      'FLEX1': 13, 'FLEX2': 12, 'FLEX3': 11, 'FLEX4': 10,
      'IDP1': 7, 'IDP2': 6, 'IDP3': 5,
      'LB1': 8, 'LB2': 7, 'DB1': 6, 'DL1': 6,
      'QB2': 6, 'QB3': 5, 'TE2': 3,
      // Depth bodies, descending: the first one off the bench plays more weeks than
      // the third. Split from a single 'FLEX DEP' row so each is priced separately.
      'DEP1': 7, 'DEP2': 5, 'DEP3': 4,
      'Depth 1': 5, 'Depth 2': 4,
      'Bench': 2,
      'Draft': 2,
    };
    return t[label] != null ? t[label] : 8;
  }

  function gradeCircle(label, grade, weight = 1) {
    const ns = 'http://www.w3.org/2000/svg';
    const color = grade >= 7.5 ? 'var(--green)' : grade >= 5.5 ? 'var(--amber)' : grade >= 3.5 ? '#fb923c' : 'var(--red)';
    // Scale the SVG by weight so high-impact slots (QB1, RB1) draw the eye.
    // Min 0.55 keeps depth circles legible.
    const scale = Math.max(0.55, Math.min(1.0, weight));
    const size = Math.round(90 * scale);
    const cxy = size / 2;
    const r = Math.round(36 * scale);
    const sw = Math.max(4, Math.round(7 * scale));
    const pct = Math.max(2, grade*10);
    const circumference = 2 * Math.PI * r;
    const dash = (pct/100) * circumference;
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    const bg = document.createElementNS(ns, 'circle');
    bg.setAttribute('cx', String(cxy)); bg.setAttribute('cy', String(cxy)); bg.setAttribute('r', String(r));
    bg.setAttribute('fill','none'); bg.setAttribute('stroke','var(--bg-3)'); bg.setAttribute('stroke-width', String(sw));
    svg.appendChild(bg);
    const fg = document.createElementNS(ns, 'circle');
    fg.setAttribute('cx', String(cxy)); fg.setAttribute('cy', String(cxy)); fg.setAttribute('r', String(r));
    fg.setAttribute('fill','none'); fg.setAttribute('stroke', color); fg.setAttribute('stroke-width', String(sw));
    fg.setAttribute('stroke-linecap','round');
    fg.setAttribute('stroke-dasharray', `${dash} ${circumference}`);
    fg.setAttribute('transform', `rotate(-90 ${cxy} ${cxy})`);
    svg.appendChild(fg);
    // Number font also scales with size (capped). This keeps the visual
    // weight of QB1 visibly larger than Depth.
    const numSize = Math.round(1.4 * scale * 16); // px, base 22.4px, scaled
    return h('div', { class:'grade-cell' },
      h('div', { class:'grade-svg-wrap', style:{ width: size + 'px', height: size + 'px' } },
        svg,
        h('div', { class:'grade-num', style:{ color, fontSize: numSize + 'px' } }, grade.toFixed(1))
      ),
      h('div', { class:'grade-label' }, label)
    );
  }
  function buyRow(b, isSell) {
    const col = isSell ? 'var(--red)' : 'var(--green)';
    return h('div', { class:'buy-row', onclick: ()=>openPlayerDetail(b.player.name, b.player._sleeperId) },
      h('div', null,
        h('div', { class:'name-cell' },
          posChip(b.player.pos), teamChip(b.player.team), h('span', { class:'name' }, b.player.name),
        ),
        h('div', { class:'tip' }, b.reason)
      ),
      h('span', { class:'intensity', style:{ color: col, borderColor: col } }, b.intensity)
    );
  }
  function posColumn(pos, players, lg) {
    // Map "IDP / Other" header back to a real position for the slots calc
    const realPos = ['QB','RB','WR','TE'].includes(pos) ? pos : null;
    const targets = realPos ? targetStartersByPos(lg) : null;
    const need = realPos ? (targets[realPos] || 0) : 0;
    const startableCount = realPos
      ? players.filter(p => p.ranked && isStartable(p.ranked, lg)).length
      : players.filter(p => p.ranked).length;
    const surplus = realPos ? (startableCount - Math.ceil(need)) : null;
    const surplusColor = surplus == null ? 'var(--fg-3)'
      : surplus >= 1 ? 'var(--green)'
      : surplus <= -1 ? 'var(--red)'
      : 'var(--fg-2)';
    const surplusLabel = surplus == null ? ''
      : surplus > 0 ? `+${surplus} spare`
      : surplus < 0 ? `${surplus} short`
      : 'even';
    // Use position-max for a normalized value bar.
    const maxPV = realPos ? maxPosValue(realPos, lg) : 100;
    // Sort: ranked first by tierValue desc, then unranked alphabetically.
    const sorted = players.slice().sort((a, b) => {
      const av = a.ranked ? tierValue(a.ranked, lg) : -1;
      const bv = b.ranked ? tierValue(b.ranked, lg) : -1;
      if (av !== bv) return bv - av;
      return a.sleeper.name.localeCompare(b.sleeper.name);
    });

    const rows = [];
    let posIdx = 0; // positional rank within this roster
    let dividerPlaced = false;
    sorted.slice(0, 16).forEach((p, i) => {
      // Insert a thin divider after the startable count so depth is visually
      // separated from starters. Only when there's a real startable threshold.
      if (realPos && !dividerPlaced && i === startableCount && i > 0) {
        rows.push(h('div', { class:'pos-col-divider', title:'Below: depth, not currently startable league-wide' }, 'depth'));
        dividerPlaced = true;
      }
      posIdx++;
      const val = p.ranked ? tierValue(p.ranked, lg) : 0;
      const ratio = maxPV > 0 ? Math.max(0, Math.min(1, val / maxPV)) : 0;
      const sleeper = p.sleeper;
      const owned = sleeper.owned;
      const started = sleeper.started;
      const isDepth = owned != null && started != null && owned > 30 && started < 25 && (owned - started) > 30;
      const barColor = !p.ranked ? 'var(--bg-3)'
        : window.CATEGORY_COLORS[p.ranked.category] || 'var(--accent)';
      const titleAttr = `${sleeper.name} (${sleeper.pos}, ${sleeper.team || 'FA'}${sleeper.age ? ', age ' + sleeper.age : ''})${p.ranked ? ', value ' + fmt.decimal(val, 1) : ''}${isDepth ? ', DEPTH (owned ' + owned + '% / started ' + started + '%)' : ''}`;
      rows.push(h('div', { class:'pos-col-row' + (p.ranked && i < startableCount ? ' starter' : '') + (isDepth ? ' is-depth' : '') , onclick:()=>openPlayerDetail(sleeper.name, p.pid), title: titleAttr },
        h('span', { class:'pos-col-rank tnum' }, realPos ? `${pos}${posIdx}` : `#${posIdx}`),
        headshot(p.pid, 22),
        // Initial + surname: the headshot costs the column its width, and
        // "Caleb ..." identifies nobody. The full name is in the row's title.
        h('span', { class:'pos-col-pname' },
          sleeper.name.includes(' ') ? `${sleeper.name[0]}. ${sleeper.name.split(' ').slice(1).join(' ')}` : sleeper.name,
          injuryChip(p.pid)),
        h('span', { class:'pos-col-age tnum' }, sleeper.age ? sleeper.age : ''),
        h('span', { class:'pos-col-bar-wrap' },
          h('span', { class:'pos-col-bar', style:{ width: `${(ratio*100).toFixed(0)}%`, background: barColor } }),
        ),
        h('span', { class:'pos-col-val tnum' }, p.ranked ? fmt.decimal(val, 1) : ''),
      ));
    });
    if (sorted.length > 16) {
      rows.push(h('div', { class:'pos-col-more' }, `+${sorted.length - 16} more`));
    }

    return h('div', { class:'pos-col' },
      h('div', { class:'pos-col-head' },
        h('div', null,
          h('span', { class:'pos-col-pos' }, pos),
          realPos ? h('span', { class:'pos-col-need', title:'Startable players / league-wide starter need per team' }, ` ${startableCount}/${need.toFixed(1)}`) : null,
        ),
        h('div', { class:'pos-col-head-right' },
          surplus != null ? h('span', { class:'pos-col-surplus tnum', style:{ color: surplusColor },
            title:'Startable players beyond the lineup need. Spare is trade stock, short is a hole.' }, surplusLabel) : null,
          h('span', { class:'pos-col-total muted tnum', title:`${players.length} ${pos} on this roster` }, `${players.length} total`),
        )
      ),
      h('div', { class:'pos-col-body' }, ...rows)
    );
  }
  // ---- Market Value Gauge ----
  // needle position 0-100 based on Buy/Sell intensity balance
  function marketGauge(buysSells) {
    const buyScore = buysSells.buys.reduce((a,b) => a + (b.intensity==='HARD BUY'?3:b.intensity==='BUY'?2:1), 0);
    const sellScore = buysSells.sells.reduce((a,b) => a + (b.intensity==='HARD SELL'?3:b.intensity==='SELL'?2:1), 0);
    const tilt = (buyScore - sellScore) / Math.max(1, buyScore + sellScore); // -1..1
    const pct = Math.max(5, Math.min(95, 50 + tilt*45));
    const label = pct < 35 ? 'SELL ' + Math.round(100-pct) + '%' : pct > 65 ? 'BUY ' + Math.round(pct) + '%' : 'HOLD';
    const color = pct < 35 ? 'var(--red)' : pct > 65 ? 'var(--green)' : 'var(--amber)';
    // Build a half-circle SVG gauge
    const cx = 100, cy = 90, r = 70;
    const ang = (pct/100) * 180; // degrees
    const rad = (180 - ang) * Math.PI / 180;
    const tx = cx + r * Math.cos(rad);
    const ty = cy - r * Math.sin(rad);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 200 110');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '120');
    // background sectors
    const sectors = [
      ['M 30 90 A 70 70 0 0 1 70 30',  'var(--red)'],
      ['M 70 30 A 70 70 0 0 1 130 30', 'var(--amber)'],
      ['M 130 30 A 70 70 0 0 1 170 90','var(--green)'],
    ];
    for (const [d, c] of sectors) {
      const p = document.createElementNS(ns,'path');
      p.setAttribute('d', d); p.setAttribute('stroke', c); p.setAttribute('stroke-width','14');
      p.setAttribute('fill','none'); p.setAttribute('opacity','0.25'); p.setAttribute('stroke-linecap','round');
      svg.appendChild(p);
    }
    // needle
    const needle = document.createElementNS(ns, 'line');
    needle.setAttribute('x1', cx); needle.setAttribute('y1', cy);
    needle.setAttribute('x2', tx); needle.setAttribute('y2', ty);
    needle.setAttribute('stroke', color); needle.setAttribute('stroke-width','3'); needle.setAttribute('stroke-linecap','round');
    svg.appendChild(needle);
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('r', 5); dot.setAttribute('fill', color);
    svg.appendChild(dot);
    // labels
    const left = document.createElementNS(ns,'text');
    left.setAttribute('x','25'); left.setAttribute('y','105'); left.setAttribute('fill','var(--red)');
    left.setAttribute('font-size','10'); left.setAttribute('font-weight','700');
    left.textContent='SELL'; svg.appendChild(left);
    const mid = document.createElementNS(ns,'text');
    mid.setAttribute('x','100'); mid.setAttribute('y','22'); mid.setAttribute('fill','var(--amber)');
    mid.setAttribute('font-size','10'); mid.setAttribute('font-weight','700'); mid.setAttribute('text-anchor','middle');
    mid.textContent='HOLD'; svg.appendChild(mid);
    const rgt = document.createElementNS(ns,'text');
    rgt.setAttribute('x','175'); rgt.setAttribute('y','105'); rgt.setAttribute('fill','var(--green)');
    rgt.setAttribute('font-size','10'); rgt.setAttribute('font-weight','700'); rgt.setAttribute('text-anchor','end');
    rgt.textContent='BUY'; svg.appendChild(rgt);

    return h('div', { class:'card' },
      h('div', { class:'card-title' }, 'Market Activity'),
      svg,
      h('div', { class:'gauge-label', style:{ color, marginTop:'-8px' } }, label),
      h('div', { class:'tip', style:{ textAlign:'center' } }, 'Recommended trade posture')
    );
  }

  // ---- Positional Age Tracker ----
  function positionalAgeTracker(rosterPlayers) {
    // For each pos, current avg age of top-3 ranked players, projected forward
    const years = [2026, 2027, 2028, 2029, 2030];
    const positions = ['QB','RB','WR','TE'];
    const colors = { QB:'#fee2e2', RB:'#34d399', WR:'#60a5fa', TE:'#fbbf24' };
    const series = {};
    for (const pos of positions) {
      const top = rosterPlayers.filter(p => p.ranked && p.ranked.pos === pos)
        .sort((a,b) => tierValue(b.ranked,{}) - tierValue(a.ranked,{}))
        .slice(0,3);
      if (!top.length) continue;
      const avg = top.reduce((s,p) => s + (p.sleeper.age || 25), 0) / top.length;
      series[pos] = years.map((y, i) => avg + i);
    }

    const ns = 'http://www.w3.org/2000/svg';
    const W = 600, H = 180, P = 30;
    const minAge = 22, maxAge = 35;
    const xFor = (i) => P + (i / (years.length-1)) * (W - 2*P);
    const yFor = (age) => H - P - ((age - minAge) / (maxAge - minAge)) * (H - 2*P);

    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', '100%'); svg.setAttribute('height', '180');

    // Y grid
    for (const age of [25, 28, 31, 34]) {
      const y = yFor(age);
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', P); line.setAttribute('x2', W-P);
      line.setAttribute('y1', y); line.setAttribute('y2', y);
      line.setAttribute('stroke', 'var(--border)'); line.setAttribute('stroke-dasharray','2,4');
      svg.appendChild(line);
      const lbl = document.createElementNS(ns, 'text');
      lbl.setAttribute('x', 4); lbl.setAttribute('y', y+3);
      lbl.setAttribute('fill','var(--fg-3)'); lbl.setAttribute('font-size','9');
      lbl.textContent = age; svg.appendChild(lbl);
    }
    // X labels
    years.forEach((y, i) => {
      const x = xFor(i);
      const lbl = document.createElementNS(ns, 'text');
      lbl.setAttribute('x', x); lbl.setAttribute('y', H-8);
      lbl.setAttribute('fill', 'var(--fg-3)'); lbl.setAttribute('font-size','9');
      lbl.setAttribute('text-anchor','middle');
      lbl.textContent = y; svg.appendChild(lbl);
    });
    // Series
    for (const [pos, vals] of Object.entries(series)) {
      const path = document.createElementNS(ns, 'path');
      const d = vals.map((a,i) => `${i===0?'M':'L'} ${xFor(i)} ${yFor(a)}`).join(' ');
      path.setAttribute('d', d);
      path.setAttribute('stroke', colors[pos]);
      path.setAttribute('stroke-width', '2');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-linecap','round'); path.setAttribute('stroke-linejoin','round');
      svg.appendChild(path);
      // dots
      vals.forEach((a,i) => {
        const c = document.createElementNS(ns, 'circle');
        c.setAttribute('cx', xFor(i)); c.setAttribute('cy', yFor(a));
        c.setAttribute('r', 3); c.setAttribute('fill', colors[pos]);
        svg.appendChild(c);
      });
    }
    // Legend
    const legend = h('div', { class:'age-legend' });
    for (const pos of Object.keys(series)) {
      legend.appendChild(h('span', { class:'age-legend-item' },
        h('span', { class:'dot', style:{ background: colors[pos] } }), pos));
    }
    return h('div', { class:'card' },
      h('div', { class:'card-title' }, 'Positional Age Tracker'),
      svg,
      legend,
      h('div', { class:'tip', style:{ marginTop:'4px' } }, 'Average age of top-3 ranked players per position, projected forward.')
    );
  }

  // Ideal Trade Partners, surplus-aware AND outlook-aware.
  // Real-world dynamic: rebuilders sell stars for picks/youth; contenders sell
  // picks/youth for established starters. Two contending teams rarely swap
  // because neither has asymmetric assets to dump. We score both:
  //   1. Positional surplus/shortage match (concrete need overlap)
  //   2. Contender vs rebuilder asymmetry (motivation to deal)
  function idealTradePartners(myRoster, lg) {
    const myRP = getRosterPlayers(myRoster);
    const mine = rosterSurplusShortage(myRP, lg);

    // My own classification (used as the reference point for asymmetry)
    const myStrength = computeRosterStrength(myRoster, lg);
    const myRank = rankInLeague(lg, myRoster.roster_id);
    const myCs = myStrength.rankedPlayers.filter(p => p.ranked.category === 'cornerstone').length;
    const myValueTier = classifyValueTier(myStrength, myRank, lg.total_rosters, myCs);
    const myArchetype = classifyValueArchetype(myRP);
    const myStance = stanceOf(myValueTier.tier, myArchetype.tag);

    const partners = [];
    for (const other of lg.rosters) {
      if (other.roster_id === myRoster.roster_id) continue;
      const theirRP = getRosterPlayers(other);
      const theirs = rosterSurplusShortage(theirRP, lg);

      // Their classification
      const theirStrength = computeRosterStrength(other, lg);
      const theirRank = rankInLeague(lg, other.roster_id);
      const theirCs = theirStrength.rankedPlayers.filter(p => p.ranked.category === 'cornerstone').length;
      const theirValueTier = classifyValueTier(theirStrength, theirRank, lg.total_rosters, theirCs);
      const theirArchetype = classifyValueArchetype(theirRP);
      const theirStance = stanceOf(theirValueTier.tier, theirArchetype.tag);

      let fit = 0;
      const notes = [];

      // 1) Positional surplus/shortage match
      for (const pos of ['QB','RB','WR','TE']) {
        if (theirs[pos].surplus >= 1 && mine[pos].surplus <= -1) {
          const matched = Math.min(theirs[pos].surplus, -mine[pos].surplus);
          fit += matched * 3;
          notes.push(`Their ${pos} surplus (+${theirs[pos].surplus}) covers my need (${mine[pos].startables} of ${mine[pos].need} startable)`);
        }
        if (mine[pos].surplus >= 1 && theirs[pos].surplus <= -1) {
          const matched = Math.min(mine[pos].surplus, -theirs[pos].surplus);
          fit += matched * 3;
          notes.push(`My ${pos} surplus covers their need at ${pos}`);
        }
      }

      // 2) Outlook asymmetry. Worse teams (rebuilders) are more likely to deal
      // stars for picks/youth; contenders the inverse. Reloaders sit between.
      if (myStance === 'contend' && theirStance === 'rebuild') {
        fit += 4;
        notes.push(`They're rebuilding, more likely to deal stars for picks/youth`);
      } else if (myStance === 'rebuild' && theirStance === 'contend') {
        fit += 4;
        notes.push(`They're contending, more likely to deal picks/youth for stars`);
      } else if ((myStance === 'reload' && theirStance === 'rebuild') ||
                 (myStance === 'rebuild' && theirStance === 'reload')) {
        fit += 2;
        notes.push(theirStance === 'rebuild'
          ? `They're rebuilding, possible source of underpriced stars`
          : `They have mid-tier surplus to swap into your rebuild`);
      } else if ((myStance === 'reload' && theirStance === 'contend') ||
                 (myStance === 'contend' && theirStance === 'reload')) {
        fit += 2;
        notes.push(theirStance === 'contend'
          ? `They're chasing, open to overpaying for win-now help`
          : `They have win-now reach, possible source of mid-tier value`);
      } else if (myStance === 'contend' && theirStance === 'contend') {
        fit -= 1;
        notes.push(`Both contending; harder to find asymmetric trades`);
      } else if (myStance === 'rebuild' && theirStance === 'rebuild') {
        fit -= 1;
        notes.push(`Both rebuilding; neither side wants to give up youth`);
      }
      // Age-trend asymmetry as a secondary signal
      if (myArchetype.tag === 'WIN-NOW' && theirArchetype.tag === 'FUTURE VALUE') {
        fit += 2;
        notes.push(`Their roster trends young, open to win-now help`);
      } else if (myArchetype.tag === 'FUTURE VALUE' && theirArchetype.tag === 'WIN-NOW') {
        fit += 2;
        notes.push(`Their roster trends old, open to selling for futures`);
      }

      partners.push({
        roster: other,
        fit: Math.round(fit*10)/10,
        notes,
        theirs, mine,
        theirValueTier, theirArchetype, theirStance,
        myStance,
      });
    }
    partners.sort((a,b) => b.fit - a.fit);
    return partners.slice(0, 6);
  }

  // Reduce value tier + archetype to one of: contend / rebuild / reload
  function stanceOf(tier, arch) {
    if (['CHAMPIONSHIP','ELITE'].includes(tier)) return 'contend';
    if (tier === 'REBUILD') return 'rebuild';
    if (tier === 'CONTENDING' && arch === 'WIN-NOW') return 'contend';
    if (tier === 'CONTENDING' && arch === 'FUTURE VALUE') return 'reload';
    if (tier === 'RELOAD') return 'reload';
    return 'reload';
  }

  function tradeStrategy(myRosterPlayers, lg) {
    const idx = rankIndex();
    const surplus = rosterSurplusShortage(myRosterPlayers, lg);
    const myIds = new Set(myRosterPlayers.map(p => p.pid));
    const myNames = new Set(myRosterPlayers.map(p => norm(p.sleeper.name)));
    const isOwnedByMe = (p) => (p._sleeperId && myIds.has(p._sleeperId)) || myNames.has(norm(p.name));
    // Format-aware candidate filter: IDP players belong only in IDP scenarios.
    // Trading Ja'Marr Chase for two LBs is almost never the answer outside an
    // explicit IDP-for-IDP swap.
    const idpPositions = new Set(['LB','DB','DL','CB','S','DT','DE','NT']);
    const isCandidateAllowed = (giveItem, candidate) => {
      const candIsIDP = idpPositions.has(candidate.pos);
      const giveIsIDP = giveItem && idpPositions.has(giveItem.pos);
      // Allow IDP candidate only if league is IDP AND the give-side is IDP-related.
      // Otherwise restrict to offensive skill positions.
      if (candIsIDP) return lg.is_idp && giveIsIDP;
      return true;
    };

    // Synthesize draft-pick assets so downtier scenarios can offer picks
    // (a star vet for a starter + a future 1st is the canonical rebuild move).
    // Values come from KTC's published pick valuations via pickIndex(), with
    // strategy.js as a fallback only if KTC didn't ship a value for that
    // bucket. This keeps trade scenarios in sync with the market.
    const nextYear = String(new Date().getFullYear() + 1);
    const pIdx = pickIndex();
    const ktcPickMap = lg.is_superflex ? pIdx.sf : pIdx.oneqb;
    const sPickValues = (window.STRATEGY && window.STRATEGY.pick_values_1qb) || {};
    const sfBumps     = (window.STRATEGY && window.STRATEGY.pick_sf_premium) || {};
    const pickBuckets = [
      ['future_1.early', 'early', 1, `${nextYear} Early 1st`],
      ['future_1.mid',   'mid',   1, `${nextYear} Mid 1st`],
      ['future_1.late',  'late',  1, `${nextYear} Late 1st`],
      ['future_2.early', 'early', 2, `${nextYear} Early 2nd`],
      ['future_2.mid',   'mid',   2, `${nextYear} Mid 2nd`],
      ['future_2.late',  'late',  2, `${nextYear} Late 2nd`],
    ];
    const pickAssets = pickBuckets.map(([sKey, slot, round, label]) => {
      const ktcHit = ktcPickMap.get(`${nextYear}|${slot}|${round}`);
      let ktcVal;
      if (ktcHit && ktcHit.ktcValue) {
        ktcVal = ktcHit.ktcValue;
      } else {
        let v = sPickValues[sKey] || 5;
        if (lg.is_superflex) v += (sfBumps[sKey.replace('future_','') ] || 0);
        ktcVal = Math.round(v * 100);
      }
      return {
        name: label, pos: 'PICK', team: nextYear, age: null,
        category: 'pick', tier: '-', ktcValue: ktcVal,
        ktcAdp: null, _isPick: true,
      };
    });

    // Augmented candidate pool, players + picks.
    const allWithPicks = idx.all.concat(pickAssets);

    // Strongest = biggest surplus, Weakest = biggest shortage
    const sorted = Object.entries(surplus).sort((a,b) => b[1].surplus - a[1].surplus);
    const strongPos = sorted[0][0];                   // most surplus
    const weakPos   = sorted[sorted.length - 1][0];   // most shortage

    // PIVOT: trade from surplus position to fill shortage position.
    const pivot = [];
    const mySurplusGuys = (surplus[strongPos].startablePlayers || [])
      .map(rp => ({ ...rp, _val: tierValue(rp.ranked, lg) }))
      .sort((a,b) => a._val - b._val);   // trade the LOWEST of my startable surplus first
    const fillTargets = idx.all.filter(c =>
      c.pos === weakPos && !isOwnedByMe(c) && isStartable(c, lg)
      && isCandidateAllowed({ pos: strongPos }, c)
    );
    if (surplus[strongPos].surplus >= 1 && surplus[weakPos].surplus <= -1) {
      for (const sg of mySurplusGuys.slice(0, 3)) {
        const sgVal = sg._val;
        const fits = fillTargets.filter(t => {
          const tv = tierValue(t, lg);
          return tv >= sgVal * 0.85 && tv <= sgVal * 1.20;
        });
        if (fits.length) pivot.push({ give: [sg.ranked], options: fits.slice(0,3).map(t => ({ get:[t] })) });
      }
    }

    // DOWNTIER: only suggested when I'm in win-now territory or sitting on
    // surplus stars. Take ONE surplus startable star, get two starters back.
    const downtier = [];
    for (const [pos, info] of Object.entries(surplus)) {
      if (info.surplus < 1) continue;
      const stars = info.startablePlayers
        .map(rp => ({ rp, val: tierValue(rp.ranked, lg) }))
        .sort((a,b) => b.val - a.val)
        .slice(0, 1);
      for (const { rp, val } of stars) {
        // Find 2-player packages around 0.45-0.65x of star's value, prioritizing
        // the user's shortage positions.
        const shortagePositions = Object.keys(surplus).filter(p => surplus[p].surplus < 0);
        const players = idx.all.filter(c =>
          !isOwnedByMe(c)
          && c.pos !== rp.ranked.pos
          && (shortagePositions.length === 0 || shortagePositions.includes(c.pos))
          && isCandidateAllowed(rp.ranked, c)
          && tierValue(c, lg) > val * 0.25 && tierValue(c, lg) < val * 0.75
        ).slice(0, 16);
        // Picks are kept separate so they don't get crowded out by player slice.
        const picks = pickAssets.slice().sort((a,b) => tierValue(b,lg) - tierValue(a,lg));
        const options = [];
        // Prefer "starter + future pick" packages (canonical rebuild move).
        for (const pk of picks) {
          if (options.length >= 2) break;
          const remainder = val - tierValue(pk, lg);
          const pl = players.find(p =>
            tierValue(p, lg) >= remainder * 0.75 &&
            tierValue(p, lg) <= remainder * 1.25 &&
            !options.some(o => o.get.includes(p))
          );
          if (pl) options.push({ get: [pl, pk] });
        }
        // Fill remaining slots with player + player packages.
        const usedPlayers = new Set(options.flatMap(o => o.get));
        const remainingPlayers = players.filter(p => !usedPlayers.has(p));
        for (let i = 0; i + 1 < remainingPlayers.length && options.length < 3; i += 2) {
          options.push({ get: [remainingPlayers[i], remainingPlayers[i+1]] });
        }
        if (options.length) downtier.push({ give: [rp.ranked], options });
      }
    }

    // UPTIER: combine a quality startable + a depth piece from a surplus
    // position, to acquire a cornerstone-tier player at any position I want.
    // Never give up so many startables at one position that we drop below the
    // starter requirement (e.g. trading both QBs in a superflex).
    const uptier = [];
    const surplusForUptier = Object.entries(surplus).filter(([_, info]) => info.surplus >= 1);
    const cornerstoneTargets = idx.all.filter(c =>
      c.category === 'cornerstone' && !isOwnedByMe(c) && isStartable(c, lg)
      && !idpPositions.has(c.pos)  // uptier targets are always offensive cornerstones
    );
    // Build a depth-piece pool: my own ranked but NON-startable players,
    // preferring those at positions where I have surplus (safe to move).
    const myDepthPieces = myRosterPlayers
      .filter(p => p.ranked && !isStartable(p.ranked, lg) && !idpPositions.has(p.ranked.pos))
      .map(p => ({ ranked: p.ranked, val: tierValue(p.ranked, lg), pos: p.ranked.pos }))
      .sort((a, b) => b.val - a.val);
    for (const [pos, info] of surplusForUptier) {
      const sortedStartable = info.startablePlayers
        .map(rp => ({ rp, val: tierValue(rp.ranked, lg) }))
        .sort((a, b) => b.val - a.val);
      if (!sortedStartable.length) continue;
      // Quality startable = my BEST surplus startable at this position. Giving
      // it away still leaves me at-or-above the starter requirement because
      // info.surplus >= 1.
      const quality = sortedStartable[0];
      // Depth piece: prefer a non-startable depth player from a surplus
      // position; never another player from `pos` unless surplus there is >= 2.
      const depthCandidates = myDepthPieces.filter(d =>
        d.ranked !== quality.rp.ranked &&
        (d.pos !== pos || (surplus[d.pos] && surplus[d.pos].surplus >= 2)) &&
        (surplus[d.pos] && surplus[d.pos].surplus >= 1)
      );
      const depth = depthCandidates[0];
      if (!depth) continue;
      const giveVal = quality.val + depth.val;
      const fits = cornerstoneTargets.filter(t => {
        const tv = tierValue(t, lg);
        return tv <= giveVal * 1.10 && tv >= giveVal * 0.75;
      }).slice(0, 3);
      if (fits.length) uptier.push({ give: [quality.rp.ranked, depth.ranked], options: fits.map(t => ({ get: [t] })) });
    }

    return { downtier, uptier, pivot, weakPos, strongPos, surplus };
  }

  function tradeScenarioCard(title, scenarios, color, lg) {
    if (!scenarios.length) return h('div', { class:'card' },
      h('div', { class:'card-title' }, h('span', { style:{ color } }, title)),
      h('div', { class:'tip' }, 'No scenarios, roster is balanced for this tier.')
    );
    const card = h('div', { class:'card' },
      h('div', { class:'card-title' }, h('span', { style:{ color } }, title))
    );
    const playerLine = (p) => h('div', {
      class:'trade-player',
      title: `${p.name} (${p.pos}, ${p.team || 'FA'})`,
      onclick:()=>openPlayerDetail(p.name, p._sleeperId),
    },
      h('span', { class:'trade-poschip', 'data-pos': p.pos }, p.pos),
      h('span', { class:'trade-name' }, p.name),
      h('span', { class:'trade-team' }, p.team || 'FA'),
    );
    for (const sc of scenarios.slice(0, 3)) {
      const giveVal = sc.give.reduce((s,p)=> s + tierValue(p, lg), 0);
      const ranked = sc.options.map(o => {
        const getVal = o.get.reduce((s,p)=> s + tierValue(p, lg), 0);
        const fairness = giveVal > 0 ? Math.round((getVal / giveVal) * 100) : 0;
        // Realism score: closest to 105% (a slight win) is best. Trades >125%
        // are unrealistic (no one gives that much away), trades <90% are bad.
        const realism = -Math.abs(fairness - 105);
        return { o, getVal, fairness, realism };
      }).sort((a,b) => b.realism - a.realism).slice(0, 3);

      const giveBlock = h('div', { class:'trade-give' },
        h('div', { class:'trade-give-head' },
          h('span', { class:'trade-give-label' }, 'You give'),
          h('span', { class:'trade-give-val' }, `${Math.round(giveVal)} pts`),
        ),
        ...sc.give.map(playerLine),
      );

      const optsList = h('div', { class:'trade-opts' });
      ranked.forEach((r, idx) => {
        const fairColor = r.fairness >= 95 ? 'var(--green)' : r.fairness >= 85 ? 'var(--amber)' : 'var(--red)';
        const opt = h('div', { class: 'trade-opt' + (idx === 0 ? ' best' : '') },
          h('div', { class:'trade-opt-head' },
            idx === 0
              ? h('span', { class:'trade-best-badge' }, 'BEST FIT')
              : h('span', { class:'trade-opt-rank' }, `#${idx+1}`),
            h('span', { class:'trade-fairness', style:{ color: fairColor } }, `${r.fairness}%`),
            h('span', { class:'trade-getval' }, `${Math.round(r.getVal)} pts`),
          ),
          ...r.o.get.map(playerLine),
        );
        optsList.appendChild(opt);
      });

      card.appendChild(h('div', { class:'trade-scenario' }, giveBlock, optsList));
    }
    return card;
  }

  function draftCapitalCard(dcSummary, rosterId, lg) {
    const card = h('div', { class:'card' },
      h('div', { class:'card-title' }, 'Future Draft Picks')
    );
    const years = Object.keys(dcSummary.years).sort();
    if (!years.length) {
      card.appendChild(h('div', { class:'tip' }, 'No tradable future picks visible. The current rookie draft has likely already completed.'));
      return card;
    }
    for (const yr of years) {
      const y = dcSummary.years[yr];
      // Sort default picks ascending so they read R1 to RN in order
      const defaultRounds = y.default.slice().sort((a, b) => a - b);
      const chipText = (round, originRosterId) =>
        draftPickLabel(yr, round, originRosterId, lg).replace(`${yr} `, '');
      const row = h('div', { class:'dc-row' },
        h('div', { class:'dc-year' },
          yr,
          y.in_progress ? h('div', { class:'tip', style:{ fontSize:'.7rem', color:'var(--amber)' } }, 'DRAFTING') : null,
        ),
        h('div', { class:'dc-picks' },
          ...defaultRounds.map(rd => h('span', { class:'pick-chip', title: y.in_progress
            ? `Your default R${rd} pick (current draft is in progress; the slot may already be used live)`
            : `Your ${draftPickLabel(yr, rd, rosterId, lg)}` }, chipText(rd, rosterId))),
          ...y.mine.map(p => h('span', { class:'pick-chip acquired', title:`Acquired ${draftPickLabel(yr, p.round, p.from, lg, true)}` }, `${chipText(p.round, p.from)}+`)),
          ...y.lost.map(p => h('span', { class:'pick-chip lost', title:`Traded away ${draftPickLabel(yr, p.round, rosterId, lg)} to roster ${p.to}` }, `${chipText(p.round, rosterId)}×`)),
        ),
      );
      card.appendChild(row);
    }
    card.appendChild(h('div', { class:'tip', style:{ marginTop:'8px' } },
      h('span', { class:'pick-chip' }, '#'), ' default. ',
      h('span', { class:'pick-chip acquired' }, '#+'), ' acquired. ',
      h('span', { class:'pick-chip lost' }, '#×'), ' traded away.'
    ));
    return card;
  }

  // ============================================================
  // ROUTE: Sources
  // ============================================================
  // ============================================================
  // FantasyPros expert rotation
  // ============================================================
  // Data comes from projections/build_fantasypros_experts.py. Each position uses
  // one player grid plus one aligned rank array per expert. Rotation choices live
  // with the rest of site settings and become columns in each league's Weekly view.

  const FP_POS = ['QB', 'RB', 'WR', 'TE'];

  function fpData() { return window.FP_EXPERTS || null; }

  function fpExpertById() {
    const d = fpData();
    if (!d) return new Map();
    if (!fpExpertById._m) fpExpertById._m = new Map(d.experts.map(e => [String(e.id), e]));
    return fpExpertById._m;
  }

  function fpDefaultRotationIds() {
    const current = (window.WEEKLY_RANKINGS?.trackedExperts || [])
      .filter(expert => expert.players > 0)
      .map(expert => String(expert.id));
    return current.length ? current : ['1576', '7666', '747', '3468'];
  }

  function fpRotationIds() {
    const saved = state.settings.weeklyExpertIds;
    const ids = Array.isArray(saved) ? saved.map(String) : fpDefaultRotationIds();
    const known = fpExpertById();
    return [...new Set(ids)].filter(id => known.has(id));
  }

  function fpSetRotation(eid, enabled) {
    const ids = new Set(fpRotationIds());
    if (enabled) ids.add(String(eid));
    else ids.delete(String(eid));
    state.settings.weeklyExpertIds = [...ids];
    saveSettings();
  }

  function fpRotationExperts(weeklyData = window.WEEKLY_RANKINGS || {}) {
    const data = fpData();
    if (!data || Number(data.season) !== Number(weeklyData.season)
        || Number(data.week) !== Number(weeklyData.currentWeek)) return [];
    const byId = fpExpertById();
    return fpRotationIds().map(id => byId.get(id)).filter(Boolean);
  }

  function fpWeeklyRank(eid, pos, pid) {
    const data = fpData();
    const board = data?.boards?.[String(pos || '').toUpperCase()];
    const ranks = board?.ranks?.[String(eid)];
    if (!board || !ranks || pid == null) return null;
    const cacheKey = `${eid}:${String(pos || '').toUpperCase()}`;
    if (!fpWeeklyRank._maps) fpWeeklyRank._maps = new Map();
    if (!fpWeeklyRank._maps.has(cacheKey)) {
      const map = new Map();
      board.sleeperIds.forEach((id, index) => {
        if (id != null && ranks[index] != null) map.set(String(id), ranks[index]);
      });
      fpWeeklyRank._maps.set(cacheKey, map);
    }
    return fpWeeklyRank._maps.get(cacheKey).get(String(pid)) ?? null;
  }

  // Mean absolute distance from consensus over the players he actually ranks.
  // A mean and not a sum on purpose: a 200-deep board wins any total by length.
  function fpContrarian(eid) {
    const d = fpData();
    if (!d) return null;
    let sum = 0, n = 0;
    for (const pos of FP_POS) {
      const b = d.boards[pos];
      const col = b && b.ranks[String(eid)];
      if (!col) continue;
      for (let i = 0; i < col.length; i++) {
        if (col[i] == null) continue;
        sum += Math.abs(col[i] - b.ecr[i]);
        n++;
      }
    }
    return n ? { spread: sum / n, n } : null;
  }

  function viewExperts(arg) {
    const main = $('#main');
    main.innerHTML = '';
    const d = fpData();
    if (!d) {
      main.appendChild(pageHeader({ eyebrow: 'REFERENCE', title: 'Experts' }));
      main.appendChild(h('div', { class: 'empty' },
        'No expert data yet. Run python projections/build_fantasypros_experts.py.'));
      return;
    }
    main.appendChild(pageHeader({
      eyebrow: 'REFERENCE',
      title: 'Expert Rotation',
      badge: String(d.experts.length),
      sub: `Browse every FantasyPros board for ${d.season} week ${d.week}, PPR. Add analysts `
         + `to your rotation and their ranks appear as separate columns in Weekly Rankings.`,
    }));

    // FantasyPros does not publish the week's boards all at once. On a Monday
    // ten analysts have filed and by Thursday it is about a hundred and
    // seventy, so a small number here is the week being young, not the feed
    // being broken. Saying so is the difference between a caveat and a bug
    // report: week 3 opened with 10 boards where week 2 had closed with 175.
    if (d.experts.length < 40) {
      main.appendChild(h('p', { class: 'tip faab-note' },
        `${d.experts.length} analyst${d.experts.length === 1 ? ' has' : 's have'} filed a `
        + `week ${d.week} board so far. Most file Wednesday and Thursday, and a full `
        + `week runs to roughly 170, so this list grows as the week does.`));
    }

    if (arg && fpExpertById().has(String(arg))) return fpExpertPage(main, String(arg));

    main.appendChild(fpExpertTable());
  }

  // ---- the list -----------------------------------------------------------
  function fpExpertTable() {
    const d = fpData();
    const rows = d.experts.map(e => {
      const c = fpContrarian(e.id);
      const row = { id: e.id, name: e.name, site: e.site || '', total: e.total,
                    spread: c ? c.spread : null };
      for (const p of FP_POS) row[p] = e.depth[p] || null;
      return row;
    });
    let sortKey = 'rotation', desc = true;
    const body = h('tbody');
    const rotationScope = h('span', { class: 'faab-scope' });
    const draw = () => {
      body.innerHTML = '';
      const selected = new Set(fpRotationIds());
      rotationScope.textContent = `${selected.size} in weekly rotation`;
      const sorted = rows.slice().sort((a, b) => {
        const av = sortKey === 'rotation' ? Number(selected.has(String(a.id))) : a[sortKey];
        const bv = sortKey === 'rotation' ? Number(selected.has(String(b.id))) : b[sortKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === 'string') return desc ? bv.localeCompare(av) : av.localeCompare(bv);
        return (desc ? bv - av : av - bv) || a.name.localeCompare(b.name);
      });
      for (const e of sorted) {
        const on = selected.has(String(e.id));
        body.appendChild(h('tr', { class: on ? 'you' : '' },
          h('td', null, h('button', {
            type: 'button', 'aria-pressed': String(on), dataset: { expertId: String(e.id) },
            onclick: () => { fpSetRotation(e.id, !on); draw(); },
          }, on ? 'Added' : 'Add')),
          h('td', { class: 'sr-name' }, h('a', { href: `#experts/${e.id}` }, e.name)),
          h('td', null, h('span', { class: 'tip' }, e.site || '·')),
          ...FP_POS.map(p => h('td', { class: 'sr-num tnum' },
            e[p] ? String(e[p]) : h('span', { class: 'tip' }, '·'))),
          h('td', { class: 'sr-num tnum' }, String(e.total)),
          h('td', { class: 'sr-num tnum' }, e.spread != null ? fmt.decimal(e.spread, 1) : '·')));
      }
      for (const th of body.parentNode.querySelectorAll('th')) {
        th.classList.toggle('sorted', th.dataset.key === sortKey);
      }
    };
    const hdr = (key, label, opts) => h('th', {
      dataset: { key },
      class: (opts && opts.right) ? 'right' : '',
      title: (opts && opts.title) || '',
      style: { cursor: 'pointer' },
      onclick: () => {
        if (sortKey === key) desc = !desc;
        else { sortKey = key; desc = !(opts && opts.asc); }
        draw();
      },
    }, label);
    return h('div', { class: 'card' },
      h('div', { class: 'card-title' }, 'Available FantasyPros experts', rotationScope),
      h('p', { class: 'tip faab-note' },
        'Added experts become sortable columns in every league\'s Weekly Rankings. Depth is how many players each expert ranks.'),
      h('table', { class: 'data slot-table' },
        h('thead', null, h('tr', null,
          hdr('rotation', 'Rotation'),
          hdr('name', 'Expert', { asc: true }),
          h('th', null, 'Outlet'),
          ...FP_POS.map(p => hdr(p, p, { right: true, title: `How many ${p}s he ranks` })),
          hdr('total', 'Ranked', { right: true }),
          hdr('spread', 'Spread', { right: true,
            title: 'Mean distance from consensus across every player he ranks. Higher = more contrarian.' }))),
        body),
      (draw(), null));
  }

  // ---- one expert ---------------------------------------------------------
  function fpExpertPage(main, eid) {
    const d = fpData();
    const e = fpExpertById().get(eid);
    const c = fpContrarian(eid);
    let rotationOn = fpRotationIds().includes(String(eid));
    const rotationButton = h('button', {
      type: 'button', 'aria-pressed': String(rotationOn), dataset: { expertId: String(eid) },
      style: { marginLeft: 'auto' },
      onclick: () => {
        rotationOn = !rotationOn;
        fpSetRotation(eid, rotationOn);
        rotationButton.setAttribute('aria-pressed', String(rotationOn));
        rotationButton.textContent = rotationOn ? 'Added to rotation' : 'Add to rotation';
      },
    }, rotationOn ? 'Added to rotation' : 'Add to rotation');
    main.appendChild(h('p', { class: 'tip' }, h('a', { href: '#experts' }, '← All experts')));

    const head = h('div', { class: 'card' },
      h('div', { class: 'card-title' }, e.name,
        h('span', { class: 'faab-scope' }, e.site || 'independent'), rotationButton),
      h('div', { class: 'faab-kpis' },
        h('div', { class: 'faab-kpi' },
          h('div', { class: 'faab-kpi-num tnum' }, String(e.total)),
          h('div', { class: 'faab-kpi-lab' }, 'players ranked'),
          h('div', { class: 'faab-kpi-sub' },
            FP_POS.map(p => `${p} ${e.depth[p] || 0}`).join(' · '))),
        c ? h('div', { class: 'faab-kpi' },
          h('div', { class: 'faab-kpi-num tnum' }, fmt.decimal(c.spread, 1)),
          h('div', { class: 'faab-kpi-lab' }, 'mean gap to consensus'),
          h('div', { class: 'faab-kpi-sub' }, `over ${c.n} ranked players`)) : null));
    if (e.siteLink) {
      head.appendChild(h('p', { class: 'tip faab-note' },
        h('a', { href: e.siteLink, target: '_blank', rel: 'noopener' }, e.siteLink)));
    }
    main.appendChild(head);

    const gaps = [];
    for (const pos of FP_POS) {
      const b = d.boards[pos];
      const col = b && b.ranks[eid];
      if (!col) continue;
      for (let i = 0; i < col.length; i++) {
        if (col[i] == null) continue;
        gaps.push({ pos, name: b.players[i], team: b.teams[i], pid: b.sleeperIds[i],
                    rank: col[i], ecr: b.ecr[i], delta: b.ecr[i] - col[i] });
      }
    }
    const table = (title, note, list) => {
      if (!list.length) return null;
      return h('div', { class: 'card' },
        h('div', { class: 'card-title' }, title, h('span', { class: 'faab-scope' }, note)),
        h('table', { class: 'data slot-table' },
          h('thead', null, h('tr', null,
            h('th', null, 'Player'), h('th', null, 'Pos'),
            h('th', { class: 'right', title: 'His rank at the position' }, 'Him'),
            h('th', { class: 'right', title: 'Expert consensus rank at the position' }, 'ECR'),
            h('th', { class: 'right', title: 'Positive = he is higher on the player than the room' }, 'Gap'))),
          h('tbody', null, ...list.map(g => h('tr', {
            class: 'clickable', onclick: () => openPlayerDetail(g.name, g.pid),
          },
            h('td', { class: 'sr-name' }, g.name,
              g.team ? h('span', { class: 'muted' }, ` · ${g.team}`) : null),
            h('td', { class: 'sr-pos' }, posChip(g.pos)),
            h('td', { class: 'sr-num tnum' }, `${g.pos}${g.rank}`),
            h('td', { class: 'sr-num tnum' }, `${g.pos}${g.ecr}`),
            h('td', { class: 'sr-num sr-vor tnum' + (g.delta < 0 ? ' neg' : '') },
              `${g.delta > 0 ? '+' : ''}${g.delta}`))))));
    };
    main.appendChild(table('Where he breaks from the room',
      'his twelve widest gaps, either direction',
      gaps.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 12)));
    main.appendChild(table('Highest on', 'he likes these more than the room does',
      gaps.filter(g => g.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 10)));
    main.appendChild(table('Lowest on', 'he is out on these',
      gaps.filter(g => g.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 10)));
  }

  // ---- one player, every board -------------------------------------------
  function fpPlayerLookup() {
    const d = fpData();
    const host = h('div');
    let pos = 'WR', idx = 0, omitIdx = -1, minDepth = 0;

    const nameSelect = h('select', { 'aria-label': 'Player' });
    const omitSelect = h('select', { 'aria-label': 'Only boards that omit' });
    const posSelect = h('select', { 'aria-label': 'Position' },
      ...FP_POS.map(p => h('option', { value: p, selected: p === pos }, p)));
    const depthSelect = h('select', { 'aria-label': 'Minimum board depth' },
      h('option', { value: '0' }, 'any board depth'),
      h('option', { value: '70' }, 'boards 70+ deep'),
      h('option', { value: '100' }, 'boards 100+ deep'));

    function fillNames() {
      const b = d.boards[pos];
      nameSelect.innerHTML = '';
      omitSelect.innerHTML = '';
      omitSelect.appendChild(h('option', { value: '-1' }, 'no omission filter'));
      b.players.forEach((n, i) => {
        nameSelect.appendChild(h('option', { value: String(i) }, `${pos}${b.ecr[i]}  ${n}`));
        omitSelect.appendChild(h('option', { value: String(i) }, `boards with no ${n}`));
      });
      idx = 0; omitIdx = -1;
      nameSelect.value = '0';
      omitSelect.value = '-1';
    }
    posSelect.onchange = (ev) => { pos = ev.target.value; fillNames(); draw(); };
    nameSelect.onchange = (ev) => { idx = Number(ev.target.value); draw(); };
    omitSelect.onchange = (ev) => { omitIdx = Number(ev.target.value); draw(); };
    depthSelect.onchange = (ev) => { minDepth = Number(ev.target.value); draw(); };

    function draw() {
      host.innerHTML = '';
      const b = d.boards[pos];
      const all = fpPlayerSpread(pos, idx, { minDepth });
      const kept = fpPlayerSpread(pos, idx, { omitting: omitIdx, minDepth });
      if (!all.length) {
        host.appendChild(h('p', { class: 'tip' }, 'No board at this depth ranks him.'));
        return;
      }
      const ranks = kept.map(r => r.rank);
      const med = fpMedian(ranks), medAll = fpMedian(all.map(r => r.rank));
      host.appendChild(h('div', { class: 'faab-kpis' },
        h('div', { class: 'faab-kpi' },
          h('div', { class: 'faab-kpi-num tnum' },
            med != null ? `${pos}${fmt.decimal(med, 0)}` : '·'),
          h('div', { class: 'faab-kpi-lab' },
            omitIdx >= 0 ? 'median, filtered boards' : 'median of every board'),
          h('div', { class: 'faab-kpi-sub' }, ranks.length
            ? `${ranks.length} boards, ${pos}${Math.min(...ranks)} to ${pos}${Math.max(...ranks)}`
            : 'no board matches the filter')),
        h('div', { class: 'faab-kpi' },
          h('div', { class: 'faab-kpi-num tnum' }, `${pos}${b.ecr[idx]}`),
          h('div', { class: 'faab-kpi-lab' }, 'consensus'),
          h('div', { class: 'faab-kpi-sub' }, `${all.length} boards rank him`)),
        (omitIdx >= 0 && med != null && medAll != null) ? h('div', { class: 'faab-kpi' },
          h('div', { class: 'faab-kpi-num tnum' },
            `${medAll - med > 0 ? '+' : ''}${fmt.decimal(medAll - med, 1)}`),
          h('div', { class: 'faab-kpi-lab' }, 'spots the filter moves him'),
          h('div', { class: 'faab-kpi-sub' },
            `against ${pos}${fmt.decimal(medAll, 0)} on every board`)) : null));

      if (omitIdx >= 0) {
        host.appendChild(h('p', { class: 'tip faab-note' },
          `Only boards that do not rank ${b.players[omitIdx]} anywhere. An omission is a `
          + `judgement on a deep board and just a cutoff on a shallow one, so raise the `
          + `depth floor before reading much into it.`));
      }
      appendTable(host, h('table', { class: 'data slot-table' },
        h('thead', null, h('tr', null,
          h('th', null, 'Expert'), h('th', null, 'Outlet'),
          h('th', { class: 'right' }, 'Rank'),
          h('th', { class: 'right', title: 'Positive = higher than consensus' }, 'vs ECR'),
          h('th', { class: 'right', title: 'How many players he ranks at this position' }, 'Depth'))),
        h('tbody', null, ...kept.map(r => h('tr', {
          class: 'clickable', onclick: () => navigate(`#experts/${r.eid}`),
        },
          h('td', { class: 'sr-name' }, (r.expert && r.expert.name) || `Expert ${r.eid}`),
          h('td', null, h('span', { class: 'tip' }, (r.expert && r.expert.site) || '·')),
          h('td', { class: 'sr-num tnum' }, `${pos}${r.rank}`),
          h('td', { class: 'sr-num sr-vor tnum' + (b.ecr[idx] - r.rank < 0 ? ' neg' : '') },
            `${b.ecr[idx] - r.rank > 0 ? '+' : ''}${b.ecr[idx] - r.rank}`),
          h('td', { class: 'sr-num tnum' }, String(r.depth)))))));
    }

    const card = h('div', { class: 'card' },
      h('div', { class: 'card-title' }, 'One player, every board',
        h('span', { class: 'faab-scope' }, 'the spread a consensus rank hides')),
      h('div', { class: 'fp-controls' }, posSelect, nameSelect, omitSelect, depthSelect),
      host);
    fillNames();
    draw();
    return card;
  }

  // ============================================================
  // Kicker model: two boards, because they answer different questions
  // ============================================================
  // Built by the Kicker-Analysis repo and shipped as data/kickers.js. TWO models,
  // each doing the job it measurably wins on an 8-fold season-forward backtest:
  //
  //   ordering      a ridge on 16 pre-kickoff features. Gains 0.434 points a week
  //                 over starting a random one of two kickers, against 0.362 for
  //                 ranking on the Vegas implied total alone (+0.072, p = 0.015)
  //                 and 0.161 for a kicker's own career average.
  //   probability   a two-stage count model. Worse at ordering, but its P(15+) is
  //                 calibrated to 0.0838 predicted against 0.0841 realised.
  //
  // The ceiling board is shown because the probability is trustworthy, NOT
  // because it beats the main board. An earlier version of this comment claimed
  // ranking by the mean hits big weeks less often than random; that was true of
  // a different model and is retracted. Measured here: random 8.2%, mean ranking
  // 8.9%, P(15+) ranking 8.9%.
  //
  // Keep the size of the edge in mind. The oracle who always starts the better of
  // two kickers gains 2.44 points a week, and this captures 17.8% of that.

  function kickerBoard() {
    const d = window.KICKER_MODEL;
    if (!d || !(d.kickers || []).length) return null;

    const wrap = h('div');
    let mode = 'exp';   // 'exp' = safe start, 'ceil' = swing

    const card = h('div', { class: 'card' },
      h('div', { class: 'card-title' }, `Week ${d.week} kickers`,
        h('span', { class: 'faab-scope' }, `${d.kickers.length} starters, model-ranked`)));

    const bar = h('div', { class: 'tab-bar', role: 'tablist' });
    const host = h('div');

    const draw = () => {
      host.innerHTML = '';
      const rows = d.kickers.slice().sort((a, b) => mode === 'exp'
        ? b.exp - a.exp
        : b.pGe15 - a.pGe15);
      host.appendChild(h('p', { class: 'tip faab-note' }, mode === 'exp'
        ? 'Ridge on 16 pre-kickoff features. The default board, and the one with '
          + 'the measured edge over ranking by the betting line alone.'
        : 'Highest calibrated chance of 15 or more. Not a better board, a '
          + 'different question: it says how likely the big week is rather than '
          + 'how big the average week is.'));
      const body = h('tbody', null, ...rows.map((k, i) => {
        // The gap between the two ranks is the shape of the player: positive
        // means the mean likes him more than the ceiling does, so he is a floor.
        const gap = k.rankCeiling - k.rankPoints;
        const shape = gap >= 4 ? 'floor' : gap <= -4 ? 'swing' : null;
        return h('tr', { class: 'clickable', onclick: () => openPlayerDetail(k.name, k.id) },
          h('td', { class: 'sr-slot' }, String(i + 1)),
          h('td', { class: 'sr-name' }, k.name,
            shape ? h('span', { class: `badge ${shape === 'floor' ? 'ok' : 'warn'}` },
              shape === 'floor' ? 'FLOOR' : 'SWING') : null,
            k.staleWeeks > 1 ? h('span', { class: 'badge' }, 'STALE') : null),
          h('td', null, teamChip(k.team)),
          h('td', null, h('span', { class: 'tip' }, `${k.home ? 'vs' : '@'} ${k.opp}`)),
          h('td', { class: 'sr-num tnum', title: 'Vegas implied team total, the single best input' },
            k.impliedTotal != null ? fmt.decimal(k.impliedTotal, 1) : '·'),
          h('td', { class: 'sr-num tnum' }, fmt.decimal(k.exp, 1)),
          h('td', { class: 'sr-num tnum', title: '20th percentile outcome' }, fmt.decimal(k.floor, 0)),
          h('td', { class: 'sr-num tnum', title: '90th percentile outcome' }, fmt.decimal(k.ceil, 0)),
          h('td', { class: 'sr-num tnum', title: 'Modelled chance of 15 or more points' },
            `${Math.round(k.pGe15 * 100)}%`),
          h('td', { class: 'sr-num tnum', title: 'Expected field goal attempts' },
            fmt.decimal(k.expFgAtt, 1)),
          h('td', { class: 'sr-num tnum', title: 'Expected extra point attempts. This is the half of the target the model can actually predict.' },
            fmt.decimal(k.expPatAtt, 1)));
      }));
      appendTable(host, h('table', { class: 'data slot-table' },
        h('thead', null, h('tr', null,
          h('th', null, '#'), h('th', null, 'Kicker'), h('th', null, 'Team'),
          h('th', null, 'Opp'),
          h('th', { class: 'right' }, 'Impl'),
          h('th', { class: 'right' }, 'Exp'),
          h('th', { class: 'right' }, 'Floor'),
          h('th', { class: 'right' }, 'Ceil'),
          h('th', { class: 'right' }, '15+'),
          h('th', { class: 'right' }, 'FGA'),
          h('th', { class: 'right' }, 'XPA'))),
        body));
      for (const b of bar.children) b.classList.toggle('active', b.dataset.mode === mode);
    };

    for (const [key, label] of [['exp', 'Safe start'], ['ceil', 'Ceiling swing']]) {
      bar.appendChild(h('button', { class: 'tab', type: 'button', dataset: { mode: key },
        onclick: () => { mode = key; draw(); } }, h('span', { class: 'tab-label' }, label)));
    }
    card.appendChild(bar);
    card.appendChild(host);
    draw();
    wrap.appendChild(card);

    wrap.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card-title' }, 'How this is built',
        h('span', { class: 'faab-scope' }, 'and what it cannot do')),
      h('p', { class: 'tip', style: { marginTop: 0 } }, d.method, '. ', d.scoring, '.'),
      h('p', { class: 'tip' },
        'The honest limit: weekly field goal attempts have NEGATIVE out-of-sample '
        + 'skill, and they carry essentially all the variance in kicker scoring. '
        + 'Extra point attempts are genuinely predictable. So the model is really '
        + 'forecasting how many touchdowns an offence scores, and the field goals '
        + 'are close to a coin flip. That is why every kicker here sits inside a '
        + 'two point range, and why a confident-looking kicker projection from '
        + 'anywhere else is overselling.'),
      h('p', { class: 'tip' }, d.note),
      h('p', { class: 'tip' },
        'Full method, every number and the two claims that were retracted when the '
        + 'backtest contradicted them: METHOD.md in the Kicker-Analysis repo.')));
    return wrap;
  }

  function viewKickers() {
    const main = $('#main');
    main.innerHTML = '';
    const d = window.KICKER_MODEL;
    main.appendChild(pageHeader({
      eyebrow: 'REFERENCE',
      title: 'Kickers',
      badge: d ? `W${d.week}` : null,
      sub: 'Two boards from one model: the safe start and the ceiling swing. They '
         + 'are different lists on purpose.',
    }));
    const board = kickerBoard();
    main.appendChild(board || h('div', { class: 'empty' },
      'No kicker model yet. Run predict_week.py in the Kicker-Analysis repo.'));
  }

  // ============================================================
  // IDP matchups: which OFFENSES feed defenders
  // ============================================================
  // The mirror of the SOS grid, and the mirror is not symmetric. A defender's
  // week is mostly tackles, and tackles come from the offence he is on the field
  // against: plays run, short completions, sacks taken, turnovers. So a good,
  // fast, run-heavy offence can be a BETTER matchup for a linebacker than a bad
  // pass-happy one, which is backwards from the receiver's view of the same game.
  //
  // Scored in yuH's own currency, read off the league rather than a preset, so
  // the splash-play corner and the tackle machine are priced the way that league
  // actually pays them. Built by projections/build_idp_dvp.py.
  //
  // Only rendered for IDP leagues. Nothing here applies to the other four.

  function idpMatchupBlock(lg) {
    const D = window.IDP_DVP;
    if (!D || !lg || !lg.is_idp) return null;
    const offs = D.offenses || {};
    if (!Object.keys(offs).length) return null;

    // This week's opponent per team, so the board answers "who do I start"
    // rather than "who is generally generous". The schedule lives in sos.js
    // under window.TEAM_SOS (not SOS), keyed by team abbreviation. SOS_GRID is
    // no use here: its `teams` is a flat list of codes and its `grid` is keyed
    // by position, so it carries no per-week opponent at all.
    const wk = D.week;
    const oppOf = new Map();
    for (const [abbr, t] of Object.entries(window.TEAM_SOS?.teams || {})) {
      const g = (t.schedule || []).find(x => Number(x.week) === Number(wk));
      if (g && g.opp) oppOf.set(abbr, g.opp);
    }

    let grp = 'LB';
    const host = h('div');
    const bar = h('div', { class: 'tab-bar', role: 'tablist' });

    const draw = () => {
      host.innerHTML = '';
      const rows = Object.entries(offs)
        .filter(([, g]) => g[grp] && g[grp].ppg != null)
        .map(([off, g]) => ({ off, ...g[grp] }))
        .sort((a, b) => b.ppg - a.ppg);
      const n = rows.length;
      host.appendChild(h('p', { class: 'tip faab-note' },
        `Points a ${grp} scores against each offence, per game, in this league's `
        + `scoring. Rank 1 is the offence you most want your ${grp} facing. `
        + `Prior season pooled with completed ${D.season} games.`));
      appendTable(host, h('table', { class: 'data slot-table' },
        h('thead', null, h('tr', null,
          h('th', null, '#'), h('th', null, 'Offense faced'),
          h('th', { class: 'right', title: `Fantasy points allowed to ${grp} per game` }, 'PPG'),
          h('th', { class: 'right', title: 'Points above or below the median offence' }, 'vs med'),
          h('th', { class: 'right', title: 'Games in the pooled sample' }, 'G'),
          h('th', { class: 'right', title: 'Prior season only' }, 'Prior'),
          h('th', null, `Wk ${wk} defense facing them`))),
        h('tbody', null, ...rows.map((r, i) => {
          // Who plays this offence this week, i.e. whose defenders benefit.
          const facing = [...oppOf.entries()]
            .filter(([, opp]) => opp === r.off).map(([t]) => t);
          const cls = i < Math.ceil(n / 3) ? ' good' : i >= n - Math.ceil(n / 3) ? ' bad' : '';
          return h('tr', null,
            h('td', { class: 'sr-slot' }, String(r.rank ?? i + 1)),
            h('td', null, teamChip(r.off)),
            h('td', { class: 'sr-num tnum' + cls }, fmt.decimal(r.ppg, 1)),
            h('td', { class: 'sr-num sr-vor tnum' + (r.vsMedian < 0 ? ' neg' : '') },
              r.vsMedian != null ? `${r.vsMedian > 0 ? '+' : ''}${fmt.decimal(r.vsMedian, 1)}` : '·'),
            h('td', { class: 'sr-num tnum' }, String(r.games)),
            h('td', { class: 'sr-num tnum' }, r.priorPpg != null ? fmt.decimal(r.priorPpg, 1) : '·'),
            h('td', null, facing.length
              ? facing.map(t => teamChip(t))
              : h('span', { class: 'tip' }, 'bye or not scheduled')));
        }))));
      for (const b of bar.children) b.classList.toggle('active', b.dataset.grp === grp);
    };

    for (const g of (D.groups || ['DL', 'LB', 'DB'])) {
      bar.appendChild(h('button', { class: 'tab', type: 'button', dataset: { grp: g },
        onclick: () => { grp = g; draw(); } }, h('span', { class: 'tab-label' }, g)));
    }

    const card = h('div', { class: 'card' },
      h('div', { class: 'card-title' }, 'IDP matchups',
        h('span', { class: 'faab-scope' }, `${D.league} scoring, week ${wk}`)),
      bar, host);
    draw();

    const wrap = h('div');
    wrap.appendChild(card);
    if ((D.unmappedScoringKeys || []).length) {
      // A scoring rule with no stat behind it scores zero here, and saying so is
      // the difference between a caveat and a quiet error.
      wrap.appendChild(h('p', { class: 'tip faab-note' },
        `${D.unmappedScoringKeys.join(', ')} `
        + `${D.unmappedScoringKeys.length === 1 ? 'is a scoring rule' : 'are scoring rules'} `
        + 'in this league with no matching stat in the source, so they contribute '
        + 'nothing to these numbers. Fumble recoveries are the notable gap.'));
    }
    return wrap;
  }

  function viewSources() {
    const main = $('#main');
    main.innerHTML = '';
    main.appendChild(h('div', { class:'page-header' },
      h('div', null,
        h('div', { class:'page-eyebrow' }, 'REFERENCE'),
        h('h1', { class:'page-title' }, 'Sources'),
        h('p', { class:'page-sub' }, 'Choose which analysts inform your aggregated rankings. Toggle individual videos within each source.')
      )
    ));

    const grid = h('div', { class:'card-grid cols-2' });
    for (const src of getAllSources()) {
      grid.appendChild(renderSourceCard(src));
    }
    main.appendChild(grid);

    // Expert ranking columns - the per-analyst rank columns shown next to players
    // (alongside the Vegas market / Sleeper context). Toggle which ones appear.
    main.appendChild(h('h2', { class:'page-title', style:{ fontSize:'1.1rem', marginTop:'24px' } }, 'Expert Ranking Columns'));
    main.appendChild(h('p', { class:'page-sub', style:{ marginTop:'-6px' } },
      'Per-analyst rank columns shown beside players in every table, in addition to the Vegas market (PP−Slp) and Sleeper context. Toggle a source off to hide its column. Add more by appending to data/expert-rankings.js.'));
    // The Gibbs board is tiered; the column can only show a number, so the full
    // tier sheet lives on its own page (generated by _sources/build_gibbs_brief.py).
    main.appendChild(h('p', { class:'page-sub', style:{ marginTop:'-2px' } },
      h('a', { href:'gibbs-tiers.html', class:'on-turf' }, 'Open the Gibbs tier board'),
      ` for all ${gibbsBoardShape().text}, movement since his previous board, and who you already roster.`));
    // His Aug 22 board is a top 200 and only ranks 85-200 are sourced, so it lives on
    // its own delta page instead of replacing the complete Aug 14 board above.
    main.appendChild(h('p', { class:'page-sub', style:{ marginTop:'-2px' } },
      h('a', { href:'gibbs-update-2026-08-22.html', class:'on-turf' }, 'Aug 22 update, ranks 85-200'),
      ' for what he changed on the back half of the board, re-ranked so the extra 25 slots do not read as movement.'));
    const expGrid = h('div', { class:'card' });
    for (const src of expertSources()) {
      const on = state.settings.enabledExpertCols[src.id] !== false;
      expGrid.appendChild(h('div', { class:'row', style:{ display:'flex', alignItems:'center', gap:'12px', padding:'8px 0', borderBottom:'1px solid var(--border)' } },
        h('label', { class:'switch' },
          h('input', { type:'checkbox', checked: on ? '' : null, onchange:(e)=>{
            state.settings.enabledExpertCols[src.id] = e.target.checked;
            saveSettings();
          }}),
          h('span', { class:'slider' })
        ),
        h('div', { style:{ minWidth:0 } },
          h('div', { style:{ fontWeight:600 } }, expertColLabel(src),
            h('span', { class:'muted', style:{ marginLeft:'8px', fontWeight:400 } },
              src.scope || 'overall')),
          h('div', { class:'desc muted', style:{ fontSize:'12px' } },
            `${src.expert || src.label}${src.title ? ' · ' + src.title : ''}${src.updatedAt ? ' · ' + src.updatedAt : ''} · ${(src.players || []).length} players`,
            src.url ? h('a', { href: src.url, target:'_blank', rel:'noopener', style:{ marginLeft:'8px' } }, 'source') : null)
        )
      ));
    }
    main.appendChild(expGrid);

    // Add custom source
    main.appendChild(h('h2', { class:'page-title', style:{ fontSize:'1.1rem', marginTop:'24px' } }, 'Add a Custom Source'));
    const f = h('div', { class:'card' });
    const sId = h('input', { type:'text', placeholder:'unique-id (e.g., dynasty-nerds)' });
    const sName = h('input', { type:'text', placeholder:'Display name' });
    const sUrl = h('input', { type:'url', placeholder:'https://www.youtube.com/@channel' });
    const sDesc = h('textarea', { placeholder:'One-line description' });
    f.appendChild(h('div', { class:'form-grid' },
      h('label', null, 'ID'), sId,
      h('label', null, 'Name'), sName,
      h('label', null, 'URL'), sUrl,
      h('label', null, 'Description'), sDesc,
    ));
    f.appendChild(h('div', { style:{ marginTop:'12px', display:'flex', gap:'8px' } },
      h('button', { class:'primary', onclick: () => {
        const id = sId.value.trim(); const name = sName.value.trim();
        if (!id || !name) { toast('ID and Name required', 'error'); return; }
        if (getAllSources().find(s => s.id === id)) { toast('That ID already exists', 'error'); return; }
        state.settings.customSources.push({ id, name, url: sUrl.value.trim(), description: sDesc.value.trim(), color:'#60a5fa', rankings: [] });
        state.settings.enabledSources[id] = true;
        saveSettings(); invalidateRankIndex(); viewSources();
        toast(`Added source: ${name}`, 'success');
      } }, '+ Add Source'),
      h('span', { class:'tip' }, 'After adding, paste rankings via the Import button on the source card.')
    ));
    main.appendChild(f);

    // Settings export/import/reset
    main.appendChild(h('h2', { class:'page-title', style:{ fontSize:'1.1rem', marginTop:'24px' } }, 'Settings'));
    main.appendChild(h('div', { class:'card', style:{ display:'flex', gap:'8px', flexWrap:'wrap', alignItems:'center' } },
      h('button', { class:'ghost', onclick: () => {
        const blob = new Blob([JSON.stringify(state.settings, null, 2)], { type:'application/json' });
        const a = h('a', { href: URL.createObjectURL(blob), download: `dynasty-domain-settings-${Date.now()}.json` });
        document.body.appendChild(a); a.click(); a.remove();
        toast('Settings exported', 'success');
      } }, '↓ Export Settings'),
      h('button', { class:'ghost', onclick: () => {
        const inp = h('input', { type:'file', accept:'.json', style:{ display:'none' } });
        inp.onchange = (e) => {
          const file = e.target.files[0]; if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            try {
              const parsed = JSON.parse(reader.result);
              state.settings = Object.assign({}, defaults, parsed);
              saveSettings(); invalidateRankIndex(); viewSources();
              toast('Settings imported', 'success');
            } catch (err) { toast('Invalid JSON', 'error'); }
          };
          reader.readAsText(file);
        };
        document.body.appendChild(inp); inp.click(); inp.remove();
      } }, '↑ Import Settings'),
      h('button', { class:'ghost', style:{ color:'var(--red)' }, onclick: () => {
        if (!confirm('Reset all settings to defaults? This removes custom sources and toggles.')) return;
        localStorage.removeItem(SETTINGS_KEY);
        state.settings = loadSettings();
        ensureSourceDefaults(); ensureExpertColDefaults(); saveSettings(); invalidateRankIndex(); viewSources();
        toast('Settings reset', 'success');
      } }, '× Reset All')
    ));
  }

  function renderSourceCard(src) {
    const isCustom = (state.settings.customSources || []).some(s => s.id === src.id);
    const enabled = state.settings.enabledSources[src.id] !== false;
    const color = src.color || 'var(--accent)';
    const card = h('div', { class:'source-card' });

    card.appendChild(h('div', { class:'avatar', style:{ background: color, color:'#0b0d12' } }, (src.name || '?')[0]));

    const meta = h('div', { class:'meta' });
    meta.appendChild(h('div', { style:{ display:'flex', alignItems:'center', gap:'10px' } },
      h('h3', null, src.name),
      h('label', { class:'switch' },
        h('input', { type:'checkbox', checked: enabled ? '' : null, onchange:(e)=>{
          state.settings.enabledSources[src.id] = e.target.checked;
          saveSettings(); invalidateRankIndex();
        }}),
        h('span', { class:'slider' })
      ),
      isCustom ? h('button', { class:'ghost', style:{ marginLeft:'auto' }, onclick: ()=>{
        if (!confirm('Remove this custom source?')) return;
        state.settings.customSources = state.settings.customSources.filter(s => s.id !== src.id);
        delete state.settings.enabledSources[src.id];
        saveSettings(); invalidateRankIndex(); viewSources();
      } }, '× Remove') : null
    ));
    if (src.url) meta.appendChild(h('div', { class:'desc' }, h('a', { href: src.url, target:'_blank', rel:'noopener' }, src.handle || src.url)));
    if (src.description) meta.appendChild(h('div', { class:'desc' }, src.description));

    // Rankings list
    const list = h('div', { class:'rankings-list' });
    if ((src.rankings || []).length) {
      for (const r of src.rankings) {
        const en = state.settings.enabledRankings[r.id] !== false;
        list.appendChild(h('div', { class:'ranking-row' },
          h('label', { class:'switch' },
            h('input', { type:'checkbox', checked: en ? '' : null, onchange:(e)=>{
              state.settings.enabledRankings[r.id] = e.target.checked;
              saveSettings(); invalidateRankIndex();
            }}),
            h('span', { class:'slider' })
          ),
          h('div', { class:'info' },
            h('div', { class:'title' }, r.title),
            h('div', { class:'sub' },
              `${(r.players || []).length} players`,
              r.publishedAt ? ` · ${r.publishedAt}` : '',
              r.format ? ` · ${r.format.replace(/_/g,' ')}` : '',
            ),
          ),
          r.url ? h('a', { href:r.url, target:'_blank', rel:'noopener' }, h('button', { class:'ghost' }, 'Watch ↗')) : null
        ));
      }
    } else {
      list.appendChild(h('div', { class:'tip', style:{ padding:'8px 0' } }, 'No rankings imported yet for this source.'));
    }
    meta.appendChild(list);

    // Import button (only for custom sources or all)
    const importBtn = h('button', { class:'ghost', style:{ marginTop:'8px' }, onclick: () => openImportModal(src) }, '+ Import Rankings');
    meta.appendChild(importBtn);

    card.appendChild(meta);
    return card;
  }

  // CSV Import modal, accepts a paste of rankings
  function openImportModal(src) {
    const close = () => $$('.modal-backdrop').forEach(e => e.remove());
    const ta = h('textarea', { placeholder:'Paste rows like:\nJosh Allen, QB, BUF, cornerstone, S, optional note\nDrake Maye, QB, NE, cornerstone, S\n\nAccepts comma OR tab separators. Categories: cornerstone, foundational, upside_premier, mainstay, productive_vet, short_term. Tiers: S, A, B, C, D.',
      style:{ width:'100%', minHeight:'180px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:'.85rem' } });
    const titleInp = h('input', { type:'text', placeholder:'Ranking title (e.g., 2026 Cornerstones, May 7)' });
    const urlInp = h('input', { type:'url', placeholder:'Source video URL (optional)' });
    const formatSel = h('select', { 'aria-label':'Ranking format' },
      h('option', { value:'dynasty_1qb' }, 'Dynasty · 1QB'),
      h('option', { value:'dynasty_sf' }, 'Dynasty · Superflex'),
      h('option', { value:'dynasty_ppr' }, 'Dynasty · PPR'),
      h('option', { value:'redraft' }, 'Redraft'),
    );
    const result = h('div', { class:'tip', style:{ minHeight:'1.5em' } });
    function parse() {
      const lines = ta.value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const players = [];
      const errors = [];
      for (const line of lines) {
        const parts = line.split(/\t|,/).map(s => s.trim());
        if (parts.length < 5) { errors.push(`"${line}", needs at least name, pos, team, category, tier`); continue; }
        const [name, pos, team, category, tier, ...noteParts] = parts;
        if (!window.CATEGORY_LABELS[category]) { errors.push(`"${name}", unknown category "${category}"`); continue; }
        if (!['S','A','B','C','D'].includes(tier.toUpperCase())) { errors.push(`"${name}", invalid tier "${tier}"`); continue; }
        players.push({ name, pos: pos.toUpperCase(), team: team.toUpperCase(), category, tier: tier.toUpperCase(), note: noteParts.join(',').trim() || undefined });
      }
      result.innerHTML = '';
      if (errors.length) result.appendChild(h('div', { style:{ color:'var(--red)' } }, `${errors.length} error(s): ` + errors.slice(0,3).join('; ')));
      if (players.length) result.appendChild(h('div', { style:{ color:'var(--green)' } }, `${players.length} player(s) ready to import.`));
      return players;
    }
    const backdrop = h('div', { class:'modal-backdrop', onclick:(e)=>{ if (e.target===e.currentTarget) close(); } });
    const modal = h('div', { class:'modal', style:{ position:'relative', maxWidth:'700px' } },
      h('button', { class:'close-btn', onclick: close }, '×'),
      h('h2', { style:{ marginTop:0 } }, `Import Rankings → ${src.name}`),
      h('p', { class:'tip' }, 'Paste a list of players, one per line. Supports comma or tab separators. Header row optional.'),
      h('div', { class:'form-grid', style:{ marginBottom:'12px' } },
        h('label', null, 'Title'), titleInp,
        h('label', null, 'Source URL'), urlInp,
        h('label', null, 'Format'), formatSel,
      ),
      ta,
      h('div', { style:{ display:'flex', gap:'8px', alignItems:'center', marginTop:'8px' } },
        h('button', { class:'ghost', onclick: () => parse() }, 'Validate'),
        h('button', { class:'primary', onclick: () => {
          const players = parse();
          if (!players.length) return;
          const id = src.id + '-' + Date.now().toString(36);
          const ranking = { id, title: titleInp.value.trim() || `Custom Import ${new Date().toISOString().slice(0,10)}`, url: urlInp.value.trim() || undefined, format: formatSel.value, publishedAt: new Date().toISOString().slice(0,10), defaultEnabled: true, players };
          // Persist: if built-in source, mirror it as custom + add ranking; else add to existing custom source
          let target = (state.settings.customSources || []).find(s => s.id === src.id);
          if (!target) {
            target = Object.assign({}, src, { rankings: src.rankings ? src.rankings.slice() : [] });
            state.settings.customSources.push(target);
          }
          target.rankings.push(ranking);
          state.settings.enabledRankings[id] = true;
          state.settings.enabledSources[target.id] = true;
          saveSettings(); invalidateRankIndex(); close(); viewSources();
          toast(`Imported ${players.length} player${players.length===1?'':'s'} into ${target.name}`, 'success');
        }}, 'Import'),
        result
      )
    );
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    setTimeout(() => titleInp.focus(), 30);
  }

  // ============================================================
  // ROUTE: Compare Rosters
  // ============================================================

  // ============================================================
  // ROUTE: Trade Calculator
  // ============================================================
  const TRADE_STATE = {
    leagueId: null,
    sideA: { rosterId: null, picks: new Set() },   // pids and pick-keys (year-round-from)
    sideB: { rosterId: null, picks: new Set() },
  };
  // ============================================================
  // ROUTE: Trade Calculator (kinetic)
  // - Drag any player or pick from a roster pool onto its side's pile.
  // - Drag back to remove. Click still works as a fallback.
  // - Middle summary recomputes live during hover (preview math) and
  //   commits with a spring overshoot on drop.
  // - Full re-renders are avoided — toggles mutate DOM in place so
  //   animations don't get reset every interaction.
  // ============================================================
  const KT = { reduced: false };
  // Jump to the Trade Lab with a player pre-loaded on the owner's side.
  // My player -> YOU SEND (side A); opponent's -> YOU RECEIVE (side B).
  function openTradeFor(sleeperId, leagueId, rosterId) {
    const lg = (window.LEAGUES || []).find(l => l.id === leagueId); if (!lg) return;
    const owner = lg.rosters.find(r => r.roster_id === rosterId);
    const mine = lg.rosters.find(r => r.is_me);
    TRADE_STATE.leagueId = leagueId; // set before navigate so viewTrade won't reset picks
    if (owner && owner.is_me) {
      TRADE_STATE.sideA = { rosterId, picks: new Set([String(sleeperId)]) };
      TRADE_STATE.sideB = { rosterId: (lg.rosters.find(r => !r.is_me) || lg.rosters[0]).roster_id, picks: new Set() };
    } else {
      TRADE_STATE.sideB = { rosterId, picks: new Set([String(sleeperId)]) };
      TRADE_STATE.sideA = { rosterId: (mine || lg.rosters[0]).roster_id, picks: new Set() };
    }
    navigate(`#trade/${leagueId}`);
  }
  // Trade Finder. Iterates reasonable packages with every partner (1-for-1,
  // 2-for-1 both ways, 2-for-2, dynasty picks too), prunes on the league currency
  // and the headliner rule, scores both starting lineups, then prices the best in
  // this season's title odds for BOTH rosters. A deal survives only when I gain,
  // the partner gains on HIS objective (title odds if he contends, future value if
  // he is a dynasty rebuilder), and the market reads it close to even.
  const FINDER_REBUILD = new Set(['seller', 'tank']);
  // Trade currency: a skill player worth SIM.finderMinAsset or more, plus owned
  // picks in dynasty (rosterOwnedPicks is [] in redraft). No IDP: championshipOdds
  // does not simulate the defense, so it would price an LB at nothing on both
  // sides of the deal. No K or DEF either: they are streamed, not traded for.
  // A player in an IR slot: the simulator books him from his return week, but a
  // dynasty lineup delta starts only the active list, so he would read as a free
  // throw-in there.
  // ponytail: IDP and IR-slot players stay out of candidates; add them once
  // simPool draws the defense and finderLineup books a reserve player's return.
  function finderAssets(lg, roster) {
    const out = [], ir = new Set((roster.reserve || []).map(String));
    for (const pid of (roster.players || []).map(String)) {
      const sp = window.PLAYERS[pid];
      if (!sp || ir.has(pid) || !SLOT_TAKES.SUPER_FLEX.includes(sp.pos)) continue;
      const v = playerValue(pid, lg);
      if (v >= SIM.finderMinAsset) out.push({ k: pid, v, pos: sp.pos, label: sp.name });
    }
    for (const p of rosterOwnedPicks(roster.roster_id, lg)) {
      if (p.value >= SIM.finderMinAsset) out.push({ k: pickKey(p.season, p.round, p.originRosterId), v: p.value, pos: 'PICK', label: p.label });
    }
    return out;
  }
  // Every one- and two-piece package from a side's assets, headliner first.
  function finderPackages(assets) {
    const out = assets.map(a => ({ keys: [a.k], items: [a], v: a.v, head: a.v }));
    for (let i = 0; i < assets.length; i++) for (let j = i + 1; j < assets.length; j++) {
      const [a, b] = assets[i].v >= assets[j].v ? [assets[i], assets[j]] : [assets[j], assets[i]];
      out.push({ keys: [a.k, b.k], items: [a, b], v: a.v + b.v, head: a.v });
    }
    return out;
  }
  // A pick's price is endogenous to the trade that moves it: slot it off both
  // rosters as they look AFTER the deal. A known Sleeper slot stands.
  function postTradePickValue(lg, k, traded) {
    const { season, round, originRosterId } = parsePickKey(k);
    if (knownDraftSlot(season, round, originRosterId, lg) != null) return pickValue(season, round, originRosterId, lg);
    const yo = pickYearsOut(season);
    const order = lg.rosters.map(r => ({ id: r.roster_id, s: startingStrength(traded.get(r.roster_id) || r, lg, yo) }))
      .sort((a, b) => a.s - b.s);
    const slot = order.findIndex(o => o.id === originRosterId) + 1;
    const idx = pickIndex();
    return interpPickValue(lg.is_superflex ? idx.sf : idx.oneqb, season, round, slot, lg.total_rosters)
      ?? pickValue(season, round, originRosterId, lg);
  }
  // Starting-lineup points for a list of ids, the numbers tradeLineupImpact reads
  // (redraftLineup's rest-of-season points in redraft, optimalOffense's season
  // projection in dynasty) through the same fillLineup + offenseStartingSlots and
  // the same waiver wire, with each player's points cached so a search can afford
  // thousands of fills. IDP never moves in a finder trade, so the defense half
  // cancels out of every delta.
  function finderLineup(lg) {
    const dyn = isDynastyLeague(lg), slots = offenseStartingSlots(lg), map = projMap('offense'), ros = rosPointsByPid(lg);
    const free = waiverIds(lg);
    const cache = new Map();
    const asset = (pid) => {
      if (!cache.has(pid)) {
        let a = null;
        if (!dyn) { const r = ros.get(pid); if (r) a = { pos: projPosGroup(r.pos), v: r.pts }; }
        else {
          const p = map.get(pid);
          const pts = p && !isSidelined(pid) && SLOT_TAKES.SUPER_FLEX.includes(p.pos) ? projPoints(p, lg, 'blend') : null;
          if (pts != null) a = { pos: p.pos, v: pts };
        }
        cache.set(pid, a);
      }
      return cache.get(pid);
    };
    const pts = (ids) => fillLineup([...new Set(ids.concat(free))].map(asset).filter(Boolean), slots).reduce((s, a) => s + a.v, 0);
    // Redraft keeps IR on the books (his line prices the missed weeks); dynasty
    // starts only the active list.
    return { pts, ids: (r) => startableIds(r, { includeStashed: !dyn }) };
  }
  // A rebuilder's core: his most valuable player plus his SIM.finderCoreYoung best
  // by value SIM.finderFvYears out, aged on the site's curve (ageRetention).
  function finderCore(assets) {
    const players = assets.filter(a => a.pos !== 'PICK');
    const aged = (a) => a.v * ageRetention(window.PLAYERS[a.k]?.age, a.pos, SIM.finderFvYears);
    const core = new Set(players.slice().sort((a, b) => aged(b) - aged(a)).slice(0, SIM.finderCoreYoung).map(a => a.k));
    const best = players.reduce((b, a) => (!b || a.v > b.v ? a : b), null);
    if (best) core.add(best.k);
    return core;
  }
  // One partner: prune on value, the headliner rule and lineup holes, then score
  // my starting lineup exactly and the partner's objective on the best of those.
  // A rebuilder is scored on FV instead of his lineup, off the site's own phase
  // call (rosterStance).
  function finderScan(lg, me, them, fast = finderLineup(lg)) {
    const rebuilder = isDynastyLeague(lg) && FINDER_REBUILD.has(rosterStance(them, lg));
    const Y = SIM.finderFvYears;
    const delta = (r) => {
      const ids = fast.ids(r), now = fast.pts(ids);
      return (send, recv) => fast.pts(ids.filter(p => !send.includes(p)).concat(recv.filter(k => !isPickKey(k)))) - now;
    };
    const meD = delta(me), themD = delta(them);
    const fvNow = rebuilder ? projectedTradeStrength(lg, them.roster_id, new Set(), new Set(), Y) : 0;
    const fv = (send, recv) => projectedTradeStrength(lg, them.roster_id, new Set(send), new Set(recv), Y) - fvNow;
    const mine = finderAssets(lg, me), theirs = finderAssets(lg, them);
    const meIn = new Map(theirs.map(a => [a.k, meD([], [a.k])]));
    const themIn = new Map(mine.map(a => [a.k, rebuilder ? fv([], [a.k]) : themD([], [a.k])]));
    // A piece "helps" when he fills a starting-lineup hole for whoever receives him
    // (a rebuilder: raises his FV). Each side needs a player who does, or it has no
    // reason to deal; the other piece of a 2-for-1 can be depth or a pick, which
    // the simulator prices. A 2-for-2 is two swaps glued together, so every piece
    // in one has to help or be a pick, which is also what keeps the search small.
    const isPick = (a) => a.pos === 'PICK';
    const tag = (pkgs, helps, pickOnlyOk) => pkgs.filter(x => x.items.some(helps) || (pickOnlyOk && x.items.every(isPick)))
      .map(x => ({ ...x, all: x.items.every(a => isPick(a) || helps(a)) }));
    const gets = tag(finderPackages(theirs), a => !isPick(a) && meIn.get(a.k) > 0, false);
    const sends = tag(finderPackages(mine), a => (rebuilder || !isPick(a)) && themIn.get(a.k) > 0, rebuilder);
    const floor = SIM.finderFairPct / 100 / 1.15;   // the most a headliner premium can lift
    const core = rebuilder ? finderCore(theirs) : null;
    const age = (a) => window.PLAYERS[a.k]?.age || 99;
    // A core piece leaves a rebuilder only for ONE piece younger than every core
    // piece he sends, or a pick. Never for older or multiple pieces.
    const keepsCore = (s, g) => {
      const out = g.items.filter(a => core.has(a.k));
      if (!out.length) return true;
      if (s.items.length !== 1) return false;
      return isPick(s.items[0]) || age(s.items[0]) < Math.min(...out.map(age));
    };
    let pool = [], checked = 0;
    for (const g of gets) for (const s of sends) {
      if (s.keys.length === 2 && g.keys.length === 2 && !(s.all && g.all)) continue;
      checked++;
      // Headliner rule: a pile of lesser pieces never buys the stud, and the
      // partner holds his side to a stricter bar.
      if (Math.min(s.head, g.head) < SIM.finderAnchorRatio * Math.max(s.head, g.head)) continue;
      if (g.head > s.head && s.head < SIM.finderPartnerAnchorRatio * g.head) continue;
      if (core && !keepsCore(s, g)) continue;
      if (Math.min(s.v, g.v) < floor * Math.max(s.v, g.v)) continue;
      if (KT.computeFairness(s.v, g.v, s.keys.length, g.keys.length, s.head, g.head).pct < SIM.finderFairPct) continue;
      const d = meD(s.keys, g.keys);
      if (d >= SIM.finderMinGainPts) pool.push({ s, g, meD: d });
    }
    // ponytail: the partner's side is scored on only the SIM.finderCandidateCap
    // packages that help my lineup most. The cap drops the smaller upgrades, so a
    // partner who would take only a modest deal is missed. Raise it if a league
    // keeps coming back empty.
    pool.sort((a, b) => b.meD - a.meD);
    pool = pool.slice(0, SIM.finderCandidateCap);
    // Per player I would headline-receive, two packages go on: the best for me
    // and the best for him, so a stud's sweetener permutations cannot take every
    // simulation slot and the one the partner would sign is not deduped away.
    const byHead = new Map();
    for (const { s, g, meD: d } of pool) {
      const tD = themD(g.keys, s.keys);
      const tFv = rebuilder ? fv(g.keys, s.keys) : null;
      // A contender never takes a deal that lowers his own starting lineup.
      if (rebuilder ? tFv < SIM.finderMinFvGain : tD < -1e-6) continue;
      const fills = s.items.reduce((b, a) => (themIn.get(a.k) > (b ? themIn.get(b.k) : 0) ? a : b), null);
      const c = { them, rebuilder, stance: rebuilder ? rosterStance(them, lg) : null, send: s, get: g, meD: d, themD: tD, themFv: tFv, fvNow,
        fills: fills?.pos, gain: rebuilder ? tFv : tD };
      const h = byHead.get(g.keys[0]) || {};
      if (!h.me) h.me = c;   // the pool is sorted, so the first one is best for me
      if (!h.them || c.gain > h.them.gain) h.them = c;
      byHead.set(g.keys[0], h);
    }
    const cands = [...new Set([...byHead.values()].flatMap(h => [h.me, h.them]))].sort((a, b) => b.meD - a.meD);
    return { checked, cands: cands.slice(0, SIM.finderSimPerPartner) };
  }
  // A deal's rank: my change in this season's title odds; in dynasty plus my FV
  // change at its weight, less what I overpay on KTC (value out minus value in)
  // at its weight, so a deal that bleeds market value sinks unless the odds pay.
  function finderScore(dyn, my, myFv, sendV, getV) {
    return my.delta + (dyn ? SIM.finderFvWeight * myFv - SIM.finderOverpayWeight * Math.max(0, sendV - getV) : 0);
  }
  // The whole search, in slices: it yields to the UI between partners and
  // between simulations, so a phone keeps painting the progress line.
  async function findTrades(lg, { sims = SIM.finderSims, onProgress = () => {} } = {}) {
    const me = (lg.rosters || []).find(r => r.is_me);
    if (!me) return { proposals: [], checked: 0, simulated: 0 };
    const dyn = isDynastyLeague(lg), Y = SIM.finderFvYears, none = new Set();
    const pause = () => new Promise(r => setTimeout(r, 0));
    const partners = lg.rosters.filter(r => r !== me), fast = finderLineup(lg);
    let pool = [], checked = 0;
    for (const [i, them] of partners.entries()) {
      onProgress(`Scanning ${them.team_name} (${i + 1} of ${partners.length})`);
      await pause();
      const res = finderScan(lg, me, them, fast);
      checked += res.checked;
      pool.push(...res.cands);
    }
    pool = pool.sort((a, b) => b.meD - a.meD).slice(0, SIM.finderSimTop);
    onProgress(`Simulating ${CURRENT_SEASON} title odds, no trade`);
    await pause();
    // Same seed before and after (common random numbers), so a change is the
    // trade, not the dice. This season only: FV prices the years after it.
    const run = (n, whatIf) => { const champions = []; return { res: championshipOdds(lg, { sims: n, whatIf, champions }), champions }; };
    const title = (r, rid) => r.res.find(o => o.rosterId === rid)?.title || 0;
    const oddsOf = (after, before, rid) => ({ before: title(before, rid), after: title(after, rid), ...pairedTitleDelta(before.champions, after.champions, rid) });
    // A deal clears the gates twice: on this cheap screen, then on the Trade Lab's
    // own first-season run (same seed, same what-if, SIM.tradeSimBudget split over
    // its horizon), so the row shows exactly what the Lab will. The 800-sim screen
    // alone showed a partner +0.1 that the Lab read -1.2.
    const labSims = SIM.tradeSimBudget / (dyn ? 3 : 1);
    const base = run(sims, null);
    const myFvNow = dyn ? projectedTradeStrength(lg, me.roster_id, none, none, Y) : 0;
    const proposals = [];
    for (const [i, c] of pool.entries()) {
      onProgress(`Simulating ${i + 1} of ${pool.length}: ${c.them.team_name}`);
      await pause();
      const send = new Set(c.send.keys), get = new Set(c.get.keys);
      const whatIf = tradeTitleWhatIf(me.roster_id, c.them.roster_id, send, get, lg);
      const after = run(sims, whatIf);
      const my = oddsOf(after, base, me.roster_id), their = oddsOf(after, base, c.them.roster_id);
      let sendItems = c.send.items, getItems = c.get.items, myFv = 0, themFv = c.themFv;
      if (dyn) {
        const traded = new Map([[me.roster_id, tradedRoster(me, send, get)], [c.them.roster_id, tradedRoster(c.them, get, send)]]);
        const price = (k) => postTradePickValue(lg, k, traded);
        const reprice = (items) => items.map(a => a.pos === 'PICK' ? { ...a, v: price(a.k) } : a);
        sendItems = reprice(sendItems); getItems = reprice(getItems);
        myFv = projectedTradeStrength(lg, me.roster_id, send, get, Y, price) - myFvNow;
        if (c.rebuilder) themFv = projectedTradeStrength(lg, c.them.roster_id, get, send, Y, price) - c.fvNow;
      }
      const tot = (items) => items.reduce((s, a) => s + a.v, 0), top = (items) => Math.max(...items.map(a => a.v));
      const sendV = tot(sendItems), getV = tot(getItems);
      const fair = KT.computeFairness(sendV, getV, send.size, get.size, top(sendItems), top(getItems)).pct;
      const scoreOf = (m) => finderScore(dyn, m, myFv, sendV, getV);
      const passes = (m, t, z = SIM.finderSeMult) => m.delta > z * m.se && scoreOf(m) > 0 && (c.rebuilder ? themFv >= SIM.finderMinFvGain : t.delta > 0);
      if (!(passes(my, their, SIM.finderScreenSeMult) && fair >= SIM.finderFairPct)) continue;
      proposals.push({ them: c.them, rebuilder: c.rebuilder, stance: c.stance, fvNow: c.fvNow, fills: c.fills, whatIf, passes, scoreOf,
        send: { keys: c.send.keys, items: sendItems }, get: { keys: c.get.keys, items: getItems },
        sendV, getV, fair, my, their, myFv, themFv, meD: c.meD, themD: c.themD, score: scoreOf(my) });
    }
    proposals.sort((a, b) => b.score - a.score);
    const per = new Map(), shown = [];
    let labBase = null, rechecked = 0;
    const pct = (x) => `${(x * 100).toFixed(1)}%`;
    for (const p of proposals) {
      const n = per.get(p.them.roster_id) || 0;
      if (n >= SIM.finderShowPerPartner || shown.length >= SIM.finderShow) continue;
      onProgress(`Checking ${p.them.team_name} at ${labSims.toLocaleString()} simulations`);
      await pause();
      if (!labBase) labBase = run(labSims, null);
      const after = run(labSims, p.whatIf);
      rechecked++;
      const my = oddsOf(after, labBase, me.roster_id), their = oddsOf(after, labBase, p.them.roster_id);
      if (!p.passes(my, their)) continue;
      per.set(p.them.roster_id, n + 1);
      p.why = p.rebuilder
        ? `Their starting lineup ranks low (${p.stance}), so they are priced on the future: their ${Y}-year lineup value ${Math.round(p.fvNow)} to ${Math.round(p.fvNow + p.themFv)} (+${Math.round(p.themFv)}).`
        : `${p.fills ? `Fills their ${p.fills}. ` : ''}Their lineup +${Math.round(p.themD)} pts, title odds ${pct(their.before)} to ${pct(their.after)}.`;
      shown.push(Object.assign(p, { my, their, score: p.scoreOf(my) }));
    }
    shown.sort((a, b) => b.score - a.score);
    return { proposals: shown, checked, simulated: pool.length + rechecked, labSims };
  }
  // Last run per league, so loading one proposal into the Trade Lab (which
  // re-renders the page) keeps the list for the next one.
  const FINDER_RESULTS = new Map();
  function buildTradeFinder(lg) {
    const me = lg.rosters.find(r => r.is_me);
    const dyn = isDynastyLeague(lg);
    const list = h('div', { class: 'tf-list' });
    const status = h('div', { class: 'trade-finder-note tf-progress', role: 'status', 'aria-live': 'polite' }, me ? '' : 'No team in this league.');
    const pct = (x) => `${(x * 100).toFixed(1)}%`;
    const signed = (x, d = 1) => `${x >= 0 ? '+' : ''}${x.toFixed(d)}`;
    const side = (tag, items) => h('span', { class: 'tf-side' },
      h('span', { class: `tf-tag ${tag}` }, tag.toUpperCase()),
      ...items.map(a => h('span', { class: 'tf-piece' },
        a.pos === 'PICK' ? h('span', { class: 'badge' }, 'PICK') : posChip(a.pos),
        h('span', { class: 'name' }, a.label), h('span', { class: 'tnum tf-val' }, fmt.decimal(a.v, 0)))));
    const row = (p) => h('button', { type: 'button', class: 'trade-find-row',
      title: 'Load into the Trade Lab', 'aria-label': `Load trade with ${p.them.team_name} into the Trade Lab`,
      dataset: { tfSend: p.send.keys.join(','), tfGet: p.get.keys.join(',') },
      onclick: () => {
        TRADE_STATE.leagueId = lg.id;
        TRADE_STATE.sideA = { rosterId: me.roster_id, picks: new Set(p.send.keys) };
        TRADE_STATE.sideB = { rosterId: p.them.roster_id, picks: new Set(p.get.keys) };
        viewTrade(lg.id);
        $('#main .trade-calc')?.scrollIntoView({ block: 'start' });
      } },
      h('div', { class: 'tf-partner' }, p.them.team_name),
      h('div', { class: 'tf-deal' }, side('out', p.send.items), h('span', { class: 'tf-arrow' }, '⇄'), side('in', p.get.items)),
      h('div', { class: 'tf-fair', style: { color: p.fair >= 90 ? 'var(--green)' : 'var(--amber)' } }, `${Math.round(p.fair)}%`),
      h('div', { class: 'tf-odds tnum' },
        // ± is SIM.titleBandZ paired standard errors, the Trade Lab's own band.
        `${CURRENT_SEASON} title: you ${pct(p.my.before)} to ${pct(p.my.after)} (${signed(p.my.delta)} pts ±${(SIM.titleBandZ * p.my.se).toFixed(1)})`
        + ` · them ${pct(p.their.before)} to ${pct(p.their.after)} (${signed(p.their.delta)} ±${(SIM.titleBandZ * p.their.se).toFixed(1)})`
        + (dyn ? ` · your FV ${signed(p.myFv, 0)}` : '')),
      h('div', { class: 'tf-why' }, `${dyn ? 'KTC' : 'Value'} ${fmt.decimal(p.sendV, 1)} out, ${fmt.decimal(p.getV, 1)} in (${signed(p.getV - p.sendV)}). ${p.why}`),
    );
    const show = (res) => {
      list.innerHTML = '';
      status.dataset.tfDone = '1';   // a finished run, for anything waiting on it
      status.textContent = `${res.proposals.length} trade${res.proposals.length === 1 ? '' : 's'} from ${res.checked.toLocaleString()} packages, `
        + `${res.simulated} simulated, ${(res.ms / 1000).toFixed(1)} s.`;
      if (!res.proposals.length) list.appendChild(h('div', { class: 'trade-finder-empty' }, 'No deal helps you and the partner right now. Build one by hand above.'));
      for (const p of res.proposals) list.appendChild(row(p));
    };
    const run = h('button', { type: 'button', class: 'tf-run', disabled: me ? null : '', onclick: async () => {
      run.disabled = true;
      list.innerHTML = '';
      delete status.dataset.tfDone;
      const t0 = performance.now();
      try {
        const res = await findTrades(lg, { onProgress: (m) => { status.textContent = `${m}...`; } });
        res.ms = performance.now() - t0;
        FINDER_RESULTS.set(lg.id, res);
        show(res);
      } catch (err) {
        console.error('Trade Finder failed', err);
        status.textContent = 'Could not finish the search. Try again.';
      } finally {
        run.disabled = false;
      }
    } }, 'Find trades');
    if (me && FINDER_RESULTS.has(lg.id)) show(FINDER_RESULTS.get(lg.id));
    return h('div', { class: 'trade-finder' },
      h('h2', { class: 'section-title' }, 'Trade Finder'),
      h('p', { class: 'trade-finder-note' }, `Searches 1-for-1, 2-for-1 and 2-for-2 deals with every team${dyn ? ', picks included' : ''}, `
        + `then simulates the best in ${CURRENT_SEASON} title odds for both sides. A deal shows only if it helps you and the partner gains on what he plays for: `
        + (dyn ? 'title odds if he contends, future value if he is rebuilding.' : 'his title odds.') + ' Choose one to load it.'),
      run, status, list);
  }
  // ============================================================
  // Trade partners, across every season this league has existed
  // ============================================================
  // Sleeper chains seasons with previous_league_id, and roster_id is renumbered
  // between them, so the count is keyed by OWNER user_id, which is stable. One
  // season of trades is far too thin to call anyone a "usual partner": taco
  // 2023 had 44 league trades and only 4 of mine, so the whole chain is walked.
  const PARTNER_TTL = 12 * 3600 * 1000;
  const partnerCache = new Map();
  const partnerPending = new Map();
  function pickTraceKey(season, round, originUid) {
    return originUid ? `${season}|${round}|${originUid}` : null;
  }
  function historicalPickLabel(pick) {
    if (typeof pick === 'string') return pick;
    const base = `${pick.season} R${pick.round}`;
    if (!pick.outcome?.playerName) return base;
    const spot = pick.outcome.pickInRound
      ? `${pick.round}.${String(pick.outcome.pickInRound).padStart(2, '0')}` : null;
    return `${base} (${spot ? `${spot} → ` : ''}${pick.outcome.playerName})`;
  }

  async function tradePartnerHistory(lg) {
    if (partnerCache.has(lg.id)) return partnerCache.get(lg.id);
    const seeded = window.TRADE_HISTORY?.leagues?.[String(lg.id)];
    if (seeded) {
      partnerCache.set(lg.id, seeded);
      return seeded;
    }
    if (partnerPending.has(lg.id)) return partnerPending.get(lg.id);
    const pending = loadTradePartnerHistory(lg);
    partnerPending.set(lg.id, pending);
    try {
      const data = await pending;
      partnerCache.set(lg.id, data);
      return data;
    } finally {
      partnerPending.delete(lg.id);
    }
  }

  async function loadTradePartnerHistory(lg) {
    const ckey = `tier-sheet-partners-v5::${lg.id}`;
    try {
      const raw = JSON.parse(localStorage.getItem(ckey) || 'null');
      if (raw && Date.now() - raw.fetchedAt < PARTNER_TTL) {
        return raw.data;
      }
    } catch {}

    const getJSON = async (u) => {
      try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch { return null; }
    };
    // Walk back through the seasons. Capped at 10 so a corrupt chain cannot loop.
    const seasons = [];
    let id = lg.id;
    for (let i = 0; i < 10 && id && id !== '0'; i++) {
      const meta = await getJSON(`https://api.sleeper.app/v1/league/${id}`);
      if (!meta) break;
      seasons.push({ id, season: meta.season });
      id = meta.previous_league_id;
    }

    const counts = new Map(), names = new Map(), usernames = new Map(), draftOutcomes = new Map();
    const seasonPayloads = await Promise.all(seasons.map(async s => {
      const [rosters, users, pages, draftData] = await Promise.all([
        getJSON(`https://api.sleeper.app/v1/league/${s.id}/rosters`),
        getJSON(`https://api.sleeper.app/v1/league/${s.id}/users`),
        Promise.all(Array.from({ length: 18 }, (_, i) =>
          getJSON(`https://api.sleeper.app/v1/league/${s.id}/transactions/${i + 1}`))),
        (async () => {
          const drafts = await getJSON(`https://api.sleeper.app/v1/league/${s.id}/drafts`);
          const completeDrafts = (drafts || []).filter(d => d.status === 'complete');
          const draftPickPages = await Promise.all(completeDrafts
            .map(d => getJSON(`https://api.sleeper.app/v1/draft/${d.draft_id}/picks`)));
          return { completeDrafts, draftPickPages };
        })(),
      ]);
      return { s, rosters, users, pages, ...draftData };
    }));

    for (const { s, rosters, users, pages, completeDrafts, draftPickPages } of seasonPayloads) {
      for (const u of users || []) {
        const uid = String(u.user_id);
        const name = String((u.metadata && u.metadata.team_name) || u.display_name || uid).trim();
        const username = String(u.display_name || '').trim();
        if (!names.has(uid)) names.set(uid, name);
        if (username && !usernames.has(uid)) usernames.set(uid, username);
      }
      const ownerOf = new Map((rosters || []).map(r => [String(r.roster_id), String(r.owner_id)]));
      const myRosterId = String((rosters || []).find(r => String(r.owner_id) === String(window.MY_USER_ID))?.roster_id || '');

      for (let i = 0; i < completeDrafts.length; i++) {
        const draft = completeDrafts[i];
        const slotOwners = new Map(Object.entries(draft.draft_order || {})
          .map(([uid, slot]) => [String(slot), String(uid)]));
        const teamCount = slotOwners.size || Object.keys(draft.slot_to_roster_id || {}).length || (rosters || []).length;
        for (const pick of draftPickPages[i] || []) {
          const slot = String(pick.draft_slot || '');
          const rosterId = draft.slot_to_roster_id?.[slot];
          const originUid = slotOwners.get(slot) || ownerOf.get(String(rosterId));
          const key = pickTraceKey(draft.season || s.season, pick.round, originUid);
          if (!key || draftOutcomes.has(key)) continue;
          const metadataName = [pick.metadata?.first_name, pick.metadata?.last_name].filter(Boolean).join(' ').trim();
          const playerName = metadataName || window.PLAYERS?.[String(pick.player_id)]?.name || `#${pick.player_id}`;
          const pickInRound = teamCount && pick.pick_no
            ? ((Number(pick.pick_no) - 1) % teamCount) + 1
            : Number(pick.draft_slot) || null;
          draftOutcomes.set(key, { playerName, pickInRound });
        }
      }

      for (const page of pages) {
        for (const t of page || []) {
          if (t.type !== 'trade' || t.status !== 'complete') continue;
          const at = Number(t.status_updated || t.created || 0);
          if (!myRosterId) continue;
          const myUid = String(window.MY_USER_ID);
          const uids = (t.roster_ids || []).map(rid => ownerOf.get(String(rid))).filter(Boolean).map(String);
          if (!uids.includes(myUid)) continue;
          const forRoster = (assets, rid) => Object.entries(assets || {})
            .filter(([, owner]) => String(owner) === String(rid)).map(([pid]) => pid);
          const pickInfo = pick => {
            const originUid = ownerOf.get(String(pick.roster_id)) || null;
            return {
              season: String(pick.season),
              round: Number(pick.round),
              key: pickTraceKey(pick.season, pick.round, originUid),
            };
          };
          const trade = {
            season: s.season,
            week: t.leg || null,
            at,
            got: forRoster(t.adds, myRosterId),
            sent: forRoster(t.drops, myRosterId),
            gotPicks: (t.draft_picks || []).filter(p => String(p.owner_id) === myRosterId).map(pickInfo),
            sentPicks: (t.draft_picks || []).filter(p => String(p.previous_owner_id) === myRosterId && String(p.owner_id) !== myRosterId).map(pickInfo),
          };
          for (const uid of uids) {
            if (uid === myUid) continue;
            const e = counts.get(uid) || { n: 0, seasons: [], last: 0, trades: [] };
            e.n++;
            if (!e.seasons.includes(s.season)) e.seasons.push(s.season);
            e.last = Math.max(e.last, t.status_updated || t.created || 0);
            e.trades.push(trade);
            counts.set(uid, e);
          }
        }
      }
    }

    const finalized = new WeakSet();
    for (const entry of counts.values()) {
      for (const trade of entry.trades) {
        if (finalized.has(trade)) continue;
        finalized.add(trade);
        for (const side of ['gotPicks', 'sentPicks']) {
          trade[side] = trade[side].map(pick => {
            return {
              ...pick,
              outcome: draftOutcomes.get(pick.key) || null,
            };
          });
        }
      }
    }

    const data = {
      seasons: seasons.map(s => s.season),
      partners: Array.from(counts, ([uid, e]) => ({
        uid, name: names.get(uid) || uid, username: usernames.get(uid) || '', ...e,
        trades: e.trades.sort((a, b) => b.at - a.at) }))
        .sort((a, b) => b.n - a.n || b.last - a.last),
    };
    try { localStorage.setItem(ckey, JSON.stringify({ fetchedAt: Date.now(), data })); } catch {}
    return data;
  }

  // Strip above the Trade Lab: who I actually deal with. Async so the view does
  // not block on roughly 21 requests per season; it fills itself in when done.
  // ============================================================
  // What a waiver situation costs: FAAB archetypes
  // ============================================================
  // Built from every priced waiver claim across the Sleeper league chains
  // (notes/faab-bid-archetypes-2026-09-16.md). The panel answers one question
  // while a claim is live: what has this situation gone for before.
  //
  // Dynasty and redraft are separate markets and never share a table. Budgets
  // differ across leagues (200, 200, 150, 100), so the axis is percent of
  // budget, not dollars, and the panel says so rather than implying that $20 in
  // a 200 league equals $20 in a 100 league.
  // ============================================================
  // Fantasy strength of schedule: how strong the managers you play are
  // ============================================================
  // Distinct from site/data/sos.js, which is NFL SOS (opponent team defense).
  // This is "who do I actually play, and how good do their lineups project".
  //
  // The weekly lineup goes through fillLineup against the league's own slots, so
  // it obeys the one lineup filler. A bye is a null in the weekly array, so the
  // player simply is not an asset that week and the filler promotes the next
  // best body: a team with four players on bye is NOT scored as a weak opponent,
  // which is the trap that would invert the whole metric.
  const _sosCache = new Map();
  function starterByeCost(roster, wk, playerMap, lastWeek) {
    let points = 0, slots = 0;
    for (const pid of new Set((roster?.starters || []).map(String))) {
      const player = playerMap.get(pid);
      if (!player) continue;
      const weekly = player.sleeper || [];
      if (weekly[wk - 1] != null) continue;
      const active = weekly.slice(0, lastWeek).filter(v => v != null);
      if (!active.length) continue;
      slots++;
      points += active.reduce((sum, value) => sum + value, 0) / active.length;
    }
    return { slots, points };
  }

  function fantasySos(lg) {
    const key = String(lg.id);
    if (_sosCache.has(key)) return _sosCache.get(key);
    const sched = (window.FANTASY_SCHEDULE?.leagues || {})[key];
    const wr = window.WEEKLY_RANKINGS;
    if (!sched || !wr) return null;

    const pm = new Map((wr.players || []).map(p => [String(p.id), p]));
    const slots = offenseStartingSlots(lg);
    const idpSlots = idpSlotCount(lg);
    const curWeek = wr.currentWeek || 1;
    // Regular season only. playoffStart comes from the league, not an assumption
    // that every league starts its playoffs in week 14.
    const lastWeek = Math.max(1, (sched.playoffStart || 15) - 1);

    // One roster's best legal lineup for one week, in projected points.
    const weekPoints = (roster, wk) => {
      const off = [], idp = [];
      for (const pid of new Set(startableIds(roster))) {
        const p = pm.get(String(pid));
        if (!p) continue;
        const v = (p.sleeper || [])[wk - 1];
        if (v == null) continue;          // bye or no game: not an asset this week
        const rec = { name: p.name, pos: p.pos, pts: v, v };
        if (SLOT_TAKES.SUPER_FLEX.includes(p.pos) || p.pos === 'K' || p.pos === 'DEF') off.push(rec);
        else idp.push(rec);
      }
      let total = 0;
      if (slots.length) total += fillLineup(off, slots).reduce((a, b) => a + b.pts, 0);
      if (idpSlots) {
        idp.sort((a, b) => b.pts - a.pts);
        total += idp.slice(0, idpSlots).reduce((a, b) => a + b.pts, 0);
      }
      return Math.round(total * 10) / 10;
    };

    // Everyone's weekly lineup strength, once.
    const byRoster = new Map((lg.rosters || []).map(r => [r.roster_id, r]));
    const strength = {};
    for (let wk = 1; wk <= lastWeek; wk++) {
      strength[wk] = {};
      for (const r of (lg.rosters || [])) strength[wk][r.roster_id] = weekPoints(r, wk);
    }

    const rows = [];
    for (const r of (lg.rosters || [])) {
      const weeks = [];
      for (let wk = 1; wk <= lastWeek; wk++) {
        const opp = (sched.weeks?.[String(wk)] || {})[String(r.roster_id)];
        // A null opponent is a fantasy bye or a consolation group, not a zero.
        // It is dropped rather than averaged in as an easy week.
        if (opp == null) { weeks.push({ wk, opp: null, pts: null }); continue; }
        weeks.push({ wk, opp, oppName: byRoster.get(opp)?.team_name || `R${opp}`, pts: strength[wk][opp] ?? null });
      }
      // Gross production unavailable from starters on the opponents this roster
      // actually faces. The LEFT score already uses each opponent's available
      // best lineup, so this explains the bye benefit without subtracting it twice.
      let opponentByePts = 0, opponentByeSlots = 0;
      for (const w of weeks) {
        if (w.wk < curWeek || w.opp == null) continue;
        const cost = starterByeCost(byRoster.get(w.opp), w.wk, pm, lastWeek);
        opponentByeSlots += cost.slots;
        opponentByePts += cost.points;
      }
      const played = weeks.filter(w => w.wk < curWeek && w.pts != null).map(w => w.pts);
      const left = weeks.filter(w => w.wk >= curWeek && w.pts != null).map(w => w.pts);
      const mean = (a) => a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null;
      rows.push({
        rosterId: r.roster_id, team: r.team_name, owner: r.owner_name, isMe: !!r.is_me,
        played: mean(played), remaining: mean(left), all: mean(played.concat(left)),
        weeks, byeWeeks: weeks.filter(w => w.opp == null).length,
        opponentByeSlots, opponentByePts: Math.round(opponentByePts * 10) / 10,
      });
    }
    // Hardest remaining schedule first: that is the actionable end.
    rows.sort((a, b) => (b.remaining ?? -1) - (a.remaining ?? -1));
    rows.forEach((r, i) => { r.rank = i + 1; });
    const out = { rows, lastWeek, curWeek, medianScoring: !!sched.medianScoring };
    _sosCache.set(key, out);
    return out;
  }

  function fantasySosPanel(lg) {
    const d = fantasySos(lg);
    if (!d || !d.rows.length) return null;
    const cap = Math.max(...d.rows.map(r => r.remaining || 0), 1);
    const card = h('div', { class:'card sos-panel' },
      h('div', { class:'card-title' }, 'Schedule difficulty (opponent projected points)'),
      h('p', { class:'tip sos-note' },
        `Average projected points of the managers you still play, weeks ${d.curWeek} to ${d.lastWeek}. `
        + `Each opponent is scored on his own best legal lineup that week, so a week where his players `
        + `are on bye counts as the bench body he would actually start, not as a free win.`
        + ` Opponent bye cost is gross production unavailable from starters on teams you still face, `
        + `charged at each starter's per-game average. LEFT already includes their bench replacements.`
        + (d.medianScoring ? ' This league also scores against the league median, so the opponent is only half of each week.' : '')),
    );
    const list = h('div', { class:'sos-rows' });
    for (const r of d.rows) {
      list.appendChild(h('div', { class:`sos-row${r.isMe ? ' you' : ''}`,
        title: r.weeks.filter(w => w.wk >= d.curWeek && w.pts != null)
                 .map(w => `wk${w.wk} ${w.oppName} ${w.pts}`).join('\n') },
        h('span', { class:'sos-rank tnum' }, `#${r.rank}`),
        h('span', { class:'sos-team' }, r.team, r.isMe ? h('span', { class:'badge you' }, 'YOU') : null),
        h('span', { class:'sos-bar' }, h('i', { style:{ width: Math.round(((r.remaining || 0) / cap) * 100) + '%' } })),
        h('span', { class:'sos-val tnum' }, r.remaining != null ? fmt.decimal(r.remaining, 1) : '·'),
        h('span', { class:'sos-played tnum', title:'Average of the opponents already played' },
          r.played != null ? fmt.decimal(r.played, 1) : '·'),
        h('span', { class:'sos-bye tnum',
                    title: `${r.opponentByeSlots} opposing starter bye${r.opponentByeSlots === 1 ? '' : 's'} ahead, `
                         + `removing about ${fmt.decimal(r.opponentByePts, 0)} gross points before bench replacement` },
          r.opponentByeSlots ? `${fmt.decimal(r.opponentByePts, 0)}` : '·',
          r.opponentByeSlots ? h('span', { class:'sos-bye-n' }, `${r.opponentByeSlots}`) : null),
      ));
    }
    card.appendChild(h('div', { class:'sos-head' },
      h('span', null, ''), h('span', null, ''), h('span', null, ''),
      h('span', { class:'tip' }, 'LEFT'), h('span', { class:'tip' }, 'PLAYED'),
      h('span', { class:'tip' }, 'OPP BYE')));
    card.appendChild(list);
    return card;
  }

  // ============================================================
  // This week's waiver board, with a bid range per candidate
  // ============================================================
  // The archetype tables say what a SITUATION has cost. This says what to bid on
  // the men actually available right now, which is the question you have while the
  // claim window is open.
  //
  // Range uses this league's completed claims for the two profile facts known before
  // a claim: NFL experience and position. Situation needs weekly context.
  function faabLeagueRecord(data, lg) {
    const names = [lg?.short_name, lg?.name]
      .filter(Boolean)
      .map(name => String(name).trim().toLowerCase());
    return Object.entries(data?.leagues || {})
      .find(([name]) => names.includes(String(name).trim().toLowerCase()))?.[1] || null;
  }

  function waiverExperienceProfile(player, pos) {
    if (pos === 'DEF' || pos === 'DST') return 'n/a (team defense)';
    if (player?.exp == null || player.exp === '') return 'unknown';
    const exp = Number(player.exp);
    if (!Number.isFinite(exp)) return 'unknown';
    if (exp <= 0) return 'NFL year 1 (rookie)';
    if (exp <= 2) return 'NFL years 2-3';
    if (exp <= 6) return 'NFL years 4-7';
    return 'NFL years 8+';
  }

  function waiverPositionProfile(pos) {
    return ['LB', 'DB', 'DL', 'S', 'CB', 'DE', 'DT', 'NT'].includes(pos) ? 'IDP'
      : pos === 'DST' ? 'DEF' : pos;
  }

  function waiverProfileLabel(experience, position) {
    const short = experience === 'NFL year 1 (rookie)' ? 'Rookie'
      : experience === 'NFL years 2-3' ? 'Years 2-3'
      : experience === 'NFL years 4-7' ? 'Years 4-7'
      : experience === 'NFL years 8+' ? 'Years 8+'
      : experience === 'n/a (team defense)' ? 'Team defense'
      : 'Experience unknown';
    return position === 'DEF' ? short : `${short} · ${position}`;
  }

  function waiverQuantile(values, q) {
    const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (!sorted.length) return null;
    if (sorted.length === 1) return sorted[0];
    const at = (sorted.length - 1) * q;
    const lo = Math.floor(at), hi = Math.ceil(at);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
  }

  function waiverBidRange(claims, candidate, budget, minSample = 5) {
    if (budget == null || budget < 0 || !claims?.length) return null;
    const usable = claims.filter(c => c.pct != null && Number.isFinite(Number(c.pct)));
    const exact = usable.filter(c => c.position === candidate.position && c.experience === candidate.experience);
    const byPosition = usable.filter(c => c.position === candidate.position);
    const byExperience = usable.filter(c => c.experience === candidate.experience);
    const [sample, source] = exact.length >= minSample ? [exact, candidate.profile]
      : byPosition.length >= minSample ? [byPosition, `${candidate.position} claims`]
      : byExperience.length >= minSample ? [byExperience, `${candidate.experience} claims`]
      : [usable, 'all claims in this league'];
    const pcts = sample.map(c => Number(c.pct)).filter(Number.isFinite);
    const q1 = waiverQuantile(pcts, 0.25), q3 = waiverQuantile(pcts, 0.75);
    if (q1 == null || q3 == null) return null;
    const lo = Math.max(0, Math.round(budget * q1 / 100));
    const hi = Math.max(lo, Math.round(budget * q3 / 100));
    return { lo, hi, q1, q3, n: pcts.length, source, exact: sample === exact };
  }

  function rankWaiverCandidates(cands, targets) {
    const groups = new Map();
    for (const candidate of cands) {
      if (!groups.has(candidate.position)) groups.set(candidate.position, []);
      groups.get(candidate.position).push(candidate);
    }
    for (const [position, rows] of groups) {
      const demand = position === 'IDP'
        ? ['LB', 'DB', 'DL'].reduce((sum, p) => sum + (targets[p] || 0), 0)
        : targets[position] || 1;
      rows.sort((a, b) => (b.sortValue ?? -1) - (a.sortValue ?? -1));
      rows.forEach((candidate, index) => { candidate.waiverPriority = (index + 1) / Math.max(1, demand); });
    }
    return cands.slice().sort((a, b) => a.waiverPriority - b.waiverPriority
      || (b.sortValue ?? -1) - (a.sortValue ?? -1));
  }

  function leagueRosteredIds(lg) {
    const rostered = new Set();
    for (const roster of (lg?.rosters || [])) {
      for (const pid of [...(roster.players || []), ...(roster.taxi || []),
                         ...(roster.reserve || []), ...(roster.starters || [])]) {
        rostered.add(String(pid));
      }
    }
    return rostered;
  }

  function waiverBoard(lg) {
    const wr = window.WEEKLY_RANKINGS;
    const data = window.FAAB_ARCHETYPES;
    if (!wr || !lg) return null;
    const week = wr.currentWeek || 1;

    // Sleeper normally includes taxi and reserve in players, but treating that as
    // a guarantee can surface a stashed player after a partial export.
    const rostered = leagueRosteredIds(lg);

    // Projected free agents, scored in THIS league's currency.
    // Only positions this league actually starts. K and DEF were hardcoded into the
    // allowed set, so a league with no kicker or defense slot still listed every
    // free kicker and team defense, which is most of the board's clutter.
    // targetStartersByPos returns K and DEF only when roster_positions holds them.
    const targets = targetStartersByPos(lg);
    const startable = new Set(Object.entries(targets)
      .filter(([, n]) => (n || 0) > 0)
      .map(([pos]) => pos));
    // IDP leagues start LB/DB/DL, which the target map already covers, but the
    // weekly board labels some of them with their NFL position instead.
    if (lg.is_idp) for (const p of ['LB', 'DB', 'DL', 'S', 'CB', 'DE', 'DT', 'NT']) startable.add(p);
    const dynasty = isDynastyLeague(lg);
    const rankings = dynasty ? rankIndex() : null;
    const cands = [];
    for (const row of (wr.players || [])) {
      const pid = String(row.id);
      if (rostered.has(pid)) continue;
      const sp = window.PLAYERS?.[pid];
      if (!sp) continue;
      if (!startable.has(row.pos)) continue;
      const ros = rosPointsByPid(lg).get(pid)?.pts;
      if (ros == null) continue;
      const wkProj = (row.vegas != null) ? row.vegas : (row.sleeper || [])[week - 1];
      const experience = waiverExperienceProfile(sp, row.pos);
      const position = waiverPositionProfile(row.pos);
      const ranked = rankings?.bySleeperId.get(pid);
      const market = ranked ? tierValue(ranked, lg) : null;
      const vor = dynasty ? null : signedVor({ _sleeperId: pid, pos: row.pos }, lg);
      cands.push({
        pid, name: row.name, pos: row.pos, team: row.team,
        ros, wk: wkProj,
        vor, market,
        sortValue: dynasty ? (market ?? ros) : ros,
        experience, position,
        profile: waiverProfileLabel(experience, position),
        injury: sp.injury_status || null,
      });
    }
    if (!cands.length) return null;
    const top = rankWaiverCandidates(cands, targets).slice(0, 12);

    // This league's own bid ladder. No format-wide fallback: local bidding habits
    // are the useful signal, and pretending a blended market is local is worse
    // than showing no range.
    const lgName = String(lg.short_name || lg.name || '').trim();
    const lgRec = faabLeagueRecord(data, lg);
    const budget = lg?.waiver_budget ?? lg?.settings?.waiver_budget ?? lgRec?.budget ?? null;   // live league value first, research record last
    const mine = (lg.rosters || []).find(r => r.is_me);
    const used = mine?.settings?.waiver_budget_used ?? mine?.waiver_budget_used ?? null;
    const left = (budget != null && used != null) ? budget - used : null;
    const claims = lgRec?.claims || [];
    const hasBidHistory = claims.length > 0 && budget != null;
    // Free agents in a deep dynasty league are mostly unranked, so the Value
    // column can be a stack of dots. Hide it rather than drop it: the phone
    // rules address these columns by position.
    const hideComparison = top.every(c => (dynasty ? c.market : c.vor) == null) ? { display: 'none' } : null;

    const card = h('div', { class: 'card waiver-card' },
      h('div', { class: 'card-title' }, `Week ${week} waiver board`),
      h('p', { class: 'tip faab-note' },
        left != null
          ? `You have $${faabMoney(left)} of $${faabMoney(budget)} left. `
          : '',
        hasBidHistory
          ? `Bid range is the middle half of this league's completed claims, including $0 adds, for the player's experience and position profile. `
            + `Profiles under 5 claims fall back to position, then experience, then this league's full history. `
          : 'No priced-claim history for this league, so no bid range is shown. ',
        'Profile uses NFL experience and position, the two dimensions knowable before a claim.'));

    const head = h('thead', null, h('tr', null,
      h('th', null, '#'),
      h('th', null, 'Player'),
      h('th', null, 'Pos'),
      h('th', { class: 'wb-profile-head' }, 'Profile'),
      h('th', { class: 'right', title: 'Projected points, rest of season' }, 'ROS'),
      h('th', { class: 'right', title: `Projected points, week ${week}` }, 'Wk'),
      h('th', { class: 'right', style: hideComparison, title: dynasty
        ? 'League-adjusted dynasty market value on the 0 to 110 scale'
        : 'Rest-of-season points above the last league-wide starter at the position' }, dynasty ? 'Value' : 'VOR'),
      hasBidHistory ? h('th', { class: 'right', title: 'Suggested bid range from this league\'s matching historical claims' }, 'Bid') : null));

    const body = h('tbody', null, ...top.map((c, i) => {
      const b = waiverBidRange(claims, c, budget);
      const overBudget = b && left != null && b.hi > left;
      const comparison = dynasty ? c.market : c.vor;
      return h('tr', { class: 'clickable', 'data-player-id': c.pid, 'data-position': c.pos,
        onclick: () => openPlayerDetail(c.name, c.pid) },
        h('td', { class: 'sr-slot' }, `${i + 1}`),
        h('td', { class: 'sr-name' },
          h('span', { class:'wb-player-line' },
            h('span', { class:'wb-player-name' }, c.name),
            c.injury ? injuryChip(c.pid) : null),
          h('span', { class:'wb-profile-mobile' }, c.profile,
            b ? h('span', { class:'wb-profile-mobile-sample' },
              `${b.exact ? 'exact profile' : b.source}, n=${b.n}`) : null)),
        h('td', { class: 'sr-pos' }, posChip(c.pos)),
        h('td', { class: 'wb-profile', title: `${c.experience}; ${c.position}` }, c.profile,
          b ? h('span', { class: 'wb-profile-sample' },
            `${b.exact ? 'exact profile' : b.source}, n=${b.n}`) : null),
        h('td', { class: 'sr-num tnum' }, fmt.decimal(c.ros, 0)),
        h('td', { class: 'sr-num tnum' }, c.wk != null ? fmt.decimal(c.wk, 1) : '·'),
        h('td', { class: 'sr-num sr-vor tnum' + (comparison != null && comparison < 0 ? ' neg' : ''), style: hideComparison },
          comparison != null ? `${!dynasty && comparison > 0 ? '+' : ''}${fmt.decimal(comparison, 0)}` : '·'),
        hasBidHistory ? h('td', { class: 'sr-num wb-bid tnum' + (overBudget ? ' over' : ''),
                           title: b ? `${b.source}, n=${b.n}; middle half ${b.q1.toFixed(1)}% to ${b.q3.toFixed(1)}% of budget${overBudget ? '. Range exceeds what you have left.' : ''}` : '' },
          b ? `$${b.lo}-${b.hi}` : '·') : null);
    }));

    card.appendChild(h('table', { class: 'data slot-table waiver-table' }, head, body));
    return card;
  }

  function faabPanel(lg) {
    const data = window.FAAB_ARCHETYPES;
    if (!data || !data.formats) return null;
    const fmt = isDynastyLeague(lg) ? 'dynasty' : 'redraft';

    // Per league where the league is known, because budgets run 201, 200, 150 and
    // 100 and a dollar does not mean the same thing in two of them: yuH's median
    // claim is 10.3% of its budget against 4.5% in Password is taco.
    const lgName = lg ? String(lg.short_name || lg.name || '').trim() : '';
    const lgRec = faabLeagueRecord(data, lg);
    const dims = lgRec?.dims || null;
    if (!dims) return null;
    const labels = data.dimLabels || {};
    const DIM_ORDER = ['situation', 'position', 'experience'];
    const live = DIM_ORDER.filter(k => (dims[k] || []).length);
    if (!live.length) return null;

    // Live budget state. Sleeper reports waiver_budget_used per roster against the
    // league budget, so what is LEFT is knowable and is the number that actually
    // decides a bid. Absent on ESPN leagues, which are not on this API.
    const budget = lg?.waiver_budget ?? lg?.settings?.waiver_budget ?? lgRec?.budget ?? null;   // live league value first, research record last
    const spendRows = (lg?.rosters || [])
      .map(r => ({ team: r.team_name, isMe: !!r.is_me,
                   used: r.settings?.waiver_budget_used ?? r.waiver_budget_used ?? null }))
      .filter(r => r.used != null);
    const mine = spendRows.find(r => r.isMe);

    const card = h('div', { class: 'card faab-panel' },
      h('div', { class: 'card-title' }, 'What a waiver claim costs',
        h('span', { class: 'faab-scope' }, lgName)));

    // Your own money first, then the two facts that frame every bid.
    const kpis = h('div', { class: 'faab-kpis' });
    if (budget && mine) {
      const left = budget - mine.used;
      kpis.appendChild(h('div', { class: 'faab-kpi' },
        h('div', { class: 'faab-kpi-num tnum' }, `$${faabMoney(left)}`),
        h('div', { class: 'faab-kpi-lab' }, 'your budget left'),
        h('div', { class: 'faab-kpi-sub' }, `of $${faabMoney(budget)}, spent $${faabMoney(mine.used)}`)));
    }
    if (lgRec) {
      const freePct = Math.round(lgRec.zeroDollar / (lgRec.zeroDollar + lgRec.priced) * 100);
      kpis.appendChild(h('div', { class: 'faab-kpi' },
        h('div', { class: 'faab-kpi-num tnum' }, `$${faabMoney(lgRec.medianBid)}`),
        h('div', { class: 'faab-kpi-lab' }, 'median claim here'),
        h('div', { class: 'faab-kpi-sub' }, `${lgRec.medianPct}% of budget, max $${faabMoney(lgRec.maxBid)}`)));
      kpis.appendChild(h('div', { class: 'faab-kpi' },
        h('div', { class: 'faab-kpi-num tnum' }, `${freePct}%`),
        h('div', { class: 'faab-kpi-lab' }, 'claims cost nothing'),
        h('div', { class: 'faab-kpi-sub' }, `${lgRec.priced} priced, ${lgRec.zeroDollar} free`)));
    }
    const pricedClaims = (lgRec.claims || []).filter(c => (c.bid || 0) > 0);
    const offseasonPct = pricedClaims.length
      ? Math.round(pricedClaims.filter(c => c.phase === 'offseason' || c.phase === 'preseason').length / pricedClaims.length * 100)
      : null;
    if (offseasonPct != null && fmt === 'dynasty') {
      kpis.appendChild(h('div', { class: 'faab-kpi' },
        h('div', { class: 'faab-kpi-num tnum' }, `${offseasonPct}%`),
        h('div', { class: 'faab-kpi-lab' }, 'spent in the offseason'),
        h('div', { class: 'faab-kpi-sub' }, 'dynasty buys next year, redraft buys Sunday')));
    }
    if (kpis.children.length) card.appendChild(kpis);

    card.appendChild(h('p', { class: 'tip faab-note' },
      'The market pays for news, not for role: a visible event costs about twice what an '
      + 'existing full-time job costs. Box spans the middle half of bids, the line is the '
      + 'median, the whisker reaches the most anyone paid.'));

    // Only decision-time dimensions: situation, position, and NFL experience.
    const host = h('div', { class: 'faab-host' });
    const bar = h('div', { class: 'tab-bar faab-tabs', role: 'tablist' });
    let activeDim = live[0];
    const draw = () => {
      host.innerHTML = '';
      const rows = dims[activeDim] || [];
      const cap = Math.max(...rows.map(r => r.max || r.q3 || 0), 1);
      const pct = (v) => Math.max(0, Math.min(100, ((v || 0) / cap) * 100));
      host.appendChild(h('div', { class: 'faab-head' },
        h('span', null, ''), h('span', null, ''),
        h('span', { class: 'tip' }, 'MEDIAN'),
        h('span', { class: 'tip', title: 'The middle half of claims here: a quarter went cheaper, a quarter dearer' }, 'RANGE'),
        h('span', { class: 'tip' }, 'OF BUDGET'),
        h('span', { class: 'tip' }, 'CLAIMS')));
      const list = h('div', { class: 'faab-rows' });
      for (const r of rows) {
        const boxL = pct(r.q1), boxR = pct(r.q3);
        const claims = (lgRec.claims || []).filter(c => (c.bid || 0) > 0 && c[activeDim] === r.situation);
        const detail = h('details', { class: 'faab-history' });
        detail.appendChild(h('summary', {
          class: `faab-row${r.thin ? ' is-thin' : ''}`,
          title: `${r.situation}: n=${r.n}, median $${r.median}`
               + (r.medianPct != null ? ` (${r.medianPct}% of budget)` : '')
               + `, middle half $${r.q1} to $${r.q3}, max $${r.max}`
               + (r.zeroShare != null ? `, ${r.zeroShare}% of claims here went for $0` : '')
               + (r.thin ? `. Under ${data.thinN} claims, so read it as a hint not a rate.` : ''),
        },
          h('span', { class: 'faab-name' }, r.situation),
          h('span', { class: 'faab-plot' },
            h('i', { class: 'faab-whisker', style: { left: pct(r.min) + '%',
                     width: Math.max(1, pct(r.max) - pct(r.min)) + '%' } }),
            h('i', { class: 'faab-box', style: { left: boxL + '%', width: Math.max(2, boxR - boxL) + '%' } }),
            h('i', { class: 'faab-median', style: { left: pct(r.median) + '%' } })),
          h('span', { class: 'faab-med tnum' }, `$${faabMoney(r.median)}`),
          // What to actually bid: the middle half of what this bucket has cost here,
          // which is the box in the plot to its left put in dollars.
          h('span', { class: 'faab-range tnum' }, `$${faabMoney(r.q1)}-${faabMoney(r.q3)}`),
          h('span', { class: 'faab-pct tnum' }, r.medianPct != null ? `${r.medianPct}%` : ''),
          h('span', { class: 'faab-n tnum' }, `n=${r.n}`)));
        const historyRows = claims.map(c => h('tr', null,
          h('td', null, h('span', { class:'name' }, c.player),
            c.team ? h('span', { class:'muted' }, ` · ${c.team}`) : null),
          h('td', { class:'tnum' }, `${c.season} W${c.week}`),
          h('td', { class:'faab-claim-profile' },
            [c.experience, c.situation, c.position].filter(Boolean).join(' · ')),
          h('td', { class:'right tnum' }, `$${faabMoney(c.bid)}`,
            c.pct != null ? h('span', { class:'muted' }, ` · ${c.pct}%`) : null)));
        const historyTable = h('table', { class: 'data faab-history-table' },
          h('thead', null, h('tr', null,
            h('th', null, 'Player'), h('th', null, 'When'), h('th', null, 'Claim context'),
            h('th', { class:'right' }, 'Bid'))),
          h('tbody', null, ...historyRows));
        detail.appendChild(h('div', { class: 'faab-history-scroll' }, historyTable));
        list.appendChild(detail);
      }
      host.appendChild(list);
      for (const b of bar.children) b.classList.toggle('active', b.dataset.dim === activeDim);
    };
    for (const k of live) {
      bar.appendChild(h('button', { class: 'tab', type: 'button', dataset: { dim: k },
        onclick: () => { activeDim = k; draw(); } },
        h('span', { class: 'tab-label' }, labels[k] || k),
        h('span', { class: 'tab-count tnum' }, String((dims[k] || []).length))));
    }
    if (live.length > 1) card.appendChild(bar);
    card.appendChild(host);
    draw();

    // Who else has money. A rival with nothing left cannot outbid you, which is the
    // most actionable fact here and was shown nowhere before.
    if (budget && spendRows.length > 1) {
      const byLeft = spendRows.slice().sort((a, b) => (budget - b.used) - (budget - a.used));
      const broke = byLeft.filter(r => budget - r.used <= budget * 0.1).length;
      card.appendChild(h('details', { class: 'faab-rivals' },
        h('summary', null, 'Who still has money',
          h('span', { class: 'faab-sum-note' }, `${broke} of ${byLeft.length} under 10% left`)),
        h('div', { class: 'faab-rival-rows' }, ...byLeft.map(r => h('div',
          { class: `faab-rival${r.isMe ? ' you' : ''}` },
          h('span', { class: 'faab-rival-team' }, r.team,
            r.isMe ? h('span', { class: 'badge you' }, 'YOU') : null),
          h('span', { class: 'faab-rival-bar' },
            h('i', { style: { width: Math.max(1, ((budget - r.used) / budget) * 100) + '%' } })),
          h('span', { class: 'faab-rival-val tnum' }, `$${faabMoney(budget - r.used)}`))))));
    }

    return card;
  }

  // Money reads better without a trailing .0 on a whole dollar.
  function faabMoney(v) {
    if (v == null) return '·';
    return Number.isInteger(Number(v)) ? String(Number(v)) : fmt.decimal(v, 1);
  }

  function tradePartnersStrip(lg) {
    // Trade history is read from Sleeper; an ESPN league id is not a Sleeper one,
    // and asking for it logged a 404 on every Washington load.
    if (lg.platform === 'espn') return h('div', { class:'card trade-partners' },
      h('div', { class:'card-title' }, 'Who you trade with'),
      h('div', { class:'tip' }, 'Trade history comes from Sleeper, and this is an ESPN league.'));
    const wrap = h('div', { class:'card trade-partners' },
      h('div', { class:'card-title' }, 'Who you trade with'),
      h('div', { class:'tip' }, 'Reading every season of this league from Sleeper...'));
    tradePartnerHistory(lg).then((data) => {
      wrap.innerHTML = '';
      wrap.appendChild(h('div', { class:'card-title' }, 'Who you trade with'));
      if (!data.partners.length) {
        wrap.appendChild(h('div', { class:'tip' },
          `No completed trades of yours in ${data.seasons.length} season(s) of this league.`));
        return;
      }
      const top = data.partners[0].n;
      const assets = (ids, picks) => [
        ...(ids || []).map(id => window.PLAYERS?.[id]?.name || `#${id}`),
        ...(picks || []).map(pick => historicalPickLabel(pick)),
      ].join(', ') || 'Nothing listed';
      wrap.appendChild(h('div', { class:'partner-rows' }, ...data.partners.slice(0, 8).map(p => {
        const roster = (lg.rosters || []).find(r => String(r.owner_id) === String(p.uid));
        const details = h('details', { class:'partner-history' });
        details.appendChild(h('summary', { class:'partner-row', title:`Show ${p.name} trade history` },
          h('span', { class:'partner-name' },
            h('span', null, p.name),
            p.username && p.username.toLowerCase() !== p.name.toLowerCase()
              ? h('span', { class:'partner-username' }, `@${p.username.replace(/^@/, '')}`)
              : null,
            roster ? null : h('span', { class:'tip' }, ' (gone)')),
          h('span', { class:'seg-meter partner-meter', style:{ width:'92px' } },
            h('i', { style:{ width:`${Math.round((p.n / top) * 100)}%` } })),
          h('span', { class:'tnum partner-n' }, `${p.n}`),
          h('span', { class:'tip partner-seasons' }, p.seasons.slice().sort().join(', ')),
        ));
        const history = h('div', { class:'partner-history-body' });
        if (roster) history.appendChild(h('button', { type:'button', class:'ghost partner-load',
          onclick: () => { location.hash = `#trade/${lg.id}/${roster.roster_id}`; }
        }, `Load ${p.name} in calculator`));
        for (const t of p.trades || []) {
          const date = t.at ? new Date(t.at).toLocaleDateString('en-US', { month:'short', day:'numeric' }) : '';
          history.appendChild(h('div', { class:'partner-trade' },
            h('div', { class:'partner-trade-when' }, [t.season, t.week ? `W${t.week}` : '', date].filter(Boolean).join(' · ')),
            h('div', null, h('b', null, 'You got: '), assets(t.got, t.gotPicks)),
            h('div', null, h('b', null, 'You sent: '), assets(t.sent, t.sentPicks)),
          ));
        }
        if (!(p.trades || []).length) history.appendChild(h('div', { class:'tip' }, 'No transaction details available.'));
        details.appendChild(history);
        return details;
      })));
      wrap.appendChild(h('div', { class:'tip' },
        `${data.partners.reduce((s, p) => s + p.n, 0)} completed trades across ${data.seasons.join(', ')}.`));
    });
    return wrap;
  }

  function viewTrade(leagueIdArg, partnerRosterArg) {
    const main = $('#main');
    main.innerHTML = '';
    KT.reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const myLeagues = (window.LEAGUES || []).filter(l => l.rosters.some(r => r.is_me));
    if (!TRADE_STATE.leagueId) TRADE_STATE.leagueId = leagueIdArg || (myLeagues[0]?.id);
    if (leagueIdArg && leagueIdArg !== TRADE_STATE.leagueId) {
      TRADE_STATE.leagueId = leagueIdArg;
      TRADE_STATE.sideA = { rosterId: null, picks: new Set() };
      TRADE_STATE.sideB = { rosterId: null, picks: new Set() };
    }
    const lg = (window.LEAGUES || []).find(l => l.id === TRADE_STATE.leagueId);
    if (!lg) { main.appendChild(h('div', { class:'empty' }, 'No league selected.')); return; }
    if (!TRADE_STATE.sideA.rosterId) TRADE_STATE.sideA.rosterId = (lg.rosters.find(r => r.is_me) || lg.rosters[0]).roster_id;
    if (!TRADE_STATE.sideB.rosterId) TRADE_STATE.sideB.rosterId = (lg.rosters.find(r => !r.is_me) || lg.rosters[1]).roster_id;
    // #trade/<league>/<rosterId> opens straight onto that partner.
    const wantPartner = partnerRosterArg != null ? parseInt(partnerRosterArg, 10) : null;
    if (wantPartner && lg.rosters.some(r => r.roster_id === wantPartner) && TRADE_STATE.sideB.rosterId !== wantPartner) {
      TRADE_STATE.sideB = { rosterId: wantPartner, picks: new Set() };
    }
    if (TRADE_STATE.sideA.rosterId === TRADE_STATE.sideB.rosterId) {
      TRADE_STATE.sideB = { rosterId: lg.rosters.find(r => r.roster_id !== TRADE_STATE.sideA.rosterId)?.roster_id, picks: new Set() };
    }

    main.appendChild(breadcrumbs([
      { label:'Tools' },
      { label: lg.short_name || lg.name, hash:`#league/${lg.id}` },
      { label: 'Trade Lab' },
    ]));
    main.appendChild(h('div', { class:'page-header' },
      h('div', null,
        h('div', { class:'page-eyebrow' }, 'TRADE LAB'),
        h('h1', { class:'page-title' }, 'Trade Calculator'),
        h('p', { class:'page-sub' }, isDynastyLeague(lg)
          ? 'Click players or picks to add to the pile. Fairness verdict updates live as you build the offer.'
          : 'Click players to add to the pile. The verdict follows both starting lineups and updates live as you build the offer.')
      ),
      h('div', { class:'page-actions' },
        leagueSelector(lg.id, (newId) => { TRADE_STATE.leagueId = newId; TRADE_STATE.sideA = {rosterId:null, picks:new Set()}; TRADE_STATE.sideB = {rosterId:null, picks:new Set()}; viewTrade(newId); navigate(`#trade/${newId}`); })
      )
    ));

    const sideARoster = lg.rosters.find(r => r.roster_id === TRADE_STATE.sideA.rosterId);
    const sideBRoster = lg.rosters.find(r => r.roster_id === TRADE_STATE.sideB.rosterId);

    // Refs we'll mutate after initial render.
    const refs = { lg, A:{}, B:{}, middle:null };
    TRADE_STATE._refs = refs;

    const grid = h('div', { class:'trade-calc' });
    grid.appendChild(buildTradeSide('A', lg, TRADE_STATE.sideA, sideARoster, refs));
    refs.middle = tradeMiddleSummary(lg);
    grid.appendChild(refs.middle.node);
    grid.appendChild(buildTradeSide('B', lg, TRADE_STATE.sideB, sideBRoster, refs));
    main.appendChild(tradePartnersStrip(lg));
    main.appendChild(buildTradeSearch(lg));
    main.appendChild(grid);

    main.appendChild(h('div', { class:'tip', style:{ marginTop:'12px' } },
      'Drag a row to its trade pile. Drop on the middle summary to wipe. Or click a row to toggle.'
    ));

    // Auto-proposed fair swaps, then league-wide positional needs.
    main.appendChild(buildTradeFinder(lg));
    main.appendChild(buildTeamNeeds(lg));

    // Initial paint of middle (committed totals).
    KT.refreshMiddle(lg);
  }

  // League-wide positional needs, quality-weighted: each team's top starters at
  // a position (blended KTC value via tierValue) vs its starter slots. Rendered
  // at the bottom of the Trade Lab. Offense only, ranking sources don't cover
  // IDP. Rows sorted by TE need (neediest first) to answer "who needs a TE?".
  function buildTeamNeeds(lg) {
    const idx = rankIndex();
    const targets = targetStartersByPos(lg);
    const POS = ['QB', 'RB', 'WR', 'TE'];
    const starterN = {};
    for (const p of POS) starterN[p] = Math.max(1, Math.round(targets[p] || 1));
    // Redraft: value and rank on rest-of-season points, ties (every body below
    // the best free one is 0) broken on points, not roster order.
    const dyn = isDynastyLeague(lg);

    const teams = lg.rosters.map(r => {
      const byPos = { QB: [], RB: [], WR: [], TE: [] };
      for (const pid of (r.players || [])) {
        const sp = window.PLAYERS[pid]; if (!sp) continue;
        const ranked = idx.bySleeperId.get(pid) || idx.byName.get(norm(sp.name));
        if (!ranked) continue;
        const pos = ranked.pos || sp.pos;
        if (!byPos[pos]) continue;
        byPos[pos].push({ name: sp.name, pid, age: sp.age, value: playerValue(pid, lg),
          pts: dyn ? 0 : (rosPointsByPid(lg).get(String(pid))?.pts || 0),
          posRank: dyn ? (ranked.ktcPosRank || ranked._posRank || null) : rosPosRank(pid, lg) });
      }
      const posVal = {}, posTop = {}, posPts = {};
      for (const p of POS) {
        byPos[p].sort((a, b) => b.value - a.value || b.pts - a.pts);
        posVal[p] = byPos[p].slice(0, starterN[p]).reduce((s, x) => s + x.value, 0);
        posPts[p] = byPos[p].slice(0, starterN[p]).reduce((s, x) => s + x.pts, 0);
        posTop[p] = byPos[p][0] || null;
      }
      return { r, posVal, posTop, posPts };
    });

    // Rank each position across teams (ascending value = neediest first).
    const n = teams.length;
    const label = {};
    for (const p of POS) {
      const order = teams.map((t, i) => ({ i, v: t.posVal[p], pts: t.posPts[p] })).sort((a, b) => a.v - b.v || a.pts - b.pts);
      order.forEach((o, rank) => {
        const frac = n > 1 ? rank / (n - 1) : 1;
        let cls = 'ok', txt = 'OK';
        if (frac < 0.20) { cls = 'need'; txt = 'NEED'; }
        else if (frac < 0.45) { cls = 'thin'; txt = 'THIN'; }
        else if (frac >= 0.80) { cls = 'strong'; txt = 'STRONG'; }
        (label[o.i] = label[o.i] || {})[p] = { frac, cls, txt };
      });
    }
    const COLOR = { need: 'var(--red)', thin: 'var(--amber)', ok: 'var(--fg-2)', strong: 'var(--green)' };

    teams.forEach((t, i) => {
      let worst = null;
      for (const p of POS) { const l = label[i][p]; if (!worst || l.frac < worst.frac) worst = { p, ...l }; }
      t.topNeed = worst;
    });

    // Biggest TE need = lowest best-TE value; also drives row order.
    const teByBest = teams.map((t, i) => ({ i, best: t.posTop.TE }))
      .sort((a, b) => (a.best?.value || 0) - (b.best?.value || 0) || (a.best?.pts || 0) - (b.best?.pts || 0));
    const neediest = teByBest[0];

    const posCell = (i, p) => {
      const t = teams[i], l = label[i][p], top = t.posTop[p];
      return h('td', { style: { textAlign: 'center' } },
        h('div', { style: { fontWeight: 600 } }, fmt.decimal(t.posVal[p], 0)),
        h('div', { style: { fontSize: '11px', color: COLOR[l.cls], fontWeight: 700, letterSpacing: '.03em' } }, l.txt),
        top ? h('div', { class: 'muted', style: { fontSize: '10px' } }, `${top.name}${top.posRank ? ` · ${p}${top.posRank}` : ''}`)
            : h('div', { class: 'muted', style: { fontSize: '10px' } }, '·')
      );
    };

    const wrap = h('div', { style: { marginTop: '26px' } });
    wrap.appendChild(h('div', { class: 'page-eyebrow' }, 'TEAM NEEDS'));
    wrap.appendChild(h('h2', { class: 'page-title', style: { fontSize: '20px', margin: '2px 0 6px' } }, 'Roster Needs by Position'));
    wrap.appendChild(h('p', { class: 'page-sub', style: { marginBottom: '12px' } },
      'Quality-weighted: each cell is the blended value of a team’s top starters at that spot vs its league slots. Red = biggest gap, sorted by TE need. Offense only (IDP not ranked).'));

    if (neediest && neediest.best) {
      const t = teams[neediest.i];
      wrap.appendChild(h('div', { style: { marginBottom: '12px', padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'color-mix(in oklab, var(--red) 9%, var(--bg-1))', border: '1px solid color-mix(in oklab, var(--red) 38%, var(--border))' } },
        h('strong', null, 'Biggest TE need: '),
        h('span', null, `${t.r.team_name}: best TE ${neediest.best.name}${neediest.best.posRank ? ` (TE${neediest.best.posRank})` : ''}, value ${fmt.decimal(neediest.best.value, 0)}.`)
      ));
    }

    const tableWrap = h('div', { class: 'card', style: { padding: 0, overflowX: 'auto' } });
    tableWrap.appendChild(h('table', { class: 'data snug' },
      h('thead', null, h('tr', null,
        h('th', null, 'Team'),
        ...POS.map(p => h('th', { style: { textAlign: 'center' } }, p)),
        h('th', null, 'Top Need'),
      )),
      h('tbody', null, ...teByBest.map(({ i }) => {
        const t = teams[i];
        return h('tr', { style: { background: t.r.is_me ? 'color-mix(in oklab, var(--accent) 8%, transparent)' : 'transparent' } },
          h('td', null, h('div', { class: 'name-cell' },
            h('span', { class: 'name' }, t.r.team_name),
            t.r.is_me ? h('span', { class: 'badge you', style: { marginLeft: '6px' } }, 'YOU') : null,
          )),
          ...POS.map(p => posCell(i, p)),
          h('td', null, h('span', { style: { color: COLOR[t.topNeed.cls], fontWeight: 700 } }, `${t.topNeed.p} · ${t.topNeed.txt}`)),
        );
      }))
    ));
    wrap.appendChild(tableWrap);
    return wrap;
  }

  // Trade value of one player. Redraft prices the pid's own rest-of-season line,
  // so a kicker, a defense, or a ranking entry that lost its Sleeper id (DJ
  // Moore) still prices instead of reading 0. Dynasty goes through the ranking.
  function playerValue(pid, lg) {
    if (!isDynastyLeague(lg)) return tierValue({ _sleeperId: String(pid) }, lg);
    const sleeper = window.PLAYERS[pid]; if (!sleeper) return 0;
    const r = rankIndex().bySleeperId.get(pid) || rankIndex().byName.get(norm(sleeper.name));
    return r ? tierValue(r, lg) : 0;
  }

  // Value of a single asset (player or pick) on a trade side.
  KT.assetValue = function(k, lg) {
    if (isPickKey(k)) {
      const { season, round, originRosterId } = parsePickKey(k);
      return pickValue(season, round, originRosterId, lg);
    }
    return playerValue(k, lg);
  };

  // Compute total value for a side (used by both committed math and preview).
  KT.valOf = function(state, lg) {
    return Array.from(state.picks).reduce((s, k) => s + KT.assetValue(k, lg), 0);
  };

  // Headliner = the single biggest asset on a side. Anchors the deal per the
  // house rule; a pile of lesser pieces that "sums to" it does not substitute.
  KT.headlinerOf = function(state, lg) {
    let max = 0;
    for (const k of state.picks) { const v = KT.assetValue(k, lg); if (v > max) max = v; }
    return max;
  };

  // Consolidation premium (KTC's "Value Adjustment"). The side surrendering the
  // bigger single asset is giving up concentrated, scarcer value than a spread of
  // lesser pieces the other side uses to "sum to" it, so a raw-even swap actually
  // favors whoever RECEIVES the headliner. We boost the headliner-giver's sent
  // value: documented rule is pay ~110-115% for a single tier-up player, so the
  // extra is 10-15% (ceiling below). Zero for a true 1-for-1, no consolidation.
  // Pure function of counts + headliners so it unit-tests without the DOM.
  function consolidationPremium(aSize, bSize, aHead, bHead) {
    if (!aSize || !bSize || aHead <= 0 || bHead <= 0) return { side: null, pct: 0 };
    const aBigger = aHead >= bHead;
    const hiHead = aBigger ? aHead : bHead;
    const loHead = aBigger ? bHead : aHead;
    const hiSize = aBigger ? aSize : bSize;   // headliner side piece count
    const loSize = aBigger ? bSize : aSize;   // pile side piece count
    const gap    = 1 - loHead / hiHead;        // 0 when headliners equal
    const extra  = Math.max(0, loSize - hiSize); // extra pieces the pile spreads over
    const spread = Math.min(1, extra / 3);     // full weight at 3+ extra pieces
    const pct    = 0.15 * gap * spread;        // ceiling = documented 15% premium
    return { side: pct > 0 ? (aBigger ? 'A' : 'B') : null, pct };
  }
  KT.consolidationPremium = consolidationPremium;

  KT.computeFairness = function(aVal, bVal, aSize, bSize, aHead, bHead) {
    if (!aSize || !bSize) return { label:'INCOMPLETE', color:'var(--fg-3)', pct: 0, premium: null };
    const prem = consolidationPremium(aSize, bSize, aHead || 0, bHead || 0);
    // Boost the SENT value of the side that gave up the bigger headliner.
    let adjA = aVal, adjB = bVal;
    if (prem.side === 'A') adjA = aVal * (1 + prem.pct);
    else if (prem.side === 'B') adjB = bVal * (1 + prem.pct);
    // Two worthless sides are even, not a 0% win for B.
    const hi = Math.max(adjA, adjB);
    const fairness = hi > 0 ? (Math.min(adjA, adjB) / Math.max(hi, 1)) * 100 : 100;
    const delta = adjB - adjA;
    const verdict = fairness >= 90 ? { label:'FAIR', color:'var(--green)' }
                  : fairness >= 75 ? { label:'CLOSE', color:'var(--amber)' }
                  : { label: delta > 0 ? 'WIN FOR A' : 'WIN FOR B', color:'var(--red)' };
    return { ...verdict, pct: fairness, premium: prem.side ? prem : null };
  };

  // Redraft verdict. Summed value cannot see a lineup: it called a trade that
  // left Side A with no QB a win for A. This reads each side's starting-lineup
  // change (tradeLineupImpact) and, once run, the 2026 title odds, which say who
  // WINS. Both read the same weekly rest-of-season lines and the same waiver
  // wire, so running the odds adds the title math, never a second projection. A
  // side left with a slot not even a free agent can fill loses outright. Title
  // odds count only when a change clears its noise band; then they set the
  // direction, and the lineup can only sharpen a verdict it agrees with, because
  // a weak team's title odds compress (5% has little left to lose).
  // `title` = { a, b, sigA, sigB }, percentage points.
  KT.redraftVerdict = function(aSize, bSize, impA, impB, title) {
    if (!aSize || !bSize || !impA || !impB) return { label:'INCOMPLETE', color:'var(--fg-3)', pct: 0, premium: null, note: '' };
    // Every lineup reads 0 without the weekly lines, which used to print FAIR.
    if (!rosPointsByPid().size) return { label:'INCOMPLETE', color:'var(--fg-3)', pct: 0, premium: null, note: 'Weekly projections did not load. Reload the page.' };
    const holeA = impA.emptied > 0, holeB = impB.emptied > 0;
    if (holeA !== holeB) {
      return { label: holeA ? 'WIN FOR B' : 'WIN FOR A', color:'var(--red)', pct: 0, premium: null,
        note: `Side ${holeA ? 'A' : 'B'} is left with an empty starting slot.` };
    }
    const read = (edge, [fair, close], what) => ({ edge, what, grade: Math.abs(edge) <= fair ? 0 : Math.abs(edge) <= close ? 1 : 2 });
    const line = read((impA.delta - impB.delta) / 2, SIM.verdictLineupPts, (m) => `Lineup edge ${Math.round(m)} pts`);
    let pick = line;
    if (title && (title.sigA || title.sigB)) {
      const odds = read((title.a - title.b) / 2, SIM.verdictTitlePp, (m) => `${CURRENT_SEASON} title odds edge ${m.toFixed(1)} pts`);
      if (Math.sign(odds.edge) !== Math.sign(line.edge) || odds.grade >= line.grade) pick = odds;
    }
    const side = pick.edge > 0 ? 'A' : 'B', what = pick.what(Math.abs(pick.edge));
    const verdict = [{ label:'FAIR', color:'var(--green)' }, { label:'CLOSE', color:'var(--amber)' },
      { label:`WIN FOR ${side}`, color:'var(--red)' }][pick.grade];
    return { ...verdict, pct: 0, premium: null, note: pick.grade ? `${what} to Side ${side}` : `${what}, even` };
  };

  KT.refreshMiddle = function(lg, previewSide, previewKey, previewMode) {
    const refs = TRADE_STATE._refs; if (!refs || !refs.middle) return;
    // Optionally apply a preview override: pretend `previewKey` is added/removed
    // from `previewSide`'s set without mutating state.
    let aSet = TRADE_STATE.sideA.picks, bSet = TRADE_STATE.sideB.picks;
    if (previewSide && previewKey) {
      const target = previewSide === 'A' ? new Set(TRADE_STATE.sideA.picks) : new Set(TRADE_STATE.sideB.picks);
      if (previewMode === 'add') target.add(previewKey);
      else if (previewMode === 'remove') target.delete(previewKey);
      if (previewSide === 'A') aSet = target; else bSet = target;
    }
    const aVal = KT.valOf({ picks: aSet }, lg);
    const bVal = KT.valOf({ picks: bSet }, lg);
    const aHead = KT.headlinerOf({ picks: aSet }, lg);
    const bHead = KT.headlinerOf({ picks: bSet }, lg);
    // Starting-lineup projected points now → after (re-optimized, so a sent
    // starter is backfilled by the next-best, the true "what replaces this").
    const impA = tradeLineupImpact(lg, TRADE_STATE.sideA.rosterId, aSet, bSet);
    const impB = tradeLineupImpact(lg, TRADE_STATE.sideB.rosterId, bSet, aSet);
    const m = refs.middle;
    const oddsKey = `${TRADE_STATE.sideA.rosterId}:${[...TRADE_STATE.sideA.picks].sort()}|${TRADE_STATE.sideB.rosterId}:${[...TRADE_STATE.sideB.picks].sort()}`;
    // Title odds belong to the committed trade they were run on, never a preview.
    const title = !previewKey && m.title && m.title.key === oddsKey ? m.title : null;
    const v = isDynastyLeague(lg)
      ? KT.computeFairness(aVal, bVal, aSet.size, bSet.size, aHead, bHead)
      : KT.redraftVerdict(aSet.size, bSet.size, impA, impB, title);
    if (m.node.dataset.oddsKey && m.node.dataset.oddsKey !== oddsKey) {
      delete m.node.dataset.oddsKey;
      m.title = null;
      m.titleA.textContent = '·'; m.titleB.textContent = '·';
      m.titleA.style.color = ''; m.titleB.style.color = '';
      for (const r of m.titleRows || []) {
        r.aCell.textContent = '·'; r.bCell.textContent = '·';
        r.aCell.style.color = ''; r.bCell.style.color = '';
        r.aSub.textContent = ''; r.bSub.textContent = '';
      }
      m.titleMeta.textContent = 'Run again for the changed trade.';
    }
    m.aVal.textContent = fmt.decimal(aVal, 1);
    m.bVal.textContent = fmt.decimal(bVal, 1);
    m.verdict.textContent = v.label;
    m.verdict.style.color = v.color;
    m.fair.textContent = v.note != null ? v.note : v.pct.toFixed(0) + '% fairness';
    if (m.premiumNote) {
      if (v.premium) {
        const nm = v.premium.side === 'A' ? 'Side A' : 'Side B';
        m.premiumNote.textContent = `+${(v.premium.pct * 100).toFixed(1)}% headliner premium to ${nm}, gave the better single asset, so a raw-even swap favors the receiver.`;
        m.premiumNote.style.display = '';
      } else {
        m.premiumNote.textContent = '';
        m.premiumNote.style.display = 'none';
      }
    }
    // Strength deltas
    const postA = simulateRosterStrength(lg, TRADE_STATE.sideA.rosterId, aSet, bSet);
    const postB = simulateRosterStrength(lg, TRADE_STATE.sideB.rosterId, bSet, aSet);
    m.deltaA.textContent = (postA.delta >= 0 ? '+' : '') + fmt.decimal(postA.delta, 1);
    m.deltaA.style.color = postA.delta >= 0 ? 'var(--green)' : 'var(--red)';
    m.deltaB.textContent = (postB.delta >= 0 ? '+' : '') + fmt.decimal(postB.delta, 1);
    m.deltaB.style.color = postB.delta >= 0 ? 'var(--green)' : 'var(--red)';
    // Dynasty strength is this week's lineup, and isSidelined benches Out,
    // Doubtful, IR and PUP (Questionable starts). Say so when a moved player's
    // tag is doing the work, or a one-week Doubtful reads as a verdict.
    const benched = isDynastyLeague(lg) ? [...aSet, ...bSet].filter(k => !isPickKey(k) && isSidelined(String(k)))
      .map(k => `${window.PLAYERS[k]?.name || k} (${window.PLAYERS[k]?.injury_status || 'IR'})`) : [];
    m.strengthNote.textContent = benched.length ? `Benched this week: ${benched.join(', ')}. Strength counts only who starts now.` : '';
    m.strengthNote.style.display = benched.length ? '' : 'none';

    const setImp = (el, imp) => {
      if (!imp) { el.textContent = '·'; el.style.color = 'var(--fg-3)'; return; }
      el.textContent = `${fmt.decimal(imp.now, 0)} → ${fmt.decimal(imp.after, 0)} (${imp.delta >= 0 ? '+' : ''}${fmt.decimal(imp.delta, 0)})`;
      el.style.color = Math.abs(imp.delta) < 1 ? 'var(--fg-2)' : imp.delta >= 0 ? 'var(--green)' : 'var(--red)';
    };
    setImp(m.lineupA, impA); setImp(m.lineupB, impB);

    // 3-year outlook. For each year horizon, net Δ for each side =
    // value of pieces RECEIVED (projected forward) − value SENT (projected
    // forward). Side A receives bSet, sends aSet (and vice versa).
    // Redraft renders no year rows: there is no next season to age into.
    const aIsValid = aSet.size > 0 && bSet.size > 0;
    for (const [yr, n] of m.yearRows) {
      if (!aIsValid) {
        yr.aCell.textContent = '·'; yr.bCell.textContent = '·';
        yr.aSub.textContent  = '';  yr.bSub.textContent  = '';
        yr.aCell.style.color = 'var(--fg-3)'; yr.bCell.style.color = 'var(--fg-3)';
        continue;
      }
      // Symmetric by construction: at horizon n, A's received-pile value is
      // exactly B's sent-pile value (it's the same set of assets aged the
      // same way). So we compute each pile once and assign both perspectives.
      const aReceives = projectSideValue(bSet, lg, n);
      const aSends    = projectSideValue(aSet, lg, n);
      const netA = aReceives - aSends;
      const netB = aSends - aReceives;
      yr.aCell.textContent = (netA >= 0 ? '+' : '') + fmt.decimal(netA, 1);
      yr.bCell.textContent = (netB >= 0 ? '+' : '') + fmt.decimal(netB, 1);
      yr.aCell.style.color = Math.abs(netA) < 1 ? 'var(--fg-2)' : netA >= 0 ? 'var(--green)' : 'var(--red)';
      yr.bCell.style.color = Math.abs(netB) < 1 ? 'var(--fg-2)' : netB >= 0 ? 'var(--green)' : 'var(--red)';
      // Total team strength + rank in the league at year n, post-trade.
      const ranks = projectedTradeRanks(lg, {
        rosterId: TRADE_STATE.sideA.rosterId, send: aSet, recv: bSet,
      }, {
        rosterId: TRADE_STATE.sideB.rosterId, send: bSet, recv: aSet,
      }, n);
      yr.aSub.textContent = `${fmt.decimal(ranks.aTotal, 0)} · #${ranks.aRank}/${ranks.total}`;
      yr.bSub.textContent = `${fmt.decimal(ranks.bTotal, 0)} · #${ranks.bRank}/${ranks.total}`;
    }

    // Preview vs committed visual
    refs.middle.node.classList.toggle('preview', !!(previewSide && previewKey));
  };

  // Toggle a key in/out of a side. Animates the row in/out and updates middle.
  KT.toggle = function(side, key, sourceMode /* 'add'|'remove'|'auto' */) {
    const lg = TRADE_STATE._refs.lg;
    const state = side === 'A' ? TRADE_STATE.sideA : TRADE_STATE.sideB;
    const has = state.picks.has(key);
    const mode = sourceMode || (has ? 'remove' : 'add');
    if (mode === 'add' && !has) state.picks.add(key);
    if (mode === 'remove' && has) state.picks.delete(key);
    KT.syncSide(side);
    KT.refreshMiddle(lg);
  };

  // After a state change for one side, update the pile (add/remove rows) and
  // mark pool rows as selected/unselected. Animates entries.
  KT.syncSide = function(side) {
    const refs = TRADE_STATE._refs;
    const lg = refs.lg;
    const state = side === 'A' ? TRADE_STATE.sideA : TRADE_STATE.sideB;
    const sideRefs = refs[side];
    const wantedKeys = state.picks;
    const pile = sideRefs.pile;
    const pool = sideRefs.pool;

    // Remove rows that shouldn't be there (with exit animation).
    Array.from(pile.querySelectorAll('[data-trade-key]')).forEach(row => {
      const k = row.dataset.tradeKey;
      if (!wantedKeys.has(k)) KT.springExit(row);
    });

    // Add rows that should be there.
    for (const k of wantedKeys) {
      const exists = pile.querySelector(`[data-trade-key="${cssEscape(k)}"]`);
      if (!exists) {
        const row = sideRefs.makePileRow(k);
        pile.appendChild(row);
        KT.springEnter(row);
      }
    }

    // Hide the empty placeholder when there is content.
    sideRefs.empty.style.display = wantedKeys.size ? 'none' : '';

    // Update pool selected state.
    Array.from(sideRefs.card.querySelectorAll('.trade-pool [data-trade-key]')).forEach(row => {
      const k = row.dataset.tradeKey;
      row.classList.toggle('selected', wantedKeys.has(k));
      row.setAttribute('aria-pressed', wantedKeys.has(k) ? 'true' : 'false');
    });

    // Update total label.
    const total = KT.valOf(state, lg);
    sideRefs.total.textContent = fmt.decimal(total, 1);
  };

  // CSS.escape polyfill-ish for our limited keys (alphanumeric + : -)
  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  KT.springEnter = function(node) {
    if (KT.reduced) return;
    node.animate(
      [
        { transform: 'scale(0.82) translateY(-6px)', opacity: 0 },
        { transform: 'scale(1.05) translateY(0)',    opacity: 1, offset: 0.55 },
        { transform: 'scale(0.98) translateY(0)',    opacity: 1, offset: 0.78 },
        { transform: 'scale(1) translateY(0)',       opacity: 1 },
      ],
      { duration: 360, easing: 'cubic-bezier(0.22, 1.4, 0.36, 1)', fill: 'both' }
    );
  };
  KT.springExit = function(node) {
    if (KT.reduced) { node.remove(); return; }
    const a = node.animate(
      [
        { transform: 'scale(1)',    opacity: 1 },
        { transform: 'scale(0.85) translateX(-8px)', opacity: 0 },
      ],
      { duration: 200, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'forwards' }
    );
    a.onfinish = () => { try { node.remove(); } catch {} };
  };
  function leagueSelector(currentId, onChange) {
    const sel = h('select', { 'aria-label':'Select an option', onchange: (e) => onChange(e.target.value) });
    for (const lg of window.LEAGUES || []) {
      sel.appendChild(h('option', { value:lg.id, selected: lg.id===currentId ? '' : null }, lg.name + (lg.is_superflex?' (SF)':lg.is_idp?' (IDP)':' (1QB)')));
    }
    return h('div', { class:'group' }, h('label', null, 'League'), sel);
  }
  // ---- Pick valuation helpers ----
  // A pick key is "pick:season:round:originRosterId" e.g. "pick:2026:1:5"
  function isPickKey(k) { return typeof k === 'string' && k.startsWith('pick:'); }
  function parsePickKey(k) {
    const [, season, round, originRosterId] = k.split(':');
    return { season, round: parseInt(round, 10), originRosterId: parseInt(originRosterId, 10) };
  }
  function pickKey(season, round, originRosterId) {
    return `pick:${season}:${round}:${originRosterId}`;
  }
  function knownDraftSlot(season, round, originRosterId, league) {
    const draft = (league?.drafts || []).find(d => String(d.season) === String(season));
    const order = draft?.draft_order;
    if (!order || !Object.keys(order).length) return null;
    const roster = (league.rosters || []).find(r => r.roster_id === Number(originRosterId));
    const baseSlot = Number(order[String(roster?.owner_id)] ?? order[String(originRosterId)]);
    if (!Number.isInteger(baseSlot) || baseSlot < 1) return null;
    const teams = Number(draft.settings?.teams || league.total_rosters || 0);
    return draft.type === 'snake' && Number(round) % 2 === 0 && teams
      ? teams + 1 - baseSlot
      : baseSlot;
  }
  function draftPickSlot(season, round, originRosterId, league) {
    return knownDraftSlot(season, round, originRosterId, league)
      ?? originSlot(originRosterId, league, pickYearsOut(season));
  }
  function draftPickLabel(season, round, originRosterId, league, includeOrigin=false) {
    const knownSlot = knownDraftSlot(season, round, originRosterId, league);
    let label = knownSlot
      ? `${season} ${round}.${String(knownSlot).padStart(2, '0')}`
      : `${season} R${round}`;
    if (includeOrigin) {
      const origin = (league?.rosters || []).find(r => r.roster_id === Number(originRosterId));
      label += ` (from ${origin?.team_name || `R${originRosterId}`})`;
    }
    return label;
  }
  // Estimate origin roster's expected draft slot (1=earliest, 12=latest) from
  // league strength rank. Weakest team picks first in the rookie draft.
  //
  // Rank by STARTING-lineup strength, not the sum of every rostered player.
  // Standings are decided by the lineup you field: summing the whole roster
  // ranks a team hoarding 32 ranked bodies with weak starters near the top and
  // slots their picks last. That shipped, and it priced a rebuilding team's
  // first as a 1.09.
  //
  // Picks stay out (includePicks = false), that's what breaks the cycle
  // pickValue -> originSlot -> rosterOwnedPicks -> pickValue. Don't pass true.
  //
  // For future-year picks (yearsOut > 0) startingStrength ages each roster and
  // re-fills the lineup, so the slot reflects projected standings in the pick's
  // actual season: a vet-heavy contender today drifts back 2-3 years out,
  // making their future first more valuable than today's.
  const _originSlotCache = new Map();
  function originSlotOrder(league, yearsOut) {
    const key = `${league.id}::${yearsOut}`;
    let order = _originSlotCache.get(key);
    if (!order) {
      order = league.rosters
        .map(r => ({ id: r.roster_id, s: startingStrength(r, league, yearsOut || 0) }))
        .sort((a, b) => a.s - b.s); // weakest first
      _originSlotCache.set(key, order);
    }
    return order;
  }
  function originSlot(originRosterId, league, yearsOut) {
    if (!originRosterId) return Math.ceil((league.total_rosters || 10) / 2);
    const all = originSlotOrder(league, yearsOut || 0);
    const idx = all.findIndex(r => r.id === originRosterId);
    return idx >= 0 ? idx + 1 : Math.ceil((league.total_rosters || 10) / 2);
  }
  function pickYearsOut(season) {
    const cur = new Date().getFullYear();
    const n = parseInt(season, 10);
    return isNaN(n) ? 0 : Math.max(0, n - cur);
  }
  // Interpolate a per-slot pick value between KTC's early/mid/late anchors.
  // Anchors sit at slot 1 (early), the middle slot (mid), and slot N (late);
  // the exact projected slot linearly interpolates between them, so a weaker
  // roster's future pick (earlier slot) is worth strictly more than a stronger
  // roster's. Result stays inside KTC's early..late range, on the KTC scale.
  // Returns null if KTC hasn't published all three anchors for this
  // season+round (caller then falls back to bucket / strategy.js).
  // ponytail: KTC ships only 3 anchors per round, so within-band ordering is a
  // linear read, not market-measured. Upgrade path: per-slot KTC values if KTC
  // ever publishes them.
  function interpPickValue(ktcMap, season, round, slot, totalRosters) {
    const at = (b) => ktcMap.get(`${season}|${b}|${round}`)?.ktcValue;
    const vE = at('early'), vM = at('mid'), vL = at('late');
    if (vE == null || vM == null || vL == null) return null;
    const N = totalRosters || 12;
    if (N < 2) return Math.round(vE / 100 * 10) / 10;
    const mid = (1 + N) / 2;
    const s = Math.min(Math.max(slot, 1), N);
    const ktc = s <= mid
      ? vE + (vM - vE) * (s - 1) / (mid - 1)
      : vM + (vL - vM) * (s - mid) / (N - mid);
    return Math.round(ktc / 100 * 10) / 10;
  }
  // For a FUTURE pick (Sleeper draft order unset), describe the projected slot
  // and why its value moved: it reflects the owning team's projected finish,
  // not a flat round value. null for picks whose exact slot Sleeper already
  // publishes (those already show a real "1.06"-style label).
  function projectedPickNote(season, round, originRosterId, league) {
    if (originRosterId == null) return null;
    if (knownDraftSlot(season, round, originRosterId, league) != null) return null;
    const N = league?.total_rosters || 12;
    const slot = originSlot(originRosterId, league, pickYearsOut(season));
    const rounded = Math.round(slot);
    const origin = (league?.rosters || []).find(r => r.roster_id === Number(originRosterId));
    const team = origin?.team_name || `R${originRosterId}`;
    const strength = slot <= N / 3 ? 'weak' : slot >= 2 * N / 3 ? 'strong' : 'middle';
    const earlier = slot <= (1 + N) / 2;
    return {
      chip: `proj ${round}.${String(rounded).padStart(2, '0')}`,
      title: `Projected ${round}.${String(rounded).padStart(2, '0')} from ${team}'s ${strength} roster. `
        + `${earlier ? 'Earlier' : 'Later'} projected slot means a ${earlier ? 'higher' : 'lower'} value. `
        + `Slot comes from ${season} projected finish; value interpolated between KTC early/mid/late anchors.`,
    };
  }
  function pickValue(season, round, originRosterId, league) {
    const knownSlot = knownDraftSlot(season, round, originRosterId, league);
    const slot = knownSlot ?? originSlot(originRosterId, league, pickYearsOut(season));
    const bucket = slotToBucket(slot, league?.total_rosters);

    // PRIMARY: KTC published pick values, bucketed by season + early/mid/late
    // + round. Use SF list for SF leagues, 1QB otherwise. Values are KTC-scale
    // (0..10000); tierValue() divides by 100 to get the site's ~0-110 scale.
    const idx = pickIndex();
    const ktcMap = league?.is_superflex ? idx.sf : idx.oneqb;

    // FUTURE picks get their slot from the owning team's PROJECTED finish, so a
    // coarse 3-bucket lookup would give every projected top-4 team the identical
    // "early" value. Interpolate between the KTC anchors by exact projected slot
    // instead, incorporating team strength (FV) at slot granularity.
    if (knownSlot == null) {
      const interp = interpPickValue(ktcMap, season, round, slot, league?.total_rosters);
      if (interp != null) return interp;
    }

    const ktcHit = ktcMap.get(`${season}|${bucket}|${round}`);
    if (ktcHit && ktcHit.ktcValue) {
      return Math.round(ktcHit.ktcValue / 100 * 10) / 10;
    }
    // Coverage warning: if KTC ships data for THIS season's window
    // (current + next two years) but missed this specific pick, log once
    // so we notice when the scraper or season rollover drifts.
    const curYear = new Date().getFullYear();
    const seasonInt = parseInt(season, 10);
    if (round <= 2 && seasonInt >= curYear && seasonInt <= curYear + 2 && ktcMap.size > 0) {
      const warnKey = `pickFallback:${season}|${bucket}|${round}`;
      if (!pickValue._warned) pickValue._warned = new Set();
      if (!pickValue._warned.has(warnKey)) {
        pickValue._warned.add(warnKey);
        console.warn(`pickValue: KTC missing ${season} ${bucket} ${round}${round===1?'st':'nd'}, falling back to strategy.js`);
      }
    }

    // FALLBACK: strategy.js approximations (legacy). Kept so trades for rounds
    // 3-4 (KTC doesn't publish those past R4 future) and missing seasons still
    // resolve to a sane number.
    const S = window.STRATEGY;
    if (!S) return 0;
    const currentYear = String(new Date().getFullYear());
    const isFuture = season > currentYear;
    let val = 0;
    if (round === 1) {
      if (isFuture) {
        val = slot <= 4 ? S.pick_values_1qb["future_1.early"]
            : slot <= 8 ? S.pick_values_1qb["future_1.mid"]
                        : S.pick_values_1qb["future_1.late"];
      } else {
        val = S.pick_values_1qb[`1.${String(slot).padStart(2,'0')}`] || 30;
      }
    } else if (round === 2) {
      if (isFuture) {
        val = slot <= 4 ? S.pick_values_1qb["future_2.early"]
            : slot <= 8 ? S.pick_values_1qb["future_2.mid"]
                        : S.pick_values_1qb["future_2.late"];
      } else {
        val = S.pick_values_1qb[`2.${String(slot).padStart(2,'0')}`] || 22;
      }
    } else if (round === 3) {
      val = slot <= 4 ? S.pick_values_1qb["3.early"] : slot <= 8 ? S.pick_values_1qb["3.mid"] : S.pick_values_1qb["3.late"];
    } else if (round === 4) {
      val = slot <= 4 ? S.pick_values_1qb["4.early"] : slot <= 8 ? S.pick_values_1qb["4.mid"] : S.pick_values_1qb["4.late"];
    }
    // Superflex premium: top picks (where rookie QBs are taken) hold extra
    // value because dynasty SF QB rooms are scarce. Apply only to current-year R1.
    if (league && league.is_superflex && !isFuture && round === 1) {
      const sfBump = S.pick_sf_premium[`1.${String(slot).padStart(2,'0')}`] || 0;
      val += sfBump;
    }
    return Math.round(val * 10) / 10;
  }
  // Compute which picks a given roster currently owns, accounting for traded_picks.
  // Returns array of { season, round, originRosterId, label, value }
  function rosterOwnedPicks(rosterId, league, horizon = 2) {
    // Redraft has no rookie draft, so it owns no picks. Gated here, not per
    // caller: the future-strength rows and the title simulator used to price 8
    // phantom KTC picks into a redraft roster through this function.
    if (!isDynastyLeague(league)) return [];
    const result = [];
    const traded = league.traded_picks || [];
    // A season's rookie picks stop being current assets once that draft
    // completes, they've already converted into rostered rookies. Drop any
    // season whose Sleeper draft is marked complete (so 2026 picks vanish the
    // day the 2026 rookie draft ends) but keep seasons still pre-draft. This is
    // why it's data-driven off draft status, not the calendar: e.g. yuH's 2026
    // draft is still pre_draft, so its 2026 picks must remain.
    const completed = new Set(
      (league.drafts || [])
        .filter(d => d.status === 'complete')
        .map(d => String(d.season))
    );
    // Rolling window of upcoming draft classes (default 2 seasons; callers that
    // project further out, e.g. the 5-year FV curve, pass a larger horizon so a
    // team's 2028+ own firsts aren't invisible in the long-range projection).
    const calYear = new Date().getFullYear();
    const seasons = [];
    for (let y = calYear; y <= calYear + horizon + 2 && seasons.length < horizon; y++) {
      if (!completed.has(String(y))) seasons.push(String(y));
    }
    const draftRounds = Math.max(4, ...(league.drafts || [])
      .filter(d => seasons.includes(String(d.season)))
      .map(d => Number(d.settings?.rounds) || 0));
    const rounds = Array.from({ length: draftRounds }, (_, i) => i + 1);
    // Default ownership: each roster owns its own picks across each (season, round)
    // Then apply traded_picks: a pick has roster_id (originator), previous_owner_id,
    // owner_id (current). For each roster, the picks they currently own are:
    //   default own slate, MINUS any default pick where they are previous_owner and not current
    //   PLUS any traded pick where they are current owner.
    for (const season of seasons) {
      for (const round of rounds) {
        // Their own pick (originator = rosterId, season+round)
        // Find traded record for this exact pick
        const tradedAway = traded.find(tp => tp.season === season && tp.round === round
          && tp.roster_id === rosterId && tp.owner_id !== rosterId);
        if (!tradedAway) {
          result.push({ season, round, originRosterId: rosterId, label: draftPickLabel(season, round, rosterId, league) });
        }
      }
    }
    // Acquired picks
    for (const tp of traded) {
      if (tp.owner_id !== rosterId) continue;
      if (!seasons.includes(tp.season)) continue;
      if (tp.roster_id === rosterId) continue; // returned own pick already comes from default slate
      result.push({ season: tp.season, round: tp.round, originRosterId: tp.roster_id, label: draftPickLabel(tp.season, tp.round, tp.roster_id, league, true) });
    }
    // Compute values + sort
    for (const p of result) p.value = pickValue(p.season, p.round, p.originRosterId, league);
    result.sort((a, b) => b.value - a.value);
    return result;
  }

  // Team-agnostic player search for the Trade Lab: find any ranked player by
  // name without knowing their team, then add to the correct side. Adds through
  // the same KT.toggle path the pools use.
  // One button, not two: which side a player belongs on is never the user's
  // choice, it's determined by who owns him. On the send side's roster => Send.
  // On the receive side's => For. On a third team => For, and that team becomes
  // the partner: a pile can only hold what its roster owns, or the lineup credits
  // a trade nobody can make. A free agent is claimed, never traded for.
  function buildTradeSearch(lg) {
    const idx = rankIndex();
    const input = h('input', {
      type:'search',
      class:'trade-search-input',
      placeholder:'Search any player by name. Send if he is yours, For if he is theirs.',
      autocomplete:'off',
      'aria-label':'Search any player to add to the trade',
    });
    const results = h('div', { class:'trade-search-results', role:'listbox', hidden:'' });
    const clear = () => { input.value = ''; results.innerHTML = ''; results.hidden = true; };
    const render = () => {
      const q = norm(input.value.trim());
      results.innerHTML = '';
      if (!q) { results.hidden = true; return; }
      // Redraft searches the rest-of-season board, not the dynasty rankings:
      // those have no K or DEF and drop anyone whose entry lost its Sleeper id.
      const matches = isDynastyLeague(lg)
        ? idx.all.filter(p => p._sleeperId && norm(p.name).includes(q)).slice(0, 8)
        : (window.WEEKLY_RANKINGS?.players || []).filter(p => window.PLAYERS[p.id] && norm(p.name).includes(q))
            .map(p => ({ name: p.name, pos: p.pos, _sleeperId: String(p.id), pts: rosPointsByPid(lg).get(String(p.id))?.pts || 0 }))
            .sort((a, b) => b.pts - a.pts).slice(0, 8);
      results.hidden = false;
      if (!matches.length) { results.appendChild(h('div', { class:'trade-search-empty' }, 'No players match.')); return; }
      for (const p of matches) {
        const sp = window.PLAYERS[p._sleeperId];
        const val = tierValue(p, lg);
        const key = String(p._sleeperId);
        const ownerRoster = lg.rosters.find(r => (r.players || []).includes(key));
        const mine = !!ownerRoster && ownerRoster.roster_id === TRADE_STATE.sideA.rosterId;
        const from = ownerRoster ? (ownerRoster.team_name || ownerRoster.owner_name) : 'free agent';
        const add = () => {
          if (mine || ownerRoster.roster_id === TRADE_STATE.sideB.rosterId) { KT.toggle(mine ? 'A' : 'B', key, 'add'); clear(); input.focus(); return; }
          TRADE_STATE.sideB = { rosterId: ownerRoster.roster_id, picks: new Set([key]) };
          navigate(`#trade/${lg.id}/${ownerRoster.roster_id}`);
        };
        results.appendChild(h('div', { class:'trade-search-row' },
          h('div', { class:'name-cell' },
            posChip(p.pos || sp?.pos),
            sp?.team ? teamChip(sp.team) : null,
            h('span', { class:'name' }, p.name),
            h('span', { class:'trade-search-owner tip' }, from),
            h('span', { class:'trade-search-val tnum' }, fmt.decimal(val, 1)),
          ),
          h('div', { class:'trade-search-actions' },
            ownerRoster ? h('button', {
              class:'trade-search-add' + (mine ? ' is-send' : ' is-for'),
              title: mine ? 'Add to You Send (left side)' : `Add to You Receive (right side) from ${from}`,
              onclick: add,
            }, mine ? '+ Send' : '+ For')
              : h('button', { class:'trade-search-add', disabled:'', title:'A free agent is claimed off waivers, not traded for.' }, 'Free agent'),
          ),
        ));
      }
    };
    input.addEventListener('input', render);
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') clear(); });
    return h('div', { class:'trade-search' },
      h('div', { class:'trade-search-label tip' }, 'FIND A PLAYER'),
      h('div', { class:'trade-search-box' }, input, results),
    );
  }

  function buildTradeSide(label, lg, state, roster, refs) {
    const card = h('div', { class:'trade-side-card' });
    const rosterSel = h('select', { 'aria-label':'Trade partner roster', onchange: (e) => { state.rosterId = parseInt(e.target.value, 10); state.picks = new Set(); viewTrade(lg.id); } });
    const otherRosterId = label === 'A' ? TRADE_STATE.sideB.rosterId : TRADE_STATE.sideA.rosterId;
    for (const r of lg.rosters) {
      rosterSel.appendChild(h('option', { value:r.roster_id, selected: r.roster_id===state.rosterId?'':null,
        disabled: r.roster_id === otherRosterId ? '' : null }, `${r.team_name} (${r.owner_name})${r.is_me?' ★':''}`));
    }
    card.appendChild(h('div', { class:'trade-side-head' },
      h('div', { class:'tip' }, label === 'A' ? 'YOU SEND' : 'YOU RECEIVE'),
      rosterSel
    ));

    // Redraft picks do not exist as tradeable assets, so the pick pool is empty
    // there and the Picks card never renders.
    const dyn = isDynastyLeague(lg);
    const ownedPicks = (roster && dyn) ? rosterOwnedPicks(roster.roster_id, lg) : [];
    const pickByKey = new Map(ownedPicks.map(p => [pickKey(p.season, p.round, p.originRosterId), p]));

    // Cached row factory for the pile (called when adding a row to pile).
    const makePileRow = (k) => {
      const isPickK = isPickKey(k);
      let nameNode, val;
      if (isPickK) {
        const meta = pickByKey.get(k) || (() => {
          const { season, round, originRosterId } = parsePickKey(k);
          return { season, round, originRosterId, label: draftPickLabel(season, round, originRosterId, lg), value: pickValue(season, round, originRosterId, lg) };
        })();
        // Class-premium chip per Dynasty Domain May 2026: 27 firsts are
        // already inflated 11-39% over their normal future-1st baseline.
        // Show a small "+38%" tag next to those picks so contenders selling
        // and rebuilders buying can see the inflation at a glance.
        const slot = meta.originRosterId ? slotToBucket(draftPickSlot(meta.season, meta.round, meta.originRosterId, lg), lg.total_rosters) : null;
        const classPremium = window.STRATEGY?.pick_class_premium?.[String(meta.season)];
        const premiumPct = (classPremium && slot && meta.round === 1) ? classPremium[slot] : null;
        nameNode = h('div', { class:'name-cell' },
          h('span', { class:'badge', style:{ background:'rgba(96,165,250,.15)', color:'var(--blue)', borderColor:'rgba(96,165,250,.4)' } }, 'PICK'),
          h('span', { class:'name' }, meta.label),
          premiumPct != null ? h('span', {
            class:'badge',
            title: `Class premium: ${meta.season} ${slot} 1sts are ${(premiumPct*100).toFixed(0)}% above the historical baseline at this point in the cycle. Per Dynasty Domain.`,
            style:{ background:'rgba(251,191,36,.12)', color:'var(--amber)', borderColor:'rgba(251,191,36,.4)', marginLeft:'4px' },
          }, `+${Math.round(premiumPct*100)}%`) : null,
          (() => { const note = projectedPickNote(meta.season, meta.round, meta.originRosterId, lg); return note ? h('span', { class:'badge pick-proj', title: note.title }, note.chip) : null; })(),
        );
        val = meta.value;
      } else {
        const sleeper = window.PLAYERS[k];
        nameNode = h('div', { class:'name-cell' },
          sleeper ? posChip(sleeper.pos) : null,
          sleeper ? teamChip(sleeper.team) : null,
          h('span', { class:'name' }, sleeper ? sleeper.name : `[${k}]`),
          // Redraft: the chip is the value's own basis (rest-of-season points over
          // the best free body), so chip and value always agree in order.
          (() => { const vc = vorChip(k, lg, dyn ? 'blend' : 'ros'); return vc ? h('span', { class:'pile-vor', title:'VOR: projected points over a replacement starter at this position, the starting-lineup value you gain/lose' }, 'VOR ', vc) : null; })(),
        );
        val = playerValue(k, lg);
      }
      const row = h('div', {
        class:'trade-pile-row',
        draggable: 'true',
        role: 'button',
        tabindex: '0',
        dataset: { tradeKey: k, tradeSide: label, tradeOrigin: 'pile' },
        title: 'Drag back to roster, or click to remove.',
        onclick: () => KT.toggle(label, k, 'remove'),
        onkeydown: (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          KT.toggle(label, k, 'remove');
        },
      },
        nameNode,
        h('span', { class:'tnum' }, fmt.decimal(val, 1)),
        h('span', { class:'trade-pile-x' }, '×'),
      );
      attachDrag(row);
      return row;
    };

    const totalSpan = h('span', { class:'tnum trade-pile-total' }, '0.0');
    const pileEmpty = h('div', { class:'tip trade-pile-empty' }, `Drag players${dyn ? ' or picks' : ''} here, or click below to add.`);
    const pile = h('div', { class:'trade-pile-rows' });
    const pileWrap = h('div', { class:'trade-pile' },
      h('div', { class:'card-title' }, h('span', null, 'In Trade'), h('span', { style:{ float:'right' } }, totalSpan)),
      pileEmpty,
      pile,
    );
    // Pile is a drop target.
    attachPileDropTarget(pileWrap, label);
    card.appendChild(pileWrap);

    // Player pool
    let pool;
    if (roster) {
      // Redraft breaks value ties (every sub-replacement body is 0) on
      // rest-of-season points, so a starting QB never sorts below a scrub.
      const ros = (pid) => dyn ? 0 : (rosPointsByPid(lg).get(String(pid))?.pts || 0);
      const arr = (roster.players || []).map(pid => {
        const sleeper = window.PLAYERS[pid];
        const ranked = sleeper ? (rankIndex().bySleeperId.get(pid) || rankIndex().byName.get(norm(sleeper.name))) : null;
        return { pid, sleeper, ranked, value: playerValue(pid, lg) };
      }).sort((a,b) => b.value - a.value || ros(b.pid) - ros(a.pid));
      pool = h('div', { class:'trade-pool' },
        h('div', { class:'card-title' }, `${roster.team_name} Roster`),
      );
      for (const p of arr) {
        const row = h('div', {
          class:'trade-pool-row',
          draggable: 'true',
          role: 'button',
          tabindex: '0',
          dataset: { tradeKey: p.pid, tradeSide: label, tradeOrigin: 'pool' },
          title: 'Drag to pile, or click to add.',
          onclick: () => KT.toggle(label, p.pid),
          onkeydown: (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            KT.toggle(label, p.pid);
          },
        },
          h('div', { class:'name-cell' },
            p.sleeper ? posChip(p.sleeper.pos) : null,
            p.sleeper ? teamChip(p.sleeper.team) : null,
            h('span', { class:'name' }, p.sleeper ? p.sleeper.name : `[${p.pid}]`),
            // Tier letters are dynasty categories (cornerstone, mainstay...).
            p.ranked && dyn ? tierChip(p.ranked.tier, p.ranked.category) : null
          ),
          p.value ? h('span', { class:'tnum' }, fmt.decimal(p.value,1)) : h('span', { class:'muted' }, '.')
        );
        attachDrag(row);
        pool.appendChild(row);
      }
      // Pool is also a drop target, drop a pile row here to remove.
      attachPoolDropTarget(pool, label);
      card.appendChild(pool);

      if (ownedPicks.length) {
        const picksPool = h('div', { class:'trade-pool', style:{ marginTop:'12px' } },
          h('div', { class:'card-title' }, `${roster.team_name} Picks`),
        );
        for (const p of ownedPicks) {
          const k = pickKey(p.season, p.round, p.originRosterId);
          const slot = slotToBucket(draftPickSlot(p.season, p.round, p.originRosterId, lg), lg.total_rosters);
          const classPremium = window.STRATEGY?.pick_class_premium?.[String(p.season)];
          const premiumPct = (classPremium && p.round === 1) ? classPremium[slot] : null;
          const row = h('div', {
            class:'trade-pool-row',
            draggable: 'true',
            role: 'button',
            tabindex: '0',
            'aria-pressed': state.picks.has(k) ? 'true' : 'false',
            dataset: { tradeKey: k, tradeSide: label, tradeOrigin: 'pool' },
            onclick: () => KT.toggle(label, k, 'add'),
            onkeydown: (e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              KT.toggle(label, k, 'add');
            },
          },
            h('div', { class:'name-cell' },
              h('span', { class:'badge', style:{ background:'rgba(96,165,250,.15)', color:'var(--blue)', borderColor:'rgba(96,165,250,.4)' } }, 'PICK'),
              h('span', { class:'name' }, p.label),
              premiumPct != null ? h('span', {
                class:'badge',
                title: `Per Dynasty Domain: ${p.season} ${slot} 1sts are ${Math.round(premiumPct*100)}% above the historical future-1st baseline.`,
                style:{ background:'rgba(251,191,36,.12)', color:'var(--amber)', borderColor:'rgba(251,191,36,.4)', marginLeft:'4px' },
              }, `+${Math.round(premiumPct*100)}%`) : null,
              (() => { const note = projectedPickNote(p.season, p.round, p.originRosterId, lg); return note ? h('span', { class:'badge pick-proj', title: note.title }, note.chip) : null; })(),
            ),
            h('span', { class:'tnum' }, fmt.decimal(p.value, 1)),
          );
          attachDrag(row);
          picksPool.appendChild(row);
        }
        attachPoolDropTarget(picksPool, label);
        card.appendChild(picksPool);
      }
    }

    refs[label] = { card, pile, pool, total: totalSpan, empty: pileEmpty, makePileRow };
    // Initial pile population from existing state.
    queueMicrotask(() => KT.syncSide(label));
    return card;
  }

  // Drag plumbing -- shared per row + per drop target.
  function attachDrag(row) {
    row.addEventListener('dragstart', (e) => {
      KT.dragging = {
        key: row.dataset.tradeKey,
        side: row.dataset.tradeSide,
        origin: row.dataset.tradeOrigin,
        node: row,
      };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', row.dataset.tradeKey);
      row.classList.add('dragging');
      // Slight delay so the browser can capture the drag image first.
      requestAnimationFrame(() => row.classList.add('drag-ghost'));
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging', 'drag-ghost');
      KT.clearDropHover();
      // Clear preview highlight on middle.
      const refs = TRADE_STATE._refs;
      if (refs && refs.lg) KT.refreshMiddle(refs.lg);
      KT.dragging = null;
    });
  }

  function attachPileDropTarget(pile, side) {
    pile.addEventListener('dragenter', (e) => {
      if (!KT.dragging || KT.dragging.side !== side) return;
      e.preventDefault();
      pile.classList.add('drop-target');
      // Live preview: show what totals look like if dropped.
      const mode = KT.dragging.origin === 'pile' ? 'remove' : 'add';
      KT.refreshMiddle(TRADE_STATE._refs.lg, side, KT.dragging.key, mode);
    });
    pile.addEventListener('dragover', (e) => {
      if (!KT.dragging || KT.dragging.side !== side) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    pile.addEventListener('dragleave', (e) => {
      // Only clear if leaving the pile entirely (not a child).
      if (!pile.contains(e.relatedTarget)) {
        pile.classList.remove('drop-target');
      }
    });
    pile.addEventListener('drop', (e) => {
      if (!KT.dragging || KT.dragging.side !== side) return;
      e.preventDefault();
      pile.classList.remove('drop-target');
      KT.toggle(side, KT.dragging.key, 'add');
    });
  }

  function attachPoolDropTarget(pool, side) {
    pool.addEventListener('dragenter', (e) => {
      if (!KT.dragging || KT.dragging.side !== side) return;
      if (KT.dragging.origin !== 'pile') return;  // only a pile-row drop here removes
      e.preventDefault();
      pool.classList.add('drop-target-remove');
      KT.refreshMiddle(TRADE_STATE._refs.lg, side, KT.dragging.key, 'remove');
    });
    pool.addEventListener('dragover', (e) => {
      if (!KT.dragging || KT.dragging.side !== side) return;
      if (KT.dragging.origin !== 'pile') return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    pool.addEventListener('dragleave', (e) => {
      if (!pool.contains(e.relatedTarget)) pool.classList.remove('drop-target-remove');
    });
    pool.addEventListener('drop', (e) => {
      if (!KT.dragging || KT.dragging.side !== side) return;
      if (KT.dragging.origin !== 'pile') return;
      e.preventDefault();
      pool.classList.remove('drop-target-remove');
      KT.toggle(side, KT.dragging.key, 'remove');
    });
  }
  KT.clearDropHover = function() {
    document.querySelectorAll('.drop-target,.drop-target-remove').forEach(n => {
      n.classList.remove('drop-target','drop-target-remove');
    });
  };

  // The simulator's what-if for a trade. With `lg`, each side also claims the free
  // agents a real manager would (waiverAdds), so the Trade Lab and the Trade
  // Finder price the same deal on the same rosters.
  function tradeTitleWhatIf(aRosterId, bRosterId, aSet, bSet, lg = null) {
    if (String(aRosterId) === String(bRosterId)) throw new Error('Trade sides must use different rosters');
    const players = set => [...set].filter(k => !isPickKey(k)).map(String);
    const out = {
      [aRosterId]: { drop: players(aSet), add: players(bSet) },
      [bRosterId]: { drop: players(bSet), add: players(aSet) },
    };
    if (lg) {
      const find = (id) => lg.rosters.find(r => String(r.roster_id) === String(id));
      const a = waiverAdds(lg, find(aRosterId), new Set(players(aSet)), players(bSet));
      out[aRosterId].add.push(...a);
      out[bRosterId].add.push(...waiverAdds(lg, find(bRosterId), new Set(players(bSet)), players(aSet), new Set(a)));
    }
    return out;
  }
  // simPool has no waiver pool, so a what-if that ships a position's last backup
  // is charged an EMPTY slot on every bye and injury. Claim a free agent
  // there instead, up to one body over the position's starting slots. `taken`
  // are claims the other side already made: one free agent, one team.
  function waiverAdds(lg, roster, drop, add, taken = new Set()) {
    const map = projMap('offense'), ros = isDynastyLeague(lg) ? null : rosPointsByPid(lg);
    const posOf = (pid) => (ros && ros.get(pid) ? projPosGroup(ros.get(pid).pos) : map.get(pid)?.pos);
    const ptsOf = (pid) => (ros ? ros.get(pid)?.pts : map.get(pid) ? projPoints(map.get(pid), lg, 'blend') : null);
    // K and DEF count only where the league starts them (simPool drops them elsewhere).
    const need = { QB: 0, RB: 0, WR: 0, TE: 0 };
    for (const s of offenseStartingSlots(lg)) {
      if (s.pos === 'K' || s.pos === 'DEF') need[s.pos] = (need[s.pos] || 0) + 1;
      else if (need[s.pos] != null) need[s.pos]++;
      else if (s.pos === 'SUPER_FLEX') need.QB++;
    }
    const count = (ids) => {
      const c = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
      for (const pid of ids) { const pos = posOf(pid); if (c[pos] != null) c[pos]++; }
      return c;
    };
    // The simulator's own pool: redraft keeps IR (its line prices the weeks out).
    const now = startableIds(roster, { includeStashed: !!ros });
    const before = count(now), after = count(now.filter(p => !drop.has(p)).concat([...add].filter(k => !isPickKey(k))));
    const out = [];
    for (const pos in need) {
      const short = Math.min(before[pos], need[pos] + 1) - after[pos];
      if (short <= 0) continue;
      // Each claim replaces one of the `short` weakest bodies who left, and is no
      // better than him: the baseline never swaps a bench body for a better free
      // agent, so a trade may not either. Claiming the best one let a TE2 thrown
      // in buy his side a better free TE, and shipping a sub-waiver kicker gain
      // title odds. When every free agent beats him, the weakest one comes back.
      const caps = now.filter(p => drop.has(p) && posOf(p) === pos).map(p => ptsOf(p) ?? Infinity)
        .sort((a, b) => b - a).slice(-short);
      for (const cap of caps) {
        const open = freeAgents(lg).filter(fa => fa.pos === pos && !taken.has(fa.pid) && !out.includes(fa.pid));
        const fa = open.find(f => f.pts <= cap) || open[open.length - 1];
        if (fa) out.push(fa.pid);
      }
    }
    return out;
  }

  // Middle summary builds DOM once and exposes setter refs.
  function tradeMiddleSummary(lg) {
    const aVal = h('span', { class:'tnum' }, '0.0');
    const bVal = h('span', { class:'tnum' }, '0.0');
    const verdict = h('div', { class:'verdict' }, 'INCOMPLETE');
    const fair = h('div', { class:'tip' }, '0% fairness');
    const premiumNote = h('div', { class:'tip', style:{ display:'none', marginTop:'4px', color:'var(--fg-2)', fontStyle:'italic', lineHeight:'1.3' } }, '');
    const deltaA = h('span', { class:'tnum' }, '0.0');
    const deltaB = h('span', { class:'tnum' }, '0.0');
    const strengthNote = h('div', { class:'tip trade-strength-note', style:{ display:'none', marginTop:'4px' } }, '');
    const lineupA = h('span', { class:'tnum trade-lineup-value' }, '·');
    const lineupB = h('span', { class:'tnum trade-lineup-value' }, '·');
    const titleA = h('span', { class:'tnum trade-title-value' }, '·');
    const titleB = h('span', { class:'tnum trade-title-value' }, '·');
    const titleMeta = h('div', { class:'tip trade-title-meta' }, 'Run after both sides have assets.');
    let baselineOdds = null;
    // Redraft prices one season: rosters do not carry over, so no 2027 row.
    const dyn = isDynastyLeague(lg);
    const TITLE_YEARS = dyn ? 3 : 1, TITLE_SIMS = SIM.tradeSimBudget / TITLE_YEARS;
    let titleRows = [];
    const runTitleOdds = h('button', { type:'button', class:'trade-title-run', onclick: () => {
      const aSet = TRADE_STATE.sideA.picks, bSet = TRADE_STATE.sideB.picks;
      if (!aSet.size || !bSet.size) { titleMeta.textContent = 'Add assets to both sides first.'; return; }
      const aRosterId = TRADE_STATE.sideA.rosterId, bRosterId = TRADE_STATE.sideB.rosterId;
      const whatIf = tradeTitleWhatIf(aRosterId, bRosterId, aSet, bSet, lg);
      const key = `${aRosterId}:${[...aSet].sort()}|${bRosterId}:${[...bSet].sort()}`;
      runTitleOdds.disabled = true;
      runTitleOdds.textContent = 'Running...';
      titleMeta.textContent = `Simulating ${dyn ? `${TITLE_YEARS} seasons` : `the rest of ${CURRENT_SEASON}`}, ${TITLE_SIMS.toLocaleString()} times each, before and after.`;
      setTimeout(() => {
        try {
          // Same seeds before and after (common random numbers): the draws
          // match, so the change in a cell is the trade, not simulation noise.
          if (!baselineOdds) baselineOdds = titleOddsByYear(lg, { years:TITLE_YEARS, sims:TITLE_SIMS });
          const after = titleOddsByYear(lg, { years:TITLE_YEARS, sims:TITLE_SIMS, whatIf });
          // Noise band: SIM.titleBandZ paired standard errors, the same ± the
          // Trade Finder prints. A change inside it paints grey and never
          // decides the verdict.
          // Compared at printed precision, so "+0.8 ±0.8" never paints as signal.
          const inside = (d, band) => Math.round(Math.abs(d) * 10) <= Math.round(Math.max(0.1, band) * 10);
          const tone = (d, band) => inside(d, band) ? 'var(--fg-2)' : d > 0 ? 'var(--green)' : 'var(--red)';
          const paint = (cell, sub, k, rid) => {
            const before = baselineOdds[k].byRoster.get(rid) || 0, next = after[k].byRoster.get(rid) || 0;
            const { delta, se } = pairedTitleDelta(baselineOdds[k].champions, after[k].champions, rid), band = SIM.titleBandZ * se;
            cell.textContent = `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`;
            cell.style.color = tone(delta, band);
            sub.textContent = `${(before * 100).toFixed(1)}% \u2192 ${(next * 100).toFixed(1)}% \u00b1${band.toFixed(1)}`;
            return { delta, band };
          };
          let totA = 0, totB = 0, varA = 0, varB = 0;
          after.forEach((yr, k) => {
            const row = titleRows[k];
            const pa = paint(row.aCell, row.aSub, k, aRosterId);
            const pb = paint(row.bCell, row.bSub, k, bRosterId);
            totA += pa.delta; varA += pa.band ** 2; totB += pb.delta; varB += pb.band ** 2;
          });
          const sum = (el, d, band) => {
            el.textContent = `${d >= 0 ? '+' : ''}${d.toFixed(1)} pts ${dyn ? `over ${TITLE_YEARS} seasons` : `in ${CURRENT_SEASON}`}`;
            el.style.color = tone(d, band);
          };
          const bandA = Math.sqrt(varA), bandB = Math.sqrt(varB);
          sum(titleA, totA, bandA); sum(titleB, totB, bandB);
          node.dataset.oddsKey = key;
          out.title = { key, a: totA, b: totB, sigA: !inside(totA, bandA), sigB: !inside(totB, bandB) };
          titleMeta.textContent = dyn
            ? `Change in title odds, percentage points, per season. ${TITLE_SIMS.toLocaleString()} simulations each. `
              + 'Later seasons age every roster forward and slot draft picks by the simulated finish, so this is where picks show up. Grey is inside the \u00b1 noise band.'
            : `Change in ${CURRENT_SEASON} title odds, percentage points. ${TITLE_SIMS.toLocaleString()} simulations of the remaining schedule from the current records. Grey is inside the \u00b1 noise band.`;
          KT.refreshMiddle(lg);
        } catch (err) {
          console.error('Trade title odds failed', err);
          titleMeta.textContent = 'Could not run title odds. Try again.';
        } finally {
          runTitleOdds.disabled = false;
          runTitleOdds.textContent = 'Run title odds';
        }
      }, 0);
    } }, 'Run title odds');

    // 3-year outlook scaffolding. Each year row shows the net change in
    // dynasty value for each side, after applying age decay to current
    // players. Color: green if your side gains net value that year, red
    // if you lose. Picks float (treated as 1.0× per year).
    const makeYearRow = (label) => {
      const aCell = h('span', { class:'tnum t3y-delta' }, '·');
      const bCell = h('span', { class:'tnum t3y-delta' }, '·');
      const aSub  = h('div', { class:'tnum t3y-sub'   }, '');
      const bSub  = h('div', { class:'tnum t3y-sub'   }, '');
      const row = h('div', { class:'t3y-row' },
        h('span', { class:'t3y-label' }, label),
        h('div', { class:'t3y-cell' }, aCell, aSub),
        h('span', { class:'t3y-sep' }, '·'),
        h('div', { class:'t3y-cell' }, bCell, bSub),
      );
      return { row, aCell, bCell, aSub, bSub };
    };
    titleRows = Array.from({ length: TITLE_YEARS }, (_, k) => makeYearRow(String(CURRENT_SEASON + k)));
    const yearRows = dyn ? ['Today', '+1 yr', '+2 yr', '+3 yr', '+4 yr', '+5 yr'].map((l, n) => [makeYearRow(l), n]) : [];

    const node = h('div', { class:'trade-middle' },
      h('div', { class:'trade-middle-card' },
        h('div', { class:'tip' }, 'Total Value'),
        h('div', { style:{ display:'flex', justifyContent:'space-between', fontSize:'1.1rem', fontWeight:700, marginTop:'4px' } },
          aVal,
          h('span', { style:{color:'var(--fg-3)'} }, '⇄'),
          bVal,
        ),
        h('div', { style:{ marginTop:'14px', textAlign:'center' } },
          h('div', { class:'tip' }, 'Verdict'),
          verdict,
          fair,
          premiumNote,
        ),
        h('div', { style:{ marginTop:'14px' } },
          h('div', { class:'tip', style:{ marginBottom:'4px' } }, 'Post-Trade Strength Δ'),
          h('div', { style:{ display:'flex', justifyContent:'space-between' } }, deltaA, deltaB),
          strengthNote,
        ),
        h('div', { style:{ marginTop:'14px' } },
          h('div', { class:'tip', style:{ marginBottom:'4px' }, title:`Your best starting lineup’s projected ${dyn ? 'season' : 'rest-of-season'} points, now vs after the trade. The lineup is re-optimized, so a starter you send is automatically replaced by your next-best at that position, the change is the real lineup impact of what you’re giving up vs getting.${dyn ? ' A slot the trade empties takes the best free agent.' : ' A slot the trade empties takes the best free agent; one nobody can fill scores 0.'}` }, `Starting Lineup (${dyn ? 'proj' : 'rest-of-season'} pts) · now → after`),
          h('div', { class:'trade-lineup-values' },
            h('div', { class:'trade-lineup-side' },
              h('span', { class:'trade-lineup-side-label' }, 'Side A'), lineupA),
            h('div', { class:'trade-lineup-side' },
              h('span', { class:'trade-lineup-side-label' }, 'Side B'), lineupB))
        ),
        h('div', { class:'trade-title-odds t3y' },
          h('div', { class:'tip', style:{ marginBottom:'4px' } }, dyn ? 'Championship odds by season, change in pts' : `${CURRENT_SEASON} championship odds, change in pts`),
          h('div', { class:'t3y-head' },
            h('span', { class:'t3y-label' }, ''),
            h('span', { class:'t3y-cell tip' }, 'Side A'),
            h('span', { class:'t3y-sep' }, ''),
            h('span', { class:'t3y-cell tip' }, 'Side B'),
          ),
          ...titleRows.map(r => r.row),
          h('div', { class:'trade-title-values' },
            h('div', { class:'trade-title-side' },
              h('span', { class:'trade-title-side-label' }, 'Side A'), titleA),
            h('div', { class:'trade-title-side' },
              h('span', { class:'trade-title-side-label' }, 'Side B'), titleB)),
          runTitleOdds,
          titleMeta,
        ),
        dyn ? h('div', { class:'t3y' },
          h('div', { class:'tip', style:{ marginBottom:'4px' } }, 'Year-by-Year Team Strength Δ'),
          h('div', { class:'t3y-head' },
            h('span', { class:'t3y-label' }, ''),
            h('span', { class:'t3y-cell tip' }, 'Side A'),
            h('span', { class:'t3y-sep' }, ''),
            h('span', { class:'t3y-cell tip' }, 'Side B'),
          ),
          ...yearRows.map(([r]) => r.row),
          h('div', { class:'tip t3y-note' }, 'Value received minus value sent in each season, not the lineup change (Post-Trade Strength Δ is that); the line under it is the post-trade lineup strength and league rank. Players age via position curve; picks count 0 until their draft year, then convert as age-22 WR and age forward.')
        ) : null,
        h('div', { style:{ marginTop:'14px' } },
          h('button', { class:'ghost', style:{ width:'100%' }, onclick: () => {
            TRADE_STATE.sideA.picks = new Set(); TRADE_STATE.sideB.picks = new Set();
            KT.syncSide('A'); KT.syncSide('B'); KT.refreshMiddle(lg);
          }}, 'Reset Trade')
        )
      ),
    );
    const out = { node, aVal, bVal, verdict, fair, premiumNote, deltaA, deltaB, strengthNote, lineupA, lineupB,
      titleA, titleB, titleMeta, runTitleOdds, titleRows, yearRows, title: null };
    return out;
  }
  // ============================================================
  // Dynasty aging model, used by trade-calc 3-year outlook
  // ============================================================
  // dynastyDecay(currentAge, pos) returns the one-year multiplier on dynasty
  // value. Position peaks come from public dynasty curves; RB cliff is steepest
  // (28+ falls fast), WR/TE slower, QB slowest. Picks float at 1.0 (their
  // value is the discounted-rookie expectation; conversion gain/loss roughly
  // cancels within a few years).
  function dynastyDecay(currentAge, pos) {
    if (pos === 'PICK' || pos == null) return 1.0;
    const peaks = { QB: [26, 33], RB: [23, 27], WR: [24, 29], TE: [25, 30] };
    const [lo, hi] = peaks[pos] || [24, 29];
    const next = currentAge + 1;
    if (next < lo) return 1.06;       // pre-peak, growing
    if (next <= hi) return 1.00;      // peak years
    const yearsPast = next - hi;
    const decayPerYear = { RB: 0.22, WR: 0.10, TE: 0.10, QB: 0.05 }[pos] || 0.10;
    return Math.max(0.4, 1 - decayPerYear * yearsPast);
  }

  function projectAssetValue(currentVal, age, pos, yearsOut) {
    let v = currentVal;
    let a = age || 25; // unknown age → assume prime
    for (let i = 0; i < yearsOut; i++) {
      v *= dynastyDecay(a + i, pos);
    }
    return v;
  }

  // Project a trade-side ON-FIELD contribution at +N years. This is distinct
  // from the dynasty trade value shown at the top of the calc: a 2027 R1 pick
  // is worth real dynasty value today (you can trade it), but it does NOT help
  // you win the 2026 season, it has no on-field contribution until it converts
  // to a rookie at the 2027 draft.
  //
  // Picks model:
  //   - N < yearsToDraft  → 0 (future pick, not on the field yet)
  //   - N ≥ yearsToDraft  → converted to rookie. Modeled as an age-22 WR
  //                         starting at the pick's value, then aged forward.
  function projectSideValue(keys, lg, yearsOut) {
    let total = 0;
    const curYear = new Date().getFullYear();
    for (const k of keys) {
      if (isPickKey(k)) {
        const { season, round, originRosterId } = parsePickKey(k);
        const yearsToDraft = Math.max(0, parseInt(season, 10) - curYear);
        if (yearsOut < yearsToDraft) continue; // not on field yet
        const v = pickValue(season, round, originRosterId, lg);
        total += projectAssetValue(v, 22, 'WR', yearsOut - yearsToDraft);
        continue;
      }
      const sleeper = window.PLAYERS[k];
      if (!sleeper) continue;
      const ranked = rankIndex().bySleeperId.get(k) || rankIndex().byName.get(norm(sleeper.name));
      if (!ranked) continue;
      const v = tierValue(ranked, lg);
      total += projectAssetValue(v, sleeper.age, ranked.pos, yearsOut);
    }
    return total;
  }

  // Project a roster's on-field team strength at horizon N. This IS
  // startingStrength (PV at year 0, FV after, picks folded in as aged rookies),
  // so the trade rows read on the standings' scale and fill a legal lineup. A
  // hand-rolled top-K used to live here and started two QBs in a 1QB league.
  function projectedRosterStrength(roster, lg, yearsOut) {
    return roster ? startingStrength(roster, lg, yearsOut, true) : 0;
  }

  // The roster as it looks after a trade: sent players leave the active list and
  // the taxi/IR lists, received players join the active list. Picks are not
  // players, so they are ignored here.
  function tradedRoster(roster, sendKeys, receiveKeys) {
    const out = new Set([...sendKeys].map(String));
    const keep = (ids) => (ids || []).map(String).filter(id => !out.has(id));
    const recv = [...receiveKeys].filter(k => !isPickKey(k)).map(String);
    return { ...roster, players: [...keep(roster.players), ...recv], taxi: keep(roster.taxi), reserve: keep(roster.reserve) };
  }

  // Same as projectedRosterStrength but with a trade swap applied: remove
  // sendKeys (players + picks the side is sending), add receiveKeys (players +
  // picks coming in). Used to compute each side's post-trade strength + rank
  // at each year of the outlook.
  function projectedTradeStrength(lg, rosterId, sendKeys, receiveKeys, yearsOut, price = null) {
    const roster = lg.rosters.find(r => r.roster_id === rosterId);
    if (!roster) return 0;
    // Post-trade owned picks (send removed, receive added).
    const byKey = new Map(rosterOwnedPicks(rosterId, lg, Math.max(2, yearsOut + 1)).map(p => [pickKey(p.season, p.round, p.originRosterId), p]));
    for (const k of sendKeys) if (isPickKey(k)) byKey.delete(k);
    for (const k of receiveKeys) if (isPickKey(k) && !byKey.has(k)) { const { season, round, originRosterId } = parsePickKey(k); byKey.set(k, { season, round, originRosterId, value: price ? price(k) : pickValue(season, round, originRosterId, lg) }); }
    return startingStrength(tradedRoster(roster, sendKeys, receiveKeys), lg, yearsOut, true, [...byKey.values()]);
  }

  // For each year of the outlook, compute both sides' projected total + rank
  // among the full league. Side A and Side B get the trade applied; the other
  // rosters project untouched.
  function projectedTradeRanks(lg, sideA, sideB, yearsOut) {
    const scored = lg.rosters.map(r => {
      let s;
      if (r.roster_id === sideA.rosterId)      s = projectedTradeStrength(lg, r.roster_id, sideA.send, sideA.recv, yearsOut);
      else if (r.roster_id === sideB.rosterId) s = projectedTradeStrength(lg, r.roster_id, sideB.send, sideB.recv, yearsOut);
      else                                      s = projectedRosterStrength(r, lg, yearsOut);
      return { id: r.roster_id, s };
    }).sort((a, b) => b.s - a.s);
    const rankOf = (id) => scored.findIndex(x => x.id === id) + 1;
    const aRow = scored.find(x => x.id === sideA.rosterId);
    const bRow = scored.find(x => x.id === sideB.rosterId);
    return {
      total: scored.length,
      aTotal: aRow ? aRow.s : 0,
      aRank:  aRow ? rankOf(sideA.rosterId) : 0,
      bTotal: bRow ? bRow.s : 0,
      bRank:  bRow ? rankOf(sideB.rosterId) : 0,
    };
  }

  function simulateRosterStrength(lg, rosterId, removeIds, addIds) {
    const roster = lg.rosters.find(r => r.roster_id === rosterId);
    if (!roster) return { before: 0, after: 0, delta: 0 };
    // Present starting-lineup value (PV basis), same scale as the standings. Picks
    // don't count at year 0, so this Δ is the immediate lineup change from the
    // player swap; pick impact shows in the year-by-year outlook below. Both
    // lineups claim from the waiver wire, so a slot the trade empties costs the
    // gap to the best free body, never a free pass: an empty dynasty slot used to
    // score 0 while the pieces coming back filled the others, and a taco roster
    // with no QB left read +15.9.
    const traded = tradedRoster(roster, removeIds, addIds);
    const before = startingStrength(roster, lg, 0, false, null, true);
    let after = startingStrength(traded, lg, 0, false, null, true);
    // Dynasty prices a lineup in KTC, which calls a 1QB quarterback replaceable:
    // true of his market value, false of his lineup (taco: Allen 77.6 KTC, 354.6
    // pts; the best free QB 158.8). So a trade that hands a starting slot to the
    // waiver wire, one a rostered player held before, cannot read as a gain.
    if (isDynastyLeague(lg)) {
      const free = new Set(waiverIds(lg)), slots = offenseStartingSlots(lg);
      const bySlot = (r) => fillLineup(startableIds(r).concat([...free]).filter(pid => !isSidelined(pid))
        .map(pid => ({ pid, pos: window.PLAYERS[pid]?.pos, v: playerValue(pid, lg) })).filter(a => a.v > 0), slots, false, true);
      const was = bySlot(roster), now = bySlot(traded);
      if (now.some((a, i) => a && free.has(a.pid) && was[i] && !free.has(was[i].pid))) after = Math.min(after, before);
    }
    return { before, after, delta: Math.round((after - before) * 10) / 10 };
  }

  // ============================================================
  // ROUTE: Action Center
  // Aggregates the highest-priority trade actions across all leagues
  // ============================================================
  // ============================================================
  // What to Look For - the weekly watch board
  // ============================================================
  // Sunday morning the question is never "who is good", it is "which names move
  // MY money today". A start in the $150 league is worth five of one in the $30
  // league, so the board weights every projection by that league's buy-in rather
  // than counting leagues equally: 18 points in The League outranks 24 in
  // Washington. Rooting for and hate-watching are the same arithmetic with the
  // sign flipped, and a player who is on my team in one league and across from
  // me in another is the whole reason the third panel exists.
  const LEAGUE_SWATCHES = [
    'var(--amber)', 'var(--accent)', 'var(--blue)', 'var(--green)', 'var(--cat-vet)',
    'var(--cat-stlw)', 'var(--fg-2)',
  ];

  function leagueSwatch(leagueId) {
    const all = window.LEAGUES || [];
    const i = all.findIndex(l => String(l.id) === String(leagueId));
    return LEAGUE_SWATCHES[(i < 0 ? 0 : i) % LEAGUE_SWATCHES.length];
  }

  // Weekly projected points for one Sleeper player id. Vegas is the market
  // number and wins when it exists; the Sleeper model column is the fallback so
  // a player with no prop market still carries weight instead of dropping to
  // zero and silently vanishing off the board.
  // Expected points for a kicker, from the two-stage model in kickers.js. Only
  // covers the current week's slate, and returns null for anyone not on it, so
  // a bye-week or just-signed kicker still falls through to `unpriced` instead
  // of being priced off a stale board.
  let _kickerProj = null;
  function kickerProjFor(pid) {
    if (!window.KICKER_MODEL) return null;
    if (!_kickerProj) {
      _kickerProj = new Map((window.KICKER_MODEL.kickers || [])
        .map(k => [String(k.id), Number(k.exp)]));
    }
    const v = _kickerProj.get(String(pid));
    return Number.isFinite(v) ? v : null;
  }

  function weeklyProjFor(pid, week) {
    if (!weeklyProjFor._map) {
      const rows = (window.WEEKLY_RANKINGS || {}).players || [];
      weeklyProjFor._map = new Map(rows.map(r => [String(r.id), r]));
    }
    const row = weeklyProjFor._map.get(String(pid));
    if (row) {
      if (row.vegas != null) return { pts: Number(row.vegas) || 0, source: 'vegas' };
      const model = (row.sleeper || [])[(week || 1) - 1];
      if (model != null) return { pts: Number(model) || 0, source: 'sleeper' };
    }
    // Kickers are absent from the weekly feed entirely, so every one of them
    // used to price at exactly 0.0 and fall into the board's `unpriced` bucket.
    // In a league that starts a kicker that is a real slot scored as nothing.
    // The kicker model covers them, so use it rather than dropping the row.
    const k = kickerProjFor(pid);
    if (k != null) return { pts: k, source: 'kicker-model' };
    return { pts: 0, source: null };
  }

  function weeklyGameFor(team) {
    return (window.WEEKLY_RANKINGS?.games || {})[String(team || '').toUpperCase()] || null;
  }

  function kickoffLabel(value) {
    if (!value) return 'TBD';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'TBD';
    return new Intl.DateTimeFormat(undefined, {
      weekday:'short', hour:'numeric', minute:'2-digit',
    }).format(date).replace(',', '').replace(/\s+/g, ' ').trim();
  }

  // The board itself. Pure over window.LEAGUES + window.WEEKLY_RANKINGS so the
  // math is testable without a DOM.
  function watchBoard() {
    const leagues = [];
    const byPid = new Map();
    let week = (window.WEEKLY_RANKINGS || {}).currentWeek || 1;

    for (const lg of window.LEAGUES || []) {
      const me = (lg.rosters || []).find(r => r.is_me);
      if (!me) continue;
      const oppId = me.opponent_roster_id;
      const opp = oppId == null ? null : (lg.rosters || []).find(r => r.roster_id === oppId);
      const buyIn = Number(lg.buy_in) || 0;
      const lgWeek = Number(lg.week) || week;
      if (lg.week) week = lgWeek;
      leagues.push({
        id: lg.id, name: lg.short_name || lg.name, buyIn, week: lgWeek,
        color: leagueSwatch(lg.id), me, opp,
        oppName: opp ? (opp.team_name || opp.owner_name) : null,
      });
      // "0" is Sleeper's empty-slot marker, not a player.
      const add = (pid, side) => {
        if (!pid || pid === '0') return;
        const key = String(pid);
        const proj = weeklyProjFor(key, lgWeek);
        let row = byPid.get(key);
        if (!row) { row = { pid: key, entries: [], index: 0, gross: 0, proj: proj.pts }; byPid.set(key, row); }
        row.proj = Math.max(row.proj, proj.pts);
        const weight = side * buyIn * proj.pts / 100;
        row.entries.push({
          leagueId: lg.id, league: lg.short_name || lg.name, color: leagueSwatch(lg.id),
          buyIn, side, proj: proj.pts, projSource: proj.source, weight,
        });
        row.index += weight;
        row.gross += Math.abs(weight);
      };
      for (const pid of (me.starters || [])) add(pid, 1);
      if (opp) for (const pid of (opp.starters || [])) add(pid, -1);
    }

    const rooting = [], hating = [], split = [], unpriced = [];
    for (const row of byPid.values()) {
      const mine = row.entries.some(e => e.side > 0);
      const against = row.entries.some(e => e.side < 0);
      row.side = mine && against ? 'split' : (mine ? 'mine' : 'against');
      // Kickers, defenses and IDP have no weekly projection in the feed, so
      // every one of them scores exactly 0.0. Ranking them pads the bottom of
      // all three panels with rows that say nothing; they get counted and named
      // under the board instead, so they are visibly excluded rather than lost.
      if (row.gross === 0) { unpriced.push(row); continue; }
      (row.side === 'split' ? split : (mine ? rooting : hating)).push(row);
    }
    // Rooting and hating sort on the signed index, which for a one-sided player
    // is just its magnitude. The split panel sorts on gross dollars instead: a
    // net near zero there is the MOST interesting row, not the least, and a
    // signed sort would bury it under the lopsided ones.
    rooting.sort((a, b) => b.index - a.index);
    hating.sort((a, b) => a.index - b.index);
    split.sort((a, b) => b.gross - a.gross);

    const atStake = leagues.reduce((sum, l) => sum + (l.opp ? l.buyIn : 0), 0);
    return { week, leagues, rooting, hating, split, unpriced, atStake };
  }

  function viewWatch() {
    const main = $('#main');
    main.innerHTML = '';
    const board = watchBoard();
    const live = board.leagues.filter(l => l.opp);

    main.appendChild(pageHeader({
      eyebrow: 'OVERVIEW',
      title: 'What to Look For',
      sub: live.length
        ? `Week ${board.week}. Every starter across ${live.length} leagues, weighted by what the league costs to play in.`
        : 'No matchups posted yet. Run refresh.ps1 once the week opens.',
      badge: live.length ? `$${fmt.num(board.atStake)} live` : null,
    }));

    if (!live.length) {
      main.appendChild(h('div', { class:'empty' }, 'No opponent is set in any league for this week.'));
      return;
    }

    // League key: which color is which league, what it costs, who I drew.
    main.appendChild(h('div', { class:'watch-key' },
      ...live.map(l => h('a', { class:'watch-key-item', href:`#league/${l.id}`, style:{ '--lg':l.color } },
        h('span', { class:'watch-key-dot' }),
        h('span', { class:'watch-key-name' }, l.name),
        h('span', { class:'watch-key-buyin tnum' }, `$${l.buyIn}`),
        h('span', { class:'watch-key-opp' }, `vs ${l.oppName}`),
      ))
    ));

    // One shared scale across all three panels, so a bar means the same number
    // of dollars wherever it appears. Per-panel scaling would make the top row
    // of the thinnest panel look as loud as the biggest name on the board.
    const maxScale = Math.max(1,
      ...board.rooting.map(r => Math.abs(r.index)),
      ...board.hating.map(r => Math.abs(r.index)),
      ...board.split.map(r => r.gross));

    const playerRow = (row, rank, scaleBy) => {
      const p = (window.PLAYERS || {})[row.pid] || {};
      const name = p.name || p.full_name || `[${row.pid}]`;
      const meta = [p.position || p.pos, p.team].filter(Boolean).join(' · ');
      const game = weeklyGameFor(p.team);
      const opponent = game ? `${game.home ? 'vs' : '@'} ${game.opp}` : 'BYE';
      const gameTime = game ? kickoffLabel(game.kickoff) : 'No game';
      const value = scaleBy === 'gross' ? row.gross : row.index;
      const tone = row.index > 0 ? 'up' : (row.index < 0 ? 'down' : '');
      return h('div', { class:'watch-row' },
        h('span', { class:'watch-rank tnum' }, String(rank)),
        h('span', { class:'watch-name' },
          h('span', { class:'watch-player' }, name),
          h('span', { class:'watch-meta' },
            h('span', { class:'watch-pos-team' }, meta || ' '),
            ' · ', h('span', { class:'watch-opp' }, opponent),
            ' · ', h('span', { class:'watch-time' }, gameTime)),
        ),
        h('span', { class:'watch-chips' },
          ...row.entries
            .slice()
            .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
            .map(e => h('span', {
              class: `watch-chip ${e.side > 0 ? 'for' : 'against'}`,
              style: { '--lg': e.color },
              title: `${e.league}: ${e.side > 0 ? 'starting for you' : 'starting against you'}, $${e.buyIn} buy-in, ${fmt.decimal(e.proj, 1)} projected`,
            },
              `${e.side > 0 ? '▲' : '▼'} ${e.league} `,
              h('span', { class:'wc-amt' }, `$${e.buyIn}`)))
        ),
        h('span', { class:'watch-proj tnum', title:'Best weekly projection, Vegas where a market exists' }, fmt.decimal(row.proj, 1)),
        h('span', { class:`watch-index tnum ${tone}`,
          title: `${(row.index > 0 ? '+' : '') + fmt.decimal(row.index, 1)}: `
               + row.entries.map(e => `${e.league} $${e.buyIn} x ${fmt.decimal(e.proj, 1)} ${e.side > 0 ? 'for' : 'against'} you`).join(', ')
               + ', divided by 100.' },
          (row.index > 0 ? '+' : '') + fmt.decimal(row.index, 1)),
        h('span', { class:'watch-bar' },
          h('span', { class:`watch-bar-fill ${tone}`, style:{ width:`${Math.min(100, Math.abs(value) / maxScale * 100)}%` } })
        ),
      );
    };

    const panel = (title, sub, rows, scaleBy, emptyMsg) => h('div', { class:'card watch-panel' },
      h('div', { class:'card-title' }, title,
        h('span', { class:'watch-panel-count tnum' }, String(rows.length))),
      h('p', { class:'watch-panel-sub' }, sub),
      rows.length
        ? h('div', { class:'watch-rows' },
            // Header row. The two numbers were unlabelled and the only explanation
            // was a card at the very bottom of the page.
            h('div', { class:'watch-row watch-row-head' },
              h('span', { class:'watch-rank' }, ''),
              h('span', { class:'watch-name' }, ''),
              h('span', { class:'watch-chips' }, ''),
              h('span', { class:'watch-proj', title:'Projected fantasy points this week' }, 'PROJ'),
              h('span', { class:'watch-index',
                title: scaleBy === 'gross'
                  ? 'Gross dollars at stake: buy-in times projection, added across every league he appears in regardless of side'
                  : 'Index: buy-in times projected points across your leagues, divided by 100. Positive means he earns for you, negative means he costs you.' },
                scaleBy === 'gross' ? 'STAKE' : 'INDEX'),
              h('span', { class:'watch-bar', title:'Bar length is this row against the biggest number on the whole board, so panels are comparable' }, '')),
            ...rows.map((r, i) => playerRow(r, i + 1, scaleBy)))
        : h('div', { class:'tip', style:{ padding:'8px 2px' } }, emptyMsg),
    );

    main.appendChild(h('div', { class:'watch-panels' },
      panel('Rooting for', 'Only on my teams.',
        board.rooting, 'index', 'Nobody.'),
      panel('Good and bad', 'On my team in one, opponent in another.',
        board.split, 'gross', 'No overlap this week.'),
      panel('Hate watching', 'Only on opponents.',
        board.hating, 'index', 'Nobody.'),
    ));

    if (board.unpriced.length) {
      const names = board.unpriced
        .map(r => ((window.PLAYERS || {})[r.pid] || {}))
        .map(p => p.name || p.full_name)
        .filter(Boolean)
        .sort();
      main.appendChild(h('div', { class:'card' },
        h('div', { class:'card-title' }, 'Not ranked',
          h('span', { class:'watch-panel-count tnum' }, String(board.unpriced.length))),
        h('p', { class:'watch-panel-sub', style:{ margin:'0' } },
          'Starting somewhere this week with no weekly projection in the feed, which is every kicker, defense and IDP. '
          + 'They would all score exactly 0.0, so they sit here rather than padding the panels: ' + names.join(', ') + '.'),
      ));
    }

    main.appendChild(h('div', { class:'card' },
      h('div', { class:'card-title' }, 'How the index works'),
      h('p', { class:'muted', style:{ margin:'0' } },
        'Index is the sum across your leagues of buy-in times projected points, divided by 100, positive when he starts for you and negative when he starts against you. '
        + 'A 20 point projection in The League scores 30.0 and the same player in Washington scores 6.0, so the order is by dollars exposed rather than by points. '
        + 'Projections are the Vegas prop consensus where a market exists and the Sleeper model otherwise. Only this week’s starters are counted, because a bench player carries no money.'),
    ));
  }

  // ============================================================
  // Two marks the user sets, and the board they feed
  // ============================================================
  // The Action Center used to compute a suggestion queue. It was usually empty and
  // when it was not, it was guessing at intent it cannot see. These are the two
  // facts only the manager knows: which players he WANTS (star a man not on his
  // roster) and which of his own he is willing to MOVE (trade-block). The board is
  // then his own list rather than a generated one.
  //
  // Stored per player id and per league, because wanting Gibbs in yuH is a different
  // plan from wanting him in taco, and a man can be blocked in one league while
  // untouchable in another.
  const MARKS_KEY = 'tier-sheet-marks-v1';
  let _marks = null;

  function loadMarks() {
    if (_marks) return _marks;
    try { _marks = JSON.parse(localStorage.getItem(MARKS_KEY) || '{}'); }
    catch { _marks = {}; }
    if (!_marks.target) _marks.target = {};   // `${leagueId}:${pid}` -> {ts, note}
    if (!_marks.block) _marks.block = {};
    return _marks;
  }
  function saveMarks() {
    try { localStorage.setItem(MARKS_KEY, JSON.stringify(loadMarks())); } catch {}
  }
  const markKey = (leagueId, pid) => `${leagueId}:${pid}`;
  function isMarked(kind, leagueId, pid) {
    return !!loadMarks()[kind][markKey(leagueId, pid)];
  }
  function toggleMark(kind, leagueId, pid, name) {
    const m = loadMarks(), k = markKey(leagueId, pid);
    if (m[kind][k]) delete m[kind][k];
    else m[kind][k] = { ts: Date.now(), name: name || null };
    saveMarks();
    return !!m[kind][k];
  }
  // A player can only be a target if he is NOT yours, and only blockable if he IS.
  // Deciding that here keeps every call site from re-deriving it.
  function markKindFor(leagueId, pid) {
    const lg = (window.LEAGUES || []).find(l => String(l.id) === String(leagueId));
    if (!lg || !leagueFitsPos(lg, window.PLAYERS?.[pid]?.pos)) return null;
    const mine = lg.rosters.find(r => r.is_me);
    if (!mine) return null;
    return (mine.players || []).map(String).includes(String(pid)) ? 'block' : 'target';
  }

  // The toggle itself: a star for a man you want, a tag for one you will move.
  function markButton(leagueId, pid, name, onChange) {
    const kind = markKindFor(leagueId, pid);
    if (!kind) return null;
    const label = kind === 'target' ? 'Target' : 'Trade block';
    const glyph = kind === 'target' ? '★' : '⚑';
    const marked = isMarked(kind, leagueId, pid);
    const btn = h('button', {
      type: 'button',
      class: `mark-btn mark-${kind}${marked ? ' on' : ''}`,
      'aria-label': `${label} ${name}`,
      'aria-pressed': String(marked),
      title: kind === 'target'
        ? 'Star him as a target. He shows up on your Action Center board.'
        : 'Flag him as available. He shows up on your Action Center board.',
      onclick: (e) => {
        e.stopPropagation();
        const on = toggleMark(kind, leagueId, pid, name);
        btn.classList.toggle('on', on);
        btn.setAttribute('aria-pressed', String(on));
        if (onChange) onChange(on);
      },
    }, h('span', { class: 'mark-glyph' }, glyph), h('span', { class: 'mark-label' }, label));
    return btn;
  }

  // The board: what you marked, grouped by league, with the numbers that matter for
  // each kind. Targets get what he would cost; blocks get what he is worth to you.
  function marksBoard() {
    const m = loadMarks();
    const wrap = h('div', { class: 'marks-board' });
    const rows = [];
    for (const kind of ['target', 'block']) {
      for (const [k, v] of Object.entries(m[kind])) {
        const [leagueId, pid] = k.split(':');
        const lg = (window.LEAGUES || []).find(l => String(l.id) === String(leagueId));
        if (!lg) continue;
        const sp = window.PLAYERS?.[pid];
        const name = sp?.name || v.name || pid;
        const owner = (lg.rosters || []).find(r => (r.players || []).map(String).includes(String(pid)));
        rows.push({ kind, leagueId, pid, lg, name, pos: sp?.pos, owner, ts: v.ts || 0 });
      }
    }
    if (!rows.length) {
      wrap.appendChild(h('div', { class: 'card' },
        h('div', { class: 'card-title' }, 'Nothing marked yet'),
        h('p', { class: 'tip', style: { margin: 0 } },
          'Open any player and hit ★ Target if you want him, or ⚑ Trade block if you are '
          + 'willing to move one of yours. Whatever you mark lands here, per league.')));
      return wrap;
    }
    rows.sort((a, b) => (a.kind === b.kind ? b.ts - a.ts : a.kind === 'target' ? -1 : 1));

    for (const kind of ['target', 'block']) {
      const group = rows.filter(r => r.kind === kind);
      if (!group.length) continue;
      const body = h('tbody');
      for (const r of group) {
        const ranked = rankIndex().byName.get(norm(r.name));
        const val = ranked ? tierValue(ranked, r.lg) : null;
        const ros = rosPointsByPid(r.lg).get(String(r.pid))?.pts;
        body.appendChild(h('tr', { class: 'clickable', onclick: () => openPlayerDetail(r.name, r.pid) },
          h('td', { class: 'sr-name' }, r.name, r.pid ? injuryChip(r.pid) : null),
          h('td', { class: 'sr-pos' }, r.pos ? posChip(r.pos) : null),
          h('td', null, h('span', { class: 'tip' }, r.lg.short_name || r.lg.name)),
          h('td', null, kind === 'target'
            ? h('span', { class: 'tip' }, r.owner ? (r.owner.team_name || r.owner.owner_name) : 'free agent')
            : h('span', { class: 'tip' }, 'yours')),
          h('td', { class: 'sr-num tnum', title: 'Value on the 0-110 scale' },
            val != null ? fmt.decimal(val, 0) : '·'),
          h('td', { class: 'sr-num tnum', title: 'Projected points, rest of season' },
            ros != null ? fmt.decimal(ros, 0) : '·'),
          h('td', null, r.owner && !r.owner.is_me
            ? h('a', { href: `#trade/${r.lg.id}`, onclick: (e) => { e.stopPropagation(); openTradeFor(r.pid, r.lg.id, r.owner.roster_id); } },
                h('button', { class: 'ghost', style: { padding: '2px 10px', fontSize: '12px' } }, 'Trade ⇄'))
            : null),
          h('td', null, h('button', {
            class: 'todo-x', title: 'Unmark',
            onclick: (e) => { e.stopPropagation(); toggleMark(kind, r.lg.id, r.pid); route(); },
          }, '×'))));
      }
      wrap.appendChild(h('div', { class: 'card' },
        h('div', { class: 'card-title' },
          kind === 'target' ? '★ Targets' : '⚑ On the block',
          h('span', { class: 'faab-scope' },
            kind === 'target' ? 'players you want, not on your roster' : 'your players you will move')),
        h('table', { class: 'data slot-table' },
          h('thead', null, h('tr', null,
            h('th', null, 'Player'), h('th', null, 'Pos'), h('th', null, 'League'),
            h('th', null, kind === 'target' ? 'Owner' : 'Team'),
            h('th', { class: 'right' }, 'Value'), h('th', { class: 'right' }, 'ROS'),
            h('th', null, ''), h('th', null, ''))),
          body)));
    }
    return wrap;
  }

  function viewActionCenter() {
    const main = $('#main');
    main.innerHTML = '';
    main.appendChild(h('div', { class:'page-header' },
      h('div', null,
        h('div', { class:'page-eyebrow' }, 'OVERVIEW'),
        h('h1', { class:'page-title' }, 'Action Center'),
        h('p', { class:'page-sub' }, 'Your own to-do list for the week. Add anything; pull from the suggestions below.')
      )
    ));

    // ===== Personal to-do list (localStorage, your own items) =====
    const TKEY = 'tier-sheet-todos';
    const loadTodos = () => { try { return JSON.parse(localStorage.getItem(TKEY) || '[]'); } catch { return []; } };
    const saveTodos = (t) => { try { localStorage.setItem(TKEY, JSON.stringify(t)); } catch {} };
    let todos = loadTodos();
    const listWrap = h('div', { class:'todo-list' });
    const renderTodos = () => {
      listWrap.innerHTML = '';
      const sorted = [...todos].sort((a, b) => (a.done - b.done) || (b.ts - a.ts));
      if (!sorted.length) { listWrap.appendChild(h('div', { class:'tip', style:{ padding:'6px 2px' } }, 'No to-dos yet. Type one above, or add from the suggestions below.')); return; }
      for (const t of sorted) {
        listWrap.appendChild(h('div', { class:'todo-row' + (t.done ? ' done' : '') },
          h('input', { type:'checkbox', checked: t.done ? '' : null, onchange: () => { t.done = !t.done; saveTodos(todos); renderTodos(); } }),
          h('span', { class:'todo-text' }, t.text),
          h('button', { class:'todo-x', title:'Delete', onclick: () => { todos = todos.filter(x => x.id !== t.id); saveTodos(todos); renderTodos(); } }, '×'),
        ));
      }
    };
    const addTodo = (text) => {
      text = (text || '').trim(); if (!text) return;
      todos.push({ id: 't' + Date.now() + Math.round(Math.random() * 1e4), text, done: false, ts: Date.now() });
      saveTodos(todos); renderTodos();
    };
    const todoInput = h('input', { type:'text', placeholder:'Add a to-do… e.g. "Offer Gibbs for a 2027 1st in yuH"', style:{ flex:1, minWidth:0 },
      onkeydown: (e) => { if (e.key === 'Enter') { addTodo(e.target.value); e.target.value = ''; } } });
    main.appendChild(h('div', { class:'card' },
      h('div', { class:'card-title' }, 'My To-Dos'),
      h('div', { class:'todo-add' }, todoInput, h('button', { class:'primary', onclick: () => { addTodo(todoInput.value); todoInput.value = ''; todoInput.focus(); } }, 'Add')),
      listWrap,
    ));
    renderTodos();

    // Your own board, not a generated queue. The computed suggestion engine that
    // lived here was usually empty and otherwise guessed at intent it cannot see,
    // so the two marks the manager actually sets drive this instead: star a man you
    // want, flag one of yours you will move.
    main.appendChild(marksBoard());
  }

  // ============================================================
  // ROUTE: Strategy / Playbook
  // ============================================================
  function viewStrategy() {
    const main = $('#main');
    main.innerHTML = '';
    main.appendChild(h('div', { class:'page-header' },
      h('div', null,
        h('div', { class:'page-eyebrow' }, 'REFERENCE'),
        h('h1', { class:'page-title' }, 'Framework'),
        h('p', { class:'page-sub' }, 'The dynasty rules this site evaluates against your rosters. Distilled from public dynasty content. Sources at the bottom.')
      )
    ));
    if (!window.STRATEGY) {
      main.appendChild(h('div', { class:'empty' }, 'Strategy data not loaded.'));
      return;
    }
    const S = window.STRATEGY;

    // ----- Principles -----
    main.appendChild(h('h2', { class:'section-title' }, 'Core Principles'));
    main.appendChild(h('div', { class:'card', style:{ padding:'18px 22px' } },
      h('ol', { style:{ margin:0, paddingLeft:'20px', lineHeight:'1.8' } },
        ...S.principles.map(p => h('li', { style:{ color:'var(--fg-1)' } }, p))
      )
    ));

    // ----- Age curves -----
    main.appendChild(h('h2', { class:'section-title' }, 'Position Age Curves'));
    main.appendChild(h('div', { class:'card', style:{ padding:0, overflow:'hidden' } },
      h('table', { class:'data snug' },
        h('thead', null, h('tr', null,
          h('th', null, 'Position'),
          h('th', { class:'right' }, 'Peak Age'),
          h('th', { class:'right' }, 'Sell Window'),
          h('th', { class:'right' }, 'Hard Sell'),
          h('th', null, 'Rule'),
        )),
        h('tbody', null,
          ...Object.entries(S.age_curve).map(([pos, c]) => h('tr', null,
            h('td', null, h('strong', null, pos)),
            h('td', { class:'right tnum' }, c.peak_avg),
            h('td', { class:'right tnum', style:{ color:'var(--amber)', fontWeight:600 } }, c.sell_age),
            h('td', { class:'right tnum', style:{ color:'var(--red)', fontWeight:600 } }, c.hard_sell_age),
            h('td', null, h('span', { class:'tip' },
              pos === 'RB' ? 'Cliff is steep; trade window is the year before consensus catches on.'
              : pos === 'WR' ? 'Decline is gradual; trade value peaks before production drops.'
              : pos === 'TE' ? 'Breakouts often arrive at 25-27; hold if Foundational+.'
              : 'QBs age slowest; rushing QBs decline faster than pocket passers.'
            ))
          ))
        )
      )
    ));

    // ----- Rebuild Phases -----
    main.appendChild(h('h2', { class:'section-title' }, 'Rebuild Phases (3-Year Arc)'));
    main.appendChild(h('div', { class:'card-grid cols-2' },
      ...Object.values(S.rebuild_phases).map(p => h('div', { class:'card' },
        h('div', { class:'card-title' }, p.label, ' · Year ', String(p.year)),
        h('div', { style:{ marginBottom:'8px' } }, h('strong', null, 'Posture: '), p.posture),
        h('div', { class:'tip', style:{ marginBottom:'4px' } }, h('strong', null, 'Enter when: '), p.trigger_in),
        h('div', { class:'tip' }, h('strong', null, 'Exit when: '), p.trigger_out),
      ))
    ));

    // ----- Consolidation -----
    main.appendChild(h('h2', { class:'section-title' }, 'Consolidation (2-for-1 / 3-for-1)'));
    main.appendChild(h('div', { class:'card-grid cols-2' },
      h('div', { class:'card' },
        h('div', { class:'card-title' }, h('span', { style:{ color:'var(--green)' } }, '✓ Consolidate When')),
        h('ul', { style:{ paddingLeft:'18px', margin:0, lineHeight:'1.7' } },
          ...S.consolidation.when_to_consolidate.map(r => h('li', null, r))
        )
      ),
      h('div', { class:'card' },
        h('div', { class:'card-title' }, h('span', { style:{ color:'var(--red)' } }, '✗ Decline When')),
        h('ul', { style:{ paddingLeft:'18px', margin:0, lineHeight:'1.7' } },
          ...S.consolidation.when_to_decline.map(r => h('li', null, r))
        )
      )
    ));
    main.appendChild(h('div', { class:'tip', style:{ marginTop:'8px' } }, S.consolidation.premium_rule_of_thumb));

    // ----- Pick Values -----
    main.appendChild(h('h2', { class:'section-title' }, 'Rookie Pick Values (1QB)'));
    main.appendChild(h('div', { class:'card', style:{ padding:0, overflow:'hidden' } },
      h('table', { class:'data snug' },
        h('thead', null, h('tr', null,
          h('th', null, 'Pick'),
          h('th', { class:'right' }, '1QB Value'),
          h('th', { class:'right' }, 'SF Premium'),
          h('th', null, 'Equivalent'),
        )),
        h('tbody', null,
          ...Object.entries(S.pick_values_1qb)
            .filter(([k]) => !k.startsWith('future') && !k.startsWith('3.') && !k.startsWith('4.'))
            .map(([pick, val]) => {
              const sf = S.pick_sf_premium[pick] || 0;
              const eq = val >= 70 ? 'Cornerstone-A asset'
                : val >= 50 ? 'Cornerstone-B/C asset'
                : val >= 35 ? 'Foundational-S asset'
                : val >= 25 ? 'Foundational-A/B asset'
                : 'Mid Foundational asset';
              return h('tr', null,
                h('td', null, h('strong', null, pick)),
                h('td', { class:'right tnum' }, val),
                h('td', { class:'right tnum', style:{ color: sf > 0 ? 'var(--amber)' : 'var(--fg-3)' } }, sf > 0 ? '+' + sf : '.'),
                h('td', null, h('span', { class:'tip' }, eq)),
              );
            })
        )
      )
    ));

    // ----- Calendar -----
    main.appendChild(h('h2', { class:'section-title' }, 'Calendar'));
    main.appendChild(h('div', { class:'card-grid cols-2' },
      ...Object.entries(S.calendar).map(([window, advice]) => h('div', { class:'card' },
        h('div', { class:'card-title' }, window),
        h('div', { style:{ color:'var(--fg-1)' } }, advice),
      ))
    ));

    // ----- Execution -----
    main.appendChild(h('h2', { class:'section-title' }, 'Trade Execution'));
    main.appendChild(h('div', { class:'card', style:{ padding:'18px 22px' } },
      h('ol', { style:{ margin:0, paddingLeft:'20px', lineHeight:'1.8' } },
        ...S.execution.map(r => h('li', { style:{ color:'var(--fg-1)' } }, r))
      )
    ));

    // ----- Sources -----
    main.appendChild(h('h2', { class:'section-title' }, 'Sources'));
    main.appendChild(h('div', { class:'card' },
      h('div', { class:'tip', style:{ lineHeight:'1.8' } },
        'Synthesized from public dynasty fantasy content:',
        h('ul', { style:{ margin:'8px 0 0 0', paddingLeft:'18px' } },
          h('li', null, h('a', { href:'https://www.fantasypros.com/2026/04/dynasty-fantasy-football-startup-draft-strategy-expert-tips-to-build-a-long-term-contender-2026/', target:'_blank', rel:'noopener' }, 'FantasyPros 2026 Dynasty Startup Strategy')),
          h('li', null, h('a', { href:'https://www.fantasypros.com/2026/05/fantasy-football-rankings-dynasty-trade-value-chart-may-2026-update/', target:'_blank', rel:'noopener' }, 'FantasyPros Dynasty Trade Value Chart, May 2026')),
          h('li', null, h('a', { href:'https://apexfantasyleagues.com/peak-age-nfl-running-back/', target:'_blank', rel:'noopener' }, 'Apex Fantasy: Peak Age for NFL RB')),
          h('li', null, h('a', { href:'https://apexfantasyleagues.com/peak-age-for-nfl-wide-receiver/', target:'_blank', rel:'noopener' }, 'Apex Fantasy: Peak Age for NFL WR')),
          h('li', null, h('a', { href:'https://www.fantasylife.com/articles/dynasty/dynasty-fantasy-football-2-for-1-trade-strategy', target:'_blank', rel:'noopener' }, 'FantasyLife: 2-for-1 Trade Strategy')),
          h('li', null, h('a', { href:'https://www.rotowire.com/football/article/dynasty-fantasy-tanking-rebuilding-strategies-2025-93401', target:'_blank', rel:'noopener' }, 'RotoWire: Tanking and Rebuilding Strategies')),
          h('li', null, h('a', { href:'https://www.playerprofiler.com/article/dynasty-fantasy-football-trades-a-comprehensive-guide/', target:'_blank', rel:'noopener' }, 'PlayerProfiler: Dynasty Trades Guide')),
          h('li', null, 'Domain Dynasty YouTube channel (cornerstones + rookies + bakery videos)'),
        )
      )
    ));
  }

  // ============================================================
  // ROUTE: About
  // ============================================================
  function viewAbout() {
    const main = $('#main');
    main.innerHTML = '';
    main.appendChild(h('div', { class:'page-header' },
      h('div', null,
        h('div', { class:'page-eyebrow' }, 'REFERENCE'),
        h('h1', { class:'page-title' }, 'About'),
        h('p', { class:'page-sub' }, 'How this site computes rankings and team strength.')
      )
    ));
    main.appendChild(h('div', { class:'card' },
      h('h3', null, 'Player Categories'),
      h('p', null, 'Domain Dynasty\'s framework for sorting dynasty assets:'),
      h('ul', null,
        h('li', null, h('strong', null, 'Cornerstone'), ', proven elite production, insulated from dips.'),
        h('li', null, h('strong', null, 'Foundational'), ', elite upside with notable questions (situation, sample size, age).'),
        h('li', null, h('strong', null, 'Upside Premier'), ', unproven but high-upside; rookies and breakout candidates.'),
        h('li', null, h('strong', null, 'Mainstay / Productive Vet / Short-Term League Winner'), ', lower-tier holds.'),
      )
    ));
    main.appendChild(h('div', { class:'card' },
      h('h3', null, 'Team Strength'),
      h('p', null, 'Each player’s value is KTC’s market number (normalized ~0-110). Team rank uses ',
        h('strong', null, 'starting-lineup strength'), ': the sum of your best-K players (K = starter slots), not every rostered player, so hoarding depth doesn’t inflate a team. ',
        h('strong', null, 'PV'), ' is that value now; ', h('strong', null, 'FV'), ' ages each starter forward and folds in owned picks as they convert, so you see where the roster is heading.'),
      h('p', null, h('strong', null, 'Format multipliers:'),
        ' Superflex leagues apply a 1.40× position multiplier to QB values. IDP leagues apply 1.10× to LB values.'),
      h('p', null, 'Overall rank is the average of a player’s rank across every enabled source (players in more sources sort first). The value number itself comes from KTC’s market curve, so source order never changes it; categories and tiers are our own k-means model, not any single source’s labels.'),
    ));
    // Data freshness table (from window.BUILD_INFO / build_all.py).
    const fr = dataFreshness();
    main.appendChild(h('div', { class:'card' },
      h('h3', null, 'Data Freshness'),
      h('p', null, 'Refresh everything with ', h('code', null, 'python projections/build_all.py'), ' (add ', h('code', null, '--core'), ' to skip the slow bio/history scrapes). Amber = older than 3 days.'),
      fr ? h('div', { style:{ overflowX:'auto' } }, h('table', { class:'data fill-last' },
        h('thead', null, h('tr', null, h('th', null, 'Dataset'), h('th', { class:'right' }, 'Age'), h('th', null, 'Built'))),
        h('tbody', null, ...fr.rows.sort((a,b)=>b.ageH-a.ageH).map(r => h('tr', null,
          h('td', null, DATA_LABEL[r.name] || r.name.replace('.js','')),
          h('td', { class:'right tnum', style:{ color: r.ageH > 72 ? 'var(--amber)' : 'var(--fg-1)' } }, r.ageLabel + ' ago'),
          h('td', { class:'tnum', style:{ color:'var(--fg-3)' } }, r.iso.replace('T',' ')),
        ))),
      )) : h('p', { class:'tip' }, 'No build-info.js yet. Run the pipeline to generate it.'),
    ));
  }

  // ============================================================
  // Player detail modal
  // ============================================================
  function openPlayerDetail(name, sleeperId = null) {
    const idx = rankIndex();
    const ranked = sleeperId ? idx.bySleeperId.get(sleeperId) : idx.byName.get(norm(name));
    const resolvedId = sleeperId || ranked?._sleeperId || sleeperIdForFuzzy(name, ranked?.pos);
    const sleeper = window.PLAYERS[resolvedId || ''];
    document.body.appendChild(playerModal(name, ranked, sleeper));
  }
  window.openPlayerDetail = openPlayerDetail;
  // ============================================================
  // Historical career section (powered by data/history.js)
  // ============================================================
  const POS_STAT_COLS = {
    QB:  [['G','games'], ['Yds','passing_yards'], ['TD','passing_tds'], ['INT','interceptions'], ['Ru Yd','rushing_yards'], ['Ru TD','rushing_tds'], ['FP/G','fp_4pt_ppr_per_g']],
    RB:  [['G','games'], ['Att','carries'], ['Yds','rushing_yards'], ['TD','rushing_tds'], ['Rec','receptions'], ['Tgt','targets'], ['Rec Yd','receiving_yards'], ['FP/G','fp_ppr_per_g']],
    WR:  [['G','games'], ['Tgt','targets'], ['Rec','receptions'], ['Yds','receiving_yards'], ['TD','receiving_tds'], ['FP/G','fp_ppr_per_g']],
    TE:  [['G','games'], ['Tgt','targets'], ['Rec','receptions'], ['Yds','receiving_yards'], ['TD','receiving_tds'], ['FP/G','fp_ppr_per_g']],
    LB:  [['G','games'], ['Solo','def_solo'], ['Sk','def_sacks'], ['INT','def_int'], ['FF','def_ff'], ['PD','def_pd'], ['FP/G','fp_idp_per_g']],
    DB:  [['G','games'], ['Solo','def_solo'], ['Sk','def_sacks'], ['INT','def_int'], ['FF','def_ff'], ['PD','def_pd'], ['FP/G','fp_idp_per_g']],
    DL:  [['G','games'], ['Solo','def_solo'], ['Sk','def_sacks'], ['INT','def_int'], ['FF','def_ff'], ['PD','def_pd'], ['FP/G','fp_idp_per_g']],
    S:   [['G','games'], ['Solo','def_solo'], ['Sk','def_sacks'], ['INT','def_int'], ['FF','def_ff'], ['PD','def_pd'], ['FP/G','fp_idp_per_g']],
    CB:  [['G','games'], ['Solo','def_solo'], ['Sk','def_sacks'], ['INT','def_int'], ['FF','def_ff'], ['PD','def_pd'], ['FP/G','fp_idp_per_g']],
    DEF: [['G','games'], ['Solo','def_solo'], ['Sk','def_sacks'], ['INT','def_int'], ['FF','def_ff'], ['PD','def_pd'], ['FP/G','fp_idp_per_g']],
  };
  function fmtStat(v) {
    if (v == null || v === '' || isNaN(v)) return '·';
    const n = Number(v);
    if (Math.abs(n) >= 100) return Math.round(n).toString();
    if (Math.abs(n) >= 10)  return n.toFixed(1);
    return n.toFixed(2);
  }
  function sparkline(spark, color = 'var(--accent)') {
    if (!spark || spark.length < 2) return null;
    const W = 168, H = 36, P = 3;
    const xs = spark.map(d => d.y);
    const ys = spark.map(d => d.v || 0);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMax = Math.max(...ys, 1);
    const xScale = (x) => P + ((x - xMin) / Math.max(xMax - xMin, 1)) * (W - 2*P);
    const yScale = (y) => H - P - (y / yMax) * (H - 2*P);
    const points = spark.map(d => `${xScale(d.y).toFixed(1)},${yScale(d.v||0).toFixed(1)}`).join(' ');
    const last = spark[spark.length - 1];
    const lx = xScale(last.y), ly = yScale(last.v||0);
    const svg = `
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>
        <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.5" fill="${color}"/>
      </svg>`;
    return h('span', { class:'spark', html: svg,
      title:`FP/G trend, ${spark[0].y}${spark.length > 1 ? ` to ${last.y}` : ''}` });
  }
  // Career shape in KTC's Dynasty Value grammar: a filled area under the line, the
  // high and low labelled on the right, the current number called out large, and a
  // signed delta with a direction mark. KTC plots a daily series and this is seasons,
  // so every point gets a dot rather than pretending to a resolution it does not have.
  // KTC value history, weekly since 2023-03-10, keyed by KTC playerID. Absent until
  // build_ktc_history.py has run, so every caller treats it as optional.
  function ktcValueSeries(sleeperName, league) {
    const hist = window.KTC_HISTORY;
    if (!hist || !hist.players) return null;
    const want = norm(sleeperName);
    for (const rec of Object.values(hist.players)) {
      if (norm(rec.name) !== want) continue;
      // Superflex board for a superflex league, 1QB board otherwise, matching how
      // tierValue already picks a KTC board per league.
      const fmt = league?.is_superflex ? 'sf' : 'one';
      // [gridIndex, [values]]: the dates live once in hist.grids, because storing them
      // per player cost 3.9 of the payload's 4.8 MB in repeated strings.
      const ser = rec[fmt] || rec.sf || rec.one;
      if (!Array.isArray(ser)) return null;
      const dates = (hist.grids || [])[ser[0]];
      const vals = ser[1];
      if (!dates || !vals || vals.length !== dates.length) return null;
      // "YYMMDD" to a label the axis can show.
      // `d` is the raw YYMMDD, carried so ktcRangeSlice can cut on a real date
      // instead of assuming a fixed sample interval. `y` stays the axis label.
      return vals.map((v, i) => ({ y: `20${dates[i].slice(0,2)}-${dates[i].slice(2,4)}`, v, d: dates[i] }));
    }
    return null;
  }

  function careerChart(series) {
    // series: [{ key, label, unit, pts:[{y,v}] }]. The first with 2+ points opens.
    const usable = (series || []).filter(s => s.pts && s.pts.length >= 2);
    if (!usable.length) return null;
    const wrap = h('div', { class:'cchart-wrap' });
    const tabs = h('div', { class:'cchart-tabs' });
    const host = h('div', { class:'cchart-host' });
    let active = usable[0].key;
    const draw = () => {
      host.innerHTML = '';
      const chosen = usable.find(s => s.key === active) || usable[0];
      host.appendChild(careerChartOne(chosen.pts, chosen.unit));
      for (const b of tabs.children) b.classList.toggle('active', b.dataset.key === active);
    };
    for (const sx of usable) {
      tabs.appendChild(h('button', {
        class:'cchart-tab', type:'button', dataset:{ key: sx.key },
        onclick: () => { active = sx.key; draw(); },
      }, sx.label));
    }
    if (usable.length > 1) wrap.appendChild(tabs);
    wrap.appendChild(host);
    draw();
    return wrap;
  }

  function careerChartOne(spark, unitLabel) {
    if (!spark || spark.length < 2) return null;
    const pts = spark.map(d => ({ y: String(d.y), v: d.v || 0 }));
    const vals = pts.map(p => p.v);
    const hi = Math.max(...vals), lo = Math.min(...vals);
    const last = pts[pts.length - 1], first = pts[0];
    const delta = Math.round((last.v - first.v) * 10) / 10;
    // Pad the band so a flat career is a flat line across the middle rather than
    // a divide by zero pinned to the top.
    const span = hi - lo || Math.max(hi, 1);
    const W = 320, H = 96, PL = 4, PR = 4, PT = 10, PB = 10;
    const x = (i) => PL + (i / (pts.length - 1)) * (W - PL - PR);
    const y = (v) => PT + (1 - (v - lo) / span) * (H - PT - PB);
    const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
    const area = `${PL},${H - PB} ${line} ${(W - PR).toFixed(1)},${H - PB}`;
    // Dots are only honest at season resolution. A 185-point weekly series gets the
    // peak marked and nothing else, which is what KTC's own chart does.
    const dense = pts.length > 24;
    const dots = pts.map((p, i) => {
      if (dense && p.v !== hi) return '';
      return `<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="${p.v === hi ? 4 : 2.6}" `
        + `fill="${p.v === hi ? 'var(--gold)' : 'var(--band-deep)'}" stroke="var(--ink)" stroke-width="1.5"/>`;
    }).join('');
    const svg = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="cchart-svg" aria-hidden="true">
        <polygon points="${area}" fill="var(--band)" opacity="0.28"/>
        <polyline points="${line}" fill="none" stroke="var(--band-deep)" stroke-width="2.5"
                  stroke-linecap="round" stroke-linejoin="round"/>
        ${dots}
      </svg>`;
    return h('div', { class:'cchart' },
      h('div', { class:'cchart-head' },
        h('span', { class:'cchart-unit' }, unitLabel),
        h('span', { class:`cchart-delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}` },
          `${delta > 0 ? '▲' : delta < 0 ? '▼' : '▬'} ${fmtStat(Math.abs(delta))}`),
        h('span', { class:'cchart-deltalabel' }, `since ${first.y}`),
      ),
      h('div', { class:'cchart-body' },
        h('div', { class:'cchart-plot', html: svg,
                   title: (dense ? pts.slice(-12) : pts)
                     .map(p => `${p.y}: ${fmtStat(p.v)}`).join(String.fromCharCode(10)) }),
        h('div', { class:'cchart-axis' },
          h('span', { class:'cchart-hi tnum' }, fmtStat(hi)),
          h('span', { class:'cchart-now tnum' }, fmtStat(last.v)),
          h('span', { class:'cchart-lo tnum' }, fmtStat(lo)),
        ),
      ),
      // Season labels when there are few, first/middle/last when the series is weekly.
      h('div', { class:'cchart-years' },
        ...(dense
          ? [pts[0], pts[Math.floor(pts.length / 2)], pts[pts.length - 1]]
              .map(p => h('span', { class:'tnum' }, p.y))
          : pts.map(p => h('span', { class:'tnum' }, p.y.slice(-2))))),
    );
  }

  // Which KTC board a card should read, off the route. A player card opened from a
  // superflex league shows superflex value; anywhere else shows 1QB, which is KTC's
  // own default. Not threaded as an argument because it picks between two boards and
  // nothing else about the card depends on it.
  function routeLeague() {
    const m = (location.hash || '').match(/#\w+\/(\d+)/);
    return m ? (window.LEAGUES || []).find(l => String(l.id) === m[1]) || null : null;
  }

  // The week in front of you: projected points, the opponent, and how that opponent
  // defends this position. The card had none of this. It showed a season projection
  // on a surface where the live question is "do I start him on Sunday", while
  // WEEKLY_RANKINGS ships per-week arrays and sos-grid.js was loaded and unread.
  function thisWeekBlock(sleeper) {
    const wr = window.WEEKLY_RANKINGS;
    if (!sleeper || !wr) return null;
    const week = wr.currentWeek || 1;
    const row = (wr.players || []).find(p => String(p.id) === String(sleeper.id));
    if (!row) return null;

    // The feed is Sleeper's offense PPR, which scores an LB1 at 0.5 a week. A
    // defender's week is his season projection in the IDP league's own scoring,
    // per game; a null in the feed still marks his bye or injury.
    const feed = (row.sleeper || [])[week - 1];
    const idpLg = isIdpPos(row.pos || sleeper.pos) ? contextLeagueFor(row.pos || sleeper.pos) : null;
    const idpRec = idpLg && feed != null ? projByPid().get(String(sleeper.id)) : null;
    const idpSeason = idpRec ? projPoints(idpRec.p, idpLg, 'blend') : null;
    const model = !idpLg ? feed : idpSeason == null ? null : idpSeason / SIM.gamesPlayed;
    const market = row.vegas;
    const noProjection = model == null && market == null;

    const sos = window.SOS_GRID;
    const pos = (row.pos || sleeper.pos || '').toUpperCase();
    const game = weeklyMatchupFor(sleeper.team, pos, week);
    // Missing projections also happen for injured and deep players with games.
    // Only a missing game on a known schedule means bye.
    const onBye = !game && !!teamSos(sleeper.team);
    // The grid covers offence only, so an IDP opponent shows without a rank rather
    // than borrowing a number that was never computed for him.
    const dvpRank = game?.rank ?? null;
    const dvpLabel = dvpRank == null ? null
      : dvpRank >= 25 ? 'smash spot' : dvpRank >= 17 ? 'soft' : dvpRank >= 9 ? 'average' : 'tough';

    const cell = (label, value, extra) => h('div', { class:'tw-cell' },
      h('div', { class:'tw-val tnum' }, value), h('div', { class:'tw-lab' }, label), extra || null);

    return h('div', { class:'card tw-card' },
      h('div', { class:'card-title' }, `Week ${week}`,
        onBye ? h('span', { class:'ctx-stale', title:'No game this week.' }, 'bye') : null),
      h('div', { class:'tw-row' },
        noProjection ? cell('projected', '·') : cell('projected',
          fmt.decimal(market != null ? market : model, 1),
          h('div', { class:'tw-sub' }, market != null ? 'market'
            : idpLg ? `${idpLg.short_name || idpLg.name} per game` : 'model')),
        (market != null && model != null)
          ? cell('vs model', (market - model >= 0 ? '+' : '') + fmt.decimal(market - model, 1),
              h('div', { class:'tw-sub' }, market - model >= 0 ? 'market higher' : 'market lower'))
          : null,
        game ? cell('opponent', `${game.home ? '' : '@'}${game.opp}`,
          dvpRank != null
            ? h('div', { class:`tw-sub dvp-${dvpLabel.split(' ')[0]}` }, `${pos} D #${dvpRank} of 32, ${dvpLabel}`)
            : h('div', { class:'tw-sub' }, sos ? 'no grid for this position' : '')) : null,
        game && game.implied_pf != null
          ? cell('team total', fmt.decimal(game.implied_pf, 1),
              h('div', { class:'tw-sub' }, game.posted ? 'Vegas' : 'projected')) : null,
      ),
      h('p', { class:'tip tw-note' },
        `Projection is the price-adjusted market number when a line exists, otherwise Sleeper's model. `
        + (idpLg ? `A defender has no weekly feed, so his is the season projection in ${idpLg.short_name || idpLg.name} scoring, per game. ` : '')
        + `Defense-vs-position is ${sos ? sos.season : 'last season'} PPR allowed to ${pos || 'the position'}, `
        + `1 = toughest, 32 = easiest.`));
  }

  function historyBlock(sleeper) {
    if (!sleeper || !window.HISTORY) return null;
    const histLeague = routeLeague();
    const hist = window.HISTORY[sleeper.id];
    if (!hist) return null;
    const pos = (hist.pos || sleeper.pos || '').toUpperCase();
    const cols = POS_STAT_COLS[pos] || POS_STAT_COLS.WR;
    const isIDP = ['LB','DB','DL','S','CB','DEF'].includes(pos);
    const isQB  = pos === 'QB';

    // Top KPI row
    const headlinePeak = isIDP ? hist.peak_idp : (isQB ? hist.peak_4pt : hist.peak_ppr);
    const fpLabel      = isIDP ? 'IDP' : (isQB ? '4pt PPR' : 'PPR');
    const careerKey    = isIDP ? 'fp_idp_yuh' : (isQB ? 'fp_4pt_ppr' : 'fp_ppr');
    const careerTotal  = hist.career[careerKey] || 0;

    const kpis = h('div', { class:'hist-kpis' },
      h('div', { class:'hist-kpi' },
        h('div', { class:'hist-kpi-num tnum' }, fmtStat(careerTotal)),
        h('div', { class:'hist-kpi-label' }, `Career ${fpLabel}`),
      ),
      h('div', { class:'hist-kpi' },
        h('div', { class:'hist-kpi-num tnum' }, fmtStat(headlinePeak)),
        h('div', { class:'hist-kpi-label' }, 'Peak season'),
      ),
      h('div', { class:'hist-kpi' },
        h('div', { class:'hist-kpi-num tnum' }, hist.seasons),
        h('div', { class:'hist-kpi-label' }, hist.seasons === 1 ? 'Season' : 'Seasons'),
      ),
    );

    // Recent seasons table (last 5)
    const head = h('thead', null,
      h('tr', null,
        h('th', null, 'Year'),
        ...cols.map(([label]) => h('th', { class:'right' }, label)),
      ),
    );
    const body = h('tbody', null,
      ...hist.recent.map(r => h('tr', null,
        h('td', { class:'tnum' }, r.year),
        ...cols.map(([, key]) => h('td', { class:'right tnum' }, fmtStat(r[key]))),
      )),
    );
    const table = h('table', { class:'data snug-center hist-table' }, head, body);

    return h('section', { class:'hist-block' },
      h('div', { class:'hist-head' },
        h('div', { class:'card-title' }, 'Historical'),
        h('span', { class:'tip' }, hist.first === hist.last ? String(hist.first) : `${hist.first} to ${hist.last}`),
      ),
      kpis,
      // KTC value was the second tab here. It is now ktcValueChart() opening the
      // Value tab with its own range control, so this chart is production only
      // and careerChart renders it with no tab strip at all.
      careerChart([
        { key:'ppg', label:'PPG', unit:`${fpLabel} per game`,
          pts:(hist.spark || []).map(d => ({ y:String(d.y), v:d.v })) },
      ]),
      table,
    );
  }

  // ============================================================
  // Opportunity / coaching / contract context (data/context.js)
  // ============================================================
  function fmtPct(v) {
    if (v == null || isNaN(v)) return '·';
    return `${(Number(v) * 100).toFixed(1)}%`;
  }
  function fmtMoney(n) {
    if (!n || isNaN(n)) return '·';
    const v = Number(n);
    if (v >= 1e6) return `$${(v/1e6).toFixed(1)}M`;
    if (v >= 1e3) return `$${Math.round(v/1e3)}K`;
    return `$${Math.round(v)}`;
  }
  function deltaChip(deltaPct, kind = 'pos') {
    if (deltaPct == null || isNaN(deltaPct)) return null;
    const sign = deltaPct > 0 ? '+' : '';
    const color = (deltaPct >= 0) === (kind === 'pos') ? 'var(--green)' : 'var(--red)';
    return h('span', { class:'delta-chip tnum', style:{ color } }, `${sign}${(deltaPct*100).toFixed(1)}%`);
  }
  // One share cell, labelled by what it is a share OF. Never a sum: a 22% target
  // share plus an 8% rush share is not 30% of anything.
  function showRushShareFor(pos) {
    return !['WR', 'TE'].includes(String(pos || '').toUpperCase());
  }

  function shareCell(tgt, rush, pos, titleText) {
    const parts = [];
    // A quarterback's target share is noise when it is not zero outright, so the
    // rushing line is the only one worth printing for him.
    if (pos !== 'QB' && tgt) parts.push({ v: tgt, unit: 'tgt' });
    if (rush && showRushShareFor(pos)) parts.push({ v: rush, unit: 'rush' });
    if (!parts.length) return h('span', { class:'turn-share tnum', title: titleText }, '·');
    parts.sort((a, b) => b.v - a.v);
    return h('span', { class:'turn-share tnum', title: titleText },
      ...parts.slice(0, 2).flatMap((x, i) => [
        i ? h('span', { class:'turn-share-sep' }, ' ') : null,
        h('span', { class:'turn-share-val' }, fmtPct(x.v)),
        h('span', { class:'turn-share-unit' }, x.unit),
      ]).filter(Boolean));
  }

  function contextBlock(sleeper) {
    if (!sleeper || !window.CONTEXT) return null;
    const playerPos = String(sleeper.pos || sleeper.position || '').toUpperCase();
    const playerCtx = window.CONTEXT.players[sleeper.id];
    const teamAbbr = (playerCtx && playerCtx.team) || sleeper.team;
    const teamCtx = teamAbbr && window.CONTEXT.teams ? window.CONTEXT.teams[teamAbbr] : null;
    if (!teamCtx && !playerCtx) return null;

    const blocks = [];

    // -- Team market + QB context --
    if (teamCtx && (teamCtx.market || teamCtx.qb)) {
      const m = teamCtx.market;
      const q = teamCtx.qb;
      const proeColor = m
        ? (m.proe >= 0.02 ? 'var(--blue)' : m.proe <= -0.02 ? 'var(--amber)' : 'var(--fg-2)')
        : 'var(--fg-2)';
      blocks.push(h('div', { class:'ctx-block market-block' },
        h('div', { class:'card-title' }, `${teamAbbr} ${m ? m.season : ''} Tendencies`),
        m ? h('div', { class:'kpi-row' },
          h('div', { class:'mini-kpi' },
            h('div', { class:'mini-kpi-num tnum' }, m.avg_implied.toFixed(1)),
            h('div', { class:'mini-kpi-label' }, 'Avg implied'),
          ),
          h('div', { class:'mini-kpi' },
            h('div', { class:'mini-kpi-num tnum', style:{ color: proeColor } },
              `${m.proe >= 0 ? '+' : ''}${(m.proe*100).toFixed(1)}%`),
            h('div', { class:'mini-kpi-label' }, 'PROE'),
          ),
          h('div', { class:'mini-kpi' },
            h('div', { class:'mini-kpi-num tnum' }, m.plays_per_game.toFixed(1)),
            h('div', { class:'mini-kpi-label' }, 'Plays/G'),
          ),
          h('div', { class:'mini-kpi' },
            h('div', { class:'mini-kpi-num tnum' }, `${m.wins}-${m.losses}`),
            h('div', { class:'mini-kpi-label' }, 'Record'),
          ),
        ) : null,
        q ? h('div', { class:'qb-line' },
          h('span', { class:'coach-role' }, 'QB'),
          h('span', { class:'coach-name' }, q.qb_name || '·'),
          q.is_new_starting_qb && q.prev_qb_name
            ? h('span', { class:'flag-pill new', style:{ marginLeft:'8px' } },
                `NEW QB · was ${q.prev_qb_name}`)
            : q.continuity_streak > 1
              ? h('span', { class:'tip', style:{ marginLeft:'8px' } }, `yr ${q.continuity_streak}`)
              : null,
          q.primary_pct < 0.7
            ? h('span', { class:'flag-pill firstime', style:{ marginLeft:'8px' } },
                `${(q.primary_pct*100).toFixed(0)}% snaps · committee`)
            : null,
        ) : null,
      ));
    }

    // -- Coaching context --
    if (teamCtx && teamCtx.coach) {
      const c = teamCtx.coach;
      const prev = teamCtx.coach_prev;
      const flags = [];
      if (c.new_hc) flags.push(h('span', { class:'flag-pill new' }, 'NEW HC'));
      if (c.new_oc) flags.push(h('span', { class:'flag-pill new' }, 'NEW OC'));
      if (c.new_play_caller) flags.push(h('span', { class:'flag-pill new' }, 'NEW PLAY CALLER'));
      if (c.play_caller_first_season) flags.push(h('span', { class:'flag-pill firstime' }, 'FIRST-TIME PLAY CALLER'));
      if (c.oc_first_season) flags.push(h('span', { class:'flag-pill firstime' }, 'FIRST-TIME OC'));

      const lineHC = h('div', { class:'coach-line' },
        h('span', { class:'coach-role' }, 'HC'),
        h('span', { class:'coach-name' }, c.hc || '·'),
      );
      const lineOC = (c.oc && c.oc !== c.hc) ? h('div', { class:'coach-line' },
        h('span', { class:'coach-role' }, 'OC'),
        h('span', { class:'coach-name' }, c.oc),
      ) : null;
      const pcIsHc = c.play_caller && c.play_caller === c.hc;
      const pcIsOc = c.play_caller && c.play_caller === c.oc;
      const linePC = h('div', { class:'coach-line' },
        h('span', { class:'coach-role' }, 'PC'),
        h('span', { class:'coach-name' + (pcIsHc || pcIsOc || !c.play_caller ? ' is-dup' : '') },
          pcIsHc ? 'the head coach'
            : pcIsOc ? 'the OC'
            : c.play_caller ? c.play_caller
            : c.new_hc ? 'not yet known, new staff'
            : '·'),
        h('span', { class:'tip' },
          c.scheme ? `${c.scheme}` : '',
          c.pc_tenure_yr > 1 ? ` · yr ${c.pc_tenure_yr}` : ''),
      );
      const prevLine = prev && prev.play_caller && prev.play_caller !== c.play_caller
        ? h('div', { class:'coach-prev tip' }, `prev: ${prev.play_caller} (${prev.scheme || ''})`)
        : null;

      blocks.push(h('div', { class:'ctx-row' },
        h('div', { class:'ctx-col' },
          h('div', { class:'card-title' }, `${teamAbbr} ${window.CONTEXT.current_season} Staff`,
            /projected/i.test(c.notes || '')
              ? h('span', { class:'ctx-stale', title:'This staff row is a projection carried forward from last season, not a confirmed hire. Check it before trusting a coaching-change read.' }, 'projected')
              : null),
          lineHC, lineOC, linePC, prevLine,
        ),
        flags.length ? h('div', { class:'ctx-flags' }, ...flags) : null,
      ));
    }

    // -- Team turnover --
    if (teamCtx && teamCtx.turnover) {
      const t = teamCtx.turnover;
      const turnoverEl = h('div', { class:'ctx-block' },
        h('div', { class:'card-title' }, `${teamAbbr} ${t.season} Turnover`,
          // Two different ways this panel can mislead, so it labels itself.
          // Stale: the newest turnover season on disk is behind the season the
          // rest of the page projects, so every name here is an offseason old.
          // Roster-based: the season IS current but too few weeks have been
          // played for "games >= 1" to tell gone from inactive, so membership
          // came from the nflverse roster file and joiners have no share yet.
          (window.CONTEXT.current_season - t.season) >= 1
            ? h('span', { class:'ctx-stale', title:`Turnover data covers the ${t.season} offseason. The ${window.CONTEXT.current_season} offseason has not been ingested, so joiners and leavers here are a year old.` }, 'a year behind')
            : t.basis === 'roster'
              ? h('span', { class:'ctx-basis', title:`Built from the ${t.season} roster file, ${t.weeks_played === 1 ? 'one week' : `${t.weeks_played} weeks`} into the season. Vacated shares are what the leavers held in ${t.season - 1}; joiners show the share they held elsewhere last season, not a ${t.season} share.` }, 'roster-based')
              : null),
        h('div', { class:'kpi-row' },
          h('div', { class:'mini-kpi' },
            h('div', { class:'mini-kpi-num tnum' }, fmtPct(t.vacated_tgt)),
            h('div', { class:'mini-kpi-label' }, 'Vacated TGT'),
          ),
          showRushShareFor(playerPos) ? h('div', { class:'mini-kpi' },
            h('div', { class:'mini-kpi-num tnum' }, fmtPct(t.vacated_rush)),
            h('div', { class:'mini-kpi-label' }, 'Vacated RUSH'),
          ) : null,
          h('div', { class:'mini-kpi' },
            h('div', { class:'mini-kpi-num tnum' }, fmtPct(t.vacated_ay)),
            h('div', { class:'mini-kpi-label' }, 'Vacated AY'),
          ),
        ),
        t.top_leavers && t.top_leavers.length ? h('div', { class:'turn-list' },
          h('div', { class:'turn-list-label' }, 'Leavers'),
          ...t.top_leavers.slice(0, 3).map(l => h('div', { class:'turn-item' },
            h('span', { class:'turn-name' }, l.name),
            h('span', { class:'turn-pos tip' }, l.pos),
            shareCell(l.tgt, l.rush, l.pos, `Share he held on ${teamAbbr}`),
          )),
        ) : null,
        t.top_joiners && t.top_joiners.length ? h('div', { class:'turn-list' },
          h('div', { class:'turn-list-label' }, t.basis === 'roster' ? 'Joiners (prior share)' : 'Joiners'),
          ...t.top_joiners.slice(0, 3).map(j => {
            // A joiner one week into the season has no share worth printing.
            // Show what he held on his old team, and say that is what it is.
            const roster = t.basis === 'roster';
            const tgt = roster ? (j.ptgt || 0) : (j.tgt || 0);
            const rush = roster ? (j.prush || 0) : (j.rush || 0);
            return h('div', { class:'turn-item' },
              h('span', { class:'turn-name' }, j.name),
              h('span', { class:'turn-pos tip' }, j.pos, j.rookie ? ' · R' : ''),
              shareCell(tgt, rush, j.pos, roster
                ? (j.rookie ? 'Rookie, no prior NFL share' : `Share held elsewhere in ${t.season - 1}`)
                : `${t.season} share on ${teamAbbr}`),
            );
          }),
        ) : null,
      );
      blocks.push(turnoverEl);
    }

    // -- Per-player new-team transitions / contract --
    if (playerCtx && playerCtx.transitions && playerCtx.transitions.length) {
      const tx = playerCtx.transitions[0];
      const delta = (tx.cur_tgt || 0) - (tx.expected_tgt || 0);
      const rdelta = (tx.cur_rush || 0) - (tx.expected_rush || 0);
      blocks.push(h('div', { class:'ctx-block' },
        h('div', { class:'card-title' },
          `New team · ${tx.season} ${tx.prev_team || (tx.is_rookie ? 'rookie' : '')} → ${tx.team}`),
        h('div', { class:'kpi-row' },
          h('div', { class:'mini-kpi' },
            h('div', { class:'mini-kpi-num tnum' }, fmtMoney(tx.apy)),
            h('div', { class:'mini-kpi-label' }, `APY · ${tx.apy_bucket || ''}`),
          ),
          tx.cur_tgt > 0 ? h('div', { class:'mini-kpi' },
            h('div', { class:'mini-kpi-num tnum' },
              fmtPct(tx.cur_tgt), ' ', deltaChip(delta),
            ),
            h('div', { class:'mini-kpi-label' }, `TGT (vs ${fmtPct(tx.expected_tgt)} exp)`),
          ) : null,
          tx.cur_rush > 0 ? h('div', { class:'mini-kpi' },
            h('div', { class:'mini-kpi-num tnum' },
              fmtPct(tx.cur_rush), ' ', deltaChip(rdelta),
            ),
            h('div', { class:'mini-kpi-label' }, `RUSH (vs ${fmtPct(tx.expected_rush)} exp)`),
          ) : null,
        ),
        playerCtx.transitions.length > 1 ? h('div', { class:'tip' },
          `${playerCtx.transitions.length} career team changes`) : null,
      ));
    } else if (playerCtx && playerCtx.tenure_team) {
      // Stayed put, show APY if known
      if (playerCtx.apy) {
        blocks.push(h('div', { class:'ctx-block tenure' },
          h('div', { class:'card-title' }, `Tenured · ${playerCtx.team}`),
          h('div', { class:'kpi-row' },
            h('div', { class:'mini-kpi' },
              h('div', { class:'mini-kpi-num tnum' }, fmtMoney(playerCtx.apy)),
              h('div', { class:'mini-kpi-label' }, 'APY'),
            ),
          ),
        ));
      }
    }

    // -- Per-player efficiency (recent 3 seasons) --
    if (playerCtx && playerCtx.efficiency && playerCtx.efficiency.length) {
      const eff = playerCtx.efficiency;
      const showAdot = eff.some(e => e.adot > 0);
      const showYac = eff.some(e => e.yac_per_rec > 0);
      const showDrop = eff.some(e => e.drop_pct > 0);
      const showBrk = eff.some(e => e.brk_tkl > 0);
      blocks.push(h('div', { class:'ctx-block' },
        h('div', { class:'card-title' }, 'Efficiency'),
        h('table', { class:'data snug-center eff-table' },
          h('thead', null, h('tr', null,
            h('th', null, 'Year'),
            h('th', { class:'right' }, 'Snap%'),
            h('th', { class:'right' }, 'Tgt/G'),
            showAdot ? h('th', { class:'right' }, 'aDOT') : null,
            showYac ? h('th', { class:'right' }, 'YAC/R') : null,
            showDrop ? h('th', { class:'right' }, 'Drop%') : null,
            showBrk ? h('th', { class:'right' }, 'BrkTkl') : null,
          )),
          h('tbody', null, ...eff.map(e => h('tr', null,
            h('td', { class:'tnum' }, e.season),
            h('td', { class:'right tnum' }, e.snap_share > 0 ? fmtPct(e.snap_share) : '·'),
            h('td', { class:'right tnum' }, e.tgt_per_g > 0 ? e.tgt_per_g.toFixed(1) : '·'),
            showAdot ? h('td', { class:'right tnum' }, e.adot > 0 ? e.adot.toFixed(1) : '·') : null,
            showYac ? h('td', { class:'right tnum' }, e.yac_per_rec > 0 ? e.yac_per_rec.toFixed(1) : '·') : null,
            showDrop ? h('td', { class:'right tnum' }, e.drop_pct > 0 ? `${(e.drop_pct*100).toFixed(1)}%` : '·') : null,
            showBrk ? h('td', { class:'right tnum' }, e.brk_tkl || '·') : null,
          ))),
        ),
      ));
    }

    // -- Availability --
    if (playerCtx && playerCtx.availability) {
      const av = playerCtx.availability;
      const color = av.pct >= 0.9 ? 'var(--green)' : av.pct >= 0.75 ? 'var(--fg-1)' : 'var(--red)';
      blocks.push(h('div', { class:'ctx-block availability' },
        h('div', { class:'avail-row' },
          h('div', { class:'mini-kpi-label' }, 'Availability'),
          h('div', { class:'avail-num tnum', style:{ color } }, fmtPct(av.pct)),
          h('div', { class:'tip' }, `${av.games}/${av.potential} potential games · ${av.seasons} seasons`),
        ),
      ));
    }

    if (!blocks.length) return null;
    return h('section', { class:'ctx-section' }, ...blocks);
  }

  // ============================================================
  // Player card: the six numbers, the value chart, the tab shell
  // ============================================================

  // VOR needs the projection record, which projectionBlock looks up inline. The
  // number band needs the same figure, so the lookup lives here rather than
  // being copied, because the offense/defense fallback order is the part that
  // would drift.
  function vorForSleeper(sleeper) {
    const O = window.OFFENSE_PROJ;
    if (!sleeper || !O) return null;
    for (const unit of ['offense', 'defense']) {
      const rec = (O[unit]?.players || []).find(pl => pl.id === sleeper.id);
      if (!rec) continue;
      const lg = contextLeagueFor(rec.pos);
      if (!lg) return null;
      const v = vorForPlayer(rec, lg, unit, O[unit].default);
      return v == null ? null : { v, unit, league: lg };
    }
    return null;
  }

  // Every figure here was already computed and already on the card. It was
  // printed as two stacked rows of loose chips, so answering "is he worth more
  // than he scores" meant hunting two rows for two numbers that were never
  // adjacent. Six cells, one scroll rail, same order on every player. The old
  // rows are gone, so nothing is printed twice.
  function numberBand(ranked, sleeper) {
    const pid = String(sleeper?.id || ranked?._sleeperId || '');
    const lg = contextLeagueFor(ranked?.pos || sleeper?.pos) || {};
    const mp = pid ? mispricingIndex().get(pid) : null;
    const pos = String(ranked?.pos || sleeper?.pos || '').toUpperCase();
    const cells = [];

    const cell = (label, value, sub, opts = {}) => h('div', {
      class: 'num-cell', title: opts.title || '',
    },
      h('div', { class: 'num-cell-label' }, label),
      h('div', { class: 'num-cell-value tnum', style: opts.color ? { color: opts.color } : null }, value),
      h('div', { class: 'num-cell-sub' }, sub == null ? '·' : sub),
    );

    // 1. Dynasty value on the site's 0-110 scale, with the raw KTC market
    //    number under it so the scale is never mistaken for the market.
    if (ranked) {
      const val = tierValue(ranked, lg);
      const mkt = ranked.ktcValue != null ? ranked.ktcValue : Math.round(val * 100);
      cells.push(cell('Value', fmt.decimal(val, 0),
        ranked.ktcValue != null ? 'KTC ' + ranked.ktcValue : 'derived',
        { title: 'Dynasty value on the 0-110 scale (KTC market ' + mkt + ' / 100). '
          + 'Same scale as every Value column, PV/FV and the trade calculator.' }));
    }

    // 2. Where that value sits inside his own position.
    if (mp && mp.valRank) {
      cells.push(cell('Value rank', mp.pos + mp.valRank, 'by dynasty value',
        { title: mp.pos + ' rank by dynasty value, across every projected ' + mp.pos + '.' }));
    }

    // 3. Tier and category. Chips rather than a number, because these two
    //    labels are what the whole framework branches on.
    if (ranked) {
      cells.push(h('div', { class: 'num-cell num-cell-chips' },
        h('div', { class: 'num-cell-label' }, 'Tier'),
        h('div', { class: 'num-cell-chiprow' },
          (ourTierChip(sleeper && sleeper.id) || tierChip(ranked.tier, ranked.category))),
        h('div', { class: 'num-cell-chiprow num-cell-sub' },
          (ourCatChip(sleeper && sleeper.id) || pillCategory(ranked.category))),
      ));
    }

    // 4. Projected points and their positional rank. This is the SEASON blended
    //    projection, which is what mispricingIndex ranks on. It is deliberately
    //    not labelled rest-of-season: no rest-of-season figure is computed
    //    anywhere in this file, and a wrong label on a right number is still
    //    wrong.
    if (mp && mp.pts != null) {
      cells.push(cell('Proj pts', fmt.decimal(mp.pts, 0),
        mp.projRank ? mp.pos + mp.projRank + ' by points' : null,
        { title: 'Blended season projection, and his ' + mp.pos + ' rank by those points. '
          + 'Paired with Value rank this is the mispricing: a value rank well below '
          + 'the points rank is the buy case.' }));
    }

    // 5. VOR, the only cell that answers "above what".
    const vor = vorForSleeper(sleeper);
    if (vor) {
      const lbl = vor.league.short_name || vor.league.name;
      const color = vor.v >= 30 ? 'var(--green)' : vor.v >= 0 ? 'var(--fg-1)' : 'var(--red)';
      cells.push(cell('VOR', (vor.v > 0 ? '+' : '') + fmt.decimal(vor.v, 0), lbl,
        { color, title: 'Value over replacement: projected points above the last '
          + 'startable player at this position in ' + lbl + '.' }));
    }

    // 6. Age against this position's sell age, the one cell that turns a number
    //    into a deadline.
    const age = ageOf(sleeper && sleeper.id, (ranked && ranked.age) != null ? ranked.age : (sleeper && sleeper.age));
    const curve = window.STRATEGY && window.STRATEGY.age_curve && window.STRATEGY.age_curve[pos];
    if (age != null) {
      const sell = curve && curve.sell_age;
      const hard = curve && curve.hard_sell_age;
      const color = sell == null ? null
        : age >= hard ? 'var(--red)' : age >= sell ? 'var(--amber)' : 'var(--green)';
      cells.push(cell('Age', fmt.decimal(age, 1),
        sell != null ? pos + ' sell ' + sell : 'no curve',
        { color, title: sell == null ? 'No age curve for this position.'
          : pos + ' peak ' + curve.peak_avg + ', sell window opens ' + sell + ', hard sell '
            + hard + '. Amber means the sell window is open, red means past hard sell.' }));
    }

    if (!cells.length) return null;
    return h('div', { class: 'num-band', role: 'group', 'aria-label': 'Key numbers' }, ...cells);
  }

  // Slice a KTC series to the last N months. The series carries its own raw
  // "YYMMDD" stamp precisely so this can filter on a real date rather than
  // assume a fixed sample interval, which is not fixed.
  function ktcRangeSlice(pts, months) {
    if (!months || !pts || !pts.length) return pts || [];
    const last = pts[pts.length - 1].d;
    if (!last) return pts;
    let yy = 2000 + Number(last.slice(0, 2));
    let mm = Number(last.slice(2, 4)) - months;
    while (mm <= 0) { mm += 12; yy -= 1; }
    const cut = String(yy % 100).padStart(2, '0') + String(mm).padStart(2, '0') + last.slice(4, 6);
    const kept = pts.filter(pt => pt.d >= cut);
    // A one-point window draws nothing, so fall back rather than render an
    // empty plot that reads as missing data.
    return kept.length >= 2 ? kept : pts;
  }

  // The KTC value chart, promoted out of historyBlock to open the VALUE tab. In
  // historyBlock it was the second tab of a chart whose first tab was points per
  // game, so the dynasty value history, the single most decision-relevant series
  // on the card, sat one click behind a production stat.
  function ktcValueChart(sleeper) {
    if (!sleeper) return null;
    const lg = routeLeague();
    const all = ktcValueSeries(sleeper.name, lg);
    if (!all || all.length < 2) return null;

    const RANGES = [
      { key: '3mo', label: '3 mo', months: 3 },
      { key: '1yr', label: '1 yr', months: 12 },
      { key: 'all', label: 'All', months: 0 },
    ];
    // 1 yr opens: three months of a dynasty value series is usually noise, and
    // the full history is often several years that flatten the last six months.
    let active = '1yr';
    const host = h('div', { class: 'ktcv-host' });
    const callout = h('div', { class: 'ktcv-callout' });
    const tabs = h('div', { class: 'cchart-tabs ktcv-tabs', role: 'tablist',
                            'aria-label': 'Value chart range' });

    const draw = () => {
      const r = RANGES.find(x => x.key === active) || RANGES[1];
      const pts = ktcRangeSlice(all, r.months);
      host.innerHTML = '';
      const plot = careerChartOne(pts, 'KTC ' + (lg && lg.is_superflex ? 'superflex' : '1QB') + ' value');
      if (plot) host.appendChild(plot);

      // Signed change across the VISIBLE window, which is the number the range
      // tabs exist to change. Percent as well as points, because +400 means very
      // different things on a 2,400 asset and a 900 one.
      const a = pts[0].v, b = pts[pts.length - 1].v;
      const d = Math.round(b - a);
      const sign = d > 0 ? '+' : d < 0 ? '−' : '';
      const pctTxt = a ? ' (' + sign + Math.abs(Math.round((d / a) * 1000) / 10) + '%)' : '';
      callout.innerHTML = '';
      callout.className = 'ktcv-callout ' + (d > 0 ? 'up' : d < 0 ? 'down' : 'flat');
      callout.appendChild(h('strong', { class: 'tnum' }, sign + Math.abs(d) + pctTxt));
      callout.appendChild(h('span', { class: 'tip' },
        'over ' + (r.months ? r.label : pts.length + ' readings') + ', '
        + pts[0].y + ' to ' + pts[pts.length - 1].y));

      for (const btn of tabs.children) {
        const on = btn.dataset.key === active;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-selected', String(on));
      }
    };

    for (const r of RANGES) {
      tabs.appendChild(h('button', {
        class: 'cchart-tab', type: 'button', role: 'tab', dataset: { key: r.key },
        'aria-selected': String(r.key === active),
        onclick: () => { active = r.key; draw(); },
      }, r.label));
    }

    draw();
    return h('section', { class: 'ktcv-block', 'aria-label': 'KTC dynasty value history' },
      h('div', { class: 'hist-head' },
        h('div', { class: 'card-title' }, 'Dynasty value'),
        tabs,
      ),
      callout,
      host,
    );
  }

  // Reference blocks behind three tabs. Reuses .tab-bar / .tab so the card gets
  // the 44px touch target and the mobile gutter handling the views already have,
  // instead of a second tab component that drifts from the first.
  let _pmTabSeq = 0;
  function modalTabs(sections) {
    const live = (sections || [])
      .map(sec => ({ key: sec.key, label: sec.label, nodes: (sec.nodes || []).filter(Boolean) }))
      .filter(sec => sec.nodes.length);
    if (!live.length) return null;
    // One surviving group is not a tab bar, it is just content. An unmatched
    // player with no projection and no history collapses to exactly that, and a
    // single tab you cannot leave is worse than no tab at all.
    if (live.length === 1) return h('div', { class: 'pm-panel' }, ...live[0].nodes);

    const uid = 'pm-tabs-' + (++_pmTabSeq);
    const bar = h('div', { class: 'tab-bar pm-tab-bar', role: 'tablist',
                           'aria-label': 'Player detail sections' });
    const panels = live.map((sec, i) => h('div', {
      class: 'pm-panel', role: 'tabpanel', id: uid + '-p' + i,
      'aria-labelledby': uid + '-t' + i, hidden: i !== 0,
    }, ...sec.nodes));

    const show = (n) => {
      panels.forEach((pan, i) => { pan.hidden = i !== n; });
      [...bar.children].forEach((btn, i) => {
        btn.classList.toggle('active', i === n);
        btn.setAttribute('aria-selected', String(i === n));
        btn.tabIndex = i === n ? 0 : -1;
      });
      // A table inside a hidden panel measures zero wide, so the width classes
      // only resolve once the panel is shown. Re-wrap on every switch.
      wrapDataTables();
    };

    live.forEach((sec, i) => bar.appendChild(h('button', {
      class: 'tab' + (i === 0 ? ' active' : ''), type: 'button', role: 'tab',
      id: uid + '-t' + i, 'aria-controls': uid + '-p' + i,
      'aria-selected': String(i === 0), tabindex: i === 0 ? '0' : '-1',
      onclick: () => show(i),
      onkeydown: (ev) => {
        const step = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        ev.preventDefault();
        const n = (i + step + live.length) % live.length;
        show(n);
        bar.children[n].focus();
      },
    }, sec.label)));

    return h('div', { class: 'pm-tabs' }, bar, ...panels);
  }

  function playerModal(name, ranked, sleeper) {
    const restoreFocus = document.activeElement;
    const titleId = `player-dialog-${norm(name).replace(/\s+/g, '-')}`;
    const expertBadges = activeExpertSources().map(src => {
      const e = expertEntry(src, name, sleeper?.id || ranked?._sleeperId);
      if (!e) return null;
      const val = e.rank != null ? `#${e.rank} · ${e.pos}${e.posRank != null ? e.posRank : ''}` : `${e.pos}${e.posRank != null ? e.posRank : ''}`;
      const label = (src.label || src.expert || src.id) + (src.dateSuffix && src.updatedAt ? ' ' + ymd(src.updatedAt) : '');
      return h('span', {
        class:'badge',
        title:`${src.expert || src.label} · ${src.title || 'rankings'}${src.updatedAt ? ', updated ' + src.updatedAt : ''}${e.tier ? ', tier ' + e.tier : ''}${e.note ? ' · ' + e.note : ''}`,
      }, `${label}: ${val}`);
    }).filter(Boolean);
    let backdrop;
    let modal;
    const close = () => {
      if (!backdrop?.isConnected) return;
      backdrop.remove();
      document.removeEventListener('keydown', onKeydown);
      if (restoreFocus instanceof HTMLElement && restoreFocus.isConnected) restoreFocus.focus();
    };
    const onBackdrop = (e) => { if (e.target === e.currentTarget) close(); };
    const onKeydown = (ev) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        close();
        return;
      }
      if (ev.key !== 'Tab' || !modal) return;
      const focusable = [...modal.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )].filter(el => !el.hidden && el.getClientRects().length);
      if (!focusable.length) {
        ev.preventDefault();
        modal.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (ev.shiftKey && (document.activeElement === first || document.activeElement === modal)) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    };

    // Owners
    const ownerRows = [];
    if (sleeper) {
      for (const lg of window.LEAGUES || []) {
        for (const r of lg.rosters || []) {
          if ((r.players || []).includes(sleeper.id)) {
            ownerRows.push({ league: lg, roster: r, isStarter: (r.starters||[]).includes(sleeper.id), isTaxi: (r.taxi||[]).includes(sleeper.id), isReserve: (r.reserve||[]).includes(sleeper.id) });
          }
        }
      }
    }

    backdrop = h('div', { class:'modal-backdrop', onclick: onBackdrop },
      modal = h('div', {
        class:'modal', style:{ position:'relative' }, role:'dialog', 'aria-modal':'true', 'aria-labelledby':titleId, tabindex:'-1'
      },
        h('button', { class:'close-btn', onclick: close, 'aria-label':'Close' }, '×'),
        h('div', { class:'pm-head' },
          sleeper ? headshot(sleeper.id, 64) : null,
          h('div', { class:'pm-head-text' },
            h('h2', { id:titleId, style:{ marginTop:0, marginBottom:'4px' } }, name,
              sleeper ? injuryChip(sleeper.id) : null),
            h('div', { class:'row gap-4 wrap', style:{ marginBottom:'12px' } },
              ranked ? posChip(ranked.pos) : sleeper ? posChip(sleeper.pos) : null,
              ranked ? teamChip(ranked.team) : sleeper ? teamChip(sleeper.team) : null,
              rookieBadge(ranked || {}),
              uncertainBadge(ranked || {}),
              depBadge(ranked || {}),
              ...expertBadges,
            ))),
        // Buy/sell/hold verdict, the synthesized "so what" for this player.
        (() => { const v = playerVerdict(ranked, sleeper); if (!v) return null;
          const c = v.tone === 'buy' ? 'var(--green)' : v.tone === 'sell' ? 'var(--red)' : 'var(--fg-2)';
          return h('div', { class:'verdict-banner', style:{ borderColor:`color-mix(in oklab, ${c} 45%, var(--border))` } },
            h('span', { class:'verdict-label', style:{ color:c } }, v.label),
            h('span', { class:'verdict-why' }, v.why),
          ); })(),
        // The six numbers, directly under the verdict they justify.
        numberBand(ranked, sleeper),
        // Mark him, per league. A man not on your roster can be targeted; one of
        // yours can be put on the block. Both feed the Action Center board.
        sleeper ? (() => {
          const btns = (window.LEAGUES || [])
            .filter(lg => (lg.rosters || []).some(r => r.is_me))
            .map(lg => {
              const b = markButton(lg.id, sleeper.id, sleeper.name);
              return b ? h('span', { class:'mark-cell' },
                h('span', { class:'mark-lg' }, lg.short_name || lg.name), b) : null;
            }).filter(Boolean);
          return btns.length ? h('div', { class:'mark-row' }, ...btns) : null;
        })() : null,
        thisWeekBlock(sleeper),
        ownerRows.length ? h('div', null,
          // No plate around this band, so no -4px side bleed: it ran out of the box.
          h('div', { class:'card-title', style:{ margin:'-4px 0 6px' } }, 'Owned in your leagues'),
          h('table', { class:'data owned-table' },
            h('thead', null, h('tr', null,
              h('th', null, 'League'), h('th', null, 'Team'), h('th', { class:'owned-owner' }, 'Owner'), h('th', null, 'Slot'), h('th', null, 'Trade')
            )),
            h('tbody', null, ...ownerRows.map(o => h('tr', { class: o.roster.is_me ? 'you' : '', onclick:()=>{ close(); navigate(`#roster/${o.league.id}/${o.roster.roster_id}`); } },
              h('td', null, o.league.short_name),
              h('td', null, o.roster.team_name, o.roster.is_me ? h('span', { class:'badge you', style:{ marginLeft:'6px' } }, 'YOU') : null),
              h('td', { class:'owned-owner' }, o.roster.owner_name),
              h('td', null, o.isStarter ? h('span', { class:'badge' }, 'STARTER') : o.isTaxi ? h('span', { class:'badge' }, 'TAXI') : o.isReserve ? h('span', { class:'badge' }, 'IR') : h('span', { class:'badge' }, 'BENCH')),
              h('td', null, sleeper?.id ? h('button', {
                class:'ghost owned-trade', 'aria-label':'Trade',
                title: o.roster.is_me ? 'Add to YOU SEND in the Trade Lab' : 'Add to YOU RECEIVE in the Trade Lab',
                onclick:(e) => { e.stopPropagation(); close(); openTradeFor(sleeper.id, o.league.id, o.roster.roster_id); },
              }, h('span', { class:'owned-trade-word' }, 'Trade '), '⇄') : null),
            )))
          )
        ) : null,
        // Everything below is reference, so it goes behind three tabs. Value is
        // what he is worth, Production is what he scores, Context is why. An
        // empty group drops its own tab, so an unmatched player does not get a
        // tab bar leading to three blank panels.
        modalTabs([
          { key:'value', label:'Value', nodes: [
            ktcValueChart(sleeper),
            ranked?.note ? h('div', { class:'card', style:{ background:'var(--bg-2)', marginBottom:'12px' } },
              h('div', { class:'card-title' }, 'Source notes'),
              h('div', null, ranked.note),
              h('div', { class:'tip', style:{ marginTop:'6px' } }, `from ${ranked._src} / ${ranked._ranking}`)
            ) : null,
          ] },
          { key:'production', label:'Production', nodes: [
            advancedBlock(sleeper),
            locationBlock(sleeper),
            usageWeeksBlock(sleeper),
            projectionBlock(sleeper),
            historyBlock(sleeper),
          ] },
          { key:'context', label:'Context', nodes: [
            matchupLine(sleeper),
            weatherLine(sleeper),
            envInfoLine(sleeper),
            scheduleStrip(sleeper),
            contextBlock(sleeper),
            injuryHistoryBlock(sleeper),
            prospectBlock(sleeper),
            prospectModelBlock(sleeper),
            playerInfoBlock(name, sleeper),
          ] },
        ]),
        sleeper ? h('div', { class:'tip', style:{ marginBottom:'12px' } },
          [sleeper.college, (sleeper.exp != null ? `${sleeper.exp} yr exp` : null), `Sleeper #${sleeper.id}`].filter(Boolean).join('  ·  ')
        ) : h('div', { class:'tip', style:{ marginBottom:'12px' } }, 'Not matched to a Sleeper player.')
      )
    );
    document.addEventListener('keydown', onKeydown);
    requestAnimationFrame(() => { modal.querySelector('.close-btn')?.focus(); wrapDataTables(); });
    return backdrop;
  }

  // Advanced stats + game log on the player card, from window.ADVANCED. The
  // position rank is against the same pool Stats Lab shows (20%+ snaps, or 15+
  // dropbacks for a QB), so a number here and a number there always agree.
  const CARD_STAT_KEYS = {
    QB: ['db_epa', 'cpoe', 'pass_adot', 'ypa', 'pressure_rate', 'sack_rate', 'qb_play_action_rate',
         'scramble_rate', 'designed_runs', 'rush_share', 'avg_time_to_throw', 'qbr'],
    RB: ['snap_pct', 'rush_share', 'target_share', 'gl_share', 'hv_touches', 'xfp_pg', 'fpoe_pg',
         'epa_per_rush', 'rush_success', 'rush_yards_over_expected_per_att', 'yac_per_att', 'tprr_est'],
    WR: ['snap_pct', 'route_rate_est', 'target_share', 'first_read_share', 'air_share', 'wopr', 'adot',
         'tprr_est', 'yprr_est', 'rz_target_share', 'xfp_pg', 'fpoe_pg', 'avg_separation'],
    TE: ['snap_pct', 'route_rate_est', 'target_share', 'first_read_share', 'tprr_est', 'yprr_est', 'adot',
         'rz_target_share', 'ez_targets', 'xfp_pg', 'fpoe_pg', 'avg_separation'],
  };
  // The card game log's Advanced view, one row per game from window.USAGE_WEEKLY
  // (build_weekly_splits.py). [key, label, format, the count that must be > 0 to show it];
  // a q. key reads his passing row for that week.
  const CARD_ADV_COLS = {
    QB: [['q.dropbacks', 'DB', 'int'], ['q.db_epa', 'EPA/DB', 'dec2'], ['q.cpoe', 'CPOE', 'dec1'], ['q.pass_adot', 'aDOT', 'dec1'],
         ['carries', 'Car', 'int'], ['rush_epa', 'Rush EPA', 'dec2', 'carries']],
    RB: [['targets', 'Tgt', 'int'], ['catchable', 'Catchable', 'int'], ['adot', 'aDOT', 'dec1'], ['air_yards', 'Air yds', 'int'],
         ['tprr_est', 'TPRR (est)', 'dec2'], ['yprr_est', 'YPRR (est)', 'dec2'], ['rec_epa', 'Rec EPA', 'dec2', 'targets'],
         ['carries', 'Car', 'int'], ['rush_epa', 'Rush EPA', 'dec2', 'carries']],
  };
  CARD_ADV_COLS.WR = CARD_ADV_COLS.TE = CARD_ADV_COLS.RB.slice(0, 7);
  let CARD_LOG_VIEW = 'box';
  function cardAdvLog(U, uw, pos, oppOf) {
    const cols = CARD_ADV_COLS[pos] || CARD_ADV_COLS.RB, ix = (k) => U.fields.indexOf(k);
    const qBy = new Map((uw.q || []).map(r => [r[0], r]));
    const val = (row, [k, , , need]) => need && !row[ix(need)] ? null
      : k.startsWith('q.') ? (qBy.get(row[0]) || [])[U.qFields.indexOf(k.slice(2))] : row[ix(k)];
    return h('table', { class:'data adv-log adv-log-adv' },
      h('thead', null, h('tr', null, h('th', null, 'Wk'), h('th', null, 'Opp'),
        ...cols.map(([k, l]) => h('th', { class:'right', title:U.fieldDesc[k.replace('q.', '')] || '' }, l)))),
      h('tbody', null, ...uw.w.map(row => h('tr', null,
        h('td', { class:'tnum' }, String(row[0])), h('td', null, oppOf.get(row[0]) || ''),
        ...cols.map(c => h('td', { class:'right tnum' }, statFmt(val(row, c), c[2])))))));
  }
  function advancedBlock(sleeper) {
    const A = window.ADVANCED;
    const me = sleeper && A && A.players[String(sleeper.id)];
    if (!me) return null;
    const pos = me.p, keys = CARD_STAT_KEYS[pos] || [];
    const byKey = Object.fromEntries(A.columns.map(c => [c.key, c]));
    const pool = Object.values(A.players).filter(v => v.p === pos
      && (pos === 'QB' ? (v.dropbacks || 0) >= 15 : (v.snap_pct || 0) >= 0.2));
    const rankOf = (c) => {
      const v = me[c.key];
      if (v == null || typeof v !== 'number') return null;
      const vals = pool.map(x => x[c.key]).filter(x => typeof x === 'number');
      const better = vals.filter(x => (c.lowerBetter ? x < v : x > v)).length;
      return { rank: better + 1, of: vals.length };
    };
    const cells = keys.map(k => byKey[k]).filter(c => c && me[c.key] != null).map(c => {
      const r = rankOf(c);
      const tone = r && r.of >= 10 ? (r.rank <= Math.ceil(r.of * 0.2) ? 'delta-up'
        : r.rank > Math.floor(r.of * 0.8) ? 'delta-down' : '') : '';
      return h('div', { class:'adv-stat', title:c.desc },
        h('div', { class:'adv-stat-label' }, c.label),
        h('div', { class:`adv-stat-value tnum ${tone}` }, statFmt(me[c.key], c.fmt)),
        r ? h('div', { class:'adv-stat-rank tnum' }, `${pos}${r.rank} of ${r.of}`) : null);
    });
    const F = A.logFields || [];
    const idx = (k) => F.indexOf(k);
    const logCols = pos === 'QB'
      ? [['att', 'Att'], ['pass_yds', 'Yds'], ['pass_td', 'TD'], ['int', 'INT'], ['car', 'Car'], ['rush_yds', 'Ru yds'], ['ppr', 'PPR']]
      : [['snap_pct', 'Snap%'], ['tgt', 'Tgt'], ['rec', 'Rec'], ['rec_yds', 'Yds'], ['rec_td', 'TD'],
         ['car', 'Car'], ['rush_yds', 'Ru yds'], ['rush_td', 'Ru TD'], ['ppr', 'PPR']];
    const log = (me.wk || []).length ? h('table', { class:'data adv-log' },
      h('thead', null, h('tr', null, h('th', null, 'Wk'), h('th', null, 'Opp'),
        ...logCols.map(([, l]) => h('th', { class:'right' }, l)))),
      h('tbody', null, ...me.wk.map(row => h('tr', null,
        h('td', { class:'tnum' }, String(row[idx('week')])),
        h('td', null, row[idx('opp')] || ''),
        ...logCols.map(([k]) => {
          const v = row[idx(k)];
          return h('td', { class:'right tnum' }, v == null ? '' : k === 'snap_pct' ? `${Math.round(v * 100)}%` : String(v));
        }))))) : null;
    // Box score or Advanced. The advanced rows are usage-weekly.js, so only when it is this season.
    const U = window.USAGE_WEEKLY, uw = U && U.season === A.season && U.players[String(sleeper.id)];
    const oppOf = new Map((me.wk || []).map(row => [row[idx('week')], row[idx('opp')]]));
    const views = { box:log, adv:uw && uw.w.length ? cardAdvLog(U, uw, pos, oppOf) : null };
    const hold = h('div', { class:'tbl-scroll' });
    const viewBtns = views.box && views.adv ? h('span', { class:'sos-position-tabs adv-log-views', role:'group', 'aria-label':'Game log view' },
      ...[['box', 'Box score'], ['adv', 'Advanced']].map(([k, l]) => h('button', { type:'button', class:'ghost', dataset:{ view:k },
        onclick:() => { CARD_LOG_VIEW = k; showLog(); } }, l))) : null;
    const showLog = () => {
      const k = views[CARD_LOG_VIEW] ? CARD_LOG_VIEW : views.box ? 'box' : 'adv';
      hold.replaceChildren(views[k]);
      for (const b of viewBtns ? viewBtns.children : []) {
        b.classList.toggle('active', b.dataset.view === k);
        b.setAttribute('aria-pressed', String(b.dataset.view === k));
      }
    };
    if (views.box || views.adv) showLog();
    return h('div', { class:'card adv-card' },
      h('div', { class:'card-title' }, `Advanced, ${A.season} through week ${A.throughWeek}`),
      cells.length ? h('div', { class:'adv-grid' }, ...cells) : null,
      views.box || views.adv ? h('div', { class:'card-title', style:{ marginTop:'10px' } }, 'Game log') : null,
      viewBtns,
      views.box || views.adv ? hold : null,
      h('div', { class:'tip', style:{ marginTop:'6px' } },
        `Ranks are among ${pos}s with a real share of the work. (est) columns are estimates. `,
        h('a', { href:`#stats/${pos}` }, 'Open Stats Lab'),
        RT_POS.includes(pos) ? [' · ', h('a', { href:'#stats/Routes', class:'rt-card-link', onclick:() => rtOpenFor(sleeper.id) }, 'Targeted route tree')] : null));
  }

  // Injury history on the Context tab, under career availability, from
  // injury-history.js (build_injury_history.py). About 400 KB, so it loads when a
  // card opens, never at first paint. Newest season first; older than two collapsed.
  const INJ_PRACTICE = { 'Full Participation in Practice':'Full', 'Limited Participation in Practice':'Limited',
    'Did Not Participate In Practice':'DNP', 'Out (Definitely Will Not Play)':'Out' };
  function injuryHistoryBlock(sleeper) {
    if (!sleeper) return null;
    const title = () => h('div', { class:'card-title' }, 'Injury history');
    const card = h('div', { class:'card adv-card inj-card', dataset:{ sid:String(sleeper.id) } }, title(), h('div', { class:'muted' }, 'Loading...'));
    loadSeasonScript('injury-history.js', () => window.INJURY_HISTORY).then(() => {
      const H = window.INJURY_HISTORY, seasons = H.players[String(sleeper.id)] || [];
      // Q, D and P as on the injury chip, so the injury column keeps the width on a phone.
      const status = (s) => s ? h('span', { class:`badge injury${OUT_INJURY.has(s) ? ' injury-out' : ''}`, title:s },
        { Questionable:'Q', Doubtful:'D', Probable:'P' }[s] || s) : '';
      const quads = (a) => Array.from({ length:a.length / 4 }, (_, j) => a.slice(j * 4, j * 4 + 4));
      card.dataset.seasons = String(seasons.length);
      card.replaceChildren(title(),   // replaceChildren prints a null, so the empty state is spread in
        ...(seasons.length ? [] : [h('div', { class:'muted inj-empty' }, sleeper.exp === 0 ? 'No NFL injury report listings yet.'
          : `No NFL injury report listings on record, ${H.seasons[0]} to ${H.seasons[1]}.`)]),
        ...seasons.map(([yr, listed, out, part, rows], i) => h('details', { class:'inj-season', open:i < 2 ? '' : null, dataset:{ season:String(yr) } },
          h('summary', null, h('strong', null, String(yr)), `  ${listed} week${listed === 1 ? '' : 's'} listed · ${out} Out`,
            part ? ` · mostly ${H.injury[part]}` : ''),
          h('div', { class:'tbl-scroll' }, h('table', { class:'data adv-log' },
            h('thead', null, h('tr', null, h('th', null, 'Wk'), h('th', null, 'Status'), h('th', null, 'Practice'), h('th', null, 'Injury'))),
            h('tbody', null, ...quads(rows).map(([w, s, p, inj]) => h('tr', null,
              h('td', { class:'tnum' }, H.post[w] || String(w)),
              h('td', null, status(H.status[s])),
              h('td', { title:H.practice[p] }, INJ_PRACTICE[H.practice[p]] || H.practice[p]),
              h('td', { class:'inj-name', title:H.injury[inj] }, H.injury[inj].replace(/^Not injury related\s*-+\s*/i, 'Not injury: '))))))))),
        h('div', { class:'tip' }, 'Weekly NFL injury reports. A player on injured reserve is off the report, so IR weeks are not listed.'));
    }).catch(() => card.replaceChildren(title(), h('div', { class:'muted' }, 'injury-history.js did not load. Run projections/build_injury_history.py.')));
    return card;
  }

  // Season fantasy projection for the modal: pts from every source + the
  // projected stat line. Reuses window.OFFENSE_PROJ (offense + defense).
  function projectionBlock(sleeper) {
    if (!sleeper || !window.OFFENSE_PROJ) return null;
    const O = window.OFFENSE_PROJ;
    let unit = null, rec = null, cfg = null;
    for (const u of ['offense', 'defense']) {
      const r = (O[u]?.players || []).find(p => p.id === sleeper.id);
      if (r) { unit = u; rec = r; cfg = O[u]; break; }
    }
    if (!rec) return null;
    const line = (rec.stats && rec.stats.blend) || {};
    const yd = (k) => k === 'pass_yd' || k === 'rush_yd' || k === 'rec_yd';
    const statStr = (cfg.stat_keys || []).filter(k => line[k] != null)
      .map(k => `${STAT_LABEL[k] || k} ${fmt.decimal(line[k], yd(k) ? 0 : 1)}`).join('  ·  ');
    return h('div', { class: 'card', style: { background: 'var(--bg-2)', marginBottom: '12px' } },
      h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'baseline' } },
        h('div', { class: 'card-title' }, `Season projection · ${unit === 'defense' ? 'IDP' : 'Offense'}`)),
      h('div', { class: 'row gap-4 wrap', style: { margin: '6px 0' } },
        ...(cfg.sources || []).map(s => h('span', {
          class: 'badge' + (s === cfg.default ? ' you' : ''),
          title: s === cfg.default ? 'default source' : '',
        }, `${PROJ_SRC_LABEL[s] || s} ${rec[s] == null ? '·' : fmt.decimal(rec[s], 1)}`)),
        (() => { const e = ppEdge(rec); if (e == null) return null;
          const c = e >= 4 ? 'var(--green)' : e <= -4 ? 'var(--red)' : 'var(--fg-2)';
          return h('span', { class: 'badge', style: { color: c, borderColor: 'currentColor', background: 'transparent' }, title: 'PrizePicks vs Sleeper positional rank difference. + = the Vegas market ranks him higher than the public model → undervalued.' }, `PP−Slp ${e > 0 ? '+' : ''}${e}`); })()),
      // The positional rank and VOR that used to sit here are now band cells 2,
      // 4 and 5. The band is pinned above the tab bar, so this card and the band
      // were on screen together printing "RB1" and "VOR +138" twice each. The
      // band keeps them; this card keeps what the band does not carry, which is
      // the per-source spread and the projected stat line.
      statStr ? h('div', { class: 'tip' }, `Blended line: ${statStr}`) : null,
      unit === 'defense' ? h('div', { class: 'tip', style: { marginTop: '4px', opacity: .8 } }, 'PD/QB-hit best-estimated; no Vegas market for IDP.') : null,
    );
  }

  // Draft capital and athletic profile (window.PROSPECT) plus this week's
  // forecast for his game (window.WEATHER). Both are small, key-free and
  // rebuilt by the pipeline.
  function prospectBlock(sleeper) {
    const P = window.PROSPECT;
    const me = sleeper && P && P.players[String(sleeper.id)];
    if (!me) return null;
    const inches = (n) => n ? `${Math.floor(n / 12)}'${Math.round(n % 12)}"` : null;
    const drills = [['forty', '40', 2], ['vertical', 'Vert', 1], ['broad_jump', 'Broad', 0],
                    ['cone', '3-cone', 2], ['shuttle', 'Shuttle', 2], ['bench', 'Bench', 0]]
      .filter(([k]) => me[k] != null)
      .map(([k, label, dp]) => {
        const pct = me[`${k}_pct`];
        return h('div', { class:'adv-stat', title:`${label}: ${me[k]}, ${pct != null ? Math.round(pct) + 'th percentile among combine ' + me.pos + 's' : 'no percentile'}` },
          h('div', { class:'adv-stat-label' }, label),
          h('div', { class:`adv-stat-value tnum${pct >= 80 ? ' delta-up' : pct != null && pct <= 20 ? ' delta-down' : ''}` },
            Number(me[k]).toFixed(dp)),
          pct != null ? h('div', { class:'adv-stat-rank tnum' }, `${Math.round(pct)}th pct`) : null);
      });
    const draft = me.draft_capital === 'UDFA' || !me.draft_pick
      ? `Undrafted${me.draft_year ? `, ${me.draft_year}` : ''}`
      : `${me.draft_capital}, pick ${me.draft_pick} (round ${me.draft_round}), ${me.draft_year} ${me.drafted_by || ''}`.trim();
    const facts = [draft, me.college, [inches(me.height_in), me.weight_lb ? `${me.weight_lb} lb` : null].filter(Boolean).join(', '),
      me.age_at_draft ? `${Number(me.age_at_draft).toFixed(1)} at the draft` : null].filter(Boolean);
    const scores = [
      me.speed_score != null ? h('div', { class:'adv-stat', title:'Speed score: weight x 200 / forty^4 (Barnwell). 100 is average for an NFL back.' },
        h('div', { class:'adv-stat-label' }, 'Speed score'),
        h('div', { class:'adv-stat-value tnum' }, Number(me.speed_score).toFixed(1))) : null,
      me.athl_pct != null ? h('div', { class:'adv-stat', title:'Our composite: mean of his drill percentiles vs every combine participant at his position, 3+ drills required. Not Relative Athletic Score.' },
        h('div', { class:'adv-stat-label' }, 'Athletic %ile'),
        h('div', { class:`adv-stat-value tnum${me.athl_pct >= 80 ? ' delta-up' : me.athl_pct <= 20 ? ' delta-down' : ''}` }, String(Math.round(me.athl_pct)))) : null,
    ].filter(Boolean);
    return h('div', { class:'card adv-card' },
      h('div', { class:'card-title' }, 'Draft and athletic profile'),
      h('div', { class:'tip', style:{ marginBottom:'8px' } }, facts.join('  \u00b7  ')),
      (scores.length || drills.length) ? h('div', { class:'adv-grid' }, ...scores, ...drills)
        : h('div', { class:'tip' }, 'No combine results on file.'));
  }

  // ============================================================
  // College prospect model (window.PROSPECT_MODEL)
  // ============================================================
  // Built by projections/build_prospect_model.py; method and honest error bars in
  // notes/prospect-research/model-card.md. Draft capital is most of the signal, so
  // where college stats did not beat it out of sample (QB, TE) the hit chance is
  // the draft-only model and the talent score is shown as a profile, not a forecast.
  const PM_TIER_CLS = ['S', 'A', 'B', 'C', 'D'];
  const pmPct = (p) => p == null ? '·' : `${Math.round(p * 100)}%`;
  const pmNum = (d) => (v) => v == null ? '·' : Number(v).toFixed(d);
  function pmTierChip(tr) {
    const M = window.PROSPECT_MODEL;
    if (!M || tr == null) return h('span', { class:'muted' }, '·');
    return h('span', { class:`tier-chip ${PM_TIER_CLS[tr]} prm-tier`,
      title:`${M.tiers[tr]}: talent score ${M.tier_cut[tr]} or better, a percentile against every drafted player at the position since 2008` },
      M.tiers[tr]);
  }
  // Five pips for a 0-100 score on a card face (DESIGN.md: countable, no false precision).
  const pmPips = (score) => h('span', { class:'rating-track', 'aria-hidden':'true' },
    ...[0, 1, 2, 3, 4].map(i => h('i', { class:`pip${i < Math.round(score / 20) ? ' on' : ''}` })));
  // The college stats each position's model actually uses: [key, label, format, meaning].
  function pmStatCols(pos) {
    if (pos === 'QB') return [
      ['comp', 'Comp %', pmPct, 'Final-season completion %'],
      ['rypg', 'Rush Y/G', pmNum(1), 'Best rushing yards per game in a season as the passer (sacks excluded)'],
      ['aya', 'AY/A', pmNum(1), 'Final-season adjusted yards per attempt: (yards + 20 x TD - 45 x INT) / attempts'],
      ['starts', 'Starts', pmNum(0), 'Seasons as the starter (a 150-attempt pace)'],
    ];
    const yp = { WR:['Career YPTPA', 'Career receiving yards per team pass attempt'],
                 TE:['Best YPTPA', 'Best-season receiving yards per team pass attempt'],
                 RB:['Final YPTPA', 'Final-season receiving yards per team pass attempt'] }[pos];
    return [
      ['dom', 'Dominator', pmPct, `Best-season dominator: mean of his share of team ${pos === 'RB' ? 'scrimmage' : 'receiving'} yards and TDs`],
      ['yptpa', yp[0], pmNum(2), yp[1]],
      pos === 'RB' ? ['sypg', 'Scrim Y/G', pmNum(1), 'Career scrimmage yards per game']
        : ['share', 'Yds share', pmPct, 'Best-season share of team receiving yards'],
    ];
  }
  function pmTile(label, value, title, sub) {
    return h('div', { class:'adv-stat', title },
      h('div', { class:'adv-stat-label' }, label),
      h('div', { class:'adv-stat-value tnum' }, value),
      sub ? h('div', { class:'adv-stat-rank' }, sub) : null);
  }
  function pmComps(cp) {
    if (!cp || !cp.length) return null;
    return h('div', { class:'tip prm-comps' }, 'Profile comps: ',
      ...cp.map(([n, y, pk, ppg, hit], i) => h('span', { class:'prm-comp' },
        `${n} (${y}, pick ${pk}, best ${Number(ppg).toFixed(1)} PPG, ${hit ? 'hit' : 'miss'})${i < cp.length - 1 ? '; ' : ''}`)));
  }

  function prospectModelBlock(sleeper) {
    const M = window.PROSPECT_MODEL;
    const me = sleeper && M && M.nfl && M.nfl[String(sleeper.id)];
    if (!me) return null;
    const meta = M.pos[me.p] || {};
    const capOnly = meta.shipped === 'draft';
    const years = (meta.target || '').replace(/^.* in NFL years /, '');
    const title = h('div', { class:'card-title' }, 'Prospect profile');
    if (me.nocfb) {
      return h('div', { class:'card adv-card prm-card' }, title,
        h('div', { class:'tip' }, `No college line on file (the college feed is FBS only). `
          + `Hit chance from draft capital alone: ${pmPct(me.hp)}. ${meta.target}.`));
    }
    const tiles = [
      pmTile('Tier', pmTierChip(me.tr), 'Our tier, cut on the talent score'),
      me.ts != null ? pmTile('Talent', h('span', null, `${me.ts} `, pmPips(me.ts)),
        `College profile with no draft capital: percentile against every drafted ${me.p} since 2008`) : null,
      pmTile('Hit chance', pmPct(me.hp),
        capOnly ? `Draft capital alone. At ${me.p}, college stats did not beat draft slot out of sample.`
          : 'College profile plus draft capital', capOnly ? 'draft slot only' : `talent only ${pmPct(me.tp)}`),
      me.ba != null ? pmTile('Breakout age', Number(me.ba).toFixed(1),
        'Age at his first college season at the dominator line (never broke out: final age plus one)') : null,
      ...pmStatCols(me.p).map(([k, label, f, t]) => me.st && me.st[k] != null ? pmTile(label, f(me.st[k]), t) : null),
    ].filter(Boolean);
    const out = me.out ? (me.out[0]
      ? `Outcome: hit, best finish ${me.p}${me.out[2]} at ${me.out[1]} PPR points per game in years ${years}.`
      : `Outcome: missed, best ${me.out[1]} PPR points per game in years ${years}${me.out[2] ? ` (${me.p}${me.out[2]})` : ''}.`) : null;
    return h('div', { class:'card adv-card prm-card' }, title,
      h('div', { class:'tip', style:{ marginBottom:'8px' } },
        `Hit = ${(meta.target || '').replace(/^Top/, 'top')}. `
        + (me.oos ? `Scored without his ${me.y} draft class in the training data. ` : '')
        + `Draft ${me.y}, pick ${me.pk}.`),
      h('div', { class:'adv-grid' }, ...tiles),
      me.ln ? h('div', { class:'tip prm-line' }, me.ln) : null,
      out ? h('div', { class:'tip prm-out' }, out) : null,
      pmComps(me.cp));
  }

  // #prospects: current college players by position, plus the newest rookie class.
  const prospectSort = { key:'ts', dir:'desc' };
  function viewProspects(posArg, modeArg) {
    const main = $('#main'); main.innerHTML = '';
    const M = window.PROSPECT_MODEL;
    if (!M) { main.appendChild(h('div', { class:'empty' }, 'prospect-model.js not loaded. Run projections/build_prospect_model.py.')); return; }
    const POSL = ['QB', 'RB', 'WR', 'TE'];
    const pos = POSL.includes(posArg) ? posArg : 'WR';
    const mode = ['later', 'rookies'].includes(modeArg) ? modeArg : 'next';
    const rookies = mode === 'rookies';
    const meta = M.pos[pos] || {};
    const capOnly = meta.shipped === 'draft';
    const next = M.season + 1;
    const hashFor = (p, m) => `#prospects/${p}${m === 'next' ? '' : `/${m}`}`;
    const rows = rookies
      ? Object.entries(M.nfl).filter(([, r]) => r.p === pos && r.y === M.season).map(([id, r]) => ({ ...r, id }))
      : M.college.filter(r => r.p === pos && (mode === 'later' ? r.cls > next : r.cls === next));
    const scen = (M.college.find(r => r.p === pos) || {}).r;
    const roundNames = ['Round 1', 'Round 2', 'Round 3', 'Day 3'];

    main.appendChild(breadcrumbs([{ label:'Tools' }, { label:'Prospects' }]));
    main.appendChild(pageHeader({
      eyebrow:'PROSPECT MODEL',
      title: rookies ? `${M.season} rookies` : 'College prospects',
      sub: `Hit = ${(meta.target || '').replace(/^Top/, 'top')}. Talent is the college profile with no draft capital, `
        + `as a percentile against every drafted ${pos} since 2008.`,
    }));
    main.appendChild(tabBar(POSL.map(k => ({ key:k, label:k })), pos, k => hashFor(k, mode)));
    main.appendChild(h('div', { class:'sos-position-tabs prm-modes', role:'group', 'aria-label':'Which players' },
      ...[['next', `${next} class`], ['later', `${next + 1}+`], ['rookies', `${M.season} rookies`]].map(([m, label]) =>
        h('button', { class:`ghost${m === mode ? ' active' : ''}`, 'aria-pressed':String(m === mode),
          onclick:() => navigate(hashFor(pos, m)) }, label))));

    const hitLine = (meta.tier_hit || []).map(([n, hit], i) => hit == null ? null : `${M.tiers[i]} ${pmPct(hit)}`).filter(Boolean).join(', ');
    const notes = [
      capOnly
        ? `At ${pos} the college stats did not beat draft slot out of sample, so the forecast is draft capital alone`
          + (scen ? `: ${roundNames.map((r, i) => `${r} ${pmPct(scen[i])}`).join(', ')} for any ${pos}.` : '.')
          + ' Talent and tier describe the college profile only.'
        : rookies ? 'Hit chance uses his actual draft slot plus his college profile.'
          : `If drafted columns average the model over every pick in the range (Round 1 = 1-32, Round 2 = 33-64, `
            + `Round 3 = 65-100, Day 3 = 101-257).`,
      hitLine ? `Past hit rate by tier, out of sample: ${hitLine}.` : null,
      rookies ? null : 'College ages are estimated from class year (no public birth dates), and a live season counts once it reaches 6 games.',
    ].filter(Boolean);
    main.appendChild(h('div', { class:'card prm-notes' }, ...notes.map(t => h('p', { class:'tip' }, t))));

    const stat = pmStatCols(pos);
    const cols = [
      ['n', 'Player', { asc:true }],
      rookies ? ['pk', 'Pick', { right:true, asc:true, title:'Overall draft pick' }] : null,
      mode === 'later' ? ['cls', 'Eligible', { right:true, asc:true, title:'First draft he is eligible for' }] : null,
      ['ts', 'Talent', { right:true, title:`College profile, no draft capital: percentile vs drafted ${pos}s since 2008` }],
      ['tr', 'Tier', { asc:true, title:'Our tier, cut on the talent score' }],
      rookies ? ['hp', 'Hit %', { right:true, title:capOnly ? 'Draft capital alone' : 'College profile plus his actual draft slot' }] : null,
      pos === 'QB' ? null : ['ba', 'Breakout', { right:true, asc:true, title:'Age at his first college season at the dominator line' }],
      rookies ? null : ['age', 'Draft age', { right:true, asc:true, title:'Estimated age at his first eligible draft' }],
      ...stat.map(([k, label, , t]) => [`st.${k}`, label, { right:true, title:t }]),
      ...(!rookies && !capOnly ? roundNames.map((r, i) => [`r${i}`, i < 3 ? `R${i + 1}` : 'Day 3',
        { right:true, title:`Hit chance if drafted in ${r}` }]) : []),
    ].filter(Boolean);
    const get = (r, k) => /^r\d$/.test(k) ? (r.r || [])[Number(k[1])] : k.startsWith('st.') ? (r.st || {})[k.slice(3)] : r[k];
    const { key, dir } = cols.some(c => c[0] === prospectSort.key) ? prospectSort : { key:'ts', dir:'desc' };
    const sgn = dir === 'desc' ? -1 : 1;
    rows.sort((a, b) => {
      const x = get(a, key), y = get(b, key);
      if (x == null || y == null) return (x == null) - (y == null);   // blanks last both ways
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sgn;
    });
    const sortHdr = ([k, label, o]) => {
      const on = k === key;
      const activate = () => {
        prospectSort.key = k;
        prospectSort.dir = on ? (dir === 'desc' ? 'asc' : 'desc') : (o.asc ? 'asc' : 'desc');
        viewProspects(pos, mode);
      };
      return h('th', { class:`clickable${on ? ' sort-active' : ''}${o.right ? ' right' : ''}`, title:o.title, tabindex:'0',
        'aria-sort':on ? (dir === 'desc' ? 'descending' : 'ascending') : 'none', onclick:activate,
        onkeydown:(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } } },
        label + (on ? (dir === 'desc' ? ' ↓' : ' ↑') : ''));
    };
    const fmtCell = (r, k) => {
      const v = get(r, k);
      if (k === 'tr') return pmTierChip(v);
      if (k === 'n') return h('div', { class:'name-cell' }, h('span', { class:'name' }, v),
        r.sch ? h('span', { class:'muted prm-school' }, r.sch) : null);
      if (k.startsWith('st.')) return stat.find(s => `st.${s[0]}` === k)[2](v);
      if (k === 'hp' || /^r\d$/.test(k)) return pmPct(v);
      if (k === 'ba' || k === 'age') return pmNum(1)(v);
      return v == null ? '·' : String(v);
    };
    if (!rows.length) {
      main.appendChild(h('div', { class:'empty' }, rookies ? `No ${M.season} ${pos}s on file.` : `No ${pos} prospects in this group.`));
      return;
    }
    const tbl = h('table', { class:'data prm-table' },
      h('thead', null, h('tr', null, h('th', { class:'right' }, '#'), ...cols.map(sortHdr))),
      h('tbody', null, ...rows.map((r, i) => h('tr', rookies ? { class:'clickable', onclick:() => openPlayerDetail(r.n, r.id) } : null,
        h('td', { class:'right tnum' }, String(i + 1)),
        ...cols.map(([k, , o]) => h('td', { class:`${o.right ? 'right ' : ''}tnum` }, fmtCell(r, k)))))));
    const card = h('div', { class:'card' });
    appendTable(card, tbl);
    main.appendChild(card);
  }

  // weather.js keys teams by nflverse code, which writes the Rams as LA.
  function gameWeatherFor(team) {
    const W = window.WEATHER;
    const code = team === 'LAR' ? 'LA' : team;
    const gid = W && code && W.byTeam && W.byTeam[code];
    return (gid && W.games.find(x => x.game_id === gid)) || null;
  }
  function weatherLine(sleeper) {
    const W = window.WEATHER;
    const team = sleeper && (sleeper.team === 'LAR' ? 'LA' : sleeper.team);
    const g = sleeper ? gameWeatherFor(sleeper.team) : null;
    if (!g) return null;
    const opp = g.home === team ? `vs ${g.away}` : `@ ${g.home}`;
    const when = g.kickoff ? new Date(g.kickoff).toLocaleString([], { weekday:'short', hour:'numeric', minute:'2-digit' }) : '';
    const body = g.temp_f == null
      ? (g.reason === 'indoors' ? 'Indoors' : (g.reason || 'No forecast'))
      : `${Math.round(g.temp_f)}\u00b0F, wind ${Math.round(g.wind_mph)} mph (gusts ${Math.round(g.gust_mph)}), ${Math.round(g.precip_prob || 0)}% precip`;
    return h('div', { class:`card weather-line${g.flag ? ' weather-flag' : ''}` },
      h('div', { class:'card-title' }, `Week ${W.week} weather`),
      h('div', null, `${opp}, ${when}, ${g.stadium}. ${body}.`,
        g.flag ? h('strong', { style:{ marginLeft:'6px' } }, `Watch: ${g.flag}.`) : null,
        g.note ? h('span', { class:'tip', style:{ marginLeft:'6px' } }, g.note) : null),
      (g.total_line != null || g.spread_line != null) ? h('div', { class:'tip' },
        // nflverse spread_line is positive when the HOME team is favored.
        [g.total_line != null ? `Vegas total ${g.total_line}` : null,
         g.spread_line == null ? null : g.spread_line === 0 ? 'pick em'
           : `${g.spread_line > 0 ? g.home : g.away} by ${Math.abs(g.spread_line)}`].filter(Boolean).join(', ') + '.') : null);
  }

  function playerInfoBlock(name, sleeper) {
    const database = window.PLAYER_INFO;
    const info = sleeper?.id
      ? database?.by_id?.[sleeper.id]
      : database?.by_name?.[norm(name)];
    if (!info?.takeaways?.length) return null;

    return h('section', { class:'player-intel', 'aria-label':'Timestamped video takeaways' },
      h('div', { class:'hist-head' },
        h('div', null,
          h('div', { class:'card-title' }, 'Video intel'),
          h('div', { class:'intel-provenance' }, `${database.source} · captured ${database.captured_at}`)
        ),
        h('div', { class:'tip tnum' }, `${info.takeaways.length} takeaway${info.takeaways.length === 1 ? '' : 's'}`)
      ),
      h('div', { class:'intel-list' }, ...info.takeaways.map(item => {
        const video = database.videos[item.video_id];
        const href = `https://www.youtube.com/watch?v=${item.video_id}&t=${item.at}s`;
        return h('article', { class:'intel-item' },
          h('div', { class:'intel-meta' },
            h('a', {
              class:'intel-time tnum', href, target:'_blank', rel:'noopener',
              title:`Open ${video.title} at ${item.timestamp}`
            }, `Watch ${item.timestamp}`),
            h('span', { class:'intel-date tnum' }, video.published_at),
            h('span', { class:'intel-source', title:video.title }, video.title)
          ),
          h('div', { class:'intel-takeaway' }, item.takeaway)
        );
      }))
    );
  }

  // ============================================================
  // Router
  // ============================================================
  // ============================================================
  // Projections, fantasy points from free sources, source-selectable.
  // Offense: PrizePicks / Sleeper / Blended. Defense (IDP): Clay / Sleeper /
  // Blended (no PP, Vegas has no tackle market). Data: window.OFFENSE_PROJ =
  // { offense:{default,sources,stat_keys,players}, defense:{...} }.
  // ============================================================
  // `whatIf` holds hypothetical player ids spliced into MY roster only, so the
  // board answers "where would I rank if I landed these guys". Deliberately not
  // persisted: a hypothetical that survives a reload is a way to fool yourself.
  const PROJ_STATE = { leagueId: null, unit: 'offense', source: null, pos: 'ALL', team: 'ALL', sort: null, whatIf: [], odds: null };
  // Title odds cost a few seconds of Monte Carlo, so they're computed on demand
  // and cached against the exact inputs that produced them. The key includes the
  // what-if set: change the hypothetical, get a fresh number, not a stale one.
  const ODDS_CACHE = new Map();
  function oddsFor(lg, src, whatIf, sims) {
    const key = `${lg.id}|${src}|${sims}|${[...whatIf].sort().join(',')}`;
    if (ODDS_CACHE.has(key)) return ODDS_CACHE.get(key);
    const me = (lg.rosters || []).find(r => r.is_me);
    const wi = (whatIf.length && me) ? { [me.roster_id]: { add: whatIf, drop: [] } } : null;
    const res = championshipOdds(lg, { sims, src, whatIf: wi });
    ODDS_CACHE.set(key, res);
    return res;
  }
  const PROJ_SRC_LABEL = { blend: 'Blended', pp: 'PrizePicks', sleeper: 'Sleeper', clay: 'Clay' };
  const STAT_LABEL = {
    pass_yd: 'Pa Yd', pass_td: 'Pa TD', pass_int: 'INT', rush_yd: 'Ru Yd', rush_td: 'Ru TD',
    rec: 'Rec', rec_yd: 'Re Yd', rec_td: 'Re TD',
    solo: 'Solo', ast: 'Ast', sack: 'Sk', tfl: 'TFL', int: 'INT', ff: 'FF', pass_def: 'PD', qb_hit: 'QBH', fum_rec: 'FR',
  };
  const POS_CHIPS = { offense: ['ALL', 'QB', 'RB', 'WR', 'TE', 'FLEX'], defense: ['ALL', 'LB', 'DB', 'DL'] };
  const FLEX_GROUPS = ['RB', 'WR', 'TE'];
  function projPosMatch(pos, filter) {
    if (filter === 'ALL') return true;
    const g = projPosGroup(pos);
    return filter === 'FLEX' ? FLEX_GROUPS.includes(g) : g === filter;
  }

  // Team environment / SOS (Draft Sharks Fantasy Environment Score, window.TEAM_ENV).
  const ENV_TIER_COLOR = { target: 'var(--green)', good: 'var(--blue)', neutral: 'var(--fg-3)', below: 'var(--amber)', avoid: 'var(--red)' };
  // Fractional age from birth_date (Sleeper's `age` is a whole number).
  function ageOf(pid, fallback) {
    const sp = pid ? window.PLAYERS[pid] : null;
    const bd = sp && sp.birth_date;
    if (bd) { const ms = Date.now() - new Date(bd).getTime(); if (ms > 0) return ms / 31557600000; }
    return fallback != null ? fallback : (sp ? sp.age : null);
  }
  function teamEnv(abbr) { return (window.TEAM_ENV && window.TEAM_ENV.teams) ? window.TEAM_ENV.teams[abbr] : null; }
  function envChip(abbr) {
    const e = teamEnv(abbr); if (!e) return null;
    return h('span', { class: 'badge', title: `Fantasy environment #${e.env_rank}/${e.total} (${e.tier}), ${e.implied_pf} implied pts/game (offense #${e.pf_rank})`, style: { color: ENV_TIER_COLOR[e.tier], borderColor: 'currentColor', background: 'transparent' } }, String(e.env_rank));
  }
  // Our own data-clustered dynasty category (window.PLAYER_CATEGORIES), replaces
  // the off-base third-party category field.
  const OURCAT_COLOR = {
    'Cornerstone': 'var(--green)', 'Win-Now Star': 'var(--green)',
    'Ascending': 'var(--blue)', 'Win-Now Starter': 'var(--blue)', 'Young Upside': 'var(--accent)',
    'Aging Elite': 'var(--amber)', 'Veteran Starter': 'var(--amber)',
    'Rotational': 'var(--fg-2)', 'Aging Depth': 'var(--fg-3)',
  };
  function ourCat(pid) { return (window.PLAYER_CATEGORIES && window.PLAYER_CATEGORIES.players) ? window.PLAYER_CATEGORIES.players[pid] : null; }
  // Our own value tier (S..F), built from scratch by 1-D value k-means.
  const OURTIER_COLOR = { S: 'var(--green)', A: 'var(--accent)', B: 'var(--blue)', C: 'var(--amber)', D: 'var(--fg-2)', F: 'var(--fg-3)' };
  function ourTierChip(pid) {
    const c = pid && ourCat(pid); if (!c || !c.tier) return null;
    return h('span', { class: 'badge', title: `Tier ${c.tier}, our dynasty value tier (value ${Math.round((c.value || 0) / 100)})`,
      style: { color: OURTIER_COLOR[c.tier] || 'var(--fg-2)', borderColor: 'currentColor', background: 'transparent', fontWeight: 700 } }, c.tier);
  }
  function ourCatChip(pid) {
    const c = pid && ourCat(pid); if (!c) return null;
    return h('span', { class: 'badge', title: `${c.category}, ${c.why} (dynasty value ${Math.round((c.value || 0) / 100)}, age ${c.age}, proj ${c.proj})`,
      style: { color: OURCAT_COLOR[c.category] || 'var(--fg-2)', borderColor: 'currentColor', background: 'transparent', fontWeight: 600 } }, c.category);
  }

  function teamSos(abbr) { return (window.TEAM_SOS && window.TEAM_SOS.teams) ? window.TEAM_SOS.teams[abbr] : null; }
  function envInfoLine(sleeper) {
    const e = sleeper && teamEnv(sleeper.team); if (!e) return null;
    const s = teamSos(sleeper.team);
    const sosTxt = s && s.off_sos_rank
      ? ` · SOS: offense #${s.off_sos_rank}/32, defense/IDP #${s.def_sos_rank}/32`
      : '';
    return h('div', { class: 'tip', style: { marginBottom: '12px' } },
      `Team environment: #${e.env_rank}/${e.total} (${e.tier}) · ${e.implied_pf} implied pts/game (off #${e.pf_rank}, def allows #${e.pa_rank})${sosTxt}`);
  }
  // Opponent defense strength -> color for the game log (rank 1 = toughest D = red,
  // rank 32 = weakest D = green; easy matchups read green).
  function defColor(oppAbbr) {
    const e = teamEnv(oppAbbr); if (!e) return 'var(--fg-2)';
    const r = e.pa_rank;
    return r <= 8 ? 'var(--red)' : r <= 16 ? 'var(--amber)' : r <= 24 ? 'var(--accent)' : 'var(--green)';
  }
  // Game log: week-by-week schedule, opponent acronym colored by the strength of the
  // defense faced, with Vegas (or projected) implied points for/against.
  function scheduleStrip(sleeper) {
    const s = sleeper && teamSos(sleeper.team); if (!s || !s.schedule?.length) return null;
    const row = (g) => {
      const e = teamEnv(g.opp);
      return h('tr', { title: e ? `${g.opp} defense: allows ${e.implied_pa}/g (#${e.pa_rank} of 32)` : '' },
        h('td', { class: 'tnum', style: { color: 'var(--fg-3)' } }, `W${g.week}`),
        h('td', null,
          h('span', { class: 'muted', style: { fontSize: '10px' } }, g.home ? 'vs ' : '@ '),
          h('span', { style: { fontWeight: 700, color: defColor(g.opp) } }, g.opp)),
        h('td', { class: 'tnum', style: { textAlign: 'right' } }, g.implied_pf ?? '~'),
        h('td', { class: 'tnum', style: { textAlign: 'right', color: 'var(--fg-3)' } }, g.implied_pa ?? '~'),
        h('td', null, h('span', { class: 'muted', style: { fontSize: '9px' } }, g.posted ? 'VEG' : 'proj')));
    };
    return h('div', { class: 'card', style: { background: 'var(--bg-2)', marginBottom: '12px' } },
      h('div', { class: 'card-title' }, 'Game Log'),
      h('div', { class: 'tip', style: { marginBottom: '6px' } },
        `Opponent colored by defense faced, green = weak D (smash), red = elite D (tough). Implied pts: actual Vegas thru wk ${window.TEAM_SOS.lines_through_week}, projected after.`),
      h('div', { style: { maxHeight: '260px', overflowY: 'auto' } },
        h('table', { class: 'data snug', style: { fontSize: '12px' } },
          h('thead', null, h('tr', null,
            h('th', null, 'Wk'), h('th', null, 'Opp'),
            h('th', { style: { textAlign: 'right' } }, 'Pts'), h('th', { style: { textAlign: 'right' } }, 'vs'),
            h('th', null, 'Line'))),
          h('tbody', null, ...s.schedule.map(row)))));
  }

  function projUnitData() { return (window.OFFENSE_PROJ || {})[PROJ_STATE.unit] || { sources: [], players: [], stat_keys: [] }; }
  function projMap(unit) {
    const m = new Map();
    for (const p of ((((window.OFFENSE_PROJ || {})[unit]) || {}).players || [])) if (p.id) m.set(p.id, p);
    return m;
  }
  function idpSlotCount(lg) {
    let n = 0;
    for (const s of (lg.roster_positions || []))
      if (['IDP_FLEX', 'IDP', 'LB', 'DB', 'DL', 'CB', 'S', 'DE', 'DT', 'NT'].includes(s)) n++;
    return n;
  }

  // ============================================================
  // Championship odds, Monte Carlo season + playoff bracket
  // ============================================================
  // Season-long projected points rank rosters. They do NOT tell you who wins a
  // title: a 10-team league sends 6 to the playoffs, and three single-week
  // rounds are close to coin flips between comparable teams. This simulates the
  // thing you actually care about.
  //
  // Every constant below is a modeling assumption, not a fact. They're gathered
  // here so they can be argued with and tuned in one place.
  const SIM = {
    // The modern calendar: 18 NFL weeks, each team plays 17 games with one bye,
    // and fantasy runs 17 weeks (this league: 14 regular + playoffs in 15/16/17).
    // `weeks` is the calendar length, used for the injury-rate math and the bye.
    // `gamesPlayed` is the divisor for a per-game rate, because a season
    // projection is already spread over the 17 games a player actually plays.
    // Using 18 here would double-charge the bye, which rollSeason already models.
    weeks: 18,
    gamesPlayed: 17,
    // Weekly scoring noise as a fraction of a player's per-game mean. Fantasy
    // weekly scores are wildly overdispersed; QBs are the steadiest, RB/WR the
    // least (a WR's week is one long TD away from tripling).
    // K measured: median 0.51 over 98 kicker-seasons, 2021-2024 regular season
    // (historical/kicking_stats, 8+ games, FG 3/4/5 by distance plus PAT).
    cv: { QB: 0.34, RB: 0.55, WR: 0.62, TE: 0.60, K: 0.51, DEF: 0.5 },
    // Expected games missed per 17-game season for a prime-age player, by
    // position. RBs take the most contact; QBs are protected. A team defense
    // never misses a game; a kicker rarely does (assumed, not measured).
    missedGames: { QB: 1.5, RB: 3.0, WR: 2.3, TE: 2.6, K: 0.5, DEF: 0 },
    // Injuries have duration, so depth matters. Mean absence in weeks once hurt.
    injuryDurationWeeks: 3,
    // Older bodies miss more. Multiplier on expected missed games per year past
    // the position's durability shoulder.
    ageShoulder: { QB: 33, RB: 26, WR: 29, TE: 29 },
    agePenaltyPerYear: 0.12,
    // Weeks lost to a designation already on the wire. IR has no return date in
    // the Sleeper feed, so this is a median soft-tissue/ligament absence.
    designationWeeksOut: { IR: 6, PUP: 6, NA: 6, Sus: 4, Out: 1, Doubtful: 1, COV: 1, DNR: 6 },
    questionableOutChance: 0.25,
    // SEASON-LONG projection error, drawn once per player per simulated season.
    // This is the big one. Summing independent weekly noise makes the favorite
    // win far too often, because it quietly assumes the projections are RIGHT
    // and only the weeks are random. They aren't: a projected WR2 finishes
    // anywhere from WR60 to WR3. Lognormal sigma ~0.35 reproduces the observed
    // spread of actual-vs-preseason finishes. Without it a 2455-point roster
    // beats an 1856-point roster essentially always, which is not what happens.
    projectionSigma: 0.35,
    // Correlated team-level week noise, on top of per-player noise. Ten starters
    // summed independently is too smooth (CLT); real teams share game scripts,
    // weather, stacks and blowouts. Tuned so a team's weekly CV lands near the
    // ~0.25 seen in real PPR leagues instead of the ~0.17 independence implies.
    teamShockCv: 0.14,
    // STACK correlation: a QB and his own receiver share one passing game, so a
    // stacked lineup has a higher ceiling. In a single-elimination bracket an
    // underdog wants ceiling, so this is not a rounding error for a weak roster.
    //
    // MEASURED, not assumed. `historical/derived/weekly_fantasy.csv`, 2021-2024
    // regular season, every same-team pair where both players logged 8+ games in a
    // real role, correlating weekly PPR across shared weeks. 3,111 pairs:
    //   QB-WR +0.303   QB-TE +0.242   QB-RB +0.072
    //   RB-WR -0.023   TE-WR -0.005   RB-TE -0.014
    //   WR-WR +0.004   RB-RB -0.039   TE-TE +0.002
    //
    // Two things that matrix rules out. It is NOT a general team factor: a shared
    // team shock would make every same-team pair positive, and everything except
    // QB-to-receiver measures at zero. And WR-WR is ZERO, not negative: the shared
    // passing game and the competition for targets cancel almost exactly.
    //
    // So the effect is modeled as a QB-to-receiver link only, applied between a QB
    // and his single highest-projected same-team receiver in the lineup. Loading a
    // second receiver from the same team onto the factor would manufacture a
    // WR-WR correlation the data says does not exist.
    stackCorr: { WR: 0.303, TE: 0.242, RB: 0.072 },
    byeWeeks: [5, 14],         // inclusive range a player's bye can land in
    // Trade Lab title odds: total simulated seasons per run, split across the
    // horizon (dynasty 3 x 2500, redraft 1 x 7500, same runtime).
    tradeSimBudget: 7500,
    // A title-odds change inside z standard errors of the difference is painted
    // as noise, not signal. One run at 2500 sims moved a bench-for-bench swap by
    // -0.5 to +1.1 across six seeds, so an unbanded delta flips sign on a reseed.
    titleBandZ: 2,
    // Redraft verdict bands on the edge (half the gap between the two sides'
    // changes): FAIR inside the first, CLOSE inside the second, else a WIN.
    // Lineup edge in rest-of-season points (15 pts is ~1 pt a week over the 15
    // weeks left); title edge in percentage points of 2026 title odds.
    // A 1.0 pt title edge is 12% of a 12-team fair share (8.3%).
    verdictLineupPts: [15, 40],
    verdictTitlePp: [0.5, 1.0],
    // Trade Finder. Pieces below finderMinAsset are roster filler, not currency.
    // A package is scored exactly only if it reads CLOSE or better on the market
    // (KT.computeFairness pct) and the smaller side's biggest asset is at least
    // finderAnchorRatio of the bigger side's: a pile of fillers never buys a stud.
    finderMinAsset: 3,
    finderFairPct: 75,
    finderAnchorRatio: 0.75,
    // The partner's side of the headliner rule, stricter: when he gives up the
    // bigger single asset, the best piece coming back must be finderPartnerAnchorRatio
    // of it. A rebuilder also keeps his core, his most valuable player and his
    // finderCoreYoung best by value finderFvYears out, unless ONE younger piece or a
    // pick comes back.
    finderPartnerAnchorRatio: 0.9,
    finderCoreYoung: 3,
    // A rebuilder's FV has to rise by at least this much (about a tenth of a mid
    // first): a smaller change is inside the aging curves' rounding.
    finderMinFvGain: 5,
    // The least starting-lineup gain worth proposing to me, in season points:
    // under ~10 (about a point a week of what is left) a deal is a wash, and its
    // title-odds change sits far inside the simulator's noise.
    finderMinGainPts: 10,
    // Search width: packages scored exactly per partner, and how many reach the
    // title simulation, per partner and per league. Each simulated deal costs one
    // championshipOdds run of finderSims seasons (~0.5 s headless on a laptop).
    // Before and after share every draw, so the title-odds change has a paired
    // standard error, and a deal shows only when my gain beats finderSeMult of it.
    // Measured 2026-09-25 on a small Phi Kap deal: SE 0.9 pts at 800 sims, and five
    // seeds landed inside it. finderSims is only the screen: a deal that clears it
    // is re-run at the Trade Lab's own count (tradeSimBudget over its horizon) and
    // shown only if it clears the same gates there.
    finderCandidateCap: 400,
    finderSimPerPartner: 3,
    finderSimTop: 20,
    finderSims: 800,
    finderSeMult: 2,
    // The screen's own bar, looser: at 800 sims 2 SE is ~2 pts, so a real +2 deal
    // died there although it cleared 2 SE at the Lab's count (Phi Kap, Zay Flowers
    // for Parker Washington + Trevor Lawrence: +2.0 ±2.7 at 800, +2.3 ±0.9 at 7,500).
    // At 1 SE it still killed one: Washington, Kenneth Walker for Trey McBride +
    // Brock Purdy, +1.8 ±0.7 at 7,500 but +0.9 ±2.3 on its first 800 seasons once
    // K and DEF entered the pool. The Lab-count re-run keeps the 2 SE bar.
    finderScreenSeMult: 0.5,
    finderShow: 8,
    finderShowPerPartner: 2,
    // Dynasty ranking: percentage points of this season's title odds per unit of
    // FV (starting-lineup value finderFvYears out, the dashboard's FV). 0.05 prices
    // 20 FV, about 5% of a good future lineup, like 1 pt of title odds, 10% of a
    // 10-team fair share. A calibration bet, not a measurement.
    finderFvWeight: 0.05,
    finderFvYears: 4,
    // Dynasty ranking: title-odds points charged per unit of KTC I overpay (value
    // sent minus value received, nothing when I do not). 0.1 charges a 25-point
    // overpay, Willis + Metcalf's, 2.5 pts, so a deal that bleeds market value has
    // to buy clearly more than that this season. A calibration bet, not a measurement.
    finderOverpayWeight: 0.1,
  };

  // Deterministic RNG so the same roster always returns the same odds. A title
  // percentage that jitters every render is unusable for comparing trades.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Box-Muller, cached. Gaussian is fine for a TEAM total (10 starters summed,
  // central limit does the work), it's only used at the team level.
  function makeNormal(rnd) {
    let spare = null;
    return function () {
      if (spare != null) { const s = spare; spare = null; return s; }
      let u = 0, v = 0, s = 0;
      do { u = rnd() * 2 - 1; v = rnd() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
      const f = Math.sqrt(-2 * Math.log(s) / s);
      spare = v * f; return u * f;
    };
  }

  // The season simulator's draws are counter-based: each one is a pure function of
  // (stream key, simulated season, slot), so a player's week comes out the same in
  // every run that shares the seed, whatever else a what-if changed. That is what
  // makes before and after a paired comparison (common random numbers). One shared
  // sequential stream shifted every later draw the moment a pool changed length:
  // measured 2026-09-25, one Phi Kap deal read -4.0 to +1.9 pts for the partner
  // across five seeds at 800 sims.
  function mix32(x) {
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }
  function simDraw(key, sim, slot) {
    return mix32(mix32(key ^ Math.imul(sim + 1, 0x9E3779B1)) + slot) / 4294967296;
  }
  // Box-Muller on two draws; 1 - u keeps the log finite.
  function simNormal(key, sim, slot) {
    return Math.sqrt(-2 * Math.log(1 - simDraw(key, sim, slot))) * Math.cos(2 * Math.PI * simDraw(key, sim, slot + 1));
  }
  function simKey(seed, str) {
    let x = (seed ^ 0x811c9dc5) >>> 0;
    for (let i = 0; i < str.length; i++) x = Math.imul(x ^ str.charCodeAt(i), 16777619);
    return mix32(x);
  }

  // Per-week probability a healthy player goes down, solved from the expected
  // games-missed target: with mean absence D, the long-run fraction of weeks
  // missed is hD/(1+hD), so h = (m/W) / (D * (1 - m/W)).
  function injuryHazard(pos, age) {
    const base = SIM.missedGames[pos] != null ? SIM.missedGames[pos] : 2.3;
    const shoulder = SIM.ageShoulder[pos] != null ? SIM.ageShoulder[pos] : 29;
    const over = Math.max(0, (age || 25) - shoulder);
    const missed = Math.min(SIM.weeks * 0.6, base * (1 + SIM.agePenaltyPerYear * over));
    const f = missed / SIM.weeks;
    return f / (SIM.injuryDurationWeeks * (1 - f));
  }

  // Turn a roster into the pool the simulator draws from. `yearsOut` ages every
  // player's production and their injury risk; `rookies` are converted picks.
  // `src` 'ros' (redraft) reads the weekly rest-of-season lines the lineup and the
  // verdict read: a per-game rate, and an absence taken from the lines themselves.
  // A season total spread over 17 weeks AND a designation hold-out counted A.J.
  // Brown's injury twice (167 already left out his missed games: 9.8 a week, then
  // 6 more weeks out, against 15.0 a game when he plays).
  // A dynasty IR-slot player (any roster's: a what-if can hand him over) keeps
  // the season rate and returns when his weekly lines resume; with no line left
  // this season he is out for the year.
  // K and DEF join the pool in a league that starts them. projections.js is
  // offense only, so on every basis they read their weekly lines' per-game rate,
  // with no age curve. Without them every K and DEF slot sat empty for every
  // team, and trading a kicker never moved anyone's title odds.
  function simPool(roster, lg, src, extraIds, yearsOut = 0, rookies = null) {
    const map = projMap('offense'), wk = rosPointsByPid(lg), lines = yearsOut ? null : wk, ros = src === 'ros' ? lines : null;
    const takes = new Set([...SLOT_TAKES.SUPER_FLEX, ...offenseStartingSlots(lg).flatMap(s => SLOT_TAKES[s.pos])]);
    const irSlot = lines && !ros ? new Set((lg.rosters || []).flatMap(r => (r.reserve || []).map(String))) : null;
    const ids = new Set([...startableIds(roster, { includeStashed: yearsOut > 0 || !!ros }), ...(extraIds || []).map(String)]);
    const pool = [];
    for (const pid of ids) {
      const p = map.get(pid), ir = irSlot && irSlot.has(pid);
      const kd = !p && wk.get(pid) && ['K', 'DEF'].includes(projPosGroup(wk.get(pid).pos)) ? wk.get(pid) : null;
      const line = kd || (lines && lines.get(pid)), perGame = !!(ros || kd);
      const sp = window.PLAYERS?.[pid] || {};
      const pos = perGame ? line && projPosGroup(line.pos) : p?.pos;
      if (!(perGame ? line : p) || !takes.has(pos) || (ir && !line)) continue;
      let mean;
      if (perGame) mean = line.pts / line.games;
      else {
        const season0 = projPoints(p, lg, src); if (season0 == null) continue;
        const season = season0 * productionRetention(p.pos, sp.age, yearsOut);
        if (season <= 0) continue;   // aged out of the league entirely
        mean = season / SIM.gamesPlayed;
      }
      const st = sp.injury_status;
      // ponytail: dynasty keeps the season projection and the designation table;
      // most of its totals are preseason and never priced the absence (7 of 9 IR
      // players, 2026-09-25), so it counts once there. Move dynasty onto the lines
      // too if a dynasty verdict ever reads title odds.
      // A live designation is this season's news; it says nothing about 2028.
      const startOut = yearsOut ? 0 : ir || (perGame && SIM.designationWeeksOut[st]) ? line.out : perGame ? 0 : (SIM.designationWeeksOut[st] || 0);
      // Every field the simulator will ever touch is declared here, including the
      // per-season scratch (mult/bye/outUntil/v), his draw stream (key) and his
      // week's noise (e). Adding them later would retag the object's shape on the
      // first hot iteration and cost more than the simulation itself.
      pool.push({
        pid, name: p?.name || sp.name || pid, pos, mean, nflTeam: p?.team || sp.team || '',
        sd: mean * (SIM.cv[pos] != null ? SIM.cv[pos] : 0.55),
        hazard: injuryHazard(pos, (sp.age || 25) + yearsOut),
        startOut,
        questionable: yearsOut ? false : st === 'Questionable',
        mult: 1, bye: 0, outUntil: 0, v: mean, key: 0, e: 0,
      });
    }
    for (const r of (rookies || [])) {
      if (r.pts <= 0) continue;
      const mean = r.pts / SIM.gamesPlayed;
      pool.push({
        pid: `pick:${r.name}`, name: r.name, pos: r.pos, mean,
        sd: mean * (SIM.cv[r.pos] != null ? SIM.cv[r.pos] : 0.55),
        hazard: injuryHazard(r.pos, 22 + Math.max(0, yearsOut - 1)),
        startOut: 0, questionable: false,
        mult: 1, bye: 0, outUntil: 0, v: mean, key: 0, e: 0,
      });
    }
    // The order every simulated week's lineup is set in.
    pool.sort((a, b) => b.mean - a.mean);
    return pool;
  }

  // Start-of-season draw: how each player's year actually breaks, and when his
  // bye falls. Re-rolled once per simulated season, never per week.
  // `played` weeks are already in the books, so a designation counts from now.
  // `sim` is the simulated season's index, the counter every draw is keyed on.
  // `v` is the OUTCOME's mean, never the lineup order: the pool stays sorted on
  // the projection (simPool). Sorting on `v` let every simulated manager start
  // whichever of his two QBs would finish better, so a backup at a one-starter
  // position priced as a free hedge (Phi Kap, Rice for Waddle + Purdy read WIN
  // FOR A on two better lineups; a TE2 who never starts moved my odds +1.0).
  function rollSeason(pool, sim, played = 0) {
    const [b0, b1] = SIM.byeWeeks;
    for (const a of pool) {
      a.mult = Math.exp(simNormal(a.key, sim, 0) * SIM.projectionSigma - SIM.projectionSigma * SIM.projectionSigma / 2);
      a.bye = b0 + Math.floor(simDraw(a.key, sim, 2) * (b1 - b0 + 1));
      a.outUntil = a.startOut && a.startOut + played;
      a.v = a.mean * a.mult;
    }
  }

  // One team's week: decide availability, set the lineup on the PROJECTION
  // (`mean`, what a manager can know), then sample what those starters actually
  // did. Bench outcomes are never drawn, so a body who does not start is worth
  // only the weeks he fills in for someone out.
  // `teamKey` keys the fantasy team's own week shock.
  function simWeek(pool, slots, week, sim, teamKey, firstWeek = 1) {
    const avail = [], at = 8 * week + 8;   // this week's draw slots
    for (const a of pool) {
      if (week === a.bye) continue;
      if (week <= a.outUntil) continue;
      if (simDraw(a.key, sim, at) < a.hazard) {
        // Geometric-ish absence: mean SIM.injuryDurationWeeks, minimum 1.
        a.outUntil = week + Math.max(1, Math.round(-Math.log(1 - simDraw(a.key, sim, at + 1)) * SIM.injuryDurationWeeks));
        continue;
      }
      if (a.questionable && week === firstWeek && simDraw(a.key, sim, at + 2) < SIM.questionableOutChance) continue;
      // `avail` inherits the pool's descending projection order, hence presorted.
      avail.push(a);
    }
    const lineup = slots.length ? fillLineup(avail, slots, true) : avail.slice(0, 9);

    // Stack links. Each QB in this lineup shares his passing game with his team's
    // best same-team receiver, at the measured correlation. Deliberately one
    // receiver per QB: loading a second would invent a WR-WR correlation that
    // measures at +0.004 in the real data. The QB's own week is the shared factor:
    // the receiver takes `c` of his noise from it and sqrt(1 - c^2) from his own, so
    // the pair correlates at exactly `c` and neither variance moves.
    let linked = null;
    for (const s of lineup) {
      s.e = simNormal(s.key, sim, at + 3);
      if (s.pos !== 'QB' || !s.nflTeam) continue;
      let best = null;
      for (const r of lineup) {
        if (r === s || r.nflTeam !== s.nflTeam) continue;
        if (SIM.stackCorr[r.pos] == null) continue;
        if (!best || r.mean > best.mean) best = r;
      }
      if (best) (linked = linked || new Map()).set(best, s);
    }

    let total = 0;
    for (const s of lineup) {
      const qb = linked && linked.get(s);
      const c = qb ? SIM.stackCorr[s.pos] : 0;
      const noise = qb ? c * qb.e + Math.sqrt(1 - c * c) * s.e : s.e;
      total += Math.max(0, s.v + noise * s.sd * s.mult);
    }
    // Correlated fantasy-team week shock: game scripts, weather, blowouts.
    return Math.max(0, total * (1 + simNormal(teamKey, sim, at + 5) * SIM.teamShockCv));
  }

  // Fallback schedule: each week pair the teams up at random. championshipOdds
  // uses the real Sleeper schedule (FANTASY_SCHEDULE) whenever a week has one,
  // which matters once weeks are played: who you still face is not random.
  function randomPairing(n, rnd) {
    const idx = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const pairs = [];
    for (let i = 0; i + 1 < n; i += 2) pairs.push([idx[i], idx[i + 1]]);
    return pairs;
  }

  // Sleeper's playoff_week_start: on the league record once build_site_data.py
  // writes it, and on the fantasy schedule (build_fantasy_schedule.py) until then.
  // `lastWeek` is the title game: one week per round (playoff_round_type 0, every
  // league here).
  function playoffSettings(lg) {
    const s = lg.settings || {};
    const teams = lg.playoff_teams || s.playoff_teams || 6;
    const startWeek = lg.playoff_week_start || s.playoff_week_start
      || window.FANTASY_SCHEDULE?.leagues?.[String(lg.id)]?.playoffStart || 15;
    const rounds = Math.ceil(Math.log2(teams));
    return { teams, startWeek, regularWeeks: startWeek - 1, rounds, lastWeek: startWeek + rounds - 1 };
  }

  // ---- Multi-year title equity -------------------------------------------
  // championshipOdds answers "who wins THIS season". A dynasty trade has to be
  // judged over a window, so these age the whole league forward and re-run it.
  //
  // PRODUCTION aging, deliberately NOT ageRetention (which is dynasty VALUE and
  // falls faster, because value prices a whole remaining career while points
  // price one season). Fitting a curve to this repo's own projections was tried
  // and thrown out: cross-sectionally a 32-year-old startable WR looks as good
  // as a 25-year-old, because the 32-year-olds who lost a step already fell out
  // of the startable pool. That is survivorship, not durability. These are
  // longitudinal shapes, what happens to ONE player as he ages.
  const PROD_CURVE = {
    QB: { growTo: 27, holdTo: 33, decline: 0.06 },
    RB: { growTo: 24, holdTo: 26, decline: 0.13 },
    WR: { growTo: 25, holdTo: 28, decline: 0.08 },
    TE: { growTo: 26, holdTo: 29, decline: 0.07 },
  };
  const PROD_GROWTH = 0.07;   // per year for a player still climbing to his peak
  function productionRetention(pos, age, yearsOut) {
    if (!yearsOut) return 1;
    const c = PROD_CURVE[pos] || PROD_CURVE.WR;
    let f = 1, a = age || 25;
    for (let i = 0; i < yearsOut; i++) {
      a += 1;
      if (a <= c.growTo) f *= (1 + PROD_GROWTH);
      else if (a <= c.holdTo) f *= 1;
      else {
        // Decline compounds, and accelerates the further past the shoulder you
        // get, the cliff is not linear.
        const past = a - c.holdTo;
        f *= Math.max(0, 1 - c.decline * (1 + 0.15 * (past - 1)));
      }
    }
    return Math.max(0, f);
  }

  // A draft pick that has converted becomes a rookie. Expected rookie output is
  // read off the pick's own KTC value through the same value->points relation the
  // rookie-startability calibration used: a rookie delivers ~0.75x what his
  // dynasty value implies, and picks are position-unknown so this uses the
  // pooled skill-position slope.
  const PICK_POINTS = { intercept: -14, slope: 3.7, rookieFactor: 0.75 };
  function pickRookiePoints(pickValue) {
    return Math.max(0, (PICK_POINTS.intercept + PICK_POINTS.slope * (pickValue || 0)) * PICK_POINTS.rookieFactor);
  }

  // A pick's value depends on where the owner finishes. Losing earns earlier
  // picks, which is the engine that makes a rebuild work at all, without this
  // feedback loop a teardown looks like pure loss and the model will always tell
  // you to buy. `strengthRank` is 1 for the strongest roster.
  // Slope is calibrated off the KTC rookie-pick curve in this repo: 1.01 is worth
  // roughly 1.9x the 1.12 in a 12-team scale, so about 6% per slot.
  const PICK_SLOT_SLOPE = 0.06;
  function pickValueBySlot(baseValue, strengthRank, teams) {
    if (!teams || teams < 2) return baseValue;
    // strengthRank 1 = strongest roster, which picks LAST and gets the least
    // valuable rookie. The worst roster picks 1.01.
    const badness = (strengthRank - 1) / (teams - 1); // 0 = best team, 1 = worst team
    return Math.max(0, baseValue * (1 + PICK_SLOT_SLOPE * (teams - 1) * (badness - 0.5)));
  }

  // Build the league as it will look `yearsOut` seasons from now: everyone ages,
  // everyone's converted picks become rookies. Applied to ALL rosters so the
  // comparison stays fair, the cost of spending your picks only shows up if
  // your rivals get to spend theirs too.
  function projectLeagueForward(lg, yearsOut, whatIf, strengthRanks) {
    if (!yearsOut) return { lg, extraPoints: new Map() };
    const projSeason = CURRENT_SEASON + yearsOut;
    const teams = (lg.rosters || []).length;
    const extraPoints = new Map();   // rosterId -> [{name, pos, pts}] from converted picks
    for (const r of (lg.rosters || [])) {
      const rookies = [];
      const wi = (whatIf && whatIf[r.roster_id]) || {};
      const spent = new Set(wi.spendPicks || []);
      const convert = (p, ownerRosterId) => {
        const ps = parseInt(p.season, 10);
        if (ps > projSeason) return;
        const held = Math.max(0, projSeason - ps);
        // Slot the pick by how strong its ORIGINAL team is projected to be, which
        // for your own picks means a worse team earns a better rookie.
        const rank = strengthRanks && strengthRanks.get(p.originRosterId != null ? p.originRosterId : ownerRosterId);
        const val = rank ? pickValueBySlot(p.value, rank, teams) : p.value;
        // A converted rookie then ages like a 22-year-old WR.
        rookies.push({ name: p.label, pos: 'WR', pts: pickRookiePoints(val) * productionRetention('WR', 22, held) });
      };
      for (const p of rosterOwnedPicks(r.roster_id, lg, Math.max(2, yearsOut + 1))) {
        if (!spent.has(p.label)) convert(p, r.roster_id);
      }
      // Picks acquired in the hypothetical trade. Whoever received them gets to
      // convert them, which is exactly the cost of selling your own.
      for (const p of (wi.gainPicks || [])) convert(p, r.roster_id);
      extraPoints.set(r.roster_id, rookies);
    }
    return { lg, extraPoints };
  }

  // Multi-season strategy comparison. Runs each season in sequence, feeding the
  // PREVIOUS season's finish into the next season's pick slotting, so a teardown
  // is credited with the early picks it earns.
  // Returns per-year title odds plus discounted equity. `discount` is per year:
  // a fantasy league is not forever (managers quit, leagues fold, you lose
  // interest), so a title five years out is worth less than one today.
  // Every roster's title odds for each of the next `years` seasons. Same
  // forward model as titleEquity (age the league, slot next year's picks by
  // this year's simulated finish), but it keeps all teams, because a trade has
  // two sides and titleEquity only tracks mine.
  function titleOddsByYear(lg, { years = 3, sims = 2500, whatIf = null, seed = 20260807 } = {}) {
    // Redraft rosters do not carry over, so there is no second season to price.
    if (!isDynastyLeague(lg)) years = 1;
    const out = [];
    let ranks = null;
    for (let y = 0; y < years; y++) {
      const champions = [];
      const res = championshipOdds(lg, { sims, whatIf, seed: seed + y * 101, yearsOut: y, strengthRanks: ranks, champions });
      ranks = new Map(res.slice().sort((a, b) => b.expPts - a.expPts).map((o, i) => [o.rosterId, i + 1]));
      out.push({ season: CURRENT_SEASON + y, byRoster: new Map(res.map(o => [o.rosterId, o.title || 0])), champions });
    }
    return out;
  }

  // Paired change in one roster's title odds between two runs on one seed: season
  // k of both saw the same draws, so the standard error is the spread of the
  // per-season difference in who won. Percentage points. The Trade Lab and the
  // Trade Finder both print it as ±SIM.titleBandZ standard errors.
  function pairedTitleDelta(baseChamps, afterChamps, rid) {
    const n = baseChamps.length;
    let sum = 0, sq = 0;
    for (let k = 0; k < n; k++) { const d = (afterChamps[k] === rid) - (baseChamps[k] === rid); sum += d; sq += d * d; }
    const m = n ? sum / n : 0;
    return { delta: m * 100, se: n ? Math.sqrt(Math.max(0, sq / n - m * m) / n) * 100 : 0 };
  }

  function titleEquity(lg, { years = 7, sims = 2500, src = null, whatIf = null, discount = 0.88, seed = 20260807 } = {}) {
    const byYear = [];
    let ranks = null;
    let equity = 0, raw = 0;
    for (let y = 0; y < years; y++) {
      const res = championshipOdds(lg, { sims, src, whatIf, seed: seed + y * 101, yearsOut: y, strengthRanks: ranks });
      // Next year's picks are slotted by this year's finish.
      ranks = new Map(res.slice().sort((a, b) => b.expPts - a.expPts).map((o, i) => [o.rosterId, i + 1]));
      const mine = res.find(o => o.isMe) || res[0];
      const w = Math.pow(discount, y);
      equity += mine.title * w;
      raw += mine.title;
      byYear.push({
        season: CURRENT_SEASON + y, title: mine.title, playoff: mine.playoff,
        rank: res.findIndex(o => o.isMe) + 1, weight: w,
      });
    }
    return { byYear, equity, raw, years, discount };
  }

  // Simulate the league `sims` times and return each roster's playoff/bye/final/
  // title rate. `whatIf` maps rosterId -> {add:[ids], drop:[ids]} so a trade can
  // be priced in titles instead of in points. `champions`, when passed an array,
  // gets each simulated season's champion roster id, so two runs on one seed can
  // be differenced season by season (a paired standard error).
  // `src` defaults to the league's own current-season basis: the weekly
  // rest-of-season lines in redraft (what its lineup and verdict read), the
  // league-scored season blend in dynasty. The Trade Lab, the Trade Finder and
  // trade-sim.js all take the default, so they price one trade the same way.
  function championshipOdds(lg, { sims = 4000, src = null, whatIf = null, seed = 20260807, yearsOut = 0, strengthRanks = null, champions = null } = {}) {
    const rosters = lg.rosters || [];
    const n = rosters.length;
    if (!n) return [];
    src = src || (isDynastyLeague(lg) ? 'blend' : 'ros');
    const slots = offenseStartingSlots(lg);
    const cfg = playoffSettings(lg);
    const { extraPoints } = projectLeagueForward(lg, yearsOut, whatIf, strengthRanks);
    // An IR-slot player is on both books, his owner's and a receiver's, from the
    // week his lines resume (simPool), so a playoff rental reads as one. Leaving
    // him off both counted A.J. Brown (back week 8) out for all of 2026. Taxi
    // bodies do not play this season.
    const stashed = yearsOut > 0 || src === 'ros';
    const pools = rosters.map(r => {
      const wi = whatIf && whatIf[r.roster_id];
      const drop = new Set((wi?.drop || []).map(String));
      const keep = startableIds({ ...r, reserve: [] }, { includeStashed: stashed }).filter(p => !drop.has(String(p)));
      const base = { ...r, players: keep, taxi: [], reserve: [] };
      return simPool(base, lg, src, wi?.add, yearsOut, extraPoints.get(r.roster_id));
    });
    const stat = rosters.map(() => ({ playoff: 0, bye: 0, final: 0, title: 0, wins: 0, pts: 0 }));
    const rnd = mulberry32(seed);   // the fallback random schedule only
    // A converted pick is named by its label, which two rosters can share.
    pools.forEach((pool, i) => { for (const a of pool) a.key = simKey(seed, a.pid.startsWith('pick:') ? `${rosters[i].roster_id}:${a.pid}` : a.pid); });
    const teamKeys = rosters.map(r => simKey(seed, `team:${r.roster_id}`));

    // The season in progress starts from the real standings. Replaying all 14
    // weeks from 0-0 gave Phi Kap's 2-0 team the league's lowest title odds.
    // Seeded only when the records add up to the weeks played (one result per
    // team-week, two in a median league), so a stale dump or a league with no
    // schedule on file falls back to the full replay instead of double counting.
    const sched = window.FANTASY_SCHEDULE?.leagues?.[String(lg.id)];
    const median = !!sched?.medianScoring;
    const weeksIn = yearsOut || lg.status !== 'in_season' ? 0 : Math.min(cfg.regularWeeks, Math.max(0, (lg.week || 1) - 1));
    const games = rosters.reduce((s, r) => s + (r.wins || 0) + (r.losses || 0) + (r.ties || 0), 0);
    const played = weeksIn && games === n * weeksIn * (median ? 2 : 1) ? weeksIn : 0;
    const first = played + 1;
    const idxOf = new Map(rosters.map((r, i) => [r.roster_id, i]));
    const pairsByWeek = [];
    for (let w = first; w <= cfg.regularWeeks && !yearsOut; w++) {
      const wk = sched?.weeks?.[w];
      if (!wk) continue;
      const pairs = [];
      for (const [a, b] of Object.entries(wk)) {
        const i = idxOf.get(Number(a)), j = idxOf.get(Number(b));
        if (i != null && j != null && i < j) pairs.push([i, j]);
      }
      if (pairs.length * 2 === n) pairsByWeek[w] = pairs;
    }

    for (let s = 0; s < sims; s++) {
      const wins = rosters.map(r => played ? (r.wins || 0) + (r.ties || 0) / 2 : 0);
      const pts = rosters.map(r => played ? (r.fpts || 0) : 0);
      for (const pool of pools) rollSeason(pool, s, played);
      for (let w = first; w <= cfg.regularWeeks; w++) {
        const scores = pools.map((p, i) => simWeek(p, slots, w, s, teamKeys[i], first));
        for (let i = 0; i < n; i++) pts[i] += scores[i];
        for (const [a, b] of (pairsByWeek[w] || randomPairing(n, rnd))) {
          if (scores[a] > scores[b]) wins[a]++; else if (scores[b] > scores[a]) wins[b]++;
          else { wins[a] += 0.5; wins[b] += 0.5; }
        }
        // Median leagues also play the field: top half of the week scores a win.
        if (median) {
          const sorted = scores.slice().sort((x, y) => x - y);
          const mid = (sorted[(n - 1) >> 1] + sorted[n >> 1]) / 2;
          for (let i = 0; i < n; i++) wins[i] += scores[i] > mid ? 1 : scores[i] === mid ? 0.5 : 0;
        }
      }
      // Seed by record, points-for as the tiebreak (Sleeper's default).
      const seeded = Array.from({ length: n }, (_, i) => i)
        .sort((a, b) => (wins[b] - wins[a]) || (pts[b] - pts[a]));
      const field = seeded.slice(0, cfg.teams);
      for (let i = 0; i < n; i++) { stat[i].wins += wins[i]; stat[i].pts += pts[i]; }
      for (const i of field) stat[i].playoff++;

      // Bracket: byes to the seeds above the nearest power of two, then re-seeded
      // single elimination, one week per round.
      const bracketSize = 1 << Math.ceil(Math.log2(cfg.teams));
      const byes = bracketSize - cfg.teams;
      for (let i = 0; i < byes; i++) stat[field[i]].bye++;
      let alive = field.slice();
      let week = cfg.startWeek;
      if (byes > 0) {
        const playIn = alive.slice(byes);
        const winners = [];
        for (let i = 0; i < playIn.length / 2; i++) {
          const a = playIn[i], b = playIn[playIn.length - 1 - i];
          winners.push(simWeek(pools[a], slots, week, s, teamKeys[a]) >= simWeek(pools[b], slots, week, s, teamKeys[b]) ? a : b);
        }
        alive = alive.slice(0, byes).concat(winners);
        week++;
      }
      while (alive.length > 1) {
        alive.sort((a, b) => field.indexOf(a) - field.indexOf(b)); // re-seed
        const next = [];
        for (let i = 0; i < alive.length / 2; i++) {
          const a = alive[i], b = alive[alive.length - 1 - i];
          next.push(simWeek(pools[a], slots, week, s, teamKeys[a]) >= simWeek(pools[b], slots, week, s, teamKeys[b]) ? a : b);
        }
        if (alive.length === 2) for (const t of alive) stat[t].final++;
        alive = next; week++;
      }
      stat[alive[0]].title++;
      if (champions) champions.push(rosters[alive[0]].roster_id);
    }

    return rosters.map((r, i) => ({
      roster: r, rosterId: r.roster_id, teamName: r.team_name, isMe: !!r.is_me,
      playoff: stat[i].playoff / sims, bye: stat[i].bye / sims,
      final: stat[i].final / sims, title: stat[i].title / sims,
      expWins: stat[i].wins / sims, expPts: stat[i].pts / sims,
    })).sort((a, b) => b.title - a.title);
  }
  function projPosGroup(pos) {
    if (['QB', 'RB', 'WR', 'TE', 'K'].includes(pos)) return pos;
    if (['DEF', 'DST'].includes(pos)) return 'DEF';
    if (pos === 'LB') return 'LB';
    if (['CB', 'S', 'DB'].includes(pos)) return 'DB';
    return 'DL'; // IDL/EDGE/DE/DT/NT/DL
  }
  // A projection scored under THIS league's rules, falling back to the file's
  // precomputed total when the source has no stat line for that player. Skipping
  // (returning null) rather than zeroing keeps rosters comparable across sources:
  // a team whose players PrizePicks doesn't list shouldn't read as terrible.
  function projPoints(p, lg, src) {
    const scored = leagueScorePoints(p.stats && p.stats[src], lg);
    return scored != null ? scored : (p[src] != null ? p[src] : null);
  }

  function optimalOffense(roster, lg, src) {
    const map = projMap('offense');
    const assets = [];
    // De-dupe: callers splice what-if ids into the id list, and one man can't
    // fill two slots. Without this a duplicate id would start twice.
    for (const pid of new Set(startableIds(roster))) {
      const p = map.get(pid); if (!p) continue;
      if (isSidelined(pid)) continue;
      const pts = projPoints(p, lg, src); if (pts == null) continue;
      if (SLOT_TAKES.SUPER_FLEX.includes(p.pos)) assets.push({ name: p.name, pos: p.pos, pts, v: pts });
    }
    const slots = offenseStartingSlots(lg);
    const picks = slots.length ? fillLineup(assets, slots)
      : assets.slice().sort((a, b) => b.v - a.v).slice(0, offenseStarterCount(lg));
    return { total: Math.round(picks.reduce((s, c) => s + c.pts, 0) * 10) / 10, picks };
  }
  function optimalDefense(roster, lg, src) {
    const map = projMap('defense'), cand = [];
    for (const pid of startableIds(roster)) {
      if (isSidelined(pid)) continue;
      const p = map.get(pid); if (!p) continue;
      // projPoints, not p[src]: the baked totals use one fixed IDP rule set, and
      // this league's own weights are what decide the lineup.
      const pts = projPoints(p, lg, src);
      if (pts != null) cand.push({ name: p.name, pos: p.pos, pts });
    }
    cand.sort((a, b) => b.pts - a.pts);
    const picks = cand.slice(0, idpSlotCount(lg));
    return { total: Math.round(picks.reduce((s, c) => s + c.pts, 0) * 10) / 10, picks };
  }
  // Best starting-lineup projected points for an arbitrary player-id list. The
  // list is already startable by construction (callers splice it themselves), so
  // it carries no taxi/reserve of its own.
  function lineupPoints(lg, players, src = 'blend') {
    const fake = { players };
    const off = optimalOffense(fake, lg, src).total;
    const idp = idpSlotCount(lg) ? optimalDefense(fake, lg, src).total : 0;
    return Math.round((off + idp) * 10) / 10;
  }
  // Trade impact on a roster's STARTING lineup: points now vs after the swap. It
  // re-optimizes the lineup post-trade, so a sent starter is automatically
  // backfilled by that roster's next-best at the position, the Δ is the true
  // "what am I replacing this asset with" number, not raw dynasty value.
  function tradeLineupImpact(lg, rosterId, sendSet, recvSet) {
    const roster = (lg.rosters || []).find(r => r.roster_id === rosterId);
    if (!roster) return null;
    const sent = new Set([...sendSet].filter(k => !isPickKey(k)).map(String));
    const recv = [...recvSet].filter(k => !isPickKey(k)).map(String);
    // Redraft scores the lineup on the value's own basis: rest-of-season points,
    // K and DEF included, IR kept (his line already prices the missed weeks), the
    // waiver wire in the pool. `emptied` counts starting slots the trade leaves
    // with nobody to fill them, not even a free agent.
    if (!isDynastyLeague(lg)) {
      const ids = startableIds(roster, { includeStashed: true });
      const now = redraftLineup(ids, lg), after = redraftLineup(ids.filter(p => !sent.has(p)).concat(recv), lg);
      return { now: now.points, after: after.points, delta: Math.round((after.points - now.points) * 10) / 10,
        emptied: after.empty - now.empty };
    }
    // Startable only: a taxi stash can't fill the hole a traded starter leaves,
    // the waiver wire can (before and after alike).
    const base = startableIds(roster), free = waiverIds(lg);
    const now = lineupPoints(lg, base.concat(free));
    const post = base.filter(p => !sent.has(p)).concat(recv, free);
    const after = lineupPoints(lg, post);
    return { now, after, delta: Math.round((after - now) * 10) / 10 };
  }

  // What-if tray: search any projected player, drop him onto MY roster, watch the
  // whole board re-rank. Answers "where would I land if I got these guys" without
  // building a trade, the Trade Lab is for negotiating one, this is for scouting.
  // It adds only; what you'd give up is the Trade Lab's job.
  function buildWhatIfTray(lg, src) {
    const map = projMap('offense');
    const me = (lg.rosters || []).find(r => r.is_me);
    const mine = new Set(startableIds(me || {}));
    const chips = h('div', { class: 'whatif-chips' });
    const rerender = () => viewProjections(lg.id);

    for (const id of PROJ_STATE.whatIf) {
      const p = map.get(id); if (!p) continue;
      chips.appendChild(h('button', {
        class: 'whatif-chip', title: `Remove ${p.name} from the what-if`,
        onclick: () => { PROJ_STATE.whatIf = PROJ_STATE.whatIf.filter(x => x !== id); rerender(); },
      }, `${p.name} `, h('span', { class: 'muted' }, `${p.pos} ${Math.round(projPoints(p, lg, src) || 0)}`), h('span', { class: 'whatif-x' }, '×')));
    }
    if (PROJ_STATE.whatIf.length) {
      chips.appendChild(h('button', { class: 'ghost whatif-clear', onclick: () => { PROJ_STATE.whatIf = []; rerender(); } }, 'Clear'));
    }

    const input = h('input', {
      type: 'search', class: 'trade-search-input', autocomplete: 'off',
      placeholder: 'Add a player to your roster, hypothetically…',
      'aria-label': 'Search a player to add to the what-if lineup',
    });
    const results = h('div', { class: 'trade-search-results', role: 'listbox', hidden: '' });
    const clear = () => { input.value = ''; results.innerHTML = ''; results.hidden = true; };
    input.addEventListener('input', () => {
      const q = norm(input.value.trim());
      results.innerHTML = '';
      if (!q) { results.hidden = true; return; }
      const hits = (projUnitData().players || [])
        .filter(p => p.id && norm(p.name).includes(q) && !PROJ_STATE.whatIf.includes(p.id))
        .sort((a, b) => (projPoints(b, lg, src) || 0) - (projPoints(a, lg, src) || 0)).slice(0, 8);
      results.hidden = false;
      if (!hits.length) { results.appendChild(h('div', { class: 'trade-search-empty' }, 'No projected players match.')); return; }
      for (const p of hits) {
        const owner = (lg.rosters || []).find(r => (r.players || []).map(String).includes(String(p.id)));
        const already = mine.has(String(p.id));
        results.appendChild(h('div', { class: 'trade-search-row' },
          h('div', { class: 'name-cell' },
            posChip(p.pos), p.team ? teamChip(p.team) : null,
            h('span', { class: 'name' }, p.name),
            injuryChip(p.id),
            h('span', { class: 'trade-search-owner tip' }, already ? 'already yours' : (owner ? (owner.team_name || owner.owner_name) : 'free agent')),
            h('span', { class: 'trade-search-val tnum' }, fmt.decimal(projPoints(p, lg, src) || 0, 1)),
          ),
          h('div', { class: 'trade-search-actions' },
            h('button', {
              class: 'trade-search-add', disabled: already ? '' : null,
              title: already ? 'Already on your roster' : `Add ${p.name} to the what-if`,
              onclick: () => { if (already) return; PROJ_STATE.whatIf = [...PROJ_STATE.whatIf, p.id]; clear(); rerender(); },
            }, already ? 'On roster' : '+ Add'),
          ),
        ));
      }
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') clear(); });

    return h('div', { class: 'whatif card' },
      h('div', { class: 'card-title' }, 'What-if',
        h('span', { class: 'tip', style: { marginLeft: '8px', fontWeight: '400' } },
          'Adds only. Re-ranks the board below as if these players were on your roster.')),
      h('div', { class: 'trade-search-box' }, input, results),
      PROJ_STATE.whatIf.length ? chips : null,
    );
  }

  // Injury designation as a chip, so a sidelined player never looks startable.
  function injuryChip(pid) {
    const st = window.PLAYERS?.[pid]?.injury_status;
    if (!st) return null;
    const part = window.PLAYERS[pid].injury_body_part;
    return h('span', {
      class: 'badge injury' + (OUT_INJURY.has(st) ? ' injury-out' : ''),
      title: part ? `${st}, ${part}` : st,
    }, st === 'Questionable' ? 'Q' : st);
  }

  function viewProjections(leagueId) {
    const main = $('#main'); main.innerHTML = '';
    const leagues = window.LEAGUES || [];
    const lg = leagues.find(l => l.id === leagueId)
            || leagues.find(l => l.id === PROJ_STATE.leagueId)
            || leagues.find(l => l.rosters.some(r => r.is_me)) || leagues[0];
    if (!lg) { main.appendChild(h('div', { class: 'empty' }, 'No league.')); return; }
    PROJ_STATE.leagueId = lg.id;
    if (!window.OFFENSE_PROJ) { main.appendChild(h('div', { class: 'empty' }, 'projections.js not loaded, run score_offense.py + score_defense.py.')); return; }

    const data = projUnitData();
    if (!data.sources.includes(PROJ_STATE.source)) PROJ_STATE.source = data.default || data.sources[0];
    const src = PROJ_STATE.source;
    const statKeys = data.stat_keys || [];

    main.appendChild(breadcrumbs([{ label: 'Tools' }, { label: 'Projections' }]));
    main.appendChild(h('div', { class: 'page-header' },
      h('div', null,
        h('div', { class: 'page-eyebrow' }, 'PROJECTIONS'),
        h('h1', { class: 'page-title' }, 'Player Projections'),
        h('p', { class: 'page-sub' }, 'Season fantasy points + projected stat lines. Offense: PrizePicks / Sleeper / Blended. Defense: Clay / Sleeper / Blended (Vegas has no tackle market).')
      ),
      h('div', { class: 'page-actions' }, leagueSelector(lg.id, (id) => { PROJ_STATE.leagueId = id; navigate(`#projections/${id}`); }))
    ));

    // unit + source segmented controls
    const segRow = (label, items, active, onPick, mk) => {
      const seg = h('div', { class:'seg-control-row', role:'group', 'aria-label':label },
        h('span', { class:'seg-control-label' }, label));
      for (const it of items) {
        const on = it === active;
        seg.appendChild(h('button', {
          class: 'ghost' + (on ? ' active' : ''), 'aria-pressed': String(on),
          // No inline colors: button.active is the gold selection everywhere else
          // in the app, and this override put near-black text on the accent,
          // which measured 2.5:1 once the accent darkened for AA.
          style: on ? { fontWeight: 700 } : {},
          onclick: () => onPick(it),
        }, mk ? mk(it) : it));
      }
      return seg;
    };
    main.appendChild(segRow('Unit', ['offense', 'defense'], PROJ_STATE.unit,
      (u) => { PROJ_STATE.unit = u; PROJ_STATE.source = null; PROJ_STATE.pos = 'ALL'; PROJ_STATE.sort = null; viewProjections(lg.id); },
      (u) => u === 'offense' ? 'Offense' : 'Defense (IDP)'));
    main.appendChild(segRow('Source', data.sources, src,
      (s) => { PROJ_STATE.source = s; viewProjections(lg.id); },
      (s) => PROJ_SRC_LABEL[s] || s));

    // ---- per-team best starting lineup under selected unit + source ----
    const isDef = PROJ_STATE.unit === 'defense';
    const idpN = idpSlotCount(lg);
    if (isDef && idpN === 0) {
      main.appendChild(h('div', { class: 'card', style: { marginBottom: '18px' } },
        h('div', { class: 'card-title' }, 'Team defense'),
        h('div', { class: 'tip' }, `${lg.name} has no IDP starting slots, defense projections are informational only here.`)));
    } else {
      // Baseline board (no hypotheticals) so every row can show its own delta
      // and its own rank change, not just mine.
      const score = (r, extra) => {
        const rr = extra && extra.length ? { ...r, players: [...startableIds(r), ...extra] } : r;
        return isDef ? optimalDefense(rr, lg, src) : optimalOffense(rr, lg, src);
      };
      const rankOf = (rows) => new Map(rows.map((t, i) => [t.r.roster_id, i + 1]));
      const base = lg.rosters.map(r => ({ r, ...score(r) })).sort((a, b) => b.total - a.total);
      const baseRank = rankOf(base), baseTotal = new Map(base.map(t => [t.r.roster_id, t.total]));

      const wi = PROJ_STATE.whatIf.filter(id => !isDef);
      const teams = wi.length
        ? lg.rosters.map(r => ({ r, ...score(r, r.is_me ? wi : null) })).sort((a, b) => b.total - a.total)
        : base;
      const nowRank = rankOf(teams);

      // Title odds, if the user has asked for them. Points rank rosters; only the
      // simulation says who wins, and the gap between those two is the whole
      // point of showing them side by side.
      const oddsOn = !isDef && PROJ_STATE.odds != null;
      const oddsNow = oddsOn ? new Map(oddsFor(lg, src, wi, PROJ_STATE.odds).map(o => [o.rosterId, o])) : null;
      const oddsBase = oddsOn && wi.length ? new Map(oddsFor(lg, src, [], PROJ_STATE.odds).map(o => [o.rosterId, o])) : null;

      main.appendChild(buildWhatIfTray(lg, src));
      main.appendChild(h('div', { class: 'card', style: { marginBottom: '18px' } },
        h('div', { class: 'card-title' }, `Team ${isDef ? `IDP starters (top ${idpN})` : 'offense, best lineup'} · ${PROJ_SRC_LABEL[src]}`,
          wi.length ? h('span', { class: 'badge whatif-on', style: { marginLeft: '8px' } }, `WHAT-IF +${wi.length}`) : null,
          isDef ? null : h('button', {
            class: 'ghost odds-btn',
            title: oddsOn ? 'Re-run the season simulation' : 'Simulate the season and playoffs to get championship probability',
            onclick: () => { PROJ_STATE.odds = PROJ_STATE.odds ? null : 4000; viewProjections(lg.id); },
          }, oddsOn ? 'Hide title odds' : 'Run title odds ⚄')),
        h('table', { class: 'data fill-last' },
          h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Team'),
            h('th', { style: { textAlign: 'right' } }, 'Proj Pts'),
            wi.length ? h('th', { style: { textAlign: 'right' } }, 'Δ') : null,
            oddsOn ? h('th', { class: 'right', title: 'Championship probability from a simulated season + playoff bracket' }, 'Title%') : null,
            oddsOn ? h('th', { class: 'right', title: 'Odds of making the 6-team playoff field' }, 'Playoff%') : null,
            oddsOn && wi.length ? h('th', { class: 'right' }, 'ΔTitle') : null,
            h('th', null, 'Core'))),
          h('tbody', null, ...teams.map((t, i) => {
            const d = Math.round((t.total - (baseTotal.get(t.r.roster_id) ?? t.total)) * 10) / 10;
            const moved = (baseRank.get(t.r.roster_id) || 0) - (nowRank.get(t.r.roster_id) || 0);
            const o = oddsNow?.get(t.r.roster_id);
            const ob = oddsBase?.get(t.r.roster_id);
            const dt = (o && ob) ? (o.title - ob.title) * 100 : null;
            return h('tr', { style: { background: t.r.is_me ? 'rgba(96,165,250,.10)' : 'transparent' } },
              h('td', { class: 'muted' }, String(i + 1),
                moved ? h('span', { class: moved > 0 ? 'rank-up' : 'rank-down' }, `${moved > 0 ? '▲' : '▼'}${Math.abs(moved)}`) : null),
              h('td', null, h('div', { class: 'name-cell' }, h('span', { class: 'name' }, t.r.team_name), t.r.is_me ? h('span', { class: 'badge you', style: { marginLeft: '6px' } }, 'YOU') : null)),
              h('td', { class: 'tnum', style: { textAlign: 'right', fontWeight: 700 } }, fmt.decimal(t.total, 1)),
              wi.length ? h('td', { class: 'tnum' + (d > 0 ? ' delta-up' : d < 0 ? ' delta-down' : ''), style: { textAlign: 'right' } },
                d ? `${d > 0 ? '+' : ''}${fmt.decimal(d, 1)}` : '·') : null,
              oddsOn ? h('td', { class: 'right tnum', style: { fontWeight: 700 } }, o ? `${(o.title * 100).toFixed(1)}%` : '·') : null,
              oddsOn ? h('td', { class: 'right tnum', style: { color: 'var(--fg-2)' } }, o ? `${(o.playoff * 100).toFixed(0)}%` : '·') : null,
              oddsOn && wi.length ? h('td', { class: 'right tnum' + (dt > 0.05 ? ' delta-up' : dt < -0.05 ? ' delta-down' : '') },
                dt == null ? '·' : `${dt > 0 ? '+' : ''}${dt.toFixed(1)}`) : null,
              h('td', { class: 'muted', style: { fontSize: '11px' } }, t.picks.slice(0, 3).map(c => `${c.name} ${Math.round(c.pts)}`).join(', ')),
            );
          }))
        ),
        h('div', { class: 'tip', style: { marginTop: '8px' } },
          `Best legal lineup for each roster (${(lg.roster_positions || []).filter(s => SLOT_TAKES[s]).join(' / ') || 'league slots'}), scored under this league's own settings. `,
          `Taxi, IR, and players listed Out or Doubtful are benched.`,
          oddsOn ? ` Title odds: ${PROJ_STATE.odds.toLocaleString()} simulated seasons with per-player projection error, weekly variance, byes, and an injury process. Points rank rosters; ${playoffSettings(lg).teams} of ${lg.total_rosters} make the playoffs and three single-week rounds decide the rest.` : '')));
    }

    // ---- position filter ----
    const posChips = h('div', { style: { display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' } });
    for (const pos of POS_CHIPS[PROJ_STATE.unit]) {
      posChips.appendChild(h('button', {
        class: 'ghost' + (PROJ_STATE.pos === pos ? ' active' : ''),
        style: PROJ_STATE.pos === pos ? { fontWeight: 700 } : {},
        onclick: () => { PROJ_STATE.pos = pos; viewProjections(lg.id); },
      }, pos));
    }
    const teamSelP = h('select', { 'aria-label':'Filter projections by NFL team', style: { marginLeft: '8px' }, onchange: (e) => { PROJ_STATE.team = e.target.value; viewProjections(lg.id); } });
    teamSelP.appendChild(h('option', { value: 'ALL' }, 'All Teams'));
    for (const t of [...new Set((data.players || []).map(p => p.team).filter(Boolean))].sort())
      teamSelP.appendChild(h('option', { value: t, selected: PROJ_STATE.team === t ? '' : null }, t));
    posChips.appendChild(teamSelP);
    main.appendChild(posChips);

    // ---- detailed player table: stat line (selected source) + all-source pts ----
    // Sortable: default by selected source pts desc; click any header to sort.
    const sortKey = PROJ_STATE.sort?.key || src;
    const sortDir = PROJ_STATE.sort?.dir || 'desc';
    const isSourceKey = (k) => data.sources.includes(k);
    // Positional rank (RB4, WR12) + VOR over ALL players at that position by the
    // selected source, computed once, not per row.
    const posRankMap = new Map();
    { const byG = {};
      for (const p of (data.players || [])) { if (p[src] == null) continue; const g = projPosGroup(p.pos); (byG[g] = byG[g] || []).push(p); }
      for (const g in byG) { byG[g].sort((a, b) => b[src] - a[src]); byG[g].forEach((p, i) => posRankMap.set(p.id, { group: g, rank: i + 1 })); }
    }
    const sortVal = (p, k) => k === 'vor' ? vorForPlayer(p, lg, PROJ_STATE.unit, src)
      : k === 'posrank' ? -(posRankMap.get(p.id)?.rank ?? 9999)
      : k === 'ppdelta' ? ppEdge(p)
      : isSourceKey(k) ? p[k] : ((p.stats && p.stats[src]) || {})[k];
    const setSort = (k) => {
      PROJ_STATE.sort = (PROJ_STATE.sort && PROJ_STATE.sort.key === k)
        ? { key: k, dir: PROJ_STATE.sort.dir === 'desc' ? 'asc' : 'desc' }
        : { key: k, dir: 'desc' };
      viewProjections(lg.id);
    };
    const rows = (data.players || [])
      .filter(p => projPosMatch(p.pos, PROJ_STATE.pos))
      .filter(p => PROJ_STATE.team === 'ALL' || p.team === PROJ_STATE.team)
      .filter(p => p[src] != null)
      .sort((a, b) => {
        const av = sortVal(a, sortKey), bv = sortVal(b, sortKey);
        const an = av == null, bn = bv == null;
        if (an && bn) return 0;
        if (an) return 1;      // nulls last regardless of dir
        if (bn) return -1;
        return sortDir === 'desc' ? bv - av : av - bv;
      })
      .slice(0, 300);
    const arrow = (k) => k === sortKey ? (sortDir === 'desc' ? ' ▼' : ' ▲') : '';
    const sortTh = (k, label, active) => h('th', {
      style: { textAlign: 'right', cursor: 'pointer', whiteSpace: 'nowrap', ...(active ? { color: 'var(--green)' } : {}) },
      title: 'Sort', onclick: () => setSort(k),
    }, label + arrow(k));
    const statTh = statKeys.map(k => sortTh(k, STAT_LABEL[k] || k, false));
    const ptsTh = data.sources.map(s => sortTh(s, PROJ_SRC_LABEL[s], s === src));
    const table = h('div', { class: 'card', style: { padding: 0, overflowX: 'auto' } },
      h('table', { class: 'data', style: { minWidth: '760px' } },
        h('thead', null, h('tr', null,
          h('th', { style: { textAlign: 'right' } }, '#'), h('th', null, 'Player'), h('th', null, 'Pos'),
          sortTh('posrank', 'PosRk', PROJ_STATE.sort?.key === 'posrank'),
          h('th', null, 'Tm'), h('th', null, 'Env'),
          sortTh('vor', 'VOR', PROJ_STATE.sort?.key === 'vor'),
          PROJ_STATE.unit === 'offense' ? sortTh('ppdelta', 'PP−Slp', PROJ_STATE.sort?.key === 'ppdelta') : null,
          // Expert boards rank offense only, so the columns ride with the offense unit.
          // expertHeaders() returns plain th, not sortHdr, so it cannot touch PROJ_STATE.sort.
          ...(PROJ_STATE.unit === 'offense' ? expertHeaders() : []),
          ...statTh, ...ptsTh)),
        h('tbody', null, ...rows.map((p, i) => {
          const line = (p.stats && p.stats[src]) || {};
          const statTd = statKeys.map(k => h('td', { class: 'tnum', style: { textAlign: 'right', color: 'var(--fg-2)' } },
            line[k] == null ? '·' : fmt.decimal(line[k], (k.endsWith('_td') || k === 'int' || k === 'pass_int' || k === 'ff' || k === 'fum_rec' || k === 'pass_def' || k === 'qb_hit' || k === 'sack') ? 1 : 0)));
          const ptsTd = data.sources.map(s => h('td', {
            class: 'tnum', style: { textAlign: 'right', ...(s === src ? { fontWeight: 700 } : { color: 'var(--fg-3)' }) },
            title: (s === 'pp' && p.pp_partial) ? 'Includes Sleeper fill for props PrizePicks did not post (e.g. receptions)' : '',
          }, p[s] == null ? '·' : (fmt.decimal(p[s], 1) + (s === 'pp' && p.pp_partial ? '*' : ''))));
          const pr = posRankMap.get(p.id);
          const vor = vorForPlayer(p, lg, PROJ_STATE.unit, src);
          return h('tr', p.id ? { onclick: () => openPlayerDetail(p.name, p.id), style: { cursor: 'pointer' } } : {},
            h('td', { class: 'tnum', style: { textAlign: 'right', color: 'var(--fg-3)' } }, String(i + 1)),
            h('td', null, h('span', { class: 'name' }, p.name)),
            h('td', null, posChip(p.pos)),
            h('td', { class: 'tnum', style: { color: 'var(--fg-2)' } }, pr ? `${pr.group}${pr.rank}` : '·'),
            h('td', null, teamChip(p.team)),
            h('td', null, envChip(p.team) || h('span', { class: 'muted' }, '·')),
            h('td', { class: 'tnum', style: { textAlign: 'right', fontWeight: 700, color: vor == null ? 'var(--fg-3)' : vor >= 30 ? 'var(--green)' : vor >= 0 ? 'var(--fg-1)' : 'var(--red)' } }, vor == null ? '·' : (vor > 0 ? '+' : '') + fmt.decimal(vor, 0)),
            PROJ_STATE.unit === 'offense' ? h('td', { class: 'right' }, ppEdgeChip(p.id) || h('span', { class: 'muted' }, '·')) : null,
            ...(PROJ_STATE.unit === 'offense' ? expertCells(p.name, p.id) : []),
            ...statTd, ...ptsTd);
        }))
      )
    );
    main.appendChild(table);
    main.appendChild(h('div', { class: 'tip', style: { marginTop: '10px' } },
      `${rows.length} ${PROJ_STATE.unit} players · stat line shown for ${PROJ_SRC_LABEL[src]}. ` +
      (isDef ? 'Defense: PD/QB-hit/return-yds are best-estimated (no source projects them); tackles/sacks/INT/FF from Clay & Sleeper.' : 'Offense pts: PrizePicks lines vs Sleeper model vs blend. PP * = missing props (e.g. receptions) filled from Sleeper so pass-catchers aren’t undercounted.')));
  }

  // ============================================================
  // Strength of Schedule page, per position (QB/RB/WR/TE), teams as rows,
  // weeks as columns, each cell the opponent colored by its defense-vs-position
  // strength (last-season PPR allowed to that position, ranked). window.SOS_GRID.
  // ============================================================
  let SOS_GRID_POS = 'RB';
  let SOS_GRID_SORT = { key: 'avg', dir: 'desc' }; // key = 'avg' or a week number; desc = easiest first
  function defRankColor(rank, n) {
    if (rank == null) return 'var(--fg-3)';
    const f = rank / n;   // low rank = allows fewest = tough = red; high = easy = green
    return f <= 0.25 ? 'var(--red)' : f <= 0.5 ? 'var(--amber)' : f <= 0.75 ? 'var(--accent)' : 'var(--green)';
  }
  // ============================================================
  // Stats Lab - every public advanced stat, one sortable table
  // ============================================================
  // Built from window.ADVANCED (projections/build_nflverse_suite.py). The column
  // list, labels and definitions live in that payload, not here, so adding a
  // metric is a builder change and this view picks it up untouched.
  const STATS_LAB_KEY = 'ff-stats-lab-v1';
  function statsLabPrefs() {
    try { return JSON.parse(localStorage.getItem(STATS_LAB_KEY) || '{}') || {}; } catch (_) { return {}; }
  }
  function saveStatsLabPrefs(prefs) {
    try { localStorage.setItem(STATS_LAB_KEY, JSON.stringify(prefs)); } catch (_) { /* private mode */ }
  }
  function statFmt(v, f) {
    if (v == null || v === '') return '';
    if (f === 'text') return String(v);
    if (f === 'pct') return `${(v * 100).toFixed(1)}%`;
    if (f === 'pct100') return `${Number(v).toFixed(1)}%`;
    if (f === 'dec2') return Number(v).toFixed(2);
    if (f === 'dec1') return Number(v).toFixed(1);
    return String(Math.round(v));
  }

  // Past seasons live in their own files and load only when picked, so the
  // current season is the only one on the page at first paint.
  const _seasonLoads = {};
  function loadSeasonScript(file, ready) {
    if (ready()) return Promise.resolve();
    if (_seasonLoads[file]) return _seasonLoads[file];
    _seasonLoads[file] = new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = `data/${file}`;
      tag.onload = () => resolve();
      tag.onerror = () => { delete _seasonLoads[file]; tag.remove(); reject(new Error(`${file} failed to load`)); };
      document.head.appendChild(tag);
    });
    return _seasonLoads[file];
  }
  const loadAdvancedSeason = (year) => loadSeasonScript(`advanced-${year}.js`, () => (window.ADVANCED_BY_SEASON || {})[year]);
  const loadSplitsSeason = (year) => loadSeasonScript(`splits-${year}.js`, () => (window.SPLITS_BY_SEASON || {})[year]);

  // Header definitions live in `title`, which a phone cannot hover, so every Stats
  // Lab table also carries them as a collapsed key a thumb can open.
  function statsColumnKey(cols, estimates) {
    return h('details', { class:'card stats-lab-key' },
      h('summary', null, 'Column key'),
      h('dl', null, ...cols.filter(c => c.desc).flatMap(c => [
        h('dt', null, c.label),
        h('dd', null, c.desc + (estimates && estimates.has(c.key) ? ' This is an estimate, not a charted count.' : '')),
      ])));
  }

  // Calculated columns: numbers, column keys, + - * / and parentheses. A hand
  // tokenizer and recursive-descent parser build plain closures, so nothing a
  // user types ever reaches eval or Function. Unknown names, calls and any other
  // character are rejected. Returns { fn(row) } or { error }.
  function statsExprCompile(src, keys) {
    const s = String(src == null ? '' : src), known = new Set(keys), toks = [];
    for (let i = 0; i < s.length;) {
      const ch = s[i], rest = s.slice(i);
      let m;
      if (ch === ' ' || ch === '\t') { i++; continue; }
      if ((m = /^(?:\d+\.?\d*|\.\d+)/.exec(rest))) toks.push({ t:'num', v:Number(m[0]) });
      else if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest))) {
        if (!known.has(m[0])) return { error:`"${m[0]}" is not a column key` };
        toks.push({ t:'key', v:m[0] });
      } else if ('+-*/()'.includes(ch)) { m = [ch]; toks.push({ t:ch }); }
      else return { error:`"${ch}" is not allowed` };
      i += m[0].length;
    }
    if (!toks.length) return { error:'Type an expression' };
    let p = 0;
    const peek = () => toks[p] && toks[p].t;
    const num = (v) => typeof v === 'number' && isFinite(v);
    const bin = (op, a, b) => {
      if (!num(a) || !num(b)) return null;
      const v = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : b === 0 ? null : a / b;
      return num(v) ? v : null;
    };
    const chain = (next, ops) => () => {
      let f = next();
      while (ops.includes(peek())) {
        const op = toks[p++].t, l = f, r = next();
        f = (row) => bin(op, l(row), r(row));
      }
      return f;
    };
    const unary = () => {
      if (peek() === '-') { p++; const f = unary(); return (row) => bin('-', 0, f(row)); }
      if (peek() === '+') { p++; return unary(); }
      const tk = toks[p++];
      if (!tk) throw new Error('Expression ends early');
      if (tk.t === 'num') return () => tk.v;
      if (tk.t === 'key') {
        if (peek() === '(') throw new Error('Function calls are not allowed');
        return (row) => row[tk.v];
      }
      if (tk.t === '(') {
        const f = sum();
        if (peek() !== ')') throw new Error('Missing )');
        p++;
        return f;
      }
      throw new Error(`Unexpected "${tk.t}"`);
    };
    const sum = chain(chain(unary, ['*', '/']), ['+', '-']);
    try {
      const fn = sum();
      if (p < toks.length) throw new Error(`Unexpected "${toks[p].t === 'num' || toks[p].t === 'key' ? toks[p].v : toks[p].t}"`);
      return { fn };
    } catch (e) { return { error:e.message }; }
  }
  // ---- end statsExprCompile

  // Export reads the rendered table, so the file is exactly the rows and
  // columns on screen, in screen order, with screen formatting.
  function statsCsv(table) {
    const q = (s) => /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    const line = (cells) => [...cells].map(c => q(c.textContent.replace(/\s*[↑↓]$/, '').trim())).join(',');
    return [line(table.tHead.rows[0].cells), ...[...table.tBodies[0].rows].map(r => line(r.cells))].join('\r\n');
  }

  // Named views are their own key so a bad write there cannot cost the live prefs.
  const STATS_VIEWS_KEY = 'ff-stats-lab-views-v1';
  function statsViews() {
    try { const v = JSON.parse(localStorage.getItem(STATS_VIEWS_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; }
  }
  function saveStatsViews(views) {
    try { localStorage.setItem(STATS_VIEWS_KEY, JSON.stringify(views)); } catch (_) { /* private mode */ }
  }
  // Bio filters read players.js and prospect.js by Sleeper id. An undrafted
  // player counts as round 8, so one min/max pair covers "Day 3 and UDFA".
  const STATS_BIO = [
    ['age', 'Age', (id) => window.PLAYERS?.[id]?.age],
    ['exp', 'Years exp', (id) => window.PLAYERS?.[id]?.exp],
    ['round', 'Round (8 = UDFA)', (id) => { const p = window.PROSPECT?.players?.[id]; return p ? (p.draft_round ?? 8) : null; }],
    ['year', 'Draft year', (id) => window.PROSPECT?.players?.[id]?.draft_year],
    ['ht', 'Height (in)', (id) => window.PROSPECT?.players?.[id]?.height_in],
    ['wt', 'Weight (lb)', (id) => window.PROSPECT?.players?.[id]?.weight_lb],
    ['athl', 'Athletic pct', (id) => window.PROSPECT?.players?.[id]?.athl_pct],
  ];
  // Thresholds are typed in the units on screen, so a pct column compares x100.
  const statsDisp = (c, v) => c.fmt === 'pct' ? v * 100 : v;
  let STATS_TOOLS_OPEN = false, STATS_COL_FIND = '';

  // Shared sortable table for the Defense and Trends tabs: columns are
  // {key, label, get(row), fmt, desc, lowerBetter, tone(row)}.
  function statsTable(main, prefs, tabKey, rows, cols, defaultSort, rowName, onRow) {
    const sort = (prefs.sort && prefs.sort[tabKey]) || defaultSort;
    const col = cols.find(c => c.key === sort.key) || cols[0];
    rows.sort((a, b) => {
      const av = col.get(a), bv = col.get(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string') return av.localeCompare(bv) * (sort.dir === 'asc' ? 1 : -1);
      return sort.dir === 'asc' ? av - bv : bv - av;
    });
    const head = (c) => {
      const active = sort.key === c.key;
      return h('th', { class:`right clickable${active ? ' sort-active' : ''}`, title:c.desc || '', tabindex:'0',
        'aria-sort':active ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none',
        onclick:() => {
          const dir = active ? (sort.dir === 'desc' ? 'asc' : 'desc') : (c.lowerBetter ? 'asc' : 'desc');
          prefs.sort = Object.assign({}, prefs.sort, { [tabKey]: { key:c.key, dir } });
          saveStatsLabPrefs(prefs); viewStats(tabKey);
        } }, c.label + (active ? (sort.dir === 'desc' ? ' \u2193' : ' \u2191') : ''));
    };
    const tbl = h('table', { class:'data data-sticky stats-lab-table' },
      h('thead', null, h('tr', null, h('th', { class:'right' }, '#'), h('th', null, rowName), ...cols.map(head))),
      h('tbody', null, ...rows.map((r, i) => h('tr', { class:r._mine ? 'you' : '', onclick:onRow ? () => onRow(r) : null },
        h('td', { class:'right tnum muted' }, String(i + 1)),
        h('td', { class:'stats-lab-name' }, r._label),
        ...cols.map(c => h('td', { class:`right tnum ${c.tone ? c.tone(r) || '' : ''}` },
          c.show ? c.show(r) : statFmt(c.get(r), c.fmt)))))));
    main.appendChild(statsColumnKey(cols));
    appendTable(main, tbl);
  }

  function statsDefense(main, prefs) {
    const D = window.DEFENSE;
    if (!D) { main.appendChild(h('div', { class:'empty' }, 'defense.js not loaded. Run projections/build_defense_matchups.py.')); return; }
    const slice = prefs.defSlice === 'prior' ? 'prior' : 'cur';
    main.appendChild(h('div', { class:'card stats-lab-filters' },
      h('label', { class:'stats-lab-toggle' }, 'Sample ',
        h('select', { 'aria-label':'Defense sample', onchange:(e) => { prefs.defSlice = e.target.value; saveStatsLabPrefs(prefs); viewStats('Defense'); } },
          h('option', { value:'cur', selected:slice === 'cur' }, `${D.season} through week ${D.throughWeek}`),
          h('option', { value:'prior', selected:slice === 'prior' }, `${D.prior} full season`))),
      h('span', { class:'muted' }, 'Rank 1 = softest (most PPR allowed). Green is a good matchup for your player.')));
    const rows = Object.entries(D.teams).map(([t, v]) => Object.assign({ _label: teamChip(t), _team: t }, v[slice] || {}));
    // A soft defense is green because it is good news for the player facing it.
    const rankTone = (r) => r == null ? '' : r <= 8 ? 'delta-up' : r >= 25 ? 'delta-down' : '';
    const pos = (P, k) => (r) => r.byPos && r.byPos[P] ? r.byPos[P][k] : null;
    const cols = [];
    for (const P of ['WR', 'TE', 'RB']) {
      cols.push({ key:`${P}ppr`, label:`vs ${P} PPR/G`, get:pos(P, 'ppr_pg'), fmt:'dec1',
        desc:`PPR points per game allowed to ${P}s ${P === 'RB' ? 'as receivers ' : ''}(${D.fields && D.fields.ppr_pg ? D.fields.ppr_pg : ''})`.trim(),
        show:(r) => { const v = pos(P, 'ppr_pg')(r), k = pos(P, 'rank')(r); return v == null ? '' : `${Number(v).toFixed(1)} #${k}`; },
        tone:(r) => rankTone(pos(P, 'rank')(r)) });
    }
    cols.push(
      { key:'rbrush', label:'RB rush PPR/G', get:(r) => r.rushRB && r.rushRB.ppr_pg, fmt:'dec1', desc:'Rushing PPR allowed to running backs per game.' },
      { key:'ypc', label:'YPC', get:(r) => r.rushRB && r.rushRB.ypc, fmt:'dec1', desc:'Yards per carry allowed to running backs.' },
      { key:'epadb', label:'EPA/DB', get:(r) => r.pass && r.pass.epa_per_dropback, fmt:'dec2', desc:'EPA allowed per dropback. Higher is a softer pass defense.' },
      { key:'press', label:'Pressure%', get:(r) => r.pass && r.pass.pressure_rate, fmt:'pct', lowerBetter:true, desc:'Share of dropbacks where PFR charted the passer as pressured (hurried, hit or sacked), once per play. High pressure is a bad matchup for a QB.' },
      { key:'blitz', label:'Blitz%', get:(r) => r.pass && r.pass.blitz_rate, fmt:'pct', desc:'Share of dropbacks where PFR charted a blitz, once per play, not once per blitzer.' },
      { key:'funnel', label:'Funnel', get:(r) => r.funnel || '', fmt:'text', desc:'Which position takes the largest share of targets against this defense, relative to league average.' });
    statsTable(main, prefs, 'Defense', rows, cols, { key:'WRppr', dir:'desc' }, 'Defense');
    main.appendChild(h('div', { class:'tip', style:{ marginTop:'10px' } },
      `Early-season samples are two or three games; the ${D.prior} view is the prior to lean on until they grow. ${D.source}.`));
  }

  function statsTrends(main, prefs) {
    const U = window.USAGE_WEEKLY;
    if (!U) { main.appendChild(h('div', { class:'empty' }, 'usage-weekly.js not loaded. Run projections/build_weekly_splits.py.')); return; }
    const F = U.fields, ix = (k) => F.indexOf(k);
    const mine = new Set();
    for (const lg of window.LEAGUES || []) {
      const me = (lg.rosters || []).find(r => r.is_me);
      for (const pid of (me && me.players) || []) mine.add(String(pid));
    }
    const posSel = ['All', 'QB', 'RB', 'WR', 'TE'].includes(prefs.trendPos) ? prefs.trendPos : 'All';
    main.appendChild(h('div', { class:'card stats-lab-filters' },
      h('label', { class:'stats-lab-toggle' }, 'Position ',
        h('select', { 'aria-label':'Position', onchange:(e) => { prefs.trendPos = e.target.value; saveStatsLabPrefs(prefs); viewStats('Trends'); } },
          ...['All', 'QB', 'RB', 'WR', 'TE'].map(v => h('option', { value:v, selected:v === posSel }, v)))),
      h('label', { class:'stats-lab-toggle' },
        h('input', { type:'checkbox', checked:!!prefs.trendMine, onchange:(e) => { prefs.trendMine = e.target.checked; saveStatsLabPrefs(prefs); viewStats('Trends'); } }),
        ' My players'),
      h('label', { class:'stats-lab-toggle' },
        h('input', { type:'checkbox', checked:prefs.trendFlagged !== false, onchange:(e) => { prefs.trendFlagged = e.target.checked; saveStatsLabPrefs(prefs); viewStats('Trends'); } }),
        ' Role changes only')));
    let rows = Object.entries(U.players)
      .filter(([sid, v]) => (v.w || []).length >= 2)
      .filter(([, v]) => posSel === 'All' || v.p === posSel)
      .filter(([sid]) => !prefs.trendMine || mine.has(sid))
      .filter(([, v]) => prefs.trendFlagged === false || (v.flags || []).length)
      .map(([sid, v]) => {
        const last = v.w[v.w.length - 1], prev = v.w[v.w.length - 2];
        return { _sid:sid, _mine:mine.has(sid), _name:v.n, _label:`${v.n} ${v.p} ${v.t}`, last, prev, flags:v.flags || [], p:v.p };
      });
    const delta = (k) => (r) => (r.last[ix(k)] ?? 0) - (r.prev[ix(k)] ?? 0);
    const shift = (k) => (r) => {
      const a = r.prev[ix(k)], b = r.last[ix(k)];
      if (a == null && b == null) return '';
      const d = (b ?? 0) - (a ?? 0);
      return `${statFmt(a ?? 0, 'pct')} \u2192 ${statFmt(b ?? 0, 'pct')} (${d >= 0 ? '+' : ''}${(d * 100).toFixed(0)})`;
    };
    const tone = (k, big) => (r) => { const d = delta(k)(r); return d >= big ? 'delta-up' : d <= -big ? 'delta-down' : ''; };
    const cols = [
      { key:'snap', label:'Snap%', get:delta('snap_pct'), show:shift('snap_pct'), tone:tone('snap_pct', 0.15), desc:U.fieldDesc.snap_pct },
      { key:'route', label:'Route% (est)', get:delta('route_rate_est'), show:shift('route_rate_est'), tone:tone('route_rate_est', 0.15), desc:U.fieldDesc.route_rate_est },
      { key:'tgt', label:'Tgt%', get:delta('target_share'), show:shift('target_share'), tone:tone('target_share', 0.08), desc:U.fieldDesc.target_share },
      { key:'fr', label:'1st-read%', get:(r) => r.last[ix('first_read_share')], fmt:'pct', desc:U.fieldDesc.first_read_share },
      { key:'rush', label:'Rush%', get:delta('rush_share'), show:shift('rush_share'), tone:tone('rush_share', 0.15), desc:U.fieldDesc.rush_share },
      { key:'rz', label:'RZ opp%', get:(r) => r.last[ix('rz_opp_share')], fmt:'pct', desc:U.fieldDesc.rz_opp_share },
      { key:'ppr', label:'PPR', get:(r) => r.last[ix('ppr_pts')], fmt:'dec1', desc:U.fieldDesc.ppr_pts },
      { key:'flag', label:'Role', get:(r) => r.flags.join(' '), fmt:'text', show:(r) => r.flags.map(f => f === 'role_up' ? 'UP' : f === 'role_down' ? 'DOWN' : f).join(' '),
        tone:(r) => r.flags.includes('role_up') ? 'delta-up' : r.flags.includes('role_down') ? 'delta-down' : '', desc:'Snap share moved 15+ points or target share 8+ points week over week.' },
    ];
    // Default: biggest target-share move either way, which is the signal the
    // Beyond the Box Score hosts lead with every week.
    cols[2].get = (r) => Math.abs(delta('target_share')(r));
    statsTable(main, prefs, 'Trends', rows, cols, { key:'tgt', dir:'desc' }, `Player, week ${U.throughWeek - 1} \u2192 ${U.throughWeek}`,
      (r) => openPlayerDetail(r._name, r._sid));
    main.appendChild(h('div', { class:'tip', style:{ marginTop:'10px' } },
      `${rows.length} players. Each cell is last week versus the week before; the Tgt% column sorts by the size of the move either way. `
      + 'Route% is estimated from snaps (public route data ends in 2025) and calibrated on 2025.'));
  }

  function statsIdp(main, prefs) {
    const I = window.IDP_ADVANCED;
    if (!I) { main.appendChild(h('div', { class:'empty' }, 'idp-advanced.js not loaded. Run projections/build_idp_advanced.py.')); return; }
    const grp = ['DL', 'LB', 'DB'].includes(prefs.idpPos) ? prefs.idpPos : 'LB';
    const minSnap = prefs.idpMinSnap ?? 0.3;
    const mine = new Set();
    for (const lg of window.LEAGUES || []) {
      const me = (lg.rosters || []).find(r => r.is_me);
      for (const pid of (me && me.players) || []) mine.add(String(pid));
    }
    main.appendChild(h('div', { class:'card stats-lab-filters' },
      h('span', { class:'sos-position-tabs', role:'group', 'aria-label':'IDP position' },
        ...['DL', 'LB', 'DB'].map(g => h('button', { class:`ghost${g === grp ? ' active' : ''}`, 'aria-pressed':String(g === grp),
          onclick:() => { prefs.idpPos = g; saveStatsLabPrefs(prefs); viewStats('IDP'); } }, g))),
      h('label', { class:'stats-lab-toggle' }, 'Min snap% ',
        h('select', { 'aria-label':'Minimum snap share', onchange:(e) => { prefs.idpMinSnap = Number(e.target.value); saveStatsLabPrefs(prefs); viewStats('IDP'); } },
          ...[0, 0.3, 0.5, 0.7].map(v => h('option', { value:String(v), selected:minSnap === v }, `${v * 100}%`)))),
      h('span', { class:'muted' }, `Scored with ${I.league && I.league.name ? I.league.name : 'your IDP league'}'s own settings.`)));
    const rows = Object.entries(I.players).filter(([, v]) => v.p === grp && (v.snp_pct || 0) >= minSnap)
      .map(([sid, v]) => Object.assign({ _sid:sid, _mine:mine.has(sid), _label:`${v.n} ${v.t || ''}`, _name:v.n }, v));
    const cols = I.columns.filter(c => c.key !== 'rank').map(c => ({ key:c.key, label:c.label, fmt:c.fmt, desc:c.desc,
      get:(r) => r[c.key], lowerBetter:/allow|mtkl/.test(c.key) }));
    statsTable(main, prefs, 'IDP', rows, cols, { key:'ppg', dir:'desc' }, `${grp}, ${I.season} through week ${I.throughWeek}`,
      (r) => openPlayerDetail(r._name, r._sid));
    main.appendChild(h('div', { class:'tip', style:{ marginTop:'10px' } }, `${rows.length} players. ${I.source}.`));
  }

  // ---- Coverage tab: man vs zone, shells, pressure, personnel and formation.
  // coverage-YYYY.js (projections/build_coverage_splits.py) holds COUNTS from
  // nflverse participation charting and the page divides. A season nflverse has
  // not posted ships as { published:false }, so it renders a state, never a 404.
  const loadCoverageSeason = (year) => loadSeasonScript(`coverage-${year}.js`, () => (window.COVERAGE_BY_SEASON || {})[year]);
  const COV_POS = ['WR', 'TE', 'RB', 'QB', 'Team'];
  const COV_TEAM_VIEWS = [['dcov', 'Coverage played (defense)'], ['ocov', 'Coverage faced (offense)'], ['pers', 'Personnel and formation']];
  const COV_SHELL_LABELS = { man:'Man%', zone:'Zone%', c0:'Cov 0%', c1:'Cov 1%', c2:'Cov 2%', c2m:'2-Man%', c3:'Cov 3%', c4:'Cov 4%', c6:'Cov 6%', other:'Other%' };
  const covTitle = (s) => s.toLowerCase().replace(/(^|[\s/])\w/g, (m) => m.toUpperCase());

  function statsCoverage(main, prefs, cur) {
    const SEASONS = [cur, cur - 1, cur - 2];
    const got = (y) => (window.COVERAGE_BY_SEASON || {})[y];
    // No season picked: the newest one nflverse has posted.
    const picked = SEASONS.includes(prefs.covSeason) ? prefs.covSeason : null;
    const season = picked ?? SEASONS.find(y => !got(y) || got(y).published) ?? cur;
    const C = got(season);
    if (!C) {
      const msg = h('div', { class:'empty' }, `Loading ${season} coverage...`);
      main.appendChild(msg);
      loadCoverageSeason(season).then(() => { if (msg.isConnected) viewStats('Coverage'); })
        .catch(() => { msg.textContent = `coverage-${season}.js did not load. Run projections/build_coverage_splits.py.`; });
      return;
    }
    const pos = COV_POS.includes(prefs.covPos) ? prefs.covPos : 'WR';
    const isTeam = pos === 'Team', isQB = pos === 'QB', role = isQB ? 'Q' : 'R';
    const set = (k, v) => { prefs[k] = v; saveStatsLabPrefs(prefs); viewStats('Coverage'); };
    const pick = (label, value, opts, onchange) => h('label', { class:'stats-lab-toggle' }, `${label} `,
      h('select', { 'aria-label':label, onchange:(e) => onchange(e.target.value) },
        ...opts.map(o => o.nodeType ? o : h('option', { value:String(o[0]), selected:String(o[0]) === String(value) }, o[1]))));
    const filters = h('div', { class:'card stats-lab-filters' },
      h('span', { class:'sos-position-tabs', role:'group', 'aria-label':'Coverage position' },
        ...COV_POS.map(p => h('button', { class:`ghost${p === pos ? ' active' : ''}`, 'aria-pressed':String(p === pos),
          onclick:() => set('covPos', p) }, p))),
      pick('Season', season, SEASONS.map(y => [y, String(y)]), (v) => set('covSeason', Number(v))));
    main.appendChild(filters);
    if (!C.published) {
      main.appendChild(h('div', { class:'card stats-lab-cov-empty' },
        h('p', null, h('strong', null, `${season} coverage charting is not published yet.`)),
        h('p', null, C.note),
        h('button', { type:'button', onclick:() => set('covSeason', season - 1) }, `Show ${season - 1}`)));
      return;
    }
    if (!picked && season !== cur) filters.appendChild(h('span', { class:'muted' }, `${cur} is not published yet, so this is ${season}.`));

    let rows, cols, rowName, defaultSort, onRow = null, sample = null;
    const div = (a, b) => b ? a / b : null;
    if (isTeam) {
      const view = COV_TEAM_VIEWS.some(v => v[0] === prefs.covTeamView) ? prefs.covTeamView : 'dcov';
      filters.appendChild(pick('View', view, COV_TEAM_VIEWS, (v) => set('covTeamView', v)));
      const TF = C.teamFields, share = (list, key, i) => (r) => div(r[list][i], r[key]);
      rows = Object.entries(C.teams).map(([t, v]) => ({ _label:teamChip(t), ...v,
        nCov:v[view === 'ocov' ? 'ocov' : 'dcov'][0] + v[view === 'ocov' ? 'ocov' : 'dcov'][1],
        nPers:v.pers.reduce((a, b) => a + b, 0), nForm:v.form.reduce((a, b) => a + b, 0) }));
      if (view === 'pers') {
        cols = [{ key:'nPers', label:'Plays', get:(r) => r.nPers, fmt:'int', desc:'Offensive plays with charted personnel.' },
          ...TF.pers.map((k, i) => ({ key:`p${k}`, label:k === 'other' ? 'Other%' : `${k}%`, get:share('pers', 'nPers', i), fmt:'pct',
            desc:k === 'other' ? 'Share of plays in any other personnel: empty backfield, 13, 22, jumbo and the rest.'
              : `Share of plays in ${k} personnel: ${k[0]} back${k[0] === '1' ? '' : 's'} and ${k[1]} tight end${k[1] === '1' ? '' : 's'}.` })),
          ...TF.form.map((k, i) => ({ key:`f${i}`, label:`${covTitle(k)}%`, get:share('form', 'nForm', i), fmt:'pct',
            desc:`Share of charted offensive plays from ${k.toLowerCase()}.` }))];
        defaultSort = { key:'p11', dir:'desc' };
      } else {
        const side = view === 'ocov' ? 'faced on offense' : 'played on defense';
        cols = [{ key:'nCov', label:'Charted DB', get:(r) => r.nCov, fmt:'int', desc:`Dropbacks with charted coverage ${side}.` },
          ...TF.cov.map((k, i) => ({ key:k, label:COV_SHELL_LABELS[k], get:share(view, 'nCov', i), fmt:'pct',
            desc:k === 'other' ? `Cover 9, combination and blown coverages ${side}.`
              : `Share of charted dropbacks ${side} in ${C.splitLabels[k] ? C.splitLabels[k].replace(/^vs /, '') : k}.` }))];
        defaultSort = { key:'man', dir:'desc' };
      }
      rowName = 'Team';
    } else {
      const F = C.fields[role], S = C.splits, at = (a, k) => a ? a[F.indexOf(k)] : 0;
      const routeTot = {};
      if (!isQB) for (const t of Object.values(C.targetedRoutes)) for (const [k, a] of Object.entries(t)) routeTot[k] = (routeTot[k] || 0) + a[0];
      const routes = Object.keys(routeTot).sort((a, b) => routeTot[b] - routeTot[a]);
      const want = String(prefs.covSplit || 'man');
      const route = want.startsWith('route:') && routes.includes(want.slice(6)) ? want.slice(6) : null;
      const sk = route ? want : S.includes(want) ? want : 'man', idx = S.indexOf(sk);
      const MINS = [1, 5, 10, 25, 50, 100], min = MINS.includes(prefs.covMin) ? prefs.covMin : isQB ? 25 : 5;
      filters.appendChild(pick('Split', sk, [...S.map(k => [k, C.splitLabels[k]]),
        ...(routes.length ? [h('optgroup', { label:'Targeted route (targets, not routes run)' },
          ...routes.map(r => h('option', { value:`route:${r}`, selected:sk === `route:${r}` }, `Targeted: ${covTitle(r)}`)))] : [])],
        (v) => set('covSplit', v)));
      filters.appendChild(pick(isQB ? 'Min DB' : 'Min tgt', min, MINS.map(v => [v, String(v)]), (v) => set('covMin', Number(v))));
      const mine = new Set();
      for (const lg of window.LEAGUES || []) {
        const me = (lg.rosters || []).find(r => r.is_me);
        for (const pid of (me && me.players) || []) mine.add(String(pid));
      }
      const splitName = route ? `targeted ${covTitle(route)} routes` : C.splitLabels[sk].replace(/^vs /, 'against ').toLowerCase();
      rows = [];
      for (const [sid, v] of Object.entries(C.players)) {
        if (v.p !== pos || !v[role]) continue;
        const base = { _sid:sid, _name:v.n, _mine:mine.has(sid), _label:`${v.n} ${v.t}` };
        if (route) {
          const a = (C.targetedRoutes[sid] || {})[route];
          if (!a || a[0] < min) continue;
          const [tgt, rec, yds, td, epa] = a;
          rows.push({ ...base, tgt, rec, yds, td, epa, share:div(tgt, at(v.R[0], 'tgt')), catch:div(rec, tgt), ypt:div(yds, tgt), epat:div(epa, tgt) });
          continue;
        }
        const a = v[role][idx], all = v[role][0];
        if (!a) continue;
        const r = { ...base };
        for (const k of F) r[k] = at(a, k);
        if (isQB) {
          if (r.db < min) continue;
          Object.assign(r, { cmpPct:div(r.cmp, r.att - r.sk), ypa:div(r.yds, r.att), epadb:div(r.epa, r.db), skPct:div(r.sk, r.db),
            adot:div(r.air, r.att), vsAll:r.db ? r.epa / r.db - div(at(all, 'epa'), at(all, 'db')) : null });
        } else {
          if (r.tgt < min) continue;
          Object.assign(r, { tpdb:div(r.tgt, r.db), catch:div(r.rec, r.tgt), ypt:div(r.yds, r.tgt), epat:div(r.epa, r.tgt), adot:div(r.air, r.tgt),
            vsAll:r.db && at(all, 'db') ? r.tgt / r.db - at(all, 'tgt') / at(all, 'db') : null });
        }
        rows.push(r);
      }
      const C_ = (key, label, fmt, desc, lowerBetter = false) => ({ key, label, get:(r) => r[key], fmt, desc, lowerBetter });
      // +/- all reads green or red once the gap is big enough to notice: 2 points of Tgt/DB, 0.05 EPA/DB.
      const big = isQB ? 0.05 : 0.02, gap = (r) => r.vsAll == null ? '' : r.vsAll >= big ? 'delta-up' : r.vsAll <= -big ? 'delta-down' : '';
      if (route) {
        cols = [C_('tgt', 'Tgt', 'int', `Targets on ${splitName}.`),
          C_('share', 'Share', 'pct', 'Share of his targets that came on this route. Targets only: participation charts no route for a receiver who was not thrown to.'),
          C_('rec', 'Rec', 'int', 'Receptions.'), C_('catch', 'Catch%', 'pct', 'Receptions over targets.'),
          C_('yds', 'Yds', 'int', 'Receiving yards.'), C_('ypt', 'Y/Tgt', 'dec1', 'Receiving yards per target.'),
          C_('td', 'TD', 'int', 'Receiving touchdowns.'), C_('epa', 'EPA', 'dec1', 'Expected points added, summed over these targets.'),
          C_('epat', 'EPA/Tgt', 'dec2', 'Expected points added per target.')];
        defaultSort = { key:'tgt', dir:'desc' };
      } else if (isQB) {
        cols = [C_('db', 'DB', 'int', `His dropbacks ${splitName}: sacks in, scrambles out, as in the season table.`),
          C_('cmpPct', 'Cmp%', 'pct', 'Completions over attempts, sacks left out.'), C_('yds', 'Yds', 'int', 'Passing yards.'),
          C_('ypa', 'Y/A', 'dec1', 'Passing yards per attempt, sacks counted as attempts.'), C_('td', 'TD', 'int', 'Passing touchdowns.'),
          C_('int', 'INT', 'int', 'Interceptions.', true), C_('skPct', 'Sack%', 'pct', 'Sacks per dropback.', true),
          C_('epadb', 'EPA/DB', 'dec2', 'Expected points added per dropback.'),
          { ...C_('vsAll', '+/- all', 'dec2', 'EPA per dropback in this split minus his EPA per dropback on every dropback. Positive means better here than overall.'), tone:gap },
          C_('adot', 'aDOT', 'dec1', 'Average depth of throw: air yards over attempts.')];
        defaultSort = { key:'epadb', dir:'desc' };
      } else {
        cols = [C_('db', 'DB on field', 'int', `Team dropbacks ${splitName} with him on the field.`),
          C_('tgt', 'Tgt', 'int', 'Targets.'),
          C_('tpdb', 'Tgt/DB', 'pct', 'Targets per team dropback with him on the field: a charted stand-in for targets per route run.'),
          { ...C_('vsAll', '+/- all', 'pct', 'Tgt/DB in this split minus his Tgt/DB on every dropback. Positive means he draws more of the looks here.'), tone:gap },
          C_('rec', 'Rec', 'int', 'Receptions.'), C_('catch', 'Catch%', 'pct', 'Receptions over targets.'),
          C_('yds', 'Yds', 'int', 'Receiving yards.'), C_('ypt', 'Y/Tgt', 'dec1', 'Receiving yards per target.'),
          C_('td', 'TD', 'int', 'Receiving touchdowns.'), C_('epa', 'EPA', 'dec1', 'Expected points added, summed over his targets.'),
          C_('epat', 'EPA/Tgt', 'dec2', 'Expected points added per target.'), C_('adot', 'aDOT', 'dec1', 'Average depth of target.')];
        defaultSort = { key:'tgt', dir:'desc' };
      }
      rowName = `${pos}, ${route ? `targeted ${covTitle(route)}` : C.splitLabels[sk]}, ${season}`;
      onRow = (r) => openPlayerDetail(r._name, r._sid);
      sample = route
        ? 'Targeted routes, not routes run: participation charts the route only for the receiver the ball went to. Share is how many of his targets came on this route.'
        : `${isQB ? 'Per dropback' : 'Tgt/DB counts only dropbacks with him on the field'}. Man, zone and shell come from participation charting; pressure is its was_pressure flag.`;
    }
    // Sort is kept per tab, so a key the new position lacks falls back to its default.
    const kept = prefs.sort && prefs.sort.Coverage;
    if (kept && !cols.some(c => c.key === kept.key)) delete prefs.sort.Coverage;
    statsTable(main, prefs, 'Coverage', rows, cols, defaultSort, rowName, onRow);
    main.appendChild(h('div', { class:'tip', style:{ marginTop:'10px' } },
      `${rows.length} ${isTeam ? 'teams' : 'players'}. ${sample ? sample + ' ' : ''}Regular season through week ${C.throughWeek}. Source: ${C.source}.`));
  }

  // The Teams tab's shell columns: the man/zone and shell mix each defense
  // played, from the same coverage-YYYY.js as the Coverage tab.
  const COV_TEAM_KEYS = ['man', 'zone', 'c0', 'c1', 'c2', 'c2m', 'c3', 'c4', 'c6'];
  const teamCoverageCols = (C) => COV_TEAM_KEYS.map(k => ({ key:`cov_${k}`, label:COV_SHELL_LABELS[k], group:'Coverage (D)', fmt:'pct',
    desc:`Share of charted dropbacks this defense played in ${C.splitLabels[k].replace(/^vs /, '')} (nflverse participation charting).` }));
  function teamCoverageRow(C, t) {
    const v = C.teams[t], ix = (k) => C.teamFields.cov.indexOf(k);
    if (!v) return {};
    const n = v.dcov[ix('man')] + v.dcov[ix('zone')];
    return Object.fromEntries(COV_TEAM_KEYS.map(k => [`cov_${k}`, n ? v.dcov[ix(k)] / n : null]));
  }

  // ---- Routes tab: the Data Suite route tree, two tiles side by side, each its
  // own player, season and metric, over coverage-YYYY.js targetedRoutes
  // ([tgt, rec, yds, td, epa, air] per nflverse route label). Participation
  // charts a route only for the receiver the ball went to, so every tree here
  // is TARGETED routes and every rate is per target, never per route run.
  // ---- route tree math: pure helpers, unit-tested in site/js/route-tree.test.js
  // The Data Suite's eight spokes over nflverse's labels. Backfield and gadget
  // routes are listed under the tree instead of drawn.
  const RT_SPOKES = [
    { k:'GO', label:'Go', src:['GO'] }, { k:'POST', label:'Post', src:['POST'] }, { k:'CORNER', label:'Corner', src:['CORNER'] },
    { k:'IN', label:'In/Dig', src:['IN/DIG'] }, { k:'OUT', label:'Out', src:['QUICK OUT', 'DEEP OUT'] },
    { k:'HITCH', label:'Hitch', src:['HITCH/CURL'] }, { k:'CROSS', label:'Crosser', src:['SHALLOW CROSS/DRAG'] }, { k:'SLANT', label:'Slant', src:['SLANT'] },
  ];
  const RT_OTHER = [{ k:'SCREEN', label:'Screen', src:['SCREEN'] }, { k:'SWING', label:'Swing', src:['SWING'] },
    { k:'WHEEL', label:'Wheel', src:['WHEEL'] }, { k:'ANGLE', label:'Texas/Angle', src:['TEXAS/ANGLE'] }];
  const RT_METRICS = [['share', 'Target share'], ['tgt', 'Targets'], ['catch', 'Catch rate'], ['ypt', 'Yards per target'],
    ['air', 'Air yards per target'], ['epa', 'EPA per target'], ['td', 'TDs']];
  const RT_RATE = new Set(['catch', 'ypt', 'air', 'epa']);
  const RT_POOL_MIN = 20, RT_ROUTE_MIN = 5;   // season targets to be in the pool; route targets for a rate to rank
  function rtSum(tree, src) {
    const o = [0, 0, 0, 0, 0, 0];
    for (const r of src) { const a = (tree || {})[r]; if (a) for (let i = 0; i < 6; i++) o[i] += a[i] || 0; }
    return o;
  }
  // share is over ALL his targets, charted route or not, as the Coverage tab's Share is.
  function rtValue(a, metric, total) {
    const d = (x, y) => y ? x / y : null;
    if (metric === 'share') return d(a[0], total);
    if (metric === 'tgt') return a[0];
    if (metric === 'td') return a[3];
    if (metric === 'catch') return d(a[1], a[0]);
    if (metric === 'ypt') return d(a[2], a[0]);
    if (metric === 'air') return d(a[5], a[0]);
    return d(a[4], a[0]);
  }
  // Everyone at `pos` with RT_POOL_MIN+ targets that season: what a percentile and an average compare to.
  function rtPool(C, pos) {
    const it = C.fields.R.indexOf('tgt'), out = [];
    for (const [sid, v] of Object.entries(C.players)) {
      const total = v.p === pos && v.R && v.R[0] ? v.R[0][it] : 0;
      if (total >= RT_POOL_MIN) out.push({ sid, tree:C.targetedRoutes[sid] || {}, total });
    }
    return out;
  }
  // One route for one player. A rate ranks only on RT_ROUTE_MIN+ targets, his and
  // everyone's he is ranked against; a count ranks the whole pool, zeros included.
  // The average is the pool's mean, or for a rate the pool's pooled targets.
  function rtRate(pool, a, total, src, metric) {
    const rate = RT_RATE.has(metric), v = rtValue(a, metric, total), ok = v != null && (!rate || a[0] >= RT_ROUTE_MIN);
    const vals = [], sum = [0, 0, 0, 0, 0, 0];
    for (const m of pool) {
      const b = rtSum(m.tree, src);
      for (let i = 0; i < 6; i++) sum[i] += b[i];
      if (!rate || b[0] >= RT_ROUTE_MIN) vals.push(rtValue(b, metric, m.total));
    }
    const avg = rate ? rtValue(sum, metric, 0) : vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null;
    return { v, ok, pct:ok && vals.length >= 5 ? chartPct(vals, v) : null, avg };
  }
  // ---- end route tree math
  // Not in any public data: they need every route charted, which only paid vendors do.
  const RT_UNAVAILABLE = [['sep', 'Separation', 'no public per-route tracking'],
    ['win', 'Win rate', 'paid hand-charting only'], ['rr', 'Routes run', 'only targeted routes are public']];
  const RT_POS = ['WR', 'TE', 'RB'];
  const rtFmt = (v, m) => v == null ? '·' : m === 'share' ? `${(v * 100).toFixed(1)}%` : m === 'catch' ? `${Math.round(v * 100)}%`
    : m === 'epa' ? (v >= 0 ? '+' : '') + v.toFixed(2) : m === 'ypt' || m === 'air' ? v.toFixed(1) : String(v);
  const rtTotal = (C, v) => (v && v.R && v.R[0] ? v.R[0][C.fields.R.indexOf('tgt')] : 0);

  // The tree, drawn as the Data Suite draws it: receiver split left, ball to his
  // right, so inside is +x. Arrow width is targets, color the metric's percentile.
  function rtTree(C, sid, v, tree, metric, season) {
    const F = C.fields.R, all = v.R[0], total = all[F.indexOf('tgt')], pool = rtPool(C, v.p), f = (x) => x.toFixed(1);
    const mlabel = RT_METRICS.find(m => m[0] === metric)[1];
    const rows = RT_SPOKES.concat(RT_OTHER).map(sp => { const a = rtSum(tree, sp.src); return { sp, a, ...rtRate(pool, a, total, sp.src, metric) }; });
    const spokes = rows.slice(0, RT_SPOKES.length), other = rows.slice(RT_SPOKES.length);
    const charted = rows.reduce((s, r) => s + r.a[0], 0), maxT = Math.max(1, ...spokes.map(r => r.a[0]));
    const W = 340, H = 362, cx = 132, los = 334;
    // [path, point the last segment leaves from, tip, label x, label y, anchor]
    const geo = {
      GO:     [`M${cx} 150 L${cx} 66`, [cx, 150], [cx, 66], cx, 30, 'middle'],
      POST:   [`M${cx} 150 L${cx + 78} 78`, [cx, 150], [cx + 78, 78], cx + 88, 62, 'start'],
      CORNER: [`M${cx} 150 L${cx - 70} 82`, [cx, 150], [cx - 70, 82], cx - 74, 46, 'middle'],
      IN:     [`M${cx} 186 L${cx + 128} 186`, [cx, 186], [cx + 128, 186], cx + 137, 161, 'end'],
      OUT:    [`M${cx} 214 L${cx - 98} 214`, [cx, 214], [cx - 98, 214], 6, 190, 'start'],
      HITCH:  [`M${cx} 244 L${cx - 22} 266`, [cx, 244], [cx - 22, 266], cx - 34, 272, 'end'],
      SLANT:  [`M${cx} 300 L${cx + 70} 248`, [cx, 300], [cx + 70, 248], cx + 82, 240, 'start'],
      CROSS:  [`M${cx} 318 Q${cx + 44} 314 ${cx + 138} 300`, [cx + 44, 314], [cx + 138, 300], W - 6, 274, 'end'],
    };
    let s = `<svg class="chart-svg rt-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${chartEsc(`${v.n}, ${mlabel.toLowerCase()} by targeted route, ${season}`)}">`;
    for (let y = los - 46; y > 20; y -= 46) s += `<line class="rt-yard" x1="0" x2="${W}" y1="${y}" y2="${y}"/>`;
    s += `<line class="rt-los" x1="0" x2="${W}" y1="${los}" y2="${los}"/><text class="rt-mark" x="6" y="${los + 16}">LOS</text>`
      + `<text class="rt-mark" x="${W - 6}" y="${los + 16}" text-anchor="end">ball side →</text>`
      + `<line class="rt-stem" x1="${cx}" y1="${los}" x2="${cx}" y2="150"/>`;
    spokes.forEach((r, i) => {
      const [d, from, [ex, ey], lx, ly, anchor] = geo[r.sp.k], n = r.a[0];
      const col = !n || !r.ok ? 'var(--fg-3)' : r.pct != null ? locBand(r.pct) : 'var(--band-deep)';
      const w = n ? 2.5 + 8 * n / maxT : 1.5, len = Math.hypot(ex - from[0], ey - from[1]), ux = (ex - from[0]) / len, uy = (ey - from[1]) / len, hw = w / 2 + 3.5;
      const cap = !n ? 'no targets' : [r.pct != null ? chartOrd(r.pct) : r.ok ? null : 'DNQ', metric === 'tgt' ? null : `${n} tgt`].filter(Boolean).join(' · ');
      s += `<g class="rt-spoke${!n ? ' rt-ghost' : r.ok ? '' : ' rt-dnq'}" data-i="${i}" data-route="${r.sp.k}">`
        + `<path d="${d}" style="stroke:${col}" stroke-width="${f(w)}"${n && r.ok ? '' : ' stroke-dasharray="4 3"'}/>`
        + `<polygon points="${f(ex + ux * 9)},${f(ey + uy * 9)} ${f(ex - uy * hw)},${f(ey + ux * hw)} ${f(ex + uy * hw)},${f(ey - ux * hw)}" style="fill:${col}"/>`
        + `<text class="rt-lbl" x="${lx}" y="${ly}" text-anchor="${anchor}">${r.sp.label} <tspan class="rt-val" style="fill:${col}">${rtFmt(r.v, metric)}</tspan></text>`
        + `<text class="rt-cap" x="${lx}" y="${ly + 13}" text-anchor="${anchor}">${cap}</text></g>`;
    });
    s += `<circle class="rt-wr" cx="${cx}" cy="${los}" r="8"/></svg>`;
    const wrap = chartTipWrap(s, (i) => {
      const r = spokes[i], [n, rec, yds, td, epa, air] = r.a;
      return [`${r.sp.label}${r.sp.src.length > 1 ? ` (${r.sp.src.map(covTitle).join(' + ')})` : ''}`,
        n ? `${n} tgt, ${rec} rec, ${yds} yds, ${td} TD` : 'No targets on this route',
        n ? `${rtFmt(rec / n, 'catch')} catch, ${rtFmt(yds / n, 'ypt')} Y/Tgt, ${rtFmt(air / n, 'air')} air/tgt, ${rtFmt(epa / n, 'epa')} EPA/tgt` : null,
        r.pct != null ? `${mlabel}: ${chartOrd(r.pct)} percentile` : n && !r.ok ? `Under ${RT_ROUTE_MIN} targets, so not ranked` : null].filter(Boolean);
    });
    const at = (k) => all[F.indexOf(k)], per = (k, m) => rtFmt(total ? at(k) / total : null, m);
    return h('div', { class:'rt-body' },
      h('div', { class:'rt-head' }, headshot(sid, 36), h('span', { class:'rt-player' }, v.n), ' ', teamChip(v.t), h('span', { class:'muted' }, ` ${v.p}`)),
      h('div', { class:'rt-title' }, `${mlabel} by targeted route, ${season}`),
      h('div', { class:'loc-line tnum' }, [`${total} tgt`, `${charted} on a charted route`, `${per('rec', 'catch')} catch`, `${per('yds', 'ypt')} Y/Tgt`,
        `${per('air', 'air')} aDOT`, `${per('epa', 'epa')} EPA/tgt`, `${at('td')} TD`].join(' · ')),
      wrap,
      h('div', { class:'rt-other' }, h('span', { class:'muted' }, 'Off the tree: '),
        ...other.map(r => h('span', { class:'rt-chip', dataset:{ route:r.sp.k } }, `${r.sp.label} `, h('strong', { class:'tnum' }, rtFmt(r.v, metric)),
          r.a[0] ? h('span', { class:'muted tnum' }, ` ${[r.pct != null ? chartOrd(r.pct) : r.ok ? null : 'DNQ', metric === 'tgt' ? null : `${r.a[0]} tgt`].filter(Boolean).join(' · ')}`) : null))));
  }

  // One tile: its own player, season and metric. The picker lists every WR, TE
  // and RB with a charted route that season, most targets first.
  function rtTile(i, t, seasons, got, set) {
    const C = got(t.season), v = C.players[t.sid], tree = C.targetedRoutes[t.sid], ab = 'AB'[i];
    const opts = Object.entries(C.players).filter(([s, p]) => RT_POS.includes(p.p) && C.targetedRoutes[s])
      .map(([s, p]) => ({ s, label:`${p.n} ${p.t} ${p.p}`, n:rtTotal(C, p) })).sort((a, b) => b.n - a.n);
    const pick = (text, exact) => {
      const q = String(text || '').trim().toLowerCase(), has = (fn) => opts.find(o => fn(o.label.toLowerCase()));
      const o = q && (has(l => l === q) || (!exact && (has(l => l.startsWith(q)) || has(l => l.includes(q)))));
      if (o && o.s !== t.sid) set({ sid:o.s });
    };
    const card = h('div', { class:'card rt-tile', dataset:{ tile:ab, sid:String(t.sid || ''), season:String(t.season), metric:t.metric } },
      h('div', { class:'stats-lab-row rt-ctl' },
        h('input', { type:'search', class:'rt-find', list:`rt-players-${i}`, 'aria-label':`Tile ${ab} player`, placeholder:'Find a receiver',
          oninput:(e) => pick(e.target.value, true), onchange:(e) => pick(e.target.value, false) }),
        h('datalist', { id:`rt-players-${i}` }, ...opts.map(o => h('option', { value:o.label }, `${o.n} tgt`))),
        h('span', { class:'sos-position-tabs rt-seasons', role:'group', 'aria-label':`Tile ${ab} season` }, ...seasons.map(y => {
          const on = got(y).published;
          return h('button', { type:'button', class:`ghost${y === t.season ? ' active' : ''}`, 'aria-pressed':String(y === t.season), disabled:on ? null : '',
            title:on ? null : `nflverse has not posted ${y} participation charting yet`, onclick:() => set({ season:y }) }, String(y));
        })),
        h('label', { class:'stats-lab-toggle' }, 'Metric ', h('select', { 'aria-label':`Tile ${ab} metric`, onchange:(e) => set({ metric:e.target.value }) },
          ...RT_METRICS.map(([k, l]) => h('option', { value:k, selected:k === t.metric }, l)),
          h('optgroup', { label:'Needs paid charting' }, ...RT_UNAVAILABLE.map(([k, l, why]) => h('option', { value:k, disabled:'' }, `${l}: unavailable, ${why}`)))))));
    if (v && v.R && tree) card.appendChild(rtTree(C, t.sid, v, tree, t.metric, t.season));
    else {
      const known = seasons.map(got).find(c => c.players && c.players[t.sid]);
      card.appendChild(h('div', { class:'muted rt-none' }, `${known ? known.players[t.sid].n : 'This player'} has no targeted route charted in ${t.season}. Pick another season or player.`));
    }
    return card;
  }

  // Route compare: both tiles' players on one metric, route by route, against
  // the average of their position that season.
  function rtCompare(res, metric, onMetric) {
    const cols = res.map(x => ({ ...x, pool:rtPool(x.C, x.v.p), total:rtTotal(x.C, x.v) }));
    const same = cols[0].t.season === cols[1].t.season && cols[0].v.p === cols[1].v.p, above = [0, 0];
    const nm = (c) => `${chartShort(c.v.n)} ${c.t.season}`, avgs = same ? cols.slice(0, 1) : cols;
    const body = RT_SPOKES.map(sp => {
      const rs = cols.map(c => rtRate(c.pool, rtSum(c.tree, sp.src), c.total, sp.src, metric));
      const up = (r) => r.ok && r.avg != null && r.v > r.avg;
      rs.forEach((r, k) => { if (up(r)) above[k]++; });
      return h('tr', { dataset:{ route:sp.k } }, h('th', { scope:'row' }, sp.label),
        ...rs.map(r => h('td', { class:`right tnum${r.ok ? up(r) ? ' rt-above' : '' : r.v == null ? ' muted' : ' rt-dnq'}`, title:r.ok || r.v == null ? null : `Under ${RT_ROUTE_MIN} targets, so not ranked` },
          rtFmt(r.v, metric), up(r) ? ' ▲' : '')),
        ...(same ? rs.slice(0, 1) : rs).map(r => h('td', { class:'right tnum muted' }, rtFmt(r.avg, metric))));
    });
    return h('div', { class:'card rt-cmp' },
      h('div', { class:'stats-lab-row' }, h('span', { class:'chart-title' }, 'Route compare'),
        h('label', { class:'stats-lab-toggle' }, 'Metric ', h('select', { 'aria-label':'Compare metric', onchange:(e) => onMetric(e.target.value) },
          ...RT_METRICS.map(([k, l]) => h('option', { value:k, selected:k === metric }, l))))),
      h('div', { class:'tbl-scroll' }, h('table', { class:'data rt-cmp-table' },
        h('thead', null, h('tr', null, h('th', null, 'Targeted route'), ...cols.map((c, k) => h('th', { class:'right' },
          h('span', { class:'chart-swatch', style:{ borderTopColor:CHART_SERIES[k][0], borderTopStyle:CHART_SERIES[k][1] ? 'dashed' : 'solid' } }), nm(c))),
          ...avgs.map(c => h('th', { class:'right' }, `${c.v.p} avg${same ? '' : ` ${c.t.season}`}`)))),
        h('tbody', null, ...body))),
      h('div', { class:'tip' }, `▲ above the average: ${nm(cols[0])} ${above[0]} of 8, ${nm(cols[1])} ${above[1]} of 8. `
        + (RT_RATE.has(metric) ? `Grey italic is under ${RT_ROUTE_MIN} targets on the route, so not ranked. ` : '')
        + `The average is over ${same ? `${cols[0].v.p}s` : "each player's position"} with ${RT_POOL_MIN}+ targets that season${RT_RATE.has(metric) ? ', pooled over their targets on the route' : ''}.`));
  }

  const RT_TRIED = new Set();
  function statsRoutes(main, prefs, cur) {
    const SEASONS = [cur - 3, cur - 2, cur - 1, cur], got = (y) => (window.COVERAGE_BY_SEASON || {})[y];
    const need = SEASONS.filter(y => !got(y) && !RT_TRIED.has(y));
    if (need.length) {
      need.forEach(y => RT_TRIED.add(y));
      const msg = h('div', { class:'empty' }, 'Loading targeted routes...');
      main.appendChild(msg);
      Promise.allSettled(need.map(loadCoverageSeason)).then(() => { if (msg.isConnected) viewStats('Routes'); });
      return;
    }
    const have = SEASONS.filter(got), pub = have.filter(y => got(y).published), later = have.filter(y => !got(y).published);
    if (!pub.length) { main.appendChild(h('div', { class:'empty' }, 'No targeted routes on the page. Run projections/build_coverage_splits.py.')); return; }
    const span = pub.length > 1 ? `${pub[0]} to ${pub[pub.length - 1]}` : String(pub[0]), newest = pub[pub.length - 1], N = got(newest);
    const topWr = Object.keys(N.targetedRoutes).filter(s => (N.players[s] || {}).p === 'WR').sort((a, b) => rtTotal(N, N.players[b]) - rtTotal(N, N.players[a]));
    const R = prefs.routes = Object.assign({ cmp:'share' }, prefs.routes);
    const save = () => { saveStatsLabPrefs(prefs); viewStats('Routes'); };
    // Defaults: the two most-targeted WRs of the newest season. A tile with no
    // season (the player card's link) opens on the newest one he has a tree in.
    const tiles = [0, 1].map(i => {
      const t = Object.assign({ metric:'share' }, (R.tiles || [])[i]);
      if (!t.sid) { t.sid = topWr[i]; t.season = newest; }
      if (!pub.includes(t.season)) t.season = pub.slice().reverse().find(y => got(y).targetedRoutes[t.sid]) ?? newest;
      if (!RT_METRICS.some(m => m[0] === t.metric)) t.metric = 'share';
      return t;
    });
    R.tiles = tiles;
    main.appendChild(h('div', { class:'tip rt-span' }, h('strong', null, `Targeted routes, ${span} regular seasons. `),
      later.length ? `${later.join(', ')} appears the first build after nflverse posts its participation charting. ` : '',
      'Each tile picks its own player, season and metric: two players side by side, or one player in two seasons.'));
    main.appendChild(h('div', { class:'rt-tiles' }, ...tiles.map((t, i) => rtTile(i, t, have, got, (patch) => { Object.assign(t, patch); save(); }))));
    const res = tiles.map(t => { const C = got(t.season), v = C.players[t.sid], tree = C.targetedRoutes[t.sid]; return v && v.R && tree ? { t, C, v, tree } : null; });
    if (res.every(Boolean)) main.appendChild(rtCompare(res, RT_METRICS.some(m => m[0] === R.cmp) ? R.cmp : 'share', (m) => { R.cmp = m; save(); }));
    main.appendChild(h('div', { class:'tip rt-foot' },
      `Targeted routes, not routes run: nflverse participation charts the route only for the receiver the ball went to. Target share is over all his targets, charted route or not. `
      + `Arrow width is targets; color is the metric's percentile among players at his position with ${RT_POOL_MIN}+ targets that season (${LOC_LEGEND}). `
      + `A rate needs ${RT_ROUTE_MIN}+ targets on the route or it reads DNQ. Out is quick out plus deep out. `
      + `Not here: separation, route win rate and routes run by route (so route share, TPRR and YPRR by route), which need every route charted and only paid vendors chart that.`));
  }

  // The player card's link: tile A becomes this player, on his newest tree.
  // The card's own close button, so its key handlers go with it.
  function rtOpenFor(sid) {
    const p = statsLabPrefs(), R = p.routes = p.routes || {};
    R.tiles = [{ ...((R.tiles || [])[0] || {}), sid:String(sid), season:null }, (R.tiles || [])[1]].filter(Boolean);
    saveStatsLabPrefs(p);
    const x = document.querySelector('.modal-backdrop .close-btn');
    if (x) x.click();
    if (location.hash === '#stats/Routes') viewStats('Routes');   // opened from Cmd+K on this page: no hashchange
  }

  // ---- on/off math
  // One side of a split from its T counts (see build_onoff.py): rates per play, null when empty.
  const ooDiv = (a, b) => b > 0 ? a / b : null;
  function ooSide(v, T) {
    const at = (k) => v[T.indexOf(k)], n = at('plays');
    return { plays:n, epa:ooDiv(at('epa'), n), pass:ooDiv(at('pass'), n), succ:ooDiv(at('succ'), n), db:at('db'), tgt:at('tgt') };
  }
  // Off is the team total minus on, so the two sides always add back to the team.
  function ooSplit(team, v, T) {
    return { on:ooSide(v.v, T), off:ooSide(team.tot.map((x, k) => x - v.v[k]), T) };
  }
  // Each teammate with a target: share of the team's targets on each side, and targets
  // per dropback over the dropbacks he was on the field for (team dropbacks in games he
  // played, at game level).
  function ooMates(team, v, T) {
    const ti = T.indexOf('tgt'), tOn = v.v[ti], tOff = team.tot[ti] - tOn;
    return Object.entries(v.m).map(([pid, [tg, db]]) => {
      const [TG, DB] = team.r[pid] || [tg, db], tgOff = TG - tg, dbOff = DB - db;
      return { pid, tgtOn:tg, tgtOff:tgOff, dbOn:db, dbOff, shareOn:ooDiv(tg, tOn), shareOff:ooDiv(tgOff, tOff),
        tpdbOn:ooDiv(tg, db), tpdbOff:ooDiv(tgOff, dbOff) };
    });
  }
  // Game splits: one row per player across the groups, most PPR first; a cell is
  // { g, ppg, share } for the games he played in that group, or null.
  function ooGroupRows(groups) {
    const ids = [...new Set(groups.flatMap(g => Object.keys(g.P)))];
    return ids.map(pid => {
      const cells = groups.map(g => { const a = g.P[pid]; return a ? { g:a[0], ppg:ooDiv(a[1], a[0]), share:ooDiv(a[2], g.tgt), pts:a[1] } : null; });
      return { pid, cells, pts:cells.reduce((s, c) => s + (c ? c.pts : 0), 0) };
    }).filter(r => r.cells.some(c => c && (c.pts || c.share))).sort((a, b) => b.pts - a.pts);
  }
  // ---- end on/off math

  const loadOnOffSeason = (year) => loadSeasonScript(`onoff-${year}.js`, () => (window.ONOFF_BY_SEASON || {})[year]);
  const ooSigned = (v, f) => v == null ? '' : `${v > 0 ? '+' : ''}${statFmt(v, f)}`;

  // On/Off tab. sub 'games' is the Game splits view (#stats/OnOff/games).
  function statsOnOff(main, prefs, cur, sub) {
    const SEASONS = [cur - 3, cur - 2, cur - 1, cur], got = (y) => (window.ONOFF_BY_SEASON || {})[y];
    const O = prefs.onoff = Object.assign({}, prefs.onoff), games = sub === 'games';
    // No season picked: the last full season, which has true play-level on/off.
    const season = SEASONS.includes(O.season) ? O.season : cur - 1;
    const rerender = () => viewStats('OnOff', games ? 'games' : undefined);
    const set = (patch) => { Object.assign(O, patch); saveStatsLabPrefs(prefs); rerender(); };
    const seg = (label, items) => h('span', { class:'sos-position-tabs', role:'group', 'aria-label':label },
      ...items.map(([on, text, onclick, data]) => h('button', { type:'button', class:`ghost${on ? ' active' : ''}`, 'aria-pressed':String(on), onclick, dataset:data }, text)));
    const ctl = h('div', { class:'card stats-lab-filters oo-ctl' },
      seg('On/Off view', [[!games, 'Player on/off', () => { location.hash = '#stats/OnOff'; }, { view:'onoff' }],
        [games, 'Game splits', () => { location.hash = '#stats/OnOff/games'; }, { view:'games' }]]),
      seg('Season', SEASONS.map(y => [y === season, String(y), () => set({ season:y }), { season:String(y) }])));
    main.appendChild(ctl);
    const F = got(season);
    if (!F) {
      const msg = h('div', { class:'empty' }, `Loading ${season} on/off...`);
      main.appendChild(msg);
      loadOnOffSeason(season).then(() => { if (msg.isConnected) rerender(); })
        .catch(() => { msg.textContent = `onoff-${season}.js did not load. Run projections/build_onoff.py.`; });
      return;
    }
    const N = F.names, nm = (pid) => (N[pid] || [pid])[0], ps = (pid) => (N[pid] || [])[1] || '';
    const small = F.smallSample, isGame = F.level === 'game';
    const opts = Object.entries(F.teams).flatMap(([tm, t]) => Object.entries(t.on).map(([pid, v]) => ({ tm, pid, v, n:(t.r[pid] || [0])[0], label:`${nm(pid)} ${tm} ${ps(pid)}` })))
      .sort((a, b) => b.n - a.n || b.v.s - a.v.s);
    const pick = opts.find(o => o.pid === O.sid && o.tm === O.team) || opts.find(o => o.pid === O.sid) || opts[0];

    if (games) {
      const teams = Object.keys(F.teams).sort(), tm = teams.includes(O.team) ? O.team : pick ? pick.tm : teams[0];
      ctl.appendChild(h('label', { class:'stats-lab-toggle' }, 'Team ', h('select', { 'aria-label':'Team', onchange:(e) => set({ team:e.target.value }) },
        ...teams.map(t => h('option', { value:t, selected:t === tm }, t)))));
      const t = F.teams[tm], td = (text, cls) => h('td', { class:`right tnum${cls ? ` ${cls}` : ''}` }, text);
      for (const [key, title, lab] of [['qb', 'By starting QB', (g) => nm(g.id)], ['pc', 'By playcaller', (g) => g.id]]) {
        const gs = t[key] || [], rows = ooGroupRows(gs), sm = (g) => g.pl < small ? ' oo-small' : '';
        const sums = [['Games', (g) => String(g.g)], ['Plays', (g) => String(g.pl)], ['EPA/play', (g) => statFmt(ooDiv(g.epa, g.pl), 'dec2')],
          ['PROE', (g) => ooSigned(g.proe, 'pct')]];
        const tbl = h('table', { class:'data oo-gs', dataset:{ kind:key } },
          h('thead', null,
            h('tr', null, h('th', { rowspan:'2' }, 'Player'), ...gs.map(g => h('th', { colspan:'3', scope:'colgroup', class:`oo-grp${sm(g)}` },
              lab(g), key === 'pc' && gs.length > 1 ? h('span', { class:'oo-flag' }, ` wk ${g.w[0]}-${g.w[1]}`) : null,
              g.pl < small ? h('span', { class:'oo-flag' }, ` under ${small} plays`) : null))),
            h('tr', null, ...gs.flatMap(() => [h('th', { class:'right' }, 'G'), h('th', { class:'right' }, 'PPR/G'), h('th', { class:'right' }, 'Tgt%')]))),
          h('tbody', null,
            ...sums.map(([l, f]) => h('tr', { class:'oo-sum' }, h('th', { scope:'row' }, l), ...gs.map(g => h('td', { colspan:'3', class:`right tnum${sm(g)}` }, f(g))))),
            ...rows.map(r => h('tr', { class:'clickable', dataset:{ pid:r.pid }, onclick:() => openPlayerDetail(nm(r.pid), r.pid) },
              h('th', { scope:'row' }, `${nm(r.pid)} `, h('span', { class:'muted' }, ps(r.pid))),
              ...r.cells.flatMap((c, i) => c ? [td(String(c.g), sm(gs[i]).trim()), td(statFmt(c.ppg, 'dec1'), sm(gs[i]).trim()), td(statFmt(c.share, 'pct'), sm(gs[i]).trim())]
                : [td('', 'muted'), td('', 'muted'), td('', 'muted')])))));
        main.appendChild(h('div', { class:'card oo-card', dataset:{ kind:key } }, h('div', { class:'card-title' }, `${title}, ${tm} ${season}`), h('div', { class:'tbl-scroll' }, tbl)));
      }
      main.appendChild(h('div', { class:'tip oo-foot' },
        `Starting QB is the passer with the most dropbacks that game. Playcaller comes from the play-caller table, switched mid-season only where its notes name the week he was fired. `
        + `PPR/G is full PPR over the games he played in that group; Tgt% is his share of the team's targets in those games. PROE is pass rate over expected in neutral situations (win probability 20-80%, outside the last two minutes of a half). `
        + `Grey italic is a group under ${small} plays. Regular season through week ${F.splitsThroughWeek}, from nflverse play-by-play.`));
      saveStatsLabPrefs(prefs);
      return;
    }

    if (!pick) { main.appendChild(h('div', { class:'empty' }, `No player has ${F.minSnaps}+ offensive snaps in ${season} yet.`)); return; }
    const find = (text, exact) => {
      const q = String(text || '').trim().toLowerCase(), has = (fn) => opts.find(o => fn(o.label.toLowerCase()));
      const o = q && (has(l => l === q) || (!exact && (has(l => l.startsWith(q)) || has(l => l.includes(q)))));
      if (o && !(o.pid === pick.pid && o.tm === pick.tm)) set({ sid:o.pid, team:o.tm });
    };
    ctl.appendChild(h('input', { type:'search', class:'oo-find', list:'oo-players', 'aria-label':'Player', placeholder:'Find a player',
      oninput:(e) => find(e.target.value, true), onchange:(e) => find(e.target.value, false) }));
    ctl.appendChild(h('datalist', { id:'oo-players' }, ...opts.map(o => h('option', { value:o.label }))));
    const t = F.teams[pick.tm], v = pick.v, sp = ooSplit(t, v, F.T), offG = isGame ? t.games - v.g : null;
    if (O.sid && O.sid !== pick.pid) ctl.appendChild(h('span', { class:'muted' }, `Your pick has under ${F.minSnaps} snaps for any team in ${season}, so this is ${nm(pick.pid)}.`));
    main.appendChild(h('div', { class:'card oo-head', dataset:{ sid:pick.pid, team:pick.tm, season:String(season), level:F.level } },
      h('div', { class:'rt-head' }, h('span', { class:'rt-player' }, nm(pick.pid)), teamChip(pick.tm), h('span', { class:'muted' }, `${ps(pick.pid)}, ${season}`),
        isGame ? h('span', { class:'badge oo-level' }, 'Game level') : null),
      h('div', null, isGame ? `${v.g} of ${t.games} games with him (${Math.round(F.gamePct * 100)}%+ of the offensive snaps), ${offG} without. ${v.s} offensive snaps.`
        : `${v.s} team plays with him on the field, ${sp.off.plays} with him off, over ${t.games} games.`),
      isGame ? h('div', { class:'tip' }, F.note, offG ? '' : ' No game without him yet, so the off side is empty until he misses one.') : null));

    const side = (label, s) => h('tr', { class:s.plays < small ? 'oo-small' : '' },
      h('th', { scope:'row' }, label, s.plays < small ? h('span', { class:'oo-flag' }, ` under ${small} plays`) : null),
      h('td', { class:'right tnum' }, String(s.plays)), h('td', { class:'right tnum' }, statFmt(s.epa, 'dec2')),
      h('td', { class:'right tnum' }, statFmt(s.pass, 'pct')), h('td', { class:'right tnum' }, statFmt(s.succ, 'pct')));
    const d = (k) => sp.on[k] != null && sp.off[k] != null ? sp.on[k] - sp.off[k] : null;
    const tone = (x, big) => x == null ? '' : x >= big ? ' oo-up' : x <= -big ? ' oo-down' : '';
    main.appendChild(h('div', { class:'card oo-card' }, h('div', { class:'card-title' }, `${pick.tm} offense with ${nm(pick.pid)} on and off`),
      h('div', { class:'tbl-scroll' }, h('table', { class:'data oo-team' },
        h('thead', null, h('tr', null, h('th', null, isGame ? 'Games' : 'Field'), ...[['Plays', 'Team plays on this side.'], ['EPA/play', 'Expected points added per play.'],
          ['Pass rate', 'Pass attempts per play, sacks in and scrambles out, as the Teams tab.'], ['Success%', 'Share of plays with positive EPA.']]
          .map(([l, desc]) => h('th', { class:'right', title:desc }, l)))),
        h('tbody', null, side(isGame ? `With him (${v.g} g)` : 'On the field', sp.on), side(isGame ? `Without him (${offG} g)` : 'Off the field', sp.off),
          h('tr', { class:'oo-diff' }, h('th', { scope:'row' }, 'On minus off'), h('td', { class:'right tnum muted' }, ''),
            h('td', { class:`right tnum${tone(d('epa'), 0.05)}` }, ooSigned(d('epa'), 'dec2')), h('td', { class:'right tnum' }, ooSigned(d('pass'), 'pct')),
            h('td', { class:`right tnum${tone(d('succ'), 0.02)}` }, ooSigned(d('succ'), 'pct'))))))));

    const flag = (x) => x < small ? ' oo-small' : '';
    const gap = (x, big) => x == null ? '' : x >= big ? 'oo-up' : x <= -big ? 'oo-down' : '';
    const who = nm(pick.pid), dbWord = isGame ? 'team dropbacks in the games both played' : 'dropbacks both were on the field for';
    const rows = ooMates(t, v, F.T).map(r => ({ ...r, _label:`${nm(r.pid)} ${ps(r.pid)}`, _sid:r.pid,
      dShare:r.shareOn != null && r.shareOff != null ? r.shareOn - r.shareOff : null, dTpdb:r.tpdbOn != null && r.tpdbOff != null ? r.tpdbOn - r.tpdbOff : null }));
    const C = (key, label, fmt, desc, tone) => ({ key, label, get:(r) => r[key], fmt, desc, tone });
    const cols = [
      C('shareOn', 'Tgt% on', 'pct', `His share of the team's targets with ${who} ${isGame ? 'playing' : 'on the field'}.`, () => flag(sp.on.plays).trim()),
      C('shareOff', 'Tgt% off', 'pct', `His share of the team's targets with ${who} ${isGame ? 'out' : 'off the field'}.`, () => flag(sp.off.plays).trim()),
      C('dShare', 'Tgt% +/-', 'pct', `Target share on minus off. Green means he draws more of the looks with ${who} on.`, (r) => `${gap(r.dShare, 0.02)}${flag(Math.min(sp.on.plays, sp.off.plays))}`),
      C('tpdbOn', 'Tgt/DB on', 'pct', `Targets per ${dbWord.replace('both', `he and ${who}`)}: the charted stand-in for targets per route run.`, (r) => flag(r.dbOn).trim()),
      C('tpdbOff', 'Tgt/DB off', 'pct', `Targets per dropback he played with ${who} ${isGame ? 'out' : 'off the field'}.`, (r) => flag(r.dbOff).trim()),
      C('dTpdb', 'Tgt/DB +/-', 'pct', 'Targets per dropback on minus off.', (r) => `${gap(r.dTpdb, 0.02)}${flag(Math.min(r.dbOn, r.dbOff))}`),
      C('tgtOn', 'Tgt on', 'int', `Targets with ${who} on.`), C('tgtOff', 'Tgt off', 'int', `Targets with ${who} off.`),
      C('dbOn', 'DB on', 'int', `Sample: ${dbWord} with ${who} on.`), C('dbOff', 'DB off', 'int', `Sample: ${isGame ? 'team dropbacks in games he played' : 'dropbacks he was on the field for'} with ${who} off.`)];
    const kept = prefs.sort && prefs.sort.OnOff;
    if (kept && !cols.some(c => c.key === kept.key)) delete prefs.sort.OnOff;
    statsTable(main, prefs, 'OnOff', rows, cols, { key:'tgtOn', dir:'desc' }, `Teammates, ${pick.tm} ${season}`, (r) => openPlayerDetail(nm(r.pid), r.pid));
    main.appendChild(h('div', { class:'tip oo-foot' },
      `${rows.length} teammates with a target. Grey italic is a small sample: a side under ${small} plays (team rows and target share) or ${small} dropbacks (Tgt/DB). `
      + (isGame ? `${F.note} ` : 'Every charted regular-season pass or run play is on one side or the other, so on plus off is the team total. ')
      + `Players need ${F.minSnaps}+ offensive snaps for the team. Source: ${F.source}.`));
    saveStatsLabPrefs(prefs);
  }

  // This week's opponent, as a defense-vs-position line for the player card.
  function matchupLine(sleeper) {
    const D = window.DEFENSE;
    if (!D || !sleeper || !['WR', 'TE', 'RB', 'QB'].includes(sleeper.pos)) return null;
    const g = gameWeatherFor(sleeper.team);
    if (!g) return null;
    const mine = sleeper.team === 'LAR' ? 'LA' : sleeper.team;
    let opp = g.home === mine ? g.away : g.home;
    if (opp === 'LA') opp = 'LAR';
    const t = D.teams[opp];
    if (!t) return null;
    const bits = [];
    for (const slice of ['cur', 'prior']) {
      const v = t[slice];
      if (!v) continue;
      const tag = slice === 'cur' ? `${D.season} wk 1-${D.throughWeek}` : `${D.prior}`;
      if (sleeper.pos === 'QB') bits.push(`${tag}: ${statFmt(v.pass.epa_per_dropback, 'dec2')} EPA/dropback allowed, ${statFmt(v.pass.pressure_rate, 'pct')} pressure`);
      else {
        const b = v.byPos && v.byPos[sleeper.pos];
        if (b) bits.push(`${tag}: ${Number(b.ppr_pg).toFixed(1)} PPR/G to ${sleeper.pos}s (#${b.rank} of 32 softest)`
          + (sleeper.pos === 'RB' && v.rushRB ? `, ${Number(v.rushRB.ppr_pg).toFixed(1)} rushing` : ''));
      }
    }
    if (!bits.length) return null;
    return h('div', { class:'card weather-line' },
      h('div', { class:'card-title' }, `Matchup: ${opp} defense`),
      h('div', null, bits.join('. ') + '.'),
      t.cur && t.cur.funnel ? h('div', { class:'tip' }, `${D.season}: ${t.cur.funnel}.`) : null,
      // The card's own close button, so its key handlers go before the page changes.
      h('a', { href:`#game/${g.game_id}`, class:'gm-card-link', onclick:() => document.querySelector('.modal-backdrop .close-btn')?.click() },
        `${gameTeam(g.away)} @ ${gameTeam(g.home)} game page`));
  }

  // Usage by week on the player card, from window.USAGE_WEEKLY.
  function usageWeeksBlock(sleeper) {
    const U = window.USAGE_WEEKLY;
    const me = sleeper && U && U.players[String(sleeper.id)];
    if (!me || !(me.w || []).length) return null;
    const F = U.fields, ix = (k) => F.indexOf(k);
    const cols = [['snap_pct', 'Snap%'], ['route_rate_est', 'Route% (est)'], ['target_share', 'Tgt%'],
                  ['first_read_share', '1st-read%'], ['rush_share', 'Rush%'], ['rz_opp_share', 'RZ opp%']];
    return h('div', { class:'card adv-card' },
      h('div', { class:'card-title' }, 'Usage by week'),
      h('table', { class:'data adv-log' },
        h('thead', null, h('tr', null, h('th', null, 'Wk'), ...cols.map(([k, l]) => h('th', { class:'right', title:U.fieldDesc[k] || '' }, l)))),
        h('tbody', null, ...me.w.map(row => h('tr', null, h('td', { class:'tnum' }, String(row[ix('week')])),
          ...cols.map(([k]) => h('td', { class:'right tnum' }, row[ix(k)] == null ? '' : statFmt(row[ix(k)], 'pct'))))))),
      (me.flags || []).length ? h('div', { class:`tip ${me.flags.includes('role_up') ? 'delta-up' : 'delta-down'}` },
        me.flags.includes('role_up') ? 'Role growing week over week.' : 'Role shrinking week over week.') : null);
  }

  // The research tools for one Stats Lab tab, behind one disclosure so a phone
  // sees a single line until it asks for more. Every action writes the tab's
  // state and re-renders through save().
  function statsToolsPanel({ prefs, tab, pos, isTeams, ordered, isVis, pool, A, exprKeys, save }) {
    const numeric = ordered.filter(c => c.fmt !== 'text');
    const labelOf = (k) => (ordered.find(c => c.key === k) || { label:k }).label;
    const colSel = (label) => h('select', { 'aria-label':label }, ...numeric.map(c => h('option', { value:c.key }, c.label)));
    const numIn = (label, value, extra) => h('input', { type:'number', step:'any', inputmode:'decimal', 'aria-label':label,
      value:value == null ? '' : String(value), ...extra });
    const readNum = (el) => el.value.trim() === '' || !isFinite(Number(el.value)) ? null : Number(el.value);
    const btn = (text, onclick, extra) => h('button', { type:'button', onclick, ...extra }, text);
    const chip = (text, onRemove) => h('span', { class:'stats-lab-chip' }, text,
      btn('×', onRemove, { class:'ghost', 'aria-label':`Remove ${text}` }));
    const section = (title, ...kids) => h('div', { class:'stats-lab-tool' }, h('div', { class:'stats-lab-tool-title' }, title), ...kids);

    // Columns: finder, show or hide, reorder, snapshot, remove a custom one.
    const move = (key, dir) => {
      const keys = ordered.map(c => c.key), i = keys.indexOf(key);
      let j = i + dir;
      while (j >= 0 && j < keys.length && !isVis(ordered[j])) j += dir;   // step past hidden neighbours
      if (j < 0 || j >= keys.length) return;
      keys.splice(i, 1); keys.splice(j, 0, key);
      tab.order = keys; save();
    };
    const snap = (c) => {
      const vals = {};
      for (const r of pool) if (typeof r[c.key] === 'number') vals[r._key] = Math.round(r[c.key] * 1e4) / 1e4;
      tab.seq = (tab.seq || 0) + 1;
      tab.snaps = [...(tab.snaps || []), { id:tab.seq, label:`${c.label} ${A.splitLabel || A.season}`, fmt:c.fmt, lowerBetter:!!c.lowerBetter, vals,
        desc:A.splitLabel ? `${c.label} frozen from ${A.splitLabel}. It stays put when filters or the split change.`
          : `${c.label} frozen from ${A.season} through week ${A.throughWeek}. It stays put when filters or the season change.` }];
      save();
    };
    const drop = (c) => {
      if (c.custom === 'snap') tab.snaps = (tab.snaps || []).filter(s => s.id !== c.id);
      else tab.calcs = (tab.calcs || []).filter(x => x.id !== c.id);
      for (const o of [tab.min, tab.cond, tab.vis]) if (o) delete o[c.key];
      save();
    };
    const list = h('div', { class:'stats-lab-cols' }, ...ordered.map(c => h('div', { class:'stats-lab-col', dataset:{ find:`${c.label} ${c.key}`.toLowerCase() } },
      h('label', null,
        h('input', { type:'checkbox', checked:isVis(c), onchange:(e) => { tab.vis = Object.assign({}, tab.vis, { [c.key]:e.target.checked }); save(); } }),
        h('span', { class:'stats-lab-col-name' }, c.label), h('code', null, c.key)),
      btn('↑', () => move(c.key, -1), { class:'ghost', title:'Move left in the table', 'aria-label':`Move ${c.label} left` }),
      btn('↓', () => move(c.key, 1), { class:'ghost', title:'Move right in the table', 'aria-label':`Move ${c.label} right` }),
      c.fmt === 'text' ? null : btn('Snap', () => snap(c), { class:'ghost', title:'Freeze the current values as a new column', 'aria-label':`Snapshot ${c.label}` }),
      c.custom ? btn('Remove', () => drop(c), { class:'ghost', 'aria-label':`Remove ${c.label}` }) : null)));
    const filterList = () => {
      const q = STATS_COL_FIND.trim().toLowerCase();
      for (const row of list.children) row.hidden = !!q && !row.dataset.find.includes(q);
    };
    filterList();
    const find = h('input', { type:'search', class:'stats-lab-find', placeholder:'Find a column', 'aria-label':'Find a column', value:STATS_COL_FIND,
      oninput:(e) => { STATS_COL_FIND = e.target.value; filterList(); },
      // Enter toggles the first match, so "find it, flip it" needs no mouse.
      onkeydown:(e) => { if (e.key !== 'Enter') return; e.preventDefault(); const first = [...list.children].find(r => !r.hidden); if (first) first.querySelector('input').click(); } });

    // Minimum qualifier on any numeric column.
    const minCol = colSel('Column for the minimum'), minVal = numIn('Minimum value');
    // User highlight rules.
    const cfCol = colSel('Column to highlight'), cfVal = numIn('Highlight value');
    const cfOp = h('select', { 'aria-label':'Highlight rule' },
      ...[['gt', 'above'], ['lt', 'below'], ['top', 'highest N%'], ['bot', 'lowest N%']].map(([v, l]) => h('option', { value:v }, l)));
    const ruleText = (r) => r.op === 'gt' ? `> ${r.v}` : r.op === 'lt' ? `< ${r.v}` : `${r.op === 'top' ? 'top' : 'bottom'} ${r.v}%`;
    // Calculated columns.
    const calcName = h('input', { type:'text', placeholder:'Name', 'aria-label':'Calculated column name', maxlength:'24' });
    const example = { QB:'ypa - pass_adot', RB:'targets / carries', WR:'air_yds / targets', TE:'air_yds / targets', Teams:'epa_pass - epa_rush' }[pos];
    const calcExpr = h('input', { type:'text', class:'stats-lab-expr', 'aria-label':'Calculated column expression', spellcheck:'false', autocapitalize:'off', autocomplete:'off',
      placeholder:`e.g. ${example && statsExprCompile(example, exprKeys).fn ? example : 'key / key'}` });
    const calcErr = h('div', { class:'stats-lab-err', 'aria-live':'polite' });
    const addCalc = () => {
      const expr = calcExpr.value.trim(), cx = statsExprCompile(expr, exprKeys);
      if (cx.error) { calcErr.textContent = cx.error; return; }
      tab.seq = (tab.seq || 0) + 1;
      tab.calcs = [...(tab.calcs || []), { id:tab.seq, label:(calcName.value.trim() || expr).slice(0, 24), expr }];
      save();
    };
    // Saved views: everything this tab remembers, under a name.
    const views = statsViews();
    const viewName = h('input', { type:'text', placeholder:'View name', 'aria-label':'View name', maxlength:'40' });
    const sk = `${pos} split`;
    const viewState = () => JSON.parse(JSON.stringify({ groups:(prefs.groups || {})[pos], sort:(prefs.sort || {})[pos], minSnap:prefs.minSnap, tab,
      split:isTeams ? undefined : prefs.split, splitGroups:(prefs.groups || {})[sk], splitSort:(prefs.sort || {})[sk] }));
    const loadView = (v) => {
      const s = v.state || {};
      prefs.groups = Object.assign({}, prefs.groups, { [pos]:s.groups });
      prefs.sort = Object.assign({}, prefs.sort, { [pos]:s.sort });
      // A view saved before splits existed leaves the current split alone.
      if (s.split) {
        prefs.split = s.split;
        prefs.groups[sk] = s.splitGroups;
        prefs.sort[sk] = s.splitSort;
      }
      if (typeof s.minSnap === 'number') prefs.minSnap = s.minSnap;
      prefs.tab[pos] = JSON.parse(JSON.stringify(s.tab || {}));
      save();
    };

    const bio = tab.bio || {};
    const setBio = (k, i) => (e) => {
      const next = [...((tab.bio && tab.bio[k]) || [null, null])];
      next[i] = readNum(e.target);
      tab.bio = Object.assign({}, tab.bio, { [k]:next });
      save();
    };
    const active = Object.keys(tab.min || {}).length + Object.keys(tab.cond || {}).length
      + (tab.snaps || []).length + (tab.calcs || []).length
      + (isTeams ? 0 : STATS_BIO.filter(([k]) => (bio[k] || []).some(v => v != null)).length);

    return h('details', { class:'card stats-lab-tools', open:STATS_TOOLS_OPEN ? '' : null, ontoggle:(e) => { STATS_TOOLS_OPEN = e.target.open; } },
      h('summary', null, 'Tools', active ? h('span', { class:'stats-lab-tools-count' }, `${active} on`) : null,
        h('span', { class:'stats-lab-sub-more muted' }, ` Columns, minimums, highlights, calculated columns${isTeams ? '' : ', bio filters'}, saved views.`)),
      h('div', { class:'stats-lab-tools-grid' },
        section('Columns',
          h('div', { class:'stats-lab-row' }, find,
            btn('Reset layout', () => { delete tab.order; delete tab.vis; save(); }, { class:'ghost', title:'Back to the default column order and groups' })),
          list,
          h('div', { class:'muted' }, 'Tick to show, arrows to move, Snap freezes a column so it survives filter and season changes.')),
        section('Minimum qualifier',
          h('div', { class:'stats-lab-row' }, minCol, minVal, btn('Add', () => {
            const v = readNum(minVal);
            if (v == null) return;
            tab.min = Object.assign({}, tab.min, { [minCol.value]:v }); save();
          })),
          h('div', { class:'stats-lab-row' }, ...Object.entries(tab.min || {}).map(([k, v]) => chip(`${labelOf(k)} ≥ ${v}`, () => { delete tab.min[k]; save(); }))),
          h('div', { class:'muted' }, 'Type the value as the table shows it: 20 on a % column means 20%.')),
        section('Highlight',
          h('div', { class:'stats-lab-row' }, cfCol, cfOp, cfVal, btn('Add', () => {
            const v = readNum(cfVal);
            if (v == null || ((cfOp.value === 'top' || cfOp.value === 'bot') && !(v > 0 && v <= 100))) return;
            tab.cond = Object.assign({}, tab.cond, { [cfCol.value]:{ op:cfOp.value, v } }); save();
          })),
          h('div', { class:'stats-lab-row' }, ...Object.entries(tab.cond || {}).map(([k, r]) => chip(`${labelOf(k)} ${ruleText(r)}`, () => { delete tab.cond[k]; save(); }))),
          h('div', { class:'muted' }, 'A highlight boxes the cell. The green and red text is still the top and bottom fifth.')),
        section('Calculated column',
          h('div', { class:'stats-lab-row' }, calcName, calcExpr, btn('Add', addCalc)),
          calcErr,
          h('div', { class:'muted' }, 'Column keys from the list, numbers, + - * / and parentheses. Dividing by zero leaves the cell blank.')),
        isTeams ? null : section('Bio filters',
          h('div', { class:'stats-lab-bio' }, h('span'), h('span', { class:'muted' }, 'Min'), h('span', { class:'muted' }, 'Max'),
            ...STATS_BIO.flatMap(([k, label]) => {
              const [lo, hi] = bio[k] || [];
              return [h('span', null, label), numIn(`${label} minimum`, lo, { onchange:setBio(k, 0) }), numIn(`${label} maximum`, hi, { onchange:setBio(k, 1) })];
            })),
          h('div', { class:'stats-lab-row' }, btn('Clear bio filters', () => { delete tab.bio; save(); }, { class:'ghost' })),
          h('div', { class:'muted' }, 'From players.js and prospect.js. A player with no value for a filter you set drops out.')),
        section('Saved views',
          h('div', { class:'stats-lab-row' }, viewName, btn('Save', () => {
            const name = viewName.value.trim();
            if (!name) return;
            saveStatsViews([...views.filter(v => !(v.pos === pos && v.name === name)), { name, pos, state:viewState() }]);
            save();
          })),
          ...views.filter(v => v.pos === pos).map(v => h('div', { class:'stats-lab-view' },
            h('span', { class:'stats-lab-col-name' }, v.name),
            btn('Load', () => loadView(v)),
            btn('Delete', () => { saveStatsViews(statsViews().filter(x => !(x.pos === pos && x.name === v.name))); save(); }, { class:'ghost', 'aria-label':`Delete view ${v.name}` }))),
          h('div', { class:'muted' }, `Saved in this browser, one list per tab. A view keeps columns, sort, minimums, highlights, custom columns${isTeams ? '' : ', bio filters and the split'}.`))));
  }

  // ---- Split engine: seasons, week range and situation for the player tabs.
  // splits-YYYY.js (projections/build_split_cube.py) holds COUNTS per player x
  // week x situation bucket. The page sums the seasons, weeks and buckets picked
  // here and divides afterwards, so combined seasons, week ranges and situations
  // are one code path. Summing everything gives back advanced.js; the builder's
  // --self-check proves it on the shipped files.
  const SPLIT_POS = ['QB', 'RB', 'WR', 'TE'];
  // The situation menus. Values and labels must match DIMS in the builder (its
  // self-check reads them out of this file); the digits a value selects come
  // from the payload, so decoding never depends on this copy.
  const SPLIT_DIMS = [
    { key:'down', label:'Down', opts:[['1', '1st down'], ['2', '2nd down'], ['3', '3rd down'], ['4', '4th down']] },
    { key:'dist', label:'Distance', opts:[['s', '1-2 to go'], ['m', '3-6 to go'], ['l', '7+ to go']] },
    { key:'zone', label:'Field', opts:[['own', 'Own side'], ['mid', 'Opp 21-50'], ['rz', 'Inside 20'], ['gl', 'Inside 5']] },
    { key:'score', label:'Score', opts:[['trail', 'Trailing 9+'], ['close', 'Within 8'], ['lead', 'Leading 9+']] },
    { key:'pa', label:'Play action', opts:[['y', 'Play action'], ['n', 'No play action']] },
    { key:'motion', label:'Motion', opts:[['y', 'Motion'], ['n', 'No motion']] },
    { key:'form', label:'QB spot', opts:[['gun', 'Shotgun or pistol'], ['uc', 'Under center']] },
    { key:'blitz', label:'Blitz', opts:[['y', 'Blitzed'], ['n', 'Not blitzed']] },
    { key:'box', label:'Box', opts:[['8', '8+ in box'], ['7', '7 or fewer in box']] },
  ];
  let STATS_SPLIT_OPEN = null;   // null until toggled: open on desktop, shut on a phone

  function statsSplitState(prefs, SEASONS, cur) {
    const s = prefs.split || {};
    let seasons = (Array.isArray(s.seasons) ? s.seasons : [prefs.season]).filter(y => SEASONS.includes(y));
    seasons = [...new Set(seasons.length ? seasons : [cur])].sort((a, b) => b - a);   // newest first
    const wk = (v, d) => Math.min(18, Math.max(1, Math.round(Number(v)) || d));
    const from = Math.min(wk(s.from, 1), wk(s.to, 18)), to = Math.max(wk(s.from, 1), wk(s.to, 18));
    const sit = {};
    for (const d of SPLIT_DIMS) if (s.sit && d.opts.some(o => o[0] === s.sit[d.key])) sit[d.key] = s.sit[d.key];
    const picked = SPLIT_DIMS.filter(d => sit[d.key]);
    const weeks = from > 1 || to < 18, asc = [...seasons].reverse();
    return { seasons, from, to, sit, weeks,
      on:seasons.length > 1 || weeks || picked.length > 0,
      label:[asc.join('+') + (weeks ? `, weeks ${from}-${to}` : ''), ...picked.map(d => d.opts.find(o => o[0] === sit[d.key])[1])].join(', '),
      slug:[...asc, ...(weeks ? [`wk${from}-${to}`] : []), ...picked.map(d => `${d.key}-${sit[d.key]}`)].join('-') };
  }

  // ok[code] = 1 when a bucket passes every picked situation. Built from the
  // payload's own radixes, so it is right for whatever the builder wrote.
  function splitMatcher(dims, sit) {
    const want = dims.map(d => { const o = d.opts.find(x => x.v === sit[d.key]); return o ? new Set(o.d) : null; });
    const ok = new Uint8Array(dims.reduce((n, d) => n * d.n, 1));
    for (let code = 0; code < ok.length; code++) {
      let c = code, pass = 1;
      for (let i = dims.length - 1; i >= 0 && pass; i--) {
        const dig = c % dims[i].n;
        c = (c - dig) / dims[i].n;
        if (want[i] && !want[i].has(dig)) pass = 0;
      }
      ok[code] = pass;
    }
    return ok;
  }

  // One row per player at `pos`, from the payloads in `list` (newest first).
  // Mirrors totals() in build_split_cube.py.
  function splitRows(list, pos, split, mine) {
    const sitOn = Object.keys(split.sit).length > 0, acc = new Map();
    const inWk = (w) => w >= split.from && w <= split.to;
    for (const S of list) {
      const ok = splitMatcher(S.dims, split.sit), F = S.fields, nT = F.T.length;
      // His team's targets in the split, and its dropbacks per week in and out
      // of it: each week's estimated routes scale by that week's share.
      const team = {};
      for (const [tm, a] of Object.entries(S.teams)) {
        const t = team[tm] = { tgt:0, all:{}, sel:{} };
        for (let i = 0; i < a.length; i += nT) {
          const w = a[i];
          if (!inWk(w)) continue;
          t.all[w] = (t.all[w] || 0) + a[i + 2];
          if (ok[a[i + 1]]) { t.sel[w] = (t.sel[w] || 0) + a[i + 2]; t.tgt += a[i + 3]; }
        }
      }
      for (const [sid, v] of Object.entries(S.players)) {
        let r = acc.get(sid);
        if (!r) acc.set(sid, r = { sid, n:v.n, t:v.t, p:v.p, sum:{}, teamTgt:0, routes:0, games:0, snap:0, db:0 });
        for (const role of ['R', 'U', 'P']) {
          const a = v[role], f = F[role];
          if (!a) continue;
          const scale = f.map(k => (S.scale || {})[k] || 1), iDb = f.indexOf('db');
          for (let i = 0; i < a.length; i += f.length) {
            if (!inWk(a[i])) continue;
            if (iDb > 0) r.db += a[i + iDb];   // the QB floor ignores the situation
            if (!ok[a[i + 1]]) continue;
            for (let j = 2; j < f.length; j++) r.sum[role + f[j]] = (r.sum[role + f[j]] || 0) + a[i + j] / scale[j];
          }
        }
        r.teamTgt += (team[v.t] || {}).tgt || 0;
        for (const s of v.S || []) {
          if (!inWk(s[0])) continue;
          const t = team[s[3] || v.t];
          r.games++;
          r.snap += s[1];
          r.routes += s[2] * (!sitOn ? 1 : t && t.all[s[0]] ? (t.sel[s[0]] || 0) / t.all[s[0]] : 0);
        }
      }
    }
    const div = (a, b) => b ? a / b : null, rows = [];
    for (const r of acc.values()) {
      if (r.p !== pos) continue;
      const g = (k) => r.sum[k] || 0;
      const o = { _key:r.sid, _name:r.n, _team:r.t, _mine:mine.has(r.sid), _db:r.db,
        games:r.games, snap_pct:r.games ? r.snap / 100 / r.games : null,
        targets:g('Rtgt'), target_share:div(g('Rtgt'), r.teamTgt), rec:g('Rrec'), rec_yds:g('Ryds'), rec_td:g('Rtd'),
        air_yds:g('Rair'), catch_rate:div(g('Rrec'), g('Rtgt')), yds_per_target:div(g('Ryds'), g('Rtgt')),
        epa_per_target:div(g('Repa'), g('Rtgt')), yprr_est:r.routes >= 5 ? g('Ryds') / r.routes : null,
        carries:g('Ucar'), rush_yds:g('Uyds'), rush_td:g('Utd'), ypc:div(g('Uyds'), g('Ucar')),
        epa_per_rush:div(g('Uepa'), g('Ucar')), rush_success:div(g('Usucc'), g('Ucar')),
        dropbacks:g('Pdb'), pass_att:g('Patt'), cmp:g('Pcmp'), pass_yds:g('Pyds'), pass_td:g('Ptd'), ints:g('Pint'),
        ypa:div(g('Pyds'), g('Patt')), db_epa:div(g('Pepa'), g('Pdb')), pass_success:div(g('Psucc'), g('Pdb')),
        ppr:g('Rppr') + g('Uppr') + g('Pppr') };
      o.sample = pos === 'QB' ? o.dropbacks + o.carries : pos === 'RB' ? o.targets + o.carries : o.targets;
      if (o.sample) rows.push(o);
    }
    return rows;
  }

  // What play-by-play can split. Keys match advanced.js where the stat is the
  // same, so minimums, highlights and calculated columns carry across.
  const SPLIT_COLS = (() => {
    const REC = ['WR', 'TE', 'RB'], RUSH = ['RB', 'QB'], QB = ['QB'];
    const C = (key, label, group, pos, fmt, desc, lowerBetter = false) => ({ key, label, group, pos, fmt, desc, lowerBetter });
    return [
      C('games', 'G', 'Split', SPLIT_POS, 'int', 'Games with an offensive snap in the chosen seasons and weeks.'),
      C('sample', 'Sample', 'Split', SPLIT_POS, 'int', 'Plays in the split: dropbacks plus carries for a QB, targets plus carries for a RB, targets for a WR or TE. The smaller it is, the more every rate beside it is noise.'),
      C('ppr', 'FP', 'Split', SPLIT_POS, 'dec1', 'Fantasy points from the plays in the split: full PPR, 4 per passing TD, -2 per interception and lost fumble. Return and defensive scores are not in it.'),
      C('dropbacks', 'DB', 'Passing', QB, 'int', 'Dropbacks where he was the passer: sacks in, scrambles out, as in the season table.'),
      C('pass_att', 'Att', 'Passing', QB, 'int', 'Pass attempts, sacks included (nflverse counts a sack as an attempt).'),
      C('cmp', 'Cmp', 'Passing', QB, 'int', 'Completions.'),
      C('pass_yds', 'Pass yds', 'Passing', QB, 'int', 'Passing yards.'),
      C('pass_td', 'Pass TD', 'Passing', QB, 'int', 'Passing touchdowns.'),
      C('ints', 'INT', 'Passing', QB, 'int', 'Interceptions.', true),
      C('ypa', 'Y/A', 'Passing', QB, 'dec1', 'Passing yards per attempt, sacks counted as attempts.'),
      C('db_epa', 'EPA/DB', 'Passing', QB, 'dec2', 'Expected points added per dropback.'),
      C('pass_success', 'DB success%', 'Passing', QB, 'pct', 'Share of dropbacks with positive EPA.'),
      C('targets', 'Tgt', 'Receiving', REC, 'int', 'Targets.'),
      C('target_share', 'Tgt%', 'Receiving', REC, 'pct', "Share of his team's targets in the same seasons, weeks and situations."),
      C('rec', 'Rec', 'Receiving', REC, 'int', 'Receptions.'),
      C('rec_yds', 'Rec yds', 'Receiving', REC, 'int', 'Receiving yards.'),
      C('rec_td', 'Rec TD', 'Receiving', REC, 'int', 'Receiving touchdowns.'),
      C('air_yds', 'Air yds', 'Receiving', REC, 'int', 'Air yards on his targets.'),
      C('catch_rate', 'Catch%', 'Receiving', REC, 'pct', 'Receptions over targets.'),
      C('yds_per_target', 'Y/Tgt', 'Receiving', REC, 'dec1', 'Receiving yards per target.'),
      C('epa_per_target', 'EPA/Tgt', 'Receiving', REC, 'dec2', 'Expected points added per target.'),
      C('yprr_est', 'YPRR (est)', 'Receiving', REC, 'dec2', "Receiving yards per estimated route. Each week's estimated routes (snaps x the team's dropback share, calibrated on 2025 participation) are scaled by the share of that week's team dropbacks inside the split. Blank under 5 routes."),
      C('carries', 'Car', 'Rushing', RUSH, 'int', 'Carries.'),
      C('rush_yds', 'Rush yds', 'Rushing', RUSH, 'int', 'Rushing yards.'),
      C('rush_td', 'Rush TD', 'Rushing', RUSH, 'int', 'Rushing touchdowns.'),
      C('ypc', 'YPC', 'Rushing', RUSH, 'dec1', 'Yards per carry.'),
      C('epa_per_rush', 'EPA/Rush', 'Rushing', RUSH, 'dec2', 'Expected points added per carry.'),
      C('rush_success', 'Rush success%', 'Rushing', RUSH, 'pct', 'Share of carries with positive EPA.'),
    ];
  })();

  // The split controls. Open on desktop; a phone starts it shut so the table
  // stays one tap away, and remembers the choice for the visit.
  function statsSplitCard(prefs, split, SEASONS, cur, list, rerender) {
    const set = (patch) => {
      prefs.split = Object.assign({ seasons:split.seasons, from:split.from, to:split.to, sit:split.sit }, patch);
      saveStatsLabPrefs(prefs); rerender();
    };
    const seasonBtns = SEASONS.map(y => {
      const on = split.seasons.includes(y), last = on && split.seasons.length === 1;
      return h('button', { type:'button', class:`ghost${on ? ' active' : ''}`, 'aria-pressed':String(on), dataset:{ season:String(y) },
        title:last ? 'At least one season stays picked' : on ? `Drop ${y}` : `Add ${y}`,
        onclick:() => { if (!last) set({ seasons:on ? split.seasons.filter(x => x !== y) : [...split.seasons, y] }); } }, String(y));
    });
    const wkSel = (label, val, key) => h('select', { 'aria-label':label, onchange:(e) => {
      const v = Number(e.target.value), a = key === 'from' ? v : split.from, b = key === 'to' ? v : split.to;
      set({ from:Math.min(a, b), to:Math.max(a, b) });
    } }, ...Array.from({ length:18 }, (_, i) => h('option', { value:String(i + 1), selected:i + 1 === val }, String(i + 1))));
    const dims = SPLIT_DIMS.map(d => h('label', null, h('span', null, d.label),
      h('select', { 'aria-label':d.label, onchange:(e) => {
        const sit = Object.assign({}, split.sit);
        if (e.target.value) sit[d.key] = e.target.value; else delete sit[d.key];
        set({ sit });
      } }, h('option', { value:'' }, 'Any'), ...d.opts.map(([v, l]) => h('option', { value:v, selected:split.sit[d.key] === v }, l)))));
    // FTN charting can trail play-by-play by a week; say which plays a filter drops.
    const ftnOn = list.length && Object.keys(split.sit).some(k => (list[0].ftnDims || []).includes(k));
    const lag = ftnOn ? list.filter(S => S.ftnThroughWeek < Math.min(S.throughWeek, split.to)) : [];
    const count = (split.seasons.length > 1) + split.weeks + Object.keys(split.sit).length;
    return h('details', { class:'card stats-lab-splits', open:(STATS_SPLIT_OPEN ?? !window.matchMedia(PHONE_Q).matches) ? '' : null,
      ontoggle:(e) => { STATS_SPLIT_OPEN = e.target.open; } },
      h('summary', null, 'Split', count ? h('span', { class:'stats-lab-tools-count' }, `${count} on`) : null,
        h('span', { class:'muted' }, ` ${split.label}`)),
      h('div', { class:'stats-lab-split-body' },
        h('div', { class:'stats-lab-row' }, h('span', { class:'stats-lab-tool-title' }, 'Seasons'),
          h('span', { class:'sos-position-tabs stats-lab-split-seasons', role:'group', 'aria-label':'Seasons' }, ...seasonBtns)),
        h('div', { class:'stats-lab-row' }, h('span', { class:'stats-lab-tool-title' }, 'Weeks'),
          wkSel('First week', split.from, 'from'), h('span', null, 'to'), wkSel('Last week', split.to, 'to')),
        h('div', { class:'stats-lab-tool-title' }, 'Situation'),
        h('div', { class:'stats-lab-split-dims' }, ...dims),
        lag.length ? h('div', { class:'muted' }, lag.map(S => `FTN charting covers ${S.season} through week ${S.ftnThroughWeek}`).join('; ')
          + '. Later plays drop out of the play action, motion, QB spot, blitz and box filters.') : null,
        split.on ? h('div', { class:'muted' }, 'A split recomputes from play-by-play, so season-only columns (xFP, Next Gen, PFR, FTN rates) step aside until it is off.') : null,
        split.on ? h('div', { class:'stats-lab-row' }, h('button', { type:'button', class:'stats-lab-split-reset',
          onclick:() => set({ seasons:[cur], from:1, to:18, sit:{} }) }, 'Reset split')) : null));
  }

  // ============================================================
  // Chart builder, player compare and field location maps (Data Suite cluster D)
  // ============================================================
  // ---- chart math: pure helpers, unit-tested in site/js/chart-builder.test.js
  // Round tick steps (1, 2, 2.5, 5 x 10^k) whose first and last ticks cover [lo, hi].
  function chartTicks(lo, hi, n = 5) {
    if (!isFinite(lo) || !isFinite(hi)) return [];
    if (hi - lo < 1e-12) { const d = Math.abs(lo) * 0.1 || 1; lo -= d; hi += d; }
    const raw = (hi - lo) / Math.max(1, n - 1), mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw * (1 - 1e-9));
    const a = Math.floor(lo / step + 1e-9), b = Math.ceil(hi / step - 1e-9), out = [];
    for (let k = a; k <= b; k++) out.push(Number((k * step).toPrecision(12)));
    return out;
  }
  // Least-squares line through {x, y} points, with Pearson r and the means.
  function chartFit(pts) {
    const n = pts.length;
    if (n < 3) return null;
    let mx = 0, my = 0;
    for (const p of pts) { mx += p.x / n; my += p.y / n; }
    let sxx = 0, sxy = 0, syy = 0;
    for (const p of pts) { const dx = p.x - mx, dy = p.y - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
    if (!sxx) return null;
    const m = sxy / sxx;
    return { m, b: my - m * mx, r: syy ? sxy / Math.sqrt(sxx * syy) : 0, mx, my };
  }
  // Greedy labels: right of the point, else left. A label that would cross the
  // plot edge or a label already placed is dropped, so none ever overlap.
  // `measure` gives a label's width; boxes are padded for the text halo.
  function chartLabels(cands, box, measure = (t) => t.length * 7.4, lineH = 18) {
    const placed = [];
    const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    for (const c of cands) {
      const w = measure(c.text) + 4;
      for (const side of [1, -1]) {
        const x0 = side > 0 ? c.x + 7 : c.x - 7 - w;
        const r = { x0, x1: x0 + w, y0: c.y - lineH / 2, y1: c.y + lineH / 2 };
        if (r.x0 < box.x0 || r.x1 > box.x1 || r.y0 < box.y0 || r.y1 > box.y1 || placed.some(p => hit(p.r, r))) continue;
        placed.push({ ...c, r, anchor: side > 0 ? 'start' : 'end', lx: side > 0 ? c.x + 7 : c.x - 7 });
        break;
      }
    }
    return placed;
  }
  // Percentile of v among vals, 0-100: the share below it plus half the ties.
  function chartPct(vals, v) {
    if (!vals.length || v == null) return null;
    let below = 0, eq = 0;
    for (const x of vals) { if (x < v) below++; else if (x === v) eq++; }
    return Math.round(100 * (below + eq / 2) / vals.length);
  }
  // One player's location grid summed over several seasons' payloads.
  function locSum(list, sid, role) {
    let out = null;
    for (const L of list) {
      const a = (L.players[sid] || {})[role];
      if (!a) continue;
      if (!out) out = a.slice();
      else for (let i = 0; i < a.length; i++) out[i] += a[i];
    }
    return out;
  }
  // Totals over a set of cells. Q and R cells are [n, cmp, yds, epa, ftn,
  // catch], U cells [n, yds, epa, succ], EPA in hundredths.
  function locCell(a, role, idx) {
    const nf = role === 'U' ? 4 : 6, o = { n:0, cmp:0, yds:0, epa:0, ftn:0, catch:0, succ:0 };
    if (!a) return o;
    for (const i of idx) {
      const b = i * nf;
      o.n += a[b];
      if (role === 'U') { o.yds += a[b + 1]; o.epa += a[b + 2]; o.succ += a[b + 3]; }
      else { o.cmp += a[b + 1]; o.yds += a[b + 2]; o.epa += a[b + 3]; o.ftn += a[b + 4]; o.catch += a[b + 5]; }
    }
    return o;
  }
  function locValue(c, metric) {
    const d = (x, y) => y ? x / y : null;
    if (metric === 'att') return c.n;
    if (metric === 'yds') return c.n ? c.yds : null;
    if (metric === 'cmp') return d(c.cmp, c.n);
    if (metric === 'ypa') return d(c.yds, c.n);
    if (metric === 'epa') return d(c.epa / 100, c.n);
    if (metric === 'catch') return d(c.catch, c.ftn);
    return d(c.succ, c.n);
  }
  // ---- end chart math

  // Real label widths in the page's own bold 11px face, from one shared canvas.
  let _chartCtx = null;
  function chartMeasure() {
    if (!_chartCtx) _chartCtx = document.createElement('canvas').getContext('2d');
    if (!_chartCtx) return undefined;
    _chartCtx.font = `700 11px ${getComputedStyle(document.body).fontFamily}`;
    return (t) => _chartCtx.measureText(t).width;
  }
  const chartEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  const chartOrd = (n) => n + ((n % 100 >= 11 && n % 100 <= 13) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const chartShort = (n) => { const p = String(n || '').split(' '); return p.length > 1 ? `${p[0][0]}. ${p.slice(1).join(' ')}` : String(n || ''); };
  // Axis ticks print only as many decimals as the step needs.
  function chartTickFmt(v, fmt, step) {
    const dec = (x) => { const t = String(Number(x.toPrecision(6))), i = t.indexOf('.'); return i < 0 ? 0 : Math.min(3, t.length - i - 1); };
    if (fmt === 'pct') return `${(v * 100).toFixed(dec(step * 100))}%`;
    if (fmt === 'pct100') return `${v.toFixed(dec(step))}%`;
    return v.toFixed(dec(step));
  }
  // Up to four players share these, in the line legend, compare and chips.
  // Chrome hues only (the six semantic hues mean a tier), told apart by dash too.
  const CHART_SERIES = [['var(--band-deep)', ''], ['var(--gold-deep)', '7 4'], ['var(--ink)', '2 3'], ['var(--turf)', '10 3 2 3']];
  const CHART_TYPES = [['scatter', 'Scatter'], ['bar', 'Bar'], ['line', 'Weekly line'], ['map', 'Field map'], ['compare', 'Compare']];
  const CHART_DEFAULTS = {
    QB: { x:['cpoe', 'ypa'], y:['db_epa'], line:'ppr_pts' },
    RB: { x:['rush_share', 'carries'], y:['epa_per_rush', 'ypc'], line:'rush_share' },
    WR: { x:['first_read_share', 'target_share'], y:['fprr_est', 'yprr_est'], line:'target_share' },
    TE: { x:['first_read_share', 'target_share'], y:['fprr_est', 'yprr_est'], line:'target_share' },
    Teams: { x:['epa_pass'], y:['epa_rush'], line:null },
  };
  // What window.USAGE_WEEKLY carries per week. Every point total is full PPR.
  const CHART_LINE_STATS = [['target_share', 'Tgt%', 'pct'], ['snap_pct', 'Snap%', 'pct'], ['route_rate_est', 'Route% (est)', 'pct'],
    ['first_read_share', '1st-read%', 'pct'], ['targets', 'Tgt', 'int'], ['air_yards', 'Air yds', 'int'], ['carries', 'Car', 'int'],
    ['rush_share', 'Rush%', 'pct'], ['rz_opp_share', 'RZ opp%', 'pct'], ['ppr_pts', 'FP', 'dec1']];
  let STATS_CHARTS_OPEN = false;

  // The hover and tap readout for a chart: every mark carries data-i, and one
  // absolutely placed box shows that mark's lines, clamped inside the chart so
  // a phone never scrolls sideways to read it.
  function chartTipWrap(svg, lines, onOpen) {
    const tip = h('div', { class:'chart-tip', hidden:true, 'aria-live':'polite' });
    const wrap = h('div', { class:'chart-wrap', html:svg });
    wrap.appendChild(tip);
    const show = (el) => {
      const got = lines(Number(el.dataset.i));
      if (!got) return;
      tip.replaceChildren(...got.map((t, i) => i ? h('div', null, t) : h('strong', null, t)));
      tip.hidden = false;
      const wr = wrap.getBoundingClientRect(), er = el.getBoundingClientRect();
      const left = Math.max(0, Math.min(wr.width - tip.offsetWidth, er.left - wr.left + er.width / 2 - tip.offsetWidth / 2));
      let top = er.top - wr.top - tip.offsetHeight - 8;
      if (top < 0) top = er.bottom - wr.top + 8;
      tip.style.left = `${left}px`; tip.style.top = `${top}px`;
    };
    const mark = (e) => e.target.closest && e.target.closest('[data-i]');
    wrap.addEventListener('pointerover', (e) => { const m = mark(e); if (m) show(m); });
    wrap.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') tip.hidden = true; });
    wrap.addEventListener('click', (e) => {
      const m = mark(e);
      if (!m) { tip.hidden = true; return; }
      show(m);
      if (onOpen && e.detail > 1) onOpen(Number(m.dataset.i));   // a double click opens the player
    });
    return wrap;
  }

  function chartScatter(rows, xc, yc, o) {
    const pts = rows.filter(r => Number.isFinite(r[xc.key]) && Number.isFinite(r[yc.key])).map(r => ({ r, x:r[xc.key], y:r[yc.key] }));
    if (pts.length < 3) return h('div', { class:'muted' }, 'Fewer than three rows have both stats. Loosen a filter or pick other columns.');
    const W = o.W, H = Math.round(Math.max(290, Math.min(490, W * 0.62))), PL = 44, PR = 12, PT = 26, PB = 40;
    const xt = chartTicks(Math.min(...pts.map(p => p.x)), Math.max(...pts.map(p => p.x)));
    const yt = chartTicks(Math.min(...pts.map(p => p.y)), Math.max(...pts.map(p => p.y)));
    const X = (v) => PL + (v - xt[0]) / (xt[xt.length - 1] - xt[0]) * (W - PL - PR);
    const Y = (v) => PT + (1 - (v - yt[0]) / (yt[yt.length - 1] - yt[0])) * (H - PT - PB);
    const fit = chartFit(pts);
    let s = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${chartEsc(`${yc.label} against ${xc.label}, ${pts.length} points`)}">`;
    for (const v of xt) s += `<line class="grid" x1="${X(v)}" x2="${X(v)}" y1="${PT}" y2="${H - PB}"/><text x="${X(v)}" y="${H - PB + 14}" text-anchor="middle">${chartTickFmt(v, xc.fmt, xt[1] - xt[0])}</text>`;
    for (const v of yt) s += `<line class="grid" x1="${PL}" x2="${W - PR}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${PL - 5}" y="${Y(v) + 4}" text-anchor="end">${chartTickFmt(v, yc.fmt, yt[1] - yt[0])}</text>`;
    s += `<text class="ax-title" x="${(PL + W - PR) / 2}" y="${H - 6}" text-anchor="middle">${chartEsc(xc.label)}</text>`;
    // The Y title reads flat above its axis: rotated text is hard on a phone.
    s += `<text class="ax-title" x="4" y="13">${chartEsc(yc.label)} ↑</text>`;
    if (fit) {
      s += `<line class="avg" x1="${X(fit.mx)}" x2="${X(fit.mx)}" y1="${PT}" y2="${H - PB}"/><line class="avg" x1="${PL}" x2="${W - PR}" y1="${Y(fit.my)}" y2="${Y(fit.my)}"/>`;
      s += `<text class="avg-t" x="${W - PR - 2}" y="${Y(fit.my) - 4}" text-anchor="end">avg</text>`;
      // The trend line, clipped to the plot box.
      const clipY = (v) => Math.max(yt[0], Math.min(yt[yt.length - 1], v));
      const xs = [xt[0], xt[xt.length - 1]].map(x => ({ x, y:fit.m * x + fit.b }));
      if (fit.m) for (const p of xs) if (p.y !== clipY(p.y)) { p.y = clipY(p.y); p.x = (p.y - fit.b) / fit.m; }
      s += `<line class="trend" x1="${X(xs[0].x)}" y1="${Y(xs[0].y)}" x2="${X(xs[1].x)}" y2="${Y(xs[1].y)}"/>`;
    }
    // Picked players and the corners of the cloud get names; the rest on hover.
    const sd = (k) => { const m = pts.reduce((a, p) => a + p[k], 0) / pts.length; return Math.sqrt(pts.reduce((a, p) => a + (p[k] - m) ** 2, 0) / pts.length) || 1; };
    const sx = sd('x'), sy = sd('y'), mx = fit ? fit.mx : 0, my = fit ? fit.my : 0;
    const order = pts.map((p, i) => ({ i, pick:o.picks.has(p.r._key), far:((p.x - mx) / sx) ** 2 + ((p.y - my) / sy) ** 2 }))
      .sort((a, b) => (b.pick - a.pick) || (b.far - a.far)).slice(0, W < 480 ? 6 : 12);
    const labels = chartLabels(order.map(({ i }) => ({ i, x:X(pts[i].x), y:Y(pts[i].y), text:o.label(pts[i].r, true) })),
      { x0:PL, x1:W - PR, y0:PT, y1:H - PB }, chartMeasure());
    pts.forEach((p, i) => {
      const cls = o.picks.has(p.r._key) ? 'pt pick' : p.r._mine ? 'pt mine' : 'pt';
      s += `<circle class="${cls}" data-i="${i}" cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${cls === 'pt' ? 4.5 : cls === 'pt mine' ? 5 : 6.5}"/>`;
    });
    for (const l of labels) s += `<text class="lbl" x="${l.lx.toFixed(1)}" y="${(l.y + 4).toFixed(1)}" text-anchor="${l.anchor}">${chartEsc(l.text)}</text>`;
    s += '</svg>';
    const wrap = chartTipWrap(s, (i) => [o.label(pts[i].r), `${yc.label}: ${statFmt(pts[i].y, yc.fmt)}`, `${xc.label}: ${statFmt(pts[i].x, xc.fmt)}`, o.sample(pts[i].r)].filter(Boolean),
      o.open ? (i) => o.open(pts[i].r) : null);
    wrap.dataset.points = String(pts.length);
    return h('div', null,
      h('div', { class:'chart-title' }, `${yc.label} vs ${xc.label}`),
      h('div', { class:'muted' }, `${o.scope}. ${pts.length} ${o.unit}${fit ? `, r = ${fit.r.toFixed(2)}` : ''}. Dashed lines are the average, the solid line the trend.`),
      wrap);
  }

  function chartBar(rows, c, o) {
    const good = rows.filter(r => Number.isFinite(r[c.key])).sort((a, b) => c.lowerBetter ? a[c.key] - b[c.key] : b[c.key] - a[c.key]);
    if (!good.length) return h('div', { class:'muted' }, `No row has ${c.label}.`);
    const top = good.slice(0, o.top), extra = good.filter(r => o.picks.has(r._key) && !top.includes(r)), all = top.concat(extra);
    const avg = good.reduce((a, r) => a + r[c.key], 0) / good.length;
    const W = o.W, NW = W < 480 ? 104 : 150, VW = 50, PT = 18, PB = 26, RH = 22, gapH = extra.length ? 10 : 0;
    const vals = all.map(r => r[c.key]).concat(avg);
    const t = chartTicks(Math.min(0, ...vals), Math.max(0, ...vals), W < 480 ? 4 : 6);
    const X = (v) => NW + (v - t[0]) / (t[t.length - 1] - t[0]) * (W - NW - VW), H = PT + all.length * RH + gapH + PB;
    const maxC = Math.floor((NW - 8) / 6.3);
    let s = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${chartEsc(`${c.label}, top ${top.length}`)}">`;
    for (const v of t) s += `<line class="grid" x1="${X(v)}" x2="${X(v)}" y1="${PT}" y2="${H - PB}"/><text x="${X(v)}" y="${H - PB + 14}" text-anchor="middle">${chartTickFmt(v, c.fmt, t[1] - t[0])}</text>`;
    all.forEach((r, i) => {
      const y = PT + i * RH + (i >= top.length ? gapH : 0), v = r[c.key], x0 = X(0), x1 = X(v);
      // Too long for the name column: drop the team first, then cut the name.
      let name = o.label(r, true);
      if (name.length > maxC && r._team) name = o.label({ ...r, _team:'' }, true);
      const cls = o.picks.has(r._key) ? 'bar pick' : r._mine ? 'bar mine' : 'bar';
      s += `<g data-i="${i}"><text class="bar-name" x="${NW - 6}" y="${y + 15}" text-anchor="end">${chartEsc(name.length > maxC ? name.slice(0, maxC - 1) + '.' : name)}</text>`
        + `<rect class="${cls}" x="${Math.min(x0, x1).toFixed(1)}" y="${y + 3}" width="${Math.max(1, Math.abs(x1 - x0)).toFixed(1)}" height="${RH - 6}"/>`
        + `<text class="bar-val" x="${(v >= 0 ? x1 : x0) + 4}" y="${y + 15}">${statFmt(v, c.fmt)}</text></g>`;
    });
    if (extra.length) s += `<line class="grid" x1="0" x2="${W}" y1="${PT + top.length * RH + gapH / 2}" y2="${PT + top.length * RH + gapH / 2}"/>`;
    s += `<line class="avg" x1="${X(avg)}" x2="${X(avg)}" y1="${PT - 4}" y2="${H - PB}"/><text class="avg-t" x="${X(avg)}" y="${PT - 7}" text-anchor="middle">avg ${statFmt(avg, c.fmt)}</text></svg>`;
    const wrap = chartTipWrap(s, (i) => [o.label(all[i]), `${c.label}: ${statFmt(all[i][c.key], c.fmt)}`, `Rank ${good.indexOf(all[i]) + 1} of ${good.length}`, o.sample(all[i])].filter(Boolean),
      o.open ? (i) => o.open(all[i]) : null);
    wrap.dataset.bars = String(all.length);
    return h('div', null,
      h('div', { class:'chart-title' }, `${c.label}, top ${top.length}${c.lowerBetter ? ' (lowest first)' : ''}`),
      h('div', { class:'muted' }, `${o.scope}. Ranked among ${good.length} ${o.unit}${extra.length ? '; players you picked from further down sit under the line' : ''}.`),
      wrap);
  }

  function chartLine(U, series, stat, o) {
    const F = U.fields, ix = F.indexOf(stat[0]), iw = F.indexOf('week');
    const from = Math.max(1, o.from), to = Math.min(U.throughWeek, o.to);
    const inWk = (w) => w[iw] >= from && w[iw] <= to;
    const lines = series.map(r => ({ r, pts:((U.players[r._key] || {}).w || []).filter(inWk).map(w => ({ x:w[iw], y:w[ix] ?? 0 })) }));
    const avg = [];
    for (let wk = from; wk <= to; wk++) {
      const v = o.poolKeys.map(k => ((U.players[k] || {}).w || []).find(w => w[iw] === wk)).filter(Boolean).map(w => w[ix] ?? 0);
      if (v.length) avg.push({ x:wk, y:v.reduce((a, b) => a + b, 0) / v.length });
    }
    const all = lines.flatMap(l => l.pts).concat(avg);
    if (!lines.some(l => l.pts.length)) return h('div', { class:'muted' }, `No weekly usage for these players in weeks ${from}-${to}.`);
    const W = o.W, H = Math.round(Math.max(240, Math.min(380, W * 0.5))), PL = 48, PR = 14, PT = 12, PB = 34;
    const yt = chartTicks(Math.min(0, ...all.map(p => p.y)), Math.max(...all.map(p => p.y)));
    const X = (v) => to === from ? (PL + W - PR) / 2 : PL + (v - from) / (to - from) * (W - PL - PR);
    const Y = (v) => PT + (1 - (v - yt[0]) / (yt[yt.length - 1] - yt[0])) * (H - PT - PB);
    const every = Math.ceil((to - from + 1) / (W < 480 ? 9 : 18));
    let s = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${chartEsc(`${stat[1]} by week`)}">`;
    for (const v of yt) s += `<line class="grid" x1="${PL}" x2="${W - PR}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${PL - 5}" y="${Y(v) + 4}" text-anchor="end">${chartTickFmt(v, stat[2], yt[1] - yt[0])}</text>`;
    for (let wk = from; wk <= to; wk += every) s += `<text x="${X(wk)}" y="${H - PB + 14}" text-anchor="middle">${wk}</text>`;
    s += `<text class="ax-title" x="${(PL + W - PR) / 2}" y="${H - 4}" text-anchor="middle">Week</text>`;
    const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(' ');
    if (avg.length > 1) s += `<path class="avg" d="${path(avg)}"/>`;
    const marks = [];
    lines.forEach((l, k) => {
      const [col, dash] = CHART_SERIES[k];
      if (l.pts.length > 1) s += `<path class="series" d="${path(l.pts)}" style="stroke:${col}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
      for (const p of l.pts) {
        s += `<circle class="pt" data-i="${marks.length}" cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="4.5" style="fill:${col}"/>`;
        marks.push({ l, p });
      }
    });
    s += '</svg>';
    const wrap = chartTipWrap(s, (i) => [o.label(marks[i].l.r), `Week ${marks[i].p.x}: ${statFmt(marks[i].p.y, stat[2])} ${stat[1]}`]);
    wrap.dataset.series = String(lines.length);
    return h('div', null,
      h('div', { class:'chart-title' }, `${stat[1]} by week, ${U.season}`),
      h('div', { class:'chart-legend' }, ...lines.map((l, k) => h('span', null,
        h('span', { class:'chart-swatch', style:{ borderTopColor:CHART_SERIES[k][0], borderTopStyle:CHART_SERIES[k][1] ? 'dashed' : 'solid' } }), o.label(l.r))),
        avg.length > 1 ? h('span', { class:'muted' }, h('span', { class:'chart-swatch chart-swatch-avg' }), `Average of the ${o.poolKeys.length} in the table`) : null),
      wrap);
  }

  // Up to four Stats Lab rows side by side on the columns the table shows.
  // The leader of each row is green and each value carries a bar for its share
  // of the best, the Player Comparison card's grammar.
  function chartCompare(list, cols, o) {
    const lead = new Array(list.length).fill(0);
    const body = cols.map(c => {
      const vals = list.map(r => r[c.key]);
      const nums = vals.filter(Number.isFinite);
      const best = nums.length > 1 ? (c.lowerBetter ? Math.min(...nums) : Math.max(...nums)) : null;
      const bars = best != null && !c.lowerBetter && nums.every(v => v >= 0) && best > 0;
      vals.forEach((v, i) => { if (best != null && v === best && nums.some(x => x !== best)) lead[i]++; });
      return h('tr', null, h('th', { scope:'row', title:c.desc || '' }, c.label),
        ...vals.map(v => h('td', { class:`right tnum${best != null && v === best && nums.some(x => x !== best) ? ' delta-up' : ''}` },
          c.fmt === 'text' ? (v || '') : statFmt(v, c.fmt),
          bars && Number.isFinite(v) ? h('span', { class:'cmp-bar', style:{ width:`${Math.round(100 * v / best)}%` } }) : null)));
    });
    return h('div', null,
      h('div', { class:'chart-title' }, `Compare ${list.length}`),
      h('div', { class:'muted' }, `${o.scope}. The table's visible columns; green leads the row, the bar is its share of the best.`),
      h('div', { class:'tbl-scroll' }, h('table', { class:'data stats-compare' },
        h('thead', null, h('tr', null, h('th', null, 'Stat'), ...list.map((r, k) => h('th', { class:'right' },
          h('span', { class:'chart-swatch', style:{ borderTopColor:CHART_SERIES[k][0], borderTopStyle:CHART_SERIES[k][1] ? 'dashed' : 'solid' } }),
          h('span', { class:'cmp-name' }, o.name(r)), o.team(r) ? teamChip(o.team(r)) : null)))),
        h('tbody', null,
          h('tr', { class:'cmp-tally' }, h('th', { scope:'row' }, 'Rows led'), ...lead.map(n => h('td', { class:'right tnum' }, String(n)))),
          ...body))));
  }

  // ---- Field location maps. location-YYYY.js (projections/build_location_splits.py)
  // holds COUNTS per player by pass_location x depth band (QB throws, receiver
  // targets) and by run gap (RB carries); the page sums seasons and divides.
  const loadLocationSeason = (year) => loadSeasonScript(`location-${year}.js`, () => (window.LOCATION_BY_SEASON || {})[year]);
  const LOC_ROLE = { QB:'Q', WR:'R', TE:'R', RB:'U' };
  const LOC_TITLE = { Q:'Throw map', R:'Target map', U:'Run gaps' };
  const LOC_UNIT = { Q:'att', R:'tgt', U:'car' };
  const LOC_MIN = { Q:4, R:3, U:3 };   // fewer than this to a zone and it is not colored
  const LOC_METRICS = {
    Q: [['att', 'Att'], ['cmp', 'Cmp%'], ['yds', 'Yds'], ['ypa', 'Y/A'], ['epa', 'EPA/att'], ['catch', 'Catchable%']],
    R: [['att', 'Tgt'], ['cmp', 'Catch%'], ['yds', 'Yds'], ['ypa', 'Y/Tgt'], ['epa', 'EPA/tgt'], ['catch', 'Catchable%']],
    U: [['att', 'Car'], ['ypa', 'YPC'], ['epa', 'EPA/rush'], ['succ', 'Success%']],
  };
  const LOC_METRIC = { Q:'epa', R:'att', U:'epa' };   // remembered per role for the visit
  const locFmt = (v, m) => v == null ? '·' : m === 'att' || m === 'yds' ? String(Math.round(v))
    : m === 'epa' ? (v >= 0 ? '+' : '') + v.toFixed(2) : m === 'ypa' ? v.toFixed(1) : `${Math.round(v * 100)}%`;
  // Percentile bands, the same four steps defRankColor uses for matchups.
  const locBand = (p) => p == null ? null : p < 25 ? 'var(--red)' : p < 50 ? 'var(--amber)' : p < 75 ? 'var(--accent)' : 'var(--green)';
  const LOC_LEGEND = 'red under the 25th percentile, amber to the 50th, teal to the 75th, green above';

  // Everyone at `pos` in the loaded seasons, summed: the pool a percentile compares to.
  function locPool(list, role, pos) {
    const ids = new Set();
    for (const L of list) for (const [sid, v] of Object.entries(L.players)) if (v.p === pos && v[role]) ids.add(sid);
    return [...ids].map(sid => locSum(list, sid, role));
  }
  function locRate(pool, a, role, idx, metric) {
    const vol = (c) => metric === 'catch' ? c.ftn : c.n;
    const c = locCell(a, role, idx), v = locValue(c, metric), ok = vol(c) >= LOC_MIN[role];
    const vals = ok ? pool.map(p => locCell(p, role, idx)).filter(x => vol(x) >= LOC_MIN[role]).map(x => locValue(x, metric)).filter(x => x != null) : [];
    return { c, v, ok, pct:vals.length >= 5 ? chartPct(vals, v) : null };
  }

  function locMetricButtons(role, onChange) {
    return h('label', { class:'stats-lab-toggle loc-metrics' }, 'Show ',
      h('select', { 'aria-label':'Map metric', onchange:(e) => { LOC_METRIC[role] = e.target.value; onChange(); } },
        ...LOC_METRICS[role].map(([k, l]) => h('option', { value:k, selected:k === LOC_METRIC[role] }, l))));
  }

  // Throw map or target map: a 4 x 3 grid, deep at the top, with an All column
  // and an All row. Each cell prints the metric, then volume and percentile.
  function locFieldMap(list, sid, role, pos) {
    const a = locSum(list, sid, role), L0 = list[0], metric = LOC_METRIC[role], unit = LOC_UNIT[role];
    const mlabel = LOC_METRICS[role].find(x => x[0] === metric)[1];
    const pool = locPool(list, role, pos);
    const cell = (idx, cls, where) => {
      const x = locRate(pool, a, role, idx, metric), col = x.ok ? locBand(x.pct) : null;
      return h('div', { class:`loc-cell${cls}${x.ok ? '' : ' loc-thin'}`, style:col ? { borderBottomColor:col } : null,
        title:`${where}: ${x.c.n} ${unit}, ${mlabel} ${locFmt(x.v, metric)}${x.pct != null ? `, ${chartOrd(x.pct)} percentile` : ''}` },
        h('span', { class:'loc-val tnum', style:col ? { color:col } : null }, locFmt(x.v, metric)),
        h('span', { class:'loc-sub tnum' }, [metric === 'att' ? null : metric === 'catch' ? x.c.ftn : x.c.n,
          x.pct != null ? chartOrd(x.pct) : null].filter(v => v != null).join(' · ') || ' '));
    };
    const rowIdx = (d) => [0, 1, 2].map(c => d * 3 + c), colIdx = (c) => [0, 1, 2, 3].map(d => d * 3 + c), all = [...Array(12).keys()];
    const grid = h('div', { class:'loc-map', role:'table', 'aria-label':`${LOC_TITLE[role]}, ${mlabel}` },
      h('span'), ...L0.cols.concat('All').map(t => h('span', { class:'loc-head' }, t)));
    for (const d of [3, 2, 1, 0]) {
      if (d === 0) grid.appendChild(h('div', { class:'loc-los' }, 'Line of scrimmage'));
      grid.appendChild(h('span', { class:'loc-depth' }, L0.depths[d]));
      rowIdx(d).forEach((i, c) => grid.appendChild(cell([i], '', `${L0.depths[d]}, ${L0.cols[c]}`)));
      grid.appendChild(cell(rowIdx(d), ' loc-tot', `${L0.depths[d]}, all`));
    }
    grid.appendChild(h('span', { class:'loc-depth' }, 'All'));
    [0, 1, 2].forEach(c => grid.appendChild(cell(colIdx(c), ' loc-tot', `${L0.cols[c]}, all depths`)));
    grid.appendChild(cell(all, ' loc-tot', 'Every charted spot'));
    const t = locCell(a, role, all), unk = locCell(a, role, [12]).n, sk = role === 'Q' ? locCell(a, role, [13]).n : 0;
    const lag = list.filter(L => L.ftnThroughWeek < L.throughWeek).map(L => `${L.season} through week ${L.ftnThroughWeek}`);
    return h('div', { class:'loc-field' },
      h('div', { class:'loc-line tnum' }, [`${t.n} ${unit}`, `${locFmt(locValue(t, 'cmp'), 'cmp')} ${role === 'Q' ? 'cmp' : 'catch'}`,
        `${locFmt(locValue(t, 'ypa'), 'ypa')} ${role === 'Q' ? 'Y/A' : 'Y/Tgt'}`, `${locFmt(locValue(t, 'epa'), 'epa')} EPA/${unit}`].join(' · ')),
      grid,
      h('div', { class:'tip loc-foot' },
        `Small print: ${metric === 'att' ? '' : `${metric === 'catch' ? `FTN-charted ${unit}` : unit}, then `}percentile among ${pos}s with ${LOC_MIN[role]}+ to that zone (${LOC_LEGEND}). `
        + `Depth is air yards. ${unk || sk ? `${[unk ? `${unk} ${unit} with no charted spot` : null, sk ? `${sk} sacks` : null].filter(Boolean).join(' and ')} are left off. ` : ''}`
        + `Catchable% counts only plays FTN charted: ${t.ftn} of these ${t.n}${lag.length ? ` (FTN covers ${lag.join(', ')})` : ''}.`));
  }

  // Run gaps: seven arrows fan out of the back through the line. Width is
  // carries, color the percentile among RBs, the value and carries on top.
  function locRunGap(list, sid, pos) {
    const role = 'U', a = locSum(list, sid, role), L0 = list[0], metric = LOC_METRIC.U;
    const mlabel = LOC_METRICS.U.find(x => x[0] === metric)[1], pool = locPool(list, role, pos);
    const W = 340, H = 226, cx = 170, baseY = 198, tipY = 76, olY = 106, codes = ['LE', 'LT', 'LG', 'MID', 'RG', 'RT', 'RE'];
    const gaps = codes.map((_, i) => ({ i, x:cx + (i - 3) * 44, ...locRate(pool, a, role, [i], metric) }));
    const maxN = Math.max(1, ...gaps.map(g => g.c.n));
    let s = `<svg class="chart-svg loc-gap-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${chartEsc(`Run gaps, ${mlabel}`)}">`;
    for (const g of gaps) {
      const col = g.ok ? locBand(g.pct) || 'var(--band-deep)' : 'var(--fg-3)', w = g.c.n ? 3 + 9 * g.c.n / maxN : 1.5;
      const x0 = cx, y0 = baseY - 12, dx = g.x - x0, dy = tipY - y0, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
      const hx = g.x + ux * 10, hy = tipY + uy * 10, px = -uy * (w / 2 + 4), py = ux * (w / 2 + 4);
      const tipText = `${L0.gaps[g.i]}: ${g.c.n} carries${g.c.n ? `, ${locFmt(locValue(g.c, 'ypa'), 'ypa')} YPC, ${locFmt(locValue(g.c, 'epa'), 'epa')} EPA/rush, ${locFmt(locValue(g.c, 'succ'), 'succ')} success` : ''}`;
      s += `<g class="loc-arrow${g.ok ? '' : ' loc-thin'}" data-gap="${codes[g.i]}"><title>${chartEsc(tipText)}</title>`
        + `<line x1="${x0}" y1="${y0}" x2="${g.x.toFixed(1)}" y2="${tipY}" style="stroke:${col}" stroke-width="${w.toFixed(1)}"${g.ok ? '' : ' stroke-dasharray="4 3"'}/>`
        + `<polygon points="${hx.toFixed(1)},${hy.toFixed(1)} ${(g.x + px).toFixed(1)},${(tipY + py).toFixed(1)} ${(g.x - px).toFixed(1)},${(tipY - py).toFixed(1)}" style="fill:${col}"/>`
        + `<text class="loc-gap-code" x="${g.x}" y="11" text-anchor="middle">${codes[g.i]}</text>`
        + `<text class="loc-gap-val" x="${g.x}" y="29" text-anchor="middle" style="fill:${g.ok ? col : 'var(--fg-3)'}">${locFmt(g.v, metric)}</text>`
        + `<text class="loc-gap-n" x="${g.x}" y="43" text-anchor="middle">${g.c.n} car</text>`
        + (g.pct != null ? `<text class="loc-gap-n" x="${g.x}" y="56" text-anchor="middle">${chartOrd(g.pct)}</text>` : '') + '</g>';
    }
    // The line sits on top, so each arrow reads as going through it.
    ['LT', 'LG', 'C', 'RG', 'RT'].forEach((l, k) => {
      const x = cx + (k - 2) * 28;
      s += `<rect class="loc-ol" x="${x - 10}" y="${olY - 7}" width="20" height="14" rx="3"/><text class="loc-ol-t" x="${x}" y="${olY + 3}" text-anchor="middle">${l}</text>`;
    });
    s += `<circle class="loc-rb" cx="${cx}" cy="${baseY}" r="9"/><text class="loc-ol-t" x="${cx}" y="${H - 4}" text-anchor="middle">RB</text></svg>`;
    const t = locCell(a, role, [0, 1, 2, 3, 4, 5, 6]), unk = locCell(a, role, [7]).n;
    return h('div', { class:'loc-gap' },
      h('div', { class:'loc-line tnum' }, [`${t.n} car`, `${locFmt(locValue(t, 'ypa'), 'ypa')} YPC`, `${locFmt(locValue(t, 'epa'), 'epa')} EPA/rush`,
        `${locFmt(locValue(t, 'succ'), 'succ')} success`].join(' · ')),
      h('div', { class:'chart-wrap', html:s }),
      h('div', { class:'tip loc-foot' }, `Arrow width is carries; color is the percentile among RBs with ${LOC_MIN.U}+ carries to that gap (${LOC_LEGEND}). `
        + `Gaps are play-by-play run_location x run_gap: end runs go outside the tackle, MID is up the middle.${unk ? ` ${unk} carries with no charted gap are left off.` : ''}`));
  }

  const locGraphic = (list, sid, role, pos) => role === 'U' ? locRunGap(list, sid, pos) : locFieldMap(list, sid, role, pos);

  // The player card's map, on the Production tab. Opens on the newest season
  // he has one for; season buttons switch it without reloading the card.
  function locationBlock(sleeper) {
    const A = window.ADVANCED, role = sleeper && LOC_ROLE[sleeper.pos];
    if (!A || !role) return null;
    const sid = String(sleeper.id), SEASONS = [A.season, A.season - 1, A.season - 2];
    const card = h('div', { class:'card adv-card loc-card', dataset:{ sid, role } }, h('div', { class:'card-title' }, LOC_TITLE[role]), h('div', { class:'muted' }, 'Loading...'));
    const got = (y) => { const v = ((window.LOCATION_BY_SEASON || {})[y] || { players:{} }).players[sid]; return v && v[role] ? v : null; };
    let season = null;
    const draw = () => {
      const L = window.LOCATION_BY_SEASON[season], v = got(season);
      card.dataset.season = String(season);
      card.replaceChildren(
        h('div', { class:'card-title' }, `${LOC_TITLE[role]}, ${season}`),
        h('div', { class:'stats-lab-row loc-card-ctl' },
          h('span', { class:'sos-position-tabs loc-seasons', role:'group', 'aria-label':'Map season' },
            ...SEASONS.map(y => h('button', { type:'button', class:`ghost${y === season ? ' active' : ''}`, 'aria-pressed':String(y === season),
              onclick:() => loadLocationSeason(y).then(() => { season = y; draw(); }).catch(() => {}) }, String(y)))),
          v ? locMetricButtons(role, draw) : null),
        v ? locGraphic([L], sid, role, v.p) : h('div', { class:'muted' }, `No ${LOC_UNIT[role] === 'car' ? 'carries' : LOC_UNIT[role] === 'tgt' ? 'targets' : 'dropbacks'} in ${season}.`));
    };
    (async () => {
      for (const y of SEASONS) {
        try { await loadLocationSeason(y); } catch (_) { continue; }
        if (got(y)) { season = y; draw(); return; }
      }
      card.remove();
    })();
    return card;
  }

  // The chart builder: scatter, bar, weekly line, field maps and compare over
  // the rows the table shows, so tab, seasons, split, minimums and the Tools
  // filters all carry in. State lives on the tab (tab.chart), which saved views
  // already keep; changing a chart redraws the panel, never the table.
  function statsChartsPanel({ main, prefs, tab, pos, isTeams, rows, pool, allCols, shown, sortKey, splitOn, split, A, season, filterNote }) {
    const chart = tab.chart = Object.assign({ type:'scatter', picks:[] }, tab.chart);
    const types = CHART_TYPES.filter(([k]) => !isTeams || (k !== 'line' && k !== 'map'));
    if (!types.some(t => t[0] === chart.type)) chart.type = 'scatter';
    const num = allCols.filter(c => c.fmt !== 'text'), colBy = (k) => num.find(c => c.key === k);
    const D = CHART_DEFAULTS[pos] || CHART_DEFAULTS.WR;
    const byKey = new Map(pool.map(r => [r._key, r]));
    const unit = isTeams ? 'teams' : 'players';
    const label = (r, short) => isTeams ? r._name : `${short ? chartShort(r._name) : r._name} ${r._team || ''}`.trim();
    const sample = (r) => isTeams ? null : r.sample != null ? `Sample: ${r.sample}` : pos === 'QB' ? `${r.dropbacks || 0} dropbacks`
      : pos === 'RB' ? `${r.carries || 0} car, ${r.targets || 0} tgt` : `${r.targets || 0} targets`;
    const open = isTeams ? null : (r) => openPlayerDetail(r._name, r._key);
    const scope = [splitOn ? split.label : `${A.season}${A.throughWeek ? ` through week ${A.throughWeek}` : ''}`, filterNote].filter(Boolean).join(', ');
    const store = () => saveStatsLabPrefs(prefs);
    const body = h('div', { class:'stats-chart-body' });

    const fill = () => {
      const W = Math.max(300, Math.min(960, (main.clientWidth || 360) - 44));
      const picks = chart.picks.filter(k => byKey.has(k)).slice(0, 4);
      const pickSet = new Set(picks);
      const set = (patch) => { Object.assign(chart, patch); store(); fill(); };
      const colSel = (label_, value, key) => h('label', { class:'stats-lab-toggle' }, `${label_} `,
        h('select', { 'aria-label':label_, onchange:(e) => set({ [key]:e.target.value }) },
          ...num.map(c => h('option', { value:c.key, selected:c.key === value }, c.label))));
      // A picked player is a chip; the box offers every row at this position.
      // Picking from the list adds on input; typed text adds on Enter or blur.
      const tryAdd = (text, exact) => {
        const q = String(text || '').trim().toLowerCase();
        const r = q && (pool.find(x => label(x).toLowerCase() === q) || (!exact && pool.find(x => label(x).toLowerCase().startsWith(q))));
        if (r && !picks.includes(r._key)) set({ picks:[...picks, r._key].slice(0, 4) });
      };
      const dl = h('datalist', { id:'stats-chart-players' }, ...pool.map(r => h('option', { value:label(r) })));
      const add = h('input', { type:'search', class:'stats-chart-add', list:'stats-chart-players', 'aria-label':`Add a ${isTeams ? 'team' : 'player'}`,
        placeholder:picks.length >= 4 ? 'Four is the most' : `Add a ${isTeams ? 'team' : 'player'}`, disabled:picks.length >= 4 ? '' : null,
        oninput:(e) => tryAdd(e.target.value, true), onchange:(e) => tryAdd(e.target.value, false) });
      const pickRow = h('div', { class:'stats-lab-row stats-chart-picks' }, add, dl,
        ...picks.map((k, i) => h('span', { class:'stats-lab-chip' },
          h('span', { class:'chart-swatch', style:{ borderTopColor:CHART_SERIES[i][0], borderTopStyle:CHART_SERIES[i][1] ? 'dashed' : 'solid' } }),
          label(byKey.get(k), true),
          h('button', { type:'button', class:'ghost', 'aria-label':`Remove ${label(byKey.get(k))}`, onclick:() => set({ picks:picks.filter(x => x !== k) }) }, '×'))));
      // No picks yet: the top rows of the table's own sort stand in.
      const chosen = (n) => picks.length ? picks.map(k => byKey.get(k)) : rows.slice(0, n);
      const standIn = (n) => picks.length ? null : h('div', { class:'muted' },
        `${n === 1 ? "Showing the table's top row" : `Showing the top ${Math.min(n, rows.length)} by the table's sort`}. Add ${isTeams ? 'teams' : 'players'} to choose.`);
      const out = [h('span', { class:'sos-position-tabs stats-chart-types', role:'group', 'aria-label':'Chart type' },
        ...types.map(([k, l]) => h('button', { type:'button', class:`ghost${k === chart.type ? ' active' : ''}`, 'aria-pressed':String(k === chart.type),
          dataset:{ chart:k }, onclick:() => set({ type:k }) }, l))), pickRow];

      if (chart.type === 'scatter') {
        const xc = colBy(chart.x) || D.x.map(colBy).find(Boolean) || num[0], yc = colBy(chart.y) || D.y.map(colBy).find(Boolean) || num[1] || num[0];
        out.push(h('div', { class:'stats-lab-row' }, colSel('Y', yc.key, 'y'), colSel('X', xc.key, 'x'),
          h('button', { type:'button', onclick:() => set({ x:yc.key, y:xc.key }) }, 'Swap axes')));
        out.push(chartScatter(rows, xc, yc, { W, picks:pickSet, label, sample, open, scope, unit }));
      } else if (chart.type === 'bar') {
        const c = colBy(chart.bar) || colBy(sortKey) || num[0], top = [10, 15, 25, 40].includes(chart.top) ? chart.top : 15;
        out.push(h('div', { class:'stats-lab-row' }, colSel('Stat', c.key, 'bar'),
          h('label', { class:'stats-lab-toggle' }, 'Top ', h('select', { 'aria-label':'How many bars', onchange:(e) => set({ top:Number(e.target.value) }) },
            ...[10, 15, 25, 40].map(n => h('option', { value:String(n), selected:n === top }, String(n)))))));
        out.push(chartBar(rows, c, { W, top, picks:pickSet, label, sample, open, scope, unit }));
      } else if (chart.type === 'line') {
        const U = window.USAGE_WEEKLY;
        if (!U) out.push(h('div', { class:'muted' }, 'usage-weekly.js not loaded. Run projections/build_weekly_splits.py.'));
        else {
          const stat = CHART_LINE_STATS.find(s => s[0] === chart.line) || CHART_LINE_STATS.find(s => s[0] === D.line);
          out.push(h('div', { class:'stats-lab-row' }, h('label', { class:'stats-lab-toggle' }, 'Stat ',
            h('select', { 'aria-label':'Weekly stat', onchange:(e) => set({ line:e.target.value }) },
              ...CHART_LINE_STATS.map(s => h('option', { value:s[0], selected:s[0] === stat[0] }, s[1]))))));
          out.push(standIn(3));
          const same = !splitOn || split.seasons.includes(U.season);
          out.push(chartLine(U, chosen(3), stat, { W, label, from:splitOn && same ? split.from : 1, to:splitOn && same ? split.to : 18,
            poolKeys:rows.map(r => r._key) }));
          if (!same || season !== U.season || (splitOn && split.seasons.length > 1))
            out.push(h('div', { class:'tip' }, `Weekly usage exists for ${U.season} only, so the lines are ${U.season} whatever seasons the table shows.`));
        }
      } else if (chart.type === 'map') {
        const seasons = splitOn ? split.seasons : [season], role = LOC_ROLE[pos];
        const need = seasons.filter(y => !(window.LOCATION_BY_SEASON || {})[y]);
        if (need.length) {
          const msg = h('div', { class:'muted' }, `Loading ${need.join(', ')} field maps...`);
          out.push(msg);
          Promise.all(need.map(loadLocationSeason)).then(() => { if (msg.isConnected) fill(); })
            .catch(() => { msg.textContent = 'location-YYYY.js did not load. Run projections/build_location_splits.py.'; });
        } else {
          const list = seasons.map(y => window.LOCATION_BY_SEASON[y]);
          out.push(h('div', { class:'stats-lab-row' }, locMetricButtons(role, fill)), standIn(1));
          out.push(h('div', { class:'loc-tiles' }, ...chosen(1).map(r => h('div', { class:'loc-tile', dataset:{ sid:r._key } },
            h('div', { class:'loc-tile-name' }, `${LOC_TITLE[role]}: ${r._name} `, teamChip(r._team), ` ${seasons.slice().reverse().join('+')}`),
            locSum(list, r._key, role) ? locGraphic(list, r._key, role, pos) : h('div', { class:'muted' }, `No ${LOC_UNIT[role]} charted.`)))));
          if (splitOn && (split.weeks || Object.keys(split.sit).length))
            out.push(h('div', { class:'tip' }, 'Maps are whole seasons: the week range and situation filters do not narrow them.'));
        }
      } else {
        out.push(standIn(2));
        const list = chosen(2);
        if (list.length) out.push(chartCompare(list, shown, { scope, name:(r) => isTeams ? r._name : chartShort(r._name), team:(r) => isTeams ? null : r._team }));
      }
      body.replaceChildren(...out.filter(Boolean));
    };

    return h('details', { class:'card stats-lab-charts', open:STATS_CHARTS_OPEN ? '' : null,
      ontoggle:(e) => { STATS_CHARTS_OPEN = e.target.open; if (e.target.open && !body.childNodes.length) fill(); } },
      h('summary', null, 'Charts', chart.picks.length ? h('span', { class:'stats-lab-tools-count' }, `${chart.picks.length} picked`) : null,
        h('span', { class:'stats-lab-sub-more muted' }, ` Scatter, bar, ${isTeams ? '' : 'weekly line, field maps, '}compare up to four.`)),
      STATS_CHARTS_OPEN ? (fill(), body) : body);
  }

  function viewStats(posArg, sub) {
    const main = $('#main'); main.innerHTML = '';
    const CUR = window.ADVANCED;
    if (!CUR) { main.appendChild(h('div', { class:'empty' }, 'advanced.js not loaded. Run projections/build_nflverse_suite.py.')); return; }
    const POS = ['QB', 'RB', 'WR', 'TE', 'Teams', 'Coverage', 'Routes', 'OnOff', 'Defense', 'Trends', 'IDP'];
    const prefs = statsLabPrefs();
    const SEASONS = [CUR.season, CUR.season - 1, CUR.season - 2];
    const pos = POS.includes(posArg) ? posArg : (prefs.pos && POS.includes(prefs.pos) ? prefs.pos : 'WR');
    // Player tabs take seasons, weeks and situation from the split card. One
    // season with nothing else picked is that season's advanced.js, untouched;
    // anything more is summed from the split cube.
    const split = SPLIT_POS.includes(pos) ? statsSplitState(prefs, SEASONS, CUR.season) : null;
    const splitOn = !!(split && split.on);
    const season = split ? split.seasons[0] : SEASONS.includes(prefs.season) ? prefs.season : CUR.season;
    let A = CUR;
    if (splitOn) {
      const need = split.seasons.filter(y => !(window.SPLITS_BY_SEASON || {})[y]);
      if (need.length) {
        main.appendChild(h('div', { class:'empty' }, `Loading ${need.join(', ')} splits...`));
        Promise.all(need.map(loadSplitsSeason)).then(() => viewStats(posArg)).catch(() => {
          prefs.split = { seasons:[CUR.season] }; saveStatsLabPrefs(prefs);
          main.innerHTML = '';
          main.appendChild(h('div', { class:'empty' }, `Could not load the split data. Showing ${CUR.season}.`));
          setTimeout(() => viewStats(posArg), 1200);
        });
        return;
      }
    } else if (season !== CUR.season) {
      A = (window.ADVANCED_BY_SEASON || {})[season];
      if (!A) {
        main.appendChild(h('div', { class:'empty' }, `Loading ${season}...`));
        loadAdvancedSeason(season).then(() => viewStats(posArg)).catch(() => {
          prefs.season = CUR.season;
          if (split) prefs.split = { seasons:[CUR.season] };
          saveStatsLabPrefs(prefs);
          main.innerHTML = '';
          main.appendChild(h('div', { class:'empty' }, `Could not load ${season}. Showing ${CUR.season}.`));
          setTimeout(() => viewStats(posArg), 1200);
        });
        return;
      }
    }
    prefs.pos = pos;
    const isTeams = pos === 'Teams';
    // Teams adds the defense's shell mix once that season's coverage file is on the page.
    const cov = isTeams ? (window.COVERAGE_BY_SEASON || {})[season] : null;
    const covOn = !!(cov && cov.published);
    const cols = splitOn ? SPLIT_COLS.filter(c => c.pos.includes(pos))
      : isTeams ? (covOn ? A.teamColumns.concat(teamCoverageCols(cov)) : A.teamColumns) : A.columns.filter(c => c.pos.includes(pos));
    // A split has its own columns, so it keeps its own groups and sort.
    const gkey = splitOn ? `${pos} split` : pos;
    const groups = [...new Set(cols.map(c => c.group))];
    const onGroups = (prefs.groups && prefs.groups[gkey]) || groups;
    const estimates = splitOn ? new Set(['yprr_est']) : new Set(A.estimates || []);

    main.appendChild(breadcrumbs([{ label:'Tools' }, { label:'Stats Lab' }]));
    main.appendChild(pageHeader({
      eyebrow:'STATS LAB',
      title:'Advanced stats',
      sub:[splitOn ? `${split.label}. Counts summed over the split, rates recomputed from them. (est) marks an estimate.`
        : pos === 'Coverage' ? 'Man vs zone, coverage shells, pressure, personnel and formation from nflverse participation charting.'
        : pos === 'Routes' ? 'Route trees from nflverse participation charting: the route each pass was thrown on, by receiver.'
        : pos === 'OnOff' ? 'Team and teammate splits with a player on and off the field, and game splits by starting QB and playcaller.'
        : `${A.season} regular season through week ${A.throughWeek}. (est) marks an estimate.`,
        h('span', { class:'stats-lab-sub-more' }, ' Open the Column key above a table for what each header means.')],
      // Player tabs pick seasons in the split card instead.
      actions:split || pos === 'Coverage' || pos === 'Routes' || pos === 'OnOff' ? [] : [h('label', { class:'stats-lab-toggle stats-lab-season' }, 'Season ',
        h('select', { 'aria-label':'Season', onchange:(e) => {
          prefs.season = Number(e.target.value); saveStatsLabPrefs(prefs); viewStats(posArg);
        } }, ...SEASONS.map(y => h('option', { value:String(y), selected:y === season }, String(y)))))],
    }));
    main.appendChild(tabBar(POS.map(k => ({ key:k, label:k === 'OnOff' ? 'On/Off' : k })), pos, k => `#stats/${k}`));
    if (pos === 'Defense') { statsDefense(main, prefs); saveStatsLabPrefs(prefs); return; }
    if (pos === 'Trends') { statsTrends(main, prefs); saveStatsLabPrefs(prefs); return; }
    if (pos === 'IDP') { statsIdp(main, prefs); saveStatsLabPrefs(prefs); return; }
    if (pos === 'Coverage') { statsCoverage(main, prefs, CUR.season); saveStatsLabPrefs(prefs); return; }
    if (pos === 'Routes') { statsRoutes(main, prefs, CUR.season); saveStatsLabPrefs(prefs); return; }
    if (pos === 'OnOff') { statsOnOff(main, prefs, CUR.season, sub); saveStatsLabPrefs(prefs); return; }

    // Per-tab research state: minimums, column layout, snapshots, calculated
    // columns, highlights and bio filters. Every field is optional, so prefs
    // saved before these tools existed load untouched.
    prefs.tab = prefs.tab || {};
    const tab = prefs.tab[pos] = prefs.tab[pos] || {};
    const save = () => { saveStatsLabPrefs(prefs); viewStats(pos); };
    const loaded = splitOn ? split.seasons.map(y => window.SPLITS_BY_SEASON[y]) : [];
    if (split) main.appendChild(statsSplitCard(prefs, split, SEASONS, CUR.season, loaded, () => viewStats(pos)));

    main.appendChild(h('div', { class:'sos-position-tabs stats-lab-groups', role:'group', 'aria-label':'Stat groups' },
      ...groups.map(g => {
        const on = onGroups.includes(g);
        return h('button', { class:`ghost${on ? ' active' : ''}`, 'aria-pressed':String(on), onclick:() => {
          const next = on ? onGroups.filter(x => x !== g) : [...onGroups, g];
          prefs.groups = Object.assign({}, prefs.groups, { [gkey]: next.length ? next : groups });
          saveStatsLabPrefs(prefs); viewStats(pos);
        } }, g);
      })));

    let rows;
    if (isTeams) {
      rows = Object.entries(A.teams).map(([t, v]) => Object.assign({ _key:t, _name:t, _team:t }, v, covOn ? teamCoverageRow(cov, t) : null));
    } else {
      const mine = new Set();
      for (const lg of window.LEAGUES || []) {
        const me = (lg.rosters || []).find(r => r.is_me);
        for (const pid of (me && me.players) || []) mine.add(String(pid));
      }
      rows = splitOn ? splitRows(loaded, pos, split, mine) : Object.entries(A.players).filter(([, v]) => v.p === pos)
        .map(([sid, v]) => Object.assign({ _key:sid, _name:v.n, _team:v.t, _mine:mine.has(sid) }, v));
    }

    // Snapshots and calculated columns ride on the rows as plain fields, so
    // sort, tint, minimums, highlights and export treat them like any column.
    const custom = [], exprKeys = cols.filter(c => c.fmt !== 'text').map(c => c.key);
    for (const s of tab.snaps || []) {
      const key = `snap${s.id}`;
      custom.push({ key, label:s.label, group:'Custom', custom:'snap', id:s.id, fmt:s.fmt, lowerBetter:!!s.lowerBetter, desc:s.desc || '' });
      for (const r of rows) r[key] = (s.vals || {})[r._key] ?? null;
      exprKeys.push(key);
    }
    for (const x of tab.calcs || []) {
      const key = `calc${x.id}`, cx = statsExprCompile(x.expr, exprKeys);
      custom.push({ key, label:x.label, group:'Custom', custom:'calc', id:x.id, fmt:'dec2',
        desc:`Calculated: ${x.expr}.${cx.error ? ` Broken: ${cx.error}.` : ''}` });
      for (const r of rows) r[key] = cx.fn ? cx.fn(r) : null;
      exprKeys.push(key);
    }
    const allCols = cols.concat(custom);
    const pool = rows;   // every row at this position, before any filter: what a snapshot freezes

    if (!isTeams) {
      const q = (prefs.q || '').trim().toLowerCase();
      if (q) rows = rows.filter(r => r._name.toLowerCase().includes(q));
      if (prefs.mine) rows = rows.filter(r => r._mine);
      // A 2-snap cameo with a 100% catch rate is noise at the top of every
      // efficiency sort, so hold players to a real share of the work.
      const minSnap = prefs.minSnap ?? 0.2;
      // In a split the QB floor counts every dropback in the chosen weeks, not
      // just the situation's, which the Sample column reports on its own.
      rows = rows.filter(pos === 'QB' ? (r => ((splitOn ? r._db : r.dropbacks) || 0) >= 15) : (r => (r.snap_pct || 0) >= minSnap));
      for (const [k, , get] of STATS_BIO) {
        const [lo, hi] = (tab.bio && tab.bio[k]) || [];
        if (lo == null && hi == null) continue;
        rows = rows.filter(r => { const v = get(r._key); return v != null && (lo == null || v >= lo) && (hi == null || v <= hi); });
      }
    }
    for (const [k, v] of Object.entries(tab.min || {})) {
      const c = allCols.find(x => x.key === k);
      if (c && typeof v === 'number') rows = rows.filter(r => typeof r[k] === 'number' && statsDisp(c, r[k]) >= v);
    }

    // Column layout: an explicit tick wins, otherwise the stat group decides.
    const vis = tab.vis || {};
    const isVis = (c) => typeof vis[c.key] === 'boolean' ? vis[c.key] : (!!c.custom || onGroups.includes(c.group));
    const at = new Map((tab.order || []).map((k, i) => [k, i]));
    const ordered = allCols.map((c, i) => ({ c, i:at.has(c.key) ? at.get(c.key) : 1e4 + i })).sort((a, b) => a.i - b.i).map(x => x.c);
    const shown = ordered.filter(isVis);

    const defaultSort = splitOn ? 'ppr' : isTeams ? 'epa_play' : pos === 'QB' ? 'db_epa' : 'xfp_pg';
    const sort = (prefs.sort && prefs.sort[gkey]) || { key: defaultSort, dir: 'desc' };
    rows.sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string') return av.localeCompare(bv) * (sort.dir === 'asc' ? 1 : -1);
      return sort.dir === 'asc' ? av - bv : bv - av;
    });

    // Percentile tint within the visible pool, flipped for lower-is-better.
    const rank = {};
    for (const c of shown) {
      if (c.fmt === 'text') continue;
      const vals = rows.map(r => r[c.key]).filter(v => v != null).sort((x, y) => x - y);
      rank[c.key] = (v) => {
        if (v == null || vals.length < 5) return null;
        let lo = 0, hi = vals.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (vals[m] < v) lo = m + 1; else hi = m; }
        const pct = lo / (vals.length - 1 || 1);
        return c.lowerBetter ? 1 - pct : pct;
      };
    }
    // User highlights sit beside the tint: the tint colors the text, a
    // highlight boxes the cell, so both read at once.
    const hit = {};
    for (const c of shown) {
      const rule = (tab.cond || {})[c.key];
      if (!rule || typeof rule.v !== 'number' || c.fmt === 'text') continue;
      if (rule.op === 'gt' || rule.op === 'lt') {
        hit[c.key] = (v) => typeof v === 'number' && (rule.op === 'gt' ? statsDisp(c, v) > rule.v : statsDisp(c, v) < rule.v);
        continue;
      }
      const vals = rows.map(r => r[c.key]).filter(v => typeof v === 'number').sort((x, y) => y - x);
      if (!vals.length) continue;
      const n = Math.min(vals.length, Math.max(1, Math.ceil(vals.length * rule.v / 100)));
      const cut = rule.op === 'top' ? vals[n - 1] : vals[vals.length - n];
      hit[c.key] = (v) => typeof v === 'number' && (rule.op === 'top' ? v >= cut : v <= cut);
    }

    const exportBtn = h('button', { type:'button', class:'stats-lab-export', title:'Download the rows and columns on screen as a CSV file',
      onclick:() => {
        const t = main.querySelector('table.stats-lab-table');
        if (!t) return;
        const a = h('a', { href:URL.createObjectURL(new Blob(['﻿' + statsCsv(t)], { type:'text/csv;charset=utf-8' })),
          download:`stats-lab-${pos.toLowerCase()}-${splitOn ? split.slug : A.season}.csv` });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } }, 'Export CSV');
    const count = h('span', { class:'muted tnum' }, `${rows.length} ${isTeams ? 'teams' : 'players'}`);
    if (!isTeams) {
      const search = h('input', { type:'search', placeholder:'Search player', value:prefs.q || '',
        'aria-label':'Search player', class:'stats-lab-search',
        onchange:(e) => { prefs.q = e.target.value; saveStatsLabPrefs(prefs); viewStats(pos); } });
      const mineBox = h('label', { class:'stats-lab-toggle' },
        h('input', { type:'checkbox', checked:!!prefs.mine, onchange:(e) => {
          prefs.mine = e.target.checked; saveStatsLabPrefs(prefs); viewStats(pos); } }),
        ' My players');
      const snapSel = pos === 'QB' ? null : h('label', { class:'stats-lab-toggle' }, 'Min snap% ',
        h('select', { 'aria-label':'Minimum snap share', onchange:(e) => {
          prefs.minSnap = Number(e.target.value); saveStatsLabPrefs(prefs); viewStats(pos); } },
          ...[0, 0.2, 0.4, 0.6].map(v => h('option', { value:String(v), selected:(prefs.minSnap ?? 0.2) === v }, `${v * 100}%`))));
      main.appendChild(h('div', { class:'card stats-lab-filters' }, search, mineBox, snapSel, count, exportBtn));
    } else {
      main.appendChild(h('div', { class:'card stats-lab-filters' }, count, exportBtn));
    }
    main.appendChild(statsToolsPanel({ prefs, tab, pos, isTeams, ordered, isVis, pool, exprKeys, save,
      A:splitOn ? { season:split.label, splitLabel:split.label } : A }));
    // What the rows went through, printed under every chart.
    const bioOn = !isTeams && STATS_BIO.some(([k]) => ((tab.bio || {})[k] || []).some(v => v != null));
    main.appendChild(statsChartsPanel({ main, prefs, tab, pos, isTeams, rows, pool, allCols, shown, sortKey:sort.key, splitOn, split, A, season,
      filterNote:[isTeams ? null : pos === 'QB' ? '15+ dropbacks' : `${Math.round((prefs.minSnap ?? 0.2) * 100)}%+ snaps`,
        !isTeams && prefs.q ? `search "${prefs.q}"` : null, !isTeams && prefs.mine ? 'my players' : null,
        Object.keys(tab.min || {}).length || bioOn ? 'Tools filters on' : null].filter(Boolean).join(', ') }));

    const headCell = (c) => {
      const active = sort.key === c.key;
      const arrow = active ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : '';
      return h('th', {
        class:`right clickable${active ? ' sort-active' : ''}`,
        title:c.desc + (estimates.has(c.key) ? ' This is an estimate, not a charted count.' : ''),
        tabindex:'0', 'aria-sort':active ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none',
        onclick:() => {
          const dir = active ? (sort.dir === 'desc' ? 'asc' : 'desc') : (c.lowerBetter ? 'asc' : 'desc');
          prefs.sort = Object.assign({}, prefs.sort, { [gkey]: { key:c.key, dir } });
          saveStatsLabPrefs(prefs); viewStats(pos);
        },
      }, c.label + arrow);
    };

    const tbl = h('table', { class:'data data-sticky stats-lab-table', 'data-split':splitOn ? split.label : null },
      h('thead', null, h('tr', null,
        h('th', { class:'right' }, '#'),
        h('th', null, isTeams ? 'Team' : 'Player'),
        isTeams ? null : h('th', null, 'Tm'),
        ...shown.map(headCell))),
      h('tbody', null, ...rows.map((r, i) => h('tr', {
        class:r._mine ? 'you' : '',
        dataset:{ key:r._key },
        onclick:isTeams ? null : () => openPlayerDetail(r._name, r._key),
      },
        h('td', { class:'right tnum muted' }, String(i + 1)),
        h('td', { class:'stats-lab-name' }, isTeams ? teamChip(r._team) : r._name),
        isTeams ? null : h('td', null, teamChip(r._team)),
        ...shown.map(c => {
          const v = r[c.key], pr = rank[c.key] ? rank[c.key](v) : null;
          return h('td', { class:`right tnum${pr == null ? '' : pr >= 0.8 ? ' delta-up' : pr <= 0.2 ? ' delta-down' : ''}${hit[c.key] && hit[c.key](v) ? ' cf-hit' : ''}` },
            statFmt(v, c.fmt));
        })))));
    main.appendChild(statsColumnKey(shown, estimates));
    appendTable(main, tbl);
    main.appendChild(h('div', { class:'tip', style:{ marginTop:'10px' } }, splitOn
      ? `Source: ${loaded[0].source}. Every play in the split is counted and the rates are recomputed from those counts. `
        + 'Green is the top fifth of the players shown and red the bottom fifth, flipped where lower is better. '
        + "YPRR is an estimate: each week's estimated routes are scaled by the share of team dropbacks inside the split."
      : `Source: ${A.source}. `
      + 'Green is the top fifth of the players shown and red the bottom fifth, flipped where lower is better. '
      + 'Route% and TPRR/YPRR are estimates because public route data stops after 2025. '
      + (A.xfpSource === 'lookup' ? 'xFP prices each target and carry at the league average for plays like it'
        : 'xFP is what ffopportunity\'s play-by-play model expects his targets and carries to score')
      + '; FPOE is what he did beyond that.'));
    if (isTeams && !covOn) {
      const note = h('div', { class:'tip', style:{ marginTop:'10px' } }, cov
        ? `The coverage shell columns (Man%, Cover 0-6) need nflverse participation charting, which is not published for ${season} yet. Pick ${season - 1} in Season to see them.`
        : `Loading ${season} coverage shells...`);
      main.appendChild(note);
      if (!cov) loadCoverageSeason(season).then(() => { if (note.isConnected) viewStats('Teams'); })
        .catch(() => { note.textContent = `coverage-${season}.js did not load. Run projections/build_coverage_splits.py.`; });
    }
    saveStatsLabPrefs(prefs);
  }

  function viewSosGrid(posArg) {
    const main = $('#main'); main.innerHTML = '';
    const G = window.SOS_GRID;
    if (!G) { main.appendChild(h('div', { class: 'empty' }, 'sos-grid.js not loaded, run build_sos_grid.py.')); return; }
    if (posArg && G.positions.includes(posArg.toUpperCase())) SOS_GRID_POS = posArg.toUpperCase();
    const pos = SOS_GRID_POS, n = G.n_def, WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);
    const season = (G.basis || {}).current_season || (window.ADVANCED || {}).season;   // every cell opens its game page

    main.appendChild(breadcrumbs([{ label: 'Tools' }, { label: 'Strength of Schedule' }]));
    main.appendChild(h('div', { class: 'page-header' }, h('div', null,
      h('div', { class: 'page-eyebrow' }, 'STRENGTH OF SCHEDULE'),
      h('h1', { class: 'page-title' }, 'Season SOS by Position'),
      h('p', { class: 'page-sub' }, `Each cell is the opponent. Matchup colors use ${G.note || `${G.season} PPR allowed to ${pos}`}. Green = weak D (smash spot), red = elite D (tough). Rank 1 of ${n} = allows fewest.`))));

    // position tabs
    const tabs = h('div', { class:'sos-position-tabs', role:'group', 'aria-label':'Position' });
    for (const p of G.positions) {
      const on = p === pos;
      tabs.appendChild(h('button', { class: 'ghost' + (on ? ' active' : ''),
        'aria-pressed':String(on),
        onclick: () => { SOS_GRID_POS = p; navigate(`#sos/${p}`); } }, p));
    }
    main.appendChild(tabs);

    // per team: week->game map + avg opponent rank (higher = easier schedule)
    const rowsData = G.teams.map(t => {
      const wk = {}; let sum = 0, cnt = 0;
      for (const g of G.grid[pos][t]) { wk[g.week] = g; if (g.rank != null) { sum += g.rank; cnt++; } }
      return { team: t, wk, avg: cnt ? sum / cnt : null };
    });
    const gsort = (key) => { if (SOS_GRID_SORT.key === key) SOS_GRID_SORT.dir = SOS_GRID_SORT.dir === 'asc' ? 'desc' : 'asc'; else SOS_GRID_SORT = { key, dir: 'desc' }; viewSosGrid(pos); };
    const garrow = (key) => SOS_GRID_SORT.key === key ? (SOS_GRID_SORT.dir === 'desc' ? '↓' : '↑') : '';
    const gval = (rd) => SOS_GRID_SORT.key === 'avg' ? rd.avg : (rd.wk[SOS_GRID_SORT.key] ? rd.wk[SOS_GRID_SORT.key].rank : null);
    rowsData.sort((a, b) => { const av = gval(a), bv = gval(b); if (av == null && bv == null) return 0; if (av == null) return 1; if (bv == null) return -1; return SOS_GRID_SORT.dir === 'desc' ? bv - av : av - bv; });

    const tbl = h('table', { class: 'data data-sticky', style: { fontSize: '11px' } },
      h('thead', null, h('tr', null,
        h('th', { class: 'right' }, '#'), h('th', null, 'Team'),
        h('th', { class: 'right clickable', style: { cursor: 'pointer' }, title: 'Sort by avg opponent DvP rank (easiest first)', onclick: () => gsort('avg') }, 'SOS' + garrow('avg')),
        ...WEEKS.map(w => h('th', { class: 'center clickable', style: { minWidth: '34px', cursor: 'pointer' }, title: `Sort by week ${w} matchup`, onclick: () => gsort(w) }, 'W' + w + garrow(w))))),
      h('tbody', null, ...rowsData.map((rd, i) => h('tr', null,
        h('td', { class: 'right tnum muted' }, String(i + 1)),
        h('td', null, teamChip(rd.team)),
        h('td', { class: 'right tnum', style: { fontWeight: 700 } }, rd.avg != null ? fmt.decimal(rd.avg, 0) : '·'),
        ...WEEKS.map(w => {
          const g = rd.wk[w];
          if (!g) return h('td', { class: 'center muted', style: { fontSize: '9px' } }, 'BYE');
          return h('td', { class: 'center', title: `Wk${w} ${g.home ? 'vs ' : '@ '}${g.opp}: D vs ${pos} #${g.rank ?? '?'}/${n} (${g.fpa ?? '?'} PPR/g allowed)`, style: { color: defRankColor(g.rank, n), lineHeight: 1.05 } },
            h('a', { class: 'sos-game', href: `#game/${gameIdFor(season, w, rd.team, g.opp, g.home)}` },
              h('div', { style: { fontWeight: 700 } }, g.opp),
              h('div', { style: { fontSize: '9px', opacity: .85 } }, g.rank != null ? '#' + g.rank : '')));
        }))
      ))
    );
    main.appendChild(h('div', { style: { overflowX: 'auto' } }, tbl));
    main.appendChild(h('div', { class: 'tip', style: { marginTop: '10px' } },
      `Defense-vs-position from ${G.season} actual PPR allowed. SOS column = average opponent DvP rank across the schedule (higher = easier season for ${pos}s).`));
  }

  // ============================================================
  // Game pages - #game/:game_id, nflverse's id (2026_03_DAL_NYG)
  // ============================================================
  // Pregame reads only the season builds already on the page: ADVANCED teams and
  // players, DEFENSE, TEAM_SOS and TEAM_ENV implied points, WEATHER. Postgame
  // reads games-YYYY.js (finished games) and one games-YYYY-wNN.js (that week's
  // drives, plays and targets), both from projections/build_game_pages.py and
  // both loaded only when a game page or the Games list asks.
  const GAME_ID_RE = /^(\d{4})_(\d{2})_([A-Z]{2,3})_([A-Z]{2,3})$/;
  const gameTeam = (t) => t === 'LA' ? 'LAR' : t;     // nflverse ids write the Rams as LA
  const gameCode = (t) => t === 'LAR' ? 'LA' : t;
  const gameWk = (w) => String(w).padStart(2, '0');
  const gameIdFor = (season, week, team, opp, home) =>
    `${season}_${gameWk(week)}_${gameCode(home ? opp : team)}_${gameCode(home ? team : opp)}`;
  const gameIndex = (y) => (window.GAME_INDEX_BY_SEASON || {})[y];
  const gameWeek = (y, w) => (window.GAME_WEEKS || {})[`${y}_${gameWk(w)}`];
  const gameNow = () => ({ season:(window.ADVANCED || window.WEATHER || {}).season, week:(window.WEATHER || {}).week });
  const gameOrd = (n) => `${n}${[11, 12, 13].includes(n % 100) ? 'th' : ({ 1:'st', 2:'nd', 3:'rd' })[n % 10] || 'th'}`;
  // A file nobody built (another season) is remembered, so the page renders
  // without it instead of asking again on every paint. true = here, false =
  // missing, null = on its way (again() repaints if the page is still showing).
  const _gameMissing = new Set();
  function gameLoad(file, ready, again) {
    if (ready()) return true;
    if (_gameMissing.has(file)) return false;
    const hash = location.hash;
    loadSeasonScript(file, ready).catch(() => { _gameMissing.add(file); })
      .then(() => { if (location.hash === hash) again(); });
    return null;
  }

  // Receiving (and for RBs rushing) PPR per game by position, and dropback-weighted
  // pressure faced, summed from each team's players: the same slices DEFENSE
  // reports as allowed, so an offense and a defense compare like for like.
  // ponytail: a player's log follows him, so a mid-season trade counts his old
  // team's games for his new one. Fine for a percentile; split by opp if it bites.
  let _gameTeamStats = null;
  function gameTeamStats() {
    const A = window.ADVANCED, D = window.DEFENSE;
    if (_gameTeamStats && _gameTeamStats.A === A) return _gameTeamStats.v;
    const F = A.logFields, ix = (k) => F.indexOf(k), v = {};
    for (const p of Object.values(A.players)) {
      const T = v[p.t] = v[p.t] || { WR:0, TE:0, RB:0, db:0, prs:0 };
      if (p.p === 'QB' && p.dropbacks) { T.db += p.dropbacks; T.prs += (p.pressure_rate || 0) * p.dropbacks; }
      if (!(p.p in T)) continue;
      for (const r of p.wk || []) {
        T[p.p] += (r[ix('rec')] || 0) + 0.1 * (r[ix('rec_yds')] || 0) + 6 * (r[ix('rec_td')] || 0)
          + (p.p === 'RB' ? 0.1 * (r[ix('rush_yds')] || 0) + 6 * (r[ix('rush_td')] || 0) : 0);
      }
    }
    for (const [t, T] of Object.entries(v)) {
      const g = ((D && D.teams[t] && D.teams[t].cur) || {}).games;
      for (const k of ['WR', 'TE', 'RB']) T[k] = g ? T[k] / g : null;
      T.prs = T.db ? T.prs / T.db : null;
    }
    _gameTeamStats = { A, v };
    return v;
  }
  // Rank 1 is the highest of the 32 whatever the stat, so a style number (PROE,
  // motion) and a good-or-bad one read the same way.
  function gameRank(teams, get, t) {
    const v = get(t);
    return v == null ? null : 1 + teams.filter(x => { const o = get(x); return o != null && o > v; }).length;
  }
  // Percentile at the job, 100 = best of the 32.
  function gamePct(teams, get, t, lowerBetter) {
    const v = get(t), vals = teams.map(get).filter(x => x != null);
    if (v == null || vals.length < 2) return null;
    return Math.round(vals.filter(x => lowerBetter ? x > v : x < v).length / (vals.length - 1) * 100);
  }
  // Each edge pairs an offense number with the defense number it attacks. Both
  // become percentiles at their own job, so the gap is offense minus defense:
  // positive favors the offense, negative the defense.
  function gameEdges(away, home) {
    const A = window.ADVANCED, D = window.DEFENSE, S = gameTeamStats(), teams = Object.keys(A.teams);
    const at = (t) => A.teams[t] || {}, dc = (t) => ((D.teams[t] || {}).cur) || {};
    const pos = (t, k) => { const b = (dc(t).byPos || {})[k]; return b ? b.ppr_pg : null; };
    const PAIRS = [
      ['Passing', 'EPA/pass', (t) => at(t).epa_pass, false, 'EPA/dropback allowed', (t) => (dc(t).pass || {}).epa_per_dropback, true, 'dec2'],
      ['Running', 'EPA/rush', (t) => at(t).epa_rush, false, 'EPA/RB carry allowed', (t) => (dc(t).rushRB || {}).epa_per_rush, true, 'dec2'],
      ['Success rate', 'Success%', (t) => at(t).success_rate, false, 'Success% allowed', (t) => at(t).def_success_rate, true, 'pct'],
      ['Play action', 'PA EPA', (t) => at(t).pa_epa, false, 'PA EPA allowed', (t) => (dc(t).pass || {}).epa_allowed_pa, true, 'dec2'],
      ['Protection', 'Pressure% allowed', (t) => (S[t] || {}).prs, true, 'Pressure%', (t) => (dc(t).pass || {}).pressure_rate, false, 'pct'],
      ['WRs', 'WR PPR/G', (t) => (S[t] || {}).WR, false, 'PPR/G allowed to WRs', (t) => pos(t, 'WR'), true, 'dec1'],
      ['TEs', 'TE PPR/G', (t) => (S[t] || {}).TE, false, 'PPR/G allowed to TEs', (t) => pos(t, 'TE'), true, 'dec1'],
      ['RBs', 'RB PPR/G', (t) => (S[t] || {}).RB, false, 'PPR/G allowed to RBs',
        (t) => pos(t, 'RB') == null ? null : pos(t, 'RB') + ((dc(t).rushRB || {}).ppr_pg || 0), true, 'dec1'],
    ];
    const out = [];
    for (const [o, d] of [[away, home], [home, away]]) {
      for (const [name, ol, og, olow, dl, dg, dlow, f] of PAIRS) {
        const op = gamePct(teams, og, o, olow), dp = gamePct(teams, dg, d, dlow);
        if (op != null && dp != null) out.push({ name, off:o, def:d, ol, dl, ov:og(o), dv:dg(d), op, dp, gap:op - dp, f });
      }
    }
    return out.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)).slice(0, 5);
  }

  // Metric | away | home, each cell the value and its rank of 32 (#1 = highest).
  function gameSideTable(kind, rows, away, home, teams) {
    const cell = (r, t) => {
      const v = r.get(t), k = r.rank === false ? null : gameRank(teams, r.get, t);
      return h('td', { class:'right tnum' }, v == null ? '' : r.fmt === 'text' ? v : statFmt(v, r.fmt),
        k ? h('span', { class:'gm-rank' }, ` #${k}`) : null);
    };
    return h('table', { class:'data gm-side', dataset:{ side:kind } },
      h('thead', null, h('tr', null, h('th', null, kind === 'off' ? 'Offense' : 'Defense'),
        h('th', { class:'right' }, away), h('th', { class:'right' }, home))),
      h('tbody', null, ...rows.map(r => h('tr', { dataset:{ key:r.key } },
        h('th', { scope:'row', title:r.desc || '' }, r.label), cell(r, away), cell(r, home)))));
  }

  function gamePregame(main, away, home, season, week) {
    const A = window.ADVANCED, D = window.DEFENSE, teams = Object.keys(A.teams);
    const at = (t) => A.teams[t] || {}, dc = (t) => ((D && D.teams[t] || {}).cur) || {};
    // The line: Vegas, implied points and the season environment.
    const sched = (t) => ((((window.TEAM_SOS || {}).teams || {})[t] || {}).schedule || []).find(g => g.week === week);
    const env = (t) => teamEnv(t);
    const implied = [away, home].map(t => { const s = sched(t); return s && s.implied_pf != null ? `${t} ${s.implied_pf}${s.posted ? '' : ' (projected)'}` : null; }).filter(Boolean);
    const envs = [away, home].map(t => { const e = env(t); return e ? `${t} #${e.env_rank} of ${e.total} (${e.implied_pf} implied pts/G)` : null; }).filter(Boolean);
    const wx = gameWeatherFor(home);
    main.appendChild(h('div', { class:'card gm-line' },
      h('div', { class:'card-title' }, 'The line'),
      implied.length ? h('div', null, `Implied points this game: ${implied.join(', ')}.`) : null,
      envs.length ? h('div', { class:'tip' }, `Season scoring environment: ${envs.join('; ')}.`) : null));
    if (wx && wx.game_id === gameIdFor(season, week, home, away, true)) main.appendChild(weatherLine({ team:home }));

    // The five biggest edges.
    const edges = gameEdges(away, home);
    main.appendChild(h('div', { class:'card gm-edges' },
      h('div', { class:'card-title' }, 'Biggest edges'),
      edges.length ? h('ol', { class:'gm-edge-list' }, ...edges.map(e => h('li', { class:'gm-edge', dataset:{ gap:String(e.gap) } },
        h('span', { class:`gm-gap tnum ${e.gap >= 0 ? 'delta-up' : 'delta-down'}` }, `${e.gap > 0 ? '+' : ''}${e.gap}`),
        h('span', { class:'gm-edge-text' },
          h('strong', null, `${e.name}: ${e.gap >= 0 ? `${e.off} offense` : `${e.def} defense`}`),
          h('span', { class:'tip' }, ` ${e.off} ${e.ol} ${statFmt(e.ov, e.f)} (${gameOrd(e.op)} pct) vs ${e.def} ${e.dl} ${statFmt(e.dv, e.f)} (${gameOrd(e.dp)} pct)`)))))
        : h('div', { class:'tip' }, 'Not enough games yet to rank these teams.'),
      h('div', { class:'tip' }, 'Each edge is the offense\'s percentile at its job minus the defense\'s at its own, among the 32 teams, this season. Plus favors the offense.')));

    // Both units side by side.
    const col = (k) => A.teamColumns.find(c => c.key === k) || { key:k, label:k, fmt:'dec2' };
    const offRows = ['proe', 'early_down_pass_rate', 'play_action_rate', 'motion_rate', 'under_center_rate', 'epa_play', 'epa_pass', 'epa_rush',
      'success_rate', 'plays_pg'].map(k => { const c = col(k); return { key:k, label:c.label, desc:c.desc, fmt:c.fmt, get:(t) => at(t)[k] }; });
    const Df = (D && D.fields) || {}, byPos = (t, k) => ((dc(t).byPos || {})[k] || {}).ppr_pg;
    const defRows = [
      { key:'def_epa_play', label:'EPA/play allowed', desc:col('def_epa_play').desc, fmt:'dec2', get:(t) => at(t).def_epa_play },
      { key:'epa_db', label:'EPA/dropback allowed', desc:Df.pass_epa_per_dropback, fmt:'dec2', get:(t) => (dc(t).pass || {}).epa_per_dropback },
      { key:'pressure', label:'Pressure%', desc:Df.pass_pressure_rate, fmt:'pct', get:(t) => (dc(t).pass || {}).pressure_rate },
      { key:'blitz', label:'Blitz%', desc:Df.pass_blitz_rate, fmt:'pct', get:(t) => (dc(t).pass || {}).blitz_rate },
      { key:'epa_rb', label:'EPA/RB carry allowed', desc:Df.rb_rush_epa_per_rush, fmt:'dec2', get:(t) => (dc(t).rushRB || {}).epa_per_rush },
      ...['WR', 'TE', 'RB'].map(p => ({ key:`ppr_${p}`, label:`PPR/G to ${p}s`, desc:`${Df.ppr_pg || ''} #1 allows the most.`, fmt:'dec1', get:(t) => byPos(t, p) })),
      { key:'ppr_rbrush', label:'RB rushing PPR/G', desc:Df.rb_rush_ppr_pg, fmt:'dec1', get:(t) => (dc(t).rushRB || {}).ppr_pg },
      { key:'funnel', label:'Funnel', desc:Df.funnel, fmt:'text', rank:false, get:(t) => dc(t).funnel || null },
    ];
    main.appendChild(h('div', { class:'gm-pair' },
      h('div', { class:'card gm-card' }, h('div', { class:'card-title' }, `Offenses, ${A.season} through week ${A.throughWeek}`),
        h('div', { class:'tbl-scroll gm-side-wrap' }, gameSideTable('off', offRows, away, home, teams))),
      h('div', { class:'card gm-card' }, h('div', { class:'card-title' }, `Defenses, ${D ? `${D.season} through week ${D.throughWeek}` : ''}`),
        h('div', { class:'tbl-scroll gm-side-wrap' }, gameSideTable('def', defRows, away, home, Object.keys((D && D.teams) || {}))))));

    // Each team's skill players and their season usage.
    const colOf = (k) => A.columns.find(c => c.key === k) || { label:k, pos:[] }, lab = (k) => colOf(k).label, dsc = (k) => colOf(k).desc || '';
    const show = (k, p) => !(colOf(k).pos || []).length || colOf(k).pos.includes(p);   // no route rate or target share for a QB
    const ORDER = { QB:0, RB:1, WR:2, TE:3 }, ppr = A.logFields.indexOf('ppr');
    const pcols = [['games', 'int'], ['snap_pct', 'pct'], ['route_rate_est', 'pct'], ['target_share', 'pct'], ['targets', 'int'], ['carries', 'int']];
    const cards = [away, home].map(t => {
      const rows = Object.entries(A.players).filter(([, p]) => p.t === t && p.p in ORDER && p.games > 0
          && ((p.snap_pct || 0) >= 0.2 || (p.targets || 0) + (p.carries || 0) >= 4))
        .map(([sid, p]) => ({ sid, p, ppg:(p.wk || []).reduce((s, r) => s + (r[ppr] || 0), 0) / ((p.wk || []).length || p.games) }))
        .sort((a, b) => ORDER[a.p.p] - ORDER[b.p.p] || b.ppg - a.ppg);
      return h('div', { class:'card gm-card', dataset:{ team:t } }, h('div', { class:'card-title' }, `${t} skill players`),
        h('div', { class:'tbl-scroll gm-usage-wrap' }, h('table', { class:'data gm-usage' },
          h('thead', null, h('tr', null, h('th', null, 'Player'), ...pcols.map(([k]) => h('th', { class:'right', title:dsc(k) }, lab(k))),
            h('th', { class:'right', title:'Full PPR points per game played.' }, 'PPR/G'))),
          h('tbody', null, ...rows.map(r => h('tr', { class:'clickable', dataset:{ pid:r.sid }, onclick:() => openPlayerDetail(r.p.n, r.sid) },
            h('th', { scope:'row' }, `${r.p.n} `, h('span', { class:'muted' }, r.p.p)),
            ...pcols.map(([k, f]) => h('td', { class:'right tnum' }, show(k, r.p.p) ? statFmt(r.p[k], f) : '')),
            h('td', { class:'right tnum' }, statFmt(r.ppg, 'dec1'))))))));
    });
    main.appendChild(h('div', { class:'gm-pair' }, ...cards));
    main.appendChild(h('div', { class:'tip gm-foot' },
      `Season to date from nflverse play-by-play, FTN charting and PFR pressure. #N ranks the 32 teams from highest (#1) to lowest. Route% is an estimate: public route data ends in 2025. Skill players are ${away} and ${home} players with 20%+ of the snaps or 4+ targets and carries.`));
  }

  function gamePostgame(main, G, W, id) {
    const F = W.fields, fx = (k, t) => F[k].indexOf(t), side = (s) => s ? G.home : G.away;
    const P = (r, k) => r[fx('play', k)], Dv = (r, k) => r[fx('drive', k)], Rv = (r, k) => r[fx('rec', k)];
    const pctPts = (v) => v == null ? '' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}`;
    const when = (r) => `Q${P(r, 'qtr')} ${P(r, 'clock')}`;
    const tbl = (cls, head, rows) => h('div', { class:`tbl-scroll ${cls}-wrap` }, h('table', { class:`data ${cls}`, dataset:{ gid:id } },
      h('thead', null, h('tr', null, ...head.map(([l, t, r]) => h('th', { class:r ? 'right' : null, title:t || null }, l)))), h('tbody', null, ...rows)));

    // Top ten plays by win probability swing, credited to the side it helped.
    main.appendChild(h('div', { class:'card gm-card' }, h('div', { class:'card-title' }, 'Top 10 plays by win probability added'),
      tbl('gm-top', [['When'], ['Swing', 'Win probability points gained by the team the play helped.', true], ['Play']],
        G.top.map(i => { const r = G.plays[i], w = P(r, 'wpa'), t = side(w >= 0 ? P(r, 'side') : 1 - P(r, 'side'));
          return h('tr', null, h('td', { class:'tnum gm-when' }, when(r)), h('td', { class:'right tnum gm-swing' }, h('strong', null, `${t} ${pctPts(Math.abs(w))}%`)),
            h('td', { class:'gm-desc' }, P(r, 'desc'))); }))));

    // Drive chart. Yards are scrimmage yards, so each team's drives add to its offense.
    const tot = [0, 1].map(s => G.drives.filter(d => Dv(d, 'side') === s).reduce((a, d) => a + Dv(d, 'yds'), 0));
    const RES = { 'Touchdown':'td', 'Field goal':'fg', 'Turnover':'to', 'Turnover on downs':'to', 'Opp touchdown':'to', 'Safety':'to' };
    main.appendChild(h('div', { class:'card gm-card' }, h('div', { class:'card-title' }, 'Drive chart'),
      tbl('gm-drives', [['Team'], ['From, to'], ['Plays', '', true], ['Yds', 'Scrimmage yards: runs and passes, sacks in, penalties out.', true], ['Result']],
        G.drives.map(d => {
          const s = Dv(d, 'side'), yl = Dv(d, 'yl'), y = Dv(d, 'yds'), lo = Math.max(0, Math.min(yl, yl + y)), hi = Math.min(100, Math.max(yl, yl + y));
          return h('tr', { dataset:{ side:String(s) } }, h('td', { class:'gm-sit' }, h('strong', null, side(s)), h('span', { class:'gm-when tnum' }, `Q${Dv(d, 'qtr')} ${Dv(d, 'clock')}`)),
            h('td', { class:'gm-sit' }, h('span', null, Dv(d, 'start')), h('span', { class:'gm-when' }, Dv(d, 'end'))), h('td', { class:'right tnum' }, String(Dv(d, 'plays'))),
            h('td', { class:'right tnum gm-yds' }, String(y)),
            h('td', { class:'gm-result', title:`Time of possession ${Dv(d, 'top')}` }, Dv(d, 'result'),
              h('span', { class:`gm-field gm-${RES[Dv(d, 'result')] || 'other'}`, 'aria-hidden':'true' },
                h('span', { style:{ left:`${lo}%`, width:`${Math.max(1, hi - lo)}%` } }))));
        })),
      h('div', { class:'tip' }, `${G.away} ${tot[0]} yards on ${G.drives.filter(d => !Dv(d, 'side')).length} drives, ${G.home} ${tot[1]} on ${G.drives.filter(d => Dv(d, 'side')).length}. The bar runs from the offense's own goal line on the left.`)));

    // Every receiver's target line.
    const bySid = {};
    for (const [sid, p] of Object.entries(window.ADVANCED.players)) if (p.g) bySid[p.g] = [sid, p.n];
    main.appendChild(h('div', { class:'gm-pair' }, ...[0, 1].map(s => h('div', { class:'card gm-card', dataset:{ team:side(s) } },
      h('div', { class:'card-title' }, `${side(s)} targets`),
      tbl('gm-rec', [['Receiver'], ['Tgt', '', true], ['Rec', '', true], ['Yds', '', true], ['Air yds', 'Air yards on every target, caught or not.', true], ['EPA', 'EPA summed over his targets.', true]],
        G.rec.filter(r => Rv(r, 'side') === s).map(r => {
          const m = bySid[Rv(r, 'gsis')];
          return h('tr', m ? { class:'clickable', onclick:() => openPlayerDetail(m[1], m[0]) } : null, h('th', { scope:'row' }, m ? m[1] : Rv(r, 'name')),
            ...['tgt', 'rec', 'yds', 'air'].map(k => h('td', { class:'right tnum' }, String(Rv(r, k)))), h('td', { class:'right tnum' }, statFmt(Rv(r, 'epa'), 'dec2')));
        }))))));

    // The full play-by-play, a band per drive.
    let last = null;
    const rows = [];
    G.plays.forEach(r => {
      const d = P(r, 'drive');
      if (d >= 0 && d !== last) {
        const x = G.drives[d];
        rows.push(h('tr', { class:'gm-drive-row' }, h('td', { colspan:'5' },
          `${side(Dv(x, 'side'))} drive from ${Dv(x, 'start')}: ${Dv(x, 'plays')} plays, ${Dv(x, 'yds')} yds, ${Dv(x, 'result')}`)));
        last = d;
      }
      const w = P(r, 'wpa');
      rows.push(h('tr', { class:'gm-play' }, h('td', { class:'gm-sit' }, h('span', { class:'gm-when tnum' }, when(r)),
        P(r, 'down') ? h('span', null, `${gameOrd(P(r, 'down'))} & ${P(r, 'togo')}`) : null, h('span', null, P(r, 'yrdln'))),
        h('td', { class:'gm-desc' }, P(r, 'desc')), h('td', { class:'right tnum' }, statFmt(P(r, 'epa'), 'dec2')),
        h('td', { class:'right tnum' }, P(r, 'wp') == null ? '' : `${Math.round(P(r, 'wp') * 100)}%`),
        h('td', { class:`right tnum${w > 0.02 ? ' delta-up' : w < -0.02 ? ' delta-down' : ''}` }, pctPts(w))));
    });
    main.appendChild(h('div', { class:'card gm-card' }, h('div', { class:'card-title' }, 'Play-by-play'),
      tbl('gm-pbp', [['Situation'], ['Play'], ['EPA', 'Expected points added by the offense.', true],
        ['WP', 'The offense\'s win probability before the snap.', true], ['WPA', 'Win probability points the offense gained on the play.', true]], rows)));
    main.appendChild(h('div', { class:'tip gm-foot' }, `nflverse play-by-play: EPA and win probability from nflfastR's models. WP and WPA are the offense's.`));
  }

  function viewGame(id, tab) {
    const main = $('#main'); main.innerHTML = '';
    const m = GAME_ID_RE.exec(id || '');
    const again = () => viewGame(id, tab);
    const crumbs = (label) => main.appendChild(breadcrumbs([{ label:'Tools' }, { label:'Games', hash:'#games' }, { label }]));
    if (!m || !window.ADVANCED) {
      crumbs('Game');
      main.appendChild(h('div', { class:'empty' }, window.ADVANCED ? `"${id || ''}" is not a game id. They read like 2026_03_DAL_NYG.` : 'advanced.js not loaded.'));
      return;
    }
    const season = Number(m[1]), week = Number(m[2]), away = gameTeam(m[3]), home = gameTeam(m[4]), now = gameNow();
    crumbs(`${away} @ ${home}`);
    const opp = (((((window.TEAM_SOS || {}).teams || {})[away] || {}).schedule || []).find(g => g.week === week) || {});
    if (season === now.season && opp.opp && (opp.opp !== home || opp.home)) {
      main.appendChild(h('div', { class:'empty' }, `${away} does not play at ${home} in week ${week}.`));
      return;
    }
    const ix = gameLoad(`games-${season}.js`, () => gameIndex(season), again);
    if (ix === null) { main.appendChild(h('div', { class:'empty' }, 'Loading games...')); return; }
    const fin = ix ? gameIndex(season).games[id] : null;
    // A past game's pregame would be today's numbers, not what anyone knew then.
    const canPre = !fin || (season === now.season && week === now.week);
    const view = fin && !(tab === 'pregame' && canPre) ? 'post' : 'pre';
    const wx = gameWeatherFor(home);
    const kick = wx && wx.game_id === id && wx.kickoff
      ? new Date(wx.kickoff).toLocaleString([], { weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }) : null;
    main.appendChild(pageHeader({ eyebrow:`WEEK ${week}, ${season}`, title:`${away} @ ${home}`,
      sub:fin ? `Final: ${away} ${fin[3]}, ${home} ${fin[4]}.` : [kick, wx && wx.game_id === id ? wx.stadium : null].filter(Boolean).join(', ') || 'Not played yet.' }));
    if (fin && canPre) {
      main.appendChild(tabBar([{ key:'post', label:'Postgame' }, { key:'pre', label:'Pregame' }], view,
        (k) => `#game/${id}/${k === 'pre' ? 'pregame' : 'postgame'}`));
    }
    const host = h('div', { class:'gm-page', dataset:{ gid:id, view } });
    main.appendChild(host);
    if (view === 'pre') return gamePregame(host, away, home, season, week);
    const wk = gameLoad(`games-${season}-w${gameWk(week)}.js`, () => gameWeek(season, week), again);
    if (wk === null) { host.appendChild(h('div', { class:'empty' }, 'Loading the play-by-play...')); return; }
    const W = wk && gameWeek(season, week), G = W && W.games[id];
    if (!G) { host.appendChild(h('div', { class:'empty' }, `games-${season}-w${gameWk(week)}.js has no ${id}. Run projections/build_game_pages.py.`)); return; }
    gamePostgame(host, G, W, id);
  }

  // The Games list: this week's games, each to its game page, and every finished game before them.
  function viewGames() {
    const main = $('#main'); main.innerHTML = '';
    const { season, week } = gameNow(), W = window.WEATHER;
    const ix = gameLoad(`games-${season}.js`, () => gameIndex(season), viewGames), IX = ix ? gameIndex(season) : null;
    main.appendChild(breadcrumbs([{ label:'Tools' }, { label:'Games' }]));
    main.appendChild(pageHeader({ eyebrow:'GAMES', title:`Week ${week || ''} games`,
      sub:'Pregame: both teams side by side and the biggest edges. Postgame: drive chart, play-by-play with EPA and win probability, and every target.' }));
    const games = (W && W.games || []).slice().sort((a, b) => String(a.kickoff).localeCompare(String(b.kickoff)));
    if (!games.length) main.appendChild(h('div', { class:'empty' }, 'weather.js has no games this week. Run projections/build_game_weather.py.'));
    main.appendChild(h('div', { class:'gm-list' }, ...games.map(g => {
      const fin = IX && IX.games[g.game_id], away = gameTeam(g.away), home = gameTeam(g.home);
      const line = [g.spread_line == null ? null : g.spread_line === 0 ? 'Pick em' : `${g.spread_line > 0 ? home : away} by ${Math.abs(g.spread_line)}`,
        g.total_line != null ? `total ${g.total_line}` : null].filter(Boolean).join(', ');
      return h('a', { class:'card gm-tile', href:`#game/${g.game_id}`, dataset:{ gid:g.game_id } },
        h('span', { class:'gm-tile-teams' }, `${away} @ ${home}`),
        h('span', { class:'gm-tile-when tnum' }, fin ? `Final ${fin[3]}-${fin[4]}`
          : g.kickoff ? new Date(g.kickoff).toLocaleString([], { weekday:'short', hour:'numeric', minute:'2-digit' }) : ''),
        line ? h('span', { class:'tip' }, line) : null);
    })));
    if (ix === null) main.appendChild(h('div', { class:'tip' }, 'Loading finished games...'));
    if (!IX) return;
    for (const w of IX.weeks.slice().reverse()) {
      const ids = Object.keys(IX.games).filter(g => IX.games[g][0] === w && !games.some(x => x.game_id === g));
      if (!ids.length) continue;
      main.appendChild(h('div', { class:'card gm-week', dataset:{ week:String(w) } }, h('div', { class:'card-title' }, `Week ${w} finals`),
        h('div', { class:'gm-finals' }, ...ids.map(g => { const [, a, hm, as, hs] = IX.games[g];
          return h('a', { href:`#game/${g}`, class:'gm-final tnum', dataset:{ gid:g } }, `${a} ${as} @ ${hm} ${hs}`); }))));
    }
  }

  // ============================================================
  // Draft Room - live board for any Sleeper draft, mocks included
  // ============================================================
  // Sleeper serves any draft by id whether or not it belongs to a league, so a
  // mock (league_id null, metadata.type 'league_mock') reads exactly like a real
  // one. Mocks never show up in /user/<id>/drafts though, which is why this
  // takes a pasted URL instead of only listing them.
  const DRAFT_RECENT_KEY = 'ff-draft-recent-v1';
  // Fetched once per session and shared by the picker and the in-draft switcher,
  // so hopping between drafts never waits on a round trip.
  let _myDrafts = null, _myDraftsPromise = null;
  // Sleeper's draft status enum in words; the raw value printed "pre_draft".
  const DRAFT_STATUS = { pre_draft:'Pre-draft', drafting:'Drafting', paused:'Paused', complete:'Done' };
  const draftStatusLabel = (st) => DRAFT_STATUS[st] || String(st || '').replace(/_/g, ' ');
  function myDrafts() {
    if (_myDrafts) return Promise.resolve(_myDrafts);
    if (_myDraftsPromise) return _myDraftsPromise;
    const season = new Date().getFullYear();
    _myDraftsPromise = Promise.all([season, season - 1].map(y =>
      fetch(`https://api.sleeper.app/v1/user/${window.MY_USER_ID}/drafts/nfl/${y}`)
        .then(r => (r.ok ? r.json() : []))
        .then(list => (list || []).map(x => Object.assign({ _season: y }, x)))
        .catch(() => [])
    )).then(pairs => (_myDrafts = pairs.flat()));
    return _myDraftsPromise;
  }
  let _draftTimer = null;
  function stopDraftPoll() { if (_draftTimer) { clearInterval(_draftTimer); _draftTimer = null; } }
  // The countdown is its own 1s timer and NOT folded into the poll beat: the poll
  // cadence is 1s to 15s depending on how close your pick is, and a clock that
  // only moves when the poller fires reads as broken at the slow end. It repaints
  // two text nodes, so a second timer costs nothing.
  let _draftClockTimer = null;
  function stopDraftClock() { if (_draftClockTimer) { clearInterval(_draftClockTimer); _draftClockTimer = null; } }
  // Leaving the Draft Room has to undo more than the timer: the team drawer is
  // fixed-positioned and pads #main to stay clear of it, and that padding would
  // otherwise follow you to every other view.
  let _draftEscape = null;
  function teardownDraftView() {
    stopDraftPoll();
    stopDraftClock();
    if (_draftEscape) { document.removeEventListener('keydown', _draftEscape); _draftEscape = null; }
    const m = $('#main');
    if (m) m.style.paddingBottom = '';
  }
  function parseDraftId(s) { const m = String(s || '').match(/(\d{8,})/); return m ? m[1] : null; }
  function draftRecent() { try { return JSON.parse(localStorage.getItem(DRAFT_RECENT_KEY) || '[]'); } catch { return []; } }
  function draftRemember(id, label) {
    const list = draftRecent().filter(x => x.id !== id);
    list.unshift({ id, label, at: Date.now() });
    try { localStorage.setItem(DRAFT_RECENT_KEY, JSON.stringify(list.slice(0, 8))); } catch {}
  }

  // A draft publishes its own lineup shape and scoring type, so it can stand in
  // for a league object everywhere the points/VOR helpers want one. That is what
  // makes this work on a mock whose league we do not load. Sleeper gives only
  // `scoring_type` on a draft, not the full scoring map, so borrow the real map
  // when the draft belongs to a league we already have.
  function draftAsLeague(d) {
    const s = d.settings || {};
    const rp = [];
    const add = (n, tag) => { for (let i = 0; i < (n || 0); i++) rp.push(tag); };
    add(s.slots_qb, 'QB'); add(s.slots_rb, 'RB'); add(s.slots_wr, 'WR'); add(s.slots_te, 'TE');
    add(s.slots_flex, 'FLEX'); add(s.slots_super_flex, 'SUPER_FLEX');
    add(s.slots_lb, 'LB'); add(s.slots_db, 'DB'); add(s.slots_dl, 'DL'); add(s.slots_idp_flex, 'IDP_FLEX');
    add(s.slots_k, 'K'); add(s.slots_def, 'DEF'); add(s.slots_bn, 'BN');
    const lgId = d.league_id || (d.metadata || {}).league_id;
    const known = (window.LEAGUES || []).find(l => l.id === lgId);
    const recByType = { ppr: 1, half_ppr: 0.5, std: 0 }[(d.metadata || {}).scoring_type];
    return {
      id: `draft-${d.draft_id}`,
      name: (d.metadata || {}).name || 'Draft',
      roster_positions: rp,
      total_rosters: s.teams || 12,
      is_superflex: (s.slots_super_flex || 0) > 0,
      is_idp: ((s.slots_lb || 0) + (s.slots_db || 0) + (s.slots_dl || 0) + (s.slots_idp_flex || 0)) > 0,
      scoring: known ? known.scoring : { rec: recByType != null ? recByType : 1 },
      _knownLeague: known || null,
    };
  }

  // Snake order including Sleeper's reversal_round (3RR and friends): from the
  // reversal round on, every round runs the direction a plain snake would not.
  function snakePickNos(slot, teams, rounds, reversal) {
    const out = [];
    for (let r = 1; r <= rounds; r++) {
      let fwd = r % 2 === 1;
      if (reversal && r >= reversal) fwd = !fwd;
      out.push((r - 1) * teams + (fwd ? slot : teams - slot + 1));
    }
    return out;
  }

  // ===== Sleeper ADP =====
  // Sleeper does publish ADP, just not where you would look: it is on the
  // PROJECTIONS payload, not the stats one, and it never appears in the docs.
  // /v1/projections/nfl/regular/<season> carries twelve flavors keyed by format.
  // Key-free, CORS open, same host as everything else here.
  //
  // The raw payload is ~2.7 MB, so it is trimmed to the ADP fields of players
  // who are actually drafted (ADP under 400; Sleeper parks everyone else at 999)
  // and parked in sessionStorage at ~66 KB. Session, not local: ADP moves daily
  // in August and a stale board is worse than a second request.
  const ADP_KEYS = ['adp_ppr', 'adp_half_ppr', 'adp_std', 'adp_2qb',
    'adp_dynasty_ppr', 'adp_dynasty_half_ppr', 'adp_dynasty_std', 'adp_dynasty_2qb',
    'adp_idp', 'adp_idp_1qb', 'adp_rookie'];
  let _adpMap = null, _adpPromise = null;
  function sleeperAdp(season) {
    if (_adpMap) return Promise.resolve(_adpMap);
    if (_adpPromise) return _adpPromise;
    const ckey = `ff-sleeper-adp::${season}`;
    try {
      const raw = sessionStorage.getItem(ckey);
      if (raw) { _adpMap = JSON.parse(raw); return Promise.resolve(_adpMap); }
    } catch {}
    _adpPromise = fetch(`https://api.sleeper.app/v1/projections/nfl/regular/${season}`)
      .then(r => { if (!r.ok) throw new Error(`Sleeper returned ${r.status}`); return r.json(); })
      .then(all => {
        const out = {};
        for (const pid in all) {
          const v = all[pid]; if (!v) continue;
          let keep = null;
          for (const k of ADP_KEYS) if (v[k] != null && v[k] < 400) (keep = keep || {})[k] = v[k];
          if (keep) out[pid] = keep;
        }
        _adpMap = out;
        try { sessionStorage.setItem(ckey, JSON.stringify(out)); } catch {}
        return out;
      })
      .catch(() => (_adpMap = {}));
    return _adpPromise;
  }

  // Sleeper's ADP is per FORMAT, not per league, so the job is picking the flavor
  // this draft actually is. `player_type: 1` is a rookie-only draft and gets its
  // own board; `scoring_type` carries a `dynasty_` prefix on dynasty drafts.
  function adpKeyForDraft(d, lg) {
    const st = String((d.metadata || {}).scoring_type || 'ppr');
    if ((d.settings || {}).player_type === 1) return 'adp_rookie';
    if (lg.is_idp) return lg.is_superflex ? 'adp_idp' : 'adp_idp_1qb';
    const dyn = st.startsWith('dynasty');
    if (lg.is_superflex) return dyn ? 'adp_dynasty_2qb' : 'adp_2qb';
    const base = st.includes('half_ppr') ? 'half_ppr' : st.includes('std') ? 'std' : 'ppr';
    return dyn ? `adp_dynasty_${base}` : `adp_${base}`;
  }

  // ===== Your own board =====
  // An ordered list of sleeper ids, seeded from the derived full-PPR Gibbs board
  // and edited by hand. The ORDER is the truth and rank is its index, so there is
  // no way to end up with a gap or two players tied at 14. Global rather than
  // per-draft: it is your opinion, not a property of one room.
  const MY_RANKS_KEY = 'ff-my-rankings-v1';
  let _myRanks = null;
  function myRanksSeed() {
    const src = expertSources().find(s => s.id === 'gibbs-ppr-2026-08')
      || expertSources().find(s => s.id === 'gibbs');
    if (!src) return [];
    return (src.players || [])
      .filter(p => p.sleeperId)
      .slice()
      .sort((x, y) => (x.rank || 9999) - (y.rank || 9999))
      .map(p => String(p.sleeperId));
  }
  function myRanks() {
    if (_myRanks) return _myRanks;
    try {
      const raw = JSON.parse(localStorage.getItem(MY_RANKS_KEY) || 'null');
      if (raw && Array.isArray(raw.order) && raw.order.length) return (_myRanks = raw);
    } catch {}
    return (_myRanks = { order: myRanksSeed(), seededFrom: 'gibbs-ppr', updatedAt: null });
  }
  function saveMyRanks(order) {
    // De-dupe defensively: a drag that lands mid-repaint could otherwise leave a
    // player in the list twice, and every rank after him would read one too high.
    const seen = new Set(), clean = [];
    for (const pid of order) { const s = String(pid); if (!seen.has(s)) { seen.add(s); clean.push(s); } }
    _myRanks = { order: clean, seededFrom: myRanks().seededFrom, updatedAt: new Date().toISOString() };
    try { localStorage.setItem(MY_RANKS_KEY, JSON.stringify(_myRanks)); } catch {}
    return _myRanks;
  }
  function resetMyRanks() { pushMyRanksUndo(); _myRanks = null; try { localStorage.removeItem(MY_RANKS_KEY); } catch {} return myRanks(); }
  // Curating a 200-player board is a long sequence of small moves, and one bad
  // drag used to be unrecoverable short of resetting the whole thing. Snapshots
  // are just id arrays, so twenty of them cost nothing.
  let _myRanksUndo = [];
  function pushMyRanksUndo() {
    _myRanksUndo.push(myRanks().order.slice());
    if (_myRanksUndo.length > 20) _myRanksUndo.shift();
  }
  function undoMyRanks() {
    const prev = _myRanksUndo.pop();
    if (!prev) return false;
    _myRanks = null;                 // drop the cache so saveMyRanks reads fresh metadata
    saveMyRanks(prev);
    return true;
  }
  function myRanksUndoDepth() { return _myRanksUndo.length; }
  function myRankIndex() {
    const m = new Map();
    myRanks().order.forEach((pid, i) => m.set(String(pid), i + 1));
    return m;
  }
  // Put a player at a 1-based position, pulling him out of wherever he was.
  function moveMyRank(pid, pos) {
    pushMyRanksUndo();
    const order = myRanks().order.filter(x => String(x) !== String(pid));
    const at = Math.max(0, Math.min(order.length, Math.round(pos) - 1));
    order.splice(at, 0, String(pid));
    return saveMyRanks(order);
  }

  function myRankCell(r, reorderable, repaint, rememberFocus) {
    if (!r.pid) return h('td', { class:'right tnum muted' }, '·');
    const label = r.mine != null ? String(r.mine) : '+';
    const num = h('span', { class:`my-rank-num tnum${r.mine == null ? ' unranked' : ''}`,
      title: r.mine != null ? 'Click to type a new rank' : 'Not on your board. Click to add him at the end.' }, label);
    const grabbable = reorderable && r.mine != null;
    const cell = h('td', {
      class:`right my-rank${grabbable ? ' grabbable' : ''}`,
      tabindex: grabbable ? '0' : null,
      role: grabbable ? 'button' : null,
      'aria-label': grabbable ? `${r.name}, your rank ${r.mine}. Arrow keys move him, Enter types a rank.` : null,
      title: grabbable ? 'Drag, or focus and use arrow keys. Click the number to type a rank.' : null,
    },
      grabbable ? h('span', { class:'my-rank-grip', 'aria-hidden':'true' }, '⠿') : null,
      num);
    num.addEventListener('click', (e) => {
      e.stopPropagation();
      if (cell.dataset.dragged) { delete cell.dataset.dragged; return; }
      if (r.mine == null) { moveMyRank(r.pid, myRanks().order.length + 1); repaint(); return; }
      const input = h('input', { class:'my-rank-input tnum', type:'text', inputmode:'numeric', value:String(r.mine) });
      num.replaceWith(input);
      input.focus(); input.select();
      let done = false;
      const commit = (save) => {
        if (done) return;
        done = true;
        const value = parseInt(input.value, 10);
        if (save && Number.isFinite(value) && value > 0 && value !== r.mine) moveMyRank(r.pid, value);
        repaint();
      };
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); commit(true); }
        else if (event.key === 'Escape') { event.preventDefault(); commit(false); }
      });
      input.addEventListener('blur', () => commit(true));
    });
    if (grabbable) {
      cell.addEventListener('keydown', (event) => {
        const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
        if (step) {
          event.preventDefault();
          const to = r.mine + step * (event.shiftKey ? 10 : 1);
          if (to < 1) return;
          if (rememberFocus) rememberFocus(r.pid);
          moveMyRank(r.pid, to);
          repaint();
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          num.click();
        }
      });
    }
    return cell;
  }

  function wireMyRankReorder(tbody, repaint) {
    tbody.addEventListener('pointerdown', (event) => {
      const cell = event.target.closest('.my-rank.grabbable');
      if (!cell) return;
      const row = cell.closest('tr');
      if (!row || row.parentElement !== tbody) return;
      const startY = event.clientY;
      let dragging = false;
      const move = (moveEvent) => {
        if (!dragging) {
          if (Math.abs(moveEvent.clientY - startY) <= 4) return;
          dragging = true;
          row.classList.add('dragging');
          cell.dataset.dragged = '1';
          try { tbody.setPointerCapture(moveEvent.pointerId); } catch {}
        }
        moveEvent.preventDefault();
        const over = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest('tr');
        if (!over || over === row || over.parentElement !== tbody) return;
        const box = over.getBoundingClientRect();
        tbody.insertBefore(row, moveEvent.clientY > box.top + box.height / 2 ? over.nextSibling : over);
      };
      const up = () => {
        tbody.removeEventListener('pointermove', move);
        tbody.removeEventListener('pointerup', up);
        tbody.removeEventListener('pointercancel', up);
        if (!dragging) return;
        row.classList.remove('dragging');
        const ranked = myRankIndex();
        const visible = Array.from(tbody.children).map(tr => tr.dataset.pid).filter(pid => pid && ranked.has(pid));
        const visibleSet = new Set(visible);
        let index = 0;
        pushMyRanksUndo();
        saveMyRanks(myRanks().order.map(String).map(pid => visibleSet.has(pid) ? visible[index++] : pid));
        repaint();
      };
      tbody.addEventListener('pointermove', move);
      tbody.addEventListener('pointerup', up);
      tbody.addEventListener('pointercancel', up);
    });
  }

  // Which draft slot owns overall pick n.
  function draftSlotOfPick(n, teams, reversal) {
    const r = Math.ceil(n / teams);
    const idx = ((n - 1) % teams) + 1;
    let fwd = r % 2 === 1;
    if (reversal && r >= reversal) fwd = !fwd;
    return fwd ? idx : teams - idx + 1;
  }

  function viewDraft(idArg) {
    stopDraftPoll();
    const main = $('#main');
    main.innerHTML = '';
    const id = parseDraftId(idArg);
    if (!id) return draftPicker(main);

    main.appendChild(pageHeader({ eyebrow:'Tools', title:'Draft Room', sub:`Loading draft ${id} from Sleeper...` }));
    const shell = h('div');
    main.appendChild(shell);

    (async () => {
      let d;
      try {
        const r = await fetch(`https://api.sleeper.app/v1/draft/${id}`);
        if (!r.ok) throw new Error(`Sleeper returned ${r.status}`);
        d = await r.json();
      } catch (e) {
        shell.appendChild(h('div', { class:'empty' }, `Could not load draft ${id}: ${e.message}`));
        return;
      }
      if (!d || !d.draft_id) {
        shell.appendChild(h('div', { class:'empty' }, `No draft found for id ${id}.`));
        return;
      }
      draftRemember(id, (d.metadata || {}).name || `Draft ${id}`);
      main.innerHTML = '';
      renderDraftBoard(main, d);
    })();
  }

  // Landing page: paste a URL, reopen a recent one, or take one of the real
  // league drafts off Sleeper. Mocks can only arrive by paste.
  function draftPicker(main) {
    main.appendChild(pageHeader({
      eyebrow: 'Tools',
      title: 'Draft Room',
      sub: 'Live best-available board for any Sleeper draft, mock or real. Paste the draft URL.',
    }));

    const input = h('input', {
      type: 'search',
      placeholder: 'https://sleeper.com/draft/nfl/1397060035607035904',
      style: { flex:'1', minWidth:'260px' },
      onkeydown: (e) => { if (e.key === 'Enter') go(); },
    });
    const go = () => {
      const id = parseDraftId(input.value);
      if (!id) { toast('That does not look like a Sleeper draft URL or id', 'bad'); return; }
      navigate(`#draft/${id}`);
    };
    main.appendChild(h('div', { class:'card' },
      h('div', { class:'card-title' }, 'Open a draft'),
      h('div', { style:{ display:'flex', gap:'8px', flexWrap:'wrap', marginTop:'8px' } },
        input,
        h('button', { class:'primary', onclick: go }, 'Open'),
      ),
      h('div', { class:'tip', style:{ marginTop:'8px' } },
        'A mock works the same as a real draft. Mocks carry no league id, so they never appear in the list below and have to be pasted.'),
    ));

    const recent = draftRecent();
    if (recent.length) {
      main.appendChild(h('div', { class:'card' },
        h('div', { class:'card-title' }, 'Recent'),
        h('div', { class:'nav', style:{ marginTop:'6px' } },
          ...recent.map(r => h('a', { href:`#draft/${r.id}` },
            h('span', { class:'icon' }, '▣'),
            h('span', { class:'nav-label' }, r.label),
          )),
        ),
      ));
    }

    const mine = h('div', { class:'card' },
      h('div', { class:'card-title' }, 'My league drafts'),
      h('div', { class:'tip', style:{ marginTop:'6px' } }, 'Loading from Sleeper...'),
    );
    main.appendChild(mine);
    (async () => {
      const out = await myDrafts();
      mine.innerHTML = '';
      mine.appendChild(h('div', { class:'card-title' }, 'My league drafts'));
      if (!out.length) { mine.appendChild(h('div', { class:'tip' }, 'Sleeper returned no drafts.')); return; }
      const nav = h('div', { class:'nav', style:{ marginTop:'6px' } });
      for (const d of out) {
        const s = d.settings || {};
        nav.appendChild(h('a', { href:`#draft/${d.draft_id}` },
          h('span', { class:'icon' }, d.status === 'complete' ? '○' : '◉'),
          h('span', { class:'nav-label' }, `${(d.metadata || {}).name || d.draft_id} · ${d._season}`),
          h('span', { class:'nav-tag' }, `${s.teams || '?'}T ${draftStatusLabel(d.status)}`),
        ));
      }
      mine.appendChild(nav);
    })();
  }

  function renderDraftBoard(main, d) {
    const lg = draftAsLeague(d);
    const s = d.settings || {};
    const teams = s.teams || 12;
    const rounds = s.rounds || 15;
    const totalPicks = teams * rounds;
    const mySlot = (d.draft_order || {})[window.MY_USER_ID] || null;
    const myPickNos = mySlot ? snakePickNos(mySlot, teams, rounds, s.reversal_round) : [];
    const isMock = !d.league_id;

    // Board state, persisted per draft: a draft runs long enough that a reload
    // resetting the filters is a real cost. Kept out of paint() so a poll tick
    // cannot reset it either.
    const fkey = `ff-draft-view::${d.draft_id}`;
    const view = Object.assign(
      { pos:'ALL', sort:'vor', dir:'desc', proj:'blend', mode:'board', q:'',
        drawer:true, drawerH:420, tab:'avail' },
      (() => { try { return JSON.parse(localStorage.getItem(fkey) || '{}'); } catch { return {}; } })()
    );
    const persist = () => { try { localStorage.setItem(fkey, JSON.stringify(view)); } catch {} };
    // 420px of tray is a third of a laptop and 57% of a phone, and a height set
    // on the desktop follows the same browser profile onto the small screen. Cap
    // it by viewport rather than trusting the stored number.
    {
      const cap = Math.round(window.innerHeight * (window.innerWidth < 700 ? 0.42 : 0.72));
      if (view.drawerH > cap) view.drawerH = cap;
    }
    let picks = [];
    // `status` used to be read once at mount and never again, which meant a draft
    // that was not running still got polled forever: pre_draft every 20s waiting
    // for a start that changes nothing until it happens, paused every 2s, and a
    // draft that ended with unfilled slots never tripped the picks-complete stop
    // at all. Re-read it, and let it decide whether picks are worth asking for.
    let status = d.status;
    let liveWanted = true;
    const isTerminal = () => status === 'complete';
    const isRunning = () => !['pre_draft', 'paused', 'complete'].includes(status);

    const slotOwner = (slot) => {
      const uid = Object.keys(d.draft_order || {}).find(k => d.draft_order[k] === slot);
      if (uid && uid === window.MY_USER_ID) return window.MY_USERNAME || 'YOU';
      const known = lg._knownLeague;
      if (known && uid) {
        const r = (known.rosters || []).find(x => x.owner_id === uid);
        if (r) return r.team_name;
      }
      return `Team ${slot}`;
    };

    // Bye comes off the schedule, not off a ranking board: TEAM_SOS lists 17 of
    // 18 weeks and the gap is the bye. Reading it from Gibbs instead would leave
    // every player past his top 200 blank.
    const byeCache = {};
    const byeOf = (team) => {
      if (!(team in byeCache)) {
        const so = teamSos(team);
        if (!so) byeCache[team] = null;
        else {
          const have = new Set(so.schedule.map(g => g.week));
          let b = null;
          for (let w = 1; w <= 18; w++) if (!have.has(w)) { b = w; break; }
          byeCache[team] = b;
        }
      }
      return byeCache[team];
    };

    const sub = [
      `${teams}-team ${d.type}`,
      `${rounds} rounds`,
      (d.metadata || {}).scoring_type || 'ppr',
      lg.is_superflex ? 'superflex' : null,
      isMock ? 'mock' : 'league draft',
    ].filter(Boolean).join(' · ');
    const liveBtn = h('button', { onclick: () => { liveWanted = !liveWanted; pollMs = 0; setPoll(); paint(); } }, 'Live');
    // This view had no way out. The sidebar's Draft Room link does go to the
    // picker, but setActiveNav prefix-matches and renders it as the current
    // location, so the one working exit read as "you are here". Every other
    // nested view in this app carries breadcrumbs; this one now does too.
    main.appendChild(breadcrumbs([
      { label: 'Tools' },
      { label: 'Draft Room', hash: '#draft' },
      { label: (d.metadata || {}).name || `Draft ${d.draft_id}` },
    ]));
    // Jump straight between drafts. Without this, switching rooms meant going
    // back to the picker and starting over, and you carry five of them.
    const switcher = h('select', {
      title: 'Switch draft',
      'aria-label': 'Switch draft',
      onchange: (e) => { if (e.target.value) navigate(e.target.value); },
    }, h('option', { value:'' }, 'Switch draft…'));
    myDrafts().then((list) => {
      const seen = new Set([d.draft_id]);
      for (const o of list) {
        if (seen.has(o.draft_id)) continue;
        seen.add(o.draft_id);
        switcher.appendChild(h('option', { value:`#draft/${o.draft_id}` },
          `${(o.metadata || {}).name || o.draft_id} · ${o._season} · ${draftStatusLabel(o.status)}`));
      }
      for (const r of draftRecent()) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        switcher.appendChild(h('option', { value:`#draft/${r.id}` }, `${r.label} · recent`));
      }
      switcher.appendChild(h('option', { value:'#draft' }, 'All drafts …'));
    });
    main.appendChild(pageHeader({
      eyebrow: 'Tools · Draft Room',
      title: (d.metadata || {}).name || `Draft ${d.draft_id}`,
      sub,
      badge: mySlot ? `slot ${mySlot}` : 'no slot',
      actions: [
        h('a', { href:'#draft', class:'btn-exit', title:'Back to the Draft Room (Esc)' }, '← All drafts'),
        switcher,
        liveBtn,
        h('button', { onclick: () => tick(true) }, 'Refresh'),
        h('a', { href:`https://sleeper.com/draft/nfl/${d.draft_id}`, target:'_blank', rel:'noopener' }, 'Open in Sleeper'),
      ],
    }));
    // Escape is the reflex for leaving a full-screen tool. It was inert here.
    // Registered on mount and cleared by teardownDraftView so it cannot fire
    // from another view.
    _draftEscape = (e) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('.cmdk-backdrop, .modal-backdrop')) return;  // those own Escape
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      navigate('#draft');
    };
    document.addEventListener('keydown', _draftEscape);

    if (!lg._knownLeague) {
      main.appendChild(h('div', { class:'tip' },
        `Scoring comes from this draft's own "${(d.metadata || {}).scoring_type || 'ppr'}" setting. `
        + 'It belongs to no league loaded here, so per-league tweaks (an INT at -2, TE premium) are not applied. '
        + 'Kickers and defenses have no projection in this repo, so they never appear on the board.'));
    }

    // Above the drawer: the board only. Everything you act on lives in the tray.
    const kpis   = h('div', { class:'kpi-row' });
    // The clock KPI is built once and re-appended by paint(), because paint()
    // clears the row and a node rebuilt every second would drop the tabular
    // digits' width animation and re-trigger layout for the whole row.
    const clockNum = h('div', { class:'mini-kpi-num tnum' }, '-');
    const clockLab = h('div', { class:'mini-kpi-label' }, 'Clock');
    const clockKpi = h('div', { class:'mini-kpi' }, clockNum, clockLab);
    // Sleeper publishes no per-pick deadline, only `pick_timer` and, on the draft
    // object, `last_picked`. So the deadline is derived: clockStart is when the
    // current pick's clock began, taken from `last_picked` when a meta beat
    // brings one (authoritative, survives opening the room mid-draft) and from
    // the moment this client first SAW a pick land otherwise. The local fallback
    // can run up to one poll interval late, which is why the server value always
    // overwrites it rather than the other way round.
    let clockStart = null;
    function fmtClock(ms) {
      const t = Math.max(0, Math.round(ms / 1000));
      const hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = t % 60;
      const p = (n) => String(n).padStart(2, '0');
      return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${mm}:${p(ss)}`;
    }
    function paintClock() {
      const set = (num, label, color) => {
        clockNum.textContent = num;
        clockLab.textContent = label;
        clockNum.style.color = color || '';
      };
      if (isTerminal()) { clockKpi.style.display = 'none'; return; }
      clockKpi.style.display = '';
      if (status === 'pre_draft') {
        const st = Number(d.start_time || 0);
        // A start time in the past means Sleeper is waiting on the commissioner,
        // not that the draft is late; say waiting rather than count up.
        if (st > Date.now()) set(fmtClock(st - Date.now()), 'Starts in');
        else set('soon', 'Waiting to start');
        return;
      }
      if (status === 'paused') { set('paused', 'Pick clock'); return; }
      const timer = Number(s.pick_timer || 0);
      if (!timer) { set('none', 'Pick clock, untimed'); return; }
      if (!clockStart) { set(`${fmtClock(timer * 1000)}?`, 'Pick clock, unsynced'); return; }
      const left = clockStart + timer * 1000 - Date.now();
      const who = slotOwner(draftSlotOfPick(Math.min(picks.length + 1, totalPicks), teams, s.reversal_round));
      if (left <= 0) { set('0:00', `Overdue, ${who}`, 'var(--red)'); return; }
      set(fmtClock(left), `On the clock, ${who}`, left <= 15000 ? 'var(--red)' : (left <= 30000 ? 'var(--amber)' : ''));
    }
    const runsC  = h('div');
    const boardC = h('div', { class:'card' });
    main.appendChild(kpis);
    main.appendChild(runsC);
    main.appendChild(boardC);

    // ---- the tray: Sleeper's bottom sheet. Tabbed, collapsible from its own
    // bar, drag-resizable by that bar. It holds the two things you act on
    // mid-draft, so the board above it never has to scroll out of the way.
    // Lives inside #main so route() clearing the view removes it; the offset it
    // puts on #main is undone by teardownDraftView().
    const availPane  = h('div', { class:'draft-pane' });
    const teamPane   = h('div', { class:'draft-pane' });
    const filtersHost = h('div', { class:'draft-drawer-filters' });
    const drawerTabs = h('div', { class:'toggle-group draft-drawer-tabs' });
    const drawerSub  = h('span', { class:'draft-drawer-sub' });
    const drawerToggle = h('button', { class:'draft-drawer-toggle' }, '▾');
    const drawerHandle = h('div', { class:'draft-drawer-handle' },
      h('span', { class:'draft-drawer-grip', 'aria-hidden':'true' }),
      drawerTabs, drawerSub, drawerToggle);
    const drawerBody = h('div', { class:'draft-drawer-body' }, filtersHost, availPane, teamPane);
    const drawer = h('div', { class:'draft-drawer' }, drawerHandle, drawerBody);
    main.appendChild(drawer);

    function applyDrawer() {
      const open = !!view.drawer;
      const onAvail = view.tab === 'avail';
      drawerBody.style.display = open ? '' : 'none';
      drawerBody.style.height = open ? `${view.drawerH}px` : '0px';
      filtersHost.style.display = onAvail ? '' : 'none';
      availPane.style.display = onAvail ? '' : 'none';
      teamPane.style.display = onAvail ? 'none' : '';
      drawerHandle.classList.toggle('closed', !open);
      drawerToggle.textContent = open ? '▾' : '▴';
      drawerToggle.setAttribute('aria-expanded', String(open));
      for (const btn of drawerTabs.children) btn.classList.toggle('active', btn.dataset.tab === view.tab);
      // Keep the board's last rows reachable above the tray.
      main.style.paddingBottom = `${(open ? view.drawerH : 0) + 72}px`;
    }
    drawerToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      view.drawer = !view.drawer; persist(); applyDrawer();
    });
    for (const [k, label] of [['avail', 'Available'], ['team', 'Your team']]) {
      drawerTabs.appendChild(h('button', { class:'toggle', dataset:{ tab:k },
        onclick: (e) => {
          e.stopPropagation();
          // A tab tapped while the tray is shut opens it on that tab rather than
          // silently switching something you cannot see.
          view.tab = k; view.drawer = true; persist(); applyDrawer(); paint();
        } }, label));
    }
    // Drag the bar to resize, tap it to open/close. Pointer events so one
    // handler covers mouse and touch; the phone build gets the same tray.
    drawerHandle.addEventListener('pointerdown', (e) => {
      if (e.target === drawerToggle || e.target.closest('.draft-drawer-tabs')) return;
      const startY = e.clientY, startH = view.drawerH;
      let dragged = false;
      drawerHandle.setPointerCapture(e.pointerId);
      const move = (ev) => {
        if (Math.abs(ev.clientY - startY) > 4) dragged = true;
        if (!dragged || !view.drawer) return;
        view.drawerH = Math.max(140,
          Math.min(Math.round(window.innerHeight * 0.82), startH + (startY - ev.clientY)));
        applyDrawer();
      };
      const up = () => {
        drawerHandle.removeEventListener('pointermove', move);
        drawerHandle.removeEventListener('pointerup', up);
        drawerHandle.removeEventListener('pointercancel', up);
        // A press that never moved is a tap on the bar, which is how Sleeper
        // opens and closes its tray. Only an actual drag resizes.
        if (!dragged) view.drawer = !view.drawer;
        persist(); applyDrawer();
      };
      drawerHandle.addEventListener('pointermove', move);
      drawerHandle.addEventListener('pointerup', up);
      drawerHandle.addEventListener('pointercancel', up);
    });

    const projs = projByPid();
    const POSGROUPS = ['QB', 'RB', 'WR', 'TE'].concat(lg.is_idp ? ['LB', 'DB', 'DL'] : []);

    // ---- your own ranking column -------------------------------------------
    // Which player's rank cell should hold focus after the next repaint. A
    // keyboard move rebuilds the table, and without this the focus lands back on
    // the body and the second arrow press does nothing.
    let focusPid = null;
    // Two ways to edit, because they answer different questions. Typing a number
    // moves a player a long way ("he's actually my 4"); dragging nudges him past
    // the two guys he was next to. Dragging is only offered when the list IS the
    // ranking (sorted by Mine, ascending), because reordering rows in a
    // VOR-sorted table would mean nothing.
    function myRankCell(r, reorderable) {
      const label = r.mine != null ? String(r.mine) : '+';
      const num = h('span', { class:`my-rank-num tnum${r.mine == null ? ' unranked' : ''}`,
        title: r.mine != null ? 'Click to type a new rank' : 'Not on your board. Click to add him at the end.' }, label);
      const grabbable = reorderable && r.mine != null;
      const cell = h('td', {
        class:`right my-rank${grabbable ? ' grabbable' : ''}`,
        tabindex: grabbable ? '0' : null,
        role: grabbable ? 'button' : null,
        'aria-label': grabbable ? `${r.name}, your rank ${r.mine}. Arrow keys move him, Enter types a rank.` : null,
        title: grabbable ? 'Drag, or focus and use arrow keys. Click the number to type a rank.' : null,
      },
        grabbable ? h('span', { class:'my-rank-grip', 'aria-hidden':'true' }, '⣿') : null,
        num);
      num.addEventListener('click', (e) => {
        e.stopPropagation();
        // A drag that started on this cell also ends in a click. The drag handler
        // marks the row so the click can be ignored, or every reorder would drop
        // an edit box on the player you just moved.
        if (cell.dataset.dragged) { delete cell.dataset.dragged; return; }
        if (r.mine == null) { moveMyRank(r.pid, myRanks().order.length + 1); paint(); return; }
        const input = h('input', { class:'my-rank-input tnum', type:'text', inputmode:'numeric',
          value: String(r.mine) });
        num.replaceWith(input);
        input.focus(); input.select();
        let done = false;
        const commit = (save) => {
          if (done) return; done = true;
          const v = parseInt(input.value, 10);
          if (save && Number.isFinite(v) && v > 0 && v !== r.mine) moveMyRank(r.pid, v);
          paint();
        };
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') { ev.preventDefault(); commit(true); }
          else if (ev.key === 'Escape') { ev.preventDefault(); commit(false); }
        });
        input.addEventListener('blur', () => commit(true));
      });
      // Keyboard path. The drag handle is pointer-only, which left no way at all
      // to reorder the board without a mouse. Arrows move one slot, Shift+arrow
      // ten, so a long move does not need 40 keypresses.
      if (grabbable) {
        cell.addEventListener('keydown', (e) => {
          const step = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
          if (step) {
            e.preventDefault();
            const to = r.mine + step * (e.shiftKey ? 10 : 1);
            if (to < 1) return;
            focusPid = r.pid;            // paint() rebuilds the row; follow him
            moveMyRank(r.pid, to);
            paint();
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            num.click();
          }
        });
      }
      return cell;
    }

    // Read the new order back off the DOM rather than tracking indices during the
    // drag. Only the top slice of the board is on screen, so the visible pids are
    // slotted back into the positions they occupied in the full list and everyone
    // off screen keeps his rank exactly. Unranked rows carry no grip, so the
    // visible count always matches the slot count.
    function commitDomOrder(tbody) {
      const ranked = myRankIndex();
      const visible = Array.from(tbody.children)
        .map(tr => tr.dataset.pid)
        .filter(pid => pid && ranked.has(pid));
      const set = new Set(visible);
      let k = 0;
      const next = myRanks().order.map(String).map(pid => set.has(pid) ? visible[k++] : pid);
      pushMyRanksUndo();
      saveMyRanks(next);
      paint();
    }

    function wireReorder(tbody) {
      tbody.addEventListener('pointerdown', (e) => {
        // The whole rank cell is the handle, not just the grip glyph: a 10px
        // target was invisible in practice. Clicking the number to type still
        // works because a press that never moves is not a drag.
        const cell = e.target.closest('.my-rank.grabbable');
        if (!cell) return;
        const row = cell.closest('tr');
        if (!row || row.parentElement !== tbody) return;
        const startY = e.clientY;
        let dragging = false;
        const move = (ev) => {
          if (!dragging) {
            if (Math.abs(ev.clientY - startY) <= 4) return;
            dragging = true;
            row.classList.add('dragging');
            cell.dataset.dragged = '1';
            // Capture only once it IS a drag. Capturing on pointerdown retargets
            // the click that follows to the tbody, so a plain click on the rank
            // number never reached its own handler and typing a rank was dead.
            try { tbody.setPointerCapture(ev.pointerId); } catch {}
          }
          ev.preventDefault();
          // elementFromPoint rather than tracking offsets: the pane scrolls under
          // the pointer mid-drag and cached row rects go stale immediately.
          const el = document.elementFromPoint(ev.clientX, ev.clientY);
          const over = el && el.closest('tr');
          if (!over || over === row || over.parentElement !== tbody) return;
          const box = over.getBoundingClientRect();
          const after = ev.clientY > box.top + box.height / 2;
          tbody.insertBefore(row, after ? over.nextSibling : over);
        };
        const up = () => {
          tbody.removeEventListener('pointermove', move);
          tbody.removeEventListener('pointerup', up);
          tbody.removeEventListener('pointercancel', up);
          if (!dragging) return;
          row.classList.remove('dragging');
          commitDomOrder(tbody);
        };
        tbody.addEventListener('pointermove', move);
        tbody.addEventListener('pointerup', up);
        tbody.addEventListener('pointercancel', up);
      });
    }
    let lastBoardPicks = -1;
    const adpKey = adpKeyForDraft(d, lg);
    let adp = _adpMap || null;
    sleeperAdp(d.season || String(new Date().getFullYear())).then((m) => {
      if (adp) return;                 // already had it from the session cache
      adp = m; paint();
    });

    function paint() {
      const drafted = new Set(picks.map(p => String(p.player_id)));
      const made = picks.length;
      const onClock = Math.min(made + 1, totalPicks);
      const nextMine = myPickNos.find(n => n > made) || null;
      const myPicks = picks.filter(p => p.draft_slot === mySlot);
      const byPickNo = new Map(picks.map(p => [p.pick_no, p]));

      stampLive();

      const kpi = (num, label, color) => h('div', { class:'mini-kpi' },
        h('div', { class:'mini-kpi-num tnum', style: color ? { color } : null }, String(num)),
        h('div', { class:'mini-kpi-label' }, label));
      kpis.innerHTML = '';
      kpis.appendChild(kpi(`${made}/${totalPicks}`, 'Picks made'));
      kpis.appendChild(made >= totalPicks
        ? kpi('done', 'Status')
        : kpi(`#${onClock}`, `On the clock · ${slotOwner(draftSlotOfPick(onClock, teams, s.reversal_round))}`));
      kpis.appendChild(clockKpi);
      paintClock();
      if (nextMine) {
        const away = nextMine - made - 1;
        kpis.appendChild(kpi(`#${nextMine}`, `Your next pick · ${away === 0 ? 'you are up' : `${away} away`}`,
          away <= 2 ? 'var(--green)' : null));
      } else if (mySlot) {
        kpis.appendChild(kpi('·', 'Your next pick · none left'));
      }
      kpis.appendChild(kpi(String(myPicks.length), 'Your picks'));

      // ---- the board: teams across, rounds down, snake order in the cells.
      boardC.innerHTML = '';
      boardC.appendChild(h('div', { style:{ display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:'12px', flexWrap:'wrap', marginBottom:'8px' } },
        h('div', { class:'card-title' }, 'Board'),
        h('div', { class:'tip' }, made >= totalPicks ? 'Complete.'
          : `Round ${Math.ceil(onClock / teams)} of ${rounds}, pick ${((onClock - 1) % teams) + 1} of ${teams}.`)));
      const grid = h('div', { class:'draft-board',
        style:{ gridTemplateColumns: `repeat(${teams}, minmax(108px, 1fr))` } });
      for (let slot = 1; slot <= teams; slot++) {
        grid.appendChild(h('div', { class:`draft-head${slot === mySlot ? ' mine' : ''}` },
          h('div', { class:'draft-head-slot' }, `SLOT ${slot}`),
          h('div', { class:'draft-head-name', title: slotOwner(slot) }, slotOwner(slot))));
      }
      for (let r = 1; r <= rounds; r++) {
        let fwd = r % 2 === 1;
        if (s.reversal_round && r >= s.reversal_round) fwd = !fwd;
        for (let slot = 1; slot <= teams; slot++) {
          const idxInRound = fwd ? slot : teams - slot + 1;
          const no = (r - 1) * teams + idxInRound;
          const p = byPickNo.get(no);
          const m = (p && p.metadata) || {};
          const pos = m.position || '';
          const cls = ['draft-cell'];
          if (p) cls.push('filled', pos);
          if (slot === mySlot) cls.push('mine');
          if (no === onClock && made < totalPicks) cls.push('onclock');
          const bye = p ? byeOf(m.team) : null;
          const isTurn = fwd ? slot === teams : slot === 1;
          grid.appendChild(h('div', {
            class: cls.join(' '),
            title: p ? `#${no} · ${m.first_name || ''} ${m.last_name || ''}`.trim() : `#${no} · ${slotOwner(slot)}`,
            onclick: p ? () => openPlayerDetail(`${m.first_name || ''} ${m.last_name || ''}`.trim(), String(p.player_id)) : null,
          },
            h('div', { class:'draft-cell-top' },
              h('span', { class:'draft-cell-abs' }, p ? `#${no}` : ''),
              h('span', null, `${r}.${idxInRound}`)),
            p ? h('div', { class:'draft-cell-first' }, m.first_name || '') : null,
            p ? h('div', { class:'draft-cell-name' }, m.last_name || '') : null,
            p ? h('div', { class:'draft-cell-meta' },
              `${pos}-${m.team || 'FA'}${bye != null ? ` (${bye})` : ''}`) : null,
            p ? null : h('div', { class:'draft-cell-arrow' }, isTurn ? '↓' : (fwd ? '→' : '←')),
          ));
        }
      }
      const wrap = h('div', { class:'draft-board-wrap' }, grid);
      boardC.appendChild(wrap);
      // Follow the draft: scroll the current round into view when a pick lands,
      // but never fight a scroll the user just made.
      if (made !== lastBoardPicks) {
        lastBoardPicks = made;
        requestAnimationFrame(() => {
          const cur = wrap.querySelector('.draft-cell.onclock');
          if (cur) cur.scrollIntoView({ block:'center', inline:'nearest' });
        });
      }

      // ---- tray tab: your team
      let openSlots = [];
      let teamSummary = '';
      teamPane.innerHTML = '';
      if (!mySlot) {
        teamSummary = 'no slot in this draft';
        teamPane.appendChild(h('div', { class:'tip' }, 'You hold no slot in this draft, so there is no team to fill.'));
      } else {
        const assets = myPicks.map(p => {
          const hit = projs.get(String(p.player_id));
          const pts = hit ? projPoints(hit.p, lg, hit.p[view.proj] != null ? view.proj : 'blend') : null;
          const m = p.metadata || {};
          return { name: `${m.first_name || ''} ${m.last_name || ''}`.trim(), pos: m.position || '?',
            pts: pts || 0, v: pts || 0, pick: p.pick_no, team: m.team, bye: byeOf(m.team) };
        });
        const slots = offenseStartingSlots(lg);
        const bySlot = fillLineup(assets, slots, false, true);
        const starters = bySlot.filter(Boolean);
        const claimed = new Set(starters.map(a => a.pick));
        // The full roster template in Sleeper's own order, empties included: every
        // starting slot this draft posts, then the bench seats. K and DEF have no
        // projection in this repo so they never reach the board, which makes their
        // slot row the only place the draft admits they have to be filled.
        const SLOT_ALSO = { IDP_FLEX: ['LB', 'DB', 'DL'] };
        const OFFENSE_TAGS = new Set(['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX']);
        const template = lg.roster_positions || [];
        const slotRows = [];
        let oi = 0;
        for (const tag of template) {
          if (tag === 'BN') continue;
          if (OFFENSE_TAGS.has(tag)) { slotRows.push({ slot: tag, a: bySlot[oi] || null }); oi++; continue; }
          const takes = SLOT_ALSO[tag] || [tag];
          const hit = assets.find(a => takes.includes(a.pos) && !claimed.has(a.pick));
          if (hit) claimed.add(hit.pick);
          slotRows.push({ slot: tag, a: hit || null });
        }
        const benchSeats = template.filter(t => t === 'BN').length;
        // Pick order, not value order: the bench reads as a draft history that way,
        // and an overflowing bench (more bodies than seats) still shows every body.
        const benched = assets.filter(a => !claimed.has(a.pick)).sort((a, b) => a.pick - b.pick);
        for (let i = 0; i < Math.max(benchSeats, benched.length); i++) {
          slotRows.push({ slot: 'BN', a: benched[i] || null, over: i >= benchSeats });
        }
        // Bye collisions among the starters are a redraft-only problem and the
        // draft is the cheapest place to fix one.
        const byeCount = {};
        for (const a of starters) if (a.bye) byeCount[a.bye] = (byeCount[a.bye] || 0) + 1;
        const stacked = Object.entries(byeCount).filter(([, n]) => n >= 3);
        teamPane.appendChild(h('div', { class:'tip' },
          `Slot ${mySlot}. Your picks: ${myPickNos.join(', ')}.`));
        const label = (t) => (t === 'SUPER_FLEX' ? 'SFLEX' : t === 'IDP_FLEX' ? 'IDP' : t);
        teamPane.appendChild(h('table', { class:'data data-sticky snug' },
          h('thead', null, h('tr', null,
            h('th', null, 'Slot'), h('th', null, 'Player'), h('th', null, 'Tm'),
            h('th', { class:'right' }, 'Bye'), h('th', { class:'right' }, 'Pick'), h('th', { class:'right' }, 'Pts'))),
          h('tbody', null,
            ...slotRows.map((r) => {
              const a = r.a;
              const cls = [!a ? 'muted' : null, r.slot === 'BN' && a ? 'muted' : null].filter(Boolean).join(' ');
              return h('tr', { class: cls || null },
                h('td', null, h('strong', null, label(r.slot) + (r.over ? '+' : ''))),
                h('td', null, a
                  ? h('span', null, posChip(a.pos), ' ', a.name)
                  : (r.slot === 'BN' ? 'open seat' : 'empty')),
                h('td', null, a ? teamChip(a.team) : ''),
                h('td', { class:'right tnum', style: a && a.bye && byeCount[a.bye] >= 3 ? { color:'var(--amber)' } : null },
                  a && a.bye != null ? String(a.bye) : '·'),
                h('td', { class:'right tnum' }, a ? `#${a.pick}` : '·'),
                h('td', { class:'right tnum' }, a && a.pts ? a.pts.toFixed(1) : '·'));
            }),
          )));
        // The holes are read straight off the slot-aligned fill now, so two RB
        // slots with one RB in them report one hole rather than none.
        openSlots = slots.map((sl, i) => (bySlot[i] ? null : sl.pos)).filter(Boolean);
        const total = starters.reduce((t, a) => t + a.pts, 0).toFixed(1);
        teamSummary = `${myPicks.length} picks · starters ${starters.length}/${slots.length} · ${total} pts`
          + ` · bench ${Math.min(benched.length, benchSeats)}/${benchSeats}`
          + (openSlots.length ? ` · open: ${openSlots.join(', ')}` : ' · lineup full')
          + (stacked.length ? ` · bye stack wk ${stacked.map(([w]) => w).join('/')}` : '');
      }
      // Which position groups still fill a hole in the starting lineup.
      const needGroups = new Set();
      for (const sl of openSlots) for (const p of (SLOT_TAKES[sl] || [sl])) needGroups.add(p);

      // ---- positional run detector: what the room has been taking lately
      runsC.innerHTML = '';
      if (made >= 4) {
        const recent = picks.slice(-10);
        const counts = {}, gone = {};
        for (const p of recent) {
          const g = projPosGroup((p.metadata || {}).position || '?');
          counts[g] = (counts[g] || 0) + 1;
        }
        for (const p of picks) {
          const g = projPosGroup((p.metadata || {}).position || '?');
          gone[g] = (gone[g] || 0) + 1;
        }
        runsC.appendChild(h('div', { class:'filters', style:{ marginBottom:'12px' } },
          h('label', null, `Last ${recent.length} picks`),
          ...POSGROUPS.map(g => h('span', { class:'pill',
            style: (counts[g] || 0) >= 4 ? { color:'var(--amber)', borderColor:'var(--amber)' } : null,
            title:`${counts[g] || 0} of the last ${recent.length} picks, ${gone[g] || 0} gone overall` },
            `${g} ${counts[g] || 0}`)),
          h('span', { class:'spacer' }),
          h('label', null, 'Gone'),
          ...POSGROUPS.map(g => h('span', { class:'pill' }, `${g} ${gone[g] || 0}`)),
        ));
      }

      // ---- tray tab: best available -------------------------------------
      const rows = [];
      const myIdx = myRankIndex();
      for (const [pid, hit] of projs) {
        if (drafted.has(pid)) continue;
        if (hit.unit === 'defense' && !lg.is_idp) continue;
        const p = hit.p;
        const grp = projPosGroup(p.pos);
        if (!POSGROUPS.includes(grp)) continue;
        const useSrc = p[view.proj] != null ? view.proj : 'blend';
        const pts = projPoints(p, lg, useSrc);
        if (pts == null) continue;
        const team = (window.PLAYERS[pid] || {}).team || p.team;
        const ranked = rankIndex().bySleeperId.get(pid);
        const so = teamSos(team);
        const mp = mispricingIndex().get(pid);
        rows.push({ pid, name: p.name, pos: p.pos, grp, team, pts, proj: p,
          vor: vorByPid(pid, lg, useSrc),
          bye: byeOf(team),
          age: ageOf(pid, ranked ? ranked.age : null),
          sos: so ? so.off_sos_rank : null,
          gap: mp ? mp.gap : null,
          ppslp: ppEdgeByPid(pid),
          dyn: ranked ? tierValue(ranked, lg) : null,
          adp: (adp && adp[pid] && adp[pid][adpKey] != null) ? adp[pid][adpKey] : null,
          mine: myIdx.get(pid) || null,
          ranked });
      }
      // Tier cliff: points from here to the next available body at the same
      // position. This is the number that actually decides a redraft pick, and
      // it has to be computed over the WHOLE pool before any filter, or a
      // position filter would make every drop read as zero.
      const byGrp = {};
      for (const r of rows) (byGrp[r.grp] = byGrp[r.grp] || []).push(r);
      const roundNow = Math.ceil(onClock / teams);
      for (const g in byGrp) {
        const arr = byGrp[g].sort((a, b) => b.pts - a.pts);
        arr.forEach((r, i) => {
          r.posRankAvail = i + 1;
          // Gated on being above replacement. Below it the gap to the next
          // body is real arithmetic and a useless signal: sorting by Drop
          // ungated surfaced QB34 with a 42-point cliff and a -190 VOR.
          r.drop = (r.vor != null && r.vor > 0 && i + 1 < arr.length)
            ? Math.round((r.pts - arr[i + 1].pts) * 10) / 10 : null;
          // Value against the market: where the field drafts him minus where the
          // board actually is. Positive = he has slid past his ADP. This replaced
          // a position-rank-vs-round proxy that existed only because no market
          // number was on hand.
          r.val = (made && r.adp != null) ? Math.round((r.adp - onClock) * 10) / 10 : null;
        });
      }

      const shown = rows.filter(r => {
        if (view.pos === 'FLEX') { if (!['RB', 'WR', 'TE'].includes(r.grp)) return false; }
        else if (view.pos !== 'ALL' && r.grp !== view.pos) return false;
        if (view.q && !norm(r.name).includes(norm(view.q))) return false;
        return true;
      });

      const dir = view.dir === 'desc' ? -1 : 1;
      const numAsc = (a, b, f, miss) => {
        const av = f(a) == null ? miss : f(a), bv = f(b) == null ? miss : f(b);
        return (av - bv) * dir;
      };
      const cmp = (a, b) => {
        if (typeof view.sort === 'string' && view.sort.startsWith('xr:')) {
          const src = expertSources().find(x => x.id === view.sort.slice(3));
          const rk = (r) => (src && expertRankOf(src, r.name, r.pid)) || 9999;
          return (rk(a) - rk(b)) * dir;
        }
        switch (view.sort) {
          case 'pts':   return numAsc(a, b, r => r.pts, -1e9);
          case 'vor':   return numAsc(a, b, r => r.vor, -1e9);
          case 'drop':  return numAsc(a, b, r => r.drop, -1e9);
          case 'mine':  return numAsc(a, b, r => r.mine, 9999);
          case 'adp':   return numAsc(a, b, r => r.adp, 9999);
          case 'val':   return numAsc(a, b, r => r.val, -1e9);
          case 'gap':   return numAsc(a, b, r => r.gap, -1e9);
          case 'ppslp': return numAsc(a, b, r => r.ppslp, -1e9);
          case 'dyn':   return numAsc(a, b, r => r.dyn, -1e9);
          case 'age':   return numAsc(a, b, r => r.age, 99);
          case 'bye':   return numAsc(a, b, r => r.bye, 99);
          case 'sos':   return numAsc(a, b, r => r.sos, 99);
          case 'pos':   return (`${a.grp}|${String(a.posRankAvail).padStart(3, '0')}`)
                          .localeCompare(`${b.grp}|${String(b.posRankAvail).padStart(3, '0')}`) * dir;
          case 'name':  return a.name.localeCompare(b.name) * dir;
          default:      return numAsc(a, b, r => r.vor, -1e9);
        }
      };
      shown.sort(cmp);
      const LIMIT = 150;
      const list = shown.slice(0, LIMIT);

      // Filters sit above the scroll, not inside it, so they stay put while the
      // table moves. Rebuilt each paint; the search box keeps focus because it
      // is only replaced when the pane is, and the pane is not focus-bearing.
      const focused = document.activeElement === filtersHost.querySelector('input[type=search]');
      const caret = focused ? filtersHost.querySelector('input[type=search]').selectionStart : null;
      filtersHost.innerHTML = '';
      const grpBtns = (options, key) => {
        const g = h('div', { class:'toggle-group' });
        for (const [k, lbl, title] of options) {
          g.appendChild(h('button', { class:`toggle ${view[key] === k ? 'active' : ''}`, title: title || null,
            onclick: () => { view[key] = k; persist(); paint(); } }, lbl));
        }
        return g;
      };
      const searchBox = h('input', { type:'search', placeholder:'Is he still there?', value: view.q,
        oninput: (e) => { view.q = e.target.value.trim(); persist(); paint(); } });
      filtersHost.appendChild(h('div', { class:'filters' },
        h('div', { class:'group' }, h('label', null, 'Search'), searchBox),
        h('div', { class:'group' }, h('label', null, 'Pos'),
          grpBtns([['ALL', 'ALL']].concat(POSGROUPS.map(g => [g, g]), lg.is_idp ? [] : [['FLEX', 'FLEX']]), 'pos')),
        h('div', { class:'group' }, h('label', null, 'Proj Src'),
          grpBtns([['blend', 'Blended'], ['pp', 'PP', 'PrizePicks / Vegas market, offense only'],
            ['sleeper', 'Sleeper'], ['clay', 'Clay', 'IDP only']], 'proj')),
        h('span', { class:'spacer' }),
        h('div', { class:'group' }, h('label', null, 'My board'),
          h('button', {
            class: `toggle ${view.sort === 'mine' ? 'active' : ''}`,
            title: 'Sort by your own ranking. Drag handles appear so you can reorder.',
            onclick: () => { view.sort = 'mine'; view.dir = 'asc'; persist(); paint(); },
          }, view.sort === 'mine' && view.dir === 'asc' ? 'Editing' : 'Edit'),
          h('button', {
            disabled: myRanksUndoDepth() ? null : '',
            title: myRanksUndoDepth() ? `Undo the last change (${myRanksUndoDepth()} steps back available)` : 'Nothing to undo yet',
            onclick: () => { if (undoMyRanks()) { toast('Reverted'); paint(); } },
          }, 'Undo'),
          h('button', {
            title: `Throw away your edits and re-seed from the full-PPR Gibbs board (${myRanks().order.length} players).`,
            onclick: () => {
              if (!confirm('Reset your rankings to the full-PPR Gibbs board? Your edits are lost.')) return;
              resetMyRanks(); toast('Rankings reset to the Gibbs full-PPR board'); paint();
            },
          }, 'Reset')),
        h('div', { class:'group' }, h('label', null, 'View'),
          grpBtns([['board', 'Table'], ['sos', 'SOS (schedule)']], 'mode')),
      ));
      if (view.sort === 'mine' && view.dir === 'asc' && view.mode !== 'sos') {
        filtersHost.appendChild(h('div', { class:'tip', style:{ margin:'-4px 0 8px' } },
          'Editing your board: drag a row by its Mine cell, or focus it and use the arrow keys '
          + '(Shift for ten). Click the rank number to type one. '
          + `${myRanks().order.length} ranked${myRanks().updatedAt ? ', edited ' + ymd(myRanks().updatedAt.slice(0, 10)) : ', straight off Gibbs'}.`));
      }
      if (focused) { searchBox.focus(); try { searchBox.setSelectionRange(caret, caret); } catch {} }

      const sortHdr = (key, label, opts = {}) => {
        const active = view.sort === key;
        const arrow = active ? (view.dir === 'desc' ? ' ↓' : ' ↑') : '';
        return h('th', {
          class: `clickable${active ? ' sort-active' : ''}${opts.right ? ' right' : ''}${opts.center ? ' center' : ''}`,
          title: opts.title,
          onclick: () => {
            if (view.sort === key) view.dir = view.dir === 'asc' ? 'desc' : 'asc';
            else {
              view.sort = key;
              // Ranks, ages, byes and schedule ranks read best low-first;
              // everything else is a "more is better" number.
              view.dir = ['age', 'bye', 'sos', 'pos', 'name', 'adp', 'mine'].includes(key)
                || (typeof key === 'string' && key.startsWith('xr:')) ? 'asc' : 'desc';
            }
            persist(); paint();
          },
        }, label + arrow);
      };

      let tbl;
      if (view.mode === 'sos') {
        // The 18-week grid, same as the Players tab. In a redraft draft this is
        // how you see a bye collision or a brutal playoff-week schedule before
        // you take the player, not after.
        const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);
        const schedCache = {};
        const schedFor = (team) => {
          if (!(team in schedCache)) {
            const so = teamSos(team), m = {};
            if (so) for (const g of so.schedule) m[g.week] = g;
            schedCache[team] = m;
          }
          return schedCache[team];
        };
        tbl = h('table', { class:'data data-sticky', style:{ fontSize:'11px' } },
          h('thead', null, h('tr', null,
            h('th', { class:'right' }, '#'), sortHdr('name', 'Player'), sortHdr('pos', 'Pos'),
            h('th', null, 'Tm'), sortHdr('vor', 'VOR', { right:true }),
            ...WEEKS.map(w => h('th', { class:'center' }, `W${w}`)))),
          h('tbody', null, ...list.map((r, i) => {
            const sm = schedFor(r.team);
            return h('tr', { onclick: () => openPlayerDetail(r.name, r.pid) },
              h('td', { class:'right tnum muted' }, String(i + 1)),
              h('td', null, h('span', { class:'name' }, r.name)),
              h('td', null, posChip(r.pos)),
              h('td', null, teamChip(r.team)),
              h('td', { class:'right tnum' }, r.vor != null ? `${r.vor > 0 ? '+' : ''}${r.vor.toFixed(1)}` : '·'),
              ...WEEKS.map(w => {
                const g = sm[w];
                if (!g) return h('td', { class:'center muted', style:{ fontSize:'9px' } }, 'BYE');
                const e = teamEnv(g.opp), v = e ? e.implied_pa : null;
                return h('td', { class:'center', style:{ color: defColor(g.opp), lineHeight:1.05 },
                  title:`Wk${w} ${g.home ? 'vs ' : '@ '}${g.opp}: opponent D allows ${v != null ? v : '?'} pts/g (#${e ? e.pa_rank : '?'} of 32)` },
                  h('div', { style:{ fontWeight:700 } }, g.opp),
                  h('div', { style:{ fontSize:'9px', opacity:.85 } }, v != null ? fmt.decimal(v, 0) : ''));
              }));
          })));
      } else {
        const OFFCOLS = [['pass_yd', 'PaYd'], ['pass_td', 'PaTD'], ['pass_int', 'INT'], ['rush_yd', 'RuYd'],
          ['rush_td', 'RuTD'], ['rec', 'Rec'], ['rec_yd', 'ReYd'], ['rec_td', 'ReTD']];
        // Rows are only draggable when the table order and the ranking are the
        // same thing. Any other sort and a drag would have nothing to mean.
        const reorderable = view.sort === 'mine' && view.dir === 'asc';
        tbl = h('table', { class:'data data-sticky' },
          h('thead', null, h('tr', null,
            h('th', { class:'right', style:{ width:'38px' }, title:'Position in current sort' }, '#'),
            sortHdr('mine', 'Mine', { right:true, title:'Your own ranking. Click the number to type a new one; sort by this column to drag rows. Seeded from the full-PPR Gibbs board and saved in this browser.' }),
            sortHdr('name', 'Player'),
            sortHdr('pos', 'Pos', { title:'Position, with rank among players still available' }),
            h('th', null, 'Team'),
            sortHdr('bye', 'Bye', { right:true, title:'Bye week, derived from the schedule' }),
            sortHdr('age', 'Age', { right:true }),
            sortHdr('pts', 'Proj', { right:true, title:'Season points under this draft’s scoring, from the selected Proj Src' }),
            sortHdr('vor', 'VOR', { right:true, title:'Value over replacement in THIS lineup shape. The only cross-position comparable column, and the right default sort.' }),
            sortHdr('drop', 'Drop', { right:true, title:'Points from him to the next player still available at his position. A big Drop is a tier cliff: take him now or lose the tier.' }),
            h('th', { class:'center', style:{ width:'44px' }, title:'Fills a starting slot you have not filled yet' }, 'Need'),
            sortHdr('adp', 'ADP', { right:true, title:`Sleeper's own average draft position for this format (${adpKey.replace('adp_', '')}), fetched live. Blank means the field does not draft him.` }),
            made ? sortHdr('val', 'Val', { right:true, title:'ADP minus the pick on the clock. Positive means he has slid past where the field takes him.' }) : null,
            sortHdr('gap', 'Gap', { right:true, title:'Dynasty-value rank minus season-projection rank. + = produces above his price.' }),
            sortHdr('ppslp', 'PP−Slp', { right:true, title:'PrizePicks vs Sleeper positional rank difference. + = the Vegas market ranks him higher than the public model.' }),
            sortHdr('sos', 'SOS', { right:true, title:'Season offensive strength of schedule rank, 1 = easiest' }),
            ...activeExpertSources().map(src => sortHdr('xr:' + src.id, expertColLabel(src),
              { right:true, title:`${src.expert || src.label} · ${src.title || 'rankings'}${src.updatedAt ? ', updated ' + src.updatedAt : ''}` })),
            h('th', { class:'center', style:{ width:'40px' }, title:'Our tier, dynasty context' }, 'Tier'),
            sortHdr('dyn', 'Dyn', { right:true, title:'KTC dynasty value. Context only on a one-year board.' }),
            ...OFFCOLS.map(([, l]) => h('th', { class:'right' }, l)),
          )),
          h('tbody', null, ...list.map((r, i) => {
            const line = (r.proj.stats && r.proj.stats[r.proj[view.proj] != null ? view.proj : 'blend']) || {};
            const need = needGroups.has(r.grp);
            return h('tr', { dataset:{ pid: r.pid }, class: reorderable ? 'draft-reorder' : '',
              onclick: (e) => { if (!e.target.closest('.my-rank')) openPlayerDetail(r.name, r.pid); } },
              h('td', { class:'right tnum muted' }, String(i + 1)),
              myRankCell(r, reorderable),
              h('td', null, h('div', { class:'name-cell' }, h('span', { class:'name' }, r.name))),
              h('td', null, h('div', { style:{ display:'flex', alignItems:'center', gap:'6px' } },
                posChip(r.pos), h('span', { class:'tip tnum' }, `${r.grp}${r.posRankAvail}`))),
              h('td', null, h('span', { class:'draft-team-cell' }, teamChip(r.team), envChip(r.team))),
              h('td', { class:'right tnum' }, r.bye != null ? String(r.bye) : h('span', { class:'muted' }, '·')),
              h('td', { class:'right tnum' }, r.age != null ? fmt.decimal(r.age, 1) : h('span', { class:'muted' }, '·')),
              h('td', { class:'right tnum' }, fmt.decimal(r.pts, 1)),
              h('td', { class:'right' }, vorChip(r.pid, lg, r.proj[view.proj] != null ? view.proj : 'blend') || h('span', { class:'muted' }, '·')),
              h('td', { class:'right tnum', style: r.drop != null && r.drop >= 15 ? { color:'var(--amber)', fontWeight:700 } : null },
                r.drop != null ? fmt.decimal(r.drop, 1) : h('span', { class:'muted' }, '·')),
              h('td', { class:'center' }, need ? h('span', { class:'pill', style:{ color:'var(--green)', borderColor:'var(--green)' } }, r.grp) : h('span', { class:'muted' }, '·')),
              h('td', { class:'right tnum' }, r.adp != null ? fmt.decimal(r.adp, 1) : h('span', { class:'muted' }, '·')),
              made ? h('td', { class:'right tnum' }, r.val == null ? h('span', { class:'muted' }, '·')
                : h('span', { class: r.val >= 12 ? 'rank-up' : r.val <= -12 ? 'rank-down' : '' },
                  `${r.val > 0 ? '+' : ''}${fmt.decimal(r.val, 0)}`)) : null,
              h('td', { class:'right' }, mispriceChip(r.pid) || h('span', { class:'muted' }, '·')),
              h('td', { class:'right' }, ppEdgeChip(r.pid) || h('span', { class:'muted' }, '·')),
              h('td', { class:'right tnum', style:{ color: r.sos != null && r.sos <= 10 ? 'var(--green)' : r.sos != null && r.sos >= 23 ? 'var(--red)' : 'var(--fg-2)' } },
                r.sos != null ? String(r.sos) : h('span', { class:'muted' }, '·')),
              ...expertCells(r.name, r.pid),
              h('td', { class:'center' }, ourTierChip(r.pid) || (r.ranked ? tierChip(r.ranked.tier, r.ranked.category) : h('span', { class:'muted' }, '·'))),
              h('td', { class:'right tnum muted' }, r.dyn != null ? fmt.decimal(r.dyn, 1) : '·'),
              ...OFFCOLS.map(([k]) => h('td', { class:'right tnum', style:{ color:'var(--fg-2)' } },
                line[k] != null ? fmt.decimal(line[k], k.endsWith('_yd') ? 0 : 1) : h('span', { class:'muted' }, '·'))),
            );
          })));
      }
      // A pick landing repaints the whole table. Without this you get yanked back
      // to the top of the board every few seconds mid-draft.
      const keepScroll = availPane.scrollTop;
      availPane.innerHTML = '';
      availPane.appendChild(tbl);
      availPane.scrollTop = keepScroll;
      if (view.mode !== 'sos' && view.sort === 'mine' && view.dir === 'asc') {
        const tb = tbl.querySelector('tbody');
        if (tb) wireReorder(tb);
      }

      // The tray bar carries whichever summary matches the open tab.
      drawerSub.textContent = view.tab === 'avail'
        ? `${shown.length} available${shown.length > list.length ? `, top ${list.length} shown` : ''}`
          + ` · sorted by ${String(view.sort).replace('xr:', '')}`
          + ` · ADP ${adp ? adpKey.replace('adp_', '') : 'loading'}`
        : teamSummary;
      applyDrawer();
      const refocus = focusPid;
      focusPid = null;
      requestAnimationFrame(() => {
        wrapDataTables();
        if (!refocus) return;
        const c = availPane.querySelector(`tr[data-pid="${refocus}"] .my-rank`);
        if (c) { c.focus({ preventScroll: true }); c.scrollIntoView({ block:'nearest' }); }
      });
    }

    let inFlight = false, lastOk = 0, pollMs = 0, lastChange = Date.now(), beat = 0;

    async function tick(manual) {
      // A slow response must not let requests stack up behind it; at a 1s
      // cadence that is how you get four in the air at once.
      if (inFlight && !manual) return;
      inFlight = true;
      try {
        const r = await fetch(`https://api.sleeper.app/v1/draft/${d.draft_id}/picks`);
        if (!r.ok) throw new Error(`Sleeper returned ${r.status}`);
        const next = (await r.json()) || [];
        const grew = next.length !== picks.length;
        picks = next;
        lastOk = Date.now();
        if (grew) { lastChange = lastOk; clockStart = lastOk; }
        if (grew || manual) paint(); else stampLive();
        if (grew) setPoll();          // the cadence depends on how close your pick is
        if (picks.length >= totalPicks && !isTerminal()) { status = 'complete'; setPoll(); paint(); }
      } catch (e) {
        if (manual) toast(`Draft refresh failed: ${e.message}`, 'bad');
        stampLive();
      } finally {
        inFlight = false;
      }
    }

    // The draft object is the only thing that reports a start, a pause, or a
    // finish that left slots empty. One small request, so it is safe to fold into
    // the beat rather than run a second timer for it.
    async function tickMeta() {
      try {
        const r = await fetch(`https://api.sleeper.app/v1/draft/${d.draft_id}`);
        if (!r.ok) return;
        const fresh = await r.json();
        lastOk = Date.now();
        // Both feed the countdown: last_picked is the authoritative clock start,
        // and start_time can be moved by the commissioner right up to kickoff, so
        // the pre-draft countdown has to follow it rather than the mount value.
        if (fresh && fresh.last_picked) clockStart = Number(fresh.last_picked);
        if (fresh && fresh.start_time) d.start_time = fresh.start_time;
        if (fresh && fresh.status && fresh.status !== status) {
          status = fresh.status;
          lastChange = lastOk;
          setPoll();
          await tick(true);           // whatever just changed, get the picks for it
        } else stampLive();
      } catch { stampLive(); }
    }

    // One timer. What it fetches depends on whether the room is actually moving:
    // a draft that is not running has nothing to say about picks, so it only gets
    // asked whether it started.
    async function beatTick() {
      beat++;
      if (!isRunning()) return tickMeta();
      await tick(false);
      if (beat % 15 === 0) await tickMeta();
    }

    // The button is a state readout, not just a switch: it says WHY it is quiet,
    // so a stopped poller is never mistaken for a silent draft.
    function stampLive() {
      if (!liveWanted)            { liveBtn.textContent = 'Live · off'; return; }
      if (isTerminal())           { liveBtn.textContent = 'Live · done'; return; }
      if (status === 'paused')    { liveBtn.textContent = 'Live · paused'; return; }
      if (status === 'pre_draft') { liveBtn.textContent = 'Live · waiting'; return; }
      const age = lastOk ? Math.round((Date.now() - lastOk) / 1000) : null;
      liveBtn.textContent = `Live · ${age == null ? 'on' : age + 's'}`;
    }

    function setPoll() {
      // A finished draft is terminal: no timer at all, not a slow one. Same when
      // the user switches Live off.
      if (!liveWanted || isTerminal()) { stopDraftPoll(); pollMs = 0; stampLive(); return; }
      // Cadence tracks how much the latency costs you. A draft that has not
      // started, or is paused, only needs its status checked. Once it is running a
      // 5s lag was too slow to watch a pick land, and inside three picks of your
      // turn every second matters. A room three minutes without a pick has
      // stalled, so stop hammering it. Sleeper allows 1000 calls/min, and an
      // unchanged response repaints nothing.
      const made = picks.length;
      const nextMine = myPickNos.find(n => n > made);
      const stalled = Date.now() - lastChange > 180000;
      const ms = !isRunning() ? 15000
        : stalled ? 10000
        : (nextMine != null && nextMine - made <= 3) ? 1000
        : 2000;
      // Only rebuild the interval when the cadence actually changes; the guard
      // has to run BEFORE stopDraftPoll or _draftTimer is always null here.
      if (ms === pollMs && _draftTimer) { stampLive(); return; }
      stopDraftPoll();
      pollMs = ms;
      _draftTimer = setInterval(beatTick, ms);
      stampLive();
    }

    paint();
    _draftClockTimer = setInterval(paintClock, 1000);
    // Opening the room mid-draft leaves clockStart null until the next pick
    // lands, which is a whole pick of "unsynced". One meta call fixes it.
    tick(false).then(setPoll).then(() => { if (isRunning() && !clockStart) tickMeta(); });
  }

  function navigate(hash) { location.hash = hash; }
  // Wrap every wide data table in a horizontal-scroll container so a table wider
  // than the viewport scrolls inside itself instead of being clipped by the page
  // (mobile). Desktop CSS keeps the wrapper transparent so the sticky thead still
  // pins to the page scroll. Idempotent + additive; runs after each view mounts.
  // wrapDataTables() runs once per navigation. A panel that re-renders itself
  // on a tab click wipes its host and appends a fresh table AFTER that pass has
  // run, so the table is never wrapped and simply overhangs the card: the IDP
  // matchup grid sat 109px outside its plate on a phone with no way to reach
  // the right-hand columns. Anything appended to a live host goes through here
  // instead, which wraps at construction rather than relying on a later sweep.
  function appendTable(host, node) {
    host.appendChild(node && node.tagName === 'TABLE'
      ? h('div', { class: 'tbl-scroll' }, node)
      : node);
  }

  function wrapDataTables() {
    document.querySelectorAll('table.data').forEach(t => {
      const p = t.parentElement;
      if (!p || p.classList.contains('tbl-scroll')) return;
      const w = document.createElement('div');
      w.className = 'tbl-scroll';
      p.insertBefore(w, t);
      w.appendChild(t);
    });
  }
  // Any element that actually overflows gets keyboard focus, so arrow keys can
  // scroll it. Only when it really overflows: a blanket tabindex would pad the
  // tab order with dozens of stops that go nowhere.
  function focusScrollRegions() {
    for (const el of document.querySelectorAll('#main [class*="scroll"], #main .trade-pool, #main .card')) {
      const style = getComputedStyle(el);
      const scrolls = /auto|scroll/.test(style.overflowY + style.overflowX);
      const overflows = el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2;
      if (scrolls && overflows) {
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
        if (!el.hasAttribute('role')) el.setAttribute('role', 'region');
        if (!el.hasAttribute('aria-label')) {
          const title = el.querySelector('.card-title, caption, thead th');
          el.setAttribute('aria-label', `${(title?.textContent || 'Content').trim()}, scrollable`);
        }
      } else if (el.getAttribute('role') === 'region' && el.getAttribute('tabindex') === '0') {
        // It stopped overflowing (a filter narrowed it), so stop advertising it.
        el.removeAttribute('tabindex');
        el.removeAttribute('role');
        el.removeAttribute('aria-label');
      }
    }
  }

  const PHONE_Q = '(max-width: 720px)';

  function collapseFiltersOnPhone() {
    const phone = window.matchMedia(PHONE_Q).matches;
    for (const bar of document.querySelectorAll('#main .filters')) {
      let btn = bar.previousElementSibling;
      if (!btn || !btn.classList.contains('filters-toggle')) btn = null;
      if (!phone) {
        // Desktop has the room, so the card is always open and the button goes away.
        bar.hidden = false;
        btn?.remove();
        continue;
      }
      if (!btn) {
        btn = h('button', { class:'filters-toggle', 'aria-expanded':'false', 'aria-controls':'' },
          'Filters', h('span', { class:'filters-toggle-caret', 'aria-hidden':'true' }, '▾'));
        if (!bar.id) bar.id = `filters-${Math.abs(bar.textContent.length * 31 + 7)}`;
        btn.setAttribute('aria-controls', bar.id);
        btn.onclick = () => {
          const open = bar.hidden;
          bar.hidden = !open;
          btn.setAttribute('aria-expanded', String(open));
          btn.classList.toggle('is-open', open);
        };
        bar.parentElement.insertBefore(btn, bar);
        bar.hidden = true;
      }
    }
  }

  function route() {
    teardownDraftView();
    renderSidebar();
    setActiveNav();
    setMobileNav(false);
    window.scrollTo(0, 0);
    requestAnimationFrame(() => { wrapDataTables(); collapseFiltersOnPhone(); focusScrollRegions(); });
    const hash = location.hash || '#dashboard';
    const [path, ...rest] = hash.replace(/^#/, '').split('/');
    try {
      switch (path) {
        case 'dashboard':  return viewDashboard(rest[0]);
        case 'watch':      return viewWatch();
        case 'rankings':   return viewRankings();
        // All Players removed because the per-league Players tab covers it.
        case 'players':    navigate('#dashboard'); return viewDashboard();
        // One leagues surface, not two. #leagues used to render its own
        // Keep old bookmarks working without retaining a second leagues page.
        case 'leagues':
          history.replaceState(null, '', '#dashboard');
          setActiveNav();
          return viewDashboard();
        case 'league':     return viewLeague(rest[0], rest[1]);
        case 'roster':     return viewRoster(rest[0], rest[1], rest[2]);
        case 'trade':      return viewTrade(rest[0], rest[1]);
        case 'projections': navigate('#dashboard'); return viewDashboard();
        case 'sos':        return viewSosGrid(rest[0]);
        case 'games':      return viewGames();
        case 'game':       return viewGame(rest[0], rest[1]);
        case 'stats':      return viewStats(rest[0], rest[1]);
        case 'draft':      return viewDraft(rest[0]);
        case 'prospects':  return viewProspects(rest[0], rest[1]);
        case 'strategy':   return viewStrategy();
        case 'action':     return viewActionCenter();
        case 'experts':    return viewExperts(rest[0], rest[1]);
        case 'sources':    return viewSources();
        case 'about':      return viewAbout();
        default:           return viewDashboard();
      }
    } catch (err) {
      console.error('Render error', err);
      $('#main').innerHTML = '';
      $('#main').appendChild(h('div', { class:'empty' }, `Error rendering view: ${err.message}`));
    }
  }

  // ============================================================
  // Cmd+K command palette
  // ============================================================
  function openCmdK() {
    if ($('.cmdk-backdrop')) return;
    const idx = rankIndex();
    // Build searchable index of: routes, leagues, rosters, ranked players, all sleeper players
    const items = [];
    for (const r of ROUTES) items.push({ kind:'route', label:r.label, hint:r.section, icon:r.icon, hash:r.hash });
    // The Gibbs tier board is a generated static page, not a hash route, so it
    // needs `url` rather than `hash`. Cmd+K is the front door; it belongs here.
    items.push({ kind:'route', label:'Gibbs Tier Board', hint:`Reference · ${gibbsBoardShape().text}, half-PPR redraft`,
      icon:'▤', url:'gibbs-tiers.html' });
    items.push({ kind:'route', label:'Gibbs Aug 22 Update', hint:'Reference · ranks 85-200 of his new top 200, re-ranked delta',
      icon:'▤', url:'gibbs-update-2026-08-22.html' });
    for (const lg of window.LEAGUES || []) {
      items.push({ kind:'league', label:lg.name, hint:`League · ${lg.is_superflex?'SF':lg.is_idp?'IDP':'1QB'}`, icon:'⚑', hash:`#league/${lg.id}` });
      for (const r of lg.rosters) {
        items.push({ kind:'roster', label:r.team_name, hint:`${r.owner_name} · ${lg.short_name}${r.is_me?' · YOU':''}`, icon:r.is_me?'★':'○', hash:`#roster/${lg.id}/${r.roster_id}` });
      }
    }
    for (const p of idx.all) {
      items.push({ kind:'ranked', label:p.name, hint:`${p.pos} · ${p.team} · ${window.CATEGORY_LABELS[p.category]} ${p.tier}`, icon:'★', name:p.name, pid:p._sleeperId });
    }
    // KTC published rookie-pick valuations as searchable entries. Hash sends
    // to the first league's #trade route (where picks are tradeable assets).
    const firstLeagueId = (window.LEAGUES || [])[0]?.id;
    const tradeHash = firstLeagueId ? `#trade/${firstLeagueId}` : null;
    const pIdx = pickIndex();
    for (const [, pk] of pIdx.oneqb) {
      items.push({
        kind: 'pick',
        label: pk.name,
        hint: `Pick · KTC ${pk.ktcValue} (1QB)`,
        icon: '◇',
        hash: tradeHash,
      });
    }
    // Add some Sleeper players (limit to those rostered in any league for relevance)
    const rostered = new Set();
    for (const lg of window.LEAGUES || []) for (const r of lg.rosters) for (const pid of (r.players||[])) rostered.add(pid);
    for (const pid of rostered) {
      const sp = window.PLAYERS[pid]; if (!sp) continue;
      if (idx.bySleeperId.has(pid)) continue; // already added as ranked
      items.push({ kind:'player', label:sp.name, hint:`${sp.pos} · ${sp.team || 'FA'}`, icon:'·', name:sp.name, pid });
    }

    let q = '', activeIdx = 0;
    const backdrop = h('div', { class:'cmdk-backdrop', onclick: (e) => { if (e.target === e.currentTarget) backdrop.remove(); } });
    const input = h('input', { type:'search', placeholder:'Jump to player, league, route…', autofocus: '',
      oninput: (e) => { q = e.target.value.trim(); activeIdx = 0; render(); }
    });
    const results = h('div', { class:'cmdk-results' });
    const cmdk = h('div', { class:'cmdk' },
      h('div', { class:'cmdk-input-wrap' }, h('span', { class:'kbd' }, '⌕'), input,
        h('span', { class:'kbd', title:'Close' }, 'Esc')),
      results
    );
    backdrop.appendChild(cmdk);
    document.body.appendChild(backdrop);
    setTimeout(() => input.focus(), 30);

    function filtered() {
      if (!q) {
        // default: routes + your rosters first
        return items.filter(i => i.kind === 'route' || (i.kind === 'roster' && i.hint.includes('YOU'))).slice(0, 12);
      }
      const nq = norm(q);
      return items.filter(i => norm(i.label).includes(nq) || norm(i.hint).includes(nq)).slice(0, 30);
    }
    function render() {
      results.innerHTML = '';
      const fl = filtered();
      if (!fl.length) { results.appendChild(h('div', { class:'cmdk-empty' }, 'No matches.')); return; }
      let curSection = null;
      fl.forEach((it, i) => {
        if (it.kind !== curSection) {
          curSection = it.kind;
          const labels = { route:'Pages', league:'Leagues', roster:'Rosters', ranked:'Ranked Players', player:'Players', pick:'Draft Picks' };
          results.appendChild(h('div', { class:'cmdk-section' }, labels[it.kind] || it.kind));
        }
        const row = h('div', { class:`cmdk-row ${i===activeIdx?'active':''}`, onclick:()=>activate(it) },
          h('span', { class:'cmdk-icon' }, it.icon),
          h('div', { class:'cmdk-name' }, it.label, h('div', { class:'cmdk-sub' }, it.hint)),
        );
        results.appendChild(row);
      });
    }
    function activate(it) {
      backdrop.remove();
      if (it.hash) navigate(it.hash);
      else if (it.url) location.href = it.url;
      else if (it.name) openPlayerDetail(it.name, it.pid);
    }
    function onKey(e) {
      if (!document.body.contains(backdrop)) { document.removeEventListener('keydown', onKey); return; }
      if (e.key === 'Escape') { backdrop.remove(); }
      else if (e.key === 'ArrowDown') { activeIdx = Math.min(filtered().length-1, activeIdx+1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { activeIdx = Math.max(0, activeIdx-1); render(); e.preventDefault(); }
      else if (e.key === 'Enter') { const fl = filtered(); if (fl[activeIdx]) activate(fl[activeIdx]); }
    }
    document.addEventListener('keydown', onKey);
    render();
  }

  // ============================================================
  // Boot
  // ============================================================
  function boot() {
    if (!window.RANKINGS_SOURCES || !window.PLAYERS || !window.LEAGUES) {
      document.body.innerHTML = '<div style="padding:40px;color:#fbbf24;background:#11141b;font-family:monospace">Missing data files. Run <code>python site/data/build_site_data.py</code> first.</div>';
      return;
    }
    ensureSourceDefaults();
    ensureExpertColDefaults();
    saveSettings();
    renderSidebar();

    // Mobile nav toggle + scrim. The button + scrim live in index.html;
    // toggling `body.nav-open` slides the sidebar in.
    const navToggle = document.getElementById('nav-toggle');
    const navScrim  = document.getElementById('nav-scrim');
    if (navToggle) navToggle.addEventListener('click', () => setMobileNav(true));
    if (navScrim)  navScrim.addEventListener('click',  () => setMobileNav(false, true));

    window.addEventListener('hashchange', route);
    window.matchMedia(PHONE_Q).addEventListener('change', () => {
      collapseFiltersOnPhone();
      focusScrollRegions();
    });
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        openCmdK();
      }
      if (e.key === 'Escape' && document.body.classList.contains('nav-open')) {
        setMobileNav(false, true);
      }
    });
    route();
  }

  // Expose a couple things for console debugging
  window.__app = { state, rankIndex, computeRosterStrength, sleeperIdFor };

  document.addEventListener('DOMContentLoaded', boot);
})();
