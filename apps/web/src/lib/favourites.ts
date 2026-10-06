import { DEFAULT_CITY_ID } from '../config.ts';
import { readItem, writeItem } from './storage.ts';
import type { KeyValueStorage } from './storage.ts';

export const FAVOURITES_KEY = 'pharmacy-skg:favourites';
/** More than anyone will save; keeps a corrupted value from growing without bound. */
export const FAVOURITES_MAX = 200;

/** A saved pharmacy and the city whose data it is in (decision D26). */
export interface Favourite {
  readonly id: string;
  readonly cityId: string;
}

/**
 * Stored as an array of "city/id" strings. A bare id was saved before there was more than one
 * city, so it belongs to the default city.
 */
function parseEntry(entry: string): Favourite | null {
  const slash = entry.indexOf('/');
  if (slash < 0) return entry === '' ? null : { id: entry, cityId: DEFAULT_CITY_ID };
  const cityId = entry.slice(0, slash);
  const id = entry.slice(slash + 1);
  return cityId === '' || id === '' ? null : { id, cityId };
}

/** Parses the stored value; anything else (or garbage) is an empty list. */
export function parseFavourites(raw: string | null): Favourite[] {
  if (raw === null) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const out: Favourite[] = [];
    for (const item of value) {
      const favourite = typeof item === 'string' ? parseEntry(item) : null;
      if (favourite === null || seen.has(favourite.id)) continue;
      seen.add(favourite.id);
      out.push(favourite);
    }
    return out.slice(0, FAVOURITES_MAX);
  } catch {
    return [];
  }
}

export function loadFavourites(storage?: KeyValueStorage | null): Favourite[] {
  return parseFavourites(readItem(FAVOURITES_KEY, storage));
}

/** Returns false when nothing could be stored (the list then lasts for this visit only). */
export function saveFavourites(
  favourites: readonly Favourite[],
  storage?: KeyValueStorage | null,
): boolean {
  const entries = favourites.slice(0, FAVOURITES_MAX).map((f) => `${f.cityId}/${f.id}`);
  return writeItem(FAVOURITES_KEY, JSON.stringify(entries), storage);
}

/** The list with the pharmacy added at the end, or removed if it was there. */
export function toggleFavourite(
  favourites: readonly Favourite[],
  favourite: Favourite,
): Favourite[] {
  return favourites.some((f) => f.id === favourite.id)
    ? favourites.filter((f) => f.id !== favourite.id)
    : [...favourites, favourite].slice(-FAVOURITES_MAX);
}
