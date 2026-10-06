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
      // The emergency numbers are at the end of the list, a tel: link each.
      await expect(page.locator('.sheet-footer a[href^="tel:"]')).toHaveCount(3);
      expect(consoleErrors).toEqual([]);
    });

    test('lists the open pharmacies nearest first, each with a status label', async ({ page }) => {
      await page.goto(HOME[locale]);
      await waitForRows(page);

      // The position is asked for when the app opens: no button needs to be found.
      await expect(page.locator('.origin-chip')).toContainText(text.app.origin.myLocation);

      const rows = page.locator('ol.rows > li.row');
      const count = await rows.count();
      expect(count).toBeGreaterThan(3);

      const distances: number[] = [];
      for (const row of await rows.all()) {
        // At 22:30 on a Monday only the pharmacies on the duty list are open.
        // (A list entry without printed hours adds "call first" to the label.)
        const status = (await row.locator('.row-status strong').innerText()).trim();
        expect(status).toBe(text.app.status.short.duty);
        const shown = (await row.locator('.row-distance').innerText()).trim();
        const [value = '', unit = ''] = shown.split(/\s+/);
        const number = Number(value.replace(',', '.'));
        expect(Number.isNaN(number), shown).toBe(false);
        distances.push(unit === 'km' || unit === 'χλμ' ? number * 1000 : number);
      }
      // Distances are rounded for display, so equal neighbours are fine.
      expect(distances).toEqual([...distances].sort((a, b) => a - b));
      expect(distances[0]).toBeLessThan(3000);
    });

    test('the button in the options asks for the position again', async ({ page }) => {
      await page.goto(HOME[locale]);
      await waitForRows(page);
      await openControls(page);

      await page
        .locator('#controls')
        .getByRole('button', { name: text.app.origin.useLocation })
        .click();
      await expect(page.locator('ol.rows > li.row .row-distance').first()).toBeVisible();
      await expect(page.locator('.origin-chip')).toContainText(text.app.origin.myLocation);
    });

    test('finds Καλαμαριά by typing "kalamaria" in the area picker', async ({ page }) => {
      await page.goto(HOME[locale]);
      await waitForRows(page);
      await openControls(page);

      await page.getByRole('button', { name: text.app.origin.areaLabel, exact: true }).click();
      await page.getByLabel(text.app.origin.areaSearch).fill('kalamaria');
      const option = page.locator('.picker-item', { hasText: 'Καλαμαριά' });
      await expect(option).toHaveCount(1);
      await option.click();

      await expect(page.locator('.origin-chip')).toContainText('Καλαμαριά');
      await expect(page.locator('ol.rows > li.row .row-distance').first()).toBeVisible();
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

  test('opening a row (which shows it on the map) does not wait for the timer either', async ({
    page,
  }) => {
    await page.goto('/');
    const rows = await waitForRows(page);
    await expect(page.locator(idle)).toBeAttached();
    // Opening a row's details also shows it on the map.
    await rows.first().locator('.row-toggle').click();
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
      '.maplibregl-ctrl-zoom-in, .maplibregl-ctrl-zoom-out, .maplibregl-ctrl-locate, .maplibregl-ctrl-attrib-button, .maplibregl-ctrl-attrib-inner a',
    );
    expect(await targets.count()).toBeGreaterThanOrEqual(7);
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
        // A row's name button draws its ring on the row-wide ::after.
        const after = getComputedStyle(element, '::after');
        const ring = after.outlineStyle !== 'none' && parseFloat(after.outlineWidth) >= 2;
        return {
          label: `${element.tagName} ${element.className} ${element.textContent?.slice(0, 20) ?? ''}`,
          visible: outline || shadow || ring,
          // Inside the screen.
          obscured: rect.bottom < 0,
        };
      });
      if (info === null) continue;
      seen.add(info.label);
      expect(info.visible, `focus ring on ${info.label}`).toBe(true);
      expect(info.obscured, `${info.label} is off screen`).toBe(false);
    }
    expect(seen.size).toBeGreaterThan(10);
  });
});
