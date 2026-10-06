import { t } from '../src/i18n/index.ts';
import { expect, test, waitForRows } from './support.ts';

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
