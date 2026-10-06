import { readItem, writeItem } from './storage.ts';
import type { KeyValueStorage } from './storage.ts';

/**
 * What the app remembers for the person, on the device only (localStorage, never sent, never
 * counted): the last position, the areas they chose recently and the pharmacies they open most.
 * Each parser treats anything unexpected as "nothing remembered".
 */

// --- The last position ----------------------------------------------------------

export const LAST_POSITION_KEY = 'pharmacy-skg:last-position';
/** Three decimals: about 110 m north–south and 85 m east–west here. Enough for distances. */
const POSITION_DECIMALS = 3;

export interface RememberedPosition {
  readonly lat: number;
  readonly lon: number;
  /** When it was taken (ms since the epoch). */
  readonly at: number;
}

const round = (value: number) => Number(value.toFixed(POSITION_DECIMALS));

export function parsePosition(raw: string | null): RememberedPosition | null {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<RememberedPosition> | null;
    const { lat, lon, at } = value ?? {};
    if (typeof lat !== 'number' || typeof lon !== 'number' || typeof at !== 'number') return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || !Number.isFinite(at)) return null;
    return { lat, lon, at };
  } catch {
    return null;
  }
}

export function loadPosition(storage?: KeyValueStorage | null): RememberedPosition | null {
  return parsePosition(readItem(LAST_POSITION_KEY, storage));
}

/** Keeps a position, rounded, so the next visit can start from it without asking. */
export function savePosition(
  position: { readonly lat: number; readonly lon: number },
  at: number,
  storage?: KeyValueStorage | null,
): void {
  const value = { lat: round(position.lat), lon: round(position.lon), at };
  writeItem(LAST_POSITION_KEY, JSON.stringify(value), storage);
}

export function forgetPosition(storage?: KeyValueStorage | null): void {
  writeItem(LAST_POSITION_KEY, null, storage);
}

// --- Recent areas ---------------------------------------------------------------

export const RECENT_AREAS_KEY = 'pharmacy-skg:recent-areas';
export const RECENT_AREAS_MAX = 4;

export function parseNames(raw: string | null, max: number): string[] {
  if (raw === null) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const names = value.filter((v): v is string => typeof v === 'string' && v !== '');
    return [...new Set(names)].slice(0, max);
  } catch {
    return [];
  }
}

/** The areas chosen recently, the latest first. */
export function loadRecentAreas(storage?: KeyValueStorage | null): string[] {
  return parseNames(readItem(RECENT_AREAS_KEY, storage), RECENT_AREAS_MAX);
}

/** The list with `name` moved (or added) to the front. */
export function withRecentArea(names: readonly string[], name: string): string[] {
  return [name, ...names.filter((n) => n !== name)].slice(0, RECENT_AREAS_MAX);
}

export function rememberArea(name: string, storage?: KeyValueStorage | null): void {
  const next = withRecentArea(loadRecentAreas(storage), name);
  writeItem(RECENT_AREAS_KEY, JSON.stringify(next), storage);
}

// --- Pharmacies opened most -----------------------------------------------------

export const VISITS_KEY = 'pharmacy-skg:visits';
/** How many pharmacies are counted at most; the least visited go first. */
export const VISITS_MAX = 50;
/** Opening the same pharmacy again within this time is the same visit. */
export const VISIT_GAP_MS = 30 * 60_000;
/** Shown once opened on this many separate visits. */
export const FREQUENT_MIN_VISITS = 2;
export const FREQUENT_SHOWN = 3;

/** Pharmacy id to [visits, last visit in ms]. */
export type Visits = Readonly<Record<string, readonly [number, number]>>;

export function parseVisits(raw: string | null): Visits {
  if (raw === null) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
    const visits: Record<string, [number, number]> = {};
    for (const [id, entry] of Object.entries(value)) {
      if (
        Array.isArray(entry) &&
        Number.isInteger(entry[0]) &&
        entry[0] > 0 &&
        typeof entry[1] === 'number' &&
        Number.isFinite(entry[1])
      ) {
        visits[id] = [entry[0], entry[1]];
      }
    }
    return pruneVisits(visits);
  } catch {
    return {};
  }
}

/** Most visited first; between equals, the latest first. */
function byVisits(visits: Visits): string[] {
  return Object.keys(visits).sort((a, b) => {
    const [na, la] = visits[a] ?? [0, 0];
    const [nb, lb] = visits[b] ?? [0, 0];
    return nb - na || lb - la;
  });
}

function pruneVisits(visits: Visits): Visits {
  const kept = byVisits(visits).slice(0, VISITS_MAX);
  return Object.fromEntries(kept.map((id) => [id, visits[id] as readonly [number, number]]));
}

/**
 * The counts with a visit to `id` at `now` (not counted again within VISIT_GAP_MS). A pharmacy
 * opened for the first time always gets a place: the least visited other one makes room.
 */
export function withVisit(visits: Visits, id: string, now: number): Visits {
  const [count, last] = visits[id] ?? [0, 0];
  if (count > 0 && now - last < VISIT_GAP_MS) return { ...visits, [id]: [count, now] };
  const next: Visits = { ...visits, [id]: [count + 1, now] };
  const dropped = new Set(
    byVisits(next)
      .filter((other) => other !== id)
      .slice(VISITS_MAX - 1),
  );
  return Object.fromEntries(Object.entries(next).filter(([other]) => !dropped.has(other)));
}

export function loadVisits(storage?: KeyValueStorage | null): Visits {
  return parseVisits(readItem(VISITS_KEY, storage));
}

export function recordVisit(id: string, now: number, storage?: KeyValueStorage | null): void {
  writeItem(VISITS_KEY, JSON.stringify(withVisit(loadVisits(storage), id, now)), storage);
}

/**
 * The pharmacies the person opens most, for the favourites tab: opened on at least
 * FREQUENT_MIN_VISITS visits, not already a favourite, at most FREQUENT_SHOWN.
 */
export function frequentPharmacies(visits: Visits, exclude: readonly string[]): string[] {
  return byVisits(visits)
    .filter((id) => !exclude.includes(id) && (visits[id]?.[0] ?? 0) >= FREQUENT_MIN_VISITS)
    .slice(0, FREQUENT_SHOWN);
}
