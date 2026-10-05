import type { Locale, OpenReason, PharmacyStatus } from '@pharmacy-skg/core';
import { THESSALONIKI, zonedDate } from '@pharmacy-skg/core';
import type { Dictionary } from '../../i18n/index.ts';
import { addDays } from '../dates.ts';
import { fill } from './format.ts';

/** The dictionary parts the status text needs (a whole Dictionary fits). */
export interface StatusDictionary {
  readonly status: Dictionary['status'];
  readonly seo: { readonly status: Dictionary['seo']['status'] };
}

const INTL_LOCALE: Record<Locale, string> = { el: 'el-GR', en: 'en-GB' };

export type StatusTone = 'open' | 'duty-unknown' | 'closed';

export interface StatusText {
  readonly tone: StatusTone;
  /** The headline, also the label for a list row: "Εφημερεύει (λίστα ΦΣΘ) · μέχρι τις 23:00". */
  readonly short: string;
  /** What follows the headline: notes, the next opening and the "call before you go" line. */
  readonly detail: string;
  /** Headline and detail as one paragraph. */
  readonly text: string;
}

/** HH:MM in the city's time zone, whatever the device's. */
export function timeInCity(at: Date, locale: Locale, timeZone = THESSALONIKI.timeZone): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
}

/** "σήμερα στις 17:00", "αύριο στις 08:00" or "Τρίτη στις 08:00". */
export function whenText(
  at: Date,
  now: Date,
  locale: Locale,
  d: Dictionary['seo']['status'],
  timeZone = THESSALONIKI.timeZone,
): string {
  const time = timeInCity(at, locale, timeZone);
  const day = zonedDate(at, timeZone);
  const today = zonedDate(now, timeZone);
  if (day === today) return fill(d.whenToday, { time });
  if (day === addDays(today, 1)) return fill(d.whenTomorrow, { time });
  const weekday = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone,
    weekday: 'long',
  }).format(at);
  return fill(d.whenWeekday, { weekday, time });
}

/** The label of why a pharmacy is open: a duty listing wins over extended, then regular hours. */
export function openLabel(reasons: readonly OpenReason[], d: StatusDictionary): string {
  if (reasons.some((r) => r.kind === 'duty' || r.kind === 'duty-extra')) return d.status.onDuty;
  if (reasons.some((r) => r.kind === 'extended')) return d.seo.status.openExtended;
  return d.status.openRegular;
}

/**
 * The status in words. `dutiesPublished` false adds the note that the answer may change once
 * the day's list is out. Statuses are never conveyed by colour alone: the text always says it.
 */
export function describeStatus(
  status: PharmacyStatus,
  dutiesPublished: boolean,
  now: Date,
  locale: Locale,
  d: StatusDictionary,
  timeZone = THESSALONIKI.timeZone,
): StatusText {
  const s = d.seo.status;
  const tail = [dutiesPublished ? '' : s.unpublished, s.callFirst].filter(Boolean).join(' ');

  const make = (tone: StatusTone, short: string, detail: string): StatusText => ({
    tone,
    short,
    detail,
    text: `${short}${/[.!]$/.test(short) ? '' : '.'} ${detail}`,
  });

  if (status.state === 'open') {
    const label = fill(s.openUntil, {
      label: openLabel(status.reasons, d),
      time: timeInCity(status.until, locale, timeZone),
    });
    return make('open', status.closingSoon ? `${label} (${s.closingSoon})` : label, tail);
  }

  if (status.state === 'duty-hours-unknown') {
    return make('duty-unknown', d.status.onDuty, `${s.dutyHoursUnknown} ${tail}`);
  }

  const next =
    status.nextOpen === null
      ? s.noNextOpen
      : fill(s.opensAt, { when: whenText(status.nextOpen, now, locale, s, timeZone) });
  return make('closed', s.closed, `${next} ${tail}`);
}
