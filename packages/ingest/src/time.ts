import { THESSALONIKI } from '@pharmacy-skg/core';

/** Today's date (YYYY-MM-DD) in the city's time zone, never the machine's. */
export function cityToday(now = new Date(), timeZone = THESSALONIKI.timeZone): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
}

/** Adds days to an ISO date. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Is `from`–`to` a proper range of local times (HH:MM)? It must end after it starts, or
 * end at 00:00 (midnight at the end of the day). An empty range (14:00–14:00) or a
 * reversed one (21:00–08:30) is a data error.
 */
export function isProperRange(from: string, to: string): boolean {
  return to === '00:00' ? from !== '00:00' : from < to;
}
