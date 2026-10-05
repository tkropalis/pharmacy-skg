/**
 * "Open now" logic (milestone M2). Pure functions over the published data:
 * no I/O, no device clock, no device time zone. Every local time is
 * interpreted in the city's IANA time zone. The rules are decision D23.
 *
 * `CityData` objects are treated as immutable: derived indexes are cached per
 * object, so load new data into a new object.
 */
import type {
  CityData,
  DutyKind,
  DutySection,
  ExtendedHours,
  ExtendedHoursEntry,
  IsoDate,
  Pharmacy,
  TimeRange,
  TimeWindow,
} from './data.ts';
import { DEFAULT_GROUP_ID, isHoliday } from './holidays.ts';
import { regularRanges } from './regular-hours.ts';
import { addDays, isoWeekday, localToInstant, zonedDate, zonedParts } from './zoned.ts';

export type { CityData } from './data.ts';

/** Why a pharmacy is open during an interval. */
export type OpenReason =
  | { readonly kind: 'regular' }
  | { readonly kind: 'extended' }
  | {
      readonly kind: 'duty';
      readonly duty: DutyKind;
      /** The duty list's date (an overnight window started that evening). */
      readonly date: IsoDate;
      readonly groupId: string;
      readonly heading: string;
    }
  | {
      /** Extra hours printed under a duty heading, e.g. Tue/Thu/Fri 14:00–17:00. */
      readonly kind: 'duty-extra';
      readonly duty: DutyKind;
      readonly date: IsoDate;
      readonly groupId: string;
    };

/** A half-open interval [start, end) in absolute time. */
export interface OpenInterval {
  readonly start: Date;
  readonly end: Date;
  readonly reasons: readonly OpenReason[];
}

/** An on-duty listing whose heading prints no hours (e.g. Θέρμη, Ασβεστοχώρι). */
export interface DutyWithoutHours {
  readonly date: IsoDate;
  readonly duty: DutyKind;
  readonly groupId: string;
  readonly heading: string;
}

export type PharmacyStatus =
  | {
      readonly state: 'open';
      /** End of the merged open interval containing `at` (adjacent intervals merge). */
      readonly until: Date;
      /** Why it is open at `at`: the reasons of the openings that contain `at`. */
      readonly reasons: readonly OpenReason[];
      /** The reasons of the whole merged run up to `until`, including later ones. */
      readonly runReasons: readonly OpenReason[];
      /** True if `until` is within 30 minutes of `at`. */
      readonly closingSoon: boolean;
    }
  | {
      /** Listed as on duty today, but the list prints no hours: "call to check". */
      readonly state: 'duty-hours-unknown';
      readonly duty: DutyWithoutHours;
      readonly nextOpen: Date | null;
    }
  | {
      readonly state: 'closed';
      /** Next known opening within the horizon (7 days), or null. */
      readonly nextOpen: Date | null;
      /** Why it opens at `nextOpen`: the reasons of the openings that start then. */
      readonly nextReasons: readonly OpenReason[];
      /** The reasons of the whole merged run that starts at `nextOpen`. */
      readonly nextRunReasons: readonly OpenReason[];
    };

export interface StatusDetails {
  /** False for a pharmacy id that is not in `CityData.pharmacies`; `status` is then `closed`. */
  readonly found: boolean;
  readonly status: PharmacyStatus;
  /**
   * False when a date the answer depends on has no published duty list yet, so the
   * answer may change once it is: every date from the duty day containing `at`
   * (yesterday before 08:00) through today and the day of `nextOpen`. A date counts as
   * published only when its file contains the pharmacy's area group (`groupId`, or the
   * default group when null), since each group has its own list (decision D23).
   */
  readonly dutiesPublished: boolean;
}

export interface NearbyPharmacy {
  readonly pharmacy: Pharmacy;
  readonly status: PharmacyStatus;
  /** Metres from the origin; null without an origin or a location. */
  readonly distance: number | null;
  /**
   * Same meaning as `StatusDetails.dutiesPublished`, per pharmacy: false when a date the
   * answer depends on has no duty list for this pharmacy's area group yet.
   */
  readonly dutiesPublished: boolean;
}

