import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { PERIODIC_SYNC_TAG } from '../src/lib/pwa.ts';
import { renderServiceWorker } from './precache.ts';

// The service worker's offline behaviour (sw/sw.js), run against in-memory caches and a fake
// network. precache.test.ts covers install and the trimming of old duty lists.

const ORIGIN = 'https://example.test';
const template = readFileSync(new URL('../sw/sw.js', import.meta.url), 'utf8');
const data = (path: string) => `/data/thessaloniki/${path}`;

const meta = {
  schemaVersion: 1,
  city: 'thessaloniki',
  updatedAt: '2026-10-05T04:46:06.384Z',
  duties: { from: '2026-06-04', to: '2026-10-07' },
  extendedHours: [{ from: '2026-09-01', to: '2026-10-31', file: 'extended-hours/a_b.json' }],
};

type Listener = (event: unknown) => void;

/** A cache keyed by absolute URL, keeping insertion order as the real one does. */
class FakeCache {
  readonly entries = new Map<string, Response>();
  private key(request: string | { url: string }): string {
    return new URL(typeof request === 'string' ? request : request.url, ORIGIN).href;
  }
  match(request: string | { url: string }) {
    return Promise.resolve(this.entries.get(this.key(request))?.clone());
  }
  put(request: string | { url: string }, response: Response) {
    this.entries.set(this.key(request), response);
    return Promise.resolve();
  }
  delete(request: string | { url: string }) {
    return Promise.resolve(this.entries.delete(this.key(request)));
  }
  keys() {
    return Promise.resolve([...this.entries.keys()].map((url) => ({ url })));
  }
}

interface Worker {
  readonly listeners: Record<string, Listener>;
  readonly caches: Map<string, FakeCache>;
  readonly fetched: string[];
  sandbox: Record<string, unknown>;
  /** Fires an event and waits for everything it passed to waitUntil (and respondWith). */
  fire(type: string, event: Record<string, unknown>): Promise<Response | undefined>;
  online: boolean;
}

function startWorker(
  routes: Record<string, () => Response>,
  options: { version?: string; precached?: string[] } = {},
): Worker {
  const store = new Map<string, FakeCache>();
  const open = (name: string) => {
    if (!store.has(name)) store.set(name, new FakeCache());
    return store.get(name) as FakeCache;
  };
  const listeners: Record<string, Listener> = {};
  const worker: Worker = {
    listeners,
    caches: store,
    fetched: [],
    sandbox: {},
    online: true,
    async fire(type, event) {
      const pending: Promise<unknown>[] = [];
      let response: Promise<Response> | undefined;
      listeners[type]?.({
        ...event,
        waitUntil: (promise: Promise<unknown>) => pending.push(promise),
        respondWith: (promise: Promise<Response>) => (response = promise),
      });
      const result = await response;
      // waitUntil may be called while the response is produced: settle until nothing is left.
      for (let i = 0; i < pending.length; i += 1) await pending[i];
      return result;
    },
  };
  const fakeFetch = (request: string | { url: string }) => {
    const url = new URL(typeof request === 'string' ? request : request.url, ORIGIN);
    worker.fetched.push(url.pathname);
    if (!worker.online) return Promise.reject(new TypeError('Failed to fetch'));
    const route = routes[url.pathname];
    const response = route ? route() : new Response('not found', { status: 404 });
    Object.defineProperty(response, 'type', { value: 'basic' });
    return Promise.resolve(response);
  };
  worker.sandbox = {
    self: {
      addEventListener: (type: string, listener: Listener) => {
        listeners[type] = listener;
      },
      clients: { claim: () => Promise.resolve() },
      skipWaiting: () => Promise.resolve(),
      location: { origin: ORIGIN },
    },
    caches: {
      keys: () => Promise.resolve([...store.keys()]),
      open: (name: string) => Promise.resolve(open(name)),
      delete: (name: string) => Promise.resolve(store.delete(name)),
      match: (request: string) => open('data-v1').match(request),
    },
    fetch: fakeFetch,
    Request,
    Response,
    URL,
    Set,
    Map,
    Date,
    Intl,
    setTimeout,
    clearTimeout,
  };
  runInNewContext(
    renderServiceWorker(template, options.version ?? 'v1', options.precached ?? ['/', '/en/']),
    worker.sandbox,
  );
  return worker;
}

