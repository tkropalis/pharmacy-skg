/** Shared by the build script and the tests; no imports, so plain Node can load it. */

/** What the build treats as today (PHARMACY_TODAY): the duty lists 2026-09-28..2026-10-08 exist. */
export const BUILD_TODAY = '2026-10-05';

/** The site URL baked into canonical and hreflang links by the test build. */
export const SITE_URL = 'https://pharmacy-skg.test';

/** The moment the browser clock is fixed to: Monday night, only duty pharmacies are open. */
export const NOW = '2026-10-05T22:30:00+03:00';

/** Aristotelous Square, the device position in the tests. */
export const POSITION = { latitude: 40.6326, longitude: 22.9409 };

/** A pharmacy, a duty date and an area that exist in data/thessaloniki. */
export const PHARMACY_ID = '2310023026';
export const DUTY_DATE = '2026-10-05';
export const AREA_SLUG = 'kalamaria';
