/*
 * The night look. Runs synchronously in <head> (layouts/Base.astro), like stale-check.js, so
 * the first paint already has the right colours (the CSP allows no inline script): <html data-theme="dark"> after sunset in Thessaloniki or when the device asks
 * for dark, "light" otherwise. It checks again every minute and when the page comes back, so a
 * screen left open turns dark at sunset. The sun's height is lib/sun.ts (sun.test.ts keeps the
 * two in step); the place is the city centre.
 */
(function () {
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

  function apply() {
    var dark =
      Boolean(media && media.matches) || sunElevation(Date.now(), 40.6401, 22.9444) < -0.833;
    var theme = dark ? 'dark' : 'light';
    if (root.getAttribute('data-theme') !== theme) root.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#151d19' : '#ffffff');
  }

  apply();
  setInterval(apply, 60000);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') apply();
  });
  if (media && media.addEventListener) media.addEventListener('change', apply);
})();
