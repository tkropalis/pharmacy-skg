/*
 * Runs synchronously in <head>, before the first paint, so the stale-data banner is either
 * there from the start or never appears (no layout shift). It repeats the rule in
 * src/lib/freshness.ts (isStale, 36 hours); stale-check.test.ts keeps the two in step.
 * Without JavaScript the banner stays hidden and the footer still shows the date.
 */
(function () {
  var meta = document.querySelector('meta[name="pharmacy-data-updated"]');
  var updated = meta ? Date.parse(meta.getAttribute('content') || '') : NaN;
  var stale = isNaN(updated) || Date.now() - updated > 36 * 3600 * 1000;
  if (stale) document.documentElement.setAttribute('data-stale', '');
})();
