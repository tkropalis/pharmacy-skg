import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { decodeMedicineIndex } from '@pharmacy-skg/core';
import type { MedicineIndex } from '@pharmacy-skg/core';
import type { Page } from '@playwright/test';
import { searchEl } from '../src/i18n/search.el.ts';
import { searchEn } from '../src/i18n/search.en.ts';
import { localizedPath } from '../src/i18n/routes.ts';
import { expect, settleAnimations, test, waitForRows } from './support.ts';

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** The index the build published (from the real data/medicines/medicines.json). */
function builtMedicines() {
  const index = JSON.parse(
    readFileSync(new URL('../dist/data/medicines/index.json', import.meta.url), 'utf8'),
  ) as MedicineIndex;
  return decodeMedicineIndex(index);
}

async function openSearch(page: Page, label: RegExp = /^Φάρμακα/) {
  await page.getByRole('button', { name: label }).click();
  const dialog = page.getByRole('dialog', { name: searchEl.title });
  await expect(dialog).toBeVisible();
  // Nothing is said before the person types: the field's placeholder is the only prompt.
  await expect(dialog.getByRole('status')).toHaveText('');
  await expect(dialog.getByLabel(searchEl.inputLabel)).toHaveAttribute(
    'placeholder',
    searchEl.placeholder,
  );
  return dialog;
}

async function axeViolations(page: Page) {
  await settleAnimations(page);
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  return results.violations.map((v) => [v.id, v.nodes.map((n) => n.html.slice(0, 160))]);
}

test('finds a medicine typed in Greek, shows its price and details, and closes', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(decodeURIComponent(request.url())));
  await page.goto('/');
  await waitForRows(page);

  const dialog = await openSearch(page);
  const input = dialog.getByLabel(searchEl.inputLabel);
  await expect(input).toBeFocused();
  await input.fill('ντεπον');
  await expect(dialog.getByRole('status')).toHaveText(/^\d+ φάρμακα$/);
  // One character is not enough yet.
  await input.fill('ν');
  await expect(dialog.getByRole('status')).toHaveText(searchEl.hint);
  await input.fill('ντεπον');
  const results = dialog.getByRole('list', { name: searchEl.resultsLabel }).getByRole('button');
  await expect(results.first()).toContainText('DEPON');
  await expect(results.first()).toContainText(/\d+,\d\d\s€/);

  // Non-prescription: the details label the price as only indicative. No sources or notes.
  await results.first().click();
  await expect(dialog.getByRole('heading', { level: 3 })).toBeFocused();
  await expect(dialog).toContainText(searchEl.indicativePrice);
  await expect(dialog).toContainText(searchEl.details.indicativeNote);
  await expect(dialog.getByRole('link')).toHaveCount(0);
  await dialog.getByRole('button', { name: searchEl.details.back }).click();
  await expect(results.first()).toBeFocused();

  // Escape closes it, the focus goes back to the button, and the address never changed.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: /^Φάρμακα/ })).toBeFocused();
  expect(new URL(page.url()).pathname).toBe('/');
  expect(new URL(page.url()).search).toBe('');

  // The search ran on the device: no request carried the query.
  expect(requests.filter((url) => /ντεπον|depon/i.test(url))).toEqual([]);
  const medicineRequests = requests.filter((url) => url.includes('/data/medicines/'));
  expect(medicineRequests.map((url) => new URL(url).pathname)).toEqual([
    '/data/medicines/index.json',
  ]);
  expect(medicineRequests.every((url) => new URL(url).search === '')).toBe(true);
});

test('labels a prescription price as the maximum and flags an ΕΟΦ shortage', async ({ page }) => {
  const medicines = builtMedicines();
  const short = medicines.find((m) => !m.otc && m.shortage?.from && m.shortage.to);
  test.skip(short === undefined, 'no dated shortage on the current ΕΟΦ list');
  if (!short) return;

  await page.goto(localizedPath('el', 'about'));
  const dialog = await openSearch(page);
  await dialog.getByLabel(searchEl.inputLabel).fill(short.barcode);
  const row = dialog.getByRole('list', { name: searchEl.resultsLabel }).getByRole('button');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(searchEl.shortage);
  await row.click();
  await expect(dialog).toContainText(searchEl.maxPrice);
  await expect(dialog).toContainText(searchEl.details.maxPriceNote);
  await expect(dialog.getByRole('note')).toContainText(/Έως περίπου \d+ \S+ 20\d\d\./);
  expect(await axeViolations(page)).toEqual([]);
});

test('works in English from any page, and the Back button closes it', async ({ page }) => {
  await page.goto(localizedPath('en', 'privacy'));
  await page.getByRole('button', { name: /^Medicines/ }).click();
  const dialog = page.getByRole('dialog', { name: searchEn.title });
  await dialog.getByLabel(searchEn.inputLabel).fill('paracetamol');
  await expect(dialog.getByRole('status')).toHaveText(/^\d+ medicines$/);
  await page.goBack();
  await expect(dialog).toBeHidden();
  expect(new URL(page.url()).pathname).toBe(localizedPath('en', 'privacy'));
});

test('says when nothing matches and starts empty each time', async ({ page }) => {
  await page.goto('/');
  const dialog = await openSearch(page);
  await dialog.getByLabel(searchEl.inputLabel).fill('qwzqwz');
  await expect(dialog.getByRole('status')).toHaveText(searchEl.none);
  await dialog.getByRole('button', { name: searchEl.close }).click();
  await expect(dialog).toBeHidden();
  const again = await openSearch(page);
  await expect(again.getByLabel(searchEl.inputLabel)).toHaveValue('');
});

test('the search, its results and details have no WCAG 2.2 A/AA violations', async ({ page }) => {
  await page.goto('/en/');
  await waitForRows(page);
  await page.getByRole('button', { name: /^Medicines/ }).click();
  const dialog = page.getByRole('dialog', { name: searchEn.title });
  await expect(dialog.getByLabel(searchEn.inputLabel)).toBeFocused();
  expect(await axeViolations(page)).toEqual([]);
  await dialog.getByLabel(searchEn.inputLabel).fill('depon');
  await expect(dialog.getByRole('status')).toHaveText(/^\d+ medicines$/);
  expect(await axeViolations(page)).toEqual([]);
  await dialog
    .getByRole('list', { name: searchEn.resultsLabel })
    .getByRole('button')
    .first()
    .click();
  expect(await axeViolations(page)).toEqual([]);
});

test('targets are at least 44 px', async ({ page }) => {
  await page.goto('/');
  const dialog = await openSearch(page);
  await dialog.getByLabel(searchEl.inputLabel).fill('depon');
  const first = dialog
    .getByRole('list', { name: searchEl.resultsLabel })
    .getByRole('button')
    .first();
  for (const target of [
    page.getByRole('button', { name: searchEl.close }),
    dialog.getByLabel(searchEl.inputLabel),
    first,
  ]) {
    const box = await target.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});
