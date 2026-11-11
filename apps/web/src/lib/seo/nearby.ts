import type { Locale, Pharmacy } from '@pharmacy-skg/core';
import { distanceMetres } from '@pharmacy-skg/core';
import type { Dictionary } from '../../i18n/index.ts';
import { pharmacyPath } from '../../i18n/routes.ts';
import { fill, formatDistance } from '../format.ts';
import { displayName, placeLine } from '../names.ts';
import { telHref } from './jsonld.ts';
import { romanize, romanizeLocality } from './translit.ts';

/** How many neighbours a pharmacy's page lists. */
export const NEARBY_COUNT = 3;

export interface NearbyEntry {
  readonly pharmacy: Pharmacy;
  /** Metres, or null where the pharmacy's own position is not known. */
  readonly distance: number | null;
}

const isPrecise = (p: Pharmacy) =>
  p.location !== null && (p.location.precision === 'exact' || p.location.precision === 'street');

/**
 * The pharmacies closest to this one, for its page: real neighbours from the registry's own
 * coordinates, whatever the hour (the browser then puts the ones open now in their place).
 * A pharmacy without a usable position gets others of its locality, with no distance: a
 * distance from the middle of a village would look more exact than it is.
 */
export function nearestPharmacies(
  all: readonly Pharmacy[],
  pharmacy: Pharmacy,
  count = NEARBY_COUNT,
): NearbyEntry[] {
  if (isPrecise(pharmacy) && pharmacy.location !== null) {
    const origin = pharmacy.location;
    // Attica has over 3,000 pharmacies and a page for each in two languages: no full sort.
    const nearest: { pharmacy: Pharmacy; distance: number }[] = [];
    for (const other of all) {
      if (other.id === pharmacy.id || !isPrecise(other) || other.location === null) continue;
      const distance = distanceMetres(origin, other.location);
      const worst = nearest.at(-1);
      if (nearest.length === count && worst !== undefined && distance >= worst.distance) continue;
      const at = nearest.findIndex((entry) => entry.distance > distance);
      nearest.splice(at === -1 ? nearest.length : at, 0, { pharmacy: other, distance });
      if (nearest.length > count) nearest.pop();
    }
    return nearest;
  }
  return all
    .filter((p) => p.id !== pharmacy.id && p.locality === pharmacy.locality)
    .slice(0, count)
    .map((p) => ({ pharmacy: p, distance: null }));
}

/** A name or address as data has it on a Greek page, in Latin letters on an English one. */
export function latinOrGreek(text: string, locale: Locale): string {
  return locale === 'en' ? romanize(text) : text;
}

/** A neighbour on a pharmacy's page: built at the build and again in the browser. */
export interface NearbyView {
  readonly id: string;
  readonly name: string;
  /** "ΠΑΥΛΟΥ ΜΕΛΑ 22, Πυλαία" */
  readonly place: string;
  /** "350 μ", or null where the distance would look more exact than it is. */
  readonly distanceText: string | null;
  readonly path: string;
  readonly phoneHref: string | null;
  /** "Κλήση: {name}" */
  readonly callLabel: string;
}

export function nearbyView(
  pharmacy: Pharmacy,
  distance: number | null,
  locale: Locale,
  cityName: string,
  row: Dictionary['app']['row'],
): NearbyView {
  const name = latinOrGreek(displayName(pharmacy.name), locale);
  return {
    id: pharmacy.id,
    name,
    place: placeLine(
      latinOrGreek(pharmacy.address, locale),
      locale === 'en' ? romanizeLocality(pharmacy.locality) : pharmacy.locality,
      cityName,
    ),
    distanceText: distance === null ? null : formatDistance(distance, locale),
    path: pharmacyPath(locale, pharmacy.id),
    phoneHref: telHref(pharmacy.phone),
    callLabel: fill(row.callLabel, { name }),
  };
}
