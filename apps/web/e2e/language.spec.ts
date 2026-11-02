import { t } from '../src/i18n/index.ts';
import { localizedPath } from '../src/i18n/routes.ts';
import { shortcutUrl } from '../src/lib/shortcuts.ts';
import { expect, test, waitForRows } from './support.ts';

test.describe('finding English', () => {
  test('the switch says "English" in full, whole in the header at every phone width', async ({
    page,
  }) => {
    // The about page has the same header as the first screen and loads in a moment.
    for (const width of [320, 375, 393]) {
      await page.setViewportSize({ width, height: 700 });
      await page.goto(localizedPath('el', 'about'));
      const link = page.getByRole('link', { name: t('en').localeName });
      await expect(link).toHaveText(t('en').localeName);
      await expect(link).toBeInViewport({ ratio: 1 });
      // Next to the other header controls and not under them; the header is still one row.
      const search = await page.locator('[data-medicine-search]').boundingBox();
      const box = await link.boundingBox();
      expect((search?.x ?? 0) + (search?.width ?? 0)).toBeLessThanOrEqual((box?.x ?? 0) + 1);
      const header = await page.locator('.site-header').boundingBox();
      expect(header?.height ?? 0).toBeLessThan(62);
      // The app's name is whole from 375 px (it is cut with an ellipsis on the narrowest).
      if (width >= 375) {
        const name = page.locator('.brand .name');
        expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      }
    }
  });

  test('the English first screen has its own title and a switch back, in full', async ({
    page,
  }) => {
    await page.goto('/en/');
    await expect(page).toHaveTitle(new RegExp(`^${t('en').home.documentTitle}`));
    await expect(page.getByRole('link', { name: t('el').localeName })).toHaveText(
      t('el').localeName,
    );
  });

  test.describe('with an English browser', () => {
    test.use({ locale: 'en-GB' });

    test('the browser language alone never moves anyone', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('lang', 'el');
      expect(new URL(page.url()).pathname).toBe('/');
    });
  });

  test('a tap on the switch is remembered: the Greek home then opens in English', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('link', { name: t('en').localeName }).click();
    await expect(page).toHaveURL(/\/en\/$/);
    await waitForRows(page);
    expect(await page.evaluate(() => localStorage.getItem('pharmacy-skg:lang'))).toBe('en');

    // The address of the Greek home, a bookmark or the installed Greek app: English, with the
    // shortcut kept.
    await page.goto('/');
    await expect(page).toHaveURL(/\/en\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.goto(shortcutUrl('el', 'duty'));
    await expect(page).toHaveURL(/\/en\/(\?show=duty)?$/);

    // Any other Greek page is left as it is (a link someone shared).
    await page.goto(localizedPath('el', 'about'));
    await expect(page.locator('html')).toHaveAttribute('lang', 'el');

    // And back: choosing Greek is remembered too.
    await page.goto('/en/');
    await page.getByRole('link', { name: t('el').localeName }).click();
    await expect(page).toHaveURL(/\/$/);
    expect(new URL(page.url()).pathname).toBe('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'el');
    await page.goto('/');
    expect(new URL(page.url()).pathname).toBe('/');
  });
});
