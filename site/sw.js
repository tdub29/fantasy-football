/* Shared PWA app-shell service worker (workspace baseline).
   Makes the static site installable + openable offline.

   Design: runtime caching, NO hardcoded file list. Caches every successful
   same-origin GET (index.html + css/ + js/ + data/*.js) as it happens.
   Cross-origin requests (the live Sleeper API) are passed straight through
   and are NEVER cached here — offline shows the last-rendered site with the
   baked rankings; live Sleeper data returns when back online.

   Bump the -vN suffix after a real change to force-refresh installed clients. */
const CACHE = "fantasyhub-shell-v7";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // NETWORK-FIRST for everything same-origin: always serve fresh code + data when
  // online, and fall back to the cache only when the network fails (offline). The
  // old handler was cache-first for data/*.js, so an updated file (e.g. a player's
  // new team) kept showing the stale cached copy until a second load. Cache is
  // still populated on every successful fetch, so offline still works.
  //
  // `cache: "no-cache"` is load-bearing, not belt-and-suspenders. Network-first
  // alone still lost: fetch() consults the browser HTTP cache first, and a plain
  // static server (python -m http.server, and Pages for that matter) that sends
  // Last-Modified without Cache-Control lets Chrome serve a heuristically-cached
  // copy with no request at all. A CSS edit then simply does not appear, which
  // reads as the new markup being broken rather than the old stylesheet winning.
  // Shipped exactly that way once: the draft board rendered as one bare column.
  event.respondWith(
    fetch(request, { cache: "no-cache" })
      .then((resp) => {
        if (resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return resp;
      })
      .catch(() => caches.match(request)),
  );
});
