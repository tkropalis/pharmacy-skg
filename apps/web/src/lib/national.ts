/**
 * The national files, written at build time from data/ (integrations/national-files.ts) so that
 * the map can know every covered area, and who is on duty in all of them, without loading each
 * area's data (roadmap, National coverage, step 3):
 *
 *  - `/data/index.json`: each area's bounds, centre, size and freshness, and the dates of its
 *    published duty lists (a few KB);
 *  - `/data/duty/<date>.json`: that day's pharmacies on duty in every area, with where they are
 *    and the hours as printed (about 15 KB compressed for the whole country).
 *
 * Only what the build publishes goes in (decision D11): nothing is predicted. The pure parts are
 * here and tested; reading the files is in the integration.
 */
import type {
  Bounds,
  City,
  DutyDay,
  IsoDate,
  Meta,
  Pharmacy,
  TimeWindow,
} from '@pharmacy-skg/core';
import { addDays, localToInstant } from '@pharmacy-skg/core';
import { DATA_BASE_PATH } from './data.ts';

export const NATIONAL_INDEX_PATH = 'index.json';

/** Where a day's national duty file is published, under /data/. */
export function nationalDutyPath(date: IsoDate): string {
  return `duty/${date}.json`;
}

const NATIONAL_DUTY_FILE = /^duty\/(\d{4}-\d{2}-\d{2})\.json$/;

/** The date of a published national duty path, or null when the path is not one. */
export function nationalDutyDateOf(path: string): IsoDate | null {
  return NATIONAL_DUTY_FILE.exec(path)?.[1] ?? null;
}

/** Yesterday (the overnight lists) to this many days ahead are published nationally. */
export const NATIONAL_DUTY_DAYS_AHEAD = 14;

/** Whether a date has a national duty file in a build made on `today`. */
export function isNationalDutyDate(date: IsoDate, today: IsoDate): boolean {
  return date >= addDays(today, -1) && date <= addDays(today, NATIONAL_DUTY_DAYS_AHEAD);
}

// --- The index -------------------------------------------------------------------

export interface NationalCity {
  readonly id: string;
  readonly bounds: Bounds;
  /** [longitude, latitude]. */
  readonly center: readonly [number, number];
  /** How many pharmacies the area has. */
  readonly pharmacies: number;
  /** When its data last changed, and when its sources were last read. */
  readonly updatedAt: string;
  readonly checkedAt: string | null;
  /** The range of its published duty lists, or null when it has none. */
  readonly duties: { readonly from: IsoDate; readonly to: IsoDate } | null;
  /** The dates of the duty lists the site publishes for it, in order. */
  readonly dutyDates: readonly IsoDate[];
}

export interface NationalIndex {
  readonly schemaVersion: 1;
  readonly cities: readonly NationalCity[];
}

/** One area as the index needs it: the registry entry, its meta.json as published, its size. */
export interface NationalSource {
  readonly city: City;
  readonly meta: Meta;
  readonly pharmacies: number;
}

export function buildNationalIndex(sources: readonly NationalSource[]): NationalIndex {
  return {
    schemaVersion: 1,
    cities: sources.map(({ city, meta, pharmacies }) => ({
      id: city.id,
      bounds: city.bounds,
      center: city.center,
      pharmacies,
      updatedAt: meta.updatedAt,
      checkedAt: meta.checkedAt ?? null,
      duties: meta.duties === null ? null : { from: meta.duties.from, to: meta.duties.to },
      dutyDates: meta.duties === null ? [] : [...(meta.duties.dates ?? [])].sort(),
    })),
  };
}

// --- A day's pharmacies on duty ---------------------------------------------------

/** A duty window as printed: from, to, whether it ends on the next day, whether it is on call. */
export type NationalWindow = readonly [
  from: string,
  to: string,
  toNextDay: boolean,
  onCall: boolean,
];

export interface NationalDuty {
  /** The pharmacy's id, in its area's pharmacies.json. */
  readonly id: string;
  readonly lat: number;
  readonly lon: number;
  /** Placed at locality level only. */
  readonly approximate?: true;
  /** The hours printed for it that day; empty when the list prints none. */
  readonly windows: readonly NationalWindow[];
  /** On a list that prints no hours for it (call first). */
  readonly unknown?: true;
}

export interface NationalDutyDay {
  readonly schemaVersion: 1;
  readonly date: IsoDate;
  /** Each area's pharmacies on duty, by the area's id; an area without a list is absent. */
  readonly cities: Readonly<Record<string, readonly NationalDuty[]>>;
}

