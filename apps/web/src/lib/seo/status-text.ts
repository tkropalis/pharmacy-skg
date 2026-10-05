import type { Locale, OpenReason, PharmacyStatus } from '@pharmacy-skg/core';
import { THESSALONIKI } from '@pharmacy-skg/core';
import type { Dictionary } from '../../i18n/index.ts';
import { fill } from './format.ts';
import { whenOf } from '../when.ts';

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

/**
 * "σήμερα στις 17:00", "αύριο στις 08:00", "Τρίτη στις 08:00" or, a week or more away, the date.
 * The same decision as the home screen's (lib/when.ts).
 */
export function whenText(
  at: Date,
  now: Date,
  locale: Locale,
  d: Dictionary['seo']['status'],
  timeZone = THESSALONIKI.timeZone,
): string {
  const when = whenOf(at, now, locale, timeZone);
  switch (when.kind) {
    case 'today':
      return fill(d.whenToday, { time: when.time });
    case 'tomorrow':
      return fill(d.whenTomorrow, { time: when.time });
    case 'weekday':
      return fill(d.whenWeekday, { weekday: when.weekday, time: when.time });
    case 'date':
      return fill(d.whenDate, { date: when.date, time: when.time });
  }
}

/** "τις 23:00" the same day; otherwise the day is named: "αύριο στις 08:00". */
export function untilText(
  until: Date,
  now: Date,
  locale: Locale,
  d: Dictionary['seo']['status'],
  timeZone = THESSALONIKI.timeZone,
): string {
  const when = whenOf(until, now, locale, timeZone);
  return when.kind === 'today'
    ? fill(d.untilToday, { time: when.time })
    : whenText(until, now, locale, d, timeZone);
}

/** The label of why a pharmacy is open: a duty listing wins over extended, then regular hours. */
export function openLabel(reasons: readonly OpenReason[], d: StatusDictionary): string {
  if (reasons.some((r) => r.kind === 'duty' || r.kind === 'duty-extra')) return d.status.onDuty;
  if (reasons.some((r) => r.kind === 'extended')) return d.status.openExtended;
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
      when: untilText(status.until, now, locale, s, timeZone),
    });
    return make('open', status.closingSoon ? `${label} (${s.closingSoon})` : label, tail);
  }

  if (status.state === 'duty-hours-unknown') {
    // The same words as the home screen's label, whose last words are "call first".
    return make('duty-unknown', d.status.dutyUnknown, tail);
  }

  const next =
    status.nextOpen === null
      ? s.noNextOpen
      : fill(s.opensAt, { when: whenText(status.nextOpen, now, locale, s, timeZone) });
  return make('closed', s.closed, `${next} ${tail}`);
}
