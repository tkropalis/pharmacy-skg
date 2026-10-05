import AxeBuilder from '@axe-core/playwright';
import { LOCALES } from '@pharmacy-skg/core';
import type { Locale } from '@pharmacy-skg/core';
import { areaPath, dutyPath, localizedPath, pharmacyPath } from '../src/i18n/routes.ts';
import { AREA_SLUG, DUTY_DATE, PHARMACY_ID } from './constants.ts';
import { expect, openControls, test, waitForMap, waitForRows } from './support.ts';

/** Every WCAG 2.0, 2.1 and 2.2 level A and AA rule axe knows. */
const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const PAGES: Record<string, (locale: Locale) => string> = {
  home: (locale) => localizedPath(locale, 'home'),
  pharmacy: (locale) => pharmacyPath(locale, PHARMACY_ID),
  duty: (locale) => dutyPath(locale, DUTY_DATE),
  area: (locale) => areaPath(locale, AREA_SLUG),
  about: (locale) => localizedPath(locale, 'about'),
  privacy: (locale) => localizedPath(locale, 'privacy'),
  report: (locale) => localizedPath(locale, 'report'),
};

for (const scheme of ['light', 'dark'] as const) {
  for (const locale of LOCALES) {
    for (const [name, pathFor] of Object.entries(PAGES)) {
      test(`${name} (${locale}, ${scheme}) has no WCAG 2.2 A/AA violations`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
        await page.goto(pathFor(locale));
        if (name === 'home') {
          await waitForRows(page);
          await waitForMap(page);
        } else {
          await page.waitForLoadState('networkidle');
        }
        const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
        const summary = results.violations.map((violation) => ({
          rule: violation.id,
          impact: violation.impact,
          nodes: violation.nodes.slice(0, 4).map((node) => ({
            target: node.target,
            summary: node.failureSummary?.split('\n').slice(0, 3).join(' | '),
          })),
        }));
        expect(summary).toEqual([]);
      });
    }
  }
}

test("the home list with the filters open and a row's details open has no violations", async ({
  page,
}) => {
  await page.goto('/');
  const rows = await waitForRows(page);
  await openControls(page);
  // A row's details: favourite, share, the pharmacy's page and the other maps apps.
  await rows.first().locator('.row-toggle').click();
  await expect(rows.first().locator('.row-details')).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  expect(results.violations.map((v) => [v.id, v.nodes.map((n) => n.html.slice(0, 160))])).toEqual(
    [],
  );

  // The area picker is a dialog of its own.
  await page
    .locator('#controls')
    .getByRole('button', { name: /^Περιοχή/ })
    .click();
  await expect(page.locator('dialog.ap')).toBeVisible();
  const dialog = await new AxeBuilder({ page }).include('dialog.ap').withTags(WCAG_AA).analyze();
  expect(dialog.violations.map((v) => [v.id, v.nodes.map((n) => n.html.slice(0, 160))])).toEqual(
    [],
  );
});
