import { AREA_GROUPS } from './fsth/groups.ts';
import type { DutyKind } from './fsth/heading.ts';
import type { Warning } from './registry/build.ts';
import {
  DutyDaySchema,
  ExtendedHoursSchema,
  PharmaciesSchema,
  type DutyDay,
  type ExtendedHours,
  type Pharmacy,
} from './schema.ts';
import { addDays } from './time.ts';

export interface Report {
  errors: Warning[];
  warnings: Warning[];
}

/**
 * Expected entries per section in the metro list, from the Jun–Oct 2026
 * lists. A count outside these ranges means the parser or the source broke.
 */
const METRO_RANGES: Readonly<Record<DutyKind, readonly [number, number]>> = {
  day: [20, 120],
  'saturday-extra': [20, 120],
  'on-duty': [1, 120],
  overnight: [10, 60],
  'after-midnight': [2, 15],
};
const OTHER_GROUP_RANGE = [1, 12] as const;
const PHARMACY_RANGE = [200, 3000] as const;
const MIN_EXTENDED_ENTRIES = 100;

export interface DataSet {
  readonly today: string;
  readonly days: readonly DutyDay[];
  readonly pharmacies: readonly Pharmacy[];
  readonly extended: readonly ExtendedHours[];
}

/** Checks everything the pipeline is about to publish. Errors block publishing; warnings are reported. */
export function validate(data: DataSet): Report {
  const errors: Warning[] = [];
  const warnings: Warning[] = [];
  const error = (code: string, message: string) => errors.push({ code, message });
  const warn = (code: string, message: string) => warnings.push({ code, message });

  for (const day of data.days) {
    const parsed = DutyDaySchema.safeParse(day);
    if (!parsed.success) error('schema', `duties/${day.date}: ${parsed.error.message}`);
  }
  const pharmaciesParsed = PharmaciesSchema.safeParse({
    schemaVersion: 1,
    pharmacies: data.pharmacies,
  });
  if (!pharmaciesParsed.success) error('schema', `pharmacies: ${pharmaciesParsed.error.message}`);
  for (const list of data.extended) {
    const parsed = ExtendedHoursSchema.safeParse(list);
    if (!parsed.success)
      error('schema', `extended-hours ${list.period.from}: ${parsed.error.message}`);
  }

  const byId = new Map(data.pharmacies.map((pharmacy) => [pharmacy.id, pharmacy]));
  const tomorrow = addDays(data.today, 1);

  for (const day of data.days) {
    const present = new Set(day.groups.map((group) => group.id));
    const missing = AREA_GROUPS.filter((group) => !present.has(group.id)).map((group) => group.id);
    if (missing.length > 0) {
      const message = `${day.date}: no list for ${missing.join(', ')}`;
      if (day.date === data.today || day.date === tomorrow) error('missing-group', message);
      else warn('missing-group', message);
    }
    for (const group of day.groups) {
      for (const section of group.sections) {
        const [min, max] = group.id === 'metro' ? METRO_RANGES[section.kind] : OTHER_GROUP_RANGE;
        const count = section.entries.length;
        if (count < min || count > max) {
          error(
            'count',
            `${day.date} ${group.id} ${section.kind}: ${count} entries, expected ${min}–${max}`,
          );
        }
        if (section.notes.length > 0 && section.extraHours.length === 0) {
          warn(
            'unread-note',
            `${day.date} ${group.id}: note not understood: "${section.notes.join(' ')}"`,
          );
        }
        for (const entry of section.entries) {
          const pharmacy = byId.get(entry.pharmacyId);
          if (!pharmacy)
            error('unknown-pharmacy', `${day.date}: ${entry.pharmacyId} is not in the registry`);
          else if (!pharmacy.location) {
            // Only current and future lists reach users.
            (day.date >= data.today ? error : warn)(
              'no-location',
              `${day.date} ${group.id}: ${pharmacy.id} ${pharmacy.name}, ${pharmacy.address}`,
            );
          }
        }
      }
    }
  }

  const latest = data.days
    .map((day) => day.date)
    .sort()
    .at(-1);
  if (!latest || latest < tomorrow)
    warn('coverage', `latest duty list is for ${latest ?? 'no date'}`);

  const count = data.pharmacies.length;
  if (count < PHARMACY_RANGE[0] || count > PHARMACY_RANGE[1]) {
    error('count', `${count} pharmacies, expected ${PHARMACY_RANGE[0]}–${PHARMACY_RANGE[1]}`);
  }
  const approximate = data.pharmacies.filter((p) => p.location?.precision === 'locality');
  if (approximate.length > 0) {
    warn(
      'approximate-location',
      `${approximate.length} pharmacies are placed only at their locality: ${approximate.map((p) => p.id).join(', ')}`,
    );
  }

  for (const list of data.extended) {
    if (list.entries.length < MIN_EXTENDED_ENTRIES) {
      error('count', `extended hours ${list.period.from}: ${list.entries.length} entries`);
    }
    const seen = new Set<string>();
    const repeated = new Set<string>();
    for (const entry of list.entries) {
      if (seen.has(entry.pharmacyId)) repeated.add(entry.pharmacyId);
      seen.add(entry.pharmacyId);
    }
    if (repeated.size > 0) {
      warn(
        'duplicate-extended',
        `extended hours ${list.period.from}: several rows for ${[...repeated].join(', ')}`,
      );
    }
    const unmatched = list.entries.filter((entry) => byId.get(entry.pharmacyId)?.groupId === null);
    if (unmatched.length > list.entries.length * 0.3) {
      warn(
        'unmatched',
        `extended hours ${list.period.from}: ${unmatched.length} of ${list.entries.length} not matched to a duty-list pharmacy`,
      );
    }
  }
  if (
    !data.extended.some((list) => list.period.from <= data.today && data.today <= list.period.to)
  ) {
    warn('coverage', `no extended-hours list covers ${data.today}`);
  }

  return { errors, warnings };
}
