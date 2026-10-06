/*
 * Light or dark. Runs synchronously in <head> (layouts/Base.astro), like stale-check.js, so the
 * first paint already has the right colours (the CSP allows no inline script). Light unless the
 * person chose otherwise in the footer: "dark", or "auto" (dark after sunset in Thessaloniki or
 * when the device asks for dark). The choice is remembered on the device. It sets
 * <html data-theme> ("light" or "dark") and data-theme-choice ("light", "dark" or "auto"),
 * checks again every minute and when the page comes back, and offers
 * window.pharmacyTheme.set(choice) to the footer's buttons. The sun's height is lib/sun.ts
 * (sun.test.ts keeps the two in step); the place is the city centre.
 */
(function () {
  var KEY = 'pharmacy-skg:theme';
  var RAD = Math.PI / 180;
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function sunElevation(time, lat, lon) {
    var d = time / 86400000 - 10957.5;
    var g = RAD * (357.529 + 0.98560028 * d);
    var q = 280.459 + 0.98564736 * d;
    var ecliptic = RAD * (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
    var obliquity = RAD * (23.439 - 0.00000036 * d);
    var declination = Math.asin(Math.sin(obliquity) * Math.sin(ecliptic));
    var ascension = Math.atan2(Math.cos(obliquity) * Math.sin(ecliptic), Math.cos(ecliptic));
    var sidereal = (18.697374558 + 24.06570982441908 * d) % 24;
    var hourAngle = RAD * (sidereal * 15 + lon) - ascension;
    var latitude = RAD * lat;
    return (
      Math.asin(
        Math.sin(latitude) * Math.sin(declination) +
          Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle),
      ) / RAD
    );
  }

  /** Where the choice is kept when the browser keeps nothing (private window, blocked data). */
  var unsaved = 'light';

  /** The person's choice: "light" (the default), "dark" or "auto". */
  function choice() {
    var value;
    try {
      value = localStorage.getItem(KEY);
    } catch {
      value = unsaved;
    }
    return value === 'dark' || value === 'auto' ? value : 'light';
  }

  function apply() {
    var chosen = choice();
    var dark =
      chosen === 'dark' ||
      (chosen === 'auto' &&
        (Boolean(media && media.matches) || sunElevation(Date.now(), 40.6401, 22.9444) < -0.833));
    var theme = dark ? 'dark' : 'light';
    if (root.getAttribute('data-theme') !== theme) root.setAttribute('data-theme', theme);
    if (root.getAttribute('data-theme-choice') !== chosen) {
      root.setAttribute('data-theme-choice', chosen);
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#151d19' : '#ffffff');
  }

  window.pharmacyTheme = {
    set: function (next) {
      unsaved = next;
      try {
        if (next === 'dark' || next === 'auto') localStorage.setItem(KEY, next);
        else localStorage.removeItem(KEY);
      } catch {
        // Not remembered: kept for this page only.
      }
      apply();
    },
  };

  apply();
  setInterval(apply, 60000);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') apply();
  });
  // Another tab changed the choice.
  window.addEventListener('storage', function (event) {
    if (event.key === KEY) apply();
  });
  if (media && media.addEventListener) media.addEventListener('change', apply);
})();
