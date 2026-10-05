import { DEFAULT_CITY_ID } from '../config.ts';
import { cityDataUrl, dutyPath, loadMeta } from './data.ts';
import { offlineDates } from './dates.ts';

function inRange(date: string, range: { readonly from: string; readonly to: string }): boolean {
  return date >= range.from && date <= range.to;
}

/**
 * URLs worth warming up for offline use: meta, pharmacies, the extended-hours files meta lists
 * and the duty lists for today and the next three days.
 */
export function offlineUrls(
  now: Date,
  extendedHoursFiles: readonly string[] = [],
  cityId: string = DEFAULT_CITY_ID,
  /** The range meta.json lists (null: none published); left out, every day is requested. */
  published?: { readonly from: string; readonly to: string } | null,
): string[] {
  return [
    cityDataUrl(cityId, 'meta.json'),
    cityDataUrl(cityId, 'pharmacies.json'),
    ...extendedHoursFiles.map((file) => cityDataUrl(cityId, file)),
    ...offlineDates(now)
      // Days meta.json does not list are not requested: a 404 is logged as an error.
      .filter((date) => published === undefined || (published !== null && inRange(date, published)))
      .map((date) => cityDataUrl(cityId, dutyPath(date))),
  ];
}

/**
 * Registers the service worker (production builds only). When a new version takes over, the
 * page reloads once so it never keeps running an old build against new caches. A reload is
 * skipped while the user has unsent input in a form (`data-dirty`); the next navigation then
 * gets the new version anyway.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  const hadController = navigator.serviceWorker.controller !== null;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    if (document.querySelector('form[data-dirty="true"]') !== null) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then((registration) => {
      // Phones keep tabs open for days: look for a new version whenever the app comes back.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update().catch(() => {});
      });
    })
    .catch(() => {
      // No service worker (private mode, blocked): the app still works online.
    });
}

/**
 * After load, while online, fetch today's data and the next three days' duty lists so they
 * are in the service worker's cache. Only days meta.json says are published are requested.
 */
export function prefetchOfflineData(now: Date = new Date()): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData === true) return;

  const run = async (): Promise<void> => {
    if (!navigator.onLine) return;
    await navigator.serviceWorker.ready;
    // Wait (briefly) until the worker controls this page, so the requests below are cached.
    if (navigator.serviceWorker.controller === null) {
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        navigator.serviceWorker.addEventListener('controllerchange', done, { once: true });
        setTimeout(done, 3000);
      });
    }
    let extendedHoursFiles: string[] = [];
    let published: { from: string; to: string } | null | undefined;
    try {
      const meta = await loadMeta(DEFAULT_CITY_ID);
      extendedHoursFiles = meta.extendedHours.map((entry) => entry.file);
      published = meta.duties;
    } catch {
      // Offline again: the fixed URLs below still get a try.
    }
    for (const url of offlineUrls(now, extendedHoursFiles, DEFAULT_CITY_ID, published)) {
      try {
        await fetch(url);
      } catch {
        // Offline again or the file is missing: nothing to do.
      }
    }
  };

  const schedule = (callback: () => void): void => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(callback, { timeout: 5000 });
    else setTimeout(callback, 2000);
  };
  const start = () => schedule(() => void run());
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
