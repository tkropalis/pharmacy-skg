/**
 * Time-zone arithmetic with Intl only. Nothing here reads the device's zone:
 * every function takes the IANA zone explicitly.
 */
import type { IsoDate, LocalTime } from './data.ts';

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface ZonedParts {
  readonly date: IsoDate;
  /** Whole minutes since local midnight. */
  readonly minutes: number;
  readonly weekday: IsoWeekday;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let found = formatters.get(timeZone);
  if (!found) {
    found = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, found);
  }
  return found;
}

interface Fields {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

function fieldsAt(at: Date, timeZone: string): Fields {
  const out = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
  for (const part of formatter(timeZone).formatToParts(at)) {
    if (part.type in out) out[part.type as keyof Fields] = Number(part.value);
  }
  return out;
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

function isoOf(year: number, month: number, day: number): IsoDate {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** Parses YYYY-MM-DD into UTC midnight, rejecting impossible dates. */
function utcMidnight(date: IsoDate): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new RangeError(`Not an ISO date: "${date}"`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const ms = Date.UTC(year, month - 1, day);
  if (isoOf(...utcFields(ms)) !== date) throw new RangeError(`Not a calendar date: "${date}"`);
  return ms;
}

function utcFields(ms: number): [number, number, number] {
  const d = new Date(ms);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return isoOf(...utcFields(utcMidnight(date) + days * 86_400_000));
}

export function isoWeekday(date: IsoDate): IsoWeekday {
  const day = new Date(utcMidnight(date)).getUTCDay();
  return (day === 0 ? 7 : day) as IsoWeekday;
}

/** The calendar date in `timeZone` at the instant `at`. */
export function zonedDate(at: Date, timeZone: string): IsoDate {
  const { year, month, day } = fieldsAt(at, timeZone);
  return isoOf(year, month, day);
}

export function zonedParts(at: Date, timeZone: string): ZonedParts {
  const { year, month, day, hour, minute } = fieldsAt(at, timeZone);
  const date = isoOf(year, month, day);
  return { date, minutes: hour * 60 + minute, weekday: isoWeekday(date) };
}

/** Offset of `timeZone` from UTC at `ms`, in milliseconds (local minus UTC), at whole seconds. */
function offsetAt(ms: number, timeZone: string): number {
  const whole = Math.floor(ms / 1000) * 1000;
  const f = fieldsAt(new Date(whole), timeZone);
  return Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second) - whole;
}

const DAY = 86_400_000;

/**
 * The instant at which the wall clock in `timeZone` reads `date` `time`.
 *
 * - A time skipped by a spring-forward gap maps to the first instant after the gap.
 * - A time repeated by a fall-back overlap maps to the earlier of the two instants.
 *
 * "24:00" is not accepted; callers add a day instead.
 */
export function localToInstant(date: IsoDate, time: LocalTime, timeZone: string): Date {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  const hours = Number(match?.[1]);
  const minutes = Number(match?.[2]);
  if (!match || hours > 23 || minutes > 59) throw new RangeError(`Not a time: "${time}"`);

  // Read the wall clock as if it were UTC, then correct by the zone's offset.
  const wall = utcMidnight(date) + (hours * 60 + minutes) * 60_000;
  const before = offsetAt(wall - DAY, timeZone);
  const after = offsetAt(wall + DAY, timeZone);

  const valid: number[] = [];
  for (const offset of new Set([before, after])) {
    const candidate = wall - offset;
    if (offsetAt(candidate, timeZone) === offset) valid.push(candidate);
  }
  if (valid.length > 0) return new Date(Math.min(...valid));

  // A gap: the wall time never occurred. Find the first second that has the later offset.
  let low = wall - Math.max(before, after); // surely before the transition
  let high = wall - Math.min(before, after); // surely after it
  const early = offsetAt(low, timeZone);
  while (high - low > 1000) {
    const mid = Math.floor((low + high) / 2000) * 1000;
    if (offsetAt(mid, timeZone) === early) low = mid;
    else high = mid;
  }
  return new Date(high);
}
