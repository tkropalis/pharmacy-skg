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
