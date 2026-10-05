/**
 * Regular opening hours as data. Each period applies from `from` until `to`
 * (inclusive, null = still in force). Add a period when the Region changes the
 * rules; do not edit the old one.
 */
import type { IsoDate, TimeRange } from './data.ts';
import type { IsoWeekday } from './zoned.ts';
import { isoWeekday } from './zoned.ts';

export interface RegularHoursPeriod {
  readonly from: IsoDate;
  readonly to: IsoDate | null;
  /** Ranges by ISO weekday; an empty list means closed. */
  readonly days: Readonly<Record<IsoWeekday, readonly TimeRange[]>>;
  readonly source: string;
}

const MORNING_AFTERNOON: readonly TimeRange[] = [
  { from: '08:00', to: '14:00' },
  { from: '17:00', to: '21:00' },
];
const LONG_MORNING: readonly TimeRange[] = [{ from: '08:00', to: '14:30' }];

/** Thessaloniki. There is no summer schedule: none is verified (decision D23). */
const THESSALONIKI_REGULAR: readonly RegularHoursPeriod[] = [
  {
    from: '2021-03-23',
    to: null,
    days: {
      1: LONG_MORNING,
      2: MORNING_AFTERNOON,
      3: LONG_MORNING,
      4: MORNING_AFTERNOON,
      5: MORNING_AFTERNOON,
      6: [],
      7: [],
    },
    source: 'ΠΚΜ decision, as reported on 23 Mar 2021 (iefimerida.gr, parallaximag.gr)',
  },
];

/** Regular hours by city id. A city without an entry has none. */
export const REGULAR_HOURS: Readonly<Record<string, readonly RegularHoursPeriod[]>> = {
  thessaloniki: THESSALONIKI_REGULAR,
};

/** The regular ranges on a date (ignoring holidays), or none outside every period. */
export function regularRanges(cityId: string, date: IsoDate): readonly TimeRange[] {
  const period = (REGULAR_HOURS[cityId] ?? []).find(
    (p) => p.from <= date && (p.to === null || date <= p.to),
  );
  return period?.days[isoWeekday(date)] ?? [];
}
