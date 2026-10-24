import type { Meta } from '@pharmacy-skg/core';
import { addDays } from '../src/lib/dates.ts';

/** How many days of past duty lists the build keeps (the app can look a week back). */
export const KEEP_PAST_DAYS = 7;

const DUTY_FILE = /^(\d{4}-\d{2}-\d{2})\.json$/;
const EXTENDED_FILE = /^extended-hours\/[A-Za-z0-9_.-]+\.json$/;

/** The duty files to publish: dates from `today - 7 days` onward, in name order. */
export function selectDutyFiles(
  names: readonly string[],
  today: string,
  keepPastDays: number = KEEP_PAST_DAYS,
): string[] {
  const earliest = addDays(today, -keepPastDays);
  return names
    .filter((name) => {
      const date = DUTY_FILE.exec(name)?.[1];
      return date !== undefined && date >= earliest;
    })
    .sort();
}

/** An extended-hours path as meta.json lists it, only if it is a plain file under that folder. */
export function isExtendedHoursPath(path: string): boolean {
  return EXTENDED_FILE.test(path) && !path.includes('..');
}

/**
 * Whether a path relative to data/<city>/ is a published file. Keeps inputs/, overrides.json and
 * anything else the pipeline uses internally out of the site (dev server and build alike).
 */
export function isPublishedPath(path: string): boolean {
  if (path === 'meta.json' || path === 'pharmacies.json') return true;
  if (path.startsWith('duties/')) return DUTY_FILE.test(path.slice('duties/'.length));
  return isExtendedHoursPath(path);
}

/**
 * meta.json as the site publishes it: with the dates of the duty files it publishes, so the app
 * and the service worker ask only for those, never for a gap the source left inside the range.
 */
export function withPublishedDates(meta: Meta, dutyFiles: readonly string[]): Meta {
  if (meta.duties === null) return meta;
  const { from, to } = meta.duties;
  const dates = dutyFiles
    .map((name) => DUTY_FILE.exec(name)?.[1])
    .filter((date): date is string => date !== undefined && date >= from && date <= to)
    .sort();
  return { ...meta, duties: { from, to, dates } };
}
