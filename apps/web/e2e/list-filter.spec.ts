import { t } from '../src/i18n/index.ts';
import { expect, test, waitForMap, waitForRows } from './support.ts';

const text = t('el').app;
const DAY = '2026-10-05T08:01:00+03:00';

function count(label: string): number {
  return Number(label.match(/\((\d+)\)/)?.[1]);
}

test.describe('by day, when more than the duty pharmacies are open', () => {
  test.use({ now: DAY, autoLocate: false });

  test('"All open" and "On duty" chips: duty only on request, and remembered', async ({ page }) => {
    await page.goto('/');
    await waitForRows(page);
    const chips = page.getByRole('group', { name: text.list.filterLabel });
    await expect(chips).toBeVisible();
    const all = chips.getByRole('button').nth(0);
    const duty = chips.getByRole('button').nth(1);
    // The default is everything.
    await expect(all).toHaveAttribute('aria-pressed', 'true');
    await expect(duty).toHaveAttribute('aria-pressed', 'false');
    const allCount = count(await all.innerText());
    const dutyCount = count(await duty.innerText());
    expect(allCount).toBeGreaterThan(1000);
    expect(dutyCount).toBeGreaterThan(0);
    expect(dutyCount).toBeLessThan(allCount);
    await expect(page.locator('.summary')).toContainText(`${allCount}`);

    await duty.click();
    await expect(duty).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.summary')).toContainText(`${dutyCount}`);
    const rows = page.locator('ol.rows > li.row');
    expect(await rows.count()).toBeGreaterThan(0);
    for (const row of await rows.all()) {
      const status = (await row.locator('.row-status strong').innerText()).trim();
      expect(status.startsWith('Εφημερεύει'), status).toBe(true);
    }
    // The choice is kept on the device, as a flag.
    expect(await page.evaluate(() => localStorage.getItem('pharmacy-skg:filter'))).toBe('duty');
    await page.reload();
    await waitForRows(page);
    await expect(
      page.getByRole('group', { name: text.list.filterLabel }).getByRole('button').nth(1),
    ).toHaveAttribute('aria-pressed', 'true');

    // And back to everything.
    await page
      .getByRole('group', { name: text.list.filterLabel })
      .getByRole('button')
      .nth(0)
      .click();
    await expect(page.locator('.summary')).toContainText(`${allCount}`);
  });

  test('the duty filter also thins the map: duty pins only, nothing to cluster', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('pharmacy-skg:filter', 'duty'));
    await page.goto('/');
    await waitForRows(page);
    await waitForMap(page);
    const map = page.locator('.map');
    await expect(map).toHaveAttribute('data-clustered-pins', '0');
    expect(Number(await map.getAttribute('data-duty-pins'))).toBeGreaterThan(0);
  });
});

test.describe('at night, when only duty pharmacies are open', () => {
  test('the chips are hidden, even if the duty filter was chosen', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('pharmacy-skg:filter', 'duty'));
    await page.goto('/');
    await waitForRows(page);
    await expect(page.getByRole('group', { name: text.list.filterLabel })).toHaveCount(0);
    expect(await page.locator('ol.rows > li.row').count()).toBeGreaterThan(3);
  });
});
