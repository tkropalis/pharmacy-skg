import type { Page } from '@playwright/test';
import { APP_NAME, APP_SHORT_NAME } from '../src/config.ts';
import { appEl } from '../src/i18n/app.el.ts';
import { el } from '../src/i18n/el.ts';
import { expect, test, waitForRows } from './support.ts';

/** What Chromium sends when the app can be installed; `prompt` records that it was called. */
async function offerInstall(page: Page): Promise<void> {
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, {
      prompt: () => {
        (window as unknown as { prompted: number }).prompted =
          ((window as unknown as { prompted?: number }).prompted ?? 0) + 1;
        return Promise.resolve();
      },
    });
    window.dispatchEvent(event);
  });
}

const prompted = (page: Page) =>
  page.evaluate(() => (window as unknown as { prompted?: number }).prompted ?? 0);

test('the about page offers to install only where the browser can', async ({ page }) => {
  await page.goto('/plirofories/');
  const install = page.locator('#install');
  await expect(install.getByRole('heading', { name: el.about.install.heading })).toBeVisible();
  await expect(install.getByText(el.about.install.ios)).toBeVisible();
  const button = install.getByRole('button', { name: el.about.install.button });
  await expect(button).toBeHidden();

  await offerInstall(page);
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.5);
  await button.click();
  expect(await prompted(page)).toBe(1);
  // The browser's dialog can be shown once per offer.
  await expect(button).toBeHidden();
});

test('the home screen’s footer offers to install, and hides it once installed', async ({
  page,
}) => {
  await page.goto('/');
  await waitForRows(page);
  const button = page.locator('.sheet-footer').getByRole('button', {
    name: appEl.footer.install,
  });
  await expect(button).toBeHidden();
  await offerInstall(page);
  await expect(button).toBeAttached();
  await expect(button).not.toHaveCSS('display', 'none');
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(button).toBeHidden();
  expect(await prompted(page)).toBe(0);
});

test('each language has its own manifest, for one app', async ({ page, request }) => {
  for (const [path, locale, name, shortName, start] of [
    ['/', 'el', APP_NAME.el, APP_SHORT_NAME.el, '/'],
    ['/en/', 'en', APP_NAME.en, APP_SHORT_NAME.en, '/en/'],
  ] as const) {
    await page.goto(path);
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBe(locale === 'el' ? '/manifest.webmanifest' : '/en/manifest.webmanifest');
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
      'content',
      shortName,
    );
    const manifest = await (await request.get(href ?? '')).json();
    expect(manifest).toMatchObject({ id: '/', start_url: start, lang: locale, name });
  }
});
