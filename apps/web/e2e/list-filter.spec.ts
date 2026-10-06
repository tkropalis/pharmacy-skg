import { t } from '../src/i18n/index.ts';
import { expect, test, waitForMap, waitForRows } from './support.ts';

const text = t('el').app;
const DAY = '2026-10-05T08:01:00+03:00';

test.describe('by day, when more than the duty pharmacies are open', () => {
  test.use({ now: DAY, autoLocate: false });

  test('the counts are the filter: duty only on request, and remembered', async ({ page }) => {
    await page.goto('/');
    await waitForRows(page);
    const chips = page.getByRole('group', { name: text.list.filterLabel });
    await expect(chips).toBeVisible();
    const all = chips.getByRole('button').nth(0);
    const duty = chips.getByRole('button').nth(1);
    // The default is everything.
    await expect(all).toHaveAttribute('aria-pressed', 'true');
    await expect(duty).toHaveAttribute('aria-pressed', 'false');
    const allCount = Number(await all.getAttribute('data-count'));
    const dutyCount = Number(await duty.getAttribute('data-count'));
    expect(allCount).toBeGreaterThan(1000);
    expect(dutyCount).toBeGreaterThan(0);
    expect(dutyCount).toBeLessThan(allCount);
    // Each option is its count in words, and the count replaces the summary line.
    await expect(all).toHaveText(text.summary.many.replace('{n}', String(allCount)));
    await expect(duty).toHaveText(text.summary.dutyMany.replace('{n}', String(dutyCount)));
    await expect(page.locator('.summary')).toHaveCount(0);

    await duty.click();
    await expect(duty).toHaveAttribute('aria-pressed', 'true');
    const rows = page.locator('ol.rows > li.row');
    expect(await rows.count()).toBeGreaterThan(0);
    for (const row of await rows.all()) {
      const status = (await row.locator('.row-status strong').innerText()).trim();
      expect(status, status).toBe(text.status.short.duty);
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
    await expect(all).toHaveAttribute('aria-pressed', 'true');
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

test.describe('by day, with a position, on the smallest phone', () => {
  test.use({ now: DAY, viewport: { width: 375, height: 667 } });

  test('both options are whole on screen, under the tabs', async ({ page }) => {
    await page.goto('/');
    await waitForRows(page);
    const chips = page.getByRole('group', { name: text.list.filterLabel });
    for (const button of await chips.getByRole('button').all()) {
      await expect(button).toBeInViewport({ ratio: 1 });
    }
    await expect(page.locator('.origin-chip')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('.fresh')).toBeInViewport();
  });
});

test.describe('at night, when only duty pharmacies are open', () => {
  test('the chips are hidden, even if the duty filter was chosen', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('pharmacy-skg:filter', 'duty'));
    await page.goto('/');
    await waitForRows(page);
    await expect(page.getByRole('group', { name: text.list.filterLabel })).toHaveCount(0);
    // The count is plain text then.
    await expect(page.locator('.summary')).toHaveText(
      new RegExp(`^${text.summary.many.replace('{n}', '\\d+')}$`),
    );
    expect(await page.locator('ol.rows > li.row').count()).toBeGreaterThan(3);
  });
});
