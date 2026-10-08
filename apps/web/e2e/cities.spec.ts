import { t } from '../src/i18n/index.ts';
import { expect, test, waitForMap, waitForRows } from './support.ts';

const text = t('el').app;
/** Tuesday night: Larissa's lists start on 6 Oct 2026 (day duty until 23:00, one overnight). */
const NIGHT_IN_LARISSA = '2026-10-06T22:30:00+03:00';
/** Κεντρική Πλατεία, Λάρισα. */
const LARISSA = { latitude: 39.639, longitude: 22.4191 };

test.use({ now: NIGHT_IN_LARISSA });

test.describe('another city', () => {
  test.use({ permissions: [] });

  test('is offered in the area picker; choosing it shows its pharmacies on duty, and the next visit opens there', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForRows(page);
    await expect(page.getByText(text.summary.dutyOnly)).toHaveCount(0);

    await page
      .locator('.nearby')
      .getByRole('button', { name: text.origin.areaLabel, exact: true })
      .click();
    await page.getByLabel(text.origin.areaSearch).fill('lar');
    await page.locator('.picker-item', { hasText: 'Λάρισα' }).first().click();

    await expect(page.getByText(text.summary.dutyOnly)).toBeVisible();
    await expect(page.locator('.origin-chip')).toContainText('Λάρισα');
    const rows = await waitForRows(page);
    await expect(rows.first()).toContainText('Εφημερεύει');
    expect(await page.evaluate(() => localStorage.getItem('pharmacy-skg:city'))).toBe('larisa');

    await page.reload();
    await waitForRows(page);
    await expect(page.getByText(text.summary.dutyOnly)).toBeVisible();
  });
});

test.describe('moving the map', () => {
  test.use({ permissions: [] });

  test('into another city shows its pharmacies, without typing it', async ({ page }) => {
    // Without the animations each move ends at once.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await waitForRows(page);
    await waitForMap(page);
    await expect(page.getByText(text.summary.dutyOnly)).toHaveCount(0);

    // From Thessaloniki at zoom 12 out to 9, then south, past Pieria, into Larissa.
    const zoomOut = page.locator('.maplibregl-ctrl-zoom-out');
    for (let i = 0; i < 3; i++) await zoomOut.click();
    await page.locator('.maplibregl-canvas').focus();
    const shown = () => page.evaluate(() => localStorage.getItem('pharmacy-skg:city'));
    await expect(async () => {
      await page.keyboard.press('ArrowDown');
      expect(await shown()).toBe('larisa');
    }).toPass({ timeout: 15_000 });

    // Its list, under the map that moved there (on a phone the list is lowered by then), and
    // announced with its own count.
    await expect(page.locator('ol.rows > li.row').first()).toContainText('Εφημερεύει');
    const count = await page.locator('.summary').first().textContent();
    await expect(page.locator('.sr-only[role="status"]')).toContainText(count ?? '-');
  });
});

test.describe('a position in another city', () => {
  test.use({ geolocation: LARISSA });

  test('opens that city', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(text.summary.dutyOnly)).toBeVisible();
    const rows = await waitForRows(page);
    // The nearest on duty leads; distances are short.
    await expect(rows.first()).toContainText(/\d+ μ|\d+,\d χλμ/);
    expect(await page.evaluate(() => localStorage.getItem('pharmacy-skg:city'))).toBe('larisa');
  });
});

test.describe("a city's page for today", () => {
  test('opens the app on that city, though the position found by itself is in another', async ({
    page,
  }) => {
    // The fixtures' position is in Thessaloniki; the person searched for Larissa.
    await page.goto('/efimeries/larisa/');
    await expect(page.getByText(text.summary.dutyOnly)).toBeVisible();
    const rows = await waitForRows(page);
    await expect(rows.first()).toContainText('Εφημερεύει');
    await expect(page.locator('h1')).toHaveText('Εφημερεύοντα φαρμακεία σήμερα, Λάρισα');
    expect(await page.evaluate(() => localStorage.getItem('pharmacy-skg:city'))).toBeNull();
  });

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test("is that day's published lists", async ({ page }) => {
      await page.goto('/efimeries/larisa/');
      await expect(page.locator('h1')).toContainText('Εφημερεύοντα φαρμακεία, Λάρισα,');
      await expect(page.locator('.seo-group').first()).toBeVisible();
      await expect(page.locator('.seo-breadcrumb a')).toHaveAttribute('href', '/efimeries/');
    });
  });
});

test.describe('favourites in another city', () => {
  test.use({ autoLocate: false });

  test('are one button that switches to that city', async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem(
        'pharmacy-skg:favourites',
        JSON.stringify(['2310023026', 'larisa/2410672566']),
      ),
    );
    await page.goto('/');
    await waitForRows(page);
    await page.getByRole('tab', { name: /Αγαπημένα/ }).click();
    const elsewhere = page.getByRole('button', { name: 'Λάρισα: 1 αγαπημένο' });
    await expect(elsewhere).toBeVisible();
    await elsewhere.click();
    await expect(page.locator('ol.rows > li.row')).toContainText(['ΔΑΣΤΑΜΑΝΗΣ']);
    await expect(page.getByRole('button', { name: 'Θεσσαλονίκη: 1 αγαπημένο' })).toBeVisible();
  });
});