export interface PublishedDuty {
  readonly date: IsoDate;
  readonly groupId: string;
  readonly duty: DutyKind;
  readonly heading: string;
  readonly hours: TimeWindow | null;
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
/** How far ahead `nextOpen` and `until` look. */
const HORIZON_DAYS = 7;
const CLOSING_SOON_MS = 30 * MINUTE_MS;
/** A duty day runs from 08:00 until 08:00 the next morning. */
const DUTY_DAY_START_MINUTES = 8 * 60;

// --- Indexes -----------------------------------------------------------------

interface DutyListing {
  readonly date: IsoDate;
  readonly groupId: string;
  readonly section: DutySection;
}

interface ExtendedListing {
  readonly period: ExtendedHours['period'];
  readonly entry: ExtendedHoursEntry;
}

interface Index {
  readonly pharmacies: ReadonlyMap<string, Pharmacy>;
  /** Pharmacy → duty date (chronological) → sections listing it. */
  readonly duties: ReadonlyMap<string, ReadonlyMap<IsoDate, readonly DutyListing[]>>;
  /** Pharmacy → extended-hours entries, newest period first. */
  readonly extended: ReadonlyMap<string, readonly ExtendedListing[]>;
  /** Memo for `publishedGroups`. */
  readonly groupsByDate: Map<IsoDate, ReadonlySet<string>>;
}

const indexes = new WeakMap<CityData, Index>();

function indexOf(data: CityData): Index {
  const cached = indexes.get(data);
  if (cached) return cached;

  const pharmacies = new Map<string, Pharmacy>();
  for (const pharmacy of data.pharmacies) pharmacies.set(pharmacy.id, pharmacy);

  const duties = new Map<string, Map<IsoDate, DutyListing[]>>();
  for (const date of [...data.duties.keys()].sort()) {
    const day = data.duties.get(date);
    for (const group of day?.groups ?? []) {
      for (const section of group.sections) {
        for (const { pharmacyId } of section.entries) {
          let byDate = duties.get(pharmacyId);
          if (!byDate) duties.set(pharmacyId, (byDate = new Map()));
          let list = byDate.get(date);
          if (!list) byDate.set(date, (list = []));
          list.push({ date, groupId: group.id, section });
        }
      }
    }
  }

  // One entry per pharmacy per period: if a list repeats a pharmacy, the first row wins,
  // and its days never fall through to a later row.
  const extended = new Map<string, ExtendedListing[]>();
  const periods = [...data.extendedHours].sort((a, b) =>
    b.period.from.localeCompare(a.period.from),
  );
  for (const { period, entries } of periods) {
    const seen = new Set<string>();
    for (const entry of entries) {
      if (seen.has(entry.pharmacyId)) continue;
      seen.add(entry.pharmacyId);
      const list = extended.get(entry.pharmacyId) ?? [];
      list.push({ period, entry });
      extended.set(entry.pharmacyId, list);
    }
  }

  const index: Index = { pharmacies, duties, extended, groupsByDate: new Map() };
  indexes.set(data, index);
  return index;
}

// --- Absolute times ----------------------------------------------------------

const instants = new Map<string, number>();

/** `localToInstant` in ms, memoised: a day's few distinct times serve every pharmacy. */
function instant(date: IsoDate, time: string, timeZone: string): number {
  const key = `${timeZone}|${date}|${time}`;
  let found = instants.get(key);
  if (found === undefined) {
    if (instants.size > 50_000) instants.clear();
    found = localToInstant(date, time, timeZone).getTime();
    instants.set(key, found);
  }
  return found;
}

/**
 * The absolute span of a range of local times on `date`, or null if it is not a
 * proper range. Only `to` = 00:00 (midnight at the end of the day) runs into the next
 * day; `from` = `to` is empty and a reversed range (21:00–08:30) is a data error. Bad
 * ranges are dropped, never guessed.
 */
function rangeSpan(
  date: IsoDate,
  range: TimeRange,
  timeZone: string,
): readonly [start: number, end: number] | null {
  const { from, to } = range;
  if (to === '00:00' && from !== '00:00') {
    return [instant(date, from, timeZone), instant(addDays(date, 1), to, timeZone)];
  }
  if (from < to) return [instant(date, from, timeZone), instant(date, to, timeZone)];
  return null;
}

function spansOf(date: IsoDate, ranges: readonly TimeRange[], timeZone: string) {
  const spans: (readonly [number, number])[] = [];
  for (const range of ranges) {
    const span = rangeSpan(date, range, timeZone);
    if (span) spans.push(span);
  }
  return spans;
}

/** `zonedDate` for an instant in ms, memoised: one query asks about the same few instants. */
const dates = new Map<string, IsoDate>();

function dateOf(ms: number, timeZone: string): IsoDate {
  const key = `${timeZone}|${ms}`;
  let found = dates.get(key);
  if (found === undefined) {
    if (dates.size > 1000) dates.clear();
    found = zonedDate(new Date(ms), timeZone);
    dates.set(key, found);
  }
  return found;
}

const regularSpans = new Map<string, readonly (readonly [number, number])[]>();

/** The regular hours of a date as absolute spans (holidays are the caller's business). */
function regularOn(cityId: string, date: IsoDate, timeZone: string) {
  const key = `${cityId}|${timeZone}|${date}`;
  let found = regularSpans.get(key);
  if (!found) {
    if (regularSpans.size > 5000) regularSpans.clear();
    found = spansOf(date, regularRanges(cityId, date), timeZone);
    regularSpans.set(key, found);
  }
  return found;
}

// --- Raw intervals -----------------------------------------------------------

interface Raw {
  readonly start: number;
  readonly end: number;
  readonly reason: OpenReason;
}

const REGULAR: OpenReason = { kind: 'regular' };
const EXTENDED: OpenReason = { kind: 'extended' };

/** The extended-hours ranges that replace the regular ones on `date`, or null if none do. */
function extendedRanges(
  index: Index,
  pharmacyId: string,
  date: IsoDate,
  holiday: boolean,
): readonly TimeRange[] | null {
  for (const { period, entry } of index.extended.get(pharmacyId) ?? []) {
    if (date < period.from || date > period.to) continue;
    const { schedule } = entry;
    if (schedule.type === 'dates') {
      // A dated schedule is explicit about the day, so it applies on holidays too.
      const ranges = schedule.dates[date];
      if (ranges) return ranges;
    } else if (!holiday) {
      const ranges = schedule.days[String(isoWeekday(date))];
      if (ranges) return ranges;
    }
  }
  return null;
}

/** Everything that starts on local date `date`: its day hours, and the duties listed for it. */
function rawForDate(data: CityData, index: Index, pharmacy: Pharmacy, date: IsoDate, out: Raw[]) {
  const timeZone = data.city.timeZone;
  const holiday = isHoliday(data, date, pharmacy.groupId);

  const extended = extendedRanges(index, pharmacy.id, date, holiday);
  if (extended) {
    for (const [start, end] of spansOf(date, extended, timeZone)) {
      out.push({ start, end, reason: EXTENDED });
    }
  } else if (!holiday) {
    for (const [start, end] of regularOn(data.city.id, date, timeZone)) {
      out.push({ start, end, reason: REGULAR });
    }
  }

  for (const { groupId, section } of index.duties.get(pharmacy.id)?.get(date) ?? []) {
    const { hours } = section;
    if (hours) {
      const start = instant(date, hours.from, timeZone);
      const end = instant(hours.toNextDay ? addDays(date, 1) : date, hours.to, timeZone);
      out.push({
        start,
        end,
        reason: { kind: 'duty', duty: section.kind, date, groupId, heading: section.heading },
      });
    }
    for (const extra of section.extraHours) {
      if (!extra.weekdays.includes(isoWeekday(date))) continue;
      if (extra.exceptHolidays && isHoliday(data, date, groupId)) continue;
      const span = rangeSpan(date, extra, timeZone);
      if (!span) continue;
      const [start, end] = span;
      out.push({ start, end, reason: { kind: 'duty-extra', duty: section.kind, date, groupId } });
    }
  }
}

function reasonKey(reason: OpenReason): string {
  switch (reason.kind) {
    case 'regular':
    case 'extended':
      return reason.kind;
    case 'duty':
      return `duty|${reason.duty}|${reason.date}|${reason.groupId}|${reason.heading}`;
    case 'duty-extra':
      return `duty-extra|${reason.duty}|${reason.date}|${reason.groupId}`;
  }
}

/** A merged run of open time, clipped to the query window, with the raw openings it is made of. */
interface Run {
  readonly start: number;
  readonly end: number;
  readonly parts: readonly Raw[];
}

/** Sorts, drops empty spans, merges overlapping or touching ones, and clips to [from, to). */
function mergeRuns(raw: Raw[], from: number, to: number): Run[] {
  raw.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: { start: number; end: number; parts: Raw[] }[] = [];
  for (const part of raw) {
    if (part.end <= part.start) continue;
    const last = merged.at(-1);
    if (last && part.start <= last.end) {
      last.end = Math.max(last.end, part.end);
      last.parts.push(part);
    } else {
      merged.push({ start: part.start, end: part.end, parts: [part] });
    }
  }
  const out: Run[] = [];
  for (const m of merged) {
    const start = Math.max(m.start, from);
    const end = Math.min(m.end, to);
    if (end > start) out.push({ start, end, parts: m.parts });
  }
  return out;
}

/** The distinct reasons of some openings, in order of first appearance. */
function reasonsOf(parts: Iterable<Raw>): OpenReason[] {
  const unique = new Map<string, OpenReason>();
  for (const { reason } of parts) unique.set(reasonKey(reason), reason);
  return [...unique.values()];
}

function runsFor(data: CityData, index: Index, pharmacy: Pharmacy, from: Date, to: Date): Run[] {
  if (!(to.getTime() > from.getTime())) return [];
  const timeZone = data.city.timeZone;
  // Start a day early: a duty window listed on the previous date can run past midnight.
  const first = addDays(dateOf(from.getTime(), timeZone), -1);
  const last = dateOf(to.getTime() - 1, timeZone);
  const raw: Raw[] = [];
  for (let date = first; date <= last; date = addDays(date, 1)) {
    rawForDate(data, index, pharmacy, date, raw);
  }
  return mergeRuns(raw, from.getTime(), to.getTime());
}

// --- Public API --------------------------------------------------------------

/** Merged open intervals of a pharmacy, clipped to [from, to). Empty for an unknown pharmacy. */
export function openIntervals(
  data: CityData,
  pharmacyId: string,
  from: Date,
  to: Date,
): OpenInterval[] {
  const index = indexOf(data);
  const pharmacy = index.pharmacies.get(pharmacyId);
  if (!pharmacy) return [];
  return runsFor(data, index, pharmacy, from, to).map((run) => ({
    start: new Date(run.start),
    end: new Date(run.end),
    reasons: reasonsOf(run.parts),
  }));
}

interface Computed {
  readonly status: PharmacyStatus;
  /** False only when the caller skipped the look-ahead for a closed pharmacy. */
  readonly complete: boolean;
}

/** Look-ahead windows, in days: most answers fit in the first, so the rest are rarely computed. */
const WINDOWS_DAYS = [1, 3, HORIZON_DAYS];

/**
 * The first merged run ending after `at`, looking ahead in growing windows until
 * that run is not cut off by the window's end.
 */
function firstRun(data: CityData, index: Index, pharmacy: Pharmacy, at: Date): Run | undefined {
  let first: Run | undefined;
  for (const days of WINDOWS_DAYS) {
    const end = at.getTime() + days * DAY_MS;
    first = runsFor(data, index, pharmacy, at, new Date(end))[0];
    if (first && first.end < end) break;
  }
  return first;
}

let lastParts: { at: number; timeZone: string; parts: ReturnType<typeof zonedParts> } | undefined;

function partsOf(at: Date, timeZone: string) {
  if (lastParts?.at !== at.getTime() || lastParts.timeZone !== timeZone) {
    lastParts = { at: at.getTime(), timeZone, parts: zonedParts(at, timeZone) };
  }
  return lastParts.parts;
}

function computeStatus(
  data: CityData,
  index: Index,
  pharmacy: Pharmacy,
  at: Date,
  lookAheadWhenClosed: boolean,
): Computed {
  const t = at.getTime();

  // Cheap test first: is the pharmacy open at this very instant?
  const openNow = runsFor(data, index, pharmacy, at, new Date(t + 1)).length > 0;
  const needsLookAhead = openNow || lookAheadWhenClosed;
  const next = needsLookAhead ? firstRun(data, index, pharmacy, at) : undefined;

  if (openNow && next) {
    return {
      complete: true,
      status: {
        state: 'open',
        until: new Date(next.end),
        reasons: reasonsOf(next.parts.filter((p) => p.start <= t && t < p.end)),
        runReasons: reasonsOf(next.parts),
        closingSoon: next.end - t <= CLOSING_SOON_MS,
      },
    };
  }

  // Listed as on duty for the duty day containing `at` (08:00 to 08:00), but with no hours.
  const listings = index.duties.get(pharmacy.id);
  if (listings) {
    const { dutyDate } = dutyDayOf(data, at);
    const unknown = listings.get(dutyDate)?.find((listing) => listing.section.hours === null);
    if (unknown) {
      return {
        complete: needsLookAhead,
        status: {
          state: 'duty-hours-unknown',
          duty: {
            date: unknown.date,
            duty: unknown.section.kind,
            groupId: unknown.groupId,
            heading: unknown.section.heading,
          },
          nextOpen: next ? new Date(next.start) : null,
        },
      };
    }
  }

  return {
    complete: needsLookAhead,
    status: {
      state: 'closed',
      nextOpen: next ? new Date(next.start) : null,
      nextReasons: next ? reasonsOf(next.parts.filter((p) => p.start === next.start)) : [],
      nextRunReasons: next ? reasonsOf(next.parts) : [],
    },
  };
}

/** The date of the duty day (08:00 to 08:00) that contains `at`. */
function dutyDayOf(data: CityData, at: Date): { today: IsoDate; dutyDate: IsoDate } {
  const now = partsOf(at, data.city.timeZone);
  return {
    today: now.date,
    dutyDate: now.minutes < DUTY_DAY_START_MINUTES ? addDays(now.date, -1) : now.date,
  };
}

function groupsOn(index: Index, data: CityData, date: IsoDate): ReadonlySet<string> {
  let found = index.groupsByDate.get(date);
  if (!found) {
    found = new Set((data.duties.get(date)?.groups ?? []).map((group) => group.id));
    index.groupsByDate.set(date, found);
  }
  return found;
}

/**
 * The ids of the area groups whose duty list is published for `date`. Empty when the
 * date has no file; a file can hold only some groups (each group has its own PDF).
 */
export function publishedGroups(data: CityData, date: IsoDate): ReadonlySet<string> {
  return groupsOn(indexOf(data), data, date);
}

/**
 * Is every duty list the answer depends on published for the pharmacy's group?
 * A null `groupId` means the default group; an unknown pharmacy (`undefined`) needs
 * only the date's file.
 */
function published(
  data: CityData,
  index: Index,
  groupId: string | null | undefined,
  at: Date,
  status: PharmacyStatus,
): boolean {
  const { today, dutyDate } = dutyDayOf(data, at);
  const nextOpen = status.state === 'open' ? null : status.nextOpen;
  const last =
    nextOpen && zonedDate(nextOpen, data.city.timeZone) > today
      ? zonedDate(nextOpen, data.city.timeZone)
      : today;
  const group = groupId === undefined ? undefined : (groupId ?? DEFAULT_GROUP_ID);
  for (let date = dutyDate; date <= last; date = addDays(date, 1)) {
    if (group === undefined ? !data.duties.has(date) : !groupsOn(index, data, date).has(group)) {
      return false;
    }
  }
  return true;
}

export function pharmacyStatus(data: CityData, pharmacyId: string, at: Date): StatusDetails {
  const index = indexOf(data);
  const pharmacy = index.pharmacies.get(pharmacyId);
  const status: PharmacyStatus = pharmacy
    ? computeStatus(data, index, pharmacy, at, true).status
    : { state: 'closed', nextOpen: null, nextReasons: [], nextRunReasons: [] };
  return {
    found: pharmacy !== undefined,
    status,
    dutiesPublished: published(data, index, pharmacy?.groupId, at, status),
  };
}

/** What published data exists around `at`, for warning that a list is missing. */
export interface Coverage {
  /**
   * The duty list for the duty day containing `at` (yesterday's before 08:00) is published.
   * With `options.groupId`, true only if that group's list is in the day's file (null is
   * the default group); without it, true if the day has a file at all.
   */
  readonly duties: boolean;
  /** That duty day's date. */
  readonly dutyDate: IsoDate;
  /** The first and last published duty dates, or null when there are none. */
  readonly dutiesFrom: IsoDate | null;
  readonly dutiesTo: IsoDate | null;
  /** Some extended-hours list covers today's local date. */
  readonly extendedHours: boolean;
  /**
   * Area groups for the duty day `dutyDate`, sorted. `published` are the groups in that day's
   * file; `missing` are the known groups that are not (all of them when the file is missing).
   * Known groups are those seen in any loaded duty day plus the non-null `groupId`s of
   * `data.pharmacies`.
   */
  readonly groups: {
    readonly published: string[];
    readonly missing: string[];
  };
}

export function coverage(
  data: CityData,
  at: Date,
  options?: { readonly groupId?: string | null },
): Coverage {
  const index = indexOf(data);
  const { today, dutyDate } = dutyDayOf(data, at);
  const dates = [...data.duties.keys()].sort();
  const present = groupsOn(index, data, dutyDate);

  const known = new Set<string>();
  for (const day of data.duties.values()) for (const group of day.groups) known.add(group.id);
  for (const { groupId } of data.pharmacies) if (groupId !== null) known.add(groupId);

  const groupId = options?.groupId;
  return {
    duties:
      groupId === undefined ? data.duties.has(dutyDate) : present.has(groupId ?? DEFAULT_GROUP_ID),
    dutyDate,
    dutiesFrom: dates[0] ?? null,
    dutiesTo: dates.at(-1) ?? null,
    extendedHours: data.extendedHours.some(
      (list) => list.period.from <= today && today <= list.period.to,
    ),
    groups: {
      published: [...present].sort(),
      missing: [...known].filter((id) => !present.has(id)).sort(),
    },
  };
}

const EARTH_RADIUS_METRES = 6_371_008.8;

/** Great-circle (haversine) distance in metres. */
export function distanceMetres(
  a: { readonly lat: number; readonly lon: number },
  b: { readonly lat: number; readonly lon: number },
): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(h)));
}

