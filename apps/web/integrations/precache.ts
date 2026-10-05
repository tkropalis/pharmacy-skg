import { createHash } from 'node:crypto';

export interface PrecacheFile {
  /** Path relative to the build output, with forward slashes: 'en/about/index.html'. */
  readonly path: string;
  /** SHA-256 (hex) of the file's contents. */
  readonly hash: string;
}

/** Files that must never be precached: the worker itself and the data (network-first). */
const EXCLUDED = [/^sw\.js$/, /^data\//, /^404\.html$/, /\.map$/];

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

/** Fills the placeholders in sw/sw.js. Throws if the template no longer has them. */
export function renderServiceWorker(
  template: string,
  version: string,
  urls: readonly string[],
): string {
  const versionPlaceholder = "'__BUILD_VERSION__'";
  const urlsPlaceholder = "['__PRECACHE_URLS__']";
  if (!template.includes(versionPlaceholder) || !template.includes(urlsPlaceholder)) {
    throw new Error('sw/sw.js is missing its __BUILD_VERSION__ or __PRECACHE_URLS__ placeholder');
  }
  return template
    .replace(versionPlaceholder, JSON.stringify(version))
    .replace(urlsPlaceholder, JSON.stringify(urls));
}
