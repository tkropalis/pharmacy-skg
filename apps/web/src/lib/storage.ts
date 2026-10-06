/**
 * localStorage that never throws: private windows, blocked site data and quota errors all just
 * mean "nothing remembered". Only per-viewer conveniences are stored this way.
 */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function browserStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readItem(
  key: string,
  storage: KeyValueStorage | null = browserStorage(),
): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeItem(
  key: string,
  value: string | null,
  storage: KeyValueStorage | null = browserStorage(),
): boolean {
  try {
    if (storage === null) return false;
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export const AREA_KEY = 'pharmacy-skg:area';
/** The city last shown (its id), so the next visit opens there (lib/home-city.ts). */
export const CITY_KEY = 'pharmacy-skg:city';
/** When the data was last updated, as meta.json said on the last visit (public/stale-check.js reads it). */
export const DATA_UPDATED_KEY = 'pharmacy-skg:data-updated';
/**
 * 'off' when the person turned the automatic location request off (by clearing the position).
 * Only this flag is kept, never a position (docs/decisions.md, Defaults, Privacy).
 */
export const LOCATION_KEY = 'pharmacy-skg:location';
/** 'duty' when the list shows only the pharmacies on duty by day. */
export const FILTER_KEY = 'pharmacy-skg:filter';
/** The maps app last chosen for directions ('google', 'apple' or 'waze'). */
export const MAPS_KEY = 'pharmacy-skg:maps';
