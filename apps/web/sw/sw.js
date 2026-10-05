/*
 * Service worker. Hand-written; integrations/service-worker.ts copies it to /sw.js at build
 * time, filling in the two placeholders below:
 *   - BUILD_VERSION: a hash of every precached file, so each build that changes anything gets
 *     its own precache, and an unchanged build does not trigger an update;
 *   - PRECACHE_URLS: the app shell (all pages of both locales, assets, icons, manifests);
 *   - PRECACHE_HASHES: each precached URL's content hash;
 *   - CITY_ID: the city whose data is kept for offline use (DEFAULT_CITY_ID in src/config.ts).
 *
 * Strategies:
 *   - app shell: precached; pages are network-first with a short timeout, falling back to the
 *     precached copy, so online users always see the latest page and offline users see the
 *     shell; hashed assets and icons come from the precache;
 *   - the map (MapLibre chunk, worker files, stylesheet) is not precached, because it is about
 *     0.45 MB gzipped and most visits never open it: any other hashed /_astro/ file is cached
 *     cache-first the first time it is used, so the map works offline once it has been seen;
 *   - other pages (one per pharmacy, duty date and area, thousands in all): network-first; the
 *     last PAGE_LIMIT visited are kept, so a page seen before opens offline; offline, a page
 *     never seen gets the home page of its locale;
 *   - /data/**: network-first, falling back to the last copy (for offline use); duty lists
 *     older than DUTY_KEEP_DAYS before today (Athens) are dropped from that cache;
 *   - tiles.openfreemap.org: cache-first, capped at TILE_LIMIT entries;
 *   - everything else (the report API, analytics): untouched.
 *
 * Warm-up: the data for offline use (meta, pharmacies, the extended-hours files and the duty lists
 * for yesterday to three days ahead, as far as meta.json says they are published) is fetched into
 * the data cache by the worker itself: when a page asks (src/lib/pwa.ts: on load, when the app
 * comes back to the foreground and when the connection returns) and, in an installed app whose
 * browser allows it, on a periodic background sync, so the next days are there even if the app
 * was not opened.
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
const CITY_ID = '__CITY_ID__';

const PRECACHE = `precache-${BUILD_VERSION}`;
// Hashed assets fetched on first use (the map). Tied to the build, so old ones do not pile up.
const ASSET_CACHE = `assets-${BUILD_VERSION}`;
// Pages visited that are not in the shell. Tied to the build: they load its hashed assets.
const PAGE_CACHE = `pages-${BUILD_VERSION}`;
const PAGE_LIMIT = 60;
const DATA_CACHE = 'data-v1';
const TILE_CACHE = 'tiles-v1';
const TILE_HOST = 'tiles.openfreemap.org';
const TILE_LIMIT = 500;
const NAVIGATION_TIMEOUT_MS = 4000;
const DATA_TIMEOUT_MS = 6000;
// Duty lists this many days before today are no longer kept (meta, pharmacies and the
// extended-hours files are).
const DUTY_KEEP_DAYS = 14;
const DUTY_FILE = /^\/data\/[^/]+\/duties\/(\d{4}-\d{2}-\d{2})\.json$/;
const TRIM_EVERY_MS = 60 * 60_000;
// Duty lists kept warm: from this many days before today (a duty runs 08:00 to 08:00, so before
// 08:00 yesterday's list applies) to WARM_DAYS_AHEAD after it.
const WARM_DAYS_BEFORE = 1;
const WARM_DAYS_AHEAD = 3;
const PERIODIC_SYNC_TAG = 'refresh-data';

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

/** Today's calendar date in the city's time zone, as YYYY-MM-DD. */
function athensDate(now) {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Athens',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Of these cached URLs, the duty lists dated more than DUTY_KEEP_DAYS before today. */
function staleDutyUrls(urls, now) {
  const today = Date.parse(`${athensDate(now)}T00:00:00Z`);
  const cutoff = new Date(today - DUTY_KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
  return urls.filter((url) => {
    const match = DUTY_FILE.exec(new URL(url).pathname);
    return match !== null && match[1] < cutoff;
  });
}

/**
 * Stores a data file in place of every earlier copy of its URL. Hosts may answer `Vary: Origin`,
 * and the same file is fetched with and without an Origin header (a preload with `crossorigin`,
 * fetch() from the page, the warm-up), so a plain put could leave an older copy beside the new
 * one, which a match that ignores Vary might return first.
 */
async function replaceInCache(cache, key, response) {
  await cache.delete(key, { ignoreVary: true });
  await cache.put(key, response);
}

/** An ISO date moved by `days` (calendar arithmetic, no time zone involved). */
function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * What is kept warm for offline use, given meta.json: meta itself, the pharmacies, every
 * extended-hours file it lists and the duty lists from yesterday to WARM_DAYS_AHEAD days ahead
 * (Athens) that it says are published (asking for any other would only get a 404).
 */
function offlineDataUrls(meta, now, city = CITY_ID) {
  const base = `/data/${city}/`;
  const urls = [`${base}meta.json`, `${base}pharmacies.json`];
  for (const entry of meta?.extendedHours ?? []) {
    if (typeof entry?.file === 'string') urls.push(base + entry.file);
  }
  const range = meta?.duties;
  if (range && typeof range.from === 'string' && typeof range.to === 'string') {
    const today = athensDate(now);
    for (let day = -WARM_DAYS_BEFORE; day <= WARM_DAYS_AHEAD; day += 1) {
      const date = addDays(today, day);
      if (date >= range.from && date <= range.to) urls.push(`${base}duties/${date}.json`);
    }
  }
  return urls;
}

let warming = null;

/**
 * Fetches the offline data into the data cache. meta.json comes first (it says what is
 * published); offline, nothing is fetched and the cache keeps what it has. One run at a time.
 */
function warmUp(now) {
  if (warming !== null) return warming;
  warming = (async () => {
    const cache = await caches.open(DATA_CACHE);
    const fetchInto = async (url) => {
      const response = await fetch(url);
      // A 404 or an error never replaces a good copy.
      if (response.ok) await replaceInCache(cache, url, response.clone());
      return response;
    };
    const metaUrl = `/data/${CITY_ID}/meta.json`;
    const metaResponse = await fetchInto(metaUrl);
    if (!metaResponse.ok) return;
    const meta = await metaResponse.json();
    for (const url of offlineDataUrls(meta, now).filter((url) => url !== metaUrl)) {
      try {
        await fetchInto(url);
      } catch {
        // Offline again: the next run gets the rest.
      }
    }
    await trimDutyFiles();
  })()
    .catch(() => {})
    .finally(() => {
      warming = null;
    });
  return warming;
}

async function trimDutyFiles() {
  const cache = await caches.open(DATA_CACHE);
  const urls = (await cache.keys()).map((request) => request.url);
  for (const url of staleDutyUrls(urls, new Date())) await cache.delete(url, { ignoreVary: true });
}

let lastTrim = 0;

/** After a data fetch, at most once per TRIM_EVERY_MS: a worker that lives for weeks keeps up. */
function trimSoon(event) {
  const now = Date.now();
  if (now - lastTrim < TRIM_EVERY_MS) return;
  lastTrim = now;
  event.waitUntil(trimDutyFiles().catch(() => {}));
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
          (name.startsWith('assets-') && name !== ASSET_CACHE) ||
          (name.startsWith('pages-') && name !== PAGE_CACHE);
        if (stale) await caches.delete(name);
      }
      await trimDutyFiles().catch(() => {});
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  // From a page of this origin (src/lib/pwa.ts), which passes its clock: Athens dates follow it.
  if (event.data?.type !== 'warm-up') return;
  const at = Number(event.data.now);
  event.waitUntil(warmUp(Number.isFinite(at) ? new Date(at) : new Date()));
});

