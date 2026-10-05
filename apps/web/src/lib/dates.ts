import type { IsoDate } from '@pharmacy-skg/core';
import { THESSALONIKI } from '@pharmacy-skg/core';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** The calendar date of an instant in a time zone (the city's, never the device's). */
export function localIsoDate(at: Date, timeZone: string = THESSALONIKI.timeZone): IsoDate {
  const parts = formatterFor(timeZone).formatToParts(at);
  const pick = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

/** Calendar arithmetic on an ISO date. No time zone is involved. */
export function addDays(date: IsoDate, days: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) {
    throw new Error(`Not an ISO date: ${date}`);
  }
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** `count` consecutive dates starting at `start`. */
export function dateRange(start: IsoDate, count: number): IsoDate[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

/** Today and the next three days in the city's time zone: the window kept for offline use. */
export function offlineDates(now: Date, timeZone: string = THESSALONIKI.timeZone): IsoDate[] {
  return dateRange(localIsoDate(now, timeZone), 4);
}
