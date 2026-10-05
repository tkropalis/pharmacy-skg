import { t } from '../src/i18n/index.ts';
import { expect, openControls, test, waitForRows } from './support.ts';

const text = t('el').app;

const PHONES = [
  { width: 390, height: 844 },
  { width: 360, height: 740 },
  { width: 320, height: 640 },
] as const;

test.describe('the first pharmacy is on screen without scrolling', () => {
  for (const size of PHONES) {
    test(`at ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('/');
      const rows = await waitForRows(page);
      const name = rows.first().locator('.row-name');
      const status = rows.first().locator('.row-status');
      await expect(name).toBeInViewport();
      await expect(status).toBeInViewport();
      // The controls are folded away on a phone and open with one tap.
      await expect(page.locator('details.panel')).not.toHaveAttribute('open', '');
    });
  }
});

test.describe('a day whose file has only some area groups', () => {
  // 1 Oct 2026 has the metro list only.
  test.use({ now: '2026-10-01T22:30:00+03:00' });

  test('warns, naming the groups, and prominently for the origin’s group', async ({ page }) => {
    await page.goto('/');
    await waitForRows(page);
    // Without an origin: the missing groups are listed.
    await expect(page.getByRole('note').filter({ hasText: 'Δήμος Θέρμης' })).toBeVisible();

    await openControls(page);
    await page.getByRole('button', { name: text.origin.areaLabel }).click();
    await page.getByLabel(text.origin.areaSearch).fill('thermi');
    await page.locator('.picker-item').first().click();

    const alert = page.getByRole('alert').filter({ hasText: 'Δήμος Θέρμης' });
    await expect(alert).toContainText(/ακόμη/);
    await expect(alert).toHaveClass(/danger/);
  });

  test('marks the rows of pharmacies in an unpublished group', async ({ page }) => {
    await page.goto('/');
    await waitForRows(page);
    await openControls(page);
    await page.getByRole('checkbox', { name: text.filters.showClosed }).check();
    await expect(page.locator('li.row .row-warning').first()).toHaveText(text.row.dutiesMissing);
  });
});

test.describe('duty lists that are still loading', () => {
  test('show a loading state, not "none open" or "not published", and announce once loaded', async ({
    page,
  }) => {
    const lateDays = ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));

    await page.route('**/data/thessaloniki/meta.json', async (route) => {
      const response = await route.fetch();
      const meta = (await response.json()) as { duties: { to: string } };
      meta.duties.to = '2026-10-13';
      await route.fulfill({ response, json: meta });
    });
    for (const date of lateDays) {
      await page.route(`**/data/thessaloniki/duties/${date}.json`, async (route) => {
        const original = await route.fetch({
          url: route.request().url().replace(date, '2026-10-08'),
        });
        const day = (await original.json()) as { date: string };
        day.date = date;
        await gate;
        await route.fulfill({ response: original, json: day });
      });
    }

    await page.goto('/');
    await waitForRows(page);
    await openControls(page);
    await page.getByRole('button', { name: text.time.other }).click();
    await page.getByLabel(text.time.date).fill('2026-10-11');

    const panel = page.locator('#panel');
    await expect(panel.getByText(text.time.loadingDuties).first()).toBeVisible();
    await expect(page.locator('ol.rows')).toHaveCount(0);
    await expect(panel.getByText(text.list.noneOpen)).toHaveCount(0);
    await expect(panel.getByText(text.time.dutyNotPublished)).toHaveCount(0);
    // Nothing is announced while the answer is not known.
    await expect(page.locator('[role="status"][data-map]')).toHaveText('');

    release();
    await expect(page.locator('ol.rows > li.row').first()).toBeVisible();
    await expect(panel.getByText(text.time.loadingDuties)).toHaveCount(0);
    await expect(page.locator('[role="status"][data-map]')).not.toHaveText('');
  });
});
