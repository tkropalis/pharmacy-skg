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
 *   - the map (MapLibre chunk, worker files, stylesheet) is not precached, because it is about
 *     0.45 MB gzipped and most visits never open it: any other hashed /_astro/ file is cached
 *     cache-first the first time it is used, so the map works offline once it has been seen;
 *   - /data/**: network-first, falling back to the last copy (for offline use);
 *   - tiles.openfreemap.org: cache-first, capped at TILE_LIMIT entries;
 *   - everything else (the report API, analytics): untouched.
 *
 * A new version installs, downloading only the files whose content changed, takes over
 * immediately (skipWaiting + clients.claim) and deletes the old precache. A page that is on
 * screen is not reloaded under the person: it offers a reload button, and reloads by itself
 * only when it is hidden (src/lib/pwa.ts).
 */
const BUILD_VERSION = '__BUILD_VERSION__';
const PRECACHE_URLS = ['__PRECACHE_URLS__'];
// URL to content hash. A new version keeps the files of the previous one whose hash is the same.
const PRECACHE_HASHES = '__PRECACHE_HASHES__';

const PRECACHE = `precache-${BUILD_VERSION}`;
// Hashed assets fetched on first use (the map). Tied to the build, so old ones do not pile up.
const ASSET_CACHE = `assets-${BUILD_VERSION}`;
const DATA_CACHE = 'data-v1';
const TILE_CACHE = 'tiles-v1';
const TILE_HOST = 'tiles.openfreemap.org';
const TILE_LIMIT = 500;
const NAVIGATION_TIMEOUT_MS = 4000;
const DATA_TIMEOUT_MS = 6000;

const PRECACHED = new Set(PRECACHE_URLS);

const MANIFEST_KEY = '/__precache-manifest__';

/**
 * Copies of files that an earlier version precached and that have not changed (same content
 * hash). Pages are not reused: they are refreshed network-first and may be newer than their
 * hash says.
 */
async function unchangedFiles() {
  const found = new Map();
  for (const name of await caches.keys()) {
    if (!name.startsWith('precache-') || name === PRECACHE) continue;
    const old = await caches.open(name);
    const manifest = await old.match(MANIFEST_KEY);
    if (!manifest) continue;
    const hashes = await manifest.json().catch(() => ({}));
    for (const url of PRECACHE_URLS) {
      if (found.has(url) || url.endsWith('/') || hashes[url] !== PRECACHE_HASHES[url]) continue;
      const copy = await old.match(url);
      if (copy) found.set(url, copy);
    }
  }
  return found;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      const kept = await unchangedFiles();
      for (const [url, copy] of kept) await cache.put(url, copy);
      // `reload` skips the HTTP cache, so a new version never precaches stale files.
      const missing = PRECACHE_URLS.filter((url) => !kept.has(url));
      await cache.addAll(missing.map((url) => new Request(url, { cache: 'reload' })));
      await cache.put(MANIFEST_KEY, new Response(JSON.stringify(PRECACHE_HASHES)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        const stale =
          (name.startsWith('precache-') && name !== PRECACHE) ||
          (name.startsWith('assets-') && name !== ASSET_CACHE);
        if (stale) await caches.delete(name);
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
    } else if (url.pathname.startsWith('/_astro/')) {
      // Content-hashed (or versioned) and so immutable: the first copy is the right one.
      event.respondWith(cacheFirst(event, ASSET_CACHE));
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
    // ignoreVary: the same URL is requested with and without an Origin header (a preload with
    // `crossorigin` sends one, fetch() from the page does not), and hosts answer `Vary: Origin`.
    const cached = await cache.match(cacheKey, { ignoreVary: true });
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
    return (await cache.match(home, { ignoreVary: true })) ?? Response.error();
  }
}

async function fromPrecache(request) {
  const cache = await caches.open(PRECACHE);
  const cached = await cache.match(new URL(request.url).pathname, { ignoreVary: true });
  return cached ?? fetch(request);
}

async function cacheFirst(event, cacheName) {
  const { request } = event;
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) event.waitUntil(cache.put(request, response.clone()));
  return response;
}

async function tiles(event, url) {
  const { request } = event;
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
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
