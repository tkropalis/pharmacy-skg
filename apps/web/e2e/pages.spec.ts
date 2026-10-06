import { LOCALES } from '@pharmacy-skg/core';
import type { Locale } from '@pharmacy-skg/core';
import { areaPath, dutyPath, pharmacyPath } from '../src/i18n/routes.ts';
import { CITY_ID, AREA_SLUG, DUTY_DATE, PHARMACY_ID, SITE_URL } from './constants.ts';
import { expect, test } from './support.ts';

const PAGES = {
  pharmacy: (locale: Locale) => pharmacyPath(locale, PHARMACY_ID),
  duty: (locale: Locale) => dutyPath(locale, CITY_ID, DUTY_DATE),
  area: (locale: Locale) => areaPath(locale, CITY_ID, AREA_SLUG),
};

for (const [name, pathFor] of Object.entries(PAGES)) {
  for (const locale of LOCALES) {
    test(`${name} page (${locale}) has the right lang, canonical and hreflang`, async ({
      page,
      consoleErrors,
    }) => {
      const path = pathFor(locale);
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);

      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).not.toBeEmpty();
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `${SITE_URL}${path}`,
      );
      for (const other of LOCALES) {
        await expect(page.locator(`link[rel="alternate"][hreflang="${other}"]`)).toHaveAttribute(
          'href',
          `${SITE_URL}${pathFor(other)}`,
        );
      }
      await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
        'href',
        `${SITE_URL}${pathFor('el')}`,
      );
      // The language switcher goes to the same page in the other locale.
      const other = LOCALES.find((l) => l !== locale) ?? locale;
      await expect(page.locator('nav.switcher a')).toHaveAttribute('href', pathFor(other));
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
        'content',
        `${SITE_URL}/og-image.png`,
      );
      expect(consoleErrors).toEqual([]);
    });
  }
}

test('the pharmacy page works out its status in the browser from the fixed clock', async ({
  page,
}) => {
  await page.goto(pharmacyPath('el', PHARMACY_ID));
  // Monday 22:30: regular hours are over, so it is closed unless it is on the duty list.
  await expect(page.locator('[data-pharmacy-status]')).toContainText(/Εφημερεύει|Κλειστό τώρα/);
});

test('the duty-date page marks the fixed date as today', async ({ page }) => {
  await page.goto(dutyPath('en', CITY_ID, DUTY_DATE));
  await expect(page.locator('h1')).toContainText(/today/i);
});
