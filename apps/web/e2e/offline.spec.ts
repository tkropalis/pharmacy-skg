import { expect, test, waitForMap, waitForRows } from './support.ts';

// The one place the service worker is on. The tests above run without it.
test.use({ serviceWorkers: 'allow' });

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

  await context.setOffline(true);
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

test('a new service worker version never reloads a visible page: it offers a button', async ({
  page,
}) => {
  await page.goto('/');
  await waitForRows(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now the worker controls the page
  await waitForRows(page);
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  await page.evaluate(() => {
    (window as unknown as { marker: string }).marker = 'same page';
    navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
  });
  const toast = page.locator('.update-toast');
  await expect(toast).toBeVisible();
  await expect(toast.getByRole('button')).toHaveText('Ανανέωση');
  // Still the same page, and still usable.
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as unknown as { marker?: string }).marker)).toBe(
    'same page',
  );
  const box = await toast.getByRole('button').boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.5);

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
