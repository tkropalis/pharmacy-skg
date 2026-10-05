import { LOCALES } from '@pharmacy-skg/core';
import { t } from '../src/i18n/index.ts';
import { localizedPath } from '../src/i18n/routes.ts';
import { expect, test, waitForMap, waitForRows } from './support.ts';

const HOME = { el: '/', en: '/en/' } as const;
const DAY = '2026-10-05T08:01:00+03:00';

test.describe('the home screen is an app viewport', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone layout');

  for (const size of [
    { width: 390, height: 844 },
    { width: 390, height: 664 },
  ]) {
    test(`at ${size.width}x${size.height} the page does not scroll and has no footer`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await page.goto('/');
      await waitForRows(page);

      const metrics = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        bodyScrollHeight: document.body.scrollHeight,
        innerHeight: window.innerHeight,
      }));
      expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.innerHeight + 1);
      expect(metrics.bodyScrollHeight).toBeLessThanOrEqual(metrics.innerHeight + 1);
      await page.evaluate(() => window.scrollTo(0, 400));
      expect(await page.evaluate(() => window.scrollY)).toBe(0);

      // No page footer: the sheet carries a compact one.
      await expect(page.locator('footer.site-footer')).toHaveCount(0);
      // The sheet reaches the bottom edge of the screen (no page below it).
      const sheet = await page.locator('.sheet').boundingBox();
      expect((sheet?.y ?? 0) + (sheet?.height ?? 0)).toBeCloseTo(size.height, 0);
    });
  }

  test('the header is the only bar above the map: one row, no emergency strip', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 664 });
    await page.goto('/');
    await waitForRows(page);
    await expect(page.locator('.emergency')).toHaveCount(0);
    const header = await page.locator('.site-header').boundingBox();
    expect(header?.y ?? 1).toBe(0);
    expect(header?.height ?? 0).toBeLessThanOrEqual(48);
    const map = await page.locator('.map-area').boundingBox();
    expect(map?.y ?? 0).toBeCloseTo((header?.y ?? 0) + (header?.height ?? 0), 0);
  });

  test('the sheet ends with a compact footer: links, the emergency numbers and one line', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 664 });
    await page.goto('/');
    await waitForRows(page);
    const footer = page.locator('.sheet-footer');
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeInViewport();
    const text = t('el').app.footer;
    const links = footer.locator('.footer-links a');
    await expect(links).toHaveText([text.about, text.privacy, text.report]);
    await expect(links.nth(0)).toHaveAttribute('href', localizedPath('el', 'about'));
    await expect(footer).toContainText(text.disclaimer);
    // The emergency numbers live here now, one tel: link each.
    await expect(footer.locator('a[href^="tel:"]')).toHaveCount(3);
    // One row of links on a phone.
    const first = await links.nth(0).boundingBox();
    const last = await links.nth(2).boundingBox();
    expect(Math.abs((first?.y ?? 0) - (last?.y ?? 100))).toBeLessThan(2);
    // The last line stays inside the screen, above the bottom edge.
    const box = await footer.boundingBox();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(664);
  });
});

test.describe('the language switch', () => {
  for (const locale of LOCALES) {
    const other = locale === 'el' ? 'en' : 'el';
    test(`on a phone it is a 44 px "${t(other).localeCode}" with the language's own name (${locale})`, async ({
      page,
      isMobile,
    }) => {
      await page.goto(HOME[locale]);
      const link = page.locator('nav.switcher a');
      await expect(link).toHaveAttribute('lang', other);
      await expect(link).toHaveAttribute('aria-label', t(other).localeName);
      await expect(page.getByRole('link', { name: t(other).localeName })).toBeVisible();
      const box = await link.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(43.5);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.5);
      await expect(link).toContainText(isMobile ? t(other).localeCode : t(other).localeName);
    });
  }
});

test.describe('the page footer of the other pages is compact', () => {
  for (const locale of LOCALES) {
    test(`about page (${locale}): links, then freshness and the disclaimer on one line`, async ({
      page,
    }) => {
      await page.goto(localizedPath(locale, 'about'));
      const footer = page.locator('footer.site-footer');
      await expect(footer).toBeVisible();
      const d = t(locale).footer;
      await expect(footer.locator('nav a')).toHaveCount(5);
      await expect(footer).toContainText(d.lastUpdatedLabel);
      await expect(footer).toContainText(d.disclaimer);
      await expect(footer.locator('p')).toHaveCount(1);
      // The full credits and licences are on the About page itself.
      await expect(page.locator('#credits')).toContainText('CDLA-Permissive-2.0');
      await expect(page.locator('#credits')).toContainText('ODbL');
      const box = await footer.boundingBox();
      expect(box?.height ?? 0).toBeLessThan(isNarrow(page.viewportSize()) ? 250 : 190);
    });
  }
});

function isNarrow(size: { width: number } | null): boolean {
  return (size?.width ?? 1280) < 600;
}

test.describe('the map', () => {
  test.use({ now: DAY });

  test('never clusters the duty pins: they are drawn one by one, only the rest is clustered', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForRows(page);
    await waitForMap(page);
    const dutyCount = Number(await page.locator('.chip').nth(1).getAttribute('data-count'));
    const allCount = Number(await page.locator('.chip').nth(0).getAttribute('data-count'));
    expect(dutyCount).toBeGreaterThan(0);
    const map = page.locator('.map');
    // Every pharmacy on duty is its own pin; the clustered group holds the regular and extended ones.
    await expect(map).toHaveAttribute('data-duty-pins', String(dutyCount));
    const clustered = Number(await map.getAttribute('data-clustered-pins'));
    const located = clustered + dutyCount;
    expect(located).toBeLessThanOrEqual(allCount);
    expect(clustered).toBeGreaterThan(dutyCount);
  });
});
