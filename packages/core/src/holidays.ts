/**
 * Holidays on which pharmacies keep no regular hours (decision D23): the
 * national public holidays, local ones, and weekdays that the published duty
 * list marks with an "αργίες" heading.
 */
import type { CityData } from './open.ts';
import type { IsoDate } from './data.ts';
import { addDays, isoWeekday } from './zoned.ts';

export interface Holiday {
  readonly date: IsoDate;
  readonly name: { readonly el: string; readonly en: string };
  /** `national`, or only the listed ΦΣΘ area groups. */
  readonly scope: 'national' | { readonly groupIds: readonly string[] };
}

/** The group assumed for a pharmacy whose area group is unknown. */
export const DEFAULT_GROUP_ID = 'metro';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Orthodox Easter Sunday in the Gregorian calendar (Meeus's Julian algorithm,
 * plus the 13-day offset). The offset holds for 1900–2099.
 */
export function orthodoxEaster(year: number): IsoDate {
  if (!Number.isInteger(year) || year < 1900 || year > 2099) {
    throw new RangeError(`Orthodox Easter is only supported for 1900–2099, got ${year}`);
  }
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31); // 3 = March, 4 = April (Julian)
  const day = ((d + e + 114) % 31) + 1;
  const gregorian = new Date(Date.UTC(year, month - 1, day + 13));
  return `${year}-${pad(gregorian.getUTCMonth() + 1)}-${pad(gregorian.getUTCDate())}`;
}

/** Local holidays by city id, as [month, day, name, groupIds]. */
const LOCAL: Readonly<
  Record<string, readonly (readonly [number, number, Holiday['name'], readonly string[]])[]>
> = {
  thessaloniki: [[10, 26, { el: 'Αγίου Δημητρίου', en: 'Feast of Saint Demetrius' }, ['metro']]],
};

/** All holidays of `year` for the city, in date order. */
export function holidays(year: number, cityId: string): Holiday[] {
  const fixed = (month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;
  const easter = orthodoxEaster(year);
  const national = (date: IsoDate, el: string, en: string): Holiday => ({
    date,
    name: { el, en },
    scope: 'national',
  });

  const list: Holiday[] = [
    national(fixed(1, 1), 'Πρωτοχρονιά', "New Year's Day"),
    national(fixed(1, 6), 'Θεοφάνεια', 'Epiphany'),
    national(addDays(easter, -48), 'Καθαρά Δευτέρα', 'Clean Monday'),
    national(fixed(3, 25), 'Ευαγγελισμός της Θεοτόκου', 'Independence Day'),
    national(addDays(easter, -2), 'Μεγάλη Παρασκευή', 'Good Friday'),
    national(easter, 'Κυριακή του Πάσχα', 'Easter Sunday'),
    national(addDays(easter, 1), 'Δευτέρα του Πάσχα', 'Easter Monday'),
    // The government sometimes moves 1 May when it falls in Holy Week or Easter
    // week. We don't implement transfer rules: 1 May is always listed, and a moved
    // holiday is caught by the duty list's "αργίες" heading (see isHoliday).
    national(fixed(5, 1), 'Πρωτομαγιά', 'Labour Day'),
    national(addDays(easter, 50), 'Αγίου Πνεύματος', 'Whit Monday'),
    national(fixed(8, 15), 'Κοίμηση της Θεοτόκου', 'Dormition of the Theotokos'),
    national(fixed(10, 28), 'Ημέρα του Όχι', 'Ohi Day'),
    national(fixed(12, 25), 'Χριστούγεννα', 'Christmas Day'),
    national(fixed(12, 26), 'Σύναξη της Θεοτόκου', 'Boxing Day'),
  ];
  for (const [month, day, name, groupIds] of LOCAL[cityId] ?? []) {
    list.push({ date: fixed(month, day), name, scope: { groupIds } });
  }
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

const calendars = new Map<string, ReadonlyMap<IsoDate, readonly Holiday[]>>();

function calendar(year: number, cityId: string): ReadonlyMap<IsoDate, readonly Holiday[]> {
  const key = `${cityId}|${year}`;
  let found = calendars.get(key);
  if (!found) {
    const byDate = new Map<IsoDate, Holiday[]>();
    for (const holiday of holidays(year, cityId)) {
      byDate.set(holiday.date, [...(byDate.get(holiday.date) ?? []), holiday]);
    }
    found = byDate;
    calendars.set(key, found);
  }
  return found;
}

/** The calendar holidays on `date` that apply to the group (a null group counts as metro). */
export function holidaysOn(cityId: string, date: IsoDate, groupId: string | null): Holiday[] {
  const group = groupId ?? DEFAULT_GROUP_ID;
  const year = Number(date.slice(0, 4));
  if (year < 1900 || year > 2099) return [];
  return (calendar(year, cityId).get(date) ?? []).filter(
    (h) => h.scope === 'national' || h.scope.groupIds.includes(group),
  );
}

/** Weekdays that ΦΣΘ lists under "Σάββατο, Κυριακή και αργίες" are holidays. */
const HOLIDAY_HEADING = /αργί/i;

const holidayCache = new WeakMap<CityData, Map<string, boolean>>();

function listedAsHoliday(data: CityData, date: IsoDate, group: string): boolean {
  if (isoWeekday(date) > 5) return false; // The heading is printed every weekend.
  return (data.duties.get(date)?.groups ?? []).some(
    (g) => g.id === group && g.sections.some((s) => HOLIDAY_HEADING.test(s.heading)),
  );
}

/**
 * Is `date` a holiday for the area group (null = unknown, treated as metro)?
 * True for a calendar holiday, or a Monday–Friday on which the group's
 * published duty list has an "αργίες" heading. Memoised per `CityData`.
 */
export function isHoliday(data: CityData, date: IsoDate, groupId: string | null): boolean {
  const group = groupId ?? DEFAULT_GROUP_ID;
  let cache = holidayCache.get(data);
  if (!cache) holidayCache.set(data, (cache = new Map()));
  const key = `${date}|${group}`;
  let found = cache.get(key);
  if (found === undefined) {
    found = holidaysOn(data.city.id, date, group).length > 0 || listedAsHoliday(data, date, group);
    cache.set(key, found);
  }
  return found;
}
