/**
 * Where the sun is, for the night look (docs/decisions.md, Look): the app turns dark after
 * sunset in Thessaloniki, for people looking for a pharmacy in a dark room. The same few lines
 * run before the first paint in public/theme.js; sun.test.ts keeps the two in step.
 *
 * The low-precision formulas of the Astronomical Almanac: good to about a minute in sunset
 * time, which is plenty for a colour scheme.
 */

const RAD = Math.PI / 180;

/** The sun's height above the horizon, in degrees, at `date` seen from (lat, lon). */
export function sunElevation(date: Date, lat: number, lon: number): number {
  // Days since 2000-01-01 12:00 UTC.
  const d = date.getTime() / 86_400_000 - 10_957.5;
  const g = RAD * (357.529 + 0.98560028 * d);
  const q = 280.459 + 0.98564736 * d;
  const ecliptic = RAD * (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
  const obliquity = RAD * (23.439 - 0.00000036 * d);
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(ecliptic));
  const ascension = Math.atan2(Math.cos(obliquity) * Math.sin(ecliptic), Math.cos(ecliptic));
  const siderealHours = (18.697374558 + 24.06570982441908 * d) % 24;
  const hourAngle = RAD * (siderealHours * 15 + lon) - ascension;
  const latitude = RAD * lat;
  return (
    Math.asin(
      Math.sin(latitude) * Math.sin(declination) +
        Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle),
    ) / RAD
  );
}

/** The sun is down: below the horizon, with refraction and its radius (as sunset is timed). */
export function sunIsDown(date: Date, lat: number, lon: number): boolean {
  return sunElevation(date, lat, lon) < -0.833;
}
