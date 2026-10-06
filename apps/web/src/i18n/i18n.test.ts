import { LOCALES } from '@pharmacy-skg/core';
import { describe, expect, it } from 'vitest';
import { en } from './en.ts';
import { el } from './el.ts';
import { alternatePaths, allPathParams, localizedPath, ROUTES, t } from './index.ts';
import { DUTY_KIND_LABELS } from './status-labels.ts';

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
      onDuty: 'Εφημερεύει',
      openRegular: 'Ανοιχτό',
      openExtended: 'Ανοιχτό',
      dutyUnknown: 'Εφημερεύει, καλέστε για το ωράριο',
      midnight: 'τα μεσάνυχτα',
    });
    expect(t('en').status).toEqual({
      onDuty: 'On duty',
      openRegular: 'Open',
      openExtended: 'Open',
      dutyUnknown: 'On duty, call for the hours',
      midnight: 'midnight',
    });
  });

  it('name the kinds of duty once, for the home screen and the pages', () => {
    for (const locale of LOCALES) {
      expect(t(locale).app.status.kinds).toEqual(DUTY_KIND_LABELS[locale]);
    }
    // The all-night lists start at 21:00: never "after midnight".
    expect(t('el').app.status.kinds['after-midnight']).toBe('Εφημερία όλη τη νύχτα');
  });

  it('use no em dashes and no exclamation marks (docs/decisions.md, Defaults: plain words)', () => {
    for (const locale of LOCALES) {
      expect(strings(t(locale)).filter((s) => /[—!]/.test(s))).toEqual([]);
    }
  });

  it('never show the abbreviations ΦΣΘ, ΠΚΜ, ΕΟΦ, ΦΠΑ or ΜΗΣΥΦΑ (the owner, 5 Oct 2026)', () => {
    for (const locale of LOCALES) {
      expect(strings(t(locale)).filter((s) => /ΦΣΘ|ΠΚΜ|ΕΟΦ|ΦΠΑ|ΜΗ\.?ΣΥ\.?ΦΑ/.test(s))).toEqual([]);
    }
  });
});

describe('status labels', () => {
  it('are the same on the home screen, the pages and the legend', () => {
    for (const locale of LOCALES) {
      const { status, app } = t(locale);
      expect(app.status.onDuty).toBe(status.onDuty);
      expect(app.status.openRegular).toBe(status.openRegular);
      expect(app.status.openExtended).toBe(status.openExtended);
      expect(app.status.dutyUnknown).toBe(status.dutyUnknown);
      // The list's short words match the labels.
      expect(app.status.short.duty).toBe(status.onDuty);
      expect(app.status.short.open).toBe(status.openRegular);
      expect(app.status.short.open).toBe(status.openExtended);
      // The legend uses the same words: one marker for each.
      expect(app.status.legend.duty).toBe(status.onDuty);
      expect(app.status.legend.open).toBe(status.openRegular);
      expect(app.status.legend.dutyUnknown).toBe(status.dutyUnknown);
    }
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
