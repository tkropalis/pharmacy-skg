import { readFileSync } from 'node:fs';
import { Script, runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  buildVersion,
  hashesByUrl,
  precacheEntries,
  renderServiceWorker,
  urlForFile,
} from './precache.ts';

const file = (path: string, hash = 'h') => ({ path, hash });

describe('urlForFile', () => {
  it.each([
    ['index.html', '/'],
    ['en/index.html', '/en/'],
    ['en/about/index.html', '/en/about/'],
    ['plirofories/index.html', '/plirofories/'],
    ['_astro/Base.abc123.css', '/_astro/Base.abc123.css'],
    ['icons/icon-192.png', '/icons/icon-192.png'],
    ['manifest.webmanifest', '/manifest.webmanifest'],
  ])('%s is served at %s', (path, url) => {
    expect(urlForFile(path)).toBe(url);
  });
});

describe('precacheEntries', () => {
  it('keeps the shell and drops the worker, the data, the 404 page and source maps', () => {
    const kept = precacheEntries([
      file('sw.js'),
      file('404.html'),
      file('data/thessaloniki/meta.json'),
      file('_astro/x.js.map'),
      file('index.html'),
      file('en/index.html'),
      file('_astro/x.js'),
    ]).map((f) => f.path);
    expect(kept).toEqual(['_astro/x.js', 'en/index.html', 'index.html']);
  });

  it('leaves out the lazily loaded map and the crawler files', () => {
    const kept = precacheEntries([
      file('_astro/map-controller.DJ4TtmSf.js'),
      file('_astro/maplibre-gl.O84Bxg0a.css'),
      file('_astro/maplibre-6.12.0/maplibre-gl-worker.mjs'),
      file('_astro/maplibre-6.12.0/maplibre-gl-shared.mjs'),
      file('sitemap.xml'),
      file('robots.txt'),
      file('_astro/HomePage.dME8wzR7.css'),
      file('_astro/client.DAYQUbZp.js'),
    ]).map((f) => f.path);
    expect(kept).toEqual(['_astro/client.DAYQUbZp.js', '_astro/HomePage.dME8wzR7.css']);
  });

  it('leaves out the generated pharmacy, duty-date and area pages, and the date index', () => {
    const kept = precacheEntries([
      file('farmakeio/2310023026/index.html'),
      file('en/pharmacy/2310023026/index.html'),
      file('efimeries/2026-10-05/index.html'),
      file('en/duty/2026-10-05/index.html'),
      file('perioxi/kalamaria/index.html'),
      file('en/area/kalamaria/index.html'),
      file('efimeries/index.html'),
      file('en/duty/index.html'),
      file('perioxi/index.html'),
      file('en/area/index.html'),
      file('plirofories/index.html'),
    ]).map((f) => f.path);
    // The area indexes stay; the duty index lists dates, so it would change with every day.
    expect(kept).toEqual(['en/area/index.html', 'perioxi/index.html', 'plirofories/index.html']);
  });

  it('covers both locales when both are built', () => {
    const urls = precacheEntries([file('index.html'), file('en/index.html')]).map((f) =>
      urlForFile(f.path),
    );
    expect(urls).toContain('/');
    expect(urls).toContain('/en/');
  });
});

describe('buildVersion', () => {
  const base = [file('index.html', 'a'), file('_astro/x.js', 'b')];

  it('is stable for identical output and independent of listing order', () => {
    expect(buildVersion(base)).toBe(
      buildVersion([...base].reverse().sort((a, b) => a.path.localeCompare(b.path))),
    );
    expect(buildVersion(base)).toMatch(/^[0-9a-f]{12}$/);
  });

  it('changes when a file changes, appears or disappears', () => {
    const v = buildVersion(base);
    expect(buildVersion([file('index.html', 'a2'), file('_astro/x.js', 'b')])).not.toBe(v);
    expect(buildVersion([...base, file('en/index.html', 'c')])).not.toBe(v);
    expect(buildVersion(base.slice(1))).not.toBe(v);
  });
});

