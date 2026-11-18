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
  // Near match: same made-FG bands through 50-59 and same PAT values, with only rare
  // edge bands different (60+ yard makes, distance-banded misses within 1 point).
  // The board is reused as-is and flagged approximate; the gap is far under the
  // board's 0.5-point practical tie threshold.
  function near(board, season, week, settings) {
    if (!board || board.schemaVersion !== 2 || !board.boardId || !settings) return false;
    if (Number(board.season) !== Number(season) || Number(board.week) !== Number(week)) return false;
    const get = key => Number(settings[key] || 0);
    const base = get('fgm');
    const band = (...keys) => base + keys.reduce((s, k) => s + get(k), 0);
    const made = [band('fgm_0_19'), band('fgm_20_29'), band('fgm_30_39'), band('fgm_40_49'), band('fgm_50p', 'fgm_50_59')];
    const b = board.scoring;
    if (!made.every((v, i) => v === Number(b.fg_made[i]))) return false;
    if (get('xpm') !== Number(b.pat_made) || get('xpmiss') !== Number(b.pat_missed)) return false;
    const missKeys = Object.keys(settings).filter(k => /^fgmiss/.test(k) && Number(settings[k]) !== 0);
    if (!missKeys.length && get('fgmiss') === 0) return false;
    const missVals = missKeys.map(k => get(k) + (k === 'fgmiss' ? 0 : get('fgmiss')));
    return missVals.every(v => Math.abs(v - Number(b.fg_missed)) <= 1);
  }
  function lookup(board, { season, week, settings, pid, playerTeam, resolveId, allowNear }) {
    const exact = valid(board, season, week, settings);
    const approx = !exact && allowNear && near(board, season, week, settings);
    if ((!exact && !approx) || !playerTeam || !pid) return null;
    const found = (board.kickers || []).filter(k => (String(k.sleeperId || '') === String(pid)
      || String(resolveId?.(k.name) || '') === String(pid)) && team(k.team) === team(playerTeam));
    if (!(found.length === 1 && found[0].exp != null && Number.isFinite(Number(found[0].exp)))) return null;
    return approx ? Object.assign({}, found[0], { approx: true }) : found[0];
  }
  root.KickerForecast = { team, scoring, matches, valid, near, lookup };
  if (typeof module !== 'undefined') module.exports = root.KickerForecast;
})(typeof window === 'undefined' ? globalThis : window);
