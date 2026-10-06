import type { CityData, NearbyPharmacy, Pharmacy, PharmacyStatus } from '@pharmacy-skg/core';
import { distanceMetres, openPharmacies, pharmacyStatus } from './engine.ts';

/**
 * The four looks a pharmacy can have on the map and in the list. Regular and extended hours are
 * one look, "open", as they are one word in the list (the owner, 6 Oct 2026).
 */
export type PinKind = 'duty' | 'open' | 'duty-unknown' | 'closed';

export const PIN_KINDS: readonly PinKind[] = ['duty', 'open', 'duty-unknown', 'closed'];

/** On duty, or on duty with no hours printed: what people look for at night. */
export function isDutyKind(kind: PinKind): boolean {
  return kind === 'duty' || kind === 'duty-unknown';
}

/** Duty beats regular or extended hours when several apply at once. */
export function pinKindOf(status: PharmacyStatus): PinKind {
  switch (status.state) {
    case 'closed':
      return 'closed';
    case 'duty-hours-unknown':
      return 'duty-unknown';
    case 'open':
      return status.reasons.some((reason) => reason.kind === 'duty' || reason.kind === 'duty-extra')
        ? 'duty'
        : 'open';
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
 * A pharmacy that closes within 30 minutes goes after the ones that stay open, each group in its
 * own order: at 13:50 the nearest pharmacy still open at 14:05 comes first, not one that closes
 * at 14:00.
 */
export function rankClosingSoonLast<T extends NearbyPharmacy>(rows: readonly T[]): T[] {
  const soon = (row: T) => row.status.state === 'open' && row.status.closingSoon;
  return [...rows.filter((row) => !soon(row)), ...rows.filter(soon)];
}

/**
 * The open pharmacies, nearest first with an origin (otherwise by name) and those about to close
 * last, followed, when asked for, by the closed ones in the same order.
 */
export function buildRows(
  data: CityData,
  at: Date,
  origin: Origin | null,
  includeClosed: boolean,
): RowsResult {
  const open = rankClosingSoonLast(
    openPharmacies(data, at, origin ? { origin } : undefined).map(toRow),
  );
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

/**
 * When nothing is open at `at`: the pharmacies that open first, soonest first and, at the same
 * time, nearest first (otherwise by name). The list never just ends with "none open".
 */
export function nextToOpen(data: CityData, at: Date, origin: Origin | null, limit: number): Row[] {
  const rows: Row[] = [];
  for (const pharmacy of data.pharmacies) {
    const row = toRow(rowOf(data, pharmacy, at, origin));
    if (row.status.state === 'closed' && row.status.nextOpen !== null) rows.push(row);
  }
  const opensAt = (row: Row) =>
    row.status.state === 'closed' ? (row.status.nextOpen?.getTime() ?? Infinity) : Infinity;
  rows.sort((a, b) => {
    const time = opensAt(a) - opensAt(b);
    if (time !== 0) return time;
    if (origin && a.distance !== b.distance) {
      if (a.distance === null) return 1;
      if (b.distance === null) return -1;
      return a.distance - b.distance;
    }
    return greek.compare(a.pharmacy.name, b.pharmacy.name);
  });
  return rows.slice(0, limit);
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
  const { status, dutiesPublished } = pharmacyStatus(data, pharmacy.id, at);
  return { pharmacy, status, distance: distanceTo(origin, pharmacy), dutiesPublished };
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
  const { found, status, dutiesPublished } = pharmacyStatus(data, pharmacyId, at);
  if (!found) return null;
  const pharmacy = data.pharmacies.find((p) => p.id === pharmacyId);
  if (pharmacy === undefined) return null;
  return toRow({ pharmacy, status, distance: distanceTo(origin, pharmacy), dutiesPublished });
}

export type ListFilter = 'all' | 'duty';

export interface FilteredRows {
  /** The rows to list and to put on the map. */
  readonly rows: readonly Row[];
  /** How many of them are open (the closed ones, shown on request, are not counted). */
  readonly openCount: number;
  /** How many of the open pharmacies are on duty (with or without printed hours). */
  readonly dutyCount: number;
  /** The "all / on duty" chips are only worth showing when something other than duty is open. */
  readonly chips: boolean;
  /** The filter that is really applied: always 'all' while the chips are hidden. */
  readonly active: ListFilter;
}

/**
 * The "all open / on duty" filter of the list. By day over a thousand pharmacies are open by
 * their regular hours; the filter lets people see only those on duty. At night every open
 * pharmacy is on duty, the chips are hidden and the remembered choice is not applied.
 */
export function applyListFilter(result: RowsResult, filter: ListFilter): FilteredRows {
  const dutyCount = result.rows.filter((row) => isDutyKind(row.kind)).length;
  const chips = result.openCount > dutyCount;
  if (!chips || filter === 'all') {
    return { rows: result.rows, openCount: result.openCount, dutyCount, chips, active: 'all' };
  }
  const rows = result.rows.filter((row) => isDutyKind(row.kind));
  return { rows, openCount: dutyCount, dutyCount, chips, active: 'duty' };
}
