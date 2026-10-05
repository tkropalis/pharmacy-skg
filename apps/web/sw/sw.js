/*
 * Service worker. Hand-written; integrations/service-worker.ts copies it to /sw.js at build
 * time, filling in the two placeholders below:
 *   - BUILD_VERSION: a hash of every precached file, so each build that changes anything gets
 *     its own precache, and an unchanged build does not trigger an update;
 *   - PRECACHE_URLS: the app shell (all pages of both locales, assets, icons, manifest).
 *
 * Strategies:
 *   - app shell: precached; pages are network-first with a short timeout, falling back to the
 *     precached copy, so online users always see the latest page and offline users see the
 *     shell; hashed assets and icons come from the precache;
 *   - /data/**: network-first, falling back to the last copy (for offline use);
 *   - tiles.openfreemap.org: cache-first, capped at TILE_LIMIT entries;
 *   - everything else (the report API, analytics): untouched.
 *
 * A new version installs, takes over immediately (skipWaiting + clients.claim) and deletes
 * the old precache; the page reloads once when control changes (src/lib/pwa.ts).
 */
const BUILD_VERSION = '__BUILD_VERSION__';
const PRECACHE_URLS = ['__PRECACHE_URLS__'];

const PRECACHE = `precache-${BUILD_VERSION}`;
const DATA_CACHE = 'data-v1';
const TILE_CACHE = 'tiles-v1';
const TILE_HOST = 'tiles.openfreemap.org';
const TILE_LIMIT = 500;
const NAVIGATION_TIMEOUT_MS = 4000;
const DATA_TIMEOUT_MS = 6000;

const PRECACHED = new Set(PRECACHE_URLS);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      // `reload` skips the HTTP cache, so a new version never precaches stale files.
      await cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('precache-') && name !== PRECACHE) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/data/')) {
      event.respondWith(networkFirst(event, DATA_CACHE, DATA_TIMEOUT_MS));
    } else if (request.mode === 'navigate') {
      event.respondWith(navigate(event, url));
    } else if (PRECACHED.has(url.pathname)) {
      event.respondWith(fromPrecache(request));
    }
    return;
  }

  if (url.hostname === TILE_HOST) event.respondWith(tiles(event, url));
});

function timeout(ms) {
  let timer;
  const promise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return { promise, cancel: () => clearTimeout(timer) };
}

/** Network first; after `ms` (or on failure) the cached copy, if there is one. */
async function networkFirst(event, cacheName, ms, cacheKey = event.request) {
  const cache = await caches.open(cacheName);
  const network = fetch(event.request).then((response) => {
    // A 404 (an unpublished date) is passed on, never cached over a good copy.
    if (response.ok) event.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  });
  network.catch(() => {});
  const limit = timeout(ms);
  try {
    return await Promise.race([network, limit.promise]);
  } catch {
    const cached = await cache.match(cacheKey);
    // No copy: wait for the network (this rejects if it failed, which is a normal offline error).
    return cached ?? network;
  } finally {
    limit.cancel();
  }
}

async function navigate(event, url) {
  const key = PRECACHED.has(url.pathname) ? url.pathname : null;
  if (key !== null) {
    const response = await networkFirst(event, PRECACHE, NAVIGATION_TIMEOUT_MS, key);
    return response;
  }
  try {
    return await fetch(event.request);
  } catch {
    // Offline on a page that is not in the shell (a query-string or unknown path): the home
    // page of the locale, which holds the app.
    const home = url.pathname.startsWith('/en/') ? '/en/' : '/';
    const cache = await caches.open(PRECACHE);
    return (await cache.match(home)) ?? Response.error();
  }
}

async function fromPrecache(request) {
  const cache = await caches.open(PRECACHE);
  const cached = await cache.match(new URL(request.url).pathname);
  return cached ?? fetch(request);
}

async function tiles(event, url) {
  const { request } = event;
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(request);
  const isStyle = url.pathname.startsWith('/styles/');
  const refresh = () =>
    fetch(request).then((response) => {
      if (response.ok) {
        event.waitUntil(cache.put(request, response.clone()).then(() => trim(cache, TILE_LIMIT)));
      }
      return response;
    });
  if (cached) {
    // Style documents may change, so refresh them behind the cached copy; tiles are immutable.
    if (isStyle) event.waitUntil(refresh().catch(() => {}));
    return cached;
  }
  return refresh();
}

/** Drops the oldest entries (the cache lists keys in insertion order) beyond the limit. */
async function trim(cache, limit) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - limit))) await cache.delete(key);
}
