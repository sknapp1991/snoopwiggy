/*
 * Verses Across service worker: read offline.
 * - Scripture and search files (/texts, /search), app code (/_next/static) and icons: served from the
 *   cache when there, refreshed in the background (stale-while-revalidate).
 * - Pages: network first; when offline, the last copy of that page (so chapters you've opened, and the
 *   app itself, keep working without a connection).
 * - Never cached: /api (AI, audio streaming), recordings (.mp3), anything from other sites.
 * Bump VERSION to drop old caches.
 */
const VERSION = "v1";
const DATA = `va-data-${VERSION}`;
const PAGES = `va-pages-${VERSION}`;
const MAX_PAGES = 80;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith("va-") && k !== DATA && k !== PAGES) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

const isData = (p) =>
  p.startsWith("/texts/") || p.startsWith("/search/") || p.startsWith("/_next/static/") || /^\/(icon|apple-icon|favicon)/.test(p) || p === "/manifest.webmanifest";

async function staleWhileRevalidate(event) {
  const req = event.request;
  const cache = await caches.open(DATA);
  const hit = await cache.match(req);
  const net = fetch(req)
    .then((res) => {
      if (res.ok && res.status === 200) return cache.put(req, res.clone()).then(() => res);
      return res;
    })
    .catch(() => null);
  if (hit) event.waitUntil(net); // let the background refresh finish even if the page is done with us
  return hit || (await net) || new Response("Offline", { status: 503 });
}

/**
 * Page / router payload: network first, else the cached copy. The key drops Next's ?_rsc= hash; the
 * router payload gets its own key via a query flag (the Cache API ignores URL fragments, so "#rsc"
 * would collide with the HTML entry).
 */
async function networkFirst(req, url) {
  const key = new URL(url);
  key.searchParams.delete("_rsc");
  if (req.headers.get("RSC")) key.searchParams.set("_rsc", "1");
  const cacheKey = key.href;
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(req);
    if (res.ok && res.status === 200) {
      await cache.put(cacheKey, res.clone());
      const keys = await cache.keys();
      for (const k of keys.slice(0, Math.max(0, keys.length - MAX_PAGES))) await cache.delete(k);
    }
    return res;
  } catch (e) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const p = url.pathname;
  if (p.startsWith("/api/") || p.endsWith(".mp3") || p === "/sw.js") return;
  if (isData(p)) return event.respondWith(staleWhileRevalidate(event));
  // Prefetches carry a partial payload: never cache (or serve) them as the page.
  if (req.headers.get("Next-Router-Prefetch") || req.headers.get("Next-Router-Segment-Prefetch")) return;
  if (req.mode === "navigate" || req.headers.get("RSC")) return event.respondWith(networkFirst(req, url));
});
