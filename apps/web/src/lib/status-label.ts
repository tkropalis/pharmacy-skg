import { GREECE_TIME_ZONE } from '@pharmacy-skg/core';
import type { Locale, OpenReason, PharmacyStatus } from '@pharmacy-skg/core';
import type { Dictionary } from '../i18n/index.ts';
import { fill } from './format.ts';
import { isMidnightAfter, whenOf } from './when.ts';
import { pinKindOf } from './list.ts';
import type { PinKind } from './list.ts';

export type StatusText = Dictionary['app']['status'];

export interface StatusView {
  readonly kind: PinKind;
  /**
   * The status as one plain sentence, for the row details: "Ανοιχτό έως 21:00",
   * "Εφημερεύει όλη τη νύχτα, έως αύριο 08:00". Never colour alone (decisions, Defaults).
   */
  readonly label: string;
  readonly closingSoon: boolean;
  /** For the list: a word or two ("Εφημερεύει", "Ανοιχτό") and the time ("έως 14:30"). */
  readonly short: { readonly label: string; readonly timing: string | null };
}

/** "1 ώρα 20 λεπτά", "2 ώρες", "1 λεπτό" / "1 h 20 min", "45 min". */
export function formatDuration(minutes: number, text: StatusText): string {
  const total = Math.max(1, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  const mins = `${rest} ${rest === 1 ? text.minuteOne : text.minuteMany}`;
  if (hours === 0) return mins;
  const hourWord = hours === 1 ? text.hourOne : text.hourMany;
  const head = `${hours} ${hourWord}`;
  return rest === 0 ? head : `${head} ${mins}`;
}

/**
 * "21:00" on the same day, "αύριο 08:00" the next, then "Τετάρτη 08:00"; a week or more away
 * the date is added so the weekday cannot be mistaken for this week's.
 */
export function dayAndTime(
  target: Date,
  at: Date,
  locale: Locale,
  text: StatusText,
  timeZone: string = GREECE_TIME_ZONE,
  sameDayShowsWord = false,
): string {
  const when = whenOf(target, at, locale, timeZone);
  switch (when.kind) {
    case 'today':
      return sameDayShowsWord ? `${text.today} ${when.time}` : when.time;
    case 'tomorrow':
      return `${text.tomorrow} ${when.time}`;
    case 'weekday':
      return `${when.weekday} ${when.time}`;
    case 'date':
      return `${when.date} ${when.time}`;
  }
}

/** On an all-night duty right now: the list says it runs past midnight to the morning. */
function allNight(reasons: readonly OpenReason[]): boolean {
  return reasons.some(
    (reason) =>
      (reason.kind === 'duty' || reason.kind === 'duty-extra') && reason.duty === 'after-midnight',
  );
}

export function describeStatus(options: {
  readonly status: PharmacyStatus;
  readonly at: Date;
  /** "now" counts down the last minutes; a chosen time always shows "until". */
  readonly live: boolean;
  readonly locale: Locale;
  readonly text: StatusText;
  readonly timeZone?: string;
  /**
   * The city's regular hours are not known (decision D26): a pharmacy off the duty list is
   * "not on duty", never "closed", and its next opening is its next duty.
   */
  readonly dutyOnly?: boolean;
}): StatusView {
  const { status, at, live, locale, text } = options;
  const timeZone = options.timeZone ?? GREECE_TIME_ZONE;
  const kind = pinKindOf(status);

  switch (status.state) {
    case 'open': {
      const extended = status.reasons.some((reason) => reason.kind === 'extended');
      const word = kind === 'duty' ? text.onDuty : extended ? text.openExtended : text.openRegular;
      const label =
        kind === 'duty' && allNight(status.reasons) ? fill(text.allNight, { label: word }) : word;
      const minutes = Math.ceil((status.until.getTime() - at.getTime()) / 60_000);
      // "έως τα μεσάνυχτα" rather than "έως αύριο 00:00".
      const when = isMidnightAfter(status.until, at, timeZone)
        ? text.midnight
        : dayAndTime(status.until, at, locale, text, timeZone);
      // A countdown only when it matters: in the last minutes before closing.
      const countdown = live && status.closingSoon;
      const duration = formatDuration(minutes, text);
      return {
        kind,
        label: countdown
          ? fill(text.closesIn, { label, duration, when })
          : fill(text.openUntil, { label, when }),
        closingSoon: status.closingSoon,
        short: {
          label: text.short[kind],
          timing: countdown
            ? fill(text.short.closesIn, { duration })
            : fill(text.short.until, { when }),
        },
      };
    }
    case 'duty-hours-unknown':
      return {
        kind,
        label: status.duty.onCall ? text.onCall : text.dutyUnknown,
        closingSoon: false,
        short: {
          label: text.short[kind],
          timing: status.duty.onCall ? text.short.onCall : text.short.callFirst,
        },
      };
    case 'closed': {
      const dutyOnly = options.dutyOnly === true;
      const timing =
        status.nextOpen === null
          ? dutyOnly
            ? text.dutyNotAnnounced
            : text.opensUnknown
          : fill(dutyOnly ? text.nextDuty : text.opensAt, {
              when: dayAndTime(status.nextOpen, at, locale, text, timeZone, true),
            });
      const word = dutyOnly ? text.notOnDuty : text.closed;
      return {
        kind,
        label: `${word}, ${timing}`,
        closingSoon: false,
        short: { label: dutyOnly ? text.notOnDuty : text.short[kind], timing },
      };
    }
  }
}
