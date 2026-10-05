import { LOCALES } from '@pharmacy-skg/core';
import { t } from '../src/i18n/index.ts';
import { expect, openControls, test, waitForMap, waitForRows } from './support.ts';

const HOME = { el: '/', en: '/en/' } as const;

for (const locale of LOCALES) {
  const text = t(locale);

  test.describe(`home (${locale})`, () => {
    test('loads with the right language, the map and no console errors', async ({
      page,
      consoleErrors,
    }) => {
      await page.goto(HOME[locale]);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page).toHaveTitle(/\S/);
      await waitForRows(page);
      await waitForMap(page);
      // The sticky emergency strip is there with a tel: link for every number.
      const strip = page.getByRole('complementary', { name: text.emergency.label });
      await expect(strip.locator('a[href^="tel:"]')).toHaveCount(3);
      expect(consoleErrors).toEqual([]);
    });

    test('lists the open pharmacies nearest first, each with a status label', async ({ page }) => {
      await page.goto(HOME[locale]);
      await waitForRows(page);
      await openControls(page);

      await page.getByRole('button', { name: text.app.origin.useLocation }).click();
      await expect(page.getByText(text.app.origin.privacy).first()).toBeAttached();
      await expect(page.locator('.summary')).toContainText(
        text.app.summary.sortedByDistance.replace('{origin}', text.app.origin.myLocation),
      );

      const rows = page.locator('ol.rows > li.row');
      const count = await rows.count();
      expect(count).toBeGreaterThan(3);

      const distances: number[] = [];
      for (const row of await rows.all()) {
        // At 22:30 on a Monday only the pharmacies on the duty list are open.
        // (A list entry without printed hours adds "call first" to the label.)
        const status = (await row.locator('.row-status strong').innerText()).trim();
        expect(status.startsWith(text.status.onDuty), status).toBe(true);
        const shown = (await row.locator('.row-distance').innerText()).trim();
        const [value = '', unit = ''] = shown.split(/\s+/);
        const number = Number(value.replace(',', '.'));
        expect(Number.isNaN(number), shown).toBe(false);
        distances.push(unit === 'km' ? number * 1000 : number);
      }
      // Distances are rounded for display, so equal neighbours are fine.
      expect(distances).toEqual([...distances].sort((a, b) => a - b));
      expect(distances[0]).toBeLessThan(3000);
    });

    test('finds Καλαμαριά by typing "kalamaria" in the area picker', async ({ page }) => {
      await page.goto(HOME[locale]);
      await waitForRows(page);
      await openControls(page);

      await page.getByRole('button', { name: text.app.origin.areaLabel }).click();
      await page.getByLabel(text.app.origin.areaSearch).fill('kalamaria');
      const option = page.locator('.picker-item', { hasText: 'Καλαμαριά' });
      await expect(option).toHaveCount(1);
      await option.click();

      await expect(page.locator('.summary')).toContainText('Καλαμαριά');
      await expect(page.locator('ol.rows > li.row').first()).toBeVisible();
    });
  });
}

test.describe('when the map starts', () => {
  const idle = '.map[data-status="idle"]';
  const ready = '.map[data-status="ready"]';

  test('the list comes first and the map starts by itself a few seconds later', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForRows(page);
    await expect(page.locator(idle)).toBeAttached();
    // The area says the map is on its way instead of staying blank.
    await expect(page.locator('.map-note')).toHaveText(t('el').app.map.loading);
    // Pass the start delay (use-map-start.ts) and the wait for an idle moment.
    await page.clock.fastForward(10_000);
    await expect(page.locator(ready)).toBeAttached({ timeout: 20_000 });
    await expect(page.locator('.map-note')).toHaveCount(0);
  });

  test('reaching for the map starts it at once', async ({ page }) => {
    await page.goto('/');
    await waitForRows(page);
    await expect(page.locator(idle)).toBeAttached();
    const box = await page.locator('.map-area').boundingBox();
    if (box === null) throw new Error('no map area');
    // The top of the map: on a phone the sheet covers the lower part.
    await page.mouse.move(box.x + box.width / 2, box.y + 120);
    await expect(page.locator(ready)).toBeAttached({ timeout: 20_000 });
  });

  test('"show on map" does not wait for the timer either', async ({ page }) => {
    await page.goto('/');
    const rows = await waitForRows(page);
    await expect(page.locator(idle)).toBeAttached();
    await rows
      .first()
      .getByRole('button', { name: t('el').app.row.showOnMap })
      .click();
    await expect(page.locator(ready)).toBeAttached({ timeout: 20_000 });
    await expect(rows.first()).toHaveAttribute('data-selected', 'true');
  });
});

