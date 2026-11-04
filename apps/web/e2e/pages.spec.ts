import { LOCALES } from '@pharmacy-skg/core';
import type { Locale } from '@pharmacy-skg/core';
import { areaPath, dutyPath, pharmacyPath } from '../src/i18n/routes.ts';
import { AREA_KEY } from '../src/lib/storage.ts';
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

test('the pharmacy page answers what to do when it is closed', async ({ page }) => {
  await page.goto(pharmacyPath('el', PHARMACY_ID));
  // Neighbours are in the page itself; the ones open now take their place.
  await expect(page.locator('[data-near-heading]')).toHaveText('Ανοιχτά τώρα κοντά');
  await expect(page.locator('[data-near-list] > li')).toHaveCount(4);
  await expect(page.locator('[data-near-list] > li').first()).toContainText(/Εφημερεύει/);
  // The coming days replace the general hours, today first.
  await expect(page.locator('[data-week] > li')).toHaveCount(7);
  await expect(page.locator('[data-week] > li').first()).toContainText('Σήμερα');
  await expect(page.locator('[data-hours-static]')).toBeHidden();
});

test('an English pharmacy page is readable without Greek and keeps the Greek for the sign', async ({
  page,
}) => {
  await page.goto(pharmacyPath('en', PHARMACY_ID));
  await expect(page.locator('h1')).toHaveText('Kourtidis Georgios');
  await expect(page.locator('.seo-native[lang="el"]').first()).toContainText('ΚΟΥΡΤΙΔΗΣ');
});

test('the map on a pharmacy page opens the big map on that pharmacy', async ({
  page,
  isMobile,
}) => {
  await page.goto(pharmacyPath('el', PHARMACY_ID));
  await page.locator('.seo-map-link').click();
  await expect(page).toHaveURL(/\/$/);
  // A phone lowers the sheet to the pharmacy's card; a wide screen opens its row in the list.
  const chosen = isMobile ? '.peek' : `#row-${PHARMACY_ID}[data-open]`;
  await expect(page.locator(chosen)).toContainText('ΚΟΥΡΤΙΔΗΣ ΓΕΩΡΓΙΟΣ');
});

test('an area page is the app, opened on that area', async ({ page }) => {
  await page.goto(areaPath('el', CITY_ID, AREA_SLUG));
  await expect(page.locator('.status-line')).toContainText('Κοντά σε: Καλαμαριά');
  await expect(page.locator('.seo-page')).toHaveCount(0);
  // Arriving from a search is not a choice: the person's own area stays as it was.
  expect(await page.evaluate((key) => localStorage.getItem(key), AREA_KEY)).toBeNull();
});

test('an English area page names the area in English', async ({ page }) => {
  await page.goto(areaPath('en', CITY_ID, AREA_SLUG));
  await expect(page.locator('.status-line')).toContainText('Near: Kalamaria');
});

test('an area page keeps its lists for search engines', async ({ request }) => {
  const html = await (await request.get(areaPath('el', CITY_ID, AREA_SLUG))).text();
  expect(html).toContain('<h1>Φαρμακεία: Καλαμαριά</h1>');
  expect(html).toMatch(/href="\/farmakeio\/\d+\/"/);
});

test('the duty-date page marks the fixed date as today', async ({ page }) => {
  await page.goto(dutyPath('en', CITY_ID, DUTY_DATE));
  await expect(page.locator('h1')).toContainText(/today/i);
});