/** One area's pharmacies and its list for the date. */
export interface NationalDutySource {
  readonly cityId: string;
  readonly pharmacies: readonly Pharmacy[];
  readonly day: DutyDay | undefined;
}

const round5 = (degrees: number) => Math.round(degrees * 1e5) / 1e5;

/**
 * The pharmacies on duty on `date` in every area that has a list for it. A pharmacy with no
 * location is left out (the map cannot draw it); one listed twice (a day and a night duty)
 * appears once, with each window.
 */
export function buildNationalDutyDay(
  date: IsoDate,
  sources: readonly NationalDutySource[],
): NationalDutyDay {
  const cities: Record<string, NationalDuty[]> = {};
  for (const { cityId, pharmacies, day } of sources) {
    if (day === undefined) continue;
    const located = new Map<string, Pharmacy>();
    for (const pharmacy of pharmacies)
      if (pharmacy.location !== null) located.set(pharmacy.id, pharmacy);

    const windows = new Map<string, NationalWindow[]>();
    const unknown = new Set<string>();
    for (const group of day.groups) {
      for (const section of group.sections) {
        for (const { pharmacyId } of section.entries) {
          if (!located.has(pharmacyId)) continue;
          const list = windows.get(pharmacyId) ?? [];
          windows.set(pharmacyId, list);
          const { hours } = section;
          if (hours === null) {
            unknown.add(pharmacyId);
            continue;
          }
          const window = windowOf(hours, section.onCall === true);
          if (!list.some((w) => w.join('|') === window.join('|'))) list.push(window);
        }
      }
    }

    const entries: NationalDuty[] = [];
    for (const [id, list] of windows) {
      const location = located.get(id)?.location;
      if (location === undefined || location === null) continue;
      entries.push({
        id,
        lat: round5(location.lat),
        lon: round5(location.lon),
        ...(location.precision === 'locality' ? { approximate: true as const } : {}),
        windows: list,
        ...(unknown.has(id) ? { unknown: true as const } : {}),
      });
    }
    if (entries.length > 0) cities[cityId] = entries;
  }
  return { schemaVersion: 1, date, cities };
}

function windowOf(hours: TimeWindow, onCall: boolean): NationalWindow {
  return [hours.from, hours.to, hours.toNextDay, onCall];
}

/**
 * Whether the pharmacy is on duty at `at`, for its listing on `date`: inside one of its printed
 * windows, or, when a list prints no hours for it, during the duty day (08:00 to 08:00). On call
 * counts: it is on duty, but the map should say "call first", as the list does.
 */
export function onDutyAt(duty: NationalDuty, date: IsoDate, at: Date, timeZone: string): boolean {
  const t = at.getTime();
  const inside = (from: Date, to: Date) => from.getTime() <= t && t < to.getTime();
  if (
    duty.unknown === true &&
    inside(
      localToInstant(date, '08:00', timeZone),
      localToInstant(addDays(date, 1), '08:00', timeZone),
    )
  ) {
    return true;
  }
  return duty.windows.some(([from, to, toNextDay]) =>
    inside(
      localToInstant(date, from, timeZone),
      localToInstant(toNextDay ? addDays(date, 1) : date, to, timeZone),
    ),
  );
}

// --- Reading them ----------------------------------------------------------------

export interface LoadNationalOptions {
  readonly fetch?: typeof fetch;
  readonly basePath?: string;
  readonly signal?: AbortSignal;
}

/** The parsed body, or null for a 404. */
async function getJson(path: string, options: LoadNationalOptions): Promise<unknown> {
  const doFetch = options.fetch ?? fetch;
  const url = `${options.basePath ?? DATA_BASE_PATH}/${path}`;
  const response = await doFetch(
    url,
    options.signal === undefined ? {} : { signal: options.signal },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GET ${url} failed with HTTP ${response.status}`);
  return response.json();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The national index, or null when the site has none (an old build). */
export async function loadNationalIndex(
  options: LoadNationalOptions = {},
): Promise<NationalIndex | null> {
  const body = await getJson(NATIONAL_INDEX_PATH, options);
  if (!isRecord(body) || body['schemaVersion'] !== 1 || !Array.isArray(body['cities'])) return null;
  return body as unknown as NationalIndex;
}

/** A day's national duty file, or null when that day has none. */
export async function loadNationalDutyDay(
  date: IsoDate,
  options: LoadNationalOptions = {},
): Promise<NationalDutyDay | null> {
  const body = await getJson(nationalDutyPath(date), options);
  if (!isRecord(body) || body['schemaVersion'] !== 1 || !isRecord(body['cities'])) return null;
  if (body['date'] !== date) return null;
  return body as unknown as NationalDutyDay;
}
