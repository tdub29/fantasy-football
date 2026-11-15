/* Shared identity/scoring gate for every kicker consumer. Pure and testable. */
(function(root) {
  'use strict';
  const team = value => ({ LA:'LAR', STL:'LAR', SD:'LAC', OAK:'LV' })[String(value || '').toUpperCase()] || String(value || '').toUpperCase();
  function scoring(settings) {
    if (!settings || typeof settings !== 'object') return null;
    const allowed = new Set(['fgm','fgm_0_19','fgm_20_29','fgm_30_39','fgm_40_49','fgm_50p','xpm','fgmiss','xpmiss']);
    if (Object.entries(settings).some(([key, value]) => /^(fg|xp)/.test(key) && !allowed.has(key) && Number(value) !== 0)) return null;
    const get = key => Number(settings[key] || 0);
    const base = get('fgm');
    const made = ['fgm_0_19','fgm_20_29','fgm_30_39','fgm_40_49','fgm_50p','fgm_50p'].map(key => base + get(key));
    const value = { fg_made:made, pat_made:get('xpm'), fg_missed:get('fgmiss'), pat_missed:get('xpmiss') };
    return [...made,value.pat_made,value.fg_missed,value.pat_missed].every(Number.isFinite) ? value : null;
  }
  function matches(a, b) {
    return a && b && JSON.stringify(a.fg_made) === JSON.stringify(b.fg_made)
      && ['pat_made','fg_missed','pat_missed'].every(key => Number(a[key]) === Number(b[key]));
  }
  function valid(board, season, week, settings) {
    return !!(board?.schemaVersion === 2 && board.boardId && Number.isInteger(Number(season))
      && Number.isInteger(Number(week)) && Number(board.season) === Number(season)
      && Number(board.week) === Number(week) && matches(board.scoring, scoring(settings)));
  }
  function lookup(board, { season, week, settings, pid, playerTeam, resolveId }) {
    if (!valid(board, season, week, settings) || !playerTeam || !pid) return null;
    const found = (board.kickers || []).filter(k => (String(k.sleeperId || '') === String(pid)
      || String(resolveId?.(k.name) || '') === String(pid)) && team(k.team) === team(playerTeam));
    return found.length === 1 && found[0].exp != null && Number.isFinite(Number(found[0].exp)) ? found[0] : null;
  }
  root.KickerForecast = { team, scoring, matches, valid, lookup };
  if (typeof module !== 'undefined') module.exports = root.KickerForecast;
})(typeof window === 'undefined' ? globalThis : window);
