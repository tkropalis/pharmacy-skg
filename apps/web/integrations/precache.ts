import { createHash } from 'node:crypto';
import { DEFAULT_CITY_ID } from '../src/config.ts';
import { localePrefix, PARAM_ROUTES } from '../src/i18n/routes.ts';
import { CITIES, LOCALES } from '@pharmacy-skg/core';

export interface PrecacheFile {
  /** Path relative to the build output, with forward slashes: 'en/about/index.html'. */
  readonly path: string;
  /** SHA-256 (hex) of the file's contents. */
  readonly hash: string;
}

/**
 * The generated pages with a parameter (one per pharmacy, duty date and area, thousands in
 * all): they are fetched when visited and never precached. Their index pages stay in the shell.
 */
const PARAM_PAGES = Object.values(PARAM_ROUTES).flatMap((route) =>
  LOCALES.map((locale) => {
    const directory = `${localePrefix(locale)}/${route[locale]}`.replace(/^\//, '');
    return new RegExp(`^${directory}/[^/]+/index\\.html$`);
  }),
);

/**
 * The index of duty dates lists the published dates, so it changes every day and with every
 * data update; precaching it would make a new service worker version out of each of them. It
 * is fetched when visited.
 */
const DUTY_INDEXES = LOCALES.map((locale) => {
  const directory = `${localePrefix(locale)}/${PARAM_ROUTES.duty[locale]}`.replace(/^\//, '');
  return new RegExp(`^${directory}/index\\.html$`);
});

/**
 * The map: the MapLibre chunk, its worker files and its stylesheet (about 0.45 MB gzipped).
 * Most visits never open the map, so the service worker caches these cache-first on first use
 * instead (sw/sw.js, anything under /_astro/ that is not precached).
 */
const LAZY_MAP = [/^_astro\/map-controller\.[^/]+\.js$/, /^_astro\/maplibre-[^/]+(\/|\.css$)/];

/**
 * Files that must never be precached: the worker itself, the data (network-first), crawler
 * files that no page needs (the sitemap alone is 1 MB), the link-preview image (only crawlers
 * fetch it, no page of the app shows it), and the lazy map.
 */
const EXCLUDED = [
  /^sw\.js$/,
  /^data\//,
  /^404\.html$/,
  /^sitemap\.xml$/,
  /^robots\.txt$/,
  /^og-image\.png$/,
  /\.map$/,
  ...LAZY_MAP,
  ...DUTY_INDEXES,
  ...PARAM_PAGES,
];

/** The URL a built file is served at: 'en/about/index.html' becomes '/en/about/'. */
export function urlForFile(path: string): string {
  if (path === 'index.html') return '/';
  if (path.endsWith('/index.html')) return `/${path.slice(0, -'index.html'.length)}`;
  return `/${path}`;
}

/** The app shell: every page of every locale, the hashed assets, the icons and the manifest. */
export function precacheEntries(files: readonly PrecacheFile[]): PrecacheFile[] {
  return files
    .filter((file) => !EXCLUDED.some((pattern) => pattern.test(file.path)))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * A short build version: the hash of every precached URL with its content hash. Identical
 * output gives an identical version (so a rebuild without changes does not trigger an update
 * for everyone), and any changed file gives a new one.
 */
export function buildVersion(entries: readonly PrecacheFile[]): string {
  const lines = entries.map((entry) => `${urlForFile(entry.path)}\0${entry.hash}\n`).sort();
  return createHash('sha256').update(lines.join('')).digest('hex').slice(0, 12);
}

/** URL to content hash, so a new worker can keep the files that did not change. */
export function hashesByUrl(entries: readonly PrecacheFile[]): Record<string, string> {
  return Object.fromEntries(entries.map((entry) => [urlForFile(entry.path), entry.hash]));
}

/** Fills the placeholders in sw/sw.js. Throws if the template no longer has them. */
export function renderServiceWorker(
  template: string,
  version: string,
  urls: readonly string[],
  hashes: Readonly<Record<string, string>> = {},
  cityIds: readonly string[] = [
    DEFAULT_CITY_ID,
    ...CITIES.map((city) => city.id).filter((id) => id !== DEFAULT_CITY_ID),
  ],
): string {
  const values: Record<string, unknown> = {
    "'__BUILD_VERSION__'": version,
    "['__PRECACHE_URLS__']": urls,
    "'__PRECACHE_HASHES__'": hashes,
    "['__CITY_IDS__']": cityIds,
  };
  const missing = Object.keys(values).filter((placeholder) => !template.includes(placeholder));
  if (missing.length > 0) {
    throw new Error(`sw/sw.js is missing its ${missing.join(', ')} placeholder`);
  }
  return Object.entries(values).reduce(
    // A function, so a `$` in a value is never read as a replacement pattern.
    (code, [placeholder, value]) => code.replace(placeholder, () => JSON.stringify(value)),
    template,
  );
}
