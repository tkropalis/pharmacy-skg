import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { buildVersion, precacheEntries, renderServiceWorker, urlForFile } from './precache.ts';

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

  it('leaves out the generated pharmacy, duty-date and area pages but keeps their indexes', () => {
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
    expect(kept).toEqual([
      'efimeries/index.html',
      'en/area/index.html',
      'en/duty/index.html',
      'perioxi/index.html',
      'plirofories/index.html',
    ]);
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
    expect(() => new Script(output)).not.toThrow();
  });

  it('refuses a template without its placeholders', () => {
    expect(() => renderServiceWorker('const x = 1;', 'v', [])).toThrow(/placeholder/);
  });
});
