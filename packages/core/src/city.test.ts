import { describe, expect, it } from 'vitest';
import { CITIES, LOCALES } from './city.ts';

describe('CITIES', () => {
  it('uses unique, URL-safe ids', () => {
    const ids = CITIES.map((city) => city.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it('names every city in every locale', () => {
    for (const city of CITIES) {
      for (const locale of LOCALES) expect(city.name[locale]).not.toBe('');
    }
  });

  it('uses valid IANA time zones', () => {
    for (const city of CITIES) {
      expect(() => new Intl.DateTimeFormat('en', { timeZone: city.timeZone })).not.toThrow();
    }
  });
});
