import { ITEQ_AREAS } from './areas.ts';

export const LOCALES = ['el', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Greece has one time zone: every opening-hours calculation uses it, never the device's. */
export const GREECE_TIME_ZONE = 'Europe/Athens';

/** [west, south, east, north] in degrees. */
export type Bounds = readonly [number, number, number, number];

/** Greece, from Corfu to Kastellorizo and from Evros to Gavdos. */
export const GREECE_BOUNDS: Bounds = [19.0, 34.5, 30.0, 42.0];

/**
 * An area the app covers: the area of one pharmacists' association, which publishes its own
 * duty lists. `id` is the stable key used in data files (data/<id>/) and URLs.
 */
export interface City {
  readonly id: string;
  readonly name: Readonly<Record<Locale, string>>;
  /** IANA time zone used for every opening-hours calculation. */
  readonly timeZone: string;
  /** Initial map view as [longitude, latitude] (GeoJSON order). */
  readonly center: readonly [number, number];
  /** Where the area's pharmacies are, with a margin: lookups and geocoding stay inside it. */
  readonly bounds: Bounds;
  /**
   * Where a person counts as in the area (`cityAt`), when one box would take in places that are
   * another association's (Evia's box would take in Athens): smaller boxes, inside `bounds`.
   */
  readonly regions?: readonly Bounds[];
  /**
   * The duty group a pharmacy belongs to when its group is unknown (it is in no published list
   * yet): its holidays and its published days are that group's.
   */
  readonly defaultGroupId: string;
}

export const THESSALONIKI: City = {
  id: 'thessaloniki',
  name: { el: 'Θεσσαλονίκη', en: 'Thessaloniki' },
  timeZone: GREECE_TIME_ZONE,
  center: [22.9409, 40.6326], // Aristotelous Square
  // The regional unit: Βόλβη reaches past 23.9°E.
  bounds: [22.55, 40.35, 24.0, 41.05],
  defaultGroupId: 'metro',
};

/**
 * The Larissa regional unit, on ITeQ's platform. It has no regular-hours decision, so the app
 * shows only its pharmacies on duty (decision D26).
 */
export const LARISA: City = {
  id: 'larisa',
  name: { el: 'Λάρισα', en: 'Larissa' },
  timeZone: GREECE_TIME_ZONE,
  center: [22.4191, 39.639], // Κεντρική Πλατεία
  // The regional unit: Ελασσόνα's villages to the north-west, Αγιά's coast to the east.
  bounds: [21.7, 39.1, 23.0, 40.2],
  defaultGroupId: 'larisa',
};

/** The cities the app shows; the first is the default, the rest in Greek alphabetical order. */
export const CITIES: readonly City[] = [
  THESSALONIKI,
  ...[LARISA, ...ITEQ_AREAS].sort((a, b) => a.name.el.localeCompare(b.name.el, 'el')),
];

export function cityById(id: string): City | undefined {
  return CITIES.find((city) => city.id === id);
}

/**
 * The covered area a point is in, if any. Where areas overlap (neighbouring areas' boxes), the
 * one whose box around the point is smallest: the more specific one (north Evia's box against
 * Fthiotida's, for Edipsos).
 */
export function cityAt(point: { readonly lat: number; readonly lon: number }): City | undefined {
  let best: City | undefined;
  let bestSize = Infinity;
  for (const city of CITIES) {
    for (const [west, south, east, north] of city.regions ?? [city.bounds]) {
      if (point.lon < west || point.lon > east || point.lat < south || point.lat > north) continue;
      const size = (east - west) * (north - south);
      if (size < bestSize) {
        best = city;
        bestSize = size;
      }
    }
  }
  return best;
}

/** Whether the point is in Greece (a rough box: it catches swapped or missing coordinates). */
export function inGreece(point: { readonly lat: number; readonly lon: number }): boolean {
  const [west, south, east, north] = GREECE_BOUNDS;
  return point.lon >= west && point.lon <= east && point.lat >= south && point.lat <= north;
}
