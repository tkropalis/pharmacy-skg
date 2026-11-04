import type { CityData, IsoDate, Locale } from '@pharmacy-skg/core';
import {
  addDays,
  hasRegularHours,
  localToInstant,
  openIntervals,
  publishedDuties,
  publishedGroups,
  zonedDate,
} from '@pharmacy-skg/core';
import type { Dictionary } from '../../i18n/index.ts';
import { formatShortDate } from './format.ts';
import { timeInCity } from './status-text.ts';

/** How many days a pharmacy's page shows, today first. */
export const WEEK_DAYS = 7;

export interface DayHours {
  readonly date: IsoDate;
  /** "Σήμερα", "Αύριο", "Παρ 6 Νοε". */
  readonly label: string;
  readonly today: boolean;
  /** "08:00–14:30, 17:00–21:00", "Όλη μέρα", or what is known instead of hours. */
  readonly hours: string;
  /** No hours that day: shown quieter. */
  readonly none: boolean;
  /** Its hours are simply not known (decision D26), so the day says nothing worth a row. */
  readonly unknown: boolean;
  /** The words for a duty that day, or null. */
  readonly duty: string | null;
}

interface Range {
  readonly start: Date;
  readonly end: Date;
}

const DAY_MS = 86_400_000;

/**
 * A range that runs past midnight is one shift to the person, so it is shown whole on the day it
 * starts ("21:00–08:00"), unless the next day is open all day: then each day stands alone.
 */
function joinOvernight(days: Range[][]): Range[][] {
  const out = days.map((day) => [...day]);
  for (let i = 0; i < out.length - 1; i += 1) {
    const today = out[i] ?? [];
    const next = out[i + 1] ?? [];
    const last = today.at(-1);
    const first = next[0];
    if (last === undefined || first === undefined) continue;
    if (last.end.getTime() !== first.start.getTime()) continue;
    if (first.end.getTime() - first.start.getTime() >= DAY_MS - 3_600_000) continue;
    today[today.length - 1] = { start: last.start, end: first.end };
    next.shift();
  }
  return out;
}

/**
 * The next seven days of a pharmacy, from what the engine knows (decision D23): the extended
 * hours in place of the regular ones, holidays, and only duties already announced (D11). A day
 * says "closed" only when nothing more can be announced for it; otherwise it says so.
 */
export function weekHours(
  data: CityData,
  pharmacyId: string,
  now: Date,
  locale: Locale,
  labels: Dictionary,
): readonly DayHours[] {
  const text = labels.seo.pharmacy;
  const { timeZone } = data.city;
  const today = zonedDate(now, timeZone);
  const dates = Array.from({ length: WEEK_DAYS }, (_, i) => addDays(today, i));
  const pharmacy = data.pharmacies.find((p) => p.id === pharmacyId);
  const group = pharmacy?.groupId ?? data.city.defaultGroupId;

  const startOf = (date: IsoDate) => localToInstant(date, '00:00', timeZone);
  const clipped = dates.map((date) =>
    openIntervals(data, pharmacyId, startOf(date), startOf(addDays(date, 1))).map(
      ({ start, end }) => ({ start, end }),
    ),
  );
  const ranges = joinOvernight(clipped);
  const duties = publishedDuties(data, pharmacyId, today);

  return dates.map((date, index) => {
    const label =
      index === 0 ? text.today : index === 1 ? text.tomorrow : formatShortDate(date, locale);
    const dayRanges = ranges[index] ?? [];
    const dayDuties = duties.filter((d) => d.date === date);
    const allDay =
      dayRanges.length === 1 &&
      (dayRanges[0]?.end.getTime() ?? 0) - (dayRanges[0]?.start.getTime() ?? 0) >=
        DAY_MS - 3_600_000;

    const duty =
      dayDuties.length === 0
        ? null
        : dayDuties.some((d) => d.onCall)
          ? labels.status.onCall
          : dayDuties.every((d) => d.hours === null)
            ? labels.status.dutyUnknown
            : labels.status.onDuty;

    const known = hasRegularHours(data.city.id, date);
    const base = { date, label, today: index === 0, duty, unknown: false };
    if (allDay) return { ...base, hours: text.allDay, none: false };
    if (dayRanges.length > 0) {
      const hours = dayRanges
        .map(
          (r) => `${timeInCity(r.start, locale, timeZone)}–${timeInCity(r.end, locale, timeZone)}`,
        )
        .join(', ');
      return { ...base, hours, none: false };
    }
    if (dayDuties.length > 0) return { ...base, hours: '', none: false };
    const announced = publishedGroups(data, date).has(group);
    if (!known) return { ...base, hours: '', none: true, unknown: true };
    return { ...base, hours: announced ? text.closedDay : text.dutyNotAnnounced, none: true };
  });
}
