import type { City, IsoDate, Locale, Meta } from '@pharmacy-skg/core';
import { GREECE_TIME_ZONE } from '@pharmacy-skg/core';
import { checkedAt, isStale } from './freshness.ts';

/**
 * One row of the data status page (docs/decisions.md, Defaults: data status): an area, when its
 * sources were last checked and the duty days the lists cover. Built at build time from
 * data/<city>/meta.json; only `fresh` depends on the clock, so the page works it out again in
 * the browser (scripts/boot.ts), because a page can be older than its data.
 */
export interface StatusRow {
  readonly cityId: string;
  readonly name: string;
  /** meta.json's `checkedAt` (its `updatedAt` in files from before it existed). */
  readonly checkedAt: string;
  /** "1 Νοε 22:32" in the city's time zone. */
  readonly checkedText: string;
  /**
   * The last duty day the lists cover ("7 Νοε"), or null when none is published: how far ahead
   * they go, which is what a reader needs (meta.json's `from` includes history that is kept).
   */
  readonly dutyUntil: string | null;
  readonly fresh: boolean;
}

const INTL_LOCALE: Record<Locale, string> = { el: 'el-GR', en: 'en-GB' };

/** "1 Νοε 22:32" / "1 Nov 22:32": no year, since the data is days old at most. */
export function formatChecked(
  at: string,
  locale: Locale,
  timeZone: string = GREECE_TIME_ZONE,
): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  const intl = INTL_LOCALE[locale];
  const day = new Intl.DateTimeFormat(intl, { timeZone, day: 'numeric', month: 'short' });
  const clock = new Intl.DateTimeFormat(intl, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return `${day.format(date)} ${clock.format(date)}`;
}

function calendarDate(date: IsoDate, locale: Locale, withYear: boolean): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  }).format(new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)));
}

/** "7 Νοε" / "7 Nov", with the year only when it is not the current one. */
export function dutyUntilDate(date: IsoDate, locale: Locale, now: Date): string {
  const year = new Intl.DateTimeFormat('en-CA', {
    timeZone: GREECE_TIME_ZONE,
    year: 'numeric',
  }).format(now);
  return calendarDate(date, locale, date.slice(0, 4) !== year);
}

/** Every covered area, in the order given, with its row. */
export function statusRows(
  entries: readonly { readonly city: City; readonly meta: Meta }[],
  locale: Locale,
  now: Date,
): StatusRow[] {
  return entries.map(({ city, meta }) => {
    const checked = checkedAt(meta);
    return {
      cityId: city.id,
      name: city.name[locale],
      checkedAt: checked,
      checkedText: formatChecked(checked, locale, city.timeZone),
      dutyUntil: meta.duties === null ? null : dutyUntilDate(meta.duties.to, locale, now),
      fresh: !isStale(checked, now),
    };
  });
}
