import { t } from '../src/i18n/index.ts';
import { expect, openControls, test, waitForRows } from './support.ts';

const text = t('el').app;

test.describe('"Το βρήκα κλειστό" on a pharmacy shown as open', () => {
  test('sends a report after one confirmation, with when and what the app showed', async ({
    page,
  }) => {
    let body: Record<string, unknown> | null = null;
    await page.route('**/api/report/', async (route) => {
      body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 201, json: { ok: true } });
    });
    await page.goto('/');
    const row = (await waitForRows(page)).first();
    const id = ((await row.getAttribute('id')) ?? '').replace('row-', '');
    await row.locator('.row-toggle').click();

    await row.getByRole('button', { name: new RegExp(`^${text.closedReport.button}`) }).click();
    await expect(row.getByText(text.closedReport.confirm)).toBeVisible();
    // Nothing leaves the device before the confirmation.
    expect(body).toBeNull();
    await row.getByRole('button', { name: text.closedReport.send }).click();

    await expect(row.getByText(text.closedReport.sent)).toBeVisible();
    expect(body).toMatchObject({ pharmacy: id, type: 'closed-but-listed-open', locale: 'el' });
    expect(String(body?.['message'])).toMatch(/^Βρέθηκε κλειστό: 5\/10\/2026, 22:3\d\. /);
  });

  test('cancelling sends nothing', async ({ page }) => {
    let called = false;
    await page.route('**/api/report/', (route) => {
      called = true;
      return route.fulfill({ status: 201, json: { ok: true } });
    });
    await page.goto('/');
    const row = (await waitForRows(page)).first();
    await row.locator('.row-toggle').click();
    await row.getByRole('button', { name: new RegExp(`^${text.closedReport.button}`) }).click();
    await row.getByRole('button', { name: text.closedReport.cancel }).click();
    await expect(
      row.getByRole('button', { name: new RegExp(`^${text.closedReport.button}`) }),
    ).toBeVisible();
    expect(called).toBe(false);
  });

  test('when it cannot be sent, links to the form with the pharmacy and the type', async ({
    page,
  }) => {
    await page.route('**/api/report/', (route) =>
      route.fulfill({ status: 503, json: { error: 'unavailable' } }),
    );
    await page.goto('/');
    const row = (await waitForRows(page)).first();
    const id = ((await row.getAttribute('id')) ?? '').replace('row-', '');
    await row.locator('.row-toggle').click();
    await row.getByRole('button', { name: new RegExp(`^${text.closedReport.button}`) }).click();
    await row.getByRole('button', { name: text.closedReport.send }).click();

    await expect(row.getByText(text.closedReport.failed)).toBeVisible();
    const link = row.getByRole('link', { name: text.closedReport.form });
    await expect(link).toHaveAttribute(
      'href',
      `/anafora/?pharmacy=${id}&type=closed-but-listed-open`,
    );
  });
});

test.describe('nothing open at the chosen moment', () => {
  test('lists the nearest pharmacies that open first, instead of ending', async ({ page }) => {
    // A Monday night whose duty lists are not published (Sunday's covers until 08:00).
    for (const date of ['2026-10-11', '2026-10-12']) {
      await page.route(`**/data/thessaloniki/duties/${date}.json`, (route) =>
        route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' }),
      );
    }
    await page.goto('/');
    await waitForRows(page);
    await openControls(page);
    await page.getByRole('button', { name: text.time.other }).click();
    await page.getByLabel(text.time.date).fill('2026-10-12');
    await page.getByLabel(text.time.clock).fill('03:00');

    const panel = page.locator('#panel');
    await expect(panel.getByText(text.list.noneOpen)).toBeVisible();
    const next = panel.locator('section.next');
    await expect(next.getByRole('heading', { name: text.list.openNext })).toBeVisible();
    const rows = next.locator('ol.rows > li.row');
    await expect(rows).toHaveCount(5);
    await expect(rows.first()).toHaveAttribute('data-kind', 'closed');
    await expect(rows.first()).toContainText(text.status.closed);
    // Closed rows do not offer "found it closed".
    await expect(
      next.getByRole('button', { name: new RegExp(`^${text.closedReport.button}`) }),
    ).toHaveCount(0);
  });
});
