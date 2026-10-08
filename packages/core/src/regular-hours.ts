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

const attikiDays = (afternoon: TimeRange): RegularHoursPeriod['days'] => {
  const split: readonly TimeRange[] = [{ from: '08:00', to: '14:00' }, afternoon];
  return { 1: LONG_MORNING, 2: split, 3: LONG_MORNING, 4: split, 5: split, 6: [], 7: [] };
};

/**
 * Attica, the association's area (decision D26). Each regional unit's deputy governor sets the
 * hours for 13 May to 12 May, at the association's request (ΦΣΑ 1609/17.04.2026); the published
 * decisions (Central, North and West Athens, West Attica) are word for word the same, and South
 * Athens and East Attica, which publish none, follow the same request. The afternoons are
 * 17:30–20:30 in summer and 17:00–20:00 in winter, which starts on 1 November (ΦΣΑ, 29 Oct 2024).
 * When summer starts is not published: the winter hours stay until it is verified (roadmap).
 */
const ATTIKI_REGULAR: readonly RegularHoursPeriod[] = [
  {
    from: '2026-05-13',
    to: '2026-10-31',
    days: attikiDays({ from: '17:30', to: '20:30' }),
    source: 'Περιφέρεια Αττικής, ΑΔΑ ΨΔ8Π7Λ7-ΚΒΨ, Ψ1ΑΗ7Λ7-ΙΞ0, Ψ3Δ17Λ7-8Δ0, ΡΩΡ47Λ7-ΠΞΡ (summer)',
  },
  {
    from: '2026-11-01',
    to: null,
    days: attikiDays({ from: '17:00', to: '20:00' }),
    source: 'Περιφέρεια Αττικής, the same decisions (winter, from 1 Nov as ΦΣΑ announced in 2024)',
  },
];

/** Regular hours by city id. A city without an entry has none. */
export const REGULAR_HOURS: Readonly<Record<string, readonly RegularHoursPeriod[]>> = {
  thessaloniki: THESSALONIKI_REGULAR,
  attiki: ATTIKI_REGULAR,
};

/**
 * Whether the city's regular hours are known (from its Region's published decision). Without
 * them only pharmacies on duty are known to be open; the others are not "closed", their hours are
 * unknown (decision D26).
 */
export function hasRegularHours(cityId: string): boolean {
  return (REGULAR_HOURS[cityId]?.length ?? 0) > 0;
}

/** The regular ranges on a date (ignoring holidays), or none outside every period. */
export function regularRanges(cityId: string, date: IsoDate): readonly TimeRange[] {
  const period = (REGULAR_HOURS[cityId] ?? []).find(
    (p) => p.from <= date && (p.to === null || date <= p.to),
  );
  return period?.days[isoWeekday(date)] ?? [];
}
