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
const MAGNESIA_SPLIT: readonly TimeRange[] = [
  { from: '08:00', to: '13:30' },
  { from: '17:00', to: '21:00' },
];

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

/** Karditsa's week: Mon, Wed and Fri with the given afternoon, Tue and Thu until 14:30. */
function karditsaWeek(afternoon: TimeRange): RegularHoursPeriod['days'] {
  const split: readonly TimeRange[] = [{ from: '08:00', to: '14:00' }, afternoon];
  return { 1: split, 2: LONG_MORNING, 3: split, 4: LONG_MORNING, 5: split, 6: [], 7: [] };
}

const KARDITSA_DECISION =
  'Περιφέρεια Θεσσαλίας, ΨΞΡΤ7ΛΡ-0ΤΞ (29 May 2026), Δημοτική Κοινότητα Καρδίτσας';

/**
 * Karditsa: the Region of Thessaly's decision ΨΞΡΤ7ΛΡ-0ΤΞ of 29 May 2026 for the regional unit,
 * at the Karditsa association's proposal 183/27.5.2026. It gives no dates for its validity (it
 * is in force from its issue until a new one replaces it, as the 2023 one was; the owner,
 * 2 Nov 2026). The afternoon of Mon, Wed and Fri is 17:30–21:00 in summer and 17:00–21:00 in
 * winter, with no dates in the decision: winter starts on 1 Nov, as in Attica (the owner,
 * 2 Nov 2026), and the return to summer is not known, so from 1 Apr 2027 only the hours both
 * share count, 17:30–21:00 (decision D26). The hours are those of the Karditsa community, which
 * Palamas, Sofades, Karditsomagoula, Agnantero, Proastio and the other communities share: the
 * area's pharmacies are in Karditsa. Mouzaki alone differs (Mon to Fri mornings until 14:30,
 * afternoons on Tue, Thu and Fri) and lies outside the area's box.
 */
const KARDITSA_REGULAR: readonly RegularHoursPeriod[] = [
  {
    from: '2026-05-29',
    to: '2026-10-31',
    days: karditsaWeek({ from: '17:30', to: '21:00' }),
    source: `${KARDITSA_DECISION}; summer afternoons`,
  },
  {
    from: '2026-11-01',
    to: '2027-03-31',
    days: karditsaWeek({ from: '17:00', to: '21:00' }),
    source: `${KARDITSA_DECISION}; winter afternoons from 1 Nov (the owner)`,
  },
  {
    from: '2027-04-01',
    to: null,
    days: karditsaWeek({ from: '17:30', to: '21:00' }),
    source: `${KARDITSA_DECISION}; the hours winter and summer share, the switch being unknown`,
  },
];

/**
 * Magnesia: the Region of Thessaly's decision 9ΠΠΦ7ΛΡ-45Ρ of 3 Nov 2025 for Magnesia and the
 * Sporades "for the period 2026–2027", approved at the Magnesia association's request (letters
 * 12911 to 12913 of 24.10.2025). It gives no dates: "2026-2027" is read literally, 1 Jan 2026 to
 * 31 Dec 2027, and a newer decision replaces it if one comes (the owner, 2 Nov 2026). The
 * hours are those of the Volos regional unit (Volos, Nea Ionia, Nea Anchialos, Iolkos, Artemida,
 * Portaria, Aisonia), where the area's pharmacies are. Agria alone of the places in the area's
 * box differs (Mon, Wed and Fri also in the afternoon, Tue and Thu until 14:00). No seasons.
 */
const MAGNESIA_REGULAR: readonly RegularHoursPeriod[] = [
  {
    from: '2026-01-01',
    to: '2027-12-31',
    days: {
      1: [{ from: '08:00', to: '14:00' }],
      2: MAGNESIA_SPLIT,
      3: [{ from: '08:00', to: '13:30' }],
      4: MAGNESIA_SPLIT,
      5: MAGNESIA_SPLIT,
      6: [],
      7: [],
    },
    source:
      'Περιφέρεια Θεσσαλίας, 9ΠΠΦ7ΛΡ-45Ρ (3 Nov 2025), "2026-2027", Δ.Ε. Βόλου, Ν. Ιωνίας κ.ά.; ' +
      'counted from 1 Jan 2026 to 31 Dec 2027',
  },
];

/** Corfu's Monday to Friday: Wednesday a long morning, the other four a morning and an afternoon. */
function corfuWeek(afternoon: TimeRange): RegularHoursPeriod['days'] {
  const split: readonly TimeRange[] = [{ from: '08:30', to: '14:00' }, afternoon];
  return {
    1: split,
    2: split,
    3: [{ from: '08:30', to: '14:30' }],
    4: split,
    5: split,
    6: [],
    7: [],
  };
}

/**
 * Corfu (the regional unit), from the Region of the Ionian Islands' decisions, each at the
 * association's request, on Diavgeia (decision D28): winter from 14 Sep 2026 9ΚΛΤ7ΛΕ-7Τ4 (22 Sep
 * 2026), afternoons 17:30–20:30; summer from 30 Apr 2026 ΨΦΘ57ΛΕ-19Ο (4 May 2026), afternoons
 * 18:00–21:00. Neither states an end, nor does any before it. Summer began on 30 Apr in 2025 and
 * 2026 and winter on 15 Sep in 2024 and 2025: winter counts until 29 Apr 2027, the day before the
 * next summer is expected, and the area shows only its duties again until a decision is added
 * (decision D26). Wednesday's long morning is the 2026 decisions'; the winter of 2025 ended it at
 * 14:00.
 */
const CORFU_REGULAR: readonly RegularHoursPeriod[] = [
  {
    from: '2026-04-30',
    to: '2026-09-13',
    days: corfuWeek({ from: '18:00', to: '21:00' }),
    source: 'Περιφέρεια Ιονίων Νήσων, ΨΦΘ57ΛΕ-19Ο: summer from 30 Apr 2026',
  },
  {
    from: '2026-09-14',
    to: '2027-04-29',
    days: corfuWeek({ from: '17:30', to: '20:30' }),
    source:
      'Περιφέρεια Ιονίων Νήσων, 9ΚΛΤ7ΛΕ-7Τ4: winter from 14 Sep 2026, until the day before the summer expected on 30 Apr',
  },
];

/** Regular hours by city id. A city without an entry has none. */
export const REGULAR_HOURS: Readonly<Record<string, readonly RegularHoursPeriod[]>> = {
  thessaloniki: THESSALONIKI_REGULAR,
  attiki: ATTICA_REGULAR,
  corfu: CORFU_REGULAR,
  karditsa: KARDITSA_REGULAR,
  magnesia: MAGNESIA_REGULAR,
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
