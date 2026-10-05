import { isDutyKind } from './list.ts';
import type { PinKind, Row } from './list.ts';
import { PIN_SORT_KEY, pinImageName } from './pins.ts';

export interface PinProperties {
  id: string;
  kind: PinKind;
  approximate: boolean;
  image: string;
  sort: number;
  name: string;
}

export interface PinFeature {
  type: 'Feature';
  id: number;
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: PinProperties;
}

export interface PinCollection {
  type: 'FeatureCollection';
  features: PinFeature[];
}

/**
 * GeoJSON for the rows that have a location. Pharmacies with no location only appear in the
 * list. Approximate locations (locality level) get the dashed marker.
 */
export function pinCollection(rows: readonly Row[]): PinCollection {
  const features: PinFeature[] = [];
  rows.forEach((row, index) => {
    const { location } = row.pharmacy;
    if (location === null) return;
    const approximate = location.precision === 'locality';
    features.push({
      type: 'Feature',
      id: index,
      geometry: { type: 'Point', coordinates: [location.lon, location.lat] },
      properties: {
        id: row.pharmacy.id,
        kind: row.kind,
        approximate,
        image: pinImageName(row.kind, approximate),
        sort: PIN_SORT_KEY[row.kind],
        name: row.pharmacy.name,
      },
    });
  });
  return { type: 'FeatureCollection', features };
}

export interface SplitPins {
  /** On duty (hours stated or not): drawn one by one, never clustered. */
  readonly duty: PinFeature[];
  /** Regular and extended hours: the only ones that are clustered. */
  readonly clustered: PinFeature[];
  /** Closed ones (shown on request): drawn one by one from a close zoom. */
  readonly closed: PinFeature[];
}

/** Sorts the pins into the three map sources (see map-layers.ts). */
export function splitPins(collection: PinCollection): SplitPins {
  const duty: PinFeature[] = [];
  const clustered: PinFeature[] = [];
  const closed: PinFeature[] = [];
  for (const feature of collection.features) {
    const kind = feature.properties.kind;
    if (kind === 'closed') closed.push(feature);
    else if (isDutyKind(kind)) duty.push(feature);
    else clustered.push(feature);
  }
  return { duty, clustered, closed };
}
