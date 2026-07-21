/* Shared PWA app-shell service worker (workspace baseline).
   Makes the static site installable + openable offline.

   Design: runtime caching, NO hardcoded file list. Caches every successful
   same-origin GET (index.html + css/ + js/ + data/*.js) as it happens.
   Cross-origin requests (the live Sleeper API) are passed straight through
   and are NEVER cached here — offline shows the last-rendered site with the
   baked rankings; live Sleeper data returns when back online.

   Bump the -vN suffix after a real change to force-refresh installed clients. */
const CACHE = "tiersheet-shell-v1";

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

  const network = fetch(request)
    .then((resp) => {
      if (resp.ok) {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
      }
      return resp;
    })
    .catch(() => caches.match(request));

  if (request.mode === "navigate") {
    event.respondWith(network.then((r) => r || caches.match(request)));
    return;
  }
  event.respondWith(caches.match(request).then((cached) => cached || network));
});
