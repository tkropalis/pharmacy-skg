import { addDays, localToInstant } from '@pharmacy-skg/core';
import type { PublishedDuty } from '@pharmacy-skg/core';
import type { Locale } from '@pharmacy-skg/core';
import { shortIsoDate } from './format.ts';
import type { Dictionary } from '../i18n/index.ts';

/** The instant a published duty window ends; the end of its date when no hours are printed. */
export function dutyEnd(duty: PublishedDuty, timeZone: string): Date {
  const { hours } = duty;
  if (hours === null) return localToInstant(addDays(duty.date, 1), '08:00', timeZone);
  return localToInstant(hours.toNextDay ? addDays(duty.date, 1) : duty.date, hours.to, timeZone);
}

/**
 * Published duties that have not ended at `now`. Only what was officially published is ever
 * passed in (decision D11): nothing is predicted here.
 */
export function upcomingDuties(
  duties: readonly PublishedDuty[],
  now: Date,
  timeZone: string,
): PublishedDuty[] {
  return duties.filter((duty) => dutyEnd(duty, timeZone).getTime() > now.getTime());
}

/** "Wed 7 Oct · overnight duty · 22:00–08:00" */
export function describeDuty(duty: PublishedDuty, locale: Locale, text: Dictionary['app']): string {
  const parts = [shortIsoDate(duty.date, locale), text.status.kinds[duty.duty]];
  parts.push(
    duty.hours === null ? text.favourites.hoursNotStated : `${duty.hours.from}–${duty.hours.to}`,
  );
  return parts.join(' · ');
}
