import type { IsoDate } from '@pharmacy-skg/core';
import { THESSALONIKI, addDays } from '@pharmacy-skg/core';

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

// Calendar arithmetic on an ISO date is the core's (no time zone is involved).
export { addDays };

/** `count` consecutive dates starting at `start`. */
export function dateRange(start: IsoDate, count: number): IsoDate[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}
