import { loadMeta } from '../lib/data.ts';
import { homeCity } from '../lib/home-city.ts';
import { markConnection, onConnectionChange } from '../lib/connection.ts';
import { formatUpdatedAt, isStale } from '../lib/freshness.ts';
import { setupInstall } from '../lib/install.ts';
import { keepOfflineDataWarm, registerServiceWorker } from '../lib/pwa.ts';
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
    applyFreshness((await loadMeta(homeCity().id)).updatedAt);
  } catch {
    // Offline and not cached: keep what was remembered on the last visit (the banner already
    // used it), and leave the dates in the page as they are.
  }
}

markConnection();
setupInstall();
void refreshFreshness();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void refreshFreshness();
});
onConnectionChange((online) => {
  if (online) void refreshFreshness();
});

/**
 * The footer's light / dark / auto buttons (SiteFooter.astro): public/theme.js keeps the
 * choice and applies it; the buttons show <html data-theme-choice>.
 */
function setupThemeChoice(): void {
  const control = document.querySelector<HTMLElement>('[data-theme-control]');
  const theme = window.pharmacyTheme;
  if (!control || theme === undefined) return;
  const buttons = [...control.querySelectorAll<HTMLButtonElement>('button[data-choice]')];
  const show = () => {
    const chosen = document.documentElement.dataset['themeChoice'] ?? 'light';
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button.dataset['choice'] === chosen));
    }
  };
  for (const button of buttons) {
    button.addEventListener('click', () => {
      const choice = button.dataset['choice'];
      if (choice === 'light' || choice === 'dark' || choice === 'auto') theme.set(choice);
    });
  }
  new MutationObserver(show).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme-choice'],
  });
  show();
  control.hidden = false;
}

setupThemeChoice();
setupMedicineSearch();
registerServiceWorker();
keepOfflineDataWarm();
