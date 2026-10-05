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
            assets: names.some((n) => n.startsWith('assets-')),
            data: data !== undefined,
            duties: duties !== undefined,
          };
        }),
      { timeout: 20_000 },
    )
    .toEqual({ precache: true, assets: true, data: true, duties: true });

  // The page must be controlled for the reload to be served by the worker.
  await page.reload();
  await waitForRows(page);
  await waitForMap(page);
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

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
