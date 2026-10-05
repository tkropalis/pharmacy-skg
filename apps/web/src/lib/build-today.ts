import type { IsoDate } from '@pharmacy-skg/core';
import { localIsoDate } from './dates.ts';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "Today" for build-time code: the pages and the data window the build publishes. It is the
 * calendar date in the city's time zone, unless `PHARMACY_TODAY=YYYY-MM-DD` is set. The
 * browser tests build with that variable so they do not depend on the real date and on which
 * duty lists happen to exist. Build-time only: never import this in code that runs in the page.
 */
export function buildToday(
  now: Date = new Date(),
  env: Readonly<Record<string, string | undefined>> = process.env,
): IsoDate {
  const override = env['PHARMACY_TODAY'];
  if (override === undefined || override === '') return localIsoDate(now);
  if (!ISO_DATE.test(override) || Number.isNaN(Date.parse(`${override}T00:00:00Z`))) {
    throw new Error(`PHARMACY_TODAY must be a calendar date like 2026-10-05, got "${override}"`);
  }
  return override;
}
