import { describe, expect, it } from 'vitest';
import { homeCity } from './home-city.ts';
import { LAST_POSITION_KEY } from './memory.ts';
import type { KeyValueStorage } from './storage.ts';

function storageWith(entries: Record<string, string>): KeyValueStorage {
  const map = new Map(Object.entries(entries));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

const position = (lat: number, lon: number) =>
  storageWith({ [LAST_POSITION_KEY]: JSON.stringify({ lat, lon, at: 0 }) });

describe('homeCity', () => {
  it('opens on the area the remembered position is in', () => {
    expect(homeCity(position(40.595, 22.96)).id).toBe('thessaloniki');
  });

  it('falls back to the default area elsewhere or without a position', () => {
    expect(homeCity(position(37.984, 23.728)).id).toBe('thessaloniki');
    expect(homeCity(storageWith({})).id).toBe('thessaloniki');
  });
});