const greek = new Intl.Collator('el');

/** `published` memoised per (group, last date): most pharmacies share a few such pairs. */
function memoPublished(
  memo: Map<string, boolean>,
  data: CityData,
  index: Index,
  pharmacy: Pharmacy,
  at: Date,
  status: PharmacyStatus,
): boolean {
  const nextOpen = status.state === 'open' ? null : status.nextOpen;
  const key = `${pharmacy.groupId ?? DEFAULT_GROUP_ID}|${nextOpen ? zonedDate(nextOpen, data.city.timeZone) : ''}`;
  let found = memo.get(key);
  if (found === undefined) {
    found = published(data, index, pharmacy.groupId, at, status);
    memo.set(key, found);
  }
  return found;
}

/**
 * Pharmacies that are open, or on duty with no hours stated, at `at`. Nearest
 * first with an origin (pharmacies without a location last), otherwise by
 * name; ties break by name.
 */
export function openPharmacies(
  data: CityData,
  at: Date,
  options?: { readonly origin?: { readonly lat: number; readonly lon: number } },
): NearbyPharmacy[] {
  const index = indexOf(data);
  const origin = options?.origin;
  const result: NearbyPharmacy[] = [];
  // Per (group, day of nextOpen) memo of `dutiesPublished`.
  const publishedMemo = new Map<string, boolean>();
  for (const pharmacy of data.pharmacies) {
    const { status, complete } = computeStatus(data, index, pharmacy, at, false);
    if (status.state === 'closed') continue;
    // A duty-hours-unknown pharmacy reaches here without a look-ahead when it is not open.
    const finished = complete ? status : computeStatus(data, index, pharmacy, at, true).status;
    const distance = origin && pharmacy.location ? distanceMetres(origin, pharmacy.location) : null;
    const dutiesPublished = memoPublished(publishedMemo, data, index, pharmacy, at, finished);
    result.push({ pharmacy, status: finished, distance, dutiesPublished });
  }
  return result.sort((a, b) => {
    if (origin && a.distance !== b.distance) {
      if (a.distance === null) return 1;
      if (b.distance === null) return -1;
      return a.distance - b.distance;
    }
    return greek.compare(a.pharmacy.name, b.pharmacy.name);
  });
}

/** Every published duty section listing the pharmacy on or after `fromDate`, in date order. */
export function publishedDuties(
  data: CityData,
  pharmacyId: string,
  fromDate: IsoDate,
): PublishedDuty[] {
  const out: PublishedDuty[] = [];
  for (const [date, listings] of indexOf(data).duties.get(pharmacyId) ?? []) {
    if (date < fromDate) continue;
    for (const { groupId, section } of listings) {
      out.push({
        date,
        groupId,
        duty: section.kind,
        heading: section.heading,
        hours: section.hours,
      });
    }
  }
  return out;
}
