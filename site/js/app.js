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
  const fmt = {
    pct: (n) => `${(n*100).toFixed(0)}%`,
    num: (n) => Number(n||0).toLocaleString(),
    decimal: (n, d=1) => (Number(n||0)).toFixed(d),
  };

  // Persistent settings
  const SETTINGS_KEY = 'ff-site-settings-v2';
  const defaults = {
    enabledRankings: {},   // { rankingId: true/false }
    enabledSources:  {},   // { sourceId: true/false }
    enabledExpertCols: {}, // { expertSourceId: true/false } - expert rank columns
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
  function sleeperByName() {
    if (_sleeperByName) return _sleeperByName;
    const m = new Map();
    const PLAYERS = window.PLAYERS || {};
    for (const pid in PLAYERS) {
      const p = PLAYERS[pid];
      const k1 = norm(p.name);
      const k2 = norm(`${p.first} ${p.last}`);
      if (k1 && !m.has(k1)) m.set(k1, pid);
      if (k2 && !m.has(k2)) m.set(k2, pid);
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
  let _sleeperByLastPos = null;
  function sleeperByLastNamePos() {
    if (_sleeperByLastPos) return _sleeperByLastPos;
    const m = new Map();
    for (const pid in (window.PLAYERS || {})) {
      const p = window.PLAYERS[pid];
      if (!p.last || !p.pos) continue;
      const key = `${norm(p.last)}|${p.pos}`;
      if (!m.has(key)) m.set(key, pid);
      else if (m.get(key) !== 'AMBIGUOUS') m.set(key, 'AMBIGUOUS');
    }
    _sleeperByLastPos = m;
    return m;
  }
  function sleeperIdForFuzzy(name, pos) {
    const direct = sleeperIdFor(name);
    if (direct) {
      const player = window.PLAYERS?.[direct];
      const positions = new Set([player?.pos, ...(player?.fantasy_positions || [])]);
      if (!pos || positions.has(pos)) return direct;
    }
    if (!pos) return null;
    const last = norm(name).split(' ').filter(Boolean).slice(-1)[0];
    if (!last || last.length < 3) return null;
    const found = sleeperByLastNamePos().get(`${last}|${pos}`);
    return (found && found !== 'AMBIGUOUS') ? found : null;
  }

  // Build a unified ranking lookup from enabled sources
  // Returns: { byName: Map(normName -> {category, tier, ...}), bySleeperId: Map(pid -> {...}), all: [{...}] }
  let _rankIndex = null;
  let _rankIndexKey = null;
  // Data freshness from window.BUILD_INFO (written by build_all.py). Returns
  // { name, ageH, ageLabel, stale } per tracked file + the staleest critical one.
  const FRESH_CRITICAL = ['ktc.js', 'players.js', 'projections.js', 'categories.js'];
  // Plain-English names for each data file (used in freshness UI — no jargon).
  const DATA_LABEL = {
    'ktc.js': 'Player values', 'players.js': 'Rosters & players', 'leagues.js': 'Leagues',
    'projections.js': 'Projections', 'categories.js': 'Tiers & categories',
    'environment.js': 'Team offenses', 'sos.js': 'Schedule strength', 'sos-grid.js': 'Matchup grid',
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
    // wins) and drop the rest. Null ids (unresolved) can't be deduped — keep all.
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
  // data already supports — projections and value both exist, the DELTA didn't.
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
  // their VOR is) — it's how much a player beats a freely-available replacement,
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
      title: `PrizePicks ranks him ${r.pos}${r.ppRank}, Sleeper ranks him ${r.pos}${r.slpRank} — PP ${d > 0 ? 'higher' : d < 0 ? 'lower' : 'even'} by ${Math.abs(d)} spot${Math.abs(d) === 1 ? '' : 's'}. ${d > 0 ? 'Sharp market likes him more than the public model — undervalued lean.' : d < 0 ? 'Sleeper ranks him higher than the market — may overrate.' : 'Market and model agree.'}` },
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
  // Colored VOR chip. Positive green (a startable edge), ~0 grey (replacement),
  // negative red (below a freely-available player). Null when no projection.
  function vorChip(pid, league, src) {
    const lg = league || primaryLeague();
    if (!lg) return null;
    const v = vorByPid(pid, lg, src || 'blend');
    if (v == null) return null;
    const color = v >= 30 ? 'var(--green)' : v >= 0 ? 'var(--fg-1)' : 'var(--red)';
    return h('span', { class: 'tnum', style: { color, fontWeight: 600 },
      title: `Value over replacement: ${v > 0 ? '+' : ''}${v} projected pts vs the last startable ${projByPid().get(String(pid))?.p?.pos || ''} in ${lg.short_name || lg.name}. Cross-position comparable — higher = more lineup value.` },
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
    // values — without this backfill they fall through to the legacy strategy.js
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
  // dynasty asset does (max ktcValue 9997 / 100 ~= 100, max league VOR ~= 180),
  // so PV stays comparable across leagues on the My Leagues page.
  const REDRAFT_VOR_SCALE = 0.55;

  function tierValue(p, format) {
    if (!p) return 0;
    // Redraft prices a season, not a career. VOR is the redraft currency: it is
    // projected points over the last startable player at that position in THIS
    // league, so it is cross-position comparable and already knows the slots.
    // Floored at 0 because a deep-bench body should not subtract from roster
    // strength. No projection means no season value, which is the honest answer
    // in a format where next year never arrives. Cross-league callers pass {},
    // which has no id, so they keep the dynasty currency.
    if (format && format.id && !isDynastyLeague(format)) {
      const pid = p._sleeperId != null ? p._sleeperId : p.sleeperId;
      const vor = pid != null ? vorByPid(pid, format, 'blend') : null;
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
    let qb=0, rb=0, wr=0, te=0, flex=0, sf=0, lb=0, db=0, dl=0, idp_flex=0;
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
    }
    return {
      QB: qb + sf * 1.0,
      RB: rb + flex * 0.40,
      WR: wr + flex * 0.50,
      TE: te + flex * 0.10,
      LB: lb + idp_flex * 0.55,
      DB: db + idp_flex * 0.30,
      DL: dl + idp_flex * 0.15,
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
  // finish projection — it rewards depth. Projected finish is startingStrength()
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
    { hash:'#watch',        label:'What to Look For', icon:'◉',  section:'Overview' },
    { hash:'#leagues',      label:'My Leagues',       icon:'⚑',  section:'Dynasty' },
    { hash:'#action',       label:'Action Center',    icon:'!',  section:'Dynasty' },
    { hash:'#trade',        label:'Trade Calculator', icon:'⇄',  section:'Tools' },
    { hash:'#projections',  label:'Projections',      icon:'Σ',  section:'Tools' },
    { hash:'#sos',          label:'Strength of Sched', icon:'▦',  section:'Tools' },
    { hash:'#draft',        label:'Draft Room',       icon:'▣',  section:'Tools' },
    { hash:'#rankings',     label:'My Rankings',      icon:'#',  section:'Reference' },
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

  function renderSidebar() {
    const sidebar = $('#sidebar');
    sidebar.innerHTML = '';
    sidebar.appendChild(h('div', { class:'brand' },
      h('div', { class:'logo' }, 'H'),
      h('div', null,
        h('div', { class:'name' }, 'The Fantasy Hub'),
        h('div', { class:'sub' }, 'tdub1329 · 2026'),
      ),
      // Mobile close button (only visible <960px when expanded)
      h('button', {
        class:'sidebar-close',
        'aria-label':'Close navigation',
        onclick: () => document.body.classList.remove('nav-open')
      }, '×')
    ));

    // Cmd+K search trigger
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform || '');
    sidebar.appendChild(h('div', { class:'search-hint', onclick: openCmdK, style:{ marginBottom:'14px' } },
      h('span', null, 'Quick jump…'),
      h('span', { class:'spacer' }),
      h('span', { class:'kbd' }, isMac ? '⌘' : 'Ctrl'), h('span', { class:'kbd' }, 'K')
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
        const a = h('a', { href:r.hash, dataset:{ route: r.hash }, onclick: () => document.body.classList.remove('nav-open') },
          h('span', { class:'icon' }, r.icon),
          h('span', { class:'nav-label' }, r.label)
        );
        nav.appendChild(a);
      }
      sidebar.appendChild(nav);
    }

    // Quick league shortcuts. The active league (if any) gets a "context"
    // sub-list under it with sub-tabs for the workspace.
    sidebar.appendChild(h('div', { class:'nav-section-title' }, 'Leagues'));
    const lnav = h('div', { class:'nav' });
    for (const lg of window.LEAGUES || []) {
      const me = (lg.rosters || []).find(r => r.is_me);
      const myTeam = me ? me.team_name : lg.short_name;
      const isActive = lg.id === activeLgId;
      const formatTag = lg.platform === 'espn' ? 'ESPN' : (lg.type === 0 ? 'REDRAFT' : (lg.is_superflex ? 'SF' : (lg.is_idp ? 'IDP' : '1QB')));
      const a = h('a', {
        href:`#league/${lg.id}`,
        class: isActive ? 'is-context' : '',
        onclick: () => document.body.classList.remove('nav-open'),
      },
        h('span', { class:'icon' }, lg.is_superflex ? '◆' : (lg.is_idp ? '◇' : '○')),
        h('span', { class:'nav-label' }, myTeam),
        h('span', { class:'nav-tag' }, formatTag),
      );
      lnav.appendChild(a);

      // Inline sub-nav for the active league: jump to its key sub-tabs.
      if (isActive && me) {
        const sub = h('div', { class:'nav-sub' },
          h('a', { href: `#league/${lg.id}`,          onclick: () => document.body.classList.remove('nav-open') },
            h('span', { class:'sub-bullet' }, '·'), 'Standings'),
          h('a', { href: `#league/${lg.id}/players`,  onclick: () => document.body.classList.remove('nav-open') },
            h('span', { class:'sub-bullet' }, '·'), 'Players'),
          lg.platform !== 'espn' ? h('a', { href: `#league/${lg.id}/transactions`, onclick: () => document.body.classList.remove('nav-open') },
            h('span', { class:'sub-bullet' }, '·'), 'Transactions') : null,
          h('a', { href: `#roster/${lg.id}/${me.roster_id}/snapshot`, onclick: () => document.body.classList.remove('nav-open') },
            h('span', { class:'sub-bullet' }, '·'), 'My Roster'),
          h('a', { href: `#trade/${lg.id}`,           onclick: () => document.body.classList.remove('nav-open') },
            h('span', { class:'sub-bullet' }, '·'), 'Trade Lab'),
        );
        lnav.appendChild(sub);
      }
    }
    sidebar.appendChild(lnav);

    // Data freshness footer: staleest critical dataset age. Amber if >3 days old.
    const fr = dataFreshness();
    if (fr && fr.stalest) {
      const tip = fr.rows.map(r => `${DATA_LABEL[r.name] || r.name}: ${r.ageLabel} ago`).join('\n');
      sidebar.appendChild(h('div', { class:'data-fresh', title: `Last updated:\n${tip}`, onclick:()=>navigate('#about') },
        h('span', { class:'data-fresh-dot', style:{ background: fr.stale ? 'var(--amber)' : 'var(--green)' } }),
        h('span', null, fr.stale ? `Refresh needed · updated ${fr.stalest.ageLabel} ago` : `Up to date · updated ${fr.stalest.ageLabel} ago`),
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
  function teamChip(team) {
    return h('span', { class:'team-chip' }, team || 'FA');
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

  function expertSources() {
    if (_expertSources) return _expertSources;
    const list = [];
    const g = window.JACOB_GIBBS_RANKINGS;
    if (g && (g.players || []).length) {
      // Column is OFF by default. Gibbs publishes half-PPR and all three
      // leagues are full PPR, so the derived `gibbs-ppr-*` source is the one
      // that applies to a lineup decision. This board stays the SOURCE it is
      // derived from and still drives gibbs-tiers.html; it is only the
      // duplicate same-date column beside it that was noise.
      list.push({ id:'gibbs', label:'Gibbs half', expert: g.source || 'Jacob Gibbs',
        title: g.title || '2026 half-PPR', url:'https://www.fantasypros.com/nfl/rankings/',
        updatedAt: g.updatedAt, scope:'overall', dateSuffix:true, defaultEnabled:false,
        players: g.players });
    }
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
    const _validTabs = ['overview','leagues','trajectory','market','cornerstones'];
    const tab = _validTabs.includes(tabArg) ? tabArg : 'overview';

    main.appendChild(h('div', { class:'page-header' },
      h('div', null,
        h('div', { class:'page-eyebrow' }, 'OVERVIEW'),
        h('h1', { class:'page-title' }, 'Dashboard'),
        h('p', { class:'page-sub' }, "Your dynasty empire at a glance, leagues, market, and Cornerstones.")
      ),
      h('div', { class:'page-actions' },
        h('button', { class:'ghost', onclick: openCmdK }, h('span', { class:'kbd' }, 'Ctrl'), ' ', h('span', { class:'kbd' }, 'K'), ' Quick jump')
      )
    ));

    main.appendChild(tabBar([
      { key:'overview',     label:'Overview',     icon:'◆' },
      { key:'leagues',      label:'Leagues',      icon:'⚑', count: (window.LEAGUES || []).length },
      { key:'trajectory',   label:'Trajectory',   icon:'↗' },
      { key:'market',       label:'Market',       icon:'⇅' },
      { key:'cornerstones', label:'Cornerstones', icon:'★' },
    ], tab, (k) => k === 'overview' ? '#dashboard' : `#dashboard/${k}`));

    const idx = rankIndex();
    const allPlayers = idx.all;
    const distinctRanked = new Set(idx.bySleeperId.keys()).size + idx.byName.size;

    // KPIs
    const enabledRankings = Object.values(state.settings.enabledRankings).filter(Boolean).length;
    const totalLeagues = (window.LEAGUES || []).length;
    let totalCornerstonesOwned = 0;
    let myRosters = [];
    for (const lg of window.LEAGUES || []) {
      const me = lg.rosters.find(r => r.is_me);
      if (!me) continue;
      myRosters.push({ league: lg, roster: me });
      const s = computeRosterStrength(me, lg);
      totalCornerstonesOwned += s.rankedPlayers.filter(rp => rp.ranked.category === 'cornerstone').length;
    }

    // ===== Empire Asset Visual =====
    // Tier-sheet aesthetic: each owned asset is a small colored cell. Hovering
    // reveals the player. Cornerstones row, Foundational row, Upside Premier row.
    const assetsByCategory = { cornerstone:[], foundational:[], upside_premier:[] };
    const seenPlayerKeys = new Set();
    for (const { league, roster } of myRosters) {
      const s = computeRosterStrength(roster, league);
      for (const rp of s.rankedPlayers) {
        if (!assetsByCategory[rp.ranked.category]) continue;
        const key = `${rp.ranked.name}::${league.id}`;
        if (seenPlayerKeys.has(key)) continue;
        seenPlayerKeys.add(key);
        assetsByCategory[rp.ranked.category].push({
          name: rp.ranked.name, pos: rp.ranked.pos, league: league.short_name,
          value: rp.value, ranked: rp.ranked,
        });
      }
    }
    // Sort each category by value desc so the "best" asset glyphs appear first.
    for (const cat of Object.keys(assetsByCategory)) {
      assetsByCategory[cat].sort((a, b) => b.value - a.value);
    }

    function assetRow(cat, label, color) {
      const arr = assetsByCategory[cat] || [];
      return h('div', { class:'empire-row' },
        h('div', { class:'empire-row-label' },
          h('span', { class:'empire-row-name', style:{ color } }, label),
          h('span', { class:'empire-row-count tnum' }, arr.length),
        ),
        h('div', { class:'empire-row-cells' },
          ...arr.map(a => h('span', {
            class:`empire-cell cat-${cat}`,
            title: `${a.name} (${a.pos}) in ${a.league}, value ${fmt.decimal(a.value, 1)}`,
            onclick: () => openPlayerDetail(a.name),
          }, a.pos.charAt(0))),
          arr.length === 0 ? h('span', { class:'tip' }, 'none yet') : null,
        )
      );
    }

    if (tab === 'overview') {
      // ===== Command cards: one per league — situation + next move at a glance =====
      const STANCE_LABEL = { tank:'Tank', seller:'Seller', mid:'Mid', buyer:'Buyer', contender:'Contender' };
      const cmdStat = (label, val, color) => h('div', { class:'cmd-stat' },
        h('div', { class:'cmd-stat-val tnum', style: color ? { color } : {} }, val),
        h('div', { class:'cmd-stat-lbl' }, label));
      let totalHoles = 0, contenderCount = 0;
      const cmdGrid = h('div', { class:'cmd-grid' });
      for (const { league: lg, roster: me } of myRosters) {
        const ss = rosterSurplusShortage(getRosterPlayers(me), lg);
        const stance = rosterStance(me, lg);
        if (stance === 'contender') contenderCount++;
        const ranking = lg.rosters.map(r => ({ id: r.roster_id, s: startingStrength(r, lg) })).sort((a, b) => b.s - a.s);
        const myRank = ranking.findIndex(x => x.id === me.roster_id) + 1;
        const pv = startingStrength(me, lg);
        const needs = ['QB','RB','WR','TE'].map(p => ({ p, s: ss[p]?.surplus ?? 0 })).filter(x => x.s <= -1).sort((a, b) => a.s - b.s);
        totalHoles += needs.length;
        const need = needs[0];
        const rostered = new Set(lg.rosters.flatMap(r => r.players || []).map(String));
        const needSet = new Set(needs.map(n => n.p));
        const byVorVal = (a, b) => ((b.vor ?? -9999) - (a.vor ?? -9999)) || (b.val - a.val);
        const availAll = rankIndex().all
          .map(p => { const sp = p._sleeperId && window.PLAYERS[p._sleeperId]; return sp ? { sp, vor: vorByPid(sp.id, lg, 'blend'), val: tierValue(p, lg) } : null; })
          .filter(x => x && !rostered.has(String(x.sp.id)) && ['QB','RB','WR','TE'].includes(x.sp.pos));
        const bestNeed = needSet.size ? availAll.filter(x => needSet.has(x.sp.pos)).sort(byVorVal)[0] : null;
        const bestAny = [...availAll].sort(byVorVal)[0];
        // Prefer a useful FA at your NEED position; if that pool is below startable,
        // show a genuinely good FA anywhere; else fall back to the best need-fill
        // (thin) and say so — deep dynasty waiver wires are barren, don't oversell.
        let waiver, thinFa;
        if (bestNeed && (bestNeed.vor ?? -9999) >= -8) { waiver = bestNeed; thinFa = false; }
        else if (bestAny && (bestAny.vor ?? -9999) >= 0) { waiver = bestAny; thinFa = false; }
        else { waiver = bestNeed || bestAny; thinFa = true; }
        const faFillsNeed = waiver && needSet.has(waiver.sp.pos);
        const faLabel = thinFa ? 'Thin FA' : (needSet.size && !faFillsNeed ? 'Best FA' : 'Top FA');
        const rankColor = myRank <= Math.ceil(lg.total_rosters * 0.3) ? 'var(--green)' : myRank > Math.ceil(lg.total_rosters * 0.6) ? 'var(--red)' : 'var(--fg-1)';
        cmdGrid.appendChild(h('div', { class:'cmd-card', onclick: () => navigate(`#league/${lg.id}`) },
          h('div', { class:'cmd-head' },
            h('span', { class:'cmd-name' }, me.team_name),
            h('span', { class:`badge stance-${stance}` }, STANCE_LABEL[stance] || stance),
          ),
          h('div', { class:'cmd-sub' }, `${lg.short_name} · ${lg.is_superflex ? 'Superflex' : lg.is_idp ? 'IDP' : '1QB'} · ${lg.total_rosters}-team`),
          h('div', { class:'cmd-stats' },
            cmdStat('Rank', `#${myRank}`, rankColor),
            cmdStat('PV', fmt.decimal(pv, 0)),
            cmdStat('Biggest need', need ? `${need.p}` : '—', need ? 'var(--red)' : 'var(--green)'),
          ),
          waiver ? h('div', { class:'cmd-waiver', title: thinFa ? 'Best available at your need position, but below a startable level — the waiver pool is thin, upgrade via trade.' : faFillsNeed ? 'Best available free agent at your biggest need' : 'Best available add anywhere — your need position has nothing worth grabbing off waivers' },
            h('span', { class:'cmd-waiver-lbl', style: thinFa ? { color:'var(--amber)' } : {} }, faLabel),
            `${waiver.sp.name} · ${waiver.sp.pos}${waiver.vor != null ? ` · VOR ${waiver.vor > 0 ? '+' : ''}${Math.round(waiver.vor)}` : ''}`) : null,
          h('div', { class:'cmd-links' },
            h('a', { href:`#roster/${lg.id}/${me.roster_id}`, onclick:(e)=>e.stopPropagation() }, 'My roster →'),
            h('a', { href:`#trade/${lg.id}`, onclick:(e)=>e.stopPropagation() }, 'Trade lab →'),
          ),
        ));
      }
      main.appendChild(h('h2', { class:'section-title', style:{ marginTop:'4px' } }, 'Your Leagues'));
      main.appendChild(cmdGrid);

      // Actionable KPIs (cut the vanity Sources/Players-Ranked counts).
      main.appendChild(h('div', { class:'card-grid cols-4', style:{ marginTop:'14px' } },
        kpiCard('Leagues', String(totalLeagues), 'Active dynasty rosters'),
        kpiCard('Contender rosters', String(contenderCount), 'Top-tier starting strength now'),
        kpiCard('Positional holes', String(totalHoles), 'Startable shortages to fix'),
        kpiCard('Cornerstones', String(totalCornerstonesOwned), 'Elite anchors across rosters'),
      ));

      main.appendChild(h('div', { style:{ marginTop:'18px' } }));
      main.appendChild(insightsStrip(myRosters));

      // Empire asset visual, demoted below the actionable content.
      main.appendChild(h('section', { class:'empire', style:{ marginTop:'18px' } },
        h('div', { class:'empire-head' },
          h('div', { class:'empire-title' }, 'Dynasty Empire'),
          h('div', { class:'empire-meta' },
            `${totalLeagues} ${totalLeagues === 1 ? 'league' : 'leagues'}`,
            h('span', { class:'sep' }, '·'),
            `${totalCornerstonesOwned} cornerstones across rosters`,
          ),
        ),
        assetRow('cornerstone',    'Cornerstones',    'var(--cat-cornerstone)'),
        assetRow('foundational',   'Foundational',    'var(--cat-foundational)'),
        assetRow('upside_premier', 'Upside Premier',  'var(--cat-upside)'),
      ));
    }

    if (tab === 'leagues') {
    // My leagues at a glance
    main.appendChild(h('h2', { class:'page-title', style:{ fontSize:'1.2rem', marginTop:'8px' } }, 'My Leagues'));
    const grid = h('div', { class:'card-grid cols-3' });
    for (const lg of window.LEAGUES || []) {
      const me = lg.rosters.find(r => r.is_me);
      const teamName = me ? me.team_name : ',';
      const strength = me ? computeRosterStrength(me, lg) : null;
      const myRank = me ? rankInLeague(lg, me.roster_id) : null;

      grid.appendChild(h('div', { class:'league-card', onclick:()=>navigate(`#league/${lg.id}`) },
        h('div', { class:'name' }, lg.name),
        h('div', { class:'meta' }, `${teamName} · ${lg.total_rosters}-team`),
        h('div', { class:'badges' },
          lg.is_superflex ? h('span', { class:'badge', style:{ background:'rgba(251,191,36,.15)', color:'var(--amber)', borderColor:'rgba(251,191,36,.4)' } }, 'SUPERFLEX') : null,
          lg.is_idp ? h('span', { class:'badge', style:{ background:'rgba(96,165,250,.15)', color:'var(--blue)', borderColor:'rgba(96,165,250,.4)' } }, 'IDP') : null,
          lg.status === 'pre_draft' ? h('span', { class:'badge' }, 'Pre-Draft') : null,
        ),
        strength ? h('div', { style:{ marginTop:'12px', display:'flex', alignItems:'center', justifyContent:'space-between' } },
          h('div', null,
            h('div', { class:'stat-num' }, fmt.decimal(strength.total, 1)),
            h('div', { class:'stat-label' }, `Strength · #${myRank} of ${lg.total_rosters}`)
          ),
          h('div', { class:'tip', style:{ textAlign:'right' } },
            h('div', null, `${strength.rankedPlayers.filter(p=>p.ranked.category==='cornerstone').length} Cornerstones`),
            h('div', null, `${strength.rankedPlayers.filter(p=>p.ranked.category==='foundational').length} Foundational`),
          ),
        ) : null
      ));
    }
    main.appendChild(grid);
    } // end leagues tab (My Leagues grid)

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
      const top = (arr, n=8) => arr.slice(0, n);
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

    if (tab === 'leagues') {
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
        Draft: gradeDraftCapital(roster, league.id),
      };
      const overall = slotResult.overall || ((g.QB + g.RB*1.1 + g.WR*1.2 + g.TE*0.8 + g.Bench*0.5 + g.Draft*0.4) / 5);
      const heatCell = (val) => {
        const color = val >= 7.5 ? 'var(--green)' : val >= 5.5 ? 'var(--amber)' : val >= 3.5 ? 'var(--cat-vet)' : 'var(--red)';
        const pct = Math.max(4, Math.min(100, val*10));
        return h('div', { class:'heatmap-cell heatmap-grade' },
          h('div', { class:'heatmap-bar', style:{ width: `${pct}%`, background: color } }),
          h('span', { class:'heatmap-num tnum', style:{ color } }, val.toFixed(1)),
        );
      };
      const overallColor = overall >= 7.5 ? 'var(--green)' : overall >= 5.5 ? 'var(--amber)' : 'var(--red)';
      heatmap.appendChild(h('div', { class:'heatmap-row', onclick: () => navigate(`#roster/${league.id}/${roster.roster_id}`) },
        h('div', { class:'heatmap-cell heatmap-leaguecell' },
          h('div', { class:'heatmap-leaguename' }, league.short_name),
          h('div', { class:'heatmap-team tip' }, roster.team_name + (league.is_superflex ? ' · SF' : league.is_idp ? ' · IDP' : '')),
        ),
        heatCell(g.QB), heatCell(g.RB), heatCell(g.WR), heatCell(g.TE), heatCell(g.FLEX), heatCell(g.Bench), heatCell(g.Draft),
        h('div', { class:'heatmap-cell heatmap-overallcell tnum', style:{ color: overallColor } }, overall.toFixed(1)),
      ));
    }
    main.appendChild(heatmap);
    } // end leagues tab (heatmap)

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
        const watchTbl = h('table', { class:'data' },
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
      const tbl = h('table', { class:'data' },
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

    const catSel = h('select', { onchange: (e)=>{ RANKINGS_FILTER.cat = e.target.value; renderList(); } });
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
          h('th', null, 'Owners'),
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
          const youOwn = owners.some(o => o.isMe);
          const ownColor = owned == null ? 'var(--fg-3)' : owned > 80 ? 'var(--green)' : owned > 40 ? 'var(--amber)' : 'var(--fg-2)';
          const startColor = started == null ? 'var(--fg-3)' : started > 60 ? 'var(--green)' : started > 25 ? 'var(--amber)' : 'var(--red)';
          return h('tr', { dataset:{ pid:sleeperId || '' }, class:`${youOwn ? 'you ' : ''}${reorderable ? 'draft-reorder' : ''}`.trim(),
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
                ? h('div', { style:{ display:'flex', gap:'4px', flexWrap:'wrap' } }, ...owners.slice(0,3).map(o => h('span', {
                    class:`badge stance-${o.stance}` + (o.isMe ? ' you' : ''),
                    title: `${o.team} (${o.owner}), ${o.league} · ${stanceLabels[o.stance] || ''}`,
                  }, o.league)))
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
  function viewLeagues() {
    const main = $('#main');
    main.innerHTML = '';
    main.appendChild(h('div', { class:'page-header' },
      h('div', null,
        h('div', { class:'page-eyebrow' }, 'LEAGUES'),
        h('h1', { class:'page-title' }, 'My Leagues'),
        h('p', { class:'page-sub' }, 'Every team you run, side by side: where you stand now (PV), where you’re headed (FV, dynasty only), and your biggest hole. Click any row for the league. Dynasty PV is KTC asset value, redraft PV is season value over replacement, so PV ranks within a league and never across two.')
      )
    ));

    const STANCE_LABEL = { tank:'Tank', seller:'Seller', mid:'Mid', buyer:'Buyer', contender:'Contender' };
    const stanceTone = { contender:'var(--green)', buyer:'var(--blue)', mid:'var(--fg-2)', seller:'var(--amber)', tank:'var(--red)' };
    // ===== Cross-league comparison table (the reason this page exists) =====
    const mine = (window.LEAGUES || []).map(lg => { const me = lg.rosters.find(r => r.is_me); return me ? { lg, me } : null; }).filter(Boolean);
    if (mine.length) {
      const rowsData = mine.map(({ lg, me }) => {
        const ranking = lg.rosters.map(r => ({ id: r.roster_id, s: startingStrength(r, lg) })).sort((a, b) => b.s - a.s);
        const rank = ranking.findIndex(x => x.id === me.roster_id) + 1;
        const pv = startingStrength(me, lg);
        // Redraft has no year-4 lineup to project, so FV and stance stay blank
        // rather than rendering a number that prices a career the manager
        // never keeps. Skipping the call also skips the aging model entirely.
        const dyn = isDynastyLeague(lg);
        const fv = dyn ? startingStrength(me, lg, 4, true) : null;
        const ss = rosterSurplusShortage(getRosterPlayers(me), lg);
        const needs = ['QB','RB','WR','TE'].map(p => ({ p, s: ss[p]?.surplus ?? 0 })).filter(x => x.s <= -1).sort((a, b) => a.s - b.s);
        const rec = `${me.wins || 0}-${me.losses || 0}${me.ties ? '-' + me.ties : ''}`;
        return { lg, me, rank, pv, fv, dyn, stance: dyn ? rosterStance(me, lg) : null, need: needs.map(n => n.p).join('/') || '—', rec };
      });
      main.appendChild(h('div', { class:'card', style:{ padding:0, overflowX:'auto', marginBottom:'18px' } },
        h('table', { class:'data' },
          h('thead', null, h('tr', null,
            h('th', null, 'League'), h('th', null, 'Format'), h('th', { class:'right' }, 'Record'),
            h('th', { class:'right' }, 'Rank'),
            h('th', { class:'right', title:'Present Value: your best LEGAL starting lineup today (positions respected, taxi/IR/Out benched).' }, 'PV'),
            h('th', { class:'right', title:'Future Value: the same lineup 4 years out, each player aged by his position curve, with owned picks folded in once they convert. A converted pick is discounted in its rookie year (0.75x, ramping to parity) because dynasty value prices a whole career, not one season.' }, 'FV'),
            h('th', null, 'Stance'), h('th', null, 'Biggest Need'))),
          h('tbody', null, ...rowsData.map(d => h('tr', { style:{ cursor:'pointer' }, onclick:()=>navigate(`#league/${d.lg.id}`) },
            h('td', null, h('div', { class:'name-cell' }, h('span', { class:'name' }, d.me.team_name))),
            h('td', { class:'tip' }, `${d.lg.platform === 'espn' ? 'ESPN redraft' : d.lg.type === 0 ? 'Redraft' : d.lg.is_superflex ? 'Superflex' : d.lg.is_idp ? 'IDP' : '1QB'} · ${d.lg.total_rosters}tm`),
            h('td', { class:'right tnum' }, d.rec),
            h('td', { class:'right tnum', style:{ fontWeight:700, color: d.rank <= Math.ceil(d.lg.total_rosters*0.3) ? 'var(--green)' : d.rank > Math.ceil(d.lg.total_rosters*0.6) ? 'var(--red)' : 'var(--fg-1)' } }, `#${d.rank}`),
            h('td', { class:'right tnum', title: d.dyn
              ? 'Dynasty PV: KTC asset value of your best legal starting lineup.'
              : 'Redraft PV: season value over replacement of your best legal starting lineup. A different unit from the dynasty rows, so compare the rank, not the number.' },
              fmt.decimal(d.pv, 0),
              d.dyn ? null : h('span', { class:'muted', style:{ fontSize:'0.7rem', marginLeft:'4px' } }, 'vor')),
            h('td', { class:'right tnum', style:{ color:'var(--fg-3)' }, title: d.dyn ? null : 'Redraft league, no future value.' }, d.dyn ? fmt.decimal(d.fv, 0) : '—'),
            h('td', null, d.dyn
              ? h('span', { class:`badge stance-${d.stance}`, style:{ color: stanceTone[d.stance] } }, STANCE_LABEL[d.stance] || d.stance)
              : h('span', { class:'muted', title:'Redraft league, no rebuild or contend stance.' }, '—')),
            h('td', { style:{ color: d.need === '—' ? 'var(--green)' : 'var(--red)', fontWeight:600 } }, d.need),
          ))),
        )
      ));
    }

    const grid = h('div', { class:'card-grid cols-3' });
    for (const lg of window.LEAGUES || []) {
      const me = lg.rosters.find(r => r.is_me);
      const myRank = me ? rankInLeague(lg, me.roster_id) : null;
      const pv = me ? startingStrength(me, lg) : null;
      grid.appendChild(h('div', { class:'league-card', onclick:()=>navigate(`#league/${lg.id}`) },
        h('div', { class:'name' }, lg.name),
        h('div', { class:'meta' }, `${me ? me.team_name : ','} · ${lg.total_rosters}-team`),
        h('div', { class:'badges' },
          lg.is_superflex ? h('span', { class:'badge', style:{ color:'var(--amber)', borderColor:'currentColor', background:'transparent' } }, 'SUPERFLEX') : null,
          lg.is_idp ? h('span', { class:'badge', style:{ color:'var(--blue)', borderColor:'currentColor', background:'transparent' } }, 'IDP') : null,
          lg.platform === 'espn' ? h('span', { class:'badge', style:{ color:'var(--accent-hot)', borderColor:'currentColor', background:'transparent' } }, 'ESPN') : null,
          lg.type === 0 ? h('span', { class:'badge' }, 'REDRAFT') : null,
          h('span', { class:'badge' }, lg.status === 'pre_draft' ? 'Pre-Draft' : lg.status),
          me && myRank ? h('span', { class:'badge', style:{ color:'var(--accent-hot)', borderColor:'currentColor', background:'transparent' } }, `Rank #${myRank}`) : null,
        ),
        pv != null ? h('div', { style:{ marginTop:'12px' },
          title:'Best LEGAL starting lineup today: one asset per slot, positions respected, taxi/IR/Out benched.' },
          h('div', { class:'stat-num' }, fmt.decimal(pv, 0)),
          h('div', { class:'stat-label' }, 'Starting Value (PV)')
        ) : null
      ));
    }
    main.appendChild(grid);
  }

  // ============================================================
  // ROUTE: Single league
  // ============================================================
  function rankInLeague(league, rosterId) {
    const all = league.rosters.map(r => ({ id:r.roster_id, score: computeRosterStrength(r, league).total }));
    all.sort((a,b)=>b.score-a.score);
    return all.findIndex(x => x.id === rosterId) + 1;
  }

  // Number of starting (non-bench) OFFENSE slots — the value model is offense-only,
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
      else if (s === 'FLEX') slots.push({ pos: 'FLEX', flex: true });
      else if (s === 'SUPER_FLEX') slots.push({ pos: 'SUPER_FLEX', flex: true });
    }
    return slots;
  }
  const SLOT_TAKES = {
    QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'],
    FLEX: ['RB', 'WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
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
  // one of them — a Q player starts most weeks, and benching every Q would gut
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
  // rule set (1 PPR, 4pt pass TD, INT -1) — see score_offense.py. Rescore from
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
  // A pick is a rookie of unknown position, so it's eligible anywhere — but it
  // tries flex slots FIRST, so it can't evict a QB from the only QB slot.
  // `presorted` lets a caller that already holds assets in descending `v` skip
  // the sort. The championship simulator does: a player's season multiplier is
  // fixed once the season is rolled, so the ordering can't change week to week,
  // and re-sorting 27 assets on every team-week was most of the runtime.
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
  // Calibrated against this repo's own numbers — 2026 blended projections
  // (projections/offense-projections.json) vs KTC 1QB value, 330 matched
  // offense players. Median actual points / value-implied points by age:
  //   21-22 0.85 | 23 0.74 | 24 0.93 | 25 0.98 | 26-27 1.09 | 28-29 1.30 | 30+ 1.42
  // and for true rookies specifically 0.75 (RB 0.75, WR 0.84, TE 0.60, n=37).
  // So: rookie season 0.75, then ramp to parity as the modeled player ages in.
  // Only picks get this. Rostered players keep full value — the same bias runs
  // through every value view on the site, and quietly rescaling half of one
  // metric would make it incomparable to the rest.
  const ROOKIE_STARTABILITY = [0.75, 0.85, 0.93, 1.0];
  function rookieStartability(seasonsSinceDraft) {
    return ROOKIE_STARTABILITY[Math.min(Math.max(0, seasonsSinceDraft), ROOKIE_STARTABILITY.length - 1)];
  }

  // Starting-lineup strength: value of the best LEGAL starting lineup a roster
  // can field (one asset per slot, positions respected). This is the contention
  // signal — NOT the sum of every rostered player, which just rewards hoarding
  // depth and mislabels a deep-but-weak-starter roster as a contender.
  // yearsOut=0 -> Present Value (starters now). yearsOut>0 -> Future Value: each
  // player's value aged by the position age-curve, then the lineup re-filled (so a
  // young riser can crack the future lineup over an aging vet).
  function startingStrength(roster, league, yearsOut = 0, includePicks = false) {
    const idx = rankIndex();
    const vals = [];
    // Present Value is what you can start TODAY, so taxi and IR are out. Future
    // Value includes them: taxi eligibility expires and injuries heal, so a
    // stashed rookie is a real future starter, not a phantom.
    for (const pid of startableIds(roster, { includeStashed: yearsOut > 0 })) {
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
      // season — the extended horizon means each team's own 2029/2030 firsts are
      // assumed too (default slate), so the out-years reload instead of only aging.
      for (const p of rosterOwnedPicks(roster.roster_id, league, Math.max(2, yearsOut + 1))) {
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

  // 5-level buy/sell stance for a fantasy roster, league-relative. Quintile of
  // STARTING-lineup strength (best-K, picks excluded): a true contender fields
  // strong starters. Ranking by total roster value instead would reward a team
  // that hoards mediocre depth — that was mislabeling weak-starter rosters as
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
    const validTabs = lg.platform === 'espn' ? ['standings','players'] : ['standings','players','transactions'];
    const requestedTab = tabArg === 'timeline' ? 'transactions' : tabArg;
    const tab = validTabs.includes(requestedTab) ? requestedTab : 'standings';

    main.innerHTML = '';

    main.appendChild(breadcrumbs([
      { label:'My Leagues', hash:'#leagues' },
      { label: lg.short_name || lg.name },
    ]));

    const formatTag = lg.type === 0 ? 'REDRAFT' : (lg.is_superflex ? 'SUPERFLEX' : (lg.is_idp ? 'IDP' : '1QB'));
    main.appendChild(h('div', { class:'page-header' },
      h('div', null,
        h('div', { class:'page-eyebrow' },
          'LEAGUE',
          h('span', { class:'page-eyebrow-tag' }, formatTag),
          lg.platform === 'espn' ? h('span', { class:'page-eyebrow-tag' }, 'ESPN') : null,
          lg.status === 'pre_draft' ? h('span', { class:'page-eyebrow-tag' }, 'PRE-DRAFT') : null,
        ),
        h('h1', { class:'page-title' }, lg.name),
        h('p', { class:'page-sub' }, `${me?.team_name || ','} · ${lg.total_rosters}-team`)
      ),
      h('div', { class:'page-actions' },
        me ? h('a', { href:`#roster/${lg.id}/${me.roster_id}` }, h('button', { class:'primary' }, 'My Roster →')) : null,
        me ? h('a', { href:`#compare/${lg.id}/${me.roster_id}/${(lg.rosters.find(r => !r.is_me) || lg.rosters[1]).roster_id}` },
          h('button', { class:'ghost' }, 'Compare ⇄')) : null,
        h('a', { href:`#trade/${lg.id}` }, h('button', { class:'ghost' }, 'Trade Lab ⇄')),
        h('a', { href:lg.external_url || `https://sleeper.com/leagues/${lg.id}/standings`, target:'_blank', rel:'noopener' },
          h('button', { class:'ghost' }, `Open in ${lg.platform === 'espn' ? 'ESPN' : 'Sleeper'} ↗`))
      )
    ));

    const leagueTabs = [
      { key:'standings', label:'Standings', icon:'⚑', count: lg.total_rosters },
      { key:'players',   label:'Players',   icon:'★' },
    ];
    if (lg.platform !== 'espn') leagueTabs.push({ key:'transactions', label:'Transactions', icon:'⇄' });
    main.appendChild(tabBar(leagueTabs, tab, (k) => k === 'standings' ? `#league/${lg.id}` : `#league/${lg.id}/${k}`));

    if (lg.is_superflex) {
      main.appendChild(h('div', { class:'league-banner superflex' },
        h('strong', null, '⚠ SUPERFLEX, '),
        'A second QB can start in the SUPER_FLEX slot. Top-12 QBs are treated as Cornerstone-tier; QB values get a 1.40× position multiplier in team strength.'));
    } else if (lg.is_idp) {
      main.appendChild(h('div', { class:'league-banner idp' },
        h('strong', null, '◇ IDP, '),
        'This league has IDP_FLEX slots. Defensive players (LB/DB/DL) score; LBs get a 1.10× multiplier in team strength.'));
    }

    if (tab === 'standings') {
    // Standings / Strength rankings
    const lgDynasty = isDynastyLeague(lg);
    main.appendChild(h('h2', { class:'page-title', style:{ fontSize:'1.2rem', marginTop:'8px' } }, 'Team Strength Rankings'));

    // 5-year value outlook per team. Sparkline bars + the dedicated line chart both
    // read this trajectory: projected starting-lineup value for CURRENT_SEASON..+4
    // (position-aware aging, best-K re-picked each year, owned picks folded in once
    // they convert). year-0 == PV, last year == FV.
    const TRAJ_YEARS = 5;
    const trajLabels = [];
    for (let y = 0; y < TRAJ_YEARS; y++) trajLabels.push(String(CURRENT_SEASON + y));

    // Trajectory is the STARTING-lineup curve (same scale as PV/FV), not the
    // full-roster value curve — so bar[0] == PV, bar[last] == FV and the slope
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
    // Rank by STARTING-lineup strength (best-K), not sum of every rostered player —
    // total-value rewards hoarding depth and buries a strong-starters/thin team.
    computed.sort((a,b) => b.st - a.st);
    const maxTotal = computed[0].st || 1;
    // Common sparkline scale across all teams. Zoom the y-axis to the actual
    // [min,max] across every team-year rather than starting at 0 — dynasty
    // value only swings ~5-20% over 3 years, so a 0-based axis flattens the
    // slope to invisibility. Zoomed, bar height still ranks teams (taller =
    // stronger) AND the within-team slope shows the trend.
    const allTrajVals = computed.flatMap(c => c.traj);
    const trajMax = Math.max(...allTrajVals);
    const trajMin = Math.min(...allTrajVals);
    const trajSpan = (trajMax - trajMin) || 1;
    const trajH = (v) => 12 + ((v - trajMin) / trajSpan) * 88; // 12-100% band

    main.appendChild(h('p', { class:'tip', style:{ marginTop:'-4px', marginBottom:'10px' } },
      lgDynasty
        ? `Starting-lineup value projected ${trajLabels[0]}–${trajLabels[TRAJ_YEARS-1]} (position-aware aging, best-K re-picked each year, owned picks fold in once they convert). Year 1 = PV, year 5 = FV.`
        : 'Best legal starting lineup today (positions respected, taxi/IR/Out benched). Redraft, so there is no multi-year projection.'));

    const standings = h('div');
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

      standings.appendChild(h('div', { class:`strength-row ${isMe?'you':''}`, onclick:()=>navigate(`#roster/${lg.id}/${r.roster_id}`) },
        h('div', { class:'rank' }, `#${i+1}`),
        h('div', { class:'team' },
          h('div', { class:'team-name' },
            r.team_name,
            isMe ? h('span', { class:'badge you', style:{ marginLeft:'8px' } }, 'YOU') : null
          ),
          h('div', { class:'owner' }, r.owner_name),
          h('div', { class:'strength-detail' },
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
          )
        ),
        h('div', { class:'score-cell' },
          h('div', { class:'score', title:'PV: present starting-lineup value (now)' }, fmt.decimal(st,1)),
          lgDynasty ? (() => { const fv = row.fv, d = st > 0 ? (fv - st) / st * 100 : 0; const c = d >= 2 ? 'var(--green)' : d <= -8 ? 'var(--amber)' : 'var(--fg-2)'; return h('div', { class:'delta', style:{ color: c }, title:`FV: starting-lineup value in ${trajLabels[TRAJ_YEARS-1]} (same scale as the ${trajLabels[TRAJ_YEARS-1].slice(2)} bar)` }, `FV ${fmt.decimal(fv, 0)} · ${d >= 0 ? '+' : ''}${d.toFixed(0)}%`); })() : null,
        ),
        lgDynasty ? h('div', { class:'str-traj' },
          spark,
          h('div', { class:'str-traj-foot' },
            h('span', { class:'arch', style:{ color: tColor } }, tLabel),
          ),
        ) : null
      ));
    });
    main.appendChild(standings);
    } // end standings tab

    if (tab === 'players') renderLeaguePlayers(main, lg);
    if (tab === 'transactions') renderLeagueTimeline(main, lg);
  }

  // ============================================================
  // viewLeague subviews: Players + Timeline
  // ============================================================
  // League-scoped player rankings. Shows the full dynasty ranking list
  // overlaid with ownership in THIS league (which roster has them, or FA).
  // Filters: position, category, ownership scope.
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
      { pos:'ALL', cat:'ALL', team:'ALL', scope:'all', q:'',
        sort:lg.type === 0 ? 'weekly-sleeper' : 'rank', dir:lg.type === 0 ? 'desc' : 'asc',
        proj:'blend', view:lg.type === 0 ? 'weekly' : 'stats' },
      JSON.parse(localStorage.getItem(lsKey) || '{}')
    );
    // A redraft filter persisted from before the gate could still name a column
    // that no longer renders. Fall back to the view's natural sort.
    if (!leagueDynasty && filter.sort === 'value') {
      filter.sort = 'weekly-sleeper'; filter.dir = 'desc';
    }
    const teamOfP = (p) => (window.PLAYERS[p._sleeperId] || {}).team || p.team || null;
    const persist = () => { try { localStorage.setItem(lsKey, JSON.stringify(filter)); } catch {} };

    main.appendChild(h('h2', { class:'page-title', style:{ fontSize:'1.2rem', marginTop:'8px' } }, 'Player Rankings'));

    // Filter bar
    const filterBar = h('div', { class:'filters' });
    const search = h('input', { type:'search', placeholder:'Search players', value: filter.q,
      oninput:(e) => { filter.q = e.target.value.trim(); persist(); render(); } });
    filterBar.appendChild(h('div', { class:'group' }, h('label', null, 'Search'), search));

    const viewBtns = h('div', { class:'toggle-group player-table-views', role:'group', 'aria-label':'Player table view' });
    for (const [key, label, sort, dir] of [
      ['stats','Stats','rank','asc'], ['weekly','Weekly','weekly-sleeper','desc'],
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
    const weeklyView = filter.view === 'weekly' || filter.view === 'sleeper-weeks';
    const posOptions = lg.is_idp && !weeklyView ? ['ALL','QB','RB','WR','TE','FLEX','LB','DB','DL'] : ['ALL','QB','RB','WR','TE','FLEX'];
    for (const p of posOptions) {
      posBtns.appendChild(h('button', {
        class:`toggle ${filter.pos===p?'active':''}`,
        onclick:(e) => { filter.pos = p; persist();
          posBtns.querySelectorAll('.toggle').forEach(b => b.classList.toggle('active', b===e.target));
          render(); }
      }, p));
    }
    filterBar.appendChild(h('div', { class:'group' }, h('label', null, 'Pos'), posBtns));

    if (filter.view === 'stats') {
      const catSel = h('select', { onchange:(e) => { filter.cat = e.target.value; persist(); render(); } });
      catSel.appendChild(h('option', { value:'ALL' }, 'All Categories'));
      for (const [cid, label] of Object.entries(window.CATEGORY_LABELS)) {
        catSel.appendChild(h('option', { value:cid, selected: filter.cat===cid?'':null }, label));
      }
      filterBar.appendChild(h('div', { class:'group' }, h('label', null, 'Category'), catSel));
    }

    const teamSel = h('select', { onchange:(e) => { filter.team = e.target.value; persist(); render(); } });
    teamSel.appendChild(h('option', { value:'ALL' }, 'All Teams'));
    for (const t of [...new Set(idx.all.map(teamOfP).filter(Boolean))].sort()) {
      teamSel.appendChild(h('option', { value:t, selected: filter.team===t?'':null }, t));
    }
    filterBar.appendChild(h('div', { class:'group' }, h('label', null, 'Team'), teamSel));

    const scopeBtns = h('div', { class:'toggle-group' });
    for (const [k, lbl] of [['all','All'],['rostered','Rostered'],['free','Free Agent'],['mine',"You"]]) {
      scopeBtns.appendChild(h('button', {
        class:`toggle ${filter.scope===k?'active':''}`,
        onclick:(e) => { filter.scope = k; persist();
          scopeBtns.querySelectorAll('.toggle').forEach(b => b.classList.toggle('active', b===e.target));
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
    // (LB/DB/DL/CB/S/DT/DE/NT) only show in IDP leagues; DST/K are excluded
    // entirely because the rankings sources don't cover them as dynasty
    // assets. Without this, a 1QB-PPR league's Players list pulls in defenders
    // from any IDP-aware source and pollutes the view.
    const idpPositions = new Set(['LB','DB','DL','CB','S','DT','DE','NT']);
    const irrelevantPositions = new Set(['DST','DEF','K','P']);
    const isLeagueRelevantPos = (pos) => {
      if (irrelevantPositions.has(pos)) return false;
      if (!lg.is_idp && idpPositions.has(pos)) return false;
      return true;
    };

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
        if (filter.scope === 'rostered' && !ownerRoster) return false;
        if (filter.scope === 'free' && ownerRoster) return false;
        if (filter.scope === 'mine' && !(ownerRoster && ownerRoster.is_me)) return false;
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
      // Sort.
      const dir = filter.dir === 'desc' ? -1 : 1;
      const cmp = (a, b) => {
        let av, bv;
        if (filter.sort === 'weekly-vegas' || filter.sort === 'weekly-sleeper'
            || filter.sort === 'weekly-ecr' || filter.sort === 'weekly-gibbs'
            || filter.sort === 'weekly-vsdelta'
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
            // Null either side means no comparison exists, so the row stays
            // blank. The null branch below pushes it last in BOTH directions,
            // which is the whole point: a missing line is not a zero edge.
            if (filter.sort === 'weekly-vsdelta') return vsDelta(row);
            return row.sleeper?.[Number(filter.sort.slice(3)) - 1];
          };
          av = weeklyValue(a); bv = weeklyValue(b);
          if (av == null && bv == null) return a.name.localeCompare(b.name);
          if (av == null) return 1; if (bv == null) return -1;
          return (av - bv) * dir || a.name.localeCompare(b.name);
        }
        if (typeof filter.sort === 'string' && filter.sort.startsWith('wk:')) {
          const wnum = +filter.sort.slice(3);
          const oppPA = (p) => { const s = teamSos((window.PLAYERS[p._sleeperId] || {}).team || p.team); if (!s) return null; const g = s.schedule.find(x => x.week === wnum); if (!g) return null; const e = teamEnv(g.opp); return e ? e.implied_pa : null; };
          av = oppPA(a); bv = oppPA(b);
          if (av == null && bv == null) return 0;
          if (av == null) return 1; if (bv == null) return -1;
          return (bv - av) * dir; // desc = weakest opponent D (easiest) first
        }
        if (typeof filter.sort === 'string' && filter.sort.startsWith('xr:')) {
          const src = expertSources().find(s => s.id === filter.sort.slice(3));
          const rk = (p) => (src && expertRankOf(src, p.name, p._sleeperId)) ?? 9999;
          av = rk(a); bv = rk(b); return (av - bv) * dir; // asc = better rank first
        }
        switch (filter.sort) {
          case 'value': av = tierValue(a, lg); bv = tierValue(b, lg); return (bv - av) * dir; // desc-natural
          case 'proj':  av = projPointsFor(a._sleeperId, filter.proj) ?? -1; bv = projPointsFor(b._sleeperId, filter.proj) ?? -1; return (bv - av) * dir;
          case 'gap':   av = mispricingIndex().get(String(a._sleeperId))?.gap ?? -999; bv = mispricingIndex().get(String(b._sleeperId))?.gap ?? -999; return (bv - av) * dir;
          case 'vor':   av = vorByPid(a._sleeperId, lg, filter.proj) ?? -9999; bv = vorByPid(b._sleeperId, lg, filter.proj) ?? -9999; return (bv - av) * dir;
          case 'ppslp': av = ppEdgeByPid(a._sleeperId) ?? -9999; bv = ppEdgeByPid(b._sleeperId) ?? -9999; return (bv - av) * dir;
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
          p.rookie ? h('span', { class:'badge rookie', style:{ marginLeft:'4px' } }, 'Rookie') : null)),
        h('td', null, h('div', { style:{ display:'flex', alignItems:'center', gap:'6px' } }, posChip(p.pos),
          p._posRank ? h('span', { class:'tip tnum' }, `${p.pos}${p._posRank}`) : null)),
        h('td', null, teamChip(teamOfP(p)), ' ', envChip(teamOf(p._sleeperId) || p.team)),
      ];
      const weeklyNameCell = (p) => h('td', null, h('div', { class:'name-cell' },
        h('button', {
          type:'button', class:'name player-name-button',
          onclick:(event)=>{ event.stopPropagation(); openPlayerDetail(p.name, p._sleeperId); },
        }, p.name), injuryChip(p._sleeperId)));
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
      const rankCell = (p, value) => h('td', { class:'right tnum' },
        value == null ? emptyValue() : `${p.pos}${value}`);

      let tbl;
      if (filter.view === 'weekly') {
        tbl = h('table', { class:'data weekly-rankings-table' },
          h('thead', null, h('tr', null,
            h('th', { class:'right', style:{ width:'46px' } }, '#'),
            h('th', null, 'Player'), h('th', null, 'Pos'), h('th', null, 'Team'), h('th', null, 'Owner'),
            sortHdr('weekly-vegas', 'Vegas pts', { right:true, title:'Week PPR projection from price-adjusted BettingPros player props. Missing scoring components are filled from Sleeper.' }),
            sortHdr('weekly-sleeper', 'Sleeper pts', { right:true, title:'Sleeper weekly PPR projection.' }),
            sortHdr('weekly-vsdelta', 'V−S', { right:true, title:`Vegas minus Sleeper for week ${currentWeek}. Green = the market projects him above the model, red = below. Blank when either side has no number; blanks sort last both ways. An asterisk means most of the Vegas projection was filled in from Sleeper, so that delta is the model against itself, not market signal.` }),
            sortHdr('weekly-ecr', 'FP ECR', { right:true, title:'FantasyPros weekly PPR expert consensus positional rank.' }),
            sortHdr('weekly-gibbs', 'J. Gibbs', { right:true, title:'Jacob Gibbs weekly PPR positional rank, isolated with FantasyPros expert ID 1576.' }),
            ...VEGAS_COMPONENTS.map(c => sortHdr(`wc:${c.k}`, c.label, { right:true,
              title:`Expected ${c.label} behind the Vegas points column. Greyed when that stat had no market line and was filled from Sleeper.` })))),
          h('tbody', null, ...rows.map((p, i) => {
            const o = ownerInfo(p._sleeperId), weekly = p._weekly;
            return h('tr', { class:o.isMine ? 'you' : '', onclick:()=>openPlayerDetail(p.name, p._sleeperId) },
              h('td', { class:'right tnum muted' }, i + 1), weeklyNameCell(p),
              h('td', null, posChip(p.pos)), h('td', null, teamChip(teamOfP(p))), h('td', null, o.cell),
              pointCell(weekly.vegas, weekly.vegasBorrowed?.length
                ? `Market stats plus Sleeper fills: ${weekly.vegasBorrowed.join(', ')}` : 'BettingPros market projection'),
              pointCell(weekly.sleeper?.[currentWeek - 1], `Sleeper week ${currentWeek} PPR projection`),
              (() => {
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
              rankCell(p, weekly.ecr), rankCell(p, weekly.gibbs),
              ...VEGAS_COMPONENTS.map(c => componentCell(weekly, c)));
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
              h('td', null, o.r ? h('span', { class:'badge' + (o.isMine ? ' you' : '') }, (o.r.team_name || '').slice(0, 6)) : h('span', { class:'muted' }, 'FA')),
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
            hasProj ? sortHdr('vor', 'VOR', { right:true, title:'Value over replacement: projected points above the last startable player at this position in THIS league. Cross-position comparable — higher = more starting-lineup value.' }) : null,
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
      if (filter.view === 'weekly') {
        const coverage = weeklyData.coverage || {};
        const ecrCoverage = coverage.ecr || {}, gibbsCoverage = coverage.gibbs || {};
        const limitNote = ecrCoverage.limited && ecrCoverage.limitPerPosition
          ? ` · FantasyPros free API top ${ecrCoverage.limitPerPosition}/position` : '';
        tableWrap.appendChild(h('div', { class:'tip rankings-source-note' },
          `Week ${currentWeek} PPR · ${rows.length} shown · Vegas ${coverage.vegasPlayers || 0}`
          + ` · ECR ${ecrCoverage.available ? coverage.ecrPlayers || 0 : 'unavailable'}`
          + ` · Gibbs ${gibbsCoverage.available ? coverage.gibbsPlayers || 0 : 'unavailable'}${limitNote}.`));
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
        h('button', { class:'ghost', style:{ padding:'4px 10px', fontSize:'0.72rem', marginLeft:'auto' }, onclick:() => {
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
    if (['ELITE','CHAMPIONSHIP'].includes(valueTier.tier) && valueArchetype.tag === 'WIN-NOW') return { tag:'CONTEND', desc:'Window is open, go for it.' };
    if (valueTier.tier === 'REBUILD' || (valueArchetype.tag === 'FUTURE VALUE' && draftPicksCount >= 4)) return { tag:'REBUILD', desc:'Long-term runway; accumulate young talent + picks.' };
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
    // Pre-sort owned players by tierValue desc per position
    const byPos = { QB:[], RB:[], WR:[], TE:[], LB:[], DB:[], DL:[] };
    for (const p of rosterPlayers) {
      if (!p.ranked) continue;
      if (byPos[p.ranked.pos]) byPos[p.ranked.pos].push(p);
    }
    for (const k of Object.keys(byPos)) {
      byPos[k].sort((a, b) => tierValue(b.ranked, league) - tierValue(a.ranked, league));
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

    const usage = { QB:0, RB:0, WR:0, TE:0, LB:0, DB:0, DL:0 };
    let flexCount = 0, sfCount = 0, idpFlexCount = 0;
    const slots = [];

    for (const slot of (league.roster_positions || [])) {
      if (['BN','TAXI','IR'].includes(slot)) continue;

      let pick = null, refVal = 0, label = slot;
      if (['QB','RB','WR','TE'].includes(slot)) {
        const i = usage[slot];
        pick = byPos[slot][i];
        // Reference: max-equivalent at this slot rank in dynasty
        // (e.g., RB2 vs the 2nd-best RB available across rankings)
        const refPos = slot;
        const refIdx = league.rosters && league.rosters.length ? Math.min(i, league.rosters.length - 1) : i;
        refVal = nthByPos(refPos, refIdx);
        label = `${slot}${i + 1}`;
        usage[slot]++;
      } else if (slot === 'FLEX') {
        const remainingFlex = ['RB','WR','TE'].flatMap(p => byPos[p].slice(usage[p]));
        remainingFlex.sort((a, b) => tierValue(b.ranked, league) - tierValue(a.ranked, league));
        pick = remainingFlex[0];
        if (pick) {
          const pos = pick.ranked.pos;
          if (byPos[pos][usage[pos]] === pick) usage[pos]++;
        }
        // FLEX reference: next-best FLEX-eligible after the league fills its
        // dedicated RB/WR/TE slots. Approximate as 30 + flexCount in the
        // FLEX-eligible pool (top-40-ish across leagues).
        refVal = nthFlex((league.total_rosters || 10) * 3 + flexCount);
        label = `FLEX${flexCount + 1}`;
        flexCount++;
      } else if (slot === 'SUPER_FLEX') {
        // Best remaining QB or FLEX player. Almost always a QB.
        const remainingQB = byPos.QB.slice(usage.QB);
        const remainingFlex = ['RB','WR','TE'].flatMap(p => byPos[p].slice(usage[p]));
        const candidates = [...remainingQB, ...remainingFlex]
          .sort((a, b) => tierValue(b.ranked, league) - tierValue(a.ranked, league));
        pick = candidates[0];
        if (pick) {
          const pos = pick.ranked.pos;
          if (byPos[pos][usage[pos]] === pick) usage[pos]++;
        }
        // SF reference: 2nd-best QB available after each league's QB1 is taken
        refVal = nthByPos('QB', league.total_rosters || 10);
        label = 'SF';
        sfCount++;
      } else if (['LB','DB','DL'].includes(slot)) {
        const i = usage[slot];
        pick = byPos[slot][i];
        // No IDP rank reference; use any non-zero baseline
        refVal = pick ? tierValue(pick.ranked || { ktcValue: 1500 }, league) : 1;
        label = `${slot}${i + 1}`;
        usage[slot]++;
      } else if (slot === 'IDP_FLEX' || slot === 'IDP') {
        const remaining = ['LB','DB','DL'].flatMap(p => byPos[p].slice(usage[p]));
        pick = remaining[0];
        if (pick) {
          const pos = pick.ranked?.pos || pick.sleeper.pos;
          if (byPos[pos][usage[pos]] === pick) usage[pos]++;
        }
        refVal = pick ? (tierValue(pick.ranked, league) || 15) : 15;
        label = `IDP${idpFlexCount + 1}`;
        idpFlexCount++;
      } else continue;

      const myVal = pick ? tierValue(pick.ranked, league) : 0;
      const grade = refVal > 0 ? Math.min(10, (myVal / refVal) * 10) : (pick ? 5 : 0);
      // Future grade: age this player's value 3 seasons, re-grade against the same
      // slot reference. Drives the FV tick on the slot bar (present grade is the fill).
      const myValFv = pick ? myVal * ageRetention(pick.sleeper?.age ?? pick.ranked?.age, pick.ranked?.pos || pick.sleeper?.pos, 3) : 0;
      const fvGrade = refVal > 0 ? Math.min(10, (myValFv / refVal) * 10) : (pick ? 5 : 0);
      slots.push({
        slot: label,
        player: pick?.sleeper?.name || '(empty)',
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
  function gradeBench(rosterPlayers, lg) {
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
      if (!p.ranked) continue;
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
      .filter(p => !owned(p))
      .slice(0,4);
    for (const p of topUnowned) {
      buys.push({ player: p, sleeper: window.PLAYERS[p._sleeperId] || null, intensity: 'SOFT BUY', reason: 'Cornerstone-A talent. Buy on any dip.' });
    }
    const rookieBuys = idx.all.filter(p => p.rookie && p.category === 'upside_premier' && p.tier === 'S')
      .filter(p => !owned(p))
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
      // Upside Premier count — used by rebuild-pick-ceiling-warning to see
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
      { label:'My Leagues', hash:'#leagues' },
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
    const rp = getRosterPlayers(r);
    const cs = s.rankedPlayers.filter(p=>p.ranked.category==='cornerstone').length;
    const fnd = s.rankedPlayers.filter(p=>p.ranked.category==='foundational').length;
    const valueTier = classifyValueTier(s, myRank, lg.total_rosters, cs);
    const valueArchetype = classifyValueArchetype(rp);
    const rosterArchetype = classifyRosterArchetype(rp);
    const dcSummary = getDraftCapitalSummary(r, leagueId);
    const draftPicksCount = 8 + dcSummary.totalAcquired - dcSummary.totalLost;
    const outlook = classifyTwoYearOutlook(valueTier, valueArchetype, draftPicksCount);
    const grades = {
      QB: gradePosition(rp, 'QB', lg), RB: gradePosition(rp, 'RB', lg),
      WR: gradePosition(rp, 'WR', lg), TE: gradePosition(rp, 'TE', lg),
      Bench: gradeBench(rp, lg), Draft: gradeDraftCapital(r, leagueId),
    };
    // Compute slot result early so Overall Grade weights starting slots by
    // their PPG impact (a great QB1 should outweigh a mediocre FLEX4).
    const slotResult = gradeLineupSlots(rp, lg);
    const slotWeighted = (() => {
      let num = 0, den = 0;
      for (const s of slotResult.slots) {
        const w = slotPPG(s.slot, lg);
        num += s.grade * w; den += w;
      }
      return den ? num / den : 0;
    })();
    // Overall = 75% PPG-weighted lineup + 15% bench + 10% draft capital.
    // Lineup is what wins, bench is depth insurance, picks are future equity.
    // Redraft has no future equity, so that 10% is redistributed rather than
    // scored as zero, which would drag every redraft roster down a full point.
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
          h('span', { class:'br-arch', title: valueArchetype.desc }, h('span', { class:'br-arch-tag' }, valueArchetype.tag), ' value'),
          h('span', { class:'br-arch-sep' }, '·'),
          h('span', { class:'br-arch', title: rosterArchetype.desc }, h('span', { class:'br-arch-tag' }, rosterArchetype.tag), ' roster'),
          rosterDynasty ? h('span', { class:'br-arch-sep' }, '·') : null,
          rosterDynasty ? h('span', { class:'br-arch', title: outlook.desc }, h('span', { class:'br-arch-tag' }, outlook.tag), ' outlook') : null,
        ),
      ),
      h('div', { class:'br-stat' },
        h('div', { class:'br-stat-num tnum' }, fmt.decimal(s.total,1)),
        h('div', { class:'br-eyebrow' }, 'Strength'),
        h('div', { class:'br-stat-sub' },
          `Rank #${myRank} of ${lg.total_rosters}`,
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
      const nthAtPos = (pos, n) => {
        const sorted = idx.all.filter(x => x.pos === pos);
        return sorted[n] ? tierValue(sorted[n], lg) : 1;
      };
      const flexRef = (() => {
        const flexEligible = idx.all.filter(x => ['RB','WR','TE'].includes(x.pos))
          .sort((a, b) => tierValue(b, lg) - tierValue(a, lg));
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
          myVal: tierValue(backupQb.ranked, lg),
          refVal: refV,
          grade: refV > 0 ? Math.min(10, Math.round(tierValue(backupQb.ranked, lg) / refV * 10 * 10) / 10) : 0,
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
          myVal: tierValue(backupTe.ranked, lg),
          refVal: refV,
          grade: refV > 0 ? Math.min(10, Math.round(tierValue(backupTe.ranked, lg) / refV * 10 * 10) / 10) : 0,
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
        .sort((a, b) => tierValue(b.ranked, lg) - tierValue(a.ranked, lg))
        .slice(0, 3);
      if (flexCandidates.length) {
        const avgVal = flexCandidates.reduce((s, p) => s + tierValue(p.ranked, lg), 0) / flexCandidates.length;
        const refV = flexRef ? tierValue(flexRef, lg) : 1;
        out.push({
          slot: 'FLEX DEP',
          player: flexCandidates.map(p => p.sleeper.name),  // array, rendered as chips
          myVal: avgVal,
          refVal: refV,
          grade: refV > 0 ? Math.min(10, Math.round(avgVal / refV * 10 * 10) / 10) : 0,
          isDepth: true,
        });
      }
      return out;
    })();
    // Find the player attached to each slot for the bar label
    const slotPlayer = (s) => s.player && s.player !== '(empty)' ? s.player : '(empty)';
    const allBars = [
      ...slotResult.slots.map(s => ({ slot: s.slot, grade: s.grade, fvGrade: s.fvGrade, player: slotPlayer(s), myVal: s.myVal, refVal: s.refVal, isDepth: false })),
      ...benchDepth.map(s => ({ slot: s.slot, grade: s.grade, player: s.player, myVal: s.myVal, refVal: s.refVal, isDepth: true })),
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
      if (!entry || !entry._posRank) return null;
      return h('span', { class:'slot-bar-posrank tnum', title:`Dynasty position rank` }, `${entry.pos}${entry._posRank}`);
    };

    const buildSlotRow = (s, i) => {
      // Track width = how much that slot matters (PPG impact). Fill % = grade.
      const ratio = ppgs[i] / maxPPG;
      const trackPct = Math.round(25 + ratio * 75);
      const fillPct = Math.max(2, Math.min(100, s.grade * 10));
      const color = s.grade >= 7.5 ? 'var(--green)'
                  : s.grade >= 5.5 ? 'var(--amber)'
                  : s.grade >= 3.5 ? '#fb923c'
                  : 'var(--red)';
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

      const posRankChip = !Array.isArray(s.player) ? buildPosRankChip(s.player) : null;

      return h('div', {
        class: 'slot-bar-row' + (isClickable ? ' clickable' : ''),
        title: titleText,
        onclick: onClick,
      },
        h('span', { class:'slot-bar-label' }, s.slot),
        nameCol,
        posRankChip || h('span'),
        h('span', { class:'slot-bar-trackbox' },
          h('span', { class:'slot-bar-track', style:{ width: trackPct + '%' }, title: rosterDynasty ? 'Fill = present grade (PV). Faint tick = passing (7.0). ◆ = grade in 3 years (FV).' : 'Fill = present grade (PV). Faint tick = passing (7.0).' },
            h('span', { class:'slot-bar-fill', style:{ width: fillPct + '%', background: color } }),
            h('span', { class:'slot-bar-tick', style:{ left: '70%' } }),
            (rosterDynasty && s.fvGrade != null) ? h('span', { class:`slot-bar-fv ${fvDir}`, style:{ left: fvPct + '%' }, title:`FV (3-yr): ${s.fvGrade.toFixed(1)} (${fvDir})` }) : null,
          ),
        ),
        h('span', { class:'slot-bar-grade', style:{ color } }, s.grade.toFixed(1)),
      );
    };

    // Two side-by-side panels: starters on the left, depth on the right.
    const startersPanel = h('div', { class:'slot-bars slot-bars-panel' },
      h('div', { class:'slot-bars-heading' }, 'Starters'),
    );
    const depthPanel = h('div', { class:'slot-bars slot-bars-panel' },
      h('div', { class:'slot-bars-heading' }, 'Depth'),
    );
    allBars.forEach((s, i) => {
      const row = buildSlotRow(s, i);
      (s.isDepth ? depthPanel : startersPanel).appendChild(row);
    });
    main.appendChild(h('div', { class:'slot-bars-grid' }, startersPanel, depthPanel));
    main.appendChild(h('div', { class:'slot-bars-legend tip' },
      h('span', null, 'Bar length = slot importance (PPG).'),
      h('span', { class:'sep' }, '·'),
      h('span', null, 'Fill = present grade (PV).'),
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
        h('table', { class:'data' },
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

    } // end if (r.is_me && tab === 'strategy') — advice block

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
            }}, h('button', { class:'primary' }, 'Open Trade Calculator with This Pairing →')),
            h('a', { href:`#compare/${lg.id}/${myRoster.roster_id}/${r.roster_id}` },
              h('button', { class:'ghost' }, 'Compare Side-by-Side'))
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
                h('td', null, h('div', { class:'name-cell' }, h('span', { class:'name' }, sp.name))),
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
      'QB2': 6, 'QB3': 5, 'TE2': 3, 'FLEX DEP': 7,
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
      : surplus > 0 ? `+${surplus}`
      : `${surplus}`;
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
        h('span', { class:'pos-col-pname' }, sleeper.name, injuryChip(p.pid)),
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
          realPos ? h('span', { class:'pos-col-need' }, ` ${startableCount}/${need.toFixed(1)}`) : null,
        ),
        h('div', { class:'pos-col-head-right' },
          surplus != null ? h('span', { class:'pos-col-surplus tnum', style:{ color: surplusColor } }, surplusLabel) : null,
          h('span', { class:'pos-col-total muted tnum' }, players.length),
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

    // Augmented candidate pool — players + picks.
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
      h('a', { href:'gibbs-tiers.html' }, 'Open the Gibbs tier board'),
      ` for all ${gibbsBoardShape().text}, movement since his previous board, and who you already roster.`));
    // His Aug 22 board is a top 200 and only ranks 85-200 are sourced, so it lives on
    // its own delta page instead of replacing the complete Aug 14 board above.
    main.appendChild(h('p', { class:'page-sub', style:{ marginTop:'-2px' } },
      h('a', { href:'gibbs-update-2026-08-22.html' }, 'Aug 22 update, ranks 85-200'),
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
    const formatSel = h('select', null,
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
  function viewCompare(leagueId, rA, rB) {
    const main = $('#main');
    main.innerHTML = '';
    const lg = (window.LEAGUES || []).find(l => l.id === leagueId);
    if (!lg) { main.appendChild(h('div', { class:'empty' }, 'League not found.')); return; }
    const me = lg.rosters.find(r => r.is_me) || lg.rosters[0];
    const a = lg.rosters.find(r => String(r.roster_id) === String(rA)) || me;
    const b = lg.rosters.find(r => String(r.roster_id) === String(rB)) || lg.rosters.find(r => r.roster_id !== a.roster_id) || lg.rosters[1];

    main.appendChild(h('div', { class:'page-header' },
      h('div', null,
        h('h1', { class:'page-title' }, 'Compare Rosters'),
        h('p', { class:'page-sub' }, `${lg.name} · head-to-head positional + value diff`)
      ),
      h('div', { class:'page-actions' },
        h('a', { href:`#league/${lg.id}` }, h('button', { class:'ghost' }, '← League'))
      )
    ));

    function rosterPicker(label, current, otherId, onPick) {
      const sel = h('select', { onchange: e => onPick(parseInt(e.target.value, 10)) });
      for (const r of lg.rosters) {
        sel.appendChild(h('option', { value: r.roster_id, selected: r.roster_id === current.roster_id ? '' : null, disabled: r.roster_id === otherId ? '' : null },
          `${r.team_name} (${r.owner_name})${r.is_me?' ★':''}`));
      }
      return h('div', { class:'group' }, h('label', null, label), sel);
    }
    main.appendChild(h('div', { class:'filters' },
      rosterPicker('Side A', a, b.roster_id, (rid)=>navigate(`#compare/${leagueId}/${rid}/${b.roster_id}`)),
      h('span', { class:'tip', style:{ fontSize:'1.2rem', padding:'0 10px' } }, 'vs'),
      rosterPicker('Side B', b, a.roster_id, (rid)=>navigate(`#compare/${leagueId}/${a.roster_id}/${rid}`)),
    ));

    const aRP = getRosterPlayers(a), bRP = getRosterPlayers(b);
    const aS = computeRosterStrength(a, lg).total;
    const bS = computeRosterStrength(b, lg).total;
    const aGrades = { QB: gradePosition(aRP, 'QB', lg), RB: gradePosition(aRP, 'RB', lg), WR: gradePosition(aRP, 'WR', lg), TE: gradePosition(aRP, 'TE', lg) };
    const bGrades = { QB: gradePosition(bRP, 'QB', lg), RB: gradePosition(bRP, 'RB', lg), WR: gradePosition(bRP, 'WR', lg), TE: gradePosition(bRP, 'TE', lg) };

    // Headline strip
    main.appendChild(h('div', { class:'card-grid cols-2', style:{ marginTop:'14px' } },
      h('div', { class:'card', style:{ borderColor:'color-mix(in oklab, var(--accent) 45%, var(--border))' } },
        h('div', { class:'tip' }, 'SIDE A'),
        h('div', { class:'stat-num' }, a.team_name),
        h('div', { class:'stat-label' }, a.owner_name + (a.is_me?' · YOU':'')),
        h('div', { style:{ marginTop:'8px', fontSize:'1.4rem', fontWeight:700 } }, fmt.decimal(aS,1), h('span', { class:'tip' }, ' strength')),
      ),
      h('div', { class:'card', style:{ borderColor:'color-mix(in oklab, var(--blue) 45%, var(--border))' } },
        h('div', { class:'tip' }, 'SIDE B'),
        h('div', { class:'stat-num' }, b.team_name),
        h('div', { class:'stat-label' }, b.owner_name + (b.is_me?' · YOU':'')),
        h('div', { style:{ marginTop:'8px', fontSize:'1.4rem', fontWeight:700 } }, fmt.decimal(bS,1), h('span', { class:'tip' }, ' strength')),
      ),
    ));

    // Position grade compare
    main.appendChild(h('h2', { class:'section-title' }, 'Positional Grades'));
    main.appendChild(h('div', { class:'card', style:{ padding:0, overflow:'hidden' } },
      h('table', { class:'data' },
        h('thead', null, h('tr', null,
          h('th', { class:'center' }, 'Side A'),
          h('th', null, 'Position'),
          h('th', { class:'center' }, 'Side B'),
          h('th', { class:'right' }, 'Δ'),
        )),
        h('tbody', null, ...['QB','RB','WR','TE'].map(p => {
          const av = aGrades[p], bv = bGrades[p], d = av - bv;
          const win = Math.abs(d) >= 1.5 ? (d > 0 ? 'A' : 'B') : null;
          return h('tr', null,
            h('td', { class:'center tnum', style:{ color: win==='A' ? 'var(--green)' : null, fontWeight: win==='A' ? 700 : 400 } }, av.toFixed(1)),
            h('td', { class:'center' }, h('strong', null, p)),
            h('td', { class:'center tnum', style:{ color: win==='B' ? 'var(--green)' : null, fontWeight: win==='B' ? 700 : 400 } }, bv.toFixed(1)),
            h('td', { class:'right tnum', style:{ color: d > 0 ? 'var(--green)' : d < 0 ? 'var(--red)' : 'var(--fg-3)' } }, (d>0?'+':'') + d.toFixed(1))
          );
        }))
      )
    ));

    // Cornerstones compare
    main.appendChild(h('h2', { class:'section-title' }, 'Cornerstones / Foundational'));
    const csA = aRP.filter(p => p.ranked && (p.ranked.category === 'cornerstone' || p.ranked.category === 'foundational'));
    const csB = bRP.filter(p => p.ranked && (p.ranked.category === 'cornerstone' || p.ranked.category === 'foundational'));
    csA.sort((x,y) => tierValue(y.ranked, lg) - tierValue(x.ranked, lg));
    csB.sort((x,y) => tierValue(y.ranked, lg) - tierValue(x.ranked, lg));
    main.appendChild(h('div', { class:'card-grid cols-2' },
      h('div', { class:'card' }, h('div', { class:'card-title' }, `${a.team_name} (${csA.length})`),
        ...csA.map(p => h('div', { class:'pos-col-row', onclick: ()=>openPlayerDetail(p.sleeper.name, p.sleeper.id) },
          h('div', { class:'pos-col-name' }, posChip(p.sleeper.pos), (ourTierChip(p.sleeper.id) || tierChip(p.ranked.tier, p.ranked.category)), h('span', null, p.sleeper.name)),
          h('span', { class:'tnum' }, fmt.decimal(tierValue(p.ranked, lg), 1))
        ))
      ),
      h('div', { class:'card' }, h('div', { class:'card-title' }, `${b.team_name} (${csB.length})`),
        ...csB.map(p => h('div', { class:'pos-col-row', onclick: ()=>openPlayerDetail(p.sleeper.name, p.sleeper.id) },
          h('div', { class:'pos-col-name' }, posChip(p.sleeper.pos), (ourTierChip(p.sleeper.id) || tierChip(p.ranked.tier, p.ranked.category)), h('span', null, p.sleeper.name)),
          h('span', { class:'tnum' }, fmt.decimal(tierValue(p.ranked, lg), 1))
        ))
      ),
    ));

    main.appendChild(h('div', { class:'tip', style:{ marginTop:'12px' } },
      'Want to swap players between these rosters? ',
      h('a', { href:`#trade/${lg.id}`, onclick:(e)=>{ TRADE_STATE.leagueId=lg.id; TRADE_STATE.sideA={rosterId:a.roster_id, picks:new Set()}; TRADE_STATE.sideB={rosterId:b.roster_id, picks:new Set()}; } }, 'Open Trade Calculator →')
    ));
  }

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
  // Trade Finder: fair 1-for-1 swaps where each side sends from a positional
  // SURPLUS into the other side's positional NEED, within a value band. Returns
  // the single best proposal per partner, ranked by fit + fairness.
  function suggestTrades(lg, me) {
    const posList = ['QB', 'RB', 'WR', 'TE'];
    const myRP = getRosterPlayers(me);
    const mySS = rosterSurplusShortage(myRP, lg);
    const myNeed = new Set(posList.filter(p => (mySS[p]?.surplus ?? 0) <= -1));
    const mySurp = new Set(posList.filter(p => (mySS[p]?.surplus ?? 0) >= 1));
    if (!myNeed.size || !mySurp.size) return [];
    const out = [];
    for (const them of lg.rosters) {
      if (them.is_me) continue;
      const theirRP = getRosterPlayers(them);
      const tSS = rosterSurplusShortage(theirRP, lg);
      const theirNeed = new Set(posList.filter(p => (tSS[p]?.surplus ?? 0) <= -1));
      const theirSurp = new Set(posList.filter(p => (tSS[p]?.surplus ?? 0) >= 1));
      const sendables = myRP.filter(p => p.ranked && mySurp.has(p.ranked.pos) && theirNeed.has(p.ranked.pos));
      const getables = theirRP.filter(p => p.ranked && theirSurp.has(p.ranked.pos) && myNeed.has(p.ranked.pos));
      for (const s of sendables) for (const g of getables) {
        if (s.ranked.pos === g.ranked.pos) continue; // must fix DIFFERENT holes
        const sv = tierValue(s.ranked, lg), gv = tierValue(g.ranked, lg);
        const hi = Math.max(sv, gv, 1);
        const diff = Math.abs(sv - gv) / hi;
        if (diff > 0.18 || hi < 15) continue; // fair, and both pieces matter
        out.push({ them, send: s, get: g, sv, gv, diff,
          score: (1 - diff) * 2 + (myNeed.has(g.ranked.pos) ? 1 : 0) + (theirNeed.has(s.ranked.pos) ? 1 : 0) });
      }
    }
    out.sort((a, b) => b.score - a.score || a.diff - b.diff);
    const seen = new Set(), uniq = [];
    for (const o of out) { if (seen.has(o.them.roster_id)) continue; seen.add(o.them.roster_id); uniq.push(o); }
    return uniq.slice(0, 6);
  }
  function buildTradeFinder(lg) {
    const me = lg.rosters.find(r => r.is_me);
    const wrap = h('div', { style: { marginTop: '20px' } },
      h('h2', { class: 'section-title' }, 'Trade Finder'),
      h('p', { class: 'tip', style: { marginTop: '-6px', marginBottom: '10px' } },
        'Fair 1-for-1 swaps that fix a starting hole on BOTH rosters (within ~18% value). Click a deal to load it into the calculator.'));
    if (!me) { wrap.appendChild(h('div', { class: 'empty' }, 'No team in this league.')); return wrap; }
    const props = suggestTrades(lg, me);
    if (!props.length) {
      wrap.appendChild(h('div', { class: 'tip' }, 'No clean 1-for-1 right now: no positional surplus of yours matches a league-mate’s need at a fair value. Use the calculator for multi-player or pick-based deals.'));
      return wrap;
    }
    const grid = h('div', { style: { display: 'grid', gap: '8px' } });
    for (const p of props) {
      const fairPct = Math.round((1 - p.diff) * 100);
      grid.appendChild(h('div', { class: 'trade-find-row', title: 'Load into calculator',
        onclick: () => {
          TRADE_STATE.leagueId = lg.id;
          TRADE_STATE.sideA = { rosterId: me.roster_id, picks: new Set([String(p.send.pid)]) };
          TRADE_STATE.sideB = { rosterId: p.them.roster_id, picks: new Set([String(p.get.pid)]) };
          viewTrade(lg.id);
        } },
        h('div', { class: 'tf-partner' }, p.them.team_name),
        h('div', { class: 'tf-deal' },
          h('span', { class: 'tf-side' }, h('span', { class: 'tf-tag out' }, 'OUT'), posChip(p.send.sleeper.pos), h('span', { class: 'name' }, p.send.sleeper.name), h('span', { class: 'tnum tf-val' }, fmt.decimal(p.sv, 0))),
          h('span', { class: 'tf-arrow' }, '⇄'),
          h('span', { class: 'tf-side' }, h('span', { class: 'tf-tag in' }, 'IN'), posChip(p.get.sleeper.pos), h('span', { class: 'name' }, p.get.sleeper.name), h('span', { class: 'tnum tf-val' }, fmt.decimal(p.gv, 0))),
        ),
        h('div', { class: 'tf-fair', style: { color: fairPct >= 90 ? 'var(--green)' : 'var(--amber)' } }, `${fairPct}%`),
        h('div', { class: 'tf-why' }, `Fills your ${p.get.ranked.pos} hole from their surplus; you give out ${p.send.ranked.pos} depth. ${fairPct}% value-fair.`),
      ));
    }
    wrap.appendChild(grid);
    return wrap;
  }
  function viewTrade(leagueIdArg) {
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

    main.appendChild(breadcrumbs([
      { label:'Tools' },
      { label: lg.short_name || lg.name, hash:`#league/${lg.id}` },
      { label: 'Trade Lab' },
    ]));
    main.appendChild(h('div', { class:'page-header' },
      h('div', null,
        h('div', { class:'page-eyebrow' }, 'TRADE LAB'),
        h('h1', { class:'page-title' }, 'Trade Calculator'),
        h('p', { class:'page-sub' }, 'Click players or picks to add to the pile. Fairness verdict updates live as you build the offer.')
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
  // at the bottom of the Trade Lab. Offense only — ranking sources don't cover
  // IDP. Rows sorted by TE need (neediest first) to answer "who needs a TE?".
  function buildTeamNeeds(lg) {
    const idx = rankIndex();
    const targets = targetStartersByPos(lg);
    const POS = ['QB', 'RB', 'WR', 'TE'];
    const starterN = {};
    for (const p of POS) starterN[p] = Math.max(1, Math.round(targets[p] || 1));

    const teams = lg.rosters.map(r => {
      const byPos = { QB: [], RB: [], WR: [], TE: [] };
      for (const pid of (r.players || [])) {
        const sp = window.PLAYERS[pid]; if (!sp) continue;
        const ranked = idx.bySleeperId.get(pid) || idx.byName.get(norm(sp.name));
        if (!ranked) continue;
        const pos = ranked.pos || sp.pos;
        if (!byPos[pos]) continue;
        byPos[pos].push({ name: sp.name, pid, age: sp.age, value: tierValue(ranked, lg), posRank: ranked.ktcPosRank || ranked._posRank || null });
      }
      const posVal = {}, posTop = {};
      for (const p of POS) {
        byPos[p].sort((a, b) => b.value - a.value);
        posVal[p] = byPos[p].slice(0, starterN[p]).reduce((s, x) => s + x.value, 0);
        posTop[p] = byPos[p][0] || null;
      }
      return { r, posVal, posTop };
    });

    // Rank each position across teams (ascending value = neediest first).
    const n = teams.length;
    const label = {};
    for (const p of POS) {
      const order = teams.map((t, i) => ({ i, v: t.posVal[p] })).sort((a, b) => a.v - b.v);
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
    const teByBest = teams.map((t, i) => ({ i, best: t.posTop.TE })).sort((a, b) => (a.best?.value || 0) - (b.best?.value || 0));
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
    tableWrap.appendChild(h('table', { class: 'data' },
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

  // Value of a single asset (player or pick) on a trade side.
  KT.assetValue = function(k, lg) {
    if (isPickKey(k)) {
      const { season, round, originRosterId } = parsePickKey(k);
      return pickValue(season, round, originRosterId, lg);
    }
    const sleeper = window.PLAYERS[k]; if (!sleeper) return 0;
    const r = rankIndex().bySleeperId.get(k) || rankIndex().byName.get(norm(sleeper.name));
    return r ? tierValue(r, lg) : 0;
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
  // extra is 10-15% (ceiling below). Zero for a true 1-for-1 — no consolidation.
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
    const fairness = (Math.min(adjA, adjB) / Math.max(adjA, adjB, 1)) * 100;
    const delta = adjB - adjA;
    const verdict = fairness >= 90 ? { label:'FAIR', color:'var(--green)' }
                  : fairness >= 75 ? { label:'CLOSE', color:'var(--amber)' }
                  : { label: delta > 0 ? 'WIN FOR A' : 'WIN FOR B', color:'var(--red)' };
    return { ...verdict, pct: fairness, premium: prem.side ? prem : null };
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
    const v = KT.computeFairness(aVal, bVal, aSet.size, bSet.size, aHead, bHead);
    const m = refs.middle;
    m.aVal.textContent = fmt.decimal(aVal, 1);
    m.bVal.textContent = fmt.decimal(bVal, 1);
    m.verdict.textContent = v.label;
    m.verdict.style.color = v.color;
    m.fair.textContent = v.pct.toFixed(0) + '% fairness';
    if (m.premiumNote) {
      if (v.premium) {
        const nm = v.premium.side === 'A' ? 'Side A' : 'Side B';
        m.premiumNote.textContent = `+${(v.premium.pct * 100).toFixed(1)}% headliner premium to ${nm} — gave the better single asset, so a raw-even swap favors the receiver.`;
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

    // Starting-lineup projected points now → after (re-optimized, so a sent
    // starter is backfilled by the next-best — the true "what replaces this").
    const impA = tradeLineupImpact(lg, TRADE_STATE.sideA.rosterId, aSet, bSet);
    const impB = tradeLineupImpact(lg, TRADE_STATE.sideB.rosterId, bSet, aSet);
    const setImp = (el, imp) => {
      if (!imp) { el.textContent = '·'; el.style.color = 'var(--fg-3)'; return; }
      el.textContent = `${fmt.decimal(imp.now, 0)} → ${fmt.decimal(imp.after, 0)} (${imp.delta >= 0 ? '+' : ''}${fmt.decimal(imp.delta, 0)})`;
      el.style.color = Math.abs(imp.delta) < 1 ? 'var(--fg-2)' : imp.delta >= 0 ? 'var(--green)' : 'var(--red)';
    };
    setImp(m.lineupA, impA); setImp(m.lineupB, impB);

    // 3-year outlook. For each year horizon, net Δ for each side =
    // value of pieces RECEIVED (projected forward) − value SENT (projected
    // forward). Side A receives bSet, sends aSet (and vice versa).
    const aIsValid = aSet.size > 0 && bSet.size > 0;
    const cells = [
      [m.y0, 0], [m.y1, 1], [m.y2, 2], [m.y3, 3], [m.y4, 4], [m.y5, 5],
    ];
    for (const [yr, n] of cells) {
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
    const sel = h('select', { onchange: (e) => onChange(e.target.value) });
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
  // Picks stay out (includePicks = false) — that's what breaks the cycle
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
    const result = [];
    const traded = league.traded_picks || [];
    // A season's rookie picks stop being current assets once that draft
    // completes — they've already converted into rostered rookies. Drop any
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
    // project further out — e.g. the 5-year FV curve — pass a larger horizon so a
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
  // the same KT.toggle path the pools use, so a searched player who isn't on
  // either roster still lands in the pile as a what-if asset.
  // One button, not two: which side a player belongs on is never the user's
  // choice — it's determined by who owns him. On the send side's roster => Send.
  // Anyone else (another team or a free agent) => For.
  function buildTradeSearch(lg) {
    const idx = rankIndex();
    const input = h('input', {
      type:'search',
      class:'trade-search-input',
      placeholder:'Search any player by name — Send if he’s yours, For if he’s theirs…',
      autocomplete:'off',
      'aria-label':'Search any player to add to the trade',
    });
    const results = h('div', { class:'trade-search-results', role:'listbox', hidden:'' });
    const clear = () => { input.value = ''; results.innerHTML = ''; results.hidden = true; };
    const render = () => {
      const q = norm(input.value.trim());
      results.innerHTML = '';
      if (!q) { results.hidden = true; return; }
      const matches = idx.all.filter(p => p._sleeperId && norm(p.name).includes(q)).slice(0, 8);
      results.hidden = false;
      if (!matches.length) { results.appendChild(h('div', { class:'trade-search-empty' }, 'No players match.')); return; }
      for (const p of matches) {
        const sp = window.PLAYERS[p._sleeperId];
        const val = tierValue(p, lg);
        const key = String(p._sleeperId);
        const ownerRoster = lg.rosters.find(r => (r.players || []).includes(key));
        const mine = !!ownerRoster && ownerRoster.roster_id === TRADE_STATE.sideA.rosterId;
        const side = mine ? 'A' : 'B';
        const from = ownerRoster ? (ownerRoster.team_name || ownerRoster.owner_name) : 'free agent';
        results.appendChild(h('div', { class:'trade-search-row' },
          h('div', { class:'name-cell' },
            posChip(p.pos || sp?.pos),
            sp?.team ? teamChip(sp.team) : null,
            h('span', { class:'name' }, p.name),
            h('span', { class:'trade-search-owner tip' }, from),
            h('span', { class:'trade-search-val tnum' }, fmt.decimal(val, 1)),
          ),
          h('div', { class:'trade-search-actions' },
            h('button', {
              class:'trade-search-add' + (mine ? ' is-send' : ' is-for'),
              title: mine ? 'Add to You Send (left side)' : `Add to You Receive (right side) from ${from}`,
              onclick: () => { KT.toggle(side, key, 'add'); clear(); input.focus(); },
            }, mine ? '+ Send' : '+ For'),
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
    const rosterSel = h('select', { onchange: (e) => { state.rosterId = parseInt(e.target.value, 10); state.picks = new Set(); viewTrade(lg.id); } });
    for (const r of lg.rosters) {
      rosterSel.appendChild(h('option', { value:r.roster_id, selected: r.roster_id===state.rosterId?'':null }, `${r.team_name} (${r.owner_name})${r.is_me?' ★':''}`));
    }
    card.appendChild(h('div', { class:'trade-side-head' },
      h('div', { class:'tip' }, label === 'A' ? 'YOU SEND' : 'YOU RECEIVE'),
      rosterSel
    ));

    // Redraft picks do not exist as tradeable assets, so the pick pool is empty
    // there and the Picks card never renders.
    const ownedPicks = (roster && isDynastyLeague(lg)) ? rosterOwnedPicks(roster.roster_id, lg) : [];
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
        const ranked = sleeper ? (rankIndex().bySleeperId.get(k) || rankIndex().byName.get(norm(sleeper.name))) : null;
        nameNode = h('div', { class:'name-cell' },
          sleeper ? posChip(sleeper.pos) : null,
          sleeper ? teamChip(sleeper.team) : null,
          h('span', { class:'name' }, sleeper ? sleeper.name : `[${k}]`),
          (() => { const vc = vorChip(k, lg, 'blend'); return vc ? h('span', { class:'pile-vor', title:'VOR: projected points over a replacement starter at this position — the starting-lineup value you gain/lose' }, 'VOR ', vc) : null; })(),
        );
        val = ranked ? tierValue(ranked, lg) : 0;
      }
      const row = h('div', {
        class:'trade-pile-row',
        draggable: 'true',
        dataset: { tradeKey: k, tradeSide: label, tradeOrigin: 'pile' },
        title: 'Drag back to roster, or click to remove.',
        onclick: () => KT.toggle(label, k, 'remove'),
      },
        nameNode,
        h('span', { class:'tnum' }, fmt.decimal(val, 1)),
        h('span', { class:'trade-pile-x' }, '×'),
      );
      attachDrag(row);
      return row;
    };

    const totalSpan = h('span', { class:'tnum trade-pile-total' }, '0.0');
    const pileEmpty = h('div', { class:'tip trade-pile-empty' }, 'Drag players or picks here, or click below to add.');
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
      const arr = (roster.players || []).map(pid => {
        const sleeper = window.PLAYERS[pid];
        const ranked = sleeper ? (rankIndex().bySleeperId.get(pid) || rankIndex().byName.get(norm(sleeper.name))) : null;
        return { pid, sleeper, ranked, value: ranked ? tierValue(ranked, lg) : 0 };
      }).sort((a,b) => b.value - a.value);
      pool = h('div', { class:'trade-pool' },
        h('div', { class:'card-title' }, `${roster.team_name} Roster`),
      );
      for (const p of arr) {
        const row = h('div', {
          class:'trade-pool-row',
          draggable: 'true',
          dataset: { tradeKey: p.pid, tradeSide: label, tradeOrigin: 'pool' },
          title: 'Drag to pile, or click to add.',
          onclick: () => KT.toggle(label, p.pid),
        },
          h('div', { class:'name-cell' },
            p.sleeper ? posChip(p.sleeper.pos) : null,
            p.sleeper ? teamChip(p.sleeper.team) : null,
            h('span', { class:'name' }, p.sleeper ? p.sleeper.name : `[${p.pid}]`),
            p.ranked ? tierChip(p.ranked.tier, p.ranked.category) : null
          ),
          p.value ? h('span', { class:'tnum' }, fmt.decimal(p.value,1)) : h('span', { class:'muted' }, '.')
        );
        attachDrag(row);
        pool.appendChild(row);
      }
      // Pool is also a drop target — drop a pile row here to remove.
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

  // Middle summary builds DOM once and exposes setter refs.
  function tradeMiddleSummary(lg) {
    const aVal = h('span', { class:'tnum' }, '0.0');
    const bVal = h('span', { class:'tnum' }, '0.0');
    const verdict = h('div', { class:'verdict' }, 'INCOMPLETE');
    const fair = h('div', { class:'tip' }, '0% fairness');
    const premiumNote = h('div', { class:'tip', style:{ display:'none', marginTop:'4px', color:'var(--fg-2)', fontStyle:'italic', lineHeight:'1.3' } }, '');
    const deltaA = h('span', { class:'tnum' }, '0.0');
    const deltaB = h('span', { class:'tnum' }, '0.0');
    const lineupA = h('span', { class:'tnum', style:{ fontSize:'0.82rem' } }, '·');
    const lineupB = h('span', { class:'tnum', style:{ fontSize:'0.82rem' } }, '·');

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
    const y0 = makeYearRow('Today');
    const y1 = makeYearRow('+1 yr');
    const y2 = makeYearRow('+2 yr');
    const y3 = makeYearRow('+3 yr');
    const y4 = makeYearRow('+4 yr');
    const y5 = makeYearRow('+5 yr');

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
          h('div', { style:{ display:'flex', justifyContent:'space-between' } }, deltaA, deltaB)
        ),
        h('div', { style:{ marginTop:'14px' } },
          h('div', { class:'tip', style:{ marginBottom:'4px' }, title:'Your best starting lineup’s projected season points, now vs after the trade. The lineup is re-optimized, so a starter you send is automatically replaced by your next-best at that position — the change is the real lineup impact of what you’re giving up vs getting.' }, 'Starting Lineup (proj pts) · now → after'),
          h('div', { style:{ display:'flex', justifyContent:'space-between' } }, lineupA, lineupB)
        ),
        h('div', { class:'t3y' },
          h('div', { class:'tip', style:{ marginBottom:'4px' } }, 'Year-by-Year Team Strength Δ'),
          h('div', { class:'t3y-head' },
            h('span', { class:'t3y-label' }, ''),
            h('span', { class:'t3y-cell tip' }, 'Side A'),
            h('span', { class:'t3y-sep' }, ''),
            h('span', { class:'t3y-cell tip' }, 'Side B'),
          ),
          y0.row, y1.row, y2.row, y3.row, y4.row, y5.row,
          h('div', { class:'tip t3y-note' }, 'On-field strength change in each season. Players age via position curve; picks count 0 until their draft year, then convert as age-22 WR and age forward.')
        ),
        h('div', { style:{ marginTop:'14px' } },
          h('button', { class:'ghost', style:{ width:'100%' }, onclick: () => {
            TRADE_STATE.sideA.picks = new Set(); TRADE_STATE.sideB.picks = new Set();
            KT.syncSide('A'); KT.syncSide('B'); KT.refreshMiddle(lg);
          }}, 'Reset Trade')
        )
      ),
    );
    return { node, aVal, bVal, verdict, fair, premiumNote, deltaA, deltaB, lineupA, lineupB, y0, y1, y2, y3, y4, y5 };
  }
  // ============================================================
  // Dynasty aging model — used by trade-calc 3-year outlook
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
  // you win the 2026 season — it has no on-field contribution until it converts
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

  // Project a roster's on-field team strength at horizon N.
  // Same model as the trade-pile projection: current players age forward by
  // position curve; picks contribute 0 until their draft year, then convert
  // to age-22 WR rookies that age forward through the remaining horizon.
  // Starting-lineup strength (best-K) for an explicit player-id list + owned-pick
  // list, projected yearsOut. This is the SAME basis as startingStrength / PV-FV,
  // so trade projections read on the same ~0-700 scale as the standings — not the
  // old full-roster sum (~1500). Picks fold in only for future years (converted to
  // aged rookies), matching PV (year 0 = players only) / FV.
  function lineupStrengthFrom(playerIds, picks, lg, yearsOut) {
    const idx = rankIndex();
    const vals = [];
    for (const pid of playerIds) {
      const sp = window.PLAYERS[pid]; if (!sp) continue;
      const r = idx.bySleeperId.get(pid) || idx.byName.get(norm(sp.name));
      if (!r) continue;
      let v = tierValue(r, lg);
      if (yearsOut) v *= ageRetention(sp.age, r.pos || sp.pos, yearsOut);
      vals.push(v);
    }
    if (yearsOut && picks) {
      const projSeason = CURRENT_SEASON + yearsOut;
      for (const p of picks) {
        const ps = parseInt(p.season, 10);
        if (ps <= projSeason) vals.push((p.value || 0) * ageRetention(22, 'WR', Math.max(0, projSeason - ps)));
      }
    }
    vals.sort((a, b) => b - a);
    return Math.round(vals.slice(0, offenseStarterCount(lg)).reduce((a, b) => a + b, 0) * 10) / 10;
  }
  function projectedRosterStrength(roster, lg, yearsOut) {
    if (!roster) return 0;
    return lineupStrengthFrom(roster.players || [], rosterOwnedPicks(roster.roster_id, lg, Math.max(2, yearsOut + 1)), lg, yearsOut);
  }

  // Same as projectedRosterStrength but with a trade swap applied: remove
  // sendKeys (players + picks the side is sending), add receiveKeys (players +
  // picks coming in). Used to compute each side's post-trade strength + rank
  // at each year of the outlook.
  function projectedTradeStrength(lg, rosterId, sendKeys, receiveKeys, yearsOut) {
    const roster = lg.rosters.find(r => r.roster_id === rosterId);
    if (!roster) return 0;
    const sendPlayers = new Set(), sendPicks = new Set(), recvPlayers = new Set(), recvPicks = new Set();
    for (const k of sendKeys) (isPickKey(k) ? sendPicks : sendPlayers).add(String(k));
    for (const k of receiveKeys) (isPickKey(k) ? recvPicks : recvPlayers).add(String(k));
    const players = new Set((roster.players || []).map(String));
    for (const id of sendPlayers) players.delete(id);
    for (const id of recvPlayers) players.add(id);
    // Post-trade owned picks (send removed, receive added).
    const byKey = new Map(rosterOwnedPicks(rosterId, lg, Math.max(2, yearsOut + 1)).map(p => [pickKey(p.season, p.round, p.originRosterId), p]));
    for (const k of sendPicks) byKey.delete(k);
    for (const k of recvPicks) if (!byKey.has(k)) { const { season, round, originRosterId } = parsePickKey(k); byKey.set(k, { season, round, originRosterId, value: pickValue(season, round, originRosterId, lg) }); }
    return lineupStrengthFrom(players, [...byKey.values()], lg, yearsOut);
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
    // player swap; pick impact shows in the year-by-year outlook below.
    const before = lineupStrengthFrom(roster.players || [], null, lg, 0);
    const players = new Set((roster.players || []).map(String));
    for (const id of removeIds) players.delete(String(id));
    for (const id of addIds) players.add(String(id));
    const after = lineupStrengthFrom(players, null, lg, 0);
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
  function weeklyProjFor(pid, week) {
    if (!weeklyProjFor._map) {
      const rows = (window.WEEKLY_RANKINGS || {}).players || [];
      weeklyProjFor._map = new Map(rows.map(r => [String(r.id), r]));
    }
    const row = weeklyProjFor._map.get(String(pid));
    if (!row) return { pts: 0, source: null };
    if (row.vegas != null) return { pts: Number(row.vegas) || 0, source: 'vegas' };
    const model = (row.sleeper || [])[(week || 1) - 1];
    if (model != null) return { pts: Number(model) || 0, source: 'sleeper' };
    return { pts: 0, source: null };
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
      const value = scaleBy === 'gross' ? row.gross : row.index;
      const tone = row.index > 0 ? 'up' : (row.index < 0 ? 'down' : '');
      return h('div', { class:'watch-row' },
        h('span', { class:'watch-rank tnum' }, String(rank)),
        h('span', { class:'watch-name' },
          h('span', { class:'watch-player' }, name),
          h('span', { class:'watch-meta' }, meta || ' '),
        ),
        h('span', { class:'watch-chips' },
          ...row.entries
            .slice()
            .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
            .map(e => h('span', {
              class: `watch-chip ${e.side > 0 ? 'for' : 'against'}`,
              style: { '--lg': e.color },
              title: `${e.league}: ${e.side > 0 ? 'starting for you' : 'starting against you'}, $${e.buyIn} buy-in, ${fmt.decimal(e.proj, 1)} projected`,
            }, `${e.side > 0 ? '▲' : '▼'} ${e.league} $${e.buyIn}`))
        ),
        h('span', { class:'watch-proj tnum', title:'Best weekly projection, Vegas where a market exists' }, fmt.decimal(row.proj, 1)),
        h('span', { class:`watch-index tnum ${tone}` }, (row.index > 0 ? '+' : '') + fmt.decimal(row.index, 1)),
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
        ? h('div', { class:'watch-rows' }, ...rows.map((r, i) => playerRow(r, i + 1, scaleBy)))
        : h('div', { class:'tip', style:{ padding:'8px 2px' } }, emptyMsg),
    );

    main.appendChild(h('div', { class:'watch-panels' },
      panel('Rooting for', 'Yours everywhere he appears. The top row is the single biggest reason to care about a game today.',
        board.rooting, 'index', 'Nobody.'),
      panel('Good and bad', 'On your team in one league, across from you in another. The net is what his day is actually worth, so a number near zero means you genuinely do not care.',
        board.split, 'gross', 'No overlap this week.'),
      panel('Hate watching', 'Starting against you and nowhere on your side. A big day here costs you real money.',
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

  function viewActionCenter() {
    const main = $('#main');
    main.innerHTML = '';
    main.appendChild(h('div', { class:'page-header' },
      h('div', null,
        h('div', { class:'page-eyebrow' }, 'DYNASTY'),
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

    // Build suggestion queue (computed; you promote what you want into to-dos).
    const actions = [];
    const myLeagues = (window.LEAGUES || []).filter(lg => lg.rosters.some(r => r.is_me));

    for (const lg of myLeagues) {
      const me = lg.rosters.find(r => r.is_me);
      if (!me) continue;
      const rp = getRosterPlayers(me);
      const surplus = rosterSurplusShortage(rp, lg);
      const strength = computeRosterStrength(me, lg);
      const myRank = rankInLeague(lg, me.roster_id);
      const cs = strength.rankedPlayers.filter(p => p.ranked.category === 'cornerstone').length;
      const valueTier = classifyValueTier(strength, myRank, lg.total_rosters, cs);
      const archetype = classifyValueArchetype(rp);
      const stance = stanceOf(valueTier.tier, archetype.tag);
      const buysSells = suggestBuysSells(rp, lg);
      const partners = idealTradePartners(me, lg);
      const curves = window.STRATEGY?.age_curve || {};

      // 1) HARD SELLS, highest urgency
      for (const sell of buysSells.sells) {
        if (sell.intensity === 'HARD SELL') {
          actions.push({
            urgency: 1,
            title: `HARD SELL ${sell.player.name}`,
            league: lg.short_name,
            leagueId: lg.id,
            rosterId: me.roster_id,
            body: sell.reason,
            cta: { label: 'Open Trade Calculator', href: `#trade/${lg.id}` },
            color: 'var(--red)',
          });
        }
      }
      // 2) Standard sells from age curves (sell window opens)
      for (const sell of buysSells.sells) {
        if (sell.intensity === 'SELL') {
          actions.push({
            urgency: 2,
            title: `Sell ${sell.player.name} this window`,
            league: lg.short_name,
            leagueId: lg.id,
            rosterId: me.roster_id,
            body: sell.reason,
            cta: { label: 'Open Trade Calculator', href: `#trade/${lg.id}` },
            color: 'var(--amber)',
          });
        }
      }
      // 3) Top trade partner with positive fit + stance asymmetry
      const bestPartner = partners[0];
      if (bestPartner && bestPartner.fit >= 5) {
        actions.push({
          urgency: 3,
          title: `Talk to ${bestPartner.roster.team_name} (${lg.short_name})`,
          league: lg.short_name,
          leagueId: lg.id,
          rosterId: me.roster_id,
          body: `Best mutual-fit partner. ${bestPartner.notes.slice(0,2).join('. ') || 'Stance asymmetry favors a trade.'}`,
          cta: { label: 'View Their Roster', href: `#roster/${lg.id}/${bestPartner.roster.roster_id}` },
          color: 'var(--accent-hot)',
        });
      }
      // 4) Positional shortages worth targeting
      for (const pos of ['QB','RB','WR','TE']) {
        if (surplus[pos].surplus <= -2) {
          actions.push({
            urgency: 4,
            title: `Acquire a ${pos} (${lg.short_name})`,
            league: lg.short_name,
            leagueId: lg.id,
            rosterId: me.roster_id,
            body: `${surplus[pos].startables} of ${surplus[pos].need} startable. Two-position shortage; do not enter the season this thin.`,
            cta: { label: 'See Positional Targets', href: `#league/${lg.id}/players` },
            color: 'var(--blue)',
          });
        }
      }
      // 5) Stance-driven prompts
      if (stance === 'contend' && actions.filter(a => a.leagueId === lg.id).length === 0) {
        actions.push({
          urgency: 5,
          title: `${lg.short_name}: Contention window open`,
          league: lg.short_name,
          leagueId: lg.id,
          rosterId: me.roster_id,
          body: 'No glaring sells, no clear partner needs. Use the calculator to consolidate two starters into one elite if a partner is open.',
          cta: { label: 'Open Roster Blueprint', href: `#roster/${lg.id}/${me.roster_id}` },
          color: 'var(--green)',
        });
      }
      if (stance === 'rebuild') {
        actions.push({
          urgency: 4,
          title: `${lg.short_name}: Stack ${parseInt(new Date().getFullYear()) + 1} 1sts`,
          league: lg.short_name,
          leagueId: lg.id,
          rosterId: me.roster_id,
          body: 'Rebuild posture. Pick value peaks just before next rookie draft; stack early-1sts before that window opens.',
          cta: { label: 'Open Roster Blueprint', href: `#roster/${lg.id}/${me.roster_id}` },
          color: 'var(--blue)',
        });
      }

      // 6) Waiver / FA targets: best available players NOT rostered by anyone in
      // this league, ranked by VOR (who helps the lineup NOW), need positions
      // first. VOR beats raw dynasty value here — the decision is "who starts,"
      // not "who to stash."
      {
        const rostered = new Set(lg.rosters.flatMap(r => r.players || []).map(String));
        const needPos = new Set(['QB','RB','WR','TE'].filter(p => (surplus[p]?.surplus ?? 0) <= -1));
        const avail = rankIndex().all
          .map(p => { const sp = p._sleeperId && window.PLAYERS[p._sleeperId]; return sp ? { sp, val: tierValue(p, lg), vor: vorByPid(sp.id, lg, 'blend') } : null; })
          .filter(x => x && !rostered.has(String(x.sp.id)) && ['QB','RB','WR','TE'].includes(x.sp.pos))
          .map(x => ({ name: x.sp.name, pos: x.sp.pos, team: x.sp.team, val: x.val, vor: x.vor, need: needPos.has(x.sp.pos) }))
          .sort((a, b) => (Number(b.need) - Number(a.need)) || ((b.vor ?? -9999) - (a.vor ?? -9999)) || (b.val - a.val))
          .slice(0, 5);
        if (avail.length) {
          actions.push({
            urgency: needPos.size ? 3 : 6,
            title: `Waiver targets · ${lg.short_name}`,
            league: lg.short_name, leagueId: lg.id, rosterId: me.roster_id,
            body: avail.map(f => `${f.name} (${f.pos}${f.team && f.team !== 'FA' ? ' ' + f.team : ''}${f.vor != null ? `, VOR ${f.vor > 0 ? '+' : ''}${Math.round(f.vor)}` : ''}${f.need ? ', fills need' : ''})`).join(' · '),
            cta: { label: 'All Players', href: `#league/${lg.id}/players` },
            color: needPos.size ? 'var(--green)' : 'var(--fg-3)',
          });
        }
      }
    }

    actions.sort((a, b) => a.urgency - b.urgency);

    main.appendChild(h('h2', { class:'section-title', style:{ marginTop:'20px' } }, 'Suggestions'));
    if (!actions.length) {
      main.appendChild(h('div', { class:'tip' }, 'No computed suggestions right now — rosters look stable. Add your own to-dos above.'));
      return;
    }
    main.appendChild(h('div', { class:'tip', style:{ marginTop:'-4px', marginBottom:'10px' } },
      'Auto-generated from your rosters. Hit + to add any to your to-do list.'));
    main.appendChild(h('div', { style:{ display:'grid', gap:'10px' } },
      ...actions.map(a => h('div', { class:'card', style:{ borderColor:`color-mix(in oklab, ${a.color} 42%, var(--border))`, padding:'14px 18px' } },
        h('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:'8px' } },
          h('div', { class:'name', style:{ fontSize:'1rem', fontWeight:600, color:'var(--fg-0)' } }, a.title),
          h('div', { style:{ display:'flex', alignItems:'center', gap:'8px', flexShrink:0 } },
            h('span', { class:'tip' }, a.league),
            h('button', { class:'ghost todo-add-btn', title:'Add to my to-dos', onclick:(e) => { addTodo(`${a.title} — ${a.body}`); e.target.textContent = '✓ Added'; e.target.disabled = true; } }, '+ Add'),
          ),
        ),
        h('div', { style:{ marginTop:'4px', color:'var(--fg-1)' } }, a.body),
        h('div', { style:{ marginTop:'10px', display:'flex', gap:'8px' } },
          h('a', { href: a.cta.href }, h('button', { class:'ghost' }, a.cta.label, ' →')),
        ),
      ))
    ));
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
      h('table', { class:'data' },
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
      h('table', { class:'data' },
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
      h('p', null, 'Each player’s value is KTC’s market number (normalized ~0–110). Team rank uses ',
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
      fr ? h('div', { style:{ overflowX:'auto' } }, h('table', { class:'data' },
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
    return h('span', { class:'spark', html: svg, title:`${spark[0].y}–${last.y} FP/G trend` });
  }
  function historyBlock(sleeper) {
    if (!sleeper || !window.HISTORY) return null;
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
      h('div', { class:'hist-spark' }, sparkline(hist.spark)),
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
    const table = h('table', { class:'data hist-table' }, head, body);

    return h('section', { class:'hist-block' },
      h('div', { class:'hist-head' },
        h('div', { class:'card-title' }, 'Historical'),
        h('span', { class:'tip' }, `${hist.first}–${hist.last}`),
      ),
      kpis,
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
  function contextBlock(sleeper) {
    if (!sleeper || !window.CONTEXT) return null;
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
      const linePC = h('div', { class:'coach-line' },
        h('span', { class:'coach-role' }, 'PC'),
        h('span', { class:'coach-name' }, c.play_caller || '·'),
        h('span', { class:'tip' },
          c.scheme ? `${c.scheme}` : '',
          c.pc_tenure_yr > 1 ? ` · yr ${c.pc_tenure_yr}` : ''),
      );
      const prevLine = prev && prev.play_caller && prev.play_caller !== c.play_caller
        ? h('div', { class:'coach-prev tip' }, `prev: ${prev.play_caller} (${prev.scheme || ''})`)
        : null;

      blocks.push(h('div', { class:'ctx-row' },
        h('div', { class:'ctx-col' },
          h('div', { class:'card-title' }, `${teamAbbr} ${window.CONTEXT.current_season} Staff`),
          lineHC, lineOC, linePC, prevLine,
        ),
        flags.length ? h('div', { class:'ctx-flags' }, ...flags) : null,
      ));
    }

    // -- Team turnover --
    if (teamCtx && teamCtx.turnover) {
      const t = teamCtx.turnover;
      const turnoverEl = h('div', { class:'ctx-block' },
        h('div', { class:'card-title' }, `${teamAbbr} ${t.season} Turnover`),
        h('div', { class:'kpi-row' },
          h('div', { class:'mini-kpi' },
            h('div', { class:'mini-kpi-num tnum' }, fmtPct(t.vacated_tgt)),
            h('div', { class:'mini-kpi-label' }, 'Vacated TGT'),
          ),
          h('div', { class:'mini-kpi' },
            h('div', { class:'mini-kpi-num tnum' }, fmtPct(t.vacated_rush)),
            h('div', { class:'mini-kpi-label' }, 'Vacated RUSH'),
          ),
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
            h('span', { class:'turn-share tnum' }, fmtPct(l.tgt + l.rush)),
          )),
        ) : null,
        t.top_joiners && t.top_joiners.length ? h('div', { class:'turn-list' },
          h('div', { class:'turn-list-label' }, 'Joiners'),
          ...t.top_joiners.slice(0, 3).map(j => h('div', { class:'turn-item' },
            h('span', { class:'turn-name' }, j.name),
            h('span', { class:'turn-pos tip' }, j.pos, j.rookie ? ' · R' : ''),
            h('span', { class:'turn-share tnum' }, fmtPct(j.tgt + j.rush)),
          )),
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
      // Stayed put — show APY if known
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
        h('table', { class:'data eff-table' },
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
        h('h2', { id:titleId, style:{ marginTop:0, marginBottom:'4px' } }, name),
        h('div', { class:'row gap-4 wrap', style:{ marginBottom:'12px' } },
          ranked ? posChip(ranked.pos) : sleeper ? posChip(sleeper.pos) : null,
          ranked ? teamChip(ranked.team) : sleeper ? teamChip(sleeper.team) : null,
          (() => { const a = ageOf(sleeper?.id, ranked?.age ?? sleeper?.age); return a != null ? h('span', { class:'muted' }, `age ${fmt.decimal(a, 1)}`) : null; })(),
          rookieBadge(ranked || {}),
          uncertainBadge(ranked || {}),
          depBadge(ranked || {}),
          ...expertBadges,
        ),
        ranked ? h('div', { class:'row gap-4', style:{ marginBottom:'12px', alignItems:'baseline' } },
          (ourCatChip(sleeper?.id) || pillCategory(ranked.category)), (ourTierChip(sleeper?.id) || tierChip(ranked.tier, ranked.category)),
          (() => { const mp = mispricingIndex().get(String(sleeper?.id || ranked._sleeperId));
            const val = tierValue(ranked, primaryLeague() || {});
            return h('span', { class:'price-line',
              title: `Dynasty value on the site's 0–110 scale (KTC market ${ranked.ktcValue != null ? ranked.ktcValue : Math.round(val * 100)} ÷ 100). Same scale as every Value column, PV/FV, and the trade calculator.` },
              h('strong', { class:'tnum' }, `Value ${fmt.decimal(val, 0)}`),
              mp ? h('span', { class:'tip', style:{ marginLeft:'6px' } }, `· ${ranked.pos}${mp.valRank} value · ${ranked.pos}${mp.projRank} proj` ) : null,
            ); })(),
        ) : null,
        // Buy/sell/hold verdict — the synthesized "so what" for this player.
        (() => { const v = playerVerdict(ranked, sleeper); if (!v) return null;
          const c = v.tone === 'buy' ? 'var(--green)' : v.tone === 'sell' ? 'var(--red)' : 'var(--fg-2)';
          return h('div', { class:'verdict-banner', style:{ borderColor:`color-mix(in oklab, ${c} 45%, var(--border))` } },
            h('span', { class:'verdict-label', style:{ color:c } }, v.label),
            h('span', { class:'verdict-why' }, v.why),
          ); })(),
        ranked?.note ? h('div', { class:'card', style:{ background:'var(--bg-2)', marginBottom:'12px' } },
          h('div', { class:'card-title' }, 'Source notes'),
          h('div', null, ranked.note),
          h('div', { class:'tip', style:{ marginTop:'6px' } }, `from ${ranked._src} / ${ranked._ranking}`)
        ) : null,
        playerInfoBlock(name, sleeper),
        projectionBlock(sleeper, close),
        sleeper ? h('div', { class:'tip', style:{ marginBottom:'12px' } },
          [sleeper.college, (sleeper.exp != null ? `${sleeper.exp} yr exp` : null), `Sleeper #${sleeper.id}`].filter(Boolean).join('  ·  ')
        ) : h('div', { class:'tip', style:{ marginBottom:'12px' } }, 'Not matched to a Sleeper player.'),
        envInfoLine(sleeper),
        scheduleStrip(sleeper),
        historyBlock(sleeper),
        contextBlock(sleeper),
        ownerRows.length ? h('div', null,
          h('div', { class:'card-title', style:{ marginBottom:'6px' } }, 'Owned in your leagues'),
          h('table', { class:'data' },
            h('thead', null, h('tr', null,
              h('th', null, 'League'), h('th', null, 'Team'), h('th', null, 'Owner'), h('th', null, 'Slot'), h('th', null, 'Trade')
            )),
            h('tbody', null, ...ownerRows.map(o => h('tr', { class: o.roster.is_me ? 'you' : '', onclick:()=>{ close(); navigate(`#roster/${o.league.id}/${o.roster.roster_id}`); } },
              h('td', null, o.league.short_name),
              h('td', null, o.roster.team_name, o.roster.is_me ? h('span', { class:'badge you', style:{ marginLeft:'6px' } }, 'YOU') : null),
              h('td', null, o.roster.owner_name),
              h('td', null, o.isStarter ? h('span', { class:'badge' }, 'STARTER') : o.isTaxi ? h('span', { class:'badge' }, 'TAXI') : o.isReserve ? h('span', { class:'badge' }, 'IR') : h('span', { class:'badge' }, 'BENCH')),
              h('td', null, sleeper?.id ? h('button', {
                class:'ghost', style:{ padding:'2px 10px', fontSize:'12px' },
                title: o.roster.is_me ? 'Add to YOU SEND in the Trade Lab' : 'Add to YOU RECEIVE in the Trade Lab',
                onclick:(e) => { e.stopPropagation(); close(); openTradeFor(sleeper.id, o.league.id, o.roster.roster_id); },
              }, 'Trade ⇄') : null),
            )))
          )
        ) : null
      )
    );
    document.addEventListener('keydown', onKeydown);
    requestAnimationFrame(() => { modal.querySelector('.close-btn')?.focus(); wrapDataTables(); });
    return backdrop;
  }

  // Season fantasy projection for the modal: pts from every source + the
  // projected stat line. Reuses window.OFFENSE_PROJ (offense + defense).
  function projectionBlock(sleeper, close) {
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
        h('div', { class: 'card-title' }, `Season projection · ${unit === 'defense' ? 'IDP' : 'Offense'}`),
        h('a', { href: '#projections', onclick: () => { if (close) close(); }, class: 'tip', style: { textDecoration: 'none' } }, 'view all →')),
      h('div', { class: 'row gap-4 wrap', style: { margin: '6px 0' } },
        ...(cfg.sources || []).map(s => h('span', {
          class: 'badge' + (s === cfg.default ? ' you' : ''),
          title: s === cfg.default ? 'default source' : '',
        }, `${PROJ_SRC_LABEL[s] || s} ${rec[s] == null ? '·' : fmt.decimal(rec[s], 1)}`)),
        (() => { const e = ppEdge(rec); if (e == null) return null;
          const c = e >= 4 ? 'var(--green)' : e <= -4 ? 'var(--red)' : 'var(--fg-2)';
          return h('span', { class: 'badge', style: { color: c, borderColor: 'currentColor', background: 'transparent' }, title: 'PrizePicks vs Sleeper positional rank difference. + = the Vegas market ranks him higher than the public model → undervalued.' }, `PP−Slp ${e > 0 ? '+' : ''}${e}`); })()),
      (() => {
        const lg = primaryLeague(); if (!lg) return null;
        const src = cfg.default, g = projPosGroup(rec.pos);
        const v = vorForPlayer(rec, lg, unit, src);
        const peers = (cfg.players || []).filter(p => projPosGroup(p.pos) === g && p[src] != null).sort((a, b) => b[src] - a[src]);
        const rank = peers.findIndex(p => p.id === rec.id) + 1;
        if (v == null && !rank) return null;
        const color = v == null ? 'var(--fg-3)' : v >= 30 ? 'var(--green)' : v >= 0 ? 'var(--fg-1)' : 'var(--red)';
        return h('div', { class: 'row gap-4', style: { margin: '6px 0 2px', alignItems: 'baseline' } },
          rank ? h('span', { class: 'badge', title: `${g} rank by projected points` }, `${g}${rank}`) : null,
          v != null ? h('span', { style: { color, fontWeight: 700 }, title: `Value over replacement: projected points above the last startable ${g} in ${lg.short_name || lg.name}` }, `VOR ${v > 0 ? '+' : ''}${fmt.decimal(v, 0)}`) : null,
          h('span', { class: 'tip' }, `vs a replacement starter · ${lg.short_name || lg.name}`),
        );
      })(),
      statStr ? h('div', { class: 'tip' }, `Blended line: ${statStr}`) : null,
      unit === 'defense' ? h('div', { class: 'tip', style: { marginTop: '4px', opacity: .8 } }, 'PD/QB-hit best-estimated; no Vegas market for IDP.') : null,
    );
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
  // Projections — fantasy points from free sources, source-selectable.
  // Offense: PrizePicks / Sleeper / Blended. Defense (IDP): Clay / Sleeper /
  // Blended (no PP — Vegas has no tackle market). Data: window.OFFENSE_PROJ =
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
    return h('span', { class: 'badge', title: `Fantasy environment #${e.env_rank}/${e.total} (${e.tier}) — ${e.implied_pf} implied pts/game (offense #${e.pf_rank})`, style: { color: ENV_TIER_COLOR[e.tier], borderColor: 'currentColor', background: 'transparent' } }, String(e.env_rank));
  }
  // Our own data-clustered dynasty category (window.PLAYER_CATEGORIES) — replaces
  // the off-base third-party category field.
  const OURCAT_COLOR = {
    'Cornerstone': 'var(--green)', 'Win-Now Star': 'var(--green)',
    'Ascending': 'var(--blue)', 'Win-Now Starter': 'var(--blue)', 'Young Upside': '#5eead4',
    'Aging Elite': 'var(--amber)', 'Veteran Starter': 'var(--amber)',
    'Rotational': 'var(--fg-2)', 'Aging Depth': 'var(--fg-3)',
  };
  function ourCat(pid) { return (window.PLAYER_CATEGORIES && window.PLAYER_CATEGORIES.players) ? window.PLAYER_CATEGORIES.players[pid] : null; }
  // Our own value tier (S..F), built from scratch by 1-D value k-means.
  const OURTIER_COLOR = { S: 'var(--green)', A: '#5eead4', B: 'var(--blue)', C: 'var(--amber)', D: 'var(--fg-2)', F: 'var(--fg-3)' };
  function ourTierChip(pid) {
    const c = pid && ourCat(pid); if (!c || !c.tier) return null;
    return h('span', { class: 'badge', title: `Tier ${c.tier} — our dynasty value tier (value ${Math.round((c.value || 0) / 100)})`,
      style: { color: OURTIER_COLOR[c.tier] || 'var(--fg-2)', borderColor: 'currentColor', background: 'transparent', fontWeight: 700 } }, c.tier);
  }
  function ourCatChip(pid) {
    const c = pid && ourCat(pid); if (!c) return null;
    return h('span', { class: 'badge', title: `${c.category} — ${c.why} (dynasty value ${Math.round((c.value || 0) / 100)}, age ${c.age}, proj ${c.proj})`,
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
    return r <= 8 ? 'var(--red)' : r <= 16 ? 'var(--amber)' : r <= 24 ? '#5eead4' : 'var(--green)';
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
        `Opponent colored by defense faced — green = weak D (smash), red = elite D (tough). Implied pts: actual Vegas thru wk ${window.TEAM_SOS.lines_through_week}, projected after.`),
      h('div', { style: { maxHeight: '260px', overflowY: 'auto' } },
        h('table', { class: 'data', style: { fontSize: '12px' } },
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
  // Championship odds — Monte Carlo season + playoff bracket
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
    cv: { QB: 0.34, RB: 0.55, WR: 0.62, TE: 0.60, DEF: 0.5 },
    // Expected games missed per 17-game season for a prime-age player, by
    // position. RBs take the most contact; QBs are protected.
    missedGames: { QB: 1.5, RB: 3.0, WR: 2.3, TE: 2.6 },
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
  // central limit does the work) — it's only used at the team level.
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
  function simPool(roster, lg, src, extraIds, yearsOut = 0, rookies = null) {
    const map = projMap('offense');
    const ids = new Set([...startableIds(roster, { includeStashed: yearsOut > 0 }), ...(extraIds || []).map(String)]);
    const pool = [];
    for (const pid of ids) {
      const p = map.get(pid); if (!p) continue;
      if (!SLOT_TAKES.SUPER_FLEX.includes(p.pos)) continue;
      const season0 = projPoints(p, lg, src); if (season0 == null) continue;
      const sp = window.PLAYERS?.[pid] || {};
      const season = season0 * productionRetention(p.pos, sp.age, yearsOut);
      if (season <= 0) continue;   // aged out of the league entirely
      const mean = season / SIM.gamesPlayed;
      const st = sp.injury_status;
      // Every field the simulator will ever touch is declared here, including the
      // per-season scratch (mult/bye/outUntil/v). Adding them later would retag
      // the object's shape on the first hot iteration and cost more than the
      // simulation itself.
      pool.push({
        pid, name: p.name, pos: p.pos, mean, nflTeam: p.team || '',
        sd: mean * (SIM.cv[p.pos] != null ? SIM.cv[p.pos] : 0.55),
        hazard: injuryHazard(p.pos, (sp.age || 25) + yearsOut),
        // A live designation is this season's news; it says nothing about 2028.
        startOut: yearsOut ? 0 : (SIM.designationWeeksOut[st] || 0),
        questionable: yearsOut ? false : st === 'Questionable',
        mult: 1, bye: 0, outUntil: 0, v: mean,
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
        mult: 1, bye: 0, outUntil: 0, v: mean,
      });
    }
    pool.sort((a, b) => b.mean - a.mean);
    return pool;
  }

  // Start-of-season draw: how each player's year actually breaks, and when his
  // bye falls. Re-rolled once per simulated season, never per week.
  function rollSeason(pool, rnd, normal) {
    const [b0, b1] = SIM.byeWeeks;
    for (const a of pool) {
      a.mult = Math.exp(normal() * SIM.projectionSigma - SIM.projectionSigma * SIM.projectionSigma / 2);
      a.bye = b0 + Math.floor(rnd() * (b1 - b0 + 1));
      a.outUntil = a.startOut;
      a.v = a.mean * a.mult;
    }
    // Sort ONCE here, not once per week: `v` is fixed for the season, so the
    // manager's preference order can't change. simWeek then fills presorted.
    pool.sort((a, b) => b.v - a.v);
  }

  // One team's week: decide availability, set the lineup on EXPECTED points
  // (a manager can't see the outcome), then sample what those starters actually
  // did. Getting that order right is the whole reason depth shows up as value.
  function simWeek(pool, slots, week, rnd, normal) {
    const avail = [];
    for (const a of pool) {
      if (week === a.bye) continue;
      if (week <= a.outUntil) continue;
      if (rnd() < a.hazard) {
        // Geometric-ish absence: mean SIM.injuryDurationWeeks, minimum 1.
        a.outUntil = week + Math.max(1, Math.round(-Math.log(1 - rnd()) * SIM.injuryDurationWeeks));
        continue;
      }
      if (a.questionable && week === 1 && rnd() < SIM.questionableOutChance) continue;
      // The manager sets his lineup on the season-long read of the player (`v`,
      // set in rollSeason) — he can see a breakout by midseason, he can't see
      // Sunday. `avail` inherits the pool's descending order, hence presorted.
      avail.push(a);
    }
    const lineup = slots.length ? fillLineup(avail, slots, true) : avail.slice(0, 9);

    // Stack links. For each NFL team with a QB in this lineup, draw ONE passing-game
    // factor and share it with that team's best same-team receiver, at the measured
    // correlation. Deliberately one receiver per QB: loading a second would invent a
    // WR-WR correlation that measures at +0.004 in the real data.
    // `share` is the variance fraction taken from the shared factor, so total player
    // variance is unchanged and only the covariance is added.
    let z = null, linked = null;
    for (const s of lineup) {
      if (s.pos !== 'QB' || !s.nflTeam) continue;
      let best = null;
      for (const r of lineup) {
        if (r === s || r.nflTeam !== s.nflTeam) continue;
        if (SIM.stackCorr[r.pos] == null) continue;
        if (!best || r.v > best.v) best = r;
      }
      if (!best) continue;
      (z = z || new Map()).set(s.nflTeam, normal());
      (linked = linked || new Map()).set(s, SIM.stackCorr[best.pos]).set(best, SIM.stackCorr[best.pos]);
    }

    let total = 0;
    for (const s of lineup) {
      const share = linked && linked.get(s);
      let noise;
      if (share) {
        // sqrt(share) on the shared factor, sqrt(1-share) on his own week.
        noise = Math.sqrt(share) * z.get(s.nflTeam) + Math.sqrt(1 - share) * normal();
      } else {
        noise = normal();
      }
      total += Math.max(0, s.v + noise * s.sd * s.mult);
    }
    // Correlated fantasy-team week shock: game scripts, weather, blowouts.
    return Math.max(0, total * (1 + normal() * SIM.teamShockCv));
  }

  // Round-robin-ish schedule: each week pair the teams up at random. The real
  // Sleeper schedule isn't in the local data, and over 14 weeks a random pairing
  // and a fixed one converge for playoff-odds purposes.
  function randomPairing(n, rnd) {
    const idx = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const pairs = [];
    for (let i = 0; i + 1 < n; i += 2) pairs.push([idx[i], idx[i + 1]]);
    return pairs;
  }

  function playoffSettings(lg) {
    const s = lg.settings || {};
    const teams = lg.playoff_teams || s.playoff_teams || 6;
    const startWeek = s.playoff_week_start || 15;
    return { teams, startWeek, regularWeeks: startWeek - 1, rounds: Math.ceil(Math.log2(teams)) };
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
  // longitudinal shapes — what happens to ONE player as he ages.
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
        // get — the cliff is not linear.
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
  // picks, which is the engine that makes a rebuild work at all — without this
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
  // comparison stays fair — the cost of spending your picks only shows up if
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
  function titleEquity(lg, { years = 7, sims = 2500, src = 'blend', whatIf = null, discount = 0.88, seed = 20260807 } = {}) {
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
  // be priced in titles instead of in points.
  function championshipOdds(lg, { sims = 4000, src = 'blend', whatIf = null, seed = 20260807, yearsOut = 0, strengthRanks = null } = {}) {
    const rosters = lg.rosters || [];
    const n = rosters.length;
    if (!n) return [];
    const slots = offenseStartingSlots(lg);
    const cfg = playoffSettings(lg);
    const { extraPoints } = projectLeagueForward(lg, yearsOut, whatIf, strengthRanks);
    const pools = rosters.map(r => {
      const wi = whatIf && whatIf[r.roster_id];
      const drop = new Set((wi?.drop || []).map(String));
      const keep = startableIds(r, { includeStashed: yearsOut > 0 }).filter(p => !drop.has(String(p)));
      const base = { ...r, players: keep, taxi: [], reserve: [] };
      return simPool(base, lg, src, wi?.add, yearsOut, extraPoints.get(r.roster_id));
    });
    const stat = rosters.map(() => ({ playoff: 0, bye: 0, final: 0, title: 0, wins: 0, pts: 0 }));
    const rnd = mulberry32(seed);
    const normal = makeNormal(rnd);

    for (let s = 0; s < sims; s++) {
      const wins = new Array(n).fill(0), pts = new Array(n).fill(0);
      for (const pool of pools) rollSeason(pool, rnd, normal);
      for (let w = 1; w <= cfg.regularWeeks; w++) {
        const scores = pools.map(p => simWeek(p, slots, w, rnd, normal));
        for (let i = 0; i < n; i++) pts[i] += scores[i];
        for (const [a, b] of randomPairing(n, rnd)) {
          if (scores[a] > scores[b]) wins[a]++; else if (scores[b] > scores[a]) wins[b]++;
          else { wins[a] += 0.5; wins[b] += 0.5; }
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
          winners.push(simWeek(pools[a], slots, week, rnd, normal) >= simWeek(pools[b], slots, week, rnd, normal) ? a : b);
        }
        alive = alive.slice(0, byes).concat(winners);
        week++;
      }
      while (alive.length > 1) {
        alive.sort((a, b) => field.indexOf(a) - field.indexOf(b)); // re-seed
        const next = [];
        for (let i = 0; i < alive.length / 2; i++) {
          const a = alive[i], b = alive[alive.length - 1 - i];
          next.push(simWeek(pools[a], slots, week, rnd, normal) >= simWeek(pools[b], slots, week, rnd, normal) ? a : b);
        }
        if (alive.length === 2) for (const t of alive) stat[t].final++;
        alive = next; week++;
      }
      stat[alive[0]].title++;
    }

    return rosters.map((r, i) => ({
      roster: r, rosterId: r.roster_id, teamName: r.team_name, isMe: !!r.is_me,
      playoff: stat[i].playoff / sims, bye: stat[i].bye / sims,
      final: stat[i].final / sims, title: stat[i].title / sims,
      expWins: stat[i].wins / sims, expPts: stat[i].pts / sims,
    })).sort((a, b) => b.title - a.title);
  }
  function projPosGroup(pos) {
    if (['QB', 'RB', 'WR', 'TE'].includes(pos)) return pos;
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
      const p = map.get(pid); if (p && p[src] != null) cand.push({ name: p.name, pos: p.pos, pts: p[src] });
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
  // backfilled by that roster's next-best at the position — the Δ is the true
  // "what am I replacing this asset with" number, not raw dynasty value.
  function tradeLineupImpact(lg, rosterId, sendSet, recvSet) {
    const roster = (lg.rosters || []).find(r => r.roster_id === rosterId);
    if (!roster) return null;
    const sent = new Set([...sendSet].filter(k => !isPickKey(k)).map(String));
    const recv = [...recvSet].filter(k => !isPickKey(k)).map(String);
    // Startable only: a taxi stash can't fill the hole a traded starter leaves.
    const base = startableIds(roster);
    const now = lineupPoints(lg, base);
    const post = base.filter(p => !sent.has(p)).concat(recv);
    const after = lineupPoints(lg, post);
    return { now, after, delta: Math.round((after - now) * 10) / 10 };
  }

  // What-if tray: search any projected player, drop him onto MY roster, watch the
  // whole board re-rank. Answers "where would I land if I got these guys" without
  // building a trade — the Trade Lab is for negotiating one, this is for scouting.
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
      title: part ? `${st} — ${part}` : st,
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
    if (!window.OFFENSE_PROJ) { main.appendChild(h('div', { class: 'empty' }, 'projections.js not loaded — run score_offense.py + score_defense.py.')); return; }

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
      const seg = h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap' } },
        h('span', { class: 'muted', style: { fontSize: '12px', width: '54px' } }, label));
      for (const it of items) {
        const on = it === active;
        seg.appendChild(h('button', {
          class: 'ghost' + (on ? ' active' : ''), 'aria-pressed': String(on),
          style: on ? { background: 'var(--accent, #34d399)', color: '#08110d', fontWeight: 700, borderColor: 'transparent' } : {},
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
        h('div', { class: 'tip' }, `${lg.name} has no IDP starting slots — defense projections are informational only here.`)));
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
        h('div', { class: 'card-title' }, `Team ${isDef ? `IDP starters (top ${idpN})` : 'offense — best lineup'} · ${PROJ_SRC_LABEL[src]}`,
          wi.length ? h('span', { class: 'badge whatif-on', style: { marginLeft: '8px' } }, `WHAT-IF +${wi.length}`) : null,
          isDef ? null : h('button', {
            class: 'ghost odds-btn',
            title: oddsOn ? 'Re-run the season simulation' : 'Simulate the season and playoffs to get championship probability',
            onclick: () => { PROJ_STATE.odds = PROJ_STATE.odds ? null : 4000; viewProjections(lg.id); },
          }, oddsOn ? 'Hide title odds' : 'Run title odds ⚄')),
        h('table', { class: 'data' },
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
    const teamSelP = h('select', { style: { marginLeft: '8px' }, onchange: (e) => { PROJ_STATE.team = e.target.value; viewProjections(lg.id); } });
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
    // selected source — computed once, not per row.
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
  // Strength of Schedule page — per position (QB/RB/WR/TE), teams as rows,
  // weeks as columns, each cell the opponent colored by its defense-vs-position
  // strength (last-season PPR allowed to that position, ranked). window.SOS_GRID.
  // ============================================================
  let SOS_GRID_POS = 'RB';
  let SOS_GRID_SORT = { key: 'avg', dir: 'desc' }; // key = 'avg' or a week number; desc = easiest first
  function defRankColor(rank, n) {
    if (rank == null) return 'var(--fg-3)';
    const f = rank / n;   // low rank = allows fewest = tough = red; high = easy = green
    return f <= 0.25 ? 'var(--red)' : f <= 0.5 ? 'var(--amber)' : f <= 0.75 ? '#5eead4' : 'var(--green)';
  }
  function viewSosGrid(posArg) {
    const main = $('#main'); main.innerHTML = '';
    const G = window.SOS_GRID;
    if (!G) { main.appendChild(h('div', { class: 'empty' }, 'sos-grid.js not loaded — run build_sos_grid.py.')); return; }
    if (posArg && G.positions.includes(posArg.toUpperCase())) SOS_GRID_POS = posArg.toUpperCase();
    const pos = SOS_GRID_POS, n = G.n_def, WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);

    main.appendChild(breadcrumbs([{ label: 'Tools' }, { label: 'Strength of Schedule' }]));
    main.appendChild(h('div', { class: 'page-header' }, h('div', null,
      h('div', { class: 'page-eyebrow' }, 'STRENGTH OF SCHEDULE'),
      h('h1', { class: 'page-title' }, 'Season SOS by Position'),
      h('p', { class: 'page-sub' }, `Each cell is the opponent, colored by its defense vs ${pos} (${G.season} PPR allowed to the position). Green = weak D (smash spot), red = elite D (tough). Rank 1 of ${n} = allows fewest.`))));

    // position tabs
    const tabs = h('div', { style: { display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' } });
    for (const p of G.positions) {
      const on = p === pos;
      tabs.appendChild(h('button', { class: 'ghost' + (on ? ' active' : ''),
        style: on ? { background: 'var(--accent, #34d399)', color: '#08110d', fontWeight: 700, borderColor: 'transparent' } : {},
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
            h('div', { style: { fontWeight: 700 } }, g.opp),
            h('div', { style: { fontSize: '9px', opacity: .85 } }, g.rank != null ? '#' + g.rank : ''));
        }))
      ))
    );
    main.appendChild(h('div', { style: { overflowX: 'auto' } }, tbl));
    main.appendChild(h('div', { class: 'tip', style: { marginTop: '10px' } },
      `Defense-vs-position from ${G.season} actual PPR allowed. SOS column = average opponent DvP rank across the schedule (higher = easier season for ${pos}s).`));
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
          h('span', { class:'nav-tag' }, `${s.teams || '?'}T ${d.status === 'complete' ? 'done' : d.status}`),
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
      onchange: (e) => { if (e.target.value) navigate(e.target.value); },
    }, h('option', { value:'' }, 'Switch draft…'));
    myDrafts().then((list) => {
      const seen = new Set([d.draft_id]);
      for (const o of list) {
        if (seen.has(o.draft_id)) continue;
        seen.add(o.draft_id);
        switcher.appendChild(h('option', { value:`#draft/${o.draft_id}` },
          `${(o.metadata || {}).name || o.draft_id} · ${o._season} · ${o.status === 'complete' ? 'done' : o.status}`));
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
        kpis.appendChild(kpi('—', 'Your next pick · none left'));
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
        teamPane.appendChild(h('table', { class:'data data-sticky' },
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
                  a && a.bye != null ? String(a.bye) : '—'),
                h('td', { class:'right tnum' }, a ? `#${a.pick}` : '—'),
                h('td', { class:'right tnum' }, a && a.pts ? a.pts.toFixed(1) : '—'));
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
              h('td', { class:'right tnum' }, r.vor != null ? `${r.vor > 0 ? '+' : ''}${r.vor.toFixed(1)}` : '—'),
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
  function route() {
    teardownDraftView();
    renderSidebar();
    setActiveNav();
    document.body.classList.remove('nav-open');
    window.scrollTo(0, 0);
    requestAnimationFrame(wrapDataTables);
    const hash = location.hash || '#dashboard';
    const [path, ...rest] = hash.replace(/^#/, '').split('/');
    try {
      switch (path) {
        case 'dashboard':  return viewDashboard(rest[0]);
        case 'watch':      return viewWatch();
        case 'rankings':   return viewRankings();
        // All Players removed because the per-league Players tab covers it.
        case 'players':    navigate('#dashboard'); return viewDashboard();
        case 'leagues':    return viewLeagues();
        case 'league':     return viewLeague(rest[0], rest[1]);
        case 'roster':     return viewRoster(rest[0], rest[1], rest[2]);
        case 'trade':      return viewTrade(rest[0]);
        case 'projections': return viewProjections(rest[0]);
        case 'sos':        return viewSosGrid(rest[0]);
        case 'draft':      return viewDraft(rest[0]);
        case 'compare':    return viewCompare(rest[0], rest[1], rest[2]);
        case 'strategy':   return viewStrategy();
        case 'action':     return viewActionCenter();
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
    if (navToggle) navToggle.addEventListener('click', () => document.body.classList.add('nav-open'));
    if (navScrim)  navScrim.addEventListener('click',  () => document.body.classList.remove('nav-open'));

    window.addEventListener('hashchange', route);
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        openCmdK();
      }
      if (e.key === 'Escape' && document.body.classList.contains('nav-open')) {
        document.body.classList.remove('nav-open');
      }
    });
    route();
  }

  // Expose a couple things for console debugging
  window.__app = { state, rankIndex, computeRosterStrength, sleeperIdFor };

  document.addEventListener('DOMContentLoaded', boot);
})();
