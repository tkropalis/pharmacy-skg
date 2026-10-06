import { t } from '../src/i18n/index.ts';
import { expect, test, waitForRows } from './support.ts';

const text = t('el').app;

test.describe('kept on the device for the person', () => {
  test.use({ autoLocate: false });

  test('the areas chosen recently come first in the area picker', async ({ page }) => {
    await page.goto('/');
    await waitForRows(page);
    const pick = async (query: string, name: string) => {
      await page
        .locator('.nearby, #controls')
        .getByRole('button', { name: text.origin.areaLabel, exact: true })
        .first()
        .click();
      await page.getByLabel(text.origin.areaSearch).fill(query);
      await page.locator('.picker-item', { hasText: name }).first().click();
      await expect(page.locator('.origin-chip')).toContainText(name);
    };
    await pick('kalamaria', 'Καλαμαριά');
    await page.locator('.origin-chip').click();
    await pick('thermi', 'Θέρμη');

    await page.locator('.origin-chip').click();
    await page
      .locator('#controls')
      .getByRole('button', { name: text.origin.areaLabel, exact: true })
      .click();
    const dialog = page.locator('dialog.ap');
    const recent = dialog.getByRole('list', { name: text.origin.areaRecent });
    await expect(recent.locator('.picker-item')).toHaveCount(2);
    await expect(recent.locator('.picker-item').nth(0)).toContainText('Θέρμη');
    await expect(recent.locator('.picker-item').nth(1)).toContainText('Καλαμαριά');
    // Typing searches every area as before.
    await page.getByLabel(text.origin.areaSearch).fill('kal');
    await expect(recent).toHaveCount(0);
  });

  test('the pharmacies opened on two visits or more show under the favourites', async ({
    page,
  }) => {
    await page.goto('/');
    const rows = await waitForRows(page);
    const first = rows.first();
    const id = ((await first.getAttribute('id')) ?? '').replace('row-', '');
    await first.locator('.row-toggle').click();
    const stored = () =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem('pharmacy-skg:visits') ?? '{}')[key],
        id,
      );
    expect((await stored())?.[0]).toBe(1);

    await page.getByRole('tab', { name: text.tabs.favourites }).click();
    await expect(page.getByRole('heading', { name: text.favourites.frequent })).toHaveCount(0);

    // A second visit, an hour later: the clock moves on, the page is opened again.
    await page.clock.fastForward('01:00:00');
    await page.goto(`/farmakeio/${id}/`);
    await page.goto('/');
    await waitForRows(page);
    expect((await stored())?.[0]).toBe(2);
    await page.getByRole('tab', { name: text.tabs.favourites }).click();
    const frequent = page.getByRole('list', { name: text.favourites.frequent });
    await expect(frequent.locator('li.row')).toHaveCount(1);
    await expect(frequent.locator(`#row-${id}`)).toBeVisible();
  });
});
