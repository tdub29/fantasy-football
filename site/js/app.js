/* Tier Sheet, Fantasy Football site app
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
    customSources: [],     // user-added sources, same shape as built-ins
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
    if (direct) return direct;
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
    const all = Array.from(byName.values()).sort((a, b) => {
      if (a._avgSourceRank !== b._avgSourceRank) return a._avgSourceRank - b._avgSourceRank;
      const tv = (window.TIER_VALUES[b.category]?.[b.tier] || 0) - (window.TIER_VALUES[a.category]?.[a.tier] || 0);
      if (tv !== 0) return tv;
      return a.name.localeCompare(b.name);
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
  function invalidateRankIndex() { _rankIndex = null; _rankIndexKey = null; }

  function tierValue(p, format) {
    if (!p) return 0;
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

  function computeRosterStrength(roster, league) {
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
    return { total: Math.round(total*10)/10, breakdown, rankedCount, rankedPlayers, unranked, totalCount: (roster.players||[]).length };
  }

  // ============================================================
  // Layout: sidebar + content
  // ============================================================
  const ROUTES = [
    { hash:'#dashboard',    label:'Dashboard',     icon:'◆',  section:'Overview' },
    { hash:'#rankings',     label:'Rankings',      icon:'★',  section:'Overview' },
    { hash:'#players',      label:'All Players',   icon:'⌕',  section:'Overview' },
    { hash:'#leagues',      label:'My Leagues',    icon:'⚑',  section:'My Teams' },
    { hash:'#trade',        label:'Trade Calculator', icon:'⇄', section:'My Teams' },
    { hash:'#action',       label:'Action Center', icon:'!', section:'My Teams' },
    { hash:'#strategy',     label:'Strategy',      icon:'◇',  section:'Settings' },
    { hash:'#sources',      label:'YouTuber Sources', icon:'▶', section:'Settings' },
    { hash:'#about',        label:'About',         icon:'?',  section:'Settings' },
  ];

  function renderSidebar() {
    const sidebar = $('#sidebar');
    sidebar.innerHTML = '';
    sidebar.appendChild(h('div', { class:'brand' },
      h('div', { class:'logo' }, 'D'),
      h('div', null,
        h('div', { class:'name' }, 'Tier Sheet'),
        h('div', { class:'sub' }, 'tdub1329 · 2026'),
      )
    ));

    // Cmd+K search trigger
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform || '');
    sidebar.appendChild(h('div', { class:'search-hint', onclick: openCmdK, style:{ marginBottom:'14px' } },
      h('span', null, 'Quick jump…'),
      h('span', { class:'spacer' }),
      h('span', { class:'kbd' }, isMac ? '⌘' : 'Ctrl'), h('span', { class:'kbd' }, 'K')
    ));

    const sections = {};
    for (const r of ROUTES) (sections[r.section] = sections[r.section] || []).push(r);
    for (const [section, items] of Object.entries(sections)) {
      sidebar.appendChild(h('div', { class:'nav-section-title' }, section));
      const nav = h('div', { class:'nav' });
      for (const r of items) {
        const a = h('a', { href:r.hash, dataset:{ route: r.hash } },
          h('span', { class:'icon' }, r.icon),
          r.label
        );
        nav.appendChild(a);
      }
      sidebar.appendChild(nav);
    }

    // Quick league shortcuts
    sidebar.appendChild(h('div', { class:'nav-section-title' }, 'Leagues'));
    const lnav = h('div', { class:'nav' });
    for (const lg of window.LEAGUES || []) {
      const me = (lg.rosters || []).find(r => r.is_me);
      const myTeam = me ? me.team_name : lg.short_name;
      const a = h('a', { href:`#league/${lg.id}` },
        h('span', { class:'icon' }, lg.is_superflex ? '◆' : (lg.is_idp ? '◇' : '○')),
        myTeam
      );
      lnav.appendChild(a);
    }
    sidebar.appendChild(lnav);
  }

  function setActiveNav() {
    const hash = location.hash || '#dashboard';
    for (const a of $$('#sidebar .nav a')) {
      a.classList.toggle('active', hash.startsWith(a.getAttribute('href')));
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

  function playerRow(p, opts={}) {
    const click = () => openPlayerDetail(p.name);
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
  function viewDashboard() {
    const main = $('#main');
    main.innerHTML = '';
    main.appendChild(h('div', { class:'page-header' },
      h('div', null,
        h('h1', { class:'page-title' }, 'Dashboard'),
        h('p', { class:'page-sub' }, "Overview of your dynasty empire, categories, leagues, and standings.")
      ),
      h('div', { class:'page-actions' },
        h('button', { class:'ghost', onclick: openCmdK }, h('span', { class:'kbd' }, 'Ctrl'), ' ', h('span', { class:'kbd' }, 'K'), ' Quick jump')
      )
    ));

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

    main.appendChild(h('section', { class:'empire' },
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

    main.appendChild(h('div', { class:'card-grid cols-4', style:{ marginTop:'14px' } },
      kpiCard('Leagues', String(totalLeagues), 'Active dynasty rosters'),
      kpiCard('Sources Enabled', `${enabledRankings}`, 'Active ranking sets'),
      kpiCard('Players Ranked', `${idx.all.length}`, 'Across enabled sources'),
      kpiCard('Cornerstones Owned', `${totalCornerstonesOwned}`, 'Across all your rosters'),
    ));

    // ===== Auto-generated Insights strip =====
    main.appendChild(insightsStrip(myRosters));

    // My leagues at a glance
    main.appendChild(h('h2', { class:'page-title', style:{ fontSize:'1.2rem', marginTop:'24px' } }, 'My Leagues'));
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

    const cornerstones = [];
    for (const { league, roster } of myRosters) {
      const s = computeRosterStrength(roster, league);
      for (const rp of s.rankedPlayers) {
        if (rp.ranked.category !== 'cornerstone') continue;
        cornerstones.push({ league, player: rp.ranked, sleeper: rp.sleeper, value: rp.value });
      }
    }
    // Sleeper Market: Risers / Fallers panel
    if (window.SLEEPER_MARKET) {
      const market = window.SLEEPER_MARKET;
      const top = (arr, n=8) => arr.slice(0, n);
      const renderMover = (m, sign) => {
        const sp = window.PLAYERS[m.player_id];
        const ranked = sp ? (rankIndex().bySleeperId.get(m.player_id) || rankIndex().byName.get(norm(sp.name))) : null;
        return h('div', { class:'mover-row', onclick: () => sp ? openPlayerDetail(sp.name) : null },
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
    }

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

    // Cornerstone summary
    main.appendChild(h('h2', { class:'page-title', style:{ fontSize:'1.2rem', marginTop:'24px' } }, 'Your Cornerstones'));
    cornerstones.sort((a,b) => b.value - a.value);
    if (!cornerstones.length) {
      main.appendChild(h('div', { class:'empty' }, 'No Cornerstones detected yet, check your roster mappings.'));
    } else {
      const cs = h('div', { class:'card' });
      const tbl = h('table', { class:'data' },
        h('thead', null, h('tr', null,
          h('th', null, 'Player'),
          h('th', null, 'Tier'),
          h('th', null, 'League'),
          h('th', { class:'right' }, 'Value'),
        )),
        h('tbody', null, ...cornerstones.map(c => {
          const sup = c.league.is_superflex && window.SUPERFLEX_POS_MULT[c.player.pos] > 1;
          return h('tr', { onclick:()=>openPlayerDetail(c.player.name) },
            h('td', null, h('div', { class:'name-cell' },
              posChip(c.player.pos), teamChip(c.player.team),
              h('span', { class:'name' }, c.player.name)
            )),
            h('td', null, tierChip(c.player.tier, c.player.category)),
            h('td', null, c.league.short_name, sup ? h('span', { class:'badge', style:{ marginLeft:'6px' } }, 'SF Bonus') : null),
            h('td', { class:'right tnum' }, fmt.decimal(c.value, 1))
          );
        }))
      );
      cs.appendChild(tbl);
      main.appendChild(cs);
    }
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
  const RANKINGS_FILTER = { pos:'ALL', cat:'ALL', q:'', hideUncertain:false };
  function viewRankings() {
    const main = $('#main');
    main.innerHTML = '';
    main.appendChild(h('div', { class:'page-header' },
      h('div', null,
        h('h1', { class:'page-title' }, 'Overall Rankings'),
        h('p', { class:'page-sub' }, 'Flat 1 to N list aggregated from your enabled sources. Tier and category influence the ordering, but the rank is the rank.')
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

    const posBtns = h('div', { class:'toggle-group' });
    for (const p of ['ALL','QB','RB','WR','TE']) {
      posBtns.appendChild(h('button', {
        class:`toggle ${RANKINGS_FILTER.pos===p?'active':''}`,
        onclick: (e)=>{ RANKINGS_FILTER.pos = p; renderList(); $$('.toggle-group .toggle').forEach(b=>b.classList.toggle('active', b===e.target)); }
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
      const idx = rankIndex();
      const filtered = idx.all.filter(p => {
        if (RANKINGS_FILTER.pos !== 'ALL' && p.pos !== RANKINGS_FILTER.pos) return false;
        if (RANKINGS_FILTER.cat !== 'ALL' && p.category !== RANKINGS_FILTER.cat) return false;
        if (RANKINGS_FILTER.hideUncertain && p.uncertain) return false;
        if (RANKINGS_FILTER.q && !norm(p.name).includes(norm(RANKINGS_FILTER.q))) return false;
        return true;
      });

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
              .push({ league: lg.short_name, leagueId: lg.id, team: r.team_name, owner: r.owner_name, isMe: r.is_me });
          }
        }
      }

      // Compute position rank within filter (e.g., QB1, QB2)
      const posCounters = {};

      const tbl = h('table', { class:'data' },
        h('thead', null, h('tr', null,
          h('th', { class:'right', style:{ width:'56px' } }, 'Rank'),
          h('th', null, 'Player'),
          h('th', null, 'Pos'),
          h('th', null, 'Team'),
          h('th', { class:'right' }, 'Age'),
          h('th', null, 'Category'),
          h('th', { class:'center', style:{ width:'48px' } }, 'Tier'),
          h('th', { class:'right' }, 'Own%'),
          h('th', { class:'right' }, 'Start%'),
          h('th', null, 'Owners'),
        )),
        h('tbody', null, ...filtered.map((p, i) => {
          posCounters[p.pos] = (posCounters[p.pos] || 0) + 1;
          const posRank = `${p.pos}${posCounters[p.pos]}`;
          const sleeperId = p._sleeperId;
          const sleeper = sleeperId ? window.PLAYERS[sleeperId] : null;
          const owned = sleeper?.owned;
          const started = sleeper?.started;
          // "Depth trap": owned but rarely started, sell signal
          const isDepth = owned != null && started != null && owned > 30 && started < 25 && owned - started > 30;
          const owners = sleeperId ? (ownerMap.get(sleeperId) || []) : [];
          const youOwn = owners.some(o => o.isMe);
          const ownColor = owned == null ? 'var(--fg-3)' : owned > 80 ? 'var(--green)' : owned > 40 ? 'var(--amber)' : 'var(--fg-2)';
          const startColor = started == null ? 'var(--fg-3)' : started > 60 ? 'var(--green)' : started > 25 ? 'var(--amber)' : 'var(--red)';
          return h('tr', { class: youOwn ? 'you' : '', onclick: () => openPlayerDetail(p.name), title: p.note || '' },
            h('td', { class:'right tnum', style:{ fontWeight:700, color:'var(--fg-1)' } }, String(i + 1)),
            h('td', null, h('div', { class:'name-cell' },
              h('span', { class:'name' }, p.name),
              p.rookie ? h('span', { class:'badge rookie', style:{ marginLeft:'4px' } }, 'Rookie') : null,
              p.uncertain ? h('span', { class:'badge uncertain', style:{ marginLeft:'4px' } }, 'Verify') : null,
              p.subtype === 'depreciating_pillar' ? h('span', { class:'badge depreciating', style:{ marginLeft:'4px' } }, 'DP') : null,
              isDepth ? h('span', { class:'badge depreciating', style:{ marginLeft:'4px' }, title:'Owned but rarely started; depth piece, not a starter.' }, 'DEPTH') : null,
            )),
            h('td', null, h('div', { style:{ display:'flex', alignItems:'center', gap:'6px' } },
              posChip(p.pos),
              h('span', { class:'tip tnum' }, posRank)
            )),
            h('td', null, teamChip(p.team)),
            h('td', { class:'right tnum' }, p.age ?? h('span', { class:'muted' }, '.')),
            h('td', null, pillCategory(p.category)),
            h('td', { class:'center' }, tierChip(p.tier, p.category)),
            h('td', { class:'right tnum', style:{ color: ownColor } }, owned != null ? owned.toFixed(0) + '%' : '.'),
            h('td', { class:'right tnum', style:{ color: startColor } }, started != null ? started.toFixed(0) + '%' : '.'),
            h('td', null,
              owners.length
                ? h('div', { style:{ display:'flex', gap:'4px', flexWrap:'wrap' } }, ...owners.slice(0,3).map(o => h('span', {
                    class:'badge' + (o.isMe ? ' you' : ''),
                    title: `${o.team} (${o.owner}), ${o.league}`,
                  }, o.league)))
                : h('span', { class:'muted' }, '.')
            ),
          );
        }))
      );
      tableWrap.appendChild(tbl);
      tableWrap.appendChild(h('div', { class:'tip', style:{ padding:'10px 14px', borderTop:'1px solid var(--border)' } },
        `Showing ${filtered.length} player${filtered.length===1?'':'s'}. Rank is averaged across all enabled rankings; the position-within-source determines the order, with tier acting as a coarse cluster.`
      ));
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
        h('h1', { class:'page-title' }, 'All Players'),
        h('p', { class:'page-sub' }, 'Searchable Sleeper player database, overlaid with your enabled rankings.')
      )
    ));

    const filterBar = h('div', { class:'filters' });
    const q = h('input', { type:'search', placeholder:'Search 9000+ players…', value: ALL_FILTER.q,
      oninput:(e)=>{ ALL_FILTER.q = e.target.value.trim(); render(); } });
    filterBar.appendChild(h('div', { class:'group' }, h('label', null, 'Search'), q));

    const posBtns = h('div', { class:'toggle-group' });
    for (const p of ['ALL','QB','RB','WR','TE','K','DEF','LB','DB','DL']) {
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
        if (ALL_FILTER.pos !== 'ALL' && p.pos !== ALL_FILTER.pos) continue;
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
          h('th', null, 'Pos'),
          h('th', null, 'Team'),
          h('th', null, 'Category'),
          h('th', null, 'Tier'),
          h('th', null, 'Owners'),
        )),
        h('tbody', null, ...limited.map(({pid,p,ranked,owners}) => {
          return h('tr', { onclick: ()=>openPlayerDetail(p.name) },
            h('td', null, h('div', { class:'name-cell' },
              h('span', { class:'name' }, p.name),
              p.age ? h('span', { class:'muted' }, ` · ${p.age}`) : null,
            )),
            h('td', null, posChip(p.pos)),
            h('td', null, teamChip(p.team)),
            h('td', null, ranked ? pillCategory(ranked.category) : h('span', { class:'muted' }, ',')),
            h('td', null, ranked ? tierChip(ranked.tier, ranked.category) : h('span', { class:'muted' }, ',')),
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
      tableWrap.appendChild(tbl);
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
        h('h1', { class:'page-title' }, 'My Leagues'),
        h('p', { class:'page-sub' }, '2026 dynasty rosters, team strength, and standings.')
      )
    ));
    const grid = h('div', { class:'card-grid cols-3' });
    for (const lg of window.LEAGUES || []) {
      const me = lg.rosters.find(r => r.is_me);
      const s  = me ? computeRosterStrength(me, lg) : null;
      const myRank = me ? rankInLeague(lg, me.roster_id) : null;
      grid.appendChild(h('div', { class:'league-card', onclick:()=>navigate(`#league/${lg.id}`) },
        h('div', { class:'name' }, lg.name),
        h('div', { class:'meta' }, `${me ? me.team_name : ','} · ${lg.total_rosters}-team`),
        h('div', { class:'badges' },
          lg.is_superflex ? h('span', { class:'badge', style:{ background:'rgba(251,191,36,.15)', color:'var(--amber)', borderColor:'rgba(251,191,36,.4)' } }, 'SUPERFLEX') : null,
          lg.is_idp ? h('span', { class:'badge', style:{ background:'rgba(96,165,250,.15)', color:'var(--blue)', borderColor:'rgba(96,165,250,.4)' } }, 'IDP') : null,
          h('span', { class:'badge' }, lg.status === 'pre_draft' ? 'Pre-Draft' : lg.status),
          me && myRank ? h('span', { class:'badge', style:{ background:'rgba(167,139,250,.15)', color:'var(--accent-hot)', borderColor:'rgba(167,139,250,.4)' } }, `Rank #${myRank}`) : null,
        ),
        s ? h('div', { style:{ marginTop:'12px' } },
          h('div', { class:'stat-num' }, fmt.decimal(s.total,1)),
          h('div', { class:'stat-label' }, 'Team Strength')
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
  function viewLeague(leagueId) {
    const main = $('#main');
    const lg = (window.LEAGUES || []).find(l => l.id === leagueId);
    if (!lg) { main.innerHTML = ''; main.appendChild(h('div', { class:'empty' }, 'League not found.')); return; }
    const me = lg.rosters.find(r => r.is_me);

    main.innerHTML = '';
    main.appendChild(h('div', { class:'page-header' },
      h('div', null,
        h('h1', { class:'page-title' }, lg.name),
        h('p', { class:'page-sub' }, `${me?.team_name || ','} · ${lg.total_rosters}-team · ${lg.status}`)
      ),
      h('div', { class:'page-actions' },
        me ? h('a', { href:`#compare/${lg.id}/${me.roster_id}/${(lg.rosters.find(r => !r.is_me) || lg.rosters[1]).roster_id}` },
          h('button', { class:'ghost' }, 'Compare ⇄')) : null,
        h('a', { href:`#trade/${lg.id}` }, h('button', { class:'ghost' }, 'Trade Calculator ⇄')),
        h('a', { href:`https://sleeper.com/leagues/${lg.id}/standings`, target:'_blank', rel:'noopener' },
          h('button', { class:'ghost' }, 'Open in Sleeper ↗'))
      )
    ));

    if (lg.is_superflex) {
      main.appendChild(h('div', { class:'league-banner superflex' },
        h('strong', null, '⚠ SUPERFLEX, '),
        'A second QB can start in the SUPER_FLEX slot. Top-12 QBs are treated as Cornerstone-tier; QB values get a 1.40× position multiplier in team strength.'));
    } else if (lg.is_idp) {
      main.appendChild(h('div', { class:'league-banner idp' },
        h('strong', null, '◇ IDP, '),
        'This league has IDP_FLEX slots. Defensive players (LB/DB/DL) score; LBs get a 1.10× multiplier in team strength.'));
    }

    // Standings / Strength rankings
    main.appendChild(h('h2', { class:'page-title', style:{ fontSize:'1.2rem', marginTop:'8px' } }, 'Team Strength Rankings'));

    const computed = lg.rosters.map(r => ({ r, s: computeRosterStrength(r, lg) }));
    computed.sort((a,b) => b.s.total - a.s.total);
    const maxTotal = computed[0].s.total || 1;

    const standings = h('div');
    computed.forEach((row, i) => {
      const r = row.r, s = row.s;
      const isMe = r.is_me;
      const cs = s.rankedPlayers.filter(p => p.ranked.category === 'cornerstone').length;
      const fnd = s.rankedPlayers.filter(p => p.ranked.category === 'foundational').length;
      const ups = s.rankedPlayers.filter(p => p.ranked.category === 'upside_premier').length;

      standings.appendChild(h('div', { class:`strength-row ${isMe?'you':''}`, onclick:()=>navigate(`#roster/${lg.id}/${r.roster_id}`) },
        h('div', { class:'rank' }, `#${i+1}`),
        h('div', { class:'team' },
          h('div', { class:'team-name' },
            r.team_name,
            isMe ? h('span', { class:'badge you', style:{ marginLeft:'8px' } }, 'YOU') : null
          ),
          h('div', { class:'owner' }, r.owner_name),
          h('div', { class:'strength-detail' },
            h('span', { class:'seg' }, h('span', { class:'dot', style:{ background:'var(--cat-cornerstone)' } }), `${cs} CS`),
            h('span', { class:'seg' }, h('span', { class:'dot', style:{ background:'var(--cat-foundational)' } }), `${fnd} FND`),
            h('span', { class:'seg' }, h('span', { class:'dot', style:{ background:'var(--cat-upside)' } }), `${ups} UP`),
          )
        ),
        h('div', { class:'score' }, fmt.decimal(s.total,1)),
        h('div', { class:'bar-wrap' }, h('div', { class:'bar', style:{ width: `${(s.total/maxTotal*100).toFixed(0)}%` } }))
      ));
    });
    main.appendChild(standings);

    // Cornerstones owned across the league
    main.appendChild(h('h2', { class:'page-title', style:{ fontSize:'1.2rem', marginTop:'24px' } }, 'Cornerstones Across the League'));
    const csList = [];
    for (const r of lg.rosters) {
      const s = computeRosterStrength(r, lg);
      for (const rp of s.rankedPlayers) {
        if (rp.ranked.category !== 'cornerstone') continue;
        csList.push({ roster:r, ranked: rp.ranked, value: rp.value });
      }
    }
    csList.sort((a,b)=>b.value-a.value);
    if (!csList.length) {
      main.appendChild(h('div', { class:'empty' }, 'No mapped Cornerstones in this league yet.'));
    } else {
      const card = h('div', { class:'card', style:{ padding:0, overflow:'hidden' } });
      const tbl = h('table', { class:'data' },
        h('thead', null, h('tr', null,
          h('th', null, 'Player'),
          h('th', null, 'Tier'),
          h('th', null, 'Owner'),
          h('th', { class:'right' }, 'Value'),
        )),
        h('tbody', null, ...csList.map(c => h('tr', {
          class: c.roster.is_me ? 'you' : '',
          onclick: ()=>navigate(`#roster/${lg.id}/${c.roster.roster_id}`)
        },
          h('td', null, h('div', { class:'name-cell' },
            posChip(c.ranked.pos), teamChip(c.ranked.team), h('span', { class:'name' }, c.ranked.name)
          )),
          h('td', null, tierChip(c.ranked.tier, c.ranked.category)),
          h('td', null, c.roster.team_name, c.roster.is_me ? h('span', { class:'badge you', style:{ marginLeft:'6px' } }, 'YOU') : null),
          h('td', { class:'right tnum' }, fmt.decimal(c.value, 1))
        )))
      );
      card.appendChild(tbl);
      main.appendChild(card);
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
      slots.push({
        slot: label,
        player: pick?.sleeper?.name || '(empty)',
        myVal: Math.round(myVal * 10) / 10,
        refVal: Math.round(refVal * 10) / 10,
        grade: Math.round(grade * 10) / 10,
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
  function gradeDraftCapital(roster, leagueId) {
    const lg = window.LEAGUES.find(l => l.id === leagueId);
    if (!lg) return 0;
    const picks = lg.traded_picks || [];
    let mine = 0, lost = 0;
    // Default: each owner has their own pick R1-R4 for next 2 yrs (assume 4 rounds)
    // Acquired picks: where owner_id == roster_id and roster_id (originator) != roster_id
    for (const p of picks) {
      if (p.owner_id === roster.roster_id && p.roster_id !== roster.roster_id) mine++;
      if (p.previous_owner_id === roster.roster_id && p.owner_id !== roster.roster_id) lost++;
    }
    // Default 8 picks (4 rounds × 2 years), adjusted by net trades
    const net = 8 + mine - lost;
    return Math.round(Math.max(0, Math.min(10, net / 1.2)) * 10) / 10;
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
    const curves = (window.STRATEGY && window.STRATEGY.age_curve) || {};
    // SELLS: position-aware age curves + depreciating pillars.
    // Cornerstones are exempt because their value is insulated by definition.
    for (const p of rosterPlayers) {
      if (!p.ranked) continue;
      const age = p.sleeper.age;
      const curve = curves[p.ranked.pos];
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
  function evaluateCoachingTips({ rosterPlayers, league, stance, archetype, valueTier, surplus }) {
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

  function viewRoster(leagueId, rosterId) {
    const main = $('#main');
    const lg = (window.LEAGUES || []).find(l => l.id === leagueId);
    if (!lg) { main.innerHTML=''; main.appendChild(h('div', { class:'empty' }, 'League not found.')); return; }
    const r = lg.rosters.find(x => String(x.roster_id) === String(rosterId));
    if (!r) { main.innerHTML=''; main.appendChild(h('div', { class:'empty' }, 'Roster not found.')); return; }

    main.innerHTML = '';
    main.appendChild(h('div', { class:'page-header' },
      h('div', null,
        h('div', { class:'tip', style:{ marginBottom:'4px' } }, 'TEAM BLUEPRINT'),
        h('h1', { class:'page-title' }, r.team_name, r.is_me ? h('span', { class:'badge you', style:{ marginLeft:'10px', verticalAlign:'middle' } }, 'YOU') : null),
        h('p', { class:'page-sub' }, `${r.owner_name} · ${lg.name} · ${lg.total_rosters}-team ${lg.is_superflex ? 'SF' : '1QB'} · PPR`)
      ),
      h('div', { class:'page-actions' },
        h('a', { href:`#league/${lg.id}` }, h('button', { class:'ghost' }, '← League'))
      )
    ));

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
    const overall = slotWeighted * 0.75 + grades.Bench * 0.15 + grades.Draft * 0.10;
    const buysSells = suggestBuysSells(rp, lg);
    const priorities = topPriorities(rp, lg, valueTier, rosterArchetype);

    // ===== Top Banner: Value Tier + Archetypes + Outlook =====
    main.appendChild(h('div', { class:'blueprint-banner' },
      h('div', { class:`value-tier vt-${valueTier.tier.toLowerCase()}` },
        h('div', { class:'vt-label' }, 'Roster Value Tier'),
        h('div', { class:'vt-value' }, valueTier.tier),
        h('div', { class:'vt-desc' }, valueTier.desc)
      ),
      h('div', { class:'archetype-list' },
        archetypeChip('Value Archetype', valueArchetype.tag, valueArchetype.desc),
        archetypeChip('Roster Archetype', rosterArchetype.tag, rosterArchetype.desc),
        archetypeChip('2-Year Outlook', outlook.tag, outlook.desc),
      )
    ));

    // ===== Stat strip =====
    main.appendChild(h('div', { class:'card-grid cols-4', style:{ marginTop:'14px' } },
      kpiCard('Strength', fmt.decimal(s.total,1), `Rank #${myRank} of ${lg.total_rosters}`),
      kpiCard('Cornerstones', String(cs), 'Premier insulated assets'),
      kpiCard('Foundational', String(fnd), 'Building blocks'),
      kpiCard('Overall Grade', fmt.decimal(overall, 1) + '/10', 'Lineup PPG-weighted + bench + picks'),
    ));

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
      ...slotResult.slots.map(s => ({ slot: s.slot, grade: s.grade, player: slotPlayer(s), myVal: s.myVal, refVal: s.refVal, isDepth: false })),
      ...benchDepth.map(s => ({ slot: s.slot, grade: s.grade, player: s.player, myVal: s.myVal, refVal: s.refVal, isDepth: true })),
      { slot: 'Bench', grade: gradeBench(rp, lg), player: 'roster depth', myVal: null, refVal: null, isDepth: true, isMeta: true },
      { slot: 'Draft', grade: gradeDraftCapital(r, leagueId), player: 'future picks', myVal: null, refVal: null, isDepth: true, isMeta: true },
    ];
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

    const slotBarList = h('div', { class:'slot-bars' });
    let dividerInserted = false;
    allBars.forEach((s, i) => {
      if (s.isDepth && !dividerInserted) {
        slotBarList.appendChild(h('div', { class:'slot-bar-divider' }, 'depth'));
        dividerInserted = true;
      }
      // Track width = how much that slot matters (PPG impact). Fill % = grade.
      const ratio = ppgs[i] / maxPPG;
      const trackPct = Math.round(25 + ratio * 75);  // 25-100% of track-area
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
      const titleText = `${s.slot}: ${typeof s.player === 'string' ? s.player : s.player.join(', ')}. Grade ${s.grade.toFixed(1)}/10${detail ? ` (value ${detail})` : ''}.`;

      // Name column (separate from bar — readable on solid bg).
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

      slotBarList.appendChild(h('div', {
        class: 'slot-bar-row' + (isClickable ? ' clickable' : ''),
        title: titleText,
        onclick: onClick,
      },
        h('span', { class:'slot-bar-label' }, s.slot),
        nameCol,
        posRankChip || h('span'),
        h('span', { class:'slot-bar-trackbox' },
          h('span', { class:'slot-bar-track', style:{ width: trackPct + '%' }, title:'Tick = passing-grade threshold (7.0)' },
            h('span', { class:'slot-bar-fill', style:{ width: fillPct + '%', background: color } }),
            h('span', { class:'slot-bar-tick', style:{ left: '70%' } }),
          ),
        ),
        h('span', { class:'slot-bar-grade', style:{ color } }, s.grade.toFixed(1)),
      ));
    });
    main.appendChild(slotBarList);
    main.appendChild(h('div', { class:'slot-bars-legend tip' },
      h('span', null, 'Bar length = expected PPG impact of the slot.'),
      h('span', { class:'sep' }, '·'),
      h('span', null, 'Fill width = your grade.'),
      h('span', { class:'sep' }, '·'),
      h('span', null, 'Click a row for player detail.'),
    ));

    // (Slot Detail table removed: bars carry the data; the table was redundant.)

    // ===== Lineup Composition (startable surplus / shortage) =====
    const ss = rosterSurplusShortage(rp, lg);
    main.appendChild(h('h2', { class:'section-title' }, 'Lineup Composition'));
    main.appendChild(h('div', { class:'card', style:{ padding:0, overflow:'hidden' } },
      h('table', { class:'data' },
        h('thead', null, h('tr', null,
          h('th', null, 'Position'),
          h('th', { class:'right' }, 'Startable'),
          h('th', { class:'right' }, 'Need'),
          h('th', { class:'right' }, 'Surplus'),
          h('th', null, 'Top startable players'),
        )),
        h('tbody', null, ...(lg.is_idp ? ['QB','RB','WR','TE','LB','DB','DL'] : ['QB','RB','WR','TE'])
          .filter(pos => ss[pos])
          .map(pos => {
          const info = ss[pos];
          const color = info.surplus >= 1 ? 'var(--green)' : info.surplus <= -1 ? 'var(--red)' : 'var(--fg-2)';
          const sign = info.surplus > 0 ? '+' : '';
          const top3 = info.startablePlayers
            .map(p => ({ p, val: tierValue(p.ranked, lg) }))
            .sort((a,b) => b.val - a.val).slice(0,3);
          return h('tr', null,
            h('td', null, h('strong', null, pos)),
            h('td', { class:'right tnum' }, info.startables),
            h('td', { class:'right tnum' }, info.need),
            h('td', { class:'right tnum', style:{ color, fontWeight: 700 } }, sign + info.surplus),
            h('td', null,
              top3.length
                ? h('div', { style:{ display:'flex', gap:'8px', flexWrap:'wrap' } },
                    ...top3.map(({p,val}) => h('span', { class:'tip', style:{ cursor:'pointer' }, onclick:()=>openPlayerDetail(p.sleeper.name) },
                      p.sleeper.name, h('span', { class:'tnum', style:{ color:'var(--fg-3)', marginLeft:'4px' } }, fmt.decimal(val,0))
                    )))
                : h('span', { class:'muted' }, 'no startable players at position')
            )
          );
        }))
      )
    ));
    main.appendChild(h('div', { class:'tip', style:{ marginTop:'6px' } },
      `Startable thresholds use league-wide positional slots (1QB target = ${(targetStartersByPos(lg).QB).toFixed(1)} per team, RB ${(targetStartersByPos(lg).RB).toFixed(1)}, WR ${(targetStartersByPos(lg).WR).toFixed(1)}, TE ${(targetStartersByPos(lg).TE).toFixed(1)}). Surplus ≥ 1 means you have spare startable assets to trade.`
    ));

    // The advice blocks below only fire on the user's own roster. Telling
    // someone else's team to "sell Cooper Kupp" is irrelevant — what the user
    // wants on opponent rosters is read-only scouting (slot grades, lineup
    // comp, roster by position).
    if (r.is_me) {

    // ===== Top Priorities =====
    main.appendChild(h('h2', { class:'section-title' }, 'Top Priorities'));
    main.appendChild(h('div', { class:'priorities' },
      ...priorities.map(p => h('div', { class:'priority-card' },
        h('div', { class:'priority-icon' }, p.icon),
        h('div', { class:'priority-text' }, p.text),
      ))
    ));

    // ===== Coaching Tips (strategy.js context-aware rules) =====
    const coachingTips = evaluateCoachingTips({
      rosterPlayers: rp, league: lg,
      stance: stanceOf(valueTier.tier, valueArchetype.tag),
      archetype: rosterArchetype.tag,
      valueTier: valueTier.tier,
      surplus: rosterSurplusShortage(rp, lg),
    });
    if (coachingTips.length) {
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
    main.appendChild(h('div', { class:'card-grid cols-2' },
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
      positionalAgeTracker(rp),
    ));
    // Compact callout: explain my own stance to anchor the reader
    if (partners[0]) {
      const myStance = partners[0].myStance;
      const stanceLabel = { contend:'Contender', rebuild:'Rebuilder', reload:'Reloader' }[myStance];
      const advice = myStance === 'contend' ? 'Target rebuilders. Trade picks and youth for established starters.'
                   : myStance === 'rebuild' ? 'Target contenders. Trade established starters for picks and youth.'
                   : 'Watch for asymmetric matchups. Look at the rebuilders for stars; the contenders for picks.';
      main.appendChild(h('div', { class:'tip', style:{ marginTop:'8px' } },
        `Your stance: ${stanceLabel}. ${advice}`
      ));
    }

    } // end if (r.is_me) — advice block

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

    // ===== "How to Trade With This Owner" panel =====
    // Only shown when viewing someone else's roster AND user has a roster
    // in this league. Frames trade angles from MY perspective looking at THEM.
    if (!r.is_me) {
      const myRoster = lg.rosters.find(rr => rr.is_me);
      if (myRoster) {
        const myRP_in_lg = getRosterPlayers(myRoster);
        const mySurplus = rosterSurplusShortage(myRP_in_lg, lg);
        const theirSurplus = ss; // already computed as rosterSurplusShortage(rp, lg)
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
            ? h('div', null, ...angles.map(a => h('div', { class:'priority-card', style:{ borderLeftColor: a.direction === 'send' ? 'var(--green)' : 'var(--blue)', marginBottom:'6px' } },
                h('div', { class:'priority-icon' }, a.direction === 'send' ? '→' : '←'),
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

    // ===== Roster (slot-by-slot) =====
    main.appendChild(h('h2', { class:'section-title' }, 'Roster'));
    const sections = [
      ['Starters', r.starters],
      ['Bench',    (r.players||[]).filter(p => !r.starters.includes(p) && !r.taxi.includes(p) && !r.reserve.includes(p))],
      ['Taxi',     r.taxi],
      ['IR/Reserve', r.reserve],
    ];
    for (const [title, ids] of sections) {
      if (!ids.length) continue;
      main.appendChild(h('div', { class:'roster-section' },
        h('h3', null, title, ' ', h('span', { class:'muted' }, `(${ids.length})`)),
        h('div', { class:'card', style:{ padding:0, overflow:'hidden' } },
          h('table', { class:'data' },
            h('thead', null, h('tr', null,
              h('th', null, 'Player'),
              h('th', null, 'Pos'),
              h('th', null, 'Team'),
              h('th', null, 'Age'),
              h('th', null, 'Category'),
              h('th', null, 'Tier'),
              h('th', { class:'right' }, 'Value'),
            )),
            h('tbody', null, ...ids.map(pid => {
              const sp = window.PLAYERS[pid];
              if (!sp) return h('tr', null, h('td', { colspan:7 }, h('span', { class:'muted' }, `Unknown ${pid}`)));
              const ranked = rankIndex().bySleeperId.get(pid) || rankIndex().byName.get(norm(sp.name));
              return h('tr', { onclick:()=>openPlayerDetail(sp.name) },
                h('td', null, h('div', { class:'name-cell' }, h('span', { class:'name' }, sp.name))),
                h('td', null, posChip(sp.pos)),
                h('td', null, teamChip(sp.team)),
                h('td', null, sp.age ?? ','),
                h('td', null, ranked ? pillCategory(ranked.category) : h('span', { class:'muted' }, ',')),
                h('td', null, ranked ? tierChip(ranked.tier, ranked.category) : h('span', { class:'muted' }, ',')),
                h('td', { class:'right tnum' }, ranked ? fmt.decimal(tierValue(ranked, lg),1) : h('span', { class:'muted' }, ',')),
              );
            }))
          )
        )
      ));
    }
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
    return h('div', { class:'buy-row', onclick: ()=>openPlayerDetail(b.player.name) },
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
      rows.push(h('div', { class:'pos-col-row' + (p.ranked && i < startableCount ? ' starter' : '') + (isDepth ? ' is-depth' : '') , onclick:()=>openPlayerDetail(sleeper.name), title: titleAttr },
        h('span', { class:'pos-col-rank tnum' }, realPos ? `${pos}${posIdx}` : `#${posIdx}`),
        h('span', { class:'pos-col-pname' }, sleeper.name),
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
    const pickValues = (window.STRATEGY && window.STRATEGY.pick_values_1qb) || {};
    const sfBumps = (window.STRATEGY && window.STRATEGY.pick_sf_premium) || {};
    const nextYear = String(new Date().getFullYear() + 1);
    const pickBuckets = [
      ['future_1.early', `${nextYear} Early 1st`],
      ['future_1.mid',   `${nextYear} Mid 1st`],
      ['future_1.late',  `${nextYear} Late 1st`],
      ['future_2.early', `${nextYear} Early 2nd`],
      ['future_2.mid',   `${nextYear} Mid 2nd`],
      ['future_2.late',  `${nextYear} Late 2nd`],
    ];
    const pickAssets = pickBuckets.map(([key, label]) => {
      let v = pickValues[key] || 5;
      if (lg.is_superflex) v += (sfBumps[key.replace('future_','') ] || 0);
      // ktcValue-scale for tierValue compatibility (KTC range ~0-10000).
      return {
        name: label, pos: 'PICK', team: nextYear, age: null,
        category: 'pick', tier: '-', ktcValue: Math.round(v * 100),
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
    const uptier = [];
    const surplusForUptier = Object.entries(surplus).filter(([_, info]) => info.surplus >= 1);
    const cornerstoneTargets = idx.all.filter(c =>
      c.category === 'cornerstone' && !isOwnedByMe(c) && isStartable(c, lg)
      && !idpPositions.has(c.pos)  // uptier targets are always offensive cornerstones
    );
    for (const [pos, info] of surplusForUptier) {
      const sortedStartable = info.startablePlayers
        .map(rp => ({ rp, val: tierValue(rp.ranked, lg) }))
        .sort((a,b) => b.val - a.val);
      if (sortedStartable.length < 2) continue;
      // Use my 1st + 2nd surplus startable as the package
      const a = sortedStartable[0], b = sortedStartable[1];
      const giveVal = a.val + b.val;
      const fits = cornerstoneTargets.filter(t => {
        const tv = tierValue(t, lg);
        return tv <= giveVal * 1.10 && tv >= giveVal * 0.75;
      }).slice(0, 3);
      if (fits.length) uptier.push({ give: [a.rp.ranked, b.rp.ranked], options: fits.map(t => ({ get:[t] })) });
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
      onclick:()=>openPlayerDetail(p.name),
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
      const row = h('div', { class:'dc-row' },
        h('div', { class:'dc-year' },
          yr,
          y.in_progress ? h('div', { class:'tip', style:{ fontSize:'.7rem', color:'var(--amber)' } }, 'DRAFTING') : null,
        ),
        h('div', { class:'dc-picks' },
          ...defaultRounds.map(rd => h('span', { class:'pick-chip', title: y.in_progress
            ? `Your default R${rd} pick (current draft is in progress; the slot may already be used live)`
            : `Your default R${rd} pick` }, `${rd}`)),
          ...y.mine.map(p => h('span', { class:'pick-chip acquired', title:`Acquired R${p.round} from roster ${p.from}` }, `${p.round}+`)),
          ...y.lost.map(p => h('span', { class:'pick-chip lost', title:`Traded away R${p.round} to roster ${p.to}` }, `${p.round}×`)),
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
        h('h1', { class:'page-title' }, 'YouTuber Sources'),
        h('p', { class:'page-sub' }, 'Choose which analysts inform your aggregated rankings. Toggle individual videos within each source.')
      )
    ));

    const grid = h('div', { class:'card-grid cols-2' });
    for (const src of getAllSources()) {
      grid.appendChild(renderSourceCard(src));
    }
    main.appendChild(grid);

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
        ensureSourceDefaults(); saveSettings(); invalidateRankIndex(); viewSources();
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
      h('div', { class:'card', style:{ borderLeft:'4px solid var(--accent)' } },
        h('div', { class:'tip' }, 'SIDE A'),
        h('div', { class:'stat-num' }, a.team_name),
        h('div', { class:'stat-label' }, a.owner_name + (a.is_me?' · YOU':'')),
        h('div', { style:{ marginTop:'8px', fontSize:'1.4rem', fontWeight:700 } }, fmt.decimal(aS,1), h('span', { class:'tip' }, ' strength')),
      ),
      h('div', { class:'card', style:{ borderLeft:'4px solid var(--blue)' } },
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
        ...csA.map(p => h('div', { class:'pos-col-row', onclick: ()=>openPlayerDetail(p.sleeper.name) },
          h('div', { class:'pos-col-name' }, posChip(p.sleeper.pos), tierChip(p.ranked.tier, p.ranked.category), h('span', null, p.sleeper.name)),
          h('span', { class:'tnum' }, fmt.decimal(tierValue(p.ranked, lg), 1))
        ))
      ),
      h('div', { class:'card' }, h('div', { class:'card-title' }, `${b.team_name} (${csB.length})`),
        ...csB.map(p => h('div', { class:'pos-col-row', onclick: ()=>openPlayerDetail(p.sleeper.name) },
          h('div', { class:'pos-col-name' }, posChip(p.sleeper.pos), tierChip(p.ranked.tier, p.ranked.category), h('span', null, p.sleeper.name)),
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
  function viewTrade(leagueIdArg) {
    const main = $('#main');
    main.innerHTML = '';
    // Default league: first one with a "me" roster
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

    main.appendChild(h('div', { class:'page-header' },
      h('div', null,
        h('h1', { class:'page-title' }, 'Trade Calculator'),
        h('p', { class:'page-sub' }, 'Build a trade. Pick players to send and receive, see the value swap and post-trade strength change.')
      ),
      h('div', { class:'page-actions' },
        leagueSelector(lg.id, (newId) => { TRADE_STATE.leagueId = newId; TRADE_STATE.sideA = {rosterId:null, picks:new Set()}; TRADE_STATE.sideB = {rosterId:null, picks:new Set()}; viewTrade(newId); navigate(`#trade/${newId}`); })
      )
    ));

    // Build sides
    const sideARoster = lg.rosters.find(r => r.roster_id === TRADE_STATE.sideA.rosterId);
    const sideBRoster = lg.rosters.find(r => r.roster_id === TRADE_STATE.sideB.rosterId);

    const grid = h('div', { class:'trade-calc' });
    grid.appendChild(buildTradeSide('A', lg, TRADE_STATE.sideA, sideARoster));
    grid.appendChild(tradeMiddleSummary(lg));
    grid.appendChild(buildTradeSide('B', lg, TRADE_STATE.sideB, sideBRoster));
    main.appendChild(grid);

    main.appendChild(h('div', { class:'tip', style:{ marginTop:'12px' } }, 'Tip: clicking a player toggles them in/out of the trade. Values use your enabled rankings + format multipliers.'));
  }
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
  // Estimate origin roster's expected draft slot (1=earliest, 12=latest) from
  // current league strength rank. Weakest team picks first in the rookie draft.
  function originSlot(originRosterId, league) {
    if (!originRosterId) return Math.ceil((league.total_rosters || 10) / 2);
    const all = league.rosters.map(r => ({
      id: r.roster_id, s: computeRosterStrength(r, league).total
    })).sort((a, b) => a.s - b.s); // weakest first
    const idx = all.findIndex(r => r.id === originRosterId);
    return idx >= 0 ? idx + 1 : Math.ceil((league.total_rosters || 10) / 2);
  }
  function pickValue(season, round, originRosterId, league) {
    const S = window.STRATEGY;
    if (!S) return 0;
    const slot = originSlot(originRosterId, league);
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
  function rosterOwnedPicks(rosterId, league) {
    const result = [];
    const traded = league.traded_picks || [];
    const currentYear = String(new Date().getFullYear());
    const seasons = [currentYear, String(parseInt(currentYear) + 1)];
    const rounds = [1, 2, 3, 4];
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
          result.push({ season, round, originRosterId: rosterId, label: `${season} R${round}` });
        }
      }
    }
    // Acquired picks
    for (const tp of traded) {
      if (tp.owner_id !== rosterId) continue;
      if (!seasons.includes(tp.season)) continue;
      result.push({ season: tp.season, round: tp.round, originRosterId: tp.roster_id, label: `${tp.season} R${tp.round} (from R${tp.roster_id})` });
    }
    // Compute values + sort
    for (const p of result) p.value = pickValue(p.season, p.round, p.originRosterId, league);
    result.sort((a, b) => b.value - a.value);
    return result;
  }

  function buildTradeSide(label, lg, state, roster) {
    const card = h('div', { class:'trade-side-card' });
    const rosterSel = h('select', { onchange: (e) => { state.rosterId = parseInt(e.target.value, 10); state.picks = new Set(); viewTrade(lg.id); } });
    for (const r of lg.rosters) {
      rosterSel.appendChild(h('option', { value:r.roster_id, selected: r.roster_id===state.rosterId?'':null }, `${r.team_name} (${r.owner_name})${r.is_me?' ★':''}`));
    }
    card.appendChild(h('div', { class:'trade-side-head' },
      h('div', { class:'tip' }, label === 'A' ? 'YOU SEND' : 'YOU RECEIVE'),
      rosterSel
    ));

    // Selected pile: handles both player_ids (numeric strings) and pick keys
    const ownedPicks = roster ? rosterOwnedPicks(roster.roster_id, lg) : [];
    const pickByKey = new Map(ownedPicks.map(p => [pickKey(p.season, p.round, p.originRosterId), p]));
    const selected = Array.from(state.picks).map(k => {
      if (isPickKey(k)) {
        const meta = pickByKey.get(k) || (() => {
          const { season, round, originRosterId } = parsePickKey(k);
          return { season, round, originRosterId, label: `${season} R${round}`, value: pickValue(season, round, originRosterId, lg) };
        })();
        return { kind: 'pick', key: k, meta };
      }
      const sleeper = window.PLAYERS[k];
      const ranked = sleeper ? (rankIndex().bySleeperId.get(k) || rankIndex().byName.get(norm(sleeper.name))) : null;
      return { kind: 'player', key: k, sleeper, ranked, value: ranked ? tierValue(ranked, lg) : 0 };
    });
    const totalVal = selected.reduce((s, x) => s + (x.kind === 'pick' ? x.meta.value : x.value || 0), 0);

    card.appendChild(h('div', { class:'trade-pile' },
      h('div', { class:'card-title' }, h('span', null, 'In Trade'), h('span', { class:'tnum', style:{ float:'right' } }, fmt.decimal(totalVal,1))),
      selected.length
        ? h('div', null, ...selected.map(s => h('div', { class:'trade-pile-row', onclick:()=>{ state.picks.delete(s.key); viewTrade(lg.id); } },
            s.kind === 'pick'
              ? h('div', { class:'name-cell' },
                  h('span', { class:'badge', style:{ background:'rgba(96,165,250,.15)', color:'var(--blue)', borderColor:'rgba(96,165,250,.4)' } }, 'PICK'),
                  h('span', { class:'name' }, s.meta.label),
                )
              : h('div', { class:'name-cell' },
                  s.sleeper ? posChip(s.sleeper.pos) : null,
                  s.sleeper ? teamChip(s.sleeper.team) : null,
                  h('span', { class:'name' }, s.sleeper ? s.sleeper.name : `[${s.key}]`),
                ),
            h('span', { class:'tnum' }, fmt.decimal(s.kind === 'pick' ? s.meta.value : s.value, 1)),
            h('span', { class:'tip', style:{ marginLeft:'8px' } }, '×')
          )))
        : h('div', { class:'tip' }, 'Click players or picks below to add.')
    ));

    // Player pool
    if (roster) {
      const arr = (roster.players || []).map(pid => {
        const sleeper = window.PLAYERS[pid];
        const ranked = sleeper ? (rankIndex().bySleeperId.get(pid) || rankIndex().byName.get(norm(sleeper.name))) : null;
        return { pid, sleeper, ranked, value: ranked ? tierValue(ranked, lg) : 0 };
      }).sort((a,b) => b.value - a.value);
      card.appendChild(h('div', { class:'trade-pool' },
        h('div', { class:'card-title' }, `${roster.team_name} Roster`),
        ...arr.map(p => h('div', {
          class:'trade-pool-row' + (state.picks.has(p.pid) ? ' selected' : ''),
          onclick: () => { if (state.picks.has(p.pid)) state.picks.delete(p.pid); else state.picks.add(p.pid); viewTrade(lg.id); }
        },
          h('div', { class:'name-cell' },
            p.sleeper ? posChip(p.sleeper.pos) : null,
            p.sleeper ? teamChip(p.sleeper.team) : null,
            h('span', { class:'name' }, p.sleeper ? p.sleeper.name : `[${p.pid}]`),
            p.ranked ? tierChip(p.ranked.tier, p.ranked.category) : null
          ),
          p.value ? h('span', { class:'tnum' }, fmt.decimal(p.value,1)) : h('span', { class:'muted' }, '.')
        ))
      ));

      // Picks pool
      if (ownedPicks.length) {
        card.appendChild(h('div', { class:'trade-pool', style:{ marginTop:'12px' } },
          h('div', { class:'card-title' }, `${roster.team_name} Picks`),
          ...ownedPicks.map(p => {
            const k = pickKey(p.season, p.round, p.originRosterId);
            return h('div', {
              class: 'trade-pool-row' + (state.picks.has(k) ? ' selected' : ''),
              onclick: () => { if (state.picks.has(k)) state.picks.delete(k); else state.picks.add(k); viewTrade(lg.id); }
            },
              h('div', { class:'name-cell' },
                h('span', { class:'badge', style:{ background:'rgba(96,165,250,.15)', color:'var(--blue)', borderColor:'rgba(96,165,250,.4)' } }, 'PICK'),
                h('span', { class:'name' }, p.label),
              ),
              h('span', { class:'tnum' }, fmt.decimal(p.value, 1)),
            );
          })
        ));
      }
    }
    return card;
  }
  function tradeMiddleSummary(lg) {
    const valOf = (state) => Array.from(state.picks).reduce((s, k) => {
      if (isPickKey(k)) {
        const { season, round, originRosterId } = parsePickKey(k);
        return s + pickValue(season, round, originRosterId, lg);
      }
      const sleeper = window.PLAYERS[k]; if (!sleeper) return s;
      const r = rankIndex().bySleeperId.get(k) || rankIndex().byName.get(norm(sleeper.name));
      return s + (r ? tierValue(r, lg) : 0);
    }, 0);
    const aVal = valOf(TRADE_STATE.sideA);
    const bVal = valOf(TRADE_STATE.sideB);
    const delta = bVal - aVal;
    const fairness = (Math.min(aVal, bVal) / Math.max(aVal, bVal, 1)) * 100;
    const verdict = !TRADE_STATE.sideA.picks.size || !TRADE_STATE.sideB.picks.size
      ? { label:'INCOMPLETE', color:'var(--fg-3)' }
      : fairness >= 90 ? { label:'FAIR', color:'var(--green)' }
      : fairness >= 75 ? { label:'CLOSE', color:'var(--amber)' }
      : { label: delta > 0 ? 'WIN FOR A' : 'WIN FOR B', color:'var(--red)' };
    // Post-trade strength delta
    const postA = simulateRosterStrength(lg, TRADE_STATE.sideA.rosterId, TRADE_STATE.sideA.picks, TRADE_STATE.sideB.picks);
    const postB = simulateRosterStrength(lg, TRADE_STATE.sideB.rosterId, TRADE_STATE.sideB.picks, TRADE_STATE.sideA.picks);
    return h('div', { class:'trade-middle' },
      h('div', { class:'trade-middle-card' },
        h('div', { class:'tip' }, 'Total Value'),
        h('div', { style:{ display:'flex', justifyContent:'space-between', fontSize:'1.1rem', fontWeight:700, marginTop:'4px' } },
          h('span', { class:'tnum' }, fmt.decimal(aVal,1)),
          h('span', { style:{color:'var(--fg-3)'} }, '⇄'),
          h('span', { class:'tnum' }, fmt.decimal(bVal,1)),
        ),
        h('div', { style:{ marginTop:'14px', textAlign:'center' } },
          h('div', { class:'tip' }, 'Verdict'),
          h('div', { class:'verdict', style:{ color: verdict.color } }, verdict.label),
          h('div', { class:'tip' }, fairness.toFixed(0) + '% fairness')
        ),
        h('div', { style:{ marginTop:'14px' } },
          h('div', { class:'tip', style:{ marginBottom:'4px' } }, 'Post-Trade Strength Δ'),
          h('div', { style:{ display:'flex', justifyContent:'space-between' } },
            h('span', { class:'tnum', style:{ color: postA.delta >= 0 ? 'var(--green)' : 'var(--red)' } }, (postA.delta >= 0 ? '+' : '') + fmt.decimal(postA.delta, 1)),
            h('span', { class:'tnum', style:{ color: postB.delta >= 0 ? 'var(--green)' : 'var(--red)' } }, (postB.delta >= 0 ? '+' : '') + fmt.decimal(postB.delta, 1)),
          )
        ),
        h('div', { style:{ marginTop:'14px' } },
          h('button', { class:'ghost', style:{ width:'100%' }, onclick: () => {
            TRADE_STATE.sideA.picks = new Set(); TRADE_STATE.sideB.picks = new Set(); viewTrade(lg.id);
          }}, 'Reset Trade')
        )
      ),
    );
  }
  function simulateRosterStrength(lg, rosterId, removeIds, addIds) {
    const roster = lg.rosters.find(r => r.roster_id === rosterId);
    if (!roster) return { before: 0, after: 0, delta: 0 };
    const before = computeRosterStrength(roster, lg).total;
    const players = new Set(roster.players || []);
    for (const id of removeIds) players.delete(id);
    for (const id of addIds) players.add(id);
    const synthetic = Object.assign({}, roster, { players: Array.from(players) });
    const after = computeRosterStrength(synthetic, lg).total;
    return { before, after, delta: after - before };
  }

  // ============================================================
  // ROUTE: Action Center
  // Aggregates the highest-priority trade actions across all leagues
  // ============================================================
  function viewActionCenter() {
    const main = $('#main');
    main.innerHTML = '';
    main.appendChild(h('div', { class:'page-header' },
      h('div', null,
        h('h1', { class:'page-title' }, 'Action Center'),
        h('p', { class:'page-sub' }, 'Trade and roster moves to take this week, ranked by impact across all your leagues.')
      )
    ));

    // Build action queue
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
            cta: { label: 'See Positional Targets', href: `#rankings` },
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
    }

    actions.sort((a, b) => a.urgency - b.urgency);

    if (!actions.length) {
      main.appendChild(h('div', { class:'empty' }, 'No actionable items detected. Roster is in a stable state.'));
      return;
    }

    main.appendChild(h('div', { style:{ display:'grid', gap:'10px' } },
      ...actions.map(a => h('div', { class:'card', style:{ borderLeft:`3px solid ${a.color}`, padding:'14px 18px' } },
        h('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'baseline' } },
          h('div', { class:'name', style:{ fontSize:'1rem', fontWeight:600, color:'var(--fg-0)' } }, a.title),
          h('span', { class:'tip' }, a.league),
        ),
        h('div', { style:{ marginTop:'4px', color:'var(--fg-1)' } }, a.body),
        h('div', { style:{ marginTop:'10px', display:'flex', gap:'8px' } },
          h('a', { href: a.cta.href }, h('button', { class:'ghost' }, a.cta.label, ' →')),
        ),
      ))
    ));
    main.appendChild(h('div', { class:'tip', style:{ marginTop:'12px' } },
      `${actions.length} actions queued. Coaching tips and trade scenarios on each roster blueprint go deeper.`));
  }

  // ============================================================
  // ROUTE: Strategy / Playbook
  // ============================================================
  function viewStrategy() {
    const main = $('#main');
    main.innerHTML = '';
    main.appendChild(h('div', { class:'page-header' },
      h('div', null,
        h('h1', { class:'page-title' }, 'Strategy Playbook'),
        h('p', { class:'page-sub' }, 'Distilled rules from public dynasty content. The site evaluates these against your rosters to surface coaching tips. Sources at the bottom.')
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
      h('p', null, 'Each ranked player gets a tier value (S=100, A=85, etc.). Roster total = sum of all tier values.'),
      h('p', null, h('strong', null, 'Format multipliers:'),
        ' Superflex leagues apply a 1.40× position multiplier to QB values. IDP leagues apply 1.10× to LB values.'),
      h('p', null, 'Rankings are aggregated from all enabled sources. The first source that has a player wins (todo: weighted average).'),
    ));
    main.appendChild(h('div', { class:'card' },
      h('h3', null, 'Data'),
      h('p', null, 'League data pulled from the public Sleeper API on ', new Date().toISOString().slice(0,10), '. Refresh by re-running ',
        h('code', null, 'site/data/build_site_data.py'), '.'),
    ));
  }

  // ============================================================
  // Player detail modal
  // ============================================================
  function openPlayerDetail(name) {
    const idx = rankIndex();
    const ranked = idx.byName.get(norm(name));
    const sleeper = window.PLAYERS[sleeperIdFor(name) || ''];
    document.body.appendChild(playerModal(name, ranked, sleeper));
  }
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
    if (v == null || v === '' || isNaN(v)) return '—';
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

    // Recent seasons table
    const head = h('thead', null,
      h('tr', null,
        h('th', null, 'Year'),
        h('th', null, 'Tm'),
        ...cols.map(([label]) => h('th', { class:'right' }, label)),
      ),
    );
    const body = h('tbody', null,
      ...hist.recent.map(r => h('tr', null,
        h('td', { class:'tnum' }, r.year),
        h('td', { class:'muted' }, ''),
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

  function playerModal(name, ranked, sleeper) {
    const close = () => $$('.modal-backdrop').forEach(e => e.remove());
    const onBackdrop = (e) => { if (e.target === e.currentTarget) close(); };
    document.addEventListener('keydown', function esc(ev){ if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }});

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

    return h('div', { class:'modal-backdrop', onclick: onBackdrop },
      h('div', { class:'modal', style:{ position:'relative' } },
        h('button', { class:'close-btn', onclick: close, 'aria-label':'Close' }, '×'),
        h('h2', { style:{ marginTop:0, marginBottom:'4px' } }, name),
        h('div', { class:'row gap-4 wrap', style:{ marginBottom:'12px' } },
          ranked ? posChip(ranked.pos) : sleeper ? posChip(sleeper.pos) : null,
          ranked ? teamChip(ranked.team) : sleeper ? teamChip(sleeper.team) : null,
          (ranked?.age ?? sleeper?.age) ? h('span', { class:'muted' }, `age ${ranked?.age ?? sleeper?.age}`) : null,
          rookieBadge(ranked || {}),
          uncertainBadge(ranked || {}),
          depBadge(ranked || {}),
        ),
        ranked ? h('div', { class:'row gap-4', style:{ marginBottom:'12px' } },
          pillCategory(ranked.category), tierChip(ranked.tier, ranked.category),
          h('span', { class:'tip' }, `Tier value: ${tierValue(ranked, {})}`)
        ) : null,
        ranked?.note ? h('div', { class:'card', style:{ background:'var(--bg-2)', marginBottom:'12px' } },
          h('div', { class:'card-title' }, 'Source notes'),
          h('div', null, ranked.note),
          h('div', { class:'tip', style:{ marginTop:'6px' } }, `from ${ranked._src} / ${ranked._ranking}`)
        ) : null,
        sleeper ? h('div', { class:'card', style:{ background:'var(--bg-2)', marginBottom:'12px' } },
          h('div', { class:'card-title' }, 'Sleeper'),
          h('div', null, `${sleeper.pos} · ${sleeper.team || 'FA'}` + (sleeper.college ? ` · ${sleeper.college}` : '') + (sleeper.exp != null ? ` · exp ${sleeper.exp}` : '')),
          h('div', { class:'tip' }, `Sleeper id: ${sleeper.id}`)
        ) : h('div', { class:'tip' }, 'Not matched to a Sleeper player.'),
        ownerRows.length ? h('div', null,
          h('div', { class:'card-title', style:{ marginBottom:'6px' } }, 'Owned in your leagues'),
          h('table', { class:'data' },
            h('thead', null, h('tr', null,
              h('th', null, 'League'), h('th', null, 'Team'), h('th', null, 'Owner'), h('th', null, 'Slot')
            )),
            h('tbody', null, ...ownerRows.map(o => h('tr', { class: o.roster.is_me ? 'you' : '', onclick:()=>{ close(); navigate(`#roster/${o.league.id}/${o.roster.roster_id}`); } },
              h('td', null, o.league.short_name),
              h('td', null, o.roster.team_name, o.roster.is_me ? h('span', { class:'badge you', style:{ marginLeft:'6px' } }, 'YOU') : null),
              h('td', null, o.roster.owner_name),
              h('td', null, o.isStarter ? h('span', { class:'badge' }, 'STARTER') : o.isTaxi ? h('span', { class:'badge' }, 'TAXI') : o.isReserve ? h('span', { class:'badge' }, 'IR') : h('span', { class:'badge' }, 'BENCH')),
            )))
          )
        ) : null
      )
    );
  }

  // ============================================================
  // Router
  // ============================================================
  function navigate(hash) { location.hash = hash; }
  function route() {
    setActiveNav();
    const hash = location.hash || '#dashboard';
    const [path, ...rest] = hash.replace(/^#/, '').split('/');
    try {
      switch (path) {
        case 'dashboard':  return viewDashboard();
        case 'rankings':   return viewRankings();
        case 'players':    return viewAllPlayers();
        case 'leagues':    return viewLeagues();
        case 'league':     return viewLeague(rest[0]);
        case 'roster':     return viewRoster(rest[0], rest[1]);
        case 'trade':      return viewTrade(rest[0]);
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
    for (const lg of window.LEAGUES || []) {
      items.push({ kind:'league', label:lg.name, hint:`League · ${lg.is_superflex?'SF':lg.is_idp?'IDP':'1QB'}`, icon:'⚑', hash:`#league/${lg.id}` });
      for (const r of lg.rosters) {
        items.push({ kind:'roster', label:r.team_name, hint:`${r.owner_name} · ${lg.short_name}${r.is_me?' · YOU':''}`, icon:r.is_me?'★':'○', hash:`#roster/${lg.id}/${r.roster_id}` });
      }
    }
    for (const p of idx.all) {
      items.push({ kind:'ranked', label:p.name, hint:`${p.pos} · ${p.team} · ${window.CATEGORY_LABELS[p.category]} ${p.tier}`, icon:'★', name:p.name });
    }
    // Add some Sleeper players (limit to those rostered in any league for relevance)
    const rostered = new Set();
    for (const lg of window.LEAGUES || []) for (const r of lg.rosters) for (const pid of (r.players||[])) rostered.add(pid);
    for (const pid of rostered) {
      const sp = window.PLAYERS[pid]; if (!sp) continue;
      if (idx.bySleeperId.has(pid)) continue; // already added as ranked
      items.push({ kind:'player', label:sp.name, hint:`${sp.pos} · ${sp.team || 'FA'}`, icon:'·', name:sp.name });
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
          const labels = { route:'Pages', league:'Leagues', roster:'Rosters', ranked:'Ranked Players', player:'Players' };
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
      else if (it.name) openPlayerDetail(it.name);
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
    saveSettings();
    renderSidebar();
    window.addEventListener('hashchange', route);
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        openCmdK();
      }
    });
    route();
  }

  // Expose a couple things for console debugging
  window.__app = { state, rankIndex, computeRosterStrength, sleeperIdFor };

  document.addEventListener('DOMContentLoaded', boot);
})();
