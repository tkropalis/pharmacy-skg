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
  const NIGHT = '2026-10-05T19:30:00Z';
  const DAY = '2026-10-05T10:00:00Z';

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Runs the script at `iso`, with a stored choice and the device's preference. */
  function run(iso: string, options: { stored?: string; prefersDark?: boolean } = {}) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
    const attributes = new Map<string, string>();
    const items = new Map<string, string>();
    if (options.stored !== undefined) items.set('pharmacy-skg:theme', options.stored);
    const document = {
      documentElement: {
        getAttribute: (name: string) => attributes.get(name) ?? null,
        setAttribute: (name: string, value: string) => attributes.set(name, value),
      },
      querySelector: () => null,
      addEventListener: () => {},
      visibilityState: 'visible',
    };
    const window: { pharmacyTheme?: { set(choice: string): void } } & Record<string, unknown> = {
      matchMedia: () => ({ matches: options.prefersDark ?? false, addEventListener: () => {} }),
      addEventListener: () => {},
    };
    const localStorage = {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => items.set(key, value),
      removeItem: (key: string) => items.delete(key),
    };
    new Function('document', 'window', 'localStorage', source)(document, window, localStorage);
    return { attributes, items, window };
  }

  it('is light by default, day and night, whatever the device asks', () => {
    for (const iso of [DAY, NIGHT]) {
      const { attributes } = run(iso, { prefersDark: true });
      expect(attributes.get('data-theme'), iso).toBe('light');
      expect(attributes.get('data-theme-choice')).toBe('light');
    }
  });

  it('is dark at any hour when dark was chosen', () => {
    expect(run(DAY, { stored: 'dark' }).attributes.get('data-theme')).toBe('dark');
  });

  it('follows the sun when auto was chosen, in step with lib/sun.ts', () => {
    for (let hour = 0; hour < 24; hour += 0.5) {
      const date = new Date(Date.UTC(2026, 9, 5) + hour * 3_600_000);
      const expected = sunIsDown(date, CENTRE.lat, CENTRE.lon) ? 'dark' : 'light';
      const { attributes } = run(date.toISOString(), { stored: 'auto' });
      expect(attributes.get('data-theme'), date.toISOString()).toBe(expected);
    }
  });

  it('with auto, is dark by day when the device asks for it', () => {
    const { attributes } = run(DAY, { stored: 'auto', prefersDark: true });
    expect(attributes.get('data-theme')).toBe('dark');
  });

  it('applies a choice from the footer at once and remembers it; light is not stored', () => {
    const { attributes, items, window } = run(DAY);
    window.pharmacyTheme?.set('dark');
    expect(attributes.get('data-theme')).toBe('dark');
    expect(attributes.get('data-theme-choice')).toBe('dark');
    expect(items.get('pharmacy-skg:theme')).toBe('dark');
    window.pharmacyTheme?.set('light');
    expect(attributes.get('data-theme')).toBe('light');
    expect(items.has('pharmacy-skg:theme')).toBe(false);
  });
});
