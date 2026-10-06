import type { BrowserContext, Page } from '@playwright/test';
import { appEl } from '../src/i18n/app.el.ts';
import { el } from '../src/i18n/el.ts';
import { searchEl } from '../src/i18n/search.el.ts';
import { pharmacyPath } from '../src/i18n/routes.ts';
import { PHARMACY_ID } from './constants.ts';
import { expect, test, waitForMap, waitForRows } from './support.ts';

// The one place the service worker is on. The tests above run without it.
test.use({ serviceWorkers: 'allow' });

/**
 * Takes the browser off the network. context.setOffline() alone does not reach the service
 * worker's own requests, so they would still get answers from the preview server; aborting every
 * request to it that is not answered by the worker cuts those off too (the stubbed tile server
 * is another host, e2e/support.ts).
 */
async function setOffline(context: BrowserContext, offline: boolean, baseURL = ''): Promise<void> {
  const everything = `${new URL(baseURL).origin}/**`;
  await context.setOffline(offline);
  if (offline) await context.route(everything, (route) => route.abort('internetdisconnected'));
  else await context.unroute(everything);
}

test('after the first visit the home list and the map load offline', async ({
  page,
  context,
  baseURL,
}) => {
  await page.goto('/');
  await waitForRows(page);
  await waitForMap(page);

  // Wait for the worker to control the page and for the data warm-up to finish.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const names = await caches.keys();
          const data = await caches.match('/data/thessaloniki/pharmacies.json');
          const duties = await caches.match('/data/thessaloniki/duties/2026-10-05.json');
          return {
            precache: names.some((n) => n.startsWith('precache-')),
            data: data !== undefined,
            duties: duties !== undefined,
          };
        }),
      { timeout: 20_000 },
    )
    .toEqual({ precache: true, data: true, duties: true });

  // The page must be controlled for the reload to be served by the worker.
  await page.reload();
  await waitForRows(page);
  await waitForMap(page);
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  // The first visit may have loaded the map before the worker took over; this one went through
  // it, so the map chunk is in the cache that is filled on first use.
  await expect
    .poll(() =>
      page.evaluate(async () => (await caches.keys()).some((name) => name.startsWith('assets-'))),
    )
    .toBe(true);

  await setOffline(context, true, baseURL);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'el');
  const rows = await waitForRows(page);
  expect(await rows.count()).toBeGreaterThan(3);
  await expect(page.locator('.summary')).toBeVisible();
  // The map chunk was not precached: it comes from the cache filled on first use.
  await waitForMap(page);

  // A page that is not in the shell falls back to the home page of the locale.
  await page.goto(`${baseURL}/en/`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await waitForRows(page);
});

test('the medicine search works offline once it has been opened', async ({
  page,
  context,
  baseURL,
}) => {
  await page.goto('/plirofories/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now the worker controls the page
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  await page.getByRole('button', { name: /^Φάρμακα/ }).click();
  const dialog = page.getByRole('dialog', { name: searchEl.title });
  await expect(dialog.getByLabel(searchEl.inputLabel)).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(async () => (await caches.match('/data/medicines/index.json')) !== undefined),
    )
    .toBe(true);
  await page.keyboard.press('Escape');

  await setOffline(context, true, baseURL);
  await page.reload();
  await page.getByRole('button', { name: /^Φάρμακα/ }).click();
  await dialog.getByLabel(searchEl.inputLabel).fill('ντεπον');
  await expect(dialog.getByRole('status')).toHaveText(/^\d+ φάρμακα$/);
});

test('a new service worker version never reloads a visible page: it offers a button', async ({
  page,
}) => {
  await page.goto('/');
  await waitForRows(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now the worker controls the page
  await waitForRows(page);
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  // The live region is in the page, empty, before the notice: that is what gets it announced.
  const region = page.locator('.update-region[role="status"]');
  await expect(region).toBeAttached();
  await expect(region).toHaveText('');
  await page.evaluate(() => {
    (window as unknown as { marker: string }).marker = 'same page';
    navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
  });
  const toast = region.locator('.update-toast');
  await expect(toast).toBeVisible();
  await expect(toast.getByRole('button', { name: 'Ανανέωση' })).toBeVisible();
  await expect(toast.getByRole('button', { name: 'Κλείσιμο', exact: true })).toBeVisible();
  // The sheet rises (smoothly) to stand above the notice instead of under it.
  const toastBox = await toast.boundingBox();
  await expect
    .poll(async () => {
      const sheet = await page.locator('.sheet').boundingBox();
      return (sheet?.y ?? 0) + (sheet?.height ?? 0);
    })
    .toBeLessThanOrEqual((toastBox?.y ?? 0) + 1);
  // Still the same page, and still usable.
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as unknown as { marker?: string }).marker)).toBe(
    'same page',
  );
  for (const button of await toast.getByRole('button').all()) {
    const box = await button.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.5);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(43.5);
  }

  // Dismissed, it goes and the room it took is given back.
  await toast.getByRole('button', { name: 'Κλείσιμο', exact: true }).click();
  await expect(toast).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveClass(/has-update-toast/);

  // Hidden, it reloads by itself.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect
    .poll(async () => {
      try {
        return await page.evaluate(() => (window as unknown as { marker?: string }).marker);
      } catch {
        return 'navigating'; // the context goes away while the page reloads
      }
    })
    .toBeUndefined();
});

