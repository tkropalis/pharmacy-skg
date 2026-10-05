import { DEFAULT_CITY_ID } from '../config.ts';
import { loadMeta } from '../lib/data.ts';
import { formatUpdatedAt, isStale } from '../lib/freshness.ts';
import { prefetchOfflineData, registerServiceWorker } from '../lib/pwa.ts';
import { DATA_UPDATED_KEY, writeItem } from '../lib/storage.ts';
import { setupMedicineSearch } from './medicine-search.ts';
import type { Locale } from '@pharmacy-skg/core';

/**
 * Pages are static and can be weeks old (installed PWA, cached shell), so the data's age is
 * read from /data/.../meta.json at runtime: the pages do not carry it, so a data update does not
 * change them (or the service worker's cache). It fills in the "last updated" lines and the
 * stale-data banner (shown through html[data-stale], see public/stale-check.js).
 */
function applyFreshness(updatedAt: string): void {
  const locale: Locale = document.documentElement.lang === 'en' ? 'en' : 'el';
  writeItem(DATA_UPDATED_KEY, updatedAt);
  for (const time of document.querySelectorAll<HTMLTimeElement>('time[data-updated-at]')) {
    time.dateTime = updatedAt;
    time.textContent = formatUpdatedAt(updatedAt, locale);
  }
  document.documentElement.toggleAttribute('data-stale', isStale(updatedAt, new Date()));
}

async function refreshFreshness(): Promise<void> {
  try {
    applyFreshness((await loadMeta(DEFAULT_CITY_ID)).updatedAt);
  } catch {
    // Offline and not cached: keep what was remembered on the last visit (the banner already
    // used it), and leave the dates in the page as they are.
  }
}

void refreshFreshness();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void refreshFreshness();
});

setupMedicineSearch();
registerServiceWorker();
prefetchOfflineData();
