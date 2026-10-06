import { describe, expect, it } from 'vitest';
import { CITIES, LOCALES, THESSALONIKI, cityAt, cityById } from './city.ts';

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

  it('keeps each centre inside its bounds, within Greece', () => {
    for (const city of CITIES) {
      const [west, south, east, north] = city.bounds;
      expect(west).toBeLessThan(east);
      expect(south).toBeLessThan(north);
      expect(west).toBeGreaterThan(19);
      expect(east).toBeLessThan(30);
      expect(south).toBeGreaterThan(34);
      expect(north).toBeLessThan(42);
      const [lon, lat] = city.center;
      expect(cityAt({ lat, lon })).toBe(city);
    }
  });
});

describe('cityById', () => {
  it('finds a city by its id', () => {
    expect(cityById('thessaloniki')).toBe(THESSALONIKI);
    expect(cityById('atlantis')).toBeUndefined();
  });
});

describe('cityAt', () => {
  it('finds the area a position is in', () => {
    expect(cityAt({ lat: 40.5947, lon: 22.9603 })).toBe(THESSALONIKI); // Kalamaria
    expect(cityAt({ lat: 40.7494, lon: 23.0683 })).toBe(THESSALONIKI); // Λαγκαδάς
    expect(cityAt({ lat: 40.7245, lon: 23.7117 })).toBe(THESSALONIKI); // Ασπροβάλτα
  });

  it('finds none outside the covered areas', () => {
    expect(cityAt({ lat: 37.9838, lon: 23.7275 })).toBeUndefined(); // Athens
  });
});
