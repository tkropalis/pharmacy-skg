import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LOCALES } from '@pharmacy-skg/core';
import { localePrefix, PARAM_ROUTES } from './i18n/routes.ts';

// The generated pages live in files named after the URL slugs, because Astro routes by file.
// This keeps the files and PARAM_ROUTES (which the home screen links through) in step.
describe('generated page files', () => {
  const file = (path: string) => new URL(`./pages/${path}`, import.meta.url);

  it.each([
    ['pharmacy', '[id].astro'],
    ['duty', '[city]/[date].astro'],
    ['duty', '[city]/index.astro'],
    ['duty', 'index.astro'],
    ['area', '[city]/[slug].astro'],
    ['area', 'index.astro'],
  ] as const)('%s has %s in every locale', (route, name) => {
    for (const locale of LOCALES) {
      const directory = `${localePrefix(locale)}/${PARAM_ROUTES[route][locale]}`.replace(/^\//, '');
      const path = `${directory}/${name}`;
      expect(existsSync(file(path)), path).toBe(true);
    }
  });
});
