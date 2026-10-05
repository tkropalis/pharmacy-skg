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
