import { LOCALES } from '@pharmacy-skg/core';
import { describe, expect, it } from 'vitest';
import { en } from './en.ts';
import { el } from './el.ts';
import { alternatePaths, allPathParams, localizedPath, ROUTES, t } from './index.ts';

/** Every path to a string in a dictionary, with array lengths included. */
function shape(value: unknown, path = ''): string[] {
  if (typeof value === 'string') return [path];
  if (Array.isArray(value)) {
    return [
      `${path}.length=${value.length}`,
      ...value.flatMap((v, i) => shape(v, `${path}[${i}]`)),
    ];
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([k, v]) => shape(v, path ? `${path}.${k}` : k));
  }
  throw new Error(`Unexpected ${typeof value} at ${path}`);
}

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(strings);
  return [];
}

describe('dictionaries', () => {
  it('have the same keys, array lengths and plain-string leaves in every locale', () => {
    expect(shape(en).sort()).toEqual(shape(el).sort());
  });

  it('have no empty strings', () => {
    for (const locale of LOCALES) {
      expect(strings(t(locale)).filter((s) => s.trim() === '')).toEqual([]);
    }
  });

  it('use the status labels from the decisions', () => {
    expect(t('el').status).toEqual({
      onDuty: 'Εφημερεύει (λίστα ΦΣΘ)',
      openRegular: 'Ανοιχτό (κανονικό ωράριο)',
    });
    expect(t('en').status).toEqual({
      onDuty: 'On duty (ΦΣΘ list)',
      openRegular: 'Open (regular hours)',
    });
  });
});

describe('localizedPath', () => {
  it.each([
    ['el', 'home', '/'],
    ['en', 'home', '/en/'],
    ['el', 'about', '/plirofories/'],
    ['en', 'about', '/en/about/'],
    ['el', 'privacy', '/aporrito/'],
    ['en', 'privacy', '/en/privacy/'],
    ['el', 'report', '/anafora/'],
    ['en', 'report', '/en/report/'],
  ] as const)('%s %s is %s', (locale, route, expected) => {
    expect(localizedPath(locale, route)).toBe(expected);
  });

  it('gives the same page in every locale', () => {
    expect(alternatePaths('about')).toEqual({ el: '/plirofories/', en: '/en/about/' });
  });
});

describe('allPathParams', () => {
  it('has one entry per locale and route, with unique paths (the Greek home has none)', () => {
    const params = allPathParams();
    expect(params).toHaveLength(LOCALES.length * Object.keys(ROUTES).length);
    expect(new Set(params.map((p) => p.path)).size).toBe(params.length);
    expect(params.find((p) => p.locale === 'el' && p.route === 'home')?.path).toBeUndefined();
    expect(params.find((p) => p.locale === 'en' && p.route === 'report')?.path).toBe('en/report');
  });
});
