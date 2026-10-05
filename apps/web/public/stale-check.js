/*
 * Runs synchronously in <head>, before the first paint, so the stale-data banner is either
 * there from the start or never appears (no layout shift). The age of the data is not in the
 * page (that would change every page, and the service worker's cache, with each data update):
 * scripts/boot.ts reads it from /data/.../meta.json and remembers it in localStorage, and this
 * script uses what was remembered. On a first visit nothing is remembered yet and the banner
 * waits for that check. It repeats the rule in src/lib/freshness.ts (isStale, 36 hours);
 * freshness.test.ts keeps the two in step. Without JavaScript the banner stays hidden.
 */
(function () {
  var stored;
  try {
    stored = localStorage.getItem('pharmacy-skg:data-updated');
  } catch {
    return;
  }
  if (stored === null) return;
  var updated = Date.parse(stored);
  if (isNaN(updated) || Date.now() - updated > 36 * 3600 * 1000) {
    document.documentElement.setAttribute('data-stale', '');
  }
})();
