import type { ExtraHours, IsoDate, Locale, TimeRange, TimeWindow } from '@pharmacy-skg/core';
import { addDays, isoWeekday, regularRanges } from '@pharmacy-skg/core';
import type { Dictionary } from '../../i18n/index.ts';

type SeoStrings = Dictionary['seo'];

const INTL_LOCALE: Record<Locale, string> = { el: 'el-GR', en: 'en-GB' };

// `fill` (placeholder replacement) is shared with the home screen.
export { fill } from '../format.ts';

function utcDate(date: IsoDate): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

/** "Δευτέρα 5 Οκτωβρίου 2026" / "Monday 5 October 2026". A calendar date: no time zone is involved. */
export function formatLongDate(date: IsoDate, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
    .format(utcDate(date))
    .replace(',', '');
}

/** "5 Οκτωβρίου 2026" / "5 October 2026". */
export function formatDate(date: IsoDate, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(utcDate(date));
}

/** "Δευ 5 Οκτ" / "Mon 5 Oct". */
export function formatShortDate(date: IsoDate, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
    .format(utcDate(date))
    .replace(',', '');
}

/** "08:00–14:00, 17:00–21:00" */
export function rangesText(ranges: readonly TimeRange[]): string {
  return ranges.map((r) => `${r.from}–${r.to}`).join(', ');
}

/** Short names of ISO weekdays joined with "/": [1, 3] gives "Δευ/Τετ". */
export function weekdaysText(weekdays: readonly number[], seo: SeoStrings): string {
  return weekdays
    .slice()
    .sort((a, b) => a - b)
    .map((day) => seo.weekdaysShort[day - 1] ?? String(day))
    .join('/');
}

/**
 * The hours printed in a duty heading ("21:00–08:00 την επομένη"), or "call for the hours" when
 * none are printed. An end at 00:00 is midnight and needs no "next day".
 */
export function windowText(hours: TimeWindow | null, seo: SeoStrings): string {
  if (hours === null) return seo.duty.hoursNotStated;
  const base = `${hours.from}–${hours.to}`;
  return hours.toNextDay && hours.to !== '00:00' ? `${base} ${seo.duty.nextDay}` : base;
}

/** "Τρί/Πέμ/Παρ 14:00–17:00, εκτός αργιών" */
export function extraHoursText(extra: ExtraHours, seo: SeoStrings): string {
  const base = `${weekdaysText(extra.weekdays, seo)} ${extra.from}–${extra.to}`;
  return extra.exceptHolidays ? `${base}, ${seo.duty.exceptHolidays}` : base;
}

export interface RegularHoursGroup {
  /** "Δευ/Τετ" */
  readonly days: string;
  /** "08:00–14:30" or "08:00–14:00, 17:00–21:00" */
  readonly times: string;
}

export interface RegularHoursView {
  readonly groups: readonly RegularHoursGroup[];
  /** Days without regular hours, e.g. "Σαβ/Κυρ"; '' if the week has none. */
  readonly closedDays: string;
  /** The label and the groups on one line: "Συνηθισμένο ωράριο: Δευ/Τετ 08:00–14:30 · …". */
  readonly text: string;
}

/**
 * The regular hours as a table of weekdays with the same hours. The week starting on
 * `reference` picks the period in force (holidays are ignored, as in the engine's table).
 */
export function regularHoursView(
  cityId: string,
  reference: IsoDate,
  seo: SeoStrings,
): RegularHoursView {
  const byTimes = new Map<string, number[]>();
  const closed: number[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDays(reference, offset);
    const weekday = isoWeekday(date);
    const ranges = regularRanges(cityId, date);
    if (ranges.length === 0) {
      closed.push(weekday);
      continue;
    }
    const key = rangesText(ranges);
    byTimes.set(key, [...(byTimes.get(key) ?? []), weekday]);
  }
  const groups = [...byTimes.entries()]
    .map(([times, days]) => ({ times, days: days.sort((a, b) => a - b) }))
    .sort((a, b) => (a.days[0] ?? 0) - (b.days[0] ?? 0))
    .map(({ times, days }) => ({ days: weekdaysText(days, seo), times }));
  const closedDays = weekdaysText(closed, seo);
  const line = groups.map((g) => `${g.days} ${g.times}`).join(' · ');
  return { groups, closedDays, text: `${seo.pharmacy.regularLabel}: ${line}` };
}
