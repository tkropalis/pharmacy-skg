import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sunElevation, sunIsDown } from './sun.ts';

const CENTRE = { lat: 40.6401, lon: 22.9444 };

describe('sunIsDown (Thessaloniki)', () => {
  // Sunset on 5 Oct 2026 is about 18:56 in Athens (15:56 UTC), sunrise about 07:24 (04:24 UTC).
  it.each([
    ['2026-10-05T15:40:00Z', false],
    ['2026-10-05T16:10:00Z', true],
    ['2026-10-05T23:00:00Z', true],
    ['2026-10-06T04:10:00Z', true],
    ['2026-10-06T04:40:00Z', false],
    ['2026-10-06T10:00:00Z', false],
    // Midsummer: still light at 20:40 in Athens, dark at 21:10.
    ['2026-06-21T17:40:00Z', false],
    ['2026-06-21T18:10:00Z', true],
  ])('%s: %s', (iso, down) => {
    expect(sunIsDown(new Date(iso), CENTRE.lat, CENTRE.lon)).toBe(down);
  });

  it('puts the sun high at midday and low at midnight', () => {
    expect(sunElevation(new Date('2026-06-21T10:00:00Z'), CENTRE.lat, CENTRE.lon)).toBeGreaterThan(
      70,
    );
    expect(sunElevation(new Date('2026-12-21T22:00:00Z'), CENTRE.lat, CENTRE.lon)).toBeLessThan(
      -60,
    );
  });
});

describe('public/theme.js', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../../public/theme.js'), 'utf8');

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Runs the inline script at `iso` and returns the theme it set. */
  function themeAt(iso: string, prefersDark = false): string | null {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
    const attributes = new Map<string, string>();
    const document = {
      documentElement: {
        getAttribute: (name: string) => attributes.get(name) ?? null,
        setAttribute: (name: string, value: string) => attributes.set(name, value),
      },
      querySelector: () => null,
      addEventListener: () => {},
      visibilityState: 'visible',
    };
    const window = { matchMedia: () => ({ matches: prefersDark, addEventListener: () => {} }) };
    new Function('document', 'window', source)(document, window);
    return attributes.get('data-theme') ?? null;
  }

  it('agrees with lib/sun.ts through a day', () => {
    for (let hour = 0; hour < 24; hour += 0.5) {
      const date = new Date(Date.UTC(2026, 9, 5) + hour * 3_600_000);
      const expected = sunIsDown(date, CENTRE.lat, CENTRE.lon) ? 'dark' : 'light';
      expect(themeAt(date.toISOString()), date.toISOString()).toBe(expected);
    }
  });

  it('is dark at any hour when the device asks for it', () => {
    expect(themeAt('2026-10-05T10:00:00Z', true)).toBe('dark');
  });
});