describe('renderServiceWorker', () => {
  const template = readFileSync(new URL('../sw/sw.js', import.meta.url), 'utf8');

  it('fills in the version and the URL list, leaving valid JavaScript', () => {
    const output = renderServiceWorker(template, 'abc123def456', ['/', '/en/', '/_astro/x.js']);
    expect(output).toContain('const BUILD_VERSION = "abc123def456";');
    expect(output).toContain('const PRECACHE_URLS = ["/","/en/","/_astro/x.js"];');
    expect(output).not.toContain('__BUILD_VERSION__');
    expect(output).not.toContain('__PRECACHE_URLS__');
    expect(output).not.toContain('__PRECACHE_HASHES__');
    expect(() => new Script(output)).not.toThrow();
  });

  it('refuses a template without its placeholders', () => {
    expect(() => renderServiceWorker('const x = 1;', 'v', [])).toThrow(/placeholder/);
  });
});

describe('hashesByUrl', () => {
  it('maps each served URL to its content hash', () => {
    expect(hashesByUrl([file('index.html', 'a'), file('_astro/x.js', 'b')])).toEqual({
      '/': 'a',
      '/_astro/x.js': 'b',
    });
  });
});

describe('the worker on install', () => {
  const template = readFileSync(new URL('../sw/sw.js', import.meta.url), 'utf8');

  /** Runs the rendered worker against in-memory caches and returns what it fetched. */
  async function install(
    entries: { path: string; hash: string }[],
    existing: Record<string, { hashes: Record<string, string>; files: string[] }>,
  ): Promise<{ fetched: string[]; copied: string[]; caches: Map<string, Map<string, unknown>> }> {
    const store = new Map<string, Map<string, unknown>>();
    for (const [name, { hashes, files }] of Object.entries(existing)) {
      const entriesMap = new Map<string, unknown>(files.map((url) => [url, `old:${url}`]));
      entriesMap.set('/__precache-manifest__', new Response(JSON.stringify(hashes)));
      store.set(name, entriesMap);
    }
    const fetched: string[] = [];
    const makeCache = (map: Map<string, unknown>) => ({
      match: (key: string) => Promise.resolve(map.get(String(key))),
      put: (key: string, value: unknown) => Promise.resolve(void map.set(String(key), value)),
      addAll: (requests: { url: string }[]) => {
        for (const request of requests) {
          fetched.push(request.url);
          map.set(request.url, `new:${request.url}`);
        }
        return Promise.resolve();
      },
    });
    const listeners: Record<string, (event: unknown) => void> = {};
    const urls = entries.map((entry) => urlForFile(entry.path));
    const code = renderServiceWorker(template, 'v2', urls, hashesByUrl(entries));
    runInNewContext(code, {
      self: {
        addEventListener: (type: string, listener: (event: unknown) => void) => {
          listeners[type] = listener;
        },
        skipWaiting: () => Promise.resolve(),
        location: { origin: 'https://example.test' },
      },
      caches: {
        keys: () => Promise.resolve([...store.keys()]),
        open: (name: string) => {
          if (!store.has(name)) store.set(name, new Map());
          return Promise.resolve(makeCache(store.get(name) ?? new Map()));
        },
      },
      Request: class {
        url: string;
        constructor(url: string) {
          this.url = url;
        }
      },
      Response,
      URL,
      Set,
      Map,
    });
    let done: Promise<unknown> = Promise.resolve();
    listeners['install']?.({ waitUntil: (promise: Promise<unknown>) => (done = promise) });
    await done;
    const copied = [...(store.get('precache-v2')?.entries() ?? [])]
      .filter(([, value]) => typeof value === 'string' && value.startsWith('old:'))
      .map(([url]) => url);
    return { fetched, copied, caches: store };
  }

  it('downloads only the files whose content changed, and keeps the rest', async () => {
    const result = await install(
      [file('index.html', 'h1'), file('_astro/a.js', 'same'), file('_astro/b.js', 'new')],
      {
        'precache-v1': {
          hashes: { '/': 'h1', '/_astro/a.js': 'same', '/_astro/b.js': 'old' },
          files: ['/', '/_astro/a.js', '/_astro/b.js'],
        },
      },
    );
    // The page is always fetched (it may be newer than its hash), the changed asset too.
    expect(result.fetched.sort()).toEqual(['/', '/_astro/b.js']);
    expect(result.copied).toEqual(['/_astro/a.js']);
    expect(result.caches.get('precache-v2')?.has('/__precache-manifest__')).toBe(true);
  });

  it('downloads everything on a first install', async () => {
    const result = await install([file('index.html', 'h1'), file('_astro/a.js', 'x')], {});
    expect(result.fetched.sort()).toEqual(['/', '/_astro/a.js']);
  });
});
