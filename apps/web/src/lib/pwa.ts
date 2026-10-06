import { isOnline, onConnectionChange } from './connection.ts';
import { localIsoDate } from './dates.ts';
import { homeCity } from './home-city.ts';
import { ensureUpdateRegion, offerReload } from './update-toast.ts';

/** The worker's periodic sync tag (PERIODIC_SYNC_TAG in sw/sw.js). */
export const PERIODIC_SYNC_TAG = 'refresh-data';
/** How often an installed app may refresh its offline data in the background, at most. */
const PERIODIC_SYNC_MS = 12 * 60 * 60_000;
/** The app back in the foreground warms the data again after this long (or on a new day). */
const WARM_AGAIN_MS = 60 * 60_000;

/** A form with unsent input must not be thrown away by a reload. */
function hasUnsentInput(): boolean {
  return document.querySelector('form[data-dirty="true"]') !== null;
}

interface PeriodicSyncManager {
  register(tag: string, options: { minInterval: number }): Promise<void>;
}

/**
 * Asks for a periodic background sync, so an installed app keeps the next days' duty lists even
 * when it is not opened (sw/sw.js). Only Chromium has it, and only grants it to installed apps
 * people use; elsewhere this does nothing.
 */
async function registerPeriodicSync(registration: ServiceWorkerRegistration): Promise<void> {
  const periodicSync = (registration as { periodicSync?: PeriodicSyncManager }).periodicSync;
  if (periodicSync === undefined) return;
  try {
    const status = await navigator.permissions.query({
      name: 'periodic-background-sync' as PermissionName,
    });
    if (status.state !== 'granted') return;
    await periodicSync.register(PERIODIC_SYNC_TAG, { minInterval: PERIODIC_SYNC_MS });
  } catch {
    // Not supported or refused: the data is warmed whenever the app is opened.
  }
}

/**
 * Registers the service worker (production builds only). When a new version takes over, a
 * visible page offers a reload button and keeps running; a hidden page reloads by itself (nobody
 * sees it), unless a form has unsent input. Either way the next navigation gets the new version.
 */
export function registerServiceWorker(): void {
  // Before anything can need it, so the notice is announced when it appears.
  ensureUpdateRegion();
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  const hadController = navigator.serviceWorker.controller !== null;
  let updateReady = false;
  const reloadIfHidden = () => {
    if (updateReady && document.visibilityState === 'hidden' && !hasUnsentInput()) {
      window.location.reload();
    }
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || updateReady) return;
    updateReady = true;
    if (document.visibilityState === 'hidden') reloadIfHidden();
    else offerReload();
  });
  document.addEventListener('visibilitychange', reloadIfHidden);

  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then((registration: ServiceWorkerRegistration | undefined) => {
      // Some browsers and test harnesses that block workers resolve without a registration.
      if (registration === undefined) return;
      // Phones keep tabs open for days: look for a new version whenever the app comes back.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update().catch(() => {});
      });
      void registerPeriodicSync(registration);
    })
    .catch(() => {
      // No service worker (private mode, blocked): the app still works online.
    });
}

/** Whether to warm the data again: never warmed, a new day in the city, or an hour later. */
export function shouldWarmAgain(last: number | null, now: number): boolean {
  if (last === null) return true;
  return (
    now - last >= WARM_AGAIN_MS || localIsoDate(new Date(last)) !== localIsoDate(new Date(now))
  );
}

/**
 * Keeps the data for offline use in the service worker's cache: today's data and the duty lists
 * from yesterday to three days ahead, as far as they are published. The worker fetches them
 * itself (sw/sw.js, warmUp) when asked: after load, when the app comes back to the foreground
 * (at most hourly, or on a new day) and when the connection returns. Not with Data Saver on.
 */
export function keepOfflineDataWarm(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData === true) return;

  let last: number | null = null;
  const warm = (force: boolean) => {
    const now = Date.now();
    if (!isOnline() || (!force && !shouldWarmAgain(last, now))) return;
    last = now;
    void navigator.serviceWorker.ready
      // The page's clock decides which days are "today" and "the next three", and its home city
      // which city's data is kept.
      .then((registration) =>
        registration.active?.postMessage({ type: 'warm-up', now, city: homeCity().id }),
      )
      .catch(() => {});
  };

  const start = () => {
    const run = () => warm(false);
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 5000 });
    else setTimeout(run, 2000);
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') warm(false);
  });
  onConnectionChange((online) => {
    if (online) warm(true);
  });
}