const json = (value: unknown) => () =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

function dataRoutes(): Record<string, () => Response> {
  const routes: Record<string, () => Response> = {
    [data('meta.json')]: json(meta),
    [data('pharmacies.json')]: json({ schemaVersion: 1, pharmacies: [] }),
    [data('extended-hours/a_b.json')]: json({ schemaVersion: 1 }),
  };
  for (const date of ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07']) {
    routes[data(`duties/${date}.json`)] = json({ schemaVersion: 1, date });
  }
  return routes;
}

describe('offlineDataUrls', () => {
  const urls = (value: unknown, now: Date) =>
    (startWorker({}).sandbox['offlineDataUrls'] as (m: unknown, n: Date) => string[])(value, now);

  it('lists meta, pharmacies, the extended-hours files and the published duty days', () => {
    // 23:30 UTC on the 4th is 02:30 on the 5th in Athens: yesterday is the 4th.
    expect(urls(meta, new Date('2026-10-04T23:30:00Z'))).toEqual([
      data('meta.json'),
      data('pharmacies.json'),
      data('extended-hours/a_b.json'),
      data('duties/2026-10-04.json'),
      data('duties/2026-10-05.json'),
      data('duties/2026-10-06.json'),
      data('duties/2026-10-07.json'),
      // The 8th is three days ahead, but meta.json does not list it.
    ]);
  });

  it('asks for no duty day when none is published', () => {
    expect(urls({ ...meta, duties: null }, new Date('2026-10-05T09:00:00Z'))).toEqual([
      data('meta.json'),
      data('pharmacies.json'),
      data('extended-hours/a_b.json'),
    ]);
  });

  it('crosses month ends', () => {
    const late = { ...meta, duties: { from: '2026-10-01', to: '2026-11-30' } };
    expect(urls(late, new Date('2026-10-30T09:00:00Z')).slice(3)).toEqual([
      data('duties/2026-10-29.json'),
      data('duties/2026-10-30.json'),
      data('duties/2026-10-31.json'),
      data('duties/2026-11-01.json'),
      data('duties/2026-11-02.json'),
    ]);
  });
});

describe('warm-up', () => {
  const cachedPaths = (worker: Worker) =>
    [...(worker.caches.get('data-v1')?.entries.keys() ?? [])].map((url) => new URL(url).pathname);

  it('fetches the offline data into the data cache when a page asks, by the page’s clock', async () => {
    const worker = startWorker(dataRoutes());
    const now = Date.parse('2026-10-05T09:00:00Z');
    await worker.fire('message', { data: { type: 'warm-up', now } });
    expect(cachedPaths(worker).sort()).toEqual(
      [
        data('meta.json'),
        data('pharmacies.json'),
        data('extended-hours/a_b.json'),
        data('duties/2026-10-04.json'),
        data('duties/2026-10-05.json'),
        data('duties/2026-10-06.json'),
        data('duties/2026-10-07.json'),
      ].sort(),
    );
    // meta.json once: the list is made from the copy just fetched.
    expect(worker.fetched.filter((path) => path === data('meta.json'))).toHaveLength(1);
  });

  it('ignores other messages', async () => {
    const worker = startWorker(dataRoutes());
    await worker.fire('message', { data: { type: 'something-else' } });
    await worker.fire('message', { data: null });
    expect(worker.fetched).toEqual([]);
  });

  it('runs on the periodic background sync, and only for its tag', async () => {
    const worker = startWorker(dataRoutes());
    await worker.fire('periodicsync', { tag: 'another' });
    expect(worker.fetched).toEqual([]);
    await worker.fire('periodicsync', { tag: PERIODIC_SYNC_TAG });
    expect(cachedPaths(worker)).toContain(data('meta.json'));
    expect(cachedPaths(worker)).toContain(data('pharmacies.json'));
  });

  it('offline, keeps what the cache has', async () => {
    const worker = startWorker(dataRoutes());
    await worker.fire('message', { data: { type: 'warm-up', now: Date.now() } });
    const before = cachedPaths(worker);
    worker.online = false;
    await worker.fire('message', { data: { type: 'warm-up', now: Date.now() } });
    expect(cachedPaths(worker)).toEqual(before);
  });

  it('never replaces a good copy with an error', async () => {
    const routes = dataRoutes();
    const worker = startWorker(routes);
    const now = Date.parse('2026-10-05T09:00:00Z');
    await worker.fire('message', { data: { type: 'warm-up', now } });
    routes[data('pharmacies.json')] = () => new Response('oops', { status: 500 });
    await worker.fire('message', { data: { type: 'warm-up', now } });
    const copy = await worker.caches.get('data-v1')?.match(data('pharmacies.json'));
    expect(await copy?.json()).toEqual({ schemaVersion: 1, pharmacies: [] });
  });
});

