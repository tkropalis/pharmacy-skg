import type { Row } from './list.ts';
import { PIN_SORT_KEY, pinImageName } from './pins.ts';

export interface PinProperties {
  id: string;
  kind: string;
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
