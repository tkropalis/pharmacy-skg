import { describe, expect, it } from 'vitest';
import {
  appleLegacyUrl,
  defaultDirectionsApp,
  directionsTarget,
  preferredDirectionsApp,
  directionsUrl,
  telUrl,
} from './directions.ts';

const exact = { lat: 40.632612, lon: 22.940912 };

describe('directionsUrl', () => {
  it('builds Google directions without a travel mode (the app keeps the last one)', () => {
    expect(directionsUrl('google', exact)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=40.632612%2C22.940912',
    );
  });
  it('builds the Apple Maps URL that works on every iOS', () => {
    expect(directionsUrl('apple', exact)).toBe(
      'https://maps.apple.com/?daddr=40.632612%2C22.940912',
    );
    expect(appleLegacyUrl(exact)).toBe('https://maps.apple.com/?daddr=40.632612%2C22.940912');
  });
  it('builds a Waze link', () => {
    expect(directionsUrl('waze', exact)).toBe(
      'https://waze.com/ul?ll=40.632612%2C22.940912&navigate=yes',
    );
  });
  it('searches by address text when there are no coordinates', () => {
    const target = { query: 'ΠΑΥΛΟΥ ΜΕΛΑ 22, Πυλαία' };
    expect(directionsUrl('google', target)).toContain('destination=%CE%A0');
    expect(directionsUrl('waze', target)).toMatch(/^https:\/\/waze\.com\/ul\?q=.+&navigate=yes$/);
    expect(appleLegacyUrl(target)).toContain('daddr=');
  });
});

describe('directionsTarget', () => {
  const base = { address: 'ΠΑΥΛΟΥ ΜΕΛΑ 22', locality: 'Πυλαία' };
  it('uses coordinates for exact and street locations', () => {
    for (const precision of ['exact', 'street'] as const) {
      const location = { lat: 1, lon: 2, source: 'override', precision } as const;
      expect(directionsTarget({ ...base, location })).toEqual({ lat: 1, lon: 2 });
    }
  });
  it('uses the address for a locality-level or missing location', () => {
    const location = { lat: 1, lon: 2, source: 'nominatim', precision: 'locality' } as const;
    expect(directionsTarget({ ...base, location })).toEqual({
      query: 'ΠΑΥΛΟΥ ΜΕΛΑ 22, Πυλαία',
    });
    expect(directionsTarget({ ...base, location: null })).toEqual({
      query: 'ΠΑΥΛΟΥ ΜΕΛΑ 22, Πυλαία',
    });
  });
});

describe('telUrl', () => {
  it('keeps digits and a leading plus', () => {
    expect(telUrl('2310 023 026')).toBe('tel:2310023026');
    expect(telUrl('+30 2310-023026')).toBe('tel:+302310023026');
  });
});

describe('defaultDirectionsApp', () => {
  it('opens Apple Maps on iPhone and iPad, Google Maps elsewhere', () => {
    expect(defaultDirectionsApp('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(
      'apple',
    );
    expect(defaultDirectionsApp('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(
      'apple',
    );
    expect(defaultDirectionsApp('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(
      'google',
    );
    expect(defaultDirectionsApp('Mozilla/5.0 (Linux; Android 15; Pixel 9)')).toBe('google');
  });
});

describe('preferredDirectionsApp', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)';
  it('uses the app the person chose last', () => {
    expect(preferredDirectionsApp('waze', iphone)).toBe('waze');
    expect(preferredDirectionsApp('google', iphone)).toBe('google');
  });
  it('falls back to the device default for nothing or anything unknown', () => {
    expect(preferredDirectionsApp(null, iphone)).toBe('apple');
    expect(preferredDirectionsApp('bing', 'Mozilla/5.0 (Linux; Android 15)')).toBe('google');
  });
});
