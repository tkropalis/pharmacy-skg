import { isDutyKind } from './list.ts';
import type { PinKind, Row } from './list.ts';
import { PIN_SORT_KEY, pinImageName } from './pins.ts';

export interface PinProperties {
  /** The pharmacy's id: the map's sources use it as the feature id (`promoteId`). */
  id: string;
  kind: PinKind;
  approximate: boolean;
  image: string;
  sort: number;
  name: string;
}

export interface PinFeature {
  type: 'Feature';
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
  for (const row of rows) {
    const { location } = row.pharmacy;
    if (location === null) continue;
    const approximate = location.precision === 'locality';
    features.push({
      type: 'Feature',
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
  }
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

// --- Incremental updates ---------------------------------------------------------

/**
 * A change to one property of a feature, in the shape of MapLibre's `updateData` (the diff of a
 * GeoJSON source). The sources use `promoteId: 'id'`, so a feature is known by its pharmacy id.
 */
export interface PinUpdate {
  readonly id: string;
  readonly newGeometry?: PinFeature['geometry'];
  readonly addOrUpdateProperties?: readonly { readonly key: string; readonly value: unknown }[];
}

export interface PinDiff {
  readonly remove?: readonly string[];
  readonly add?: readonly PinFeature[];
  readonly update?: readonly PinUpdate[];
}

/** The features of a source by pharmacy id; if an id repeats, the last one wins. */
export function indexPins(features: readonly PinFeature[]): Map<string, PinFeature> {
  const index = new Map<string, PinFeature>();
  for (const feature of features) index.set(feature.properties.id, feature);
  return index;
}

const PROPERTY_KEYS = ['kind', 'approximate', 'image', 'sort', 'name'] as const;

function sameGeometry(a: PinFeature, b: PinFeature): boolean {
  return (
    a.geometry.coordinates[0] === b.geometry.coordinates[0] &&
    a.geometry.coordinates[1] === b.geometry.coordinates[1]
  );
}

function updateOf(before: PinFeature, after: PinFeature): PinUpdate | null {
  const changed = PROPERTY_KEYS.filter((key) => before.properties[key] !== after.properties[key]);
  const moved = !sameGeometry(before, after);
  if (changed.length === 0 && !moved) return null;
  return {
    id: after.properties.id,
    ...(moved ? { newGeometry: after.geometry } : {}),
    ...(changed.length > 0
      ? {
          addOrUpdateProperties: changed.map((key) => ({ key, value: after.properties[key] })),
        }
      : {}),
  };
}

export type SourceChange =
  | { readonly type: 'replace'; readonly features: PinFeature[] }
  | { readonly type: 'diff'; readonly diff: PinDiff };

/**
 * What a source needs to go from `previous` to `next`: nothing (null), a diff when few of its
 * features changed, or the whole data when the source was empty, ends up empty, or more than
 * half of it changed (a new city), when a diff is no cheaper than the data itself.
 */
export function changeSource(
  previous: ReadonlyMap<string, PinFeature>,
  next: ReadonlyMap<string, PinFeature>,
): SourceChange | null {
  const remove: string[] = [];
  const add: PinFeature[] = [];
  const update: PinUpdate[] = [];
  for (const id of previous.keys()) if (!next.has(id)) remove.push(id);
  for (const [id, feature] of next) {
    const before = previous.get(id);
    if (before === undefined) {
      add.push(feature);
      continue;
    }
    const change = updateOf(before, feature);
    if (change !== null) update.push(change);
  }
  const changes = remove.length + add.length + update.length;
  if (changes === 0) return null;
  if (previous.size === 0 || next.size === 0 || changes * 2 > Math.max(previous.size, next.size)) {
    return { type: 'replace', features: [...next.values()] };
  }
  return {
    type: 'diff',
    diff: {
      ...(remove.length > 0 ? { remove } : {}),
      ...(add.length > 0 ? { add } : {}),
      ...(update.length > 0 ? { update } : {}),
    },
  };
}