describe('pages outside the shell', () => {
  const page = (body: string) => () =>
    new Response(`<!doctype html><title>${body}</title>`, {
      headers: { 'Content-Type': 'text/html' },
    });
  const navigate = (worker: Worker, path: string) =>
    worker.fire('fetch', {
      request: { url: `${ORIGIN}${path}`, method: 'GET', mode: 'navigate' },
    });

  it('opens a page seen before offline, and the home page for one never seen', async () => {
    const worker = startWorker({
      '/farmakeio/1/': page('pharmacy 1'),
      '/en/pharmacy/2/': page('pharmacy 2'),
    });
    // The shell's home pages, as install would have put them.
    const precache = new FakeCache();
    await precache.put('/', page('home el')());
    await precache.put('/en/', page('home en')());
    worker.caches.set('precache-v1', precache);

    expect(await (await navigate(worker, '/farmakeio/1/'))?.text()).toContain('pharmacy 1');
    worker.online = false;
    expect(await (await navigate(worker, '/farmakeio/1/'))?.text()).toContain('pharmacy 1');
    // A query string does not make another page.
    expect(await (await navigate(worker, '/farmakeio/1/?from=list'))?.text()).toContain(
      'pharmacy 1',
    );
    expect(await (await navigate(worker, '/farmakeio/3/'))?.text()).toContain('home el');
    expect(await (await navigate(worker, '/en/pharmacy/2/'))?.text()).toContain('home en');
  });

  it('keeps an error page out of the cache', async () => {
    const worker = startWorker({});
    expect((await navigate(worker, '/farmakeio/missing/'))?.status).toBe(404);
    expect(worker.caches.get('pages-v1')?.entries.size ?? 0).toBe(0);
  });

  it('keeps the 60 most recently visited', async () => {
    const routes: Record<string, () => Response> = {};
    for (let i = 0; i <= 65; i += 1) routes[`/farmakeio/${i}/`] = page(`pharmacy ${i}`);
    const worker = startWorker(routes);
    // 0 to 64: the first five fall out, 5 to 64 are kept.
    for (let i = 0; i < 65; i += 1) await navigate(worker, `/farmakeio/${i}/`);
    // Seen again, 5 moves to the end, so the next new page pushes out 6 instead.
    await navigate(worker, '/farmakeio/5/');
    await navigate(worker, '/farmakeio/65/');
    const kept = [...(worker.caches.get('pages-v1')?.entries.keys() ?? [])].map(
      (url) => new URL(url).pathname,
    );
    expect(kept).toHaveLength(60);
    expect(kept).toContain('/farmakeio/5/');
    expect(kept).toContain('/farmakeio/65/');
    expect(kept).not.toContain('/farmakeio/0/');
    expect(kept).not.toContain('/farmakeio/6/');
  });

  it('drops the pages of an older version when a new one activates', async () => {
    const worker = startWorker({}, { version: 'v2' });
    worker.caches.set('pages-v1', new FakeCache());
    worker.caches.set('pages-v2', new FakeCache());
    worker.caches.set('data-v1', new FakeCache());
    await worker.fire('activate', {});
    expect([...worker.caches.keys()].sort()).toEqual(['data-v1', 'pages-v2']);
  });
});
