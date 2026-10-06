import type { City } from '@pharmacy-skg/core';
import { CITIES, cityAt, cityById } from '@pharmacy-skg/core';
import { DEFAULT_CITY_ID } from '../config.ts';
import { loadPosition } from './memory.ts';
import { CITY_KEY, readItem, writeItem } from './storage.ts';
import type { KeyValueStorage } from './storage.ts';

/**
 * The covered city the app opens on: the one shown last (chosen in the area picker, or where
 * the position was), else the one the remembered position is in, else the default. Read on the
 * device only, like the position itself.
 */
export function homeCity(storage?: KeyValueStorage | null): City {
  const stored = readItem(CITY_KEY, storage);
  const position = loadPosition(storage);
  return (
    (stored === null ? undefined : cityById(stored)) ??
    (position === null ? undefined : cityAt(position)) ??
    cityById(DEFAULT_CITY_ID) ??
    (CITIES[0] as City)
  );
}

/** Remembers the city shown, for the next visit. */
export function rememberCity(cityId: string, storage?: KeyValueStorage | null): void {
  writeItem(CITY_KEY, cityId, storage);
}
