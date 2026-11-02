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

/**
 * The area of the Pharmaceutical Association of Attica: Attica without the Piraeus association's
 * area (its city, the western suburbs on the coast and the islands). Its lists come from its own
 * site, fsa-efimeries.gr, and it has no regular-hours decision the app knows yet, so the app
 * shows only its pharmacies on duty (decision D26). The box is the region's mainland; Piraeus's
 * smaller boxes win where the two meet (`cityAt`).
 */
export const ATTIKI: City = {
  id: 'attiki',
  name: { el: 'Αττική', en: 'Attica' },
  timeZone: GREECE_TIME_ZONE,
  center: [23.7348, 37.9755], // Σύνταγμα
  // Megara and Vilia to the west, Lavrio to the east, Sounio to the south, Oropos to the north.
  bounds: [23.2, 37.6, 24.15, 38.4],
  regions: [
    [23.2, 37.6, 24.15, 38.2],
    // The north-east, to Oropos: not Boeotia's Oinofyta and Thiva, nor Evia across the strait.
    [23.66, 38.2, 24.15, 38.35],
  ],
  defaultGroupId: 'attiki',
};

/**
 * The Cyclades, from the Pharmaceutical Association of the Cyclades' own site (fscyclades.gr):
 * the 8 islands whose towns it lists, replacing the earlier Tinos-only area from ITeQ's site
 * (2 Nov 2026). The islands are far apart, so there is one duty group per island, and the box
 * takes in them all (Sifnos in the west, Santorini in the south-east, Andros in the north).
 * It has no regular-hours decision, so the app shows only its pharmacies on duty (decision D26).
 */
export const CYCLADES: City = {
  id: 'cyclades',
  name: { el: 'Κυκλάδες', en: 'Cyclades' },
  timeZone: GREECE_TIME_ZONE,
  center: [24.9418, 37.4447], // Ermoupoli, the capital
  bounds: [24.6, 36.25, 25.56, 37.98],
  defaultGroupId: 'syros',
};

/**
 * The Kilkis regional unit's four towns, from the Pharmaceutical Association of Kilkis' own site
 * (fskilkis.gr). It has no regular-hours decision the app knows (Kilkis prints other afternoon
 * hours than Thessaloniki's decision gives), so the app shows only its pharmacies on duty
 * (decision D26). The boxes keep to the towns, so that the north-west of the Thessaloniki
 * regional unit stays Thessaloniki's and Gevgelija across the border is not covered.
 */
export const KILKIS: City = {
  id: 'kilkis',
  name: { el: 'Κιλκίς', en: 'Kilkis' },
  timeZone: GREECE_TIME_ZONE,
  center: [22.8736, 40.9937], // 21is Iouniou
  // Goumenissa in the west, Kilkis in the east, Evzonoi in the north.
  bounds: [22.35, 40.85, 22.99, 41.1],
  regions: [
    // Goumenissa, Axioupoli and Polykastro.
    [22.35, 40.85, 22.72, 41.1],
    // Kilkis.
    [22.78, 40.85, 22.99, 41.08],
  ],
  defaultGroupId: 'kilkis',
};

/** The cities the app shows; the first is the default, the rest in Greek alphabetical order. */
export const CITIES: readonly City[] = [
  THESSALONIKI,
  ...[LARISA, ATTIKI, CYCLADES, KILKIS, ...ITEQ_AREAS].sort((a, b) =>
    a.name.el.localeCompare(b.name.el, 'el'),
  ),
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
