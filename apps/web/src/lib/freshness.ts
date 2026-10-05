import type { Locale } from '@pharmacy-skg/core';
import { THESSALONIKI } from '@pharmacy-skg/core';
import { STALE_AFTER_HOURS } from '../config.ts';

const HOUR_MS = 3_600_000;

/**
 * True when the data is older than the threshold, or when its timestamp is unusable (we would
 * rather warn than silently show data of unknown age). public/stale-check.js repeats this rule
 * for the first paint; a test keeps the two in step.
 */
export function isStale(
  updatedAt: string | null | undefined,
  now: Date,
  thresholdHours: number = STALE_AFTER_HOURS,
): boolean {
  if (updatedAt === null || updatedAt === undefined) return true;
  const updated = Date.parse(updatedAt);
  if (Number.isNaN(updated)) return true;
  return now.getTime() - updated > thresholdHours * HOUR_MS;
}

/** "5 Oct 2026, 02:04" in the city's time zone, whatever the device's. */
export function formatUpdatedAt(
  updatedAt: string,
  locale: Locale,
  timeZone: string = THESSALONIKI.timeZone,
): string {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return updatedAt;
  return new Intl.DateTimeFormat(locale === 'el' ? 'el-GR' : 'en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}