/** Waits until the service worker controls the page (a reload after the first visit). */
async function controlled(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

/** Whether the data cache holds this file. */
function cached(page: Page, path: string): Promise<boolean> {
  return page.evaluate(async (url) => (await caches.match(url)) !== undefined, path);
}

test('offline, the data’s age says so; back online, the list is refreshed', async ({
  page,
  context,
  baseURL,
}) => {
  await page.goto('/');
  await controlled(page);
  await waitForRows(page);
  await expect
    .poll(() => cached(page, '/data/thessaloniki/duties/2026-10-05.json'), { timeout: 20_000 })
    .toBe(true);

  const fresh = page.locator('.fresh');
  await expect(fresh).toContainText(appEl.source.tiny);
  await expect(fresh).not.toContainText(appEl.source.offline);
  await setOffline(context, true, baseURL);
  await expect(fresh).toContainText(`· ${appEl.source.offline}`);
  await expect(page.locator('html')).toHaveAttribute('data-offline', '');
  // The list stays as it was.
  expect(await (await waitForRows(page)).count()).toBeGreaterThan(3);

  const refreshed = page.waitForRequest((request) =>
    request.url().endsWith('/data/thessaloniki/meta.json'),
  );
  await setOffline(context, false, baseURL);
  await refreshed;
  await expect(fresh).not.toContainText(appEl.source.offline);
  await expect(page.locator('html')).not.toHaveAttribute('data-offline');

  // A page with the site footer says it there.
  await page.goto('/plirofories/');
  await setOffline(context, true, baseURL);
  const footer = page.locator('.site-footer');
  await expect(footer.getByText(el.footer.offline)).toBeVisible();
  await setOffline(context, false, baseURL);
  await expect(footer.getByText(el.footer.offline)).toBeHidden();
});

test('a pharmacy page seen before opens offline; one never seen opens the home screen', async ({
  page,
  context,
  baseURL,
}) => {
  await page.goto(pharmacyPath('el', PHARMACY_ID));
  await controlled(page); // this load went through the worker, which kept the page
  const title = await page.locator('h1').textContent();
  expect(title?.trim()).toBeTruthy();
  // The status needs the data on the device: wait until the worker has stored what this load
  // fetched (a large file can still be on its way into the cache).
  for (const file of ['meta.json', 'pharmacies.json', 'duties/2026-10-05.json']) {
    await expect
      .poll(() => cached(page, `/data/thessaloniki/${file}`), { timeout: 20_000 })
      .toBe(true);
  }

  await setOffline(context, true, baseURL);
  await page.reload();
  await expect(page.locator('h1')).toHaveText(title ?? '');
  // Its status still comes from the data on the device.
  await expect(page.locator('[data-pharmacy-status]')).toContainText(/Εφημερεύει|Κλειστό τώρα/);

  // The home screen, whatever data the warm-up had time to keep (not waited for here).
  await page.goto(pharmacyPath('el', '0000000000'));
  await expect(page.locator('.sheet')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'el');
});

test('an installed app refreshes its offline data on a periodic background sync', async ({
  page,
  baseURL,
}) => {
  await page.goto('/');
  await controlled(page);
  await waitForRows(page);
  // Let the warm-up the page asks for finish, then start from an empty data cache.
  await expect
    .poll(() => cached(page, '/data/thessaloniki/duties/2026-10-05.json'), { timeout: 20_000 })
    .toBe(true);
  await page.evaluate(() => caches.delete('data-v1'));
  expect(await cached(page, '/data/thessaloniki/pharmacies.json')).toBe(false);

  const cdp = await page.context().newCDPSession(page);
  const origin = new URL(baseURL ?? '').origin;
  const registrationId = new Promise<string>((resolve) => {
    cdp.on('ServiceWorker.workerRegistrationUpdated', ({ registrations }) => {
      const found = registrations.find((r) => r.scopeURL.startsWith(origin) && !r.isDeleted);
      if (found) resolve(found.registrationId);
    });
  });
  await cdp.send('ServiceWorker.enable');
  const id = await registrationId;
  const sync = () =>
    cdp.send('ServiceWorker.dispatchPeriodicSyncEvent', {
      origin,
      registrationId: id,
      tag: 'refresh-data',
    });
  // A sync that arrives while the page's own warm-up is still finishing joins that run, which
  // writes into the cache deleted above; the browser would simply sync again later, so does this.
  // The worker's own clock is not the test's fixed one, so only the files every day needs.
  await expect
    .poll(
      async () => {
        if (await cached(page, '/data/thessaloniki/pharmacies.json')) return true;
        await sync();
        return false;
      },
      { timeout: 20_000, intervals: [500, 1000, 2000] },
    )
    .toBe(true);
  expect(await cached(page, '/data/thessaloniki/meta.json')).toBe(true);
});

test.describe('days past the data on the device', () => {
  // A week after the last published list: the device has nothing for today.
  test.use({ now: '2026-10-12T22:30:00+03:00' });

  test('offline, the list says today’s duty lists are not on the device', async ({
    page,
    context,
    baseURL,
  }) => {
    await page.goto('/');
    await controlled(page);
    // No rows: at 22:30 only duty pharmacies are open, and there is no list for the day.
    const sheet = page.locator('.sheet');
    await expect(sheet.getByText(appEl.time.dutyNotPublishedToday)).toBeVisible();

    await setOffline(context, true, baseURL);
    await expect(sheet.getByText(appEl.time.dutyOfflineToday)).toBeVisible();
    await expect(sheet.getByText(appEl.time.dutyNotPublishedToday)).toHaveCount(0);
  });
});
