// verify-app fixture: connect the baked Sleeper user before account.js reads
// storage, so routes past the onboarding gate are reachable. schedule.js loads
// after leagues.js and before account.js, so its assignment is the seed point.
(() => {
  // A live account refresh would swap the baked leagues for whatever the real
  // user has today, so account lookups fail as offline and the snapshot stays.
  const fetch0 = window.fetch;
  window.fetch = (u, o) => /api\.sleeper\.app\/v1\/user\//.test(String(u?.url || u))
    ? Promise.reject(new TypeError('verify fixture: offline')) : fetch0(u, o);
  let sched;
  Object.defineProperty(window, 'FANTASY_SCHEDULE', { configurable: true, get: () => sched, set(v) {
    sched = v;
    const uid = window.MY_USER_ID, lg = window.LEAGUES || [];
    if (!uid || !lg.length || localStorage.getItem('ff-account-v1')) return;
    const season = String(lg[0].season);
    const user = { user_id: String(uid), username: window.MY_USERNAME, display_name: window.MY_USERNAME };
    const leagues = lg.filter(l => !l.platform || l.platform === 'sleeper');
    const schedule = { leagues: Object.fromEntries(leagues.filter(l => v?.leagues?.[l.id]).map(l => [l.id, v.leagues[l.id]])) };
    localStorage.setItem('ff-account-v1', JSON.stringify({ ...user, season }));
    localStorage.setItem(`ff-account-snap-v2::${uid}::${season}`, JSON.stringify(
      { version: 2, user, season, week: null, leagues, schedule, failed: [], syncedAt: Date.now() }));
  } });
})();