// Installed apps in browsers that allow it (Chromium); registered by src/lib/pwa.ts.
self.addEventListener('periodicsync', (event) => {
  if (event.tag === PERIODIC_SYNC_TAG) event.waitUntil(warmUp(new Date()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/data/')) {
      event.respondWith(networkFirst(event, DATA_CACHE, DATA_TIMEOUT_MS));
      trimSoon(event);
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
    if (response.ok) event.waitUntil(replaceInCache(cache, cacheKey, response.clone()));
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
  if (PRECACHED.has(url.pathname)) {
    return networkFirst(event, PRECACHE, NAVIGATION_TIMEOUT_MS, url.pathname);
  }
  const pages = await caches.open(PAGE_CACHE);
  // Keyed by path: a query string or a fragment does not make another page.
  const key = url.pathname;
  try {
    const response = await fetch(event.request);
    if (response.ok && response.type === 'basic' && !response.redirected) {
      // Cloned now: once the page starts reading the body, it can no longer be copied.
      const copy = response.clone();
      // Deleted first, so a page seen again moves to the end and is the last to be trimmed.
      event.waitUntil(
        pages
          .delete(key)
          .then(() => pages.put(key, copy))
          .then(() => trim(pages, PAGE_LIMIT)),
      );
    }
    return response;
  } catch {
    const seen = await pages.match(key, { ignoreVary: true });
    if (seen) return seen;
    // Offline on a page never seen (or not a page): the home page of the locale, which holds the
    // app.
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
