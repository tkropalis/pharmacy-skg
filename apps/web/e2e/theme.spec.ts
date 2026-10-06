import { t } from '../src/i18n/index.ts';
import { expect, test, waitForRows } from './support.ts';

const theme = t('el').app.footer.theme;

test('light by default; the footer choice is applied at once and remembered', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await waitForRows(page);
  const html = page.locator('html');
  // Light even when the device asks for dark, until the person chooses.
  await expect(html).toHaveAttribute('data-theme', 'light');

  const choices = page.locator('.sheet-footer').getByRole('group', { name: theme.label });
  await choices.getByRole('button', { name: theme.dark }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(choices.getByRole('button', { name: theme.dark })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Remembered, and the same on a page with the site footer.
  await page.goto('/plirofories/');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  const pageChoices = page.locator('.site-footer').getByRole('group', { name: theme.label });
  await expect(pageChoices).toBeVisible();
  await pageChoices.getByRole('button', { name: theme.auto }).click();
  // Auto follows the device (dark here) or the sun.
  await expect(html).toHaveAttribute('data-theme-choice', 'auto');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await pageChoices.getByRole('button', { name: theme.light }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
});
