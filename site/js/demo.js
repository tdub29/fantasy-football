// Demo mode for screenshots: open index.html?demo. Swaps in the fictional league from
// data/demo-league.js behind a separate storage namespace, so the real account, profile and
// leagues are never read or written. ?demo=reset wipes the demo namespace; drop ?demo to leave.
// Loaded after the data scripts and before account.js, which is where the account is read.
(() => {
  const q = new URLSearchParams(location.search);
  if (!q.has('demo')) return;
  const PREFIX = 'ff-demo::';
  const real = window.localStorage;
  // Reset wipes the demo namespace and carries on in demo mode. No navigation: a reload
  // would let the rest of this parse run against the real storage before the shim exists.
  if (q.get('demo') === 'reset') {
    for (let i = real.length - 1; i >= 0; i--) { const k = real.key(i); if (k && k.startsWith(PREFIX)) real.removeItem(k); }
    history.replaceState(null, '', location.pathname + '?demo' + location.hash);
  }
  window.DEMO_MODE = true;
  const keys = () => { const out = []; for (let i = 0; i < real.length; i++) { const k = real.key(i); if (k && k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length)); } return out; };
  const store = {
    getItem: k => real.getItem(PREFIX + k),
    setItem: (k, v) => real.setItem(PREFIX + k, String(v)),
    removeItem: k => real.removeItem(PREFIX + k),
    clear: () => keys().forEach(k => real.removeItem(PREFIX + k)),
    key: i => keys()[i] ?? null,
    get length() { return keys().length; },
  };
  Object.defineProperty(window, 'localStorage', { configurable: true, get: () => store });

  // No live account, league or synced-profile calls: the demo league exists nowhere but this file.
  const fetch0 = window.fetch;
  window.fetch = (u, o) => /api\.sleeper\.app\/v1\/(user|league|draft)\/|espn\.com\/|\/ff\/api\//.test(String(u?.url || u))
    ? Promise.reject(new TypeError('demo mode: offline')) : fetch0(u, o);

  document.write('<script src="data/demo-league.js"></script>');
  document.write(`<script>(() => {
    const D = window.DEMO, uid = D.user.user_id, season = String(D.league.season);
    window.LEAGUES = [D.league]; window.MY_USER_ID = uid; window.MY_USERNAME = D.user.username;
    window.FANTASY_SCHEDULE = { leagues: { [D.league.id]: D.schedule } };
    // Rewritten every load so a rebuilt demo-league.js always shows; demo prefs persist.
    localStorage.setItem('ff-account-v1', JSON.stringify({ ...D.user, season }));
    localStorage.setItem('ff-account-snap-v2::' + uid + '::' + season, JSON.stringify({ version: 2, user: D.user, season,
      week: null, leagues: [D.league], schedule: window.FANTASY_SCHEDULE, failed: [], syncedAt: Date.now() }));
    document.documentElement.classList.add('demo-mode');
  })();<\/script>`);
  // Says so on every screen: the league, teams, managers and records are invented.
  document.addEventListener('DOMContentLoaded', () => {
    const b = document.createElement('a');
    b.className = 'demo-badge'; b.href = '?demo=reset' + location.hash;
    b.title = 'Demo league: real NFL players, fictional league, teams, managers and records. Click to reset the demo.';
    b.textContent = 'Demo league';
    document.body.appendChild(b);
  });
})();
