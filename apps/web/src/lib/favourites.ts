import { readItem, writeItem } from './storage.ts';
import type { KeyValueStorage } from './storage.ts';

export const FAVOURITES_KEY = 'pharmacy-skg:favourites';
/** More than anyone will save; keeps a corrupted value from growing without bound. */
export const FAVOURITES_MAX = 200;

/** Parses the stored value: an array of ids, anything else (or garbage) is an empty list. */
export function parseFavourites(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const ids = value.filter((v): v is string => typeof v === 'string' && v !== '');
    return [...new Set(ids)].slice(0, FAVOURITES_MAX);
  } catch {
    return [];
  }
}

export function loadFavourites(storage?: KeyValueStorage | null): string[] {
  return parseFavourites(readItem(FAVOURITES_KEY, storage));
}

/** Returns false when nothing could be stored (the list then lasts for this visit only). */
export function saveFavourites(ids: readonly string[], storage?: KeyValueStorage | null): boolean {
  return writeItem(FAVOURITES_KEY, JSON.stringify(ids.slice(0, FAVOURITES_MAX)), storage);
}

/** The list with `id` added at the end, or removed if it was there. */
export function toggleFavourite(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(-FAVOURITES_MAX);
}
