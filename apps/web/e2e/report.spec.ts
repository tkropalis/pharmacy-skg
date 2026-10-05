import { LOCALES } from '@pharmacy-skg/core';
import { REPO } from '../src/config.ts';
import { t } from '../src/i18n/index.ts';
import { localizedPath } from '../src/i18n/routes.ts';
import { expect, test } from './support.ts';

for (const locale of LOCALES) {
  const text = t(locale).report;
  const path = localizedPath(locale, 'report');

  test.describe(`report page (${locale})`, () => {
    test('warns not to include personal information', async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      const warning = page.getByRole('note').filter({ hasText: text.warningTitle });
      await expect(warning).toBeVisible();
      await expect(warning).toContainText(text.warningBody);
    });

    test('shows success when the report is accepted', async ({ page }) => {
      let body: unknown = null;
      await page.route('**/api/report', async (route) => {
        body = route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          json: { ok: true, issueUrl: `https://github.com/${REPO}/issues/1` },
        });
      });
      await page.goto(path);
      await page.getByLabel(text.form.messageLabel).fill('Το φαρμακείο ήταν κλειστό στις 22:00');
      await page.getByRole('button', { name: text.form.submit }).click();

      const success = page.getByRole('status').filter({ hasText: text.form.successTitle });
      await expect(success).toBeVisible();
      await expect(success.getByRole('link', { name: text.form.viewIssue })).toHaveAttribute(
        'href',
        `https://github.com/${REPO}/issues/1`,
      );
      expect(body).toMatchObject({ type: 'wrong-hours', locale });
    });

    test('offers the GitHub fallback when the service is unavailable (503)', async ({ page }) => {
      await page.route('**/api/report', (route) =>
        route.fulfill({ status: 503, json: { error: 'unavailable' } }),
      );
      await page.goto(path);
      await page.getByLabel(text.form.messageLabel).fill('Wrong phone number');
      await page.getByRole('button', { name: text.form.submit }).click();

      const alert = page.getByRole('alert');
      await expect(alert).toContainText(text.form.errorUnavailable);
      const link = alert.getByRole('link', { name: text.form.fallbackLink });
      await expect(link).toBeVisible();
      const href = (await link.getAttribute('href')) ?? '';
      expect(href.startsWith(`https://github.com/${REPO}/issues/new?`)).toBe(true);
      expect(new URL(href).searchParams.get('body')).toContain('Wrong phone number');
    });

    test('asks for a message instead of sending an empty report', async ({ page }) => {
      let called = false;
      await page.route('**/api/report', (route) => {
        called = true;
        return route.fulfill({ status: 200, json: {} });
      });
      await page.goto(path);
      await page.getByLabel(text.form.messageLabel).fill('   ');
      await page.getByRole('button', { name: text.form.submit }).click();
      await expect(page.getByRole('alert')).toContainText(text.form.errorValidation);
      expect(called).toBe(false);
    });
  });
}
