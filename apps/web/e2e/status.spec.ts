import { readFileSync } from 'node:fs';
import { CITIES, LOCALES } from '@pharmacy-skg/core';
import type { Meta } from '@pharmacy-skg/core';
import { t } from '../src/i18n/index.ts';
import { localizedPath } from '../src/i18n/routes.ts';
import { dutyUntilDate, formatChecked } from '../src/lib/data-status.ts';
import { SITE_URL } from './constants.ts';
import { expect, test } from './support.ts';

/** What the page is built from: the repository's own data (not the copy the build serves). */
function metaOf(cityId: string): Meta {
  return JSON.parse(
    readFileSync(new URL(`../../../data/${cityId}/meta.json`, import.meta.url), 'utf8'),
  ) as Meta;
}

for (const locale of LOCALES) {
  const d = t(locale).dataStatus;
  const path = localizedPath(locale, 'status');

  test.describe(`data status page (${locale})`, () => {
    test('is a plain table: each area, when it was checked, the duty days covered', async ({
      page,
      consoleErrors,
    }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('h1')).toHaveText(d.title);
      await expect(page.locator('main p').first()).toHaveText(d.summary);

      await expect(page.locator('thead th')).toHaveText([d.area, d.checked, d.duties]);
      const rows = page.locator('tbody tr');
      await expect(rows).toHaveCount(CITIES.length);
      for (const [index, city] of CITIES.entries()) {
        const row = rows.nth(index);
        const meta = metaOf(city.id);
        await expect(row.locator('th')).toHaveText(city.name[locale]);
        const checked = meta.checkedAt ?? meta.updatedAt;
        await expect(row.locator('time')).toHaveText(formatChecked(checked, locale, city.timeZone));
        await expect(row.locator('time')).toHaveAttribute('datetime', checked);
        await expect(row.locator('td').nth(1)).toBeVisible();
        // How far ahead the lists go, not where the kept history starts.
        const duties =
          meta.duties === null
            ? d.noDuties
            : d.until.replace('{date}', dutyUntilDate(meta.duties.to, locale, new Date()));
        await expect(row.locator('td').nth(1)).toHaveText(duties);
      }
      expect(consoleErrors).toEqual([]);
    });

    test('says in words whether each area is up to date, and works it out from the clock', async ({
      page,
    }) => {
      await page.goto(path);
      // Every row has exactly one status word, and no row is only a colour.
      const rows = page.locator('tbody tr');
      for (const row of await rows.all()) {
        await expect(row.locator('.verdict:visible')).toHaveCount(1);
        await expect(row.locator('.verdict:visible')).toHaveText(/\S/);
      }
      // Well after every check (36 hours is the limit), each row is old.
      await page.clock.setFixedTime(new Date('2027-03-01T12:00:00Z'));
      await page.reload();
      for (const row of await rows.all()) {
        await expect(row.locator('.verdict:visible')).toHaveText(d.stale);
      }
    });

    test('fits a phone: no sideways scroll at 320 px', async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(path);
      await expect(page.locator('table')).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test('is not indexed, and says which language it is in, with its pair', async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `${SITE_URL}${path}`,
      );
      for (const other of LOCALES) {
        await expect(page.locator(`link[rel="alternate"][hreflang="${other}"]`)).toHaveAttribute(
          'href',
          `${SITE_URL}${localizedPath(other, 'status')}`,
        );
      }
      const other = LOCALES.find((l) => l !== locale) ?? locale;
      await expect(page.locator('nav.switcher a')).toHaveAttribute(
        'href',
        localizedPath(other, 'status'),
      );
    });
  });
}

test('the about page links to the status page once, and nothing else does', async ({
  page,
  request,
}) => {
  for (const locale of LOCALES) {
    const link = (target: string) => `a[href="${localizedPath(locale, 'status')}"]${target}`;
    await page.goto(localizedPath(locale, 'about'));
    await expect(page.locator(link(''))).toHaveCount(1);
    await expect(page.locator(link(''))).toHaveText(t(locale).about.dataStatusLink);

    // Not from the home screen, the other pages or their footers.
    for (const other of ['home', 'privacy', 'report'] as const) {
      await page.goto(localizedPath(locale, other));
      await expect(page.locator(link(''))).toHaveCount(0);
    }
  }
  // Not in the sitemap, and not in the home screen's sheet once it has loaded.
  // /sitemap.xml lists the sitemaps (one for the pages of no city, one per city): read them all.
  const index = await (await request.get('/sitemap.xml')).text();
  const sitemapUrls = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] ?? '');
  expect(sitemapUrls.length).toBeGreaterThan(1);
  for (const url of sitemapUrls) {
    const sitemap = await (await request.get(new URL(url).pathname)).text();
    expect(sitemap).toContain('<urlset');
    for (const locale of LOCALES) {
      expect(sitemap).not.toContain(localizedPath(locale, 'status'));
    }
  }
});
