import { describe, expect, it } from 'vitest';
import { homeCity, rememberCity } from './home-city.ts';
import { LAST_POSITION_KEY } from './memory.ts';
import { CITY_KEY } from './storage.ts';
import type { KeyValueStorage } from './storage.ts';

function storageWith(entries: Record<string, string>): KeyValueStorage {
  const map = new Map(Object.entries(entries));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

const position = (lat: number, lon: number) => JSON.stringify({ lat, lon, at: 0 });

describe('homeCity', () => {
  it('opens on the area the remembered position is in', () => {
    expect(homeCity(storageWith({ [LAST_POSITION_KEY]: position(40.595, 22.96) })).id).toBe(
      'thessaloniki',
    );
    expect(homeCity(storageWith({ [LAST_POSITION_KEY]: position(39.639, 22.419) })).id).toBe(
      'larisa',
    );
  });

  it('prefers the city shown last over the position', () => {
    const storage = storageWith({ [LAST_POSITION_KEY]: position(40.595, 22.96) });
    rememberCity('larisa', storage);
    expect(storage.getItem(CITY_KEY)).toBe('larisa');
    expect(homeCity(storage).id).toBe('larisa');
  });

  it('falls back to the default area elsewhere, without a position or with an unknown city', () => {
    expect(homeCity(storageWith({ [LAST_POSITION_KEY]: position(37.984, 23.728) })).id).toBe(
      'thessaloniki',
    );
    expect(homeCity(storageWith({})).id).toBe('thessaloniki');
    expect(homeCity(storageWith({ [CITY_KEY]: 'atlantis' })).id).toBe('thessaloniki');
  });
});
