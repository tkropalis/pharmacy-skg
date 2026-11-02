import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cityById, LOCALES } from '@pharmacy-skg/core';
import { localePrefix, PARAM_ROUTES } from './i18n/routes.ts';

interface Redirect {
  readonly source: string;
  readonly destination: string;
  readonly permanent?: boolean;
}

const { redirects } = JSON.parse(
  readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'),
) as { redirects: Redirect[] };

/** Areas that were replaced by another: their pages and links move to the new area's. */
const RETIRED: Readonly<Record<string, string>> = { tinos: 'cyclades' };

describe('redirects of retired areas', () => {
  it('no longer covers the retired areas, and does cover the areas that replace them', () => {
    for (const [from, to] of Object.entries(RETIRED)) {
      expect(cityById(from), from).toBeUndefined();
      expect(cityById(to), to).toBeDefined();
    }
  });

  it.each(Object.entries(RETIRED))(
    "sends %s's duty and area pages, in every locale, to %s",
    (from, to) => {
      for (const locale of LOCALES) {
        for (const route of ['duty', 'area'] as const) {
          const base = `${localePrefix(locale)}/${PARAM_ROUTES[route][locale]}`;
          const redirect = redirects.find(({ source }) => source.startsWith(`${base}/${from}/`));
          expect(redirect, `${base}/${from}/`).toEqual({
            source: `${base}/${from}/:rest*`,
            destination: `${base}/${to}/:rest*`,
            permanent: true,
          });
        }
      }
    },
  );

  it('leaves pharmacy pages alone: their ids are unique across areas', () => {
    expect(redirects.some(({ source }) => source.includes(PARAM_ROUTES.pharmacy.el))).toBe(false);
    expect(redirects.some(({ source }) => source.includes(PARAM_ROUTES.pharmacy.en))).toBe(false);
  });
});
