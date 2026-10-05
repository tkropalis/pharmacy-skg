import { DEFAULT_CITY_ID } from '../config.ts';
import { loadMeta } from '../lib/data.ts';
import { formatUpdatedAt, isStale } from '../lib/freshness.ts';
import { prefetchOfflineData, registerServiceWorker } from '../lib/pwa.ts';
import type { Locale } from '@pharmacy-skg/core';

/**
 * Pages are static and can be weeks old (installed PWA, cached shell), so the data's age is
 * read again from /data/.../meta.json at runtime. It updates the "last updated" lines and the
 * stale-data banner (shown through html[data-stale], see public/stale-check.js).
 */
function applyFreshness(updatedAt: string): void {
  const locale: Locale = document.documentElement.lang === 'en' ? 'en' : 'el';
  document.querySelector('meta[name="pharmacy-data-updated"]')?.setAttribute('content', updatedAt);
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
    // Offline and not cached: keep what the page was built with.
    const built = document
      .querySelector('meta[name="pharmacy-data-updated"]')
      ?.getAttribute('content');
    if (built) applyFreshness(built);
  }
}

void refreshFreshness();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void refreshFreshness();
});

registerServiceWorker();
prefetchOfflineData();
