import { t } from '../src/i18n/index.ts';
import { POSITION } from './constants.ts';
import { expect, openControls, test, waitForRows } from './support.ts';

const text = t('el').app;

/** Counts the calls to getCurrentPosition / watchPosition, and can fake the Permissions API. */
async function spyOnGeolocation(
  page: import('@playwright/test').Page,
  options: { permission?: PermissionState; delayMs?: number } = {},
): Promise<void> {
  await page.addInitScript((o) => {
    const win = window as unknown as Record<string, unknown>;
    win['__geoCalls'] = { current: 0, watch: 0 };
    const calls = win['__geoCalls'] as { current: number; watch: number };
    const geo = navigator.geolocation;
    const current = geo.getCurrentPosition.bind(geo);
    const watch = geo.watchPosition.bind(geo);
    geo.getCurrentPosition = (success, failure, opts) => {
      calls.current += 1;
      setTimeout(() => current(success, failure, opts), o.delayMs ?? 0);
    };
    geo.watchPosition = (success, failure, opts) => {
      calls.watch += 1;
      return watch(success, failure, opts);
    };
    if (o.permission) {
      const state = o.permission;
      navigator.permissions.query = () =>
        Promise.resolve({ state, onchange: null } as unknown as PermissionStatus);
    }
  }, options);
}

async function calls(
  page: import('@playwright/test').Page,
): Promise<{ current: number; watch: number }> {
  return page.evaluate(
    () => (window as unknown as { __geoCalls: { current: number; watch: number } }).__geoCalls,
  );
}

test.describe('with the location allowed (a returning visitor)', () => {
  test('asks by itself, sorts by distance and shows the position in the header', async ({
    page,
  }) => {
    await spyOnGeolocation(page);
    await page.goto('/');
    await waitForRows(page);
    await expect(page.locator('ol.rows > li.row .row-distance').first()).toBeVisible();
    await expect(page.locator('.origin-chip')).toContainText(text.origin.myLocation);
    // No nearby card: there is a position.
    await expect(page.locator('.nearby')).toHaveCount(0);
    expect((await calls(page)).current).toBe(1);
    const distance = await page.locator('ol.rows > li.row .row-distance').first().innerText();
    expect(distance).toMatch(/\d/);
    // Only flags are stored, never the position.
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    expect(stored).not.toMatch(/40\.6|22\.9/);
  });

  test('while locating, says so in the summary and keeps the list usable', async ({ page }) => {
    await spyOnGeolocation(page, { delayMs: 2500 });
    await page.goto('/');
    await waitForRows(page);
    await expect(page.locator('.summary')).toContainText(text.origin.locating);
    await expect(page.locator('.origin-chip')).toContainText(text.origin.locating);
    // Alphabetical until the fix arrives, with no card in the way.
    await expect(page.locator('.nearby')).toHaveCount(0);
    expect(await page.locator('ol.rows > li.row').count()).toBeGreaterThan(3);
    await expect(page.locator('.origin-chip')).toContainText(text.origin.myLocation, {
      timeout: 10_000,
    });
  });

  test('follows the device: a big move re-sorts the list, a small one does not', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await waitForRows(page);
    await expect(page.locator('ol.rows > li.row .row-distance').first()).toBeVisible();
    const firstDistance = () => page.locator('ol.rows > li.row .row-distance').first().innerText();
    const firstName = () => page.locator('ol.rows > li.row .row-name').first().innerText();
    const before = { distance: await firstDistance(), name: await firstName() };

    // About 20 m: not worth re-sorting.
    await context.setGeolocation({
      latitude: POSITION.latitude + 0.0002,
      longitude: POSITION.longitude,
    });
    await page.waitForTimeout(800);
    expect(await firstDistance()).toBe(before.distance);

    // Several kilometres east, in Kalamaria's direction.
    await context.setGeolocation({ latitude: 40.5826, longitude: 22.9509 });
    await expect(async () => {
      expect(await firstName()).not.toBe(before.name);
    }).toPass();
  });
});

