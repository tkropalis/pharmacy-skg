import { THESSALONIKI, addDays, zonedDate } from '@pharmacy-skg/core';
import type { DutyKind, Locale, OpenReason, PharmacyStatus } from '@pharmacy-skg/core';
import type { Dictionary } from '../i18n/index.ts';
import { fill, formatClock, shortDate, weekdayName } from './format.ts';
import { pinKindOf } from './list.ts';
import type { PinKind } from './list.ts';

export type StatusText = Dictionary['app']['status'];

export interface StatusView {
  readonly kind: PinKind;
  /** The status in words; the decisions' labels (D4, Defaults). Never colour alone. */
  readonly label: string;
  /** The duty kinds in words ("διανυκτερεύον"), when on duty. */
  readonly dutyKinds: string | null;
  /** Countdown, "open until" or "opens …", whichever applies. */
  readonly timing: string | null;
  readonly closingSoon: boolean;
}

/** "1 ώρα 20′", "2 ώρες", "45′" / "1 h 20 min", "45 min". */
export function formatDuration(minutes: number, text: StatusText): string {
  const total = Math.max(1, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  const mins = `${rest}${text.minuteUnit}`;
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
  timeZone: string = THESSALONIKI.timeZone,
  sameDayShowsWord = false,
): string {
  const clock = formatClock(target, timeZone);
  const day = zonedDate(target, timeZone);
  const today = zonedDate(at, timeZone);
  if (day === today) return sameDayShowsWord ? `${text.today} ${clock}` : clock;
  if (day === addDays(today, 1)) return `${text.tomorrow} ${clock}`;
  const diff = Math.round((Date.parse(`${day}T00:00Z`) - Date.parse(`${today}T00:00Z`)) / 86_400_000);
  if (diff >= 7) return `${shortDate(target, locale, timeZone)} ${clock}`;
  return `${weekdayName(target, locale, timeZone)} ${clock}`;
}

/** Unique duty kinds, in words, from the reasons a pharmacy is open. */
export function dutyKindWords(reasons: readonly OpenReason[], text: StatusText): string | null {
  const kinds: DutyKind[] = [];
  for (const reason of reasons) {
    if ((reason.kind === 'duty' || reason.kind === 'duty-extra') && !kinds.includes(reason.duty)) {
      kinds.push(reason.duty);
    }
  }
  return kinds.length === 0 ? null : kinds.map((kind) => text.kinds[kind]).join(', ');
}

/** Beyond this the countdown is replaced by "open until …": 3 h 50 min is useful, 14 h is not. */
const COUNTDOWN_MAX_MINUTES = 12 * 60;

export function describeStatus(options: {
  readonly status: PharmacyStatus;
  readonly at: Date;
  /** "now" shows a countdown; a chosen time shows "open until". */
  readonly live: boolean;
  readonly locale: Locale;
  readonly text: StatusText;
  readonly timeZone?: string;
}): StatusView {
  const { status, at, live, locale, text } = options;
  const timeZone = options.timeZone ?? THESSALONIKI.timeZone;
  const kind = pinKindOf(status);

  switch (status.state) {
    case 'open': {
      const kinds = dutyKindWords(status.reasons, text);
      const label =
        kind === 'duty' ? text.onDuty : kind === 'extended' ? text.openExtended : text.openRegular;
      const minutes = Math.ceil((status.until.getTime() - at.getTime()) / 60_000);
      const when = dayAndTime(status.until, at, locale, text, timeZone);
      const timing =
        live && minutes <= COUNTDOWN_MAX_MINUTES
          ? fill(text.closesIn, { duration: formatDuration(minutes, text), when })
          : fill(text.openUntil, { when });
      return { kind, label, dutyKinds: kinds, timing, closingSoon: status.closingSoon };
    }
    case 'duty-hours-unknown':
      return {
        kind,
        label: text.dutyUnknown,
        dutyKinds: text.kinds[status.duty.duty],
        timing: null,
        closingSoon: false,
      };
    case 'closed':
      return {
        kind,
        label: text.closed,
        dutyKinds: null,
        timing:
          status.nextOpen === null
            ? text.opensUnknown
            : fill(text.opensAt, {
                when: dayAndTime(status.nextOpen, at, locale, text, timeZone, true),
              }),
        closingSoon: false,
      };
  }
}
