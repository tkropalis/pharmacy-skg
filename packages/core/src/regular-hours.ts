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

/** Attica's Monday to Friday, with the afternoon of Tuesday, Thursday and Friday given. */
function atticaWeek(afternoon: TimeRange): RegularHoursPeriod['days'] {
  const long: readonly TimeRange[] = [{ from: '08:00', to: '14:30' }];
  const split: readonly TimeRange[] = [{ from: '08:00', to: '14:00' }, afternoon];
  return { 1: long, 2: split, 3: long, 4: split, 5: split, 6: [], 7: [] };
}

const ATTICA_DECISIONS =
  'Περιφέρεια Αττικής, 13 May 2026 to 12 May 2027, from ΦΣΑ letter 1609/17.04.2026: ' +
  'ΨΔ8Π7Λ7-ΚΒΨ (Central Athens), Ψ1ΑΗ7Λ7-ΙΞ0 (North Athens), Ψ3Δ17Λ7-8Δ0 (West Athens), ' +
  'ΡΩΡ47Λ7-ΠΞΡ (West Attica)';

/**
 * Attica (the association's area). Four of its six regional units published the same decision
 * on Diavgeia; South Athens and East Attica published none, and the association's hours are
 * applied there too (the owner, 8 Oct 2026). The afternoons are 17:00–20:00 in winter and
 * 17:30–20:30 in summer, with no dates in the decisions: winter starts on 1 Nov (the
 * association's notice of 29 Oct 2024, fsa.gr/6469-2), and the return to summer is not known,
 * so from 1 Apr 2027 only the hours both share count (decision D23).
 */
const ATTICA_REGULAR: readonly RegularHoursPeriod[] = [
  {
    from: '2026-05-13',
    to: '2026-10-31',
    days: atticaWeek({ from: '17:30', to: '20:30' }),
    source: `${ATTICA_DECISIONS}; summer afternoons`,
  },
  {
    from: '2026-11-01',
    to: '2027-03-31',
    days: atticaWeek({ from: '17:00', to: '20:00' }),
    source: `${ATTICA_DECISIONS}; winter afternoons from 1 Nov (fsa.gr/6469-2)`,
  },
  {
    from: '2027-04-01',
    to: '2027-05-12',
    days: atticaWeek({ from: '17:30', to: '20:00' }),
    source: `${ATTICA_DECISIONS}; the hours winter and summer share, the switch being unknown`,
  },
];

/** Regular hours by city id. A city without an entry has none. */
export const REGULAR_HOURS: Readonly<Record<string, readonly RegularHoursPeriod[]>> = {
  thessaloniki: THESSALONIKI_REGULAR,
  attiki: ATTICA_REGULAR,
};

/**
 * Whether the city's regular hours on `date` are known (from its Region's published decision in
 * force then). Without them only pharmacies on duty are known to be open; the others are not
 * "closed", their hours are unknown (decision D26). So a decision that has run out (Attica's
 * ends on 12 May 2027) makes the city show only its duties again, never every pharmacy closed.
 */
export function hasRegularHours(cityId: string, date: IsoDate): boolean {
  return (REGULAR_HOURS[cityId] ?? []).some(
    (p) => p.from <= date && (p.to === null || date <= p.to),
  );
}

/** The regular ranges on a date (ignoring holidays), or none outside every period. */
export function regularRanges(cityId: string, date: IsoDate): readonly TimeRange[] {
  const period = (REGULAR_HOURS[cityId] ?? []).find(
    (p) => p.from <= date && (p.to === null || date <= p.to),
  );
  return period?.days[isoWeekday(date)] ?? [];
}