test.describe('when the location is not given', () => {
  test.use({ permissions: [] });

  test('the nearby card with the area picker leads the list, with a hint to allow it', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForRows(page);
    const card = page.locator('.nearby');
    await expect(card).toBeVisible();
    await expect(card.getByRole('heading', { name: text.nearby.title })).toBeVisible();
    await expect(card.getByRole('button', { name: text.origin.useLocation })).toBeVisible();
    await expect(card.getByRole('status')).toContainText(text.origin.deniedShort);
    await expect(card.getByRole('status')).toContainText(/Ρυθμίσεις|ρυθμίσεις/);
    // The card comes before the first row.
    const cardBox = await card.boundingBox();
    const rowBox = await page.locator('ol.rows > li.row').first().boundingBox();
    expect(cardBox?.y ?? 0).toBeLessThan(rowBox?.y ?? 0);
    // Sorted by name until an area is chosen: no distances yet.
    await expect(page.locator('ol.rows > li.row .row-distance')).toHaveCount(0);
    await expect(page.locator('.origin-chip')).toHaveCount(0);

    // The picker is inline in the card: no panel to dig through.
    await card.getByRole('button', { name: text.nearby.area }).click();
    await page.getByLabel(text.origin.areaSearch).fill('kalamaria');
    await page.locator('.picker-item', { hasText: 'Καλαμαριά' }).click();
    await expect(page.locator('.nearby')).toHaveCount(0);
    await expect(page.locator('.origin-chip')).toContainText('Καλαμαριά');
    await expect(page.locator('ol.rows > li.row .row-distance').first()).toBeVisible();
  });

  test('the origin chip switches to another area in two taps, and clearing it is remembered', async ({
    page,
  }) => {
    await spyOnGeolocation(page);
    await page.goto('/');
    await waitForRows(page);
    await page.locator('.nearby').getByRole('button', { name: text.nearby.area }).click();
    await page.getByLabel(text.origin.areaSearch).fill('kalamaria');
    await page.locator('.picker-item', { hasText: 'Καλαμαριά' }).click();
    expect(await page.evaluate(() => localStorage.getItem('pharmacy-skg:area'))).toBe('Καλαμαριά');

    // The chip opens the options with the picker and the clear button.
    await openControls(page);
    await page.getByRole('button', { name: text.origin.clear }).click();
    await expect(page.locator('.origin-chip')).toHaveCount(0);
    await expect(page.locator('.nearby')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('pharmacy-skg:location'))).toBe('off');
    // A later visit does not ask again.
    const before = (await calls(page)).current;
    await page.reload();
    await waitForRows(page);
    expect((await calls(page)).current).toBe(before - before);
  });
});

test.describe('when the browser has the permission blocked', () => {
  test('does not ask, and says how to allow it', async ({ page }) => {
    await spyOnGeolocation(page, { permission: 'denied' });
    await page.goto('/');
    await waitForRows(page);
    expect((await calls(page)).current).toBe(0);
    const card = page.locator('.nearby');
    await expect(card).toBeVisible();
    await expect(card.getByRole('status')).toContainText(text.origin.deniedShort);
  });
});

test.describe('when the person chose an area before', () => {
  test('does not ask for the position, and starts from that area', async ({ page }) => {
    await spyOnGeolocation(page);
    await page.addInitScript(() => localStorage.setItem('pharmacy-skg:area', 'Καλαμαριά'));
    await page.goto('/');
    await waitForRows(page);
    await expect(page.locator('.origin-chip')).toContainText('Καλαμαριά');
    expect((await calls(page)).current).toBe(0);
    await page.waitForTimeout(500);
    expect((await calls(page)).watch).toBe(0);
  });
});

test.describe('when the person turned the request off', () => {
  test.use({ autoLocate: false });

  test('does not ask, and the card offers it again with one tap', async ({ page }) => {
    await spyOnGeolocation(page);
    await page.goto('/');
    await waitForRows(page);
    expect((await calls(page)).current).toBe(0);
    await page.locator('.nearby').getByRole('button', { name: text.origin.useLocation }).click();
    await expect(page.locator('.origin-chip')).toContainText(text.origin.myLocation);
    expect(await page.evaluate(() => localStorage.getItem('pharmacy-skg:location'))).toBeNull();
  });
});
