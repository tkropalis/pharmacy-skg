import { LOCALES } from '@pharmacy-skg/core';
import { t } from '../src/i18n/index.ts';
import { searchEl } from '../src/i18n/search.el.ts';
import { searchEn } from '../src/i18n/search.en.ts';
import { manifestPath } from '../src/lib/manifest.ts';
import { SHORTCUTS, shortcutUrl } from '../src/lib/shortcuts.ts';
import { expect, test, waitForRows } from './support.ts';

const DAY = '2026-10-05T08:01:00+03:00';

test('each language’s manifest offers four shortcuts, with icons that load', async ({
  request,
}) => {
  for (const locale of LOCALES) {
    const response = await request.get(manifestPath(locale));
    const manifest = (await response.json()) as {
      shortcuts: { name: string; url: string; icons: { src: string }[] }[];
    };
    expect(manifest.shortcuts.map((s) => s.name)).toEqual(
      SHORTCUTS.map((shortcut) => t(locale).shortcuts[shortcut]),
    );
    expect(manifest.shortcuts.map((s) => s.url)).toEqual(
      SHORTCUTS.map((shortcut) => shortcutUrl(locale, shortcut)),
    );
    for (const shortcut of manifest.shortcuts) {
      const icon = await request.get(shortcut.icons[0]?.src ?? '/missing');
      expect(icon.status(), shortcut.name).toBe(200);
      expect(icon.headers()['content-type']).toBe('image/png');
    }
  }
});

for (const locale of LOCALES) {
  const text = t(locale).app;
  const filter = (page: import('@playwright/test').Page) =>
    page.getByRole('group', { name: text.list.filterLabel }).getByRole('button');

  test.describe(`${locale}: a shortcut opens the home screen on its choice`, () => {
    test.use({ now: DAY, autoLocate: false });

    test('"on duty" chooses the duty list, "open now" the whole list, and neither is remembered', async ({
      page,
    }) => {
      await page.goto(shortcutUrl(locale, 'duty'));
      await waitForRows(page);
      await expect(filter(page).nth(1)).toHaveAttribute('aria-pressed', 'true');
      await expect(filter(page).nth(0)).toHaveAttribute('aria-pressed', 'false');
      // The address is the home screen's again, and the remembered choice is untouched.
      expect(new URL(page.url()).search).toBe('');
      expect(await page.evaluate(() => localStorage.getItem('pharmacy-skg:filter'))).toBeNull();

      await page.addInitScript(() => localStorage.setItem('pharmacy-skg:filter', 'duty'));
      await page.goto(shortcutUrl(locale, 'open'));
      await waitForRows(page);
      await expect(filter(page).nth(0)).toHaveAttribute('aria-pressed', 'true');
      // Without a shortcut the remembered choice is back.
      await page.goto(shortcutUrl(locale, 'open').split('?')[0] ?? '/');
      await waitForRows(page);
      await expect(filter(page).nth(1)).toHaveAttribute('aria-pressed', 'true');
    });

    test('"favourites" opens the favourites tab', async ({ page }) => {
      await page.goto(shortcutUrl(locale, 'favourites'));
      await waitForRows(page).catch(() => undefined);
      await expect(page.getByRole('tab', { name: text.tabs.favourites })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(new URL(page.url()).search).toBe('');
    });

    test('"medicines" opens the medicine search', async ({ page }) => {
      await page.goto(shortcutUrl(locale, 'medicines'));
      const title = (locale === 'el' ? searchEl : searchEn).title;
      await expect(page.getByRole('dialog', { name: title })).toBeVisible();
      expect(new URL(page.url()).search).toBe('');
    });

    test('an unknown value is the plain home screen', async ({ page }) => {
      await page.goto(`${shortcutUrl(locale, 'open').split('?')[0]}?show=nothing`);
      await waitForRows(page);
      await expect(page.getByRole('tab', { name: text.tabs.open })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });
  });
}
