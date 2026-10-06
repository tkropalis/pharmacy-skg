import type { City } from '@pharmacy-skg/core';
import { THESSALONIKI, cityAt, cityById } from '@pharmacy-skg/core';
import { DEFAULT_CITY_ID } from '../config.ts';
import { loadPosition } from './memory.ts';
import type { KeyValueStorage } from './storage.ts';

/**
 * The covered area the app opens on: the one the remembered position is in (memory.ts), or
 * the default. Read on the device only, like the position itself.
 */
export function homeCity(storage?: KeyValueStorage | null): City {
  const position = loadPosition(storage);
  return (
    (position === null ? undefined : cityAt(position)) ?? cityById(DEFAULT_CITY_ID) ?? THESSALONIKI
  );
}
