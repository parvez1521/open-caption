/**
 * Captionit service worker — minimal, honest offline behaviour.
 *
 * - Versioned static assets (/_next/static/*, brand/looks/images/fonts,
 *   motion avatars): cache-first. These are content-hashed by Next, so a
 *   cached copy can never be stale.
 * - Page navigations: network-first. On failure the last cached copy of the
 *   same page (or the home page) is served; if nothing is cached, a short
 *   honest offline page is returned — it says what works offline and what
 *   needs a connection, and never pretends the app is fully usable offline.
 * - Everything else (API calls, cross-origin): network only, never cached.
 *   Transcription models are downloaded on demand by the app and are not
 *   cached here either: the first transcription needs a connection.
 *
 * The worker is a static file (public/sw.js) so it runs with no build step;
 * its behaviour is covered by the node harness test in
 * src/features/pwa/__tests__/serviceWorker.test.ts.
 */

/* eslint-disable no-restricted-globals */

const CACHE_VERSION = "captionit-v1";
const STATIC_CACHE = `captionit-static-${CACHE_VERSION}`;
const PAGE_CACHE = `captionit-pages-${CACHE_VERSION}`;

/** Same-origin paths whose responses are immutable and safe to cache. */
const STATIC_PREFIXES = [
  "/_next/static/",
  "/brand/",
  "/looks/",
  "/images/",
  "/fonts/",
  "/motion-avatars/",
];

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Captionit — you're offline</title><style>body{margin:0;background:#141412;color:#FFFFEB;font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}main{max-width:420px;text-align:center}h1{font-size:22px;margin:0 0 12px}p{color:rgba(255,255,235,.7);line-height:1.6;margin:0 0 12px}a{color:#34D399}</style></head><body><main><h1>You're offline</h1><p>Captionit needs a connection to load. Your projects stay on this device, and transcription downloads its model the first time you use it — that needs a connection too.</p><p><a href="/">Try again when you're back online</a></p></main></body></html>`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== PAGE_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network first, cached page (or the home page) on failure,
  // honest offline page when nothing is cached at all.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(PAGE_CACHE);
            await cache.put(request, response.clone());
          }
          return response;
        } catch {
          const cached =
            (await caches.match(request, { ignoreSearch: true })) ??
            (await caches.match("/"));
          if (cached) return cached;
          return new Response(OFFLINE_HTML, {
            status: 503,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
      })(),
    );
    return;
  }

  // Versioned static assets: cache-first.
  if (STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(STATIC_CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      })(),
    );
  }
  // Anything else (API routes, etc.): network only — never cached.
});
