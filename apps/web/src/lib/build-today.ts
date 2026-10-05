import type { IsoDate } from '@pharmacy-skg/core';
import { localIsoDate } from './dates.ts';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const warned = new Set<string>();

/** The build asks for today several times; say it once. */
function warnOnce(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`[warn] ${message}`);
}

/**
 * "Today" for build-time code: the pages and the data window the build publishes. It is the
 * calendar date in the city's time zone, unless `PHARMACY_TODAY=YYYY-MM-DD` is set. The
 * browser tests build with that variable so they do not depend on the real date and on which
 * duty lists happen to exist. Build-time only: never import this in code that runs in the page.
 *
 * The override freezes the published data in the past, so it warns whenever it is set and is
 * refused outright in a Vercel production build (`VERCEL_ENV=production`).
 */
export function buildToday(
  now: Date = new Date(),
  env: Readonly<Record<string, string | undefined>> = process.env,
  warn: (message: string) => void = warnOnce,
): IsoDate {
  const override = env['PHARMACY_TODAY'];
  if (override === undefined || override === '') return localIsoDate(now);
  if (env['VERCEL_ENV'] === 'production') {
    throw new Error(
      `PHARMACY_TODAY ("${override}") is set in a production build: it would freeze the published data in the past. Unset it.`,
    );
  }
  if (!ISO_DATE.test(override) || Number.isNaN(Date.parse(`${override}T00:00:00Z`))) {
    throw new Error(`PHARMACY_TODAY must be a calendar date like 2026-10-05, got "${override}"`);
  }
  warn(
    `PHARMACY_TODAY is set: building as if today were ${override}. Never use this in production.`,
  );
  return override;
}
