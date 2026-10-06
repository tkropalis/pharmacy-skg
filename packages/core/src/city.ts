export const LOCALES = ['el', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Greece has one time zone: every opening-hours calculation uses it, never the device's. */
export const GREECE_TIME_ZONE = 'Europe/Athens';

/** [west, south, east, north] in degrees. */
export type Bounds = readonly [number, number, number, number];

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

/** The cities the app shows; the first is the default. */
export const CITIES: readonly City[] = [THESSALONIKI, LARISA];

export function cityById(id: string): City | undefined {
  return CITIES.find((city) => city.id === id);
}

/** The covered area whose bounds contain the point, if any. */
export function cityAt(point: { readonly lat: number; readonly lon: number }): City | undefined {
  return CITIES.find(({ bounds: [west, south, east, north] }) => {
    return point.lon >= west && point.lon <= east && point.lat >= south && point.lat <= north;
  });
}