test.describe('touch targets and focus', () => {
  test('the map controls are at least 44 by 44 px', async ({ page }) => {
    await page.goto('/');
    await waitForRows(page);
    await waitForMap(page);
    // On a phone the credit is collapsed behind a toggle: open it to measure the links too.
    const toggle = page.locator('summary.maplibregl-ctrl-attrib-button');
    if (await toggle.isVisible()) await toggle.click();
    const targets = page.locator(
      '.maplibregl-ctrl-zoom-in, .maplibregl-ctrl-zoom-out, .maplibregl-ctrl-attrib-button, .maplibregl-ctrl-attrib-inner a',
    );
    expect(await targets.count()).toBeGreaterThanOrEqual(6);
    for (const target of await targets.all()) {
      if (!(await target.isVisible())) continue;
      const box = await target.boundingBox();
      const name = await target.evaluate((element) => element.className || element.textContent);
      expect(box?.width ?? 0, `${name} width`).toBeGreaterThanOrEqual(43.5);
      expect(box?.height ?? 0, `${name} height`).toBeGreaterThanOrEqual(43.5);
    }
  });

  test('keyboard focus is visible on the controls of the page', async ({ page }) => {
    await page.goto('/');
    await waitForRows(page);
    await waitForMap(page);
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const element = document.activeElement;
        if (element === null || element === document.body) return null;
        const style = getComputedStyle(element);
        const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
        const shadow = style.boxShadow !== 'none';
        const rect = element.getBoundingClientRect();
        // The skip link is drawn above the strip on purpose (z-index); the strip's own links are it.
        const skipLink =
          element.classList.contains('skip-link') || element.closest('.emergency') !== null;
        return {
          label: `${element.tagName} ${element.className} ${element.textContent?.slice(0, 20) ?? ''}`,
          visible: outline || shadow,
          // Not hidden behind the sticky emergency strip.
          obscured:
            !skipLink &&
            rect.top <
              (document.querySelector('.emergency')?.getBoundingClientRect().bottom ?? 0) &&
            rect.bottom > 0,
        };
      });
      if (info === null) continue;
      seen.add(info.label);
      expect(info.visible, `focus ring on ${info.label}`).toBe(true);
      expect(info.obscured, `${info.label} is behind the emergency strip`).toBe(false);
    }
    expect(seen.size).toBeGreaterThan(10);
  });
});

test('a focused element is never hidden behind the sticky emergency strip (WCAG 2.4.11)', async ({
  page,
}) => {
  await page.goto('/plirofories/');
  const strip = page.locator('.emergency');
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const state = await page.evaluate(() => {
      const element = document.activeElement;
      const bar = document.querySelector('.emergency');
      if (element === null || element === document.body || bar === null) return null;
      // The skip link is drawn above the strip; the strip's own links are the strip.
      if (element.closest('.emergency') !== null || element.classList.contains('skip-link')) {
        return null;
      }
      return {
        label: `${element.tagName} ${element.textContent?.slice(0, 20) ?? ''}`,
        top: element.getBoundingClientRect().top,
        stripBottom: bar.getBoundingClientRect().bottom,
      };
    });
    if (state !== null) {
      expect(state.top, state.label).toBeGreaterThanOrEqual(state.stripBottom - 0.5);
    }
  }
  // The measured height is published for scroll-padding.
  const published = await page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--emergency-height'),
  );
  const box = await strip.boundingBox();
  expect(parseFloat(published)).toBeCloseTo(box?.height ?? 0, 0);
});

test('a map chunk that cannot be fetched (an old page after a deploy) shows the map note and the reload offer, and the list keeps working', async ({
  page,
}) => {
  await page.route('**/_astro/map-controller.*.js', (route) => route.abort());
  await page.goto('/');
  const rows = await waitForRows(page);
  await page.locator('.map-area').dispatchEvent('pointerdown');
  await expect(page.locator('.map-note')).toHaveText(t('el').app.map.loadFailed);
  const toast = page.locator('.update-toast');
  await expect(toast.getByRole('button', { name: t('el').update.reload })).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(3);
});
