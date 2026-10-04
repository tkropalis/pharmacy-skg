export const LOCALES = ['el', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** A city the app covers. `id` is the stable key used in data files and URLs. */
export interface City {
  readonly id: string;
  readonly name: Readonly<Record<Locale, string>>;
  /** IANA time zone used for every opening-hours calculation. */
  readonly timeZone: string;
  /** Initial map view as [longitude, latitude] (GeoJSON order). */
  readonly center: readonly [number, number];
}

export const THESSALONIKI: City = {
  id: 'thessaloniki',
  name: { el: 'Θεσσαλονίκη', en: 'Thessaloniki' },
  timeZone: 'Europe/Athens',
  center: [22.9409, 40.6326], // Aristotelous Square
};

export const CITIES: readonly City[] = [THESSALONIKI];
