import { THESSALONIKI, addDays, zonedDate } from '@pharmacy-skg/core';
import type { Locale } from '@pharmacy-skg/core';
import { formatClock, shortDate, weekdayName } from './format.ts';

/**
 * A moment described relative to another, in the city's time zone. The home screen and the
 * search-engine pages both use it, so "until 08:00" always says the day when it is not today,
 * and a moment a week or more away carries its date (a bare weekday would read as this week's).
 */
export type When =
  | { readonly kind: 'today'; readonly time: string }
  | { readonly kind: 'tomorrow'; readonly time: string }
  | { readonly kind: 'weekday'; readonly weekday: string; readonly time: string }
  | { readonly kind: 'date'; readonly date: string; readonly time: string };

export function whenOf(
  target: Date,
  at: Date,
  locale: Locale,
  timeZone: string = THESSALONIKI.timeZone,
): When {
  const time = formatClock(target, timeZone);
  const day = zonedDate(target, timeZone);
  const today = zonedDate(at, timeZone);
  if (day === today) return { kind: 'today', time };
  if (day === addDays(today, 1)) return { kind: 'tomorrow', time };
  const diff = Math.round(
    (Date.parse(`${day}T00:00Z`) - Date.parse(`${today}T00:00Z`)) / 86_400_000,
  );
  if (diff >= 7) return { kind: 'date', date: shortDate(target, locale, timeZone), time };
  return { kind: 'weekday', weekday: weekdayName(target, locale, timeZone), time };
}
