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
      // The emergency numbers are in view at all times.
      for (const link of await page.locator('.emergency a[href^="tel:"]').all()) {
        await expect(link).toBeInViewport();
      }
      // The sheet reaches the bottom edge of the screen (no page below it).
      const sheet = await page.locator('.sheet').boundingBox();
      expect((sheet?.y ?? 0) + (sheet?.height ?? 0)).toBeCloseTo(size.height, 0);
    });
  }

  test('the strip and the header together are at most 100 px high', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 664 });
    await page.goto('/');
    await waitForRows(page);
    const strip = await page.locator('.emergency').boundingBox();
    const header = await page.locator('.site-header').boundingBox();
    expect((strip?.height ?? 0) + (header?.height ?? 0)).toBeLessThanOrEqual(100);
    // The header is one row.
    expect(header?.height ?? 0).toBeLessThanOrEqual(48);
    // Every number is a tel: link with a tap area at least 44 px high.
    const links = page.locator('.emergency a[href^="tel:"]');
    expect(await links.count()).toBe(3);
    for (const link of await links.all()) {
      const box = await link.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.5);
    }
  });

  test('the sheet ends with a compact footer: links and the disclaimer', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 664 });
    await page.goto('/');
    await waitForRows(page);
    const footer = page.locator('.sheet-footer');
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeInViewport();
    const text = t('el').app.footer;
    const links = footer.locator('a');
    await expect(links).toHaveText([text.about, text.privacy, text.report, text.sources]);
    await expect(links.nth(0)).toHaveAttribute('href', localizedPath('el', 'about'));
    await expect(links.nth(3)).toHaveAttribute('href', `${localizedPath('el', 'about')}#credits`);
    await expect(footer).toContainText(text.disclaimer);
    // One row of links on a phone.
    const first = await links.nth(0).boundingBox();
    const last = await links.nth(3).boundingBox();
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
    test(`about page (${locale}): links, freshness, one credits line and the disclaimer`, async ({
      page,
    }) => {
      await page.goto(localizedPath(locale, 'about'));
      const footer = page.locator('footer.site-footer');
      await expect(footer).toBeVisible();
      const d = t(locale).footer;
      await expect(footer.locator('nav a')).toHaveCount(5);
      await expect(footer).toContainText(d.lastUpdatedLabel);
      await expect(footer).toContainText(d.creditsLine);
      await expect(footer.getByRole('link', { name: d.creditsMore })).toHaveAttribute(
        'href',
        `${localizedPath(locale, 'about')}#credits`,
      );
      await expect(footer).toContainText(d.disclaimer);
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
    const dutyCount = Number(
      (await page.locator('.chip').nth(1).innerText()).match(/\((\d+)\)/)?.[1],
    );
    const allCount = Number(
      (await page.locator('.chip').nth(0).innerText()).match(/\((\d+)\)/)?.[1],
    );
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
