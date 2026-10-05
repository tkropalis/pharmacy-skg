import type { CityData, NearbyPharmacy, Pharmacy, PharmacyStatus } from '@pharmacy-skg/core';
import { distanceMetres, openPharmacies, pharmacyStatus } from './engine.ts';

/** The five looks a pharmacy can have on the map and in the list. */
export type PinKind = 'duty' | 'regular' | 'extended' | 'duty-unknown' | 'closed';

export const PIN_KINDS: readonly PinKind[] = [
  'duty',
  'regular',
  'extended',
  'duty-unknown',
  'closed',
];

/** Duty beats extended hours beats regular hours when several apply at once. */
export function pinKindOf(status: PharmacyStatus): PinKind {
  switch (status.state) {
    case 'closed':
      return 'closed';
    case 'duty-hours-unknown':
      return 'duty-unknown';
    case 'open': {
      let kind: PinKind = 'regular';
      for (const reason of status.reasons) {
        if (reason.kind === 'duty' || reason.kind === 'duty-extra') return 'duty';
        if (reason.kind === 'extended') kind = 'extended';
      }
      return kind;
    }
  }
}

export interface Row extends NearbyPharmacy {
  readonly kind: PinKind;
}

export interface Origin {
  readonly lat: number;
  readonly lon: number;
}

const greek = new Intl.Collator('el');

function toRow(item: NearbyPharmacy): Row {
  return { ...item, kind: pinKindOf(item.status) };
}

export interface RowsResult {
  readonly rows: readonly Row[];
  /** How many of `rows` are open (or on duty); the rest are closed ones, shown on request. */
  readonly openCount: number;
}

/**
 * The open pharmacies, nearest first with an origin (otherwise by name), followed, when asked
 * for, by the closed ones in the same order.
 */
export function buildRows(
  data: CityData,
  at: Date,
  origin: Origin | null,
  includeClosed: boolean,
): RowsResult {
  const open = openPharmacies(data, at, origin ? { origin } : undefined).map(toRow);
  if (!includeClosed) return { rows: open, openCount: open.length };

  const openIds = new Set(open.map((row) => row.pharmacy.id));
  const closed: Row[] = [];
  for (const pharmacy of data.pharmacies) {
    if (openIds.has(pharmacy.id)) continue;
    closed.push(toRow(rowOf(data, pharmacy, at, origin)));
  }
  closed.sort((a, b) => {
    if (origin && a.distance !== b.distance) {
      if (a.distance === null) return 1;
      if (b.distance === null) return -1;
      return a.distance - b.distance;
    }
    return greek.compare(a.pharmacy.name, b.pharmacy.name);
  });
  return { rows: [...open, ...closed], openCount: open.length };
}

function distanceTo(origin: Origin | null, pharmacy: Pharmacy): number | null {
  return origin && pharmacy.location ? distanceMetres(origin, pharmacy.location) : null;
}

function rowOf(
  data: CityData,
  pharmacy: Pharmacy,
  at: Date,
  origin: Origin | null,
): NearbyPharmacy {
  const { status } = pharmacyStatus(data, pharmacy.id, at);
  return { pharmacy, status, distance: distanceTo(origin, pharmacy) };
}

/**
 * One pharmacy's row (favourites), or null when the id is not in the data any more. The core
 * engine decides that (`found`), so the screen and the engine cannot disagree about it.
 */
export function rowFor(
  data: CityData,
  pharmacyId: string,
  at: Date,
  origin: Origin | null,
): Row | null {
  const { found, status } = pharmacyStatus(data, pharmacyId, at);
  if (!found) return null;
  const pharmacy = data.pharmacies.find((p) => p.id === pharmacyId);
  if (pharmacy === undefined) return null;
  return toRow({ pharmacy, status, distance: distanceTo(origin, pharmacy) });
}
