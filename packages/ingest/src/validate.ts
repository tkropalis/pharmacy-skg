import type { DutyKind } from '@pharmacy-skg/core';
import type { ValidationRules } from './cities/pipeline.ts';
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

export interface DataSet {
  readonly today: string;
  readonly days: readonly DutyDay[];
  readonly pharmacies: readonly Pharmacy[];
  readonly extended: readonly ExtendedHours[];
}

/**
 * Describes the first section of a group's list whose entry count is outside the city's range
 * ("metro day: 1 entries, expected 20–120"), or returns null when every count is plausible.
 */
export function implausibleCount(
  group: {
    readonly id: string;
    readonly sections: readonly { readonly kind: DutyKind; readonly entries: readonly unknown[] }[];
  },
  rules: Pick<ValidationRules, 'sectionRange'>,
): string | null {
  for (const section of group.sections) {
    const [min, max] = rules.sectionRange(group.id, section.kind);
    const count = section.entries.length;
    if (count < min || count > max) {
      return `${group.id} ${section.kind}: ${count} entries, expected ${min}–${max}`;
    }
  }
  return null;
}

/**
 * Checks everything the pipeline is about to publish for a city, against the city's rules.
 * Errors block publishing; warnings are reported.
 */
export function validate(data: DataSet, rules: ValidationRules): Report {
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
    const missing = rules.groupIds.filter((id) => !present.has(id));
    // A group the source has not published yet is shown as unknown in the app; the others are
    // still worth publishing.
    if (missing.length > 0) warn('missing-group', `${day.date}: no list for ${missing.join(', ')}`);
    for (const group of day.groups) {
      const implausible = implausibleCount(group, rules);
      if (implausible) error('count', `${day.date} ${implausible}`);
      for (const section of group.sections) {
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
  if (!data.days.some((day) => day.date === data.today))
    warn('coverage', `no duty list for today, ${data.today}`);
  else if (!latest || latest < tomorrow)
    warn('coverage', `latest duty list is for ${latest ?? 'no date'}`);

  const count = data.pharmacies.length;
  const [fewest, most] = rules.pharmacies;
  if (count < fewest || count > most) {
    error('count', `${count} pharmacies, expected ${fewest}–${most}`);
  }
  const approximate = data.pharmacies.filter((p) => p.location?.precision === 'locality');
  if (approximate.length > 0) {
    warn(
      'approximate-location',
      `${approximate.length} pharmacies are placed only at their locality: ${approximate.map((p) => p.id).join(', ')}`,
    );
  }

  for (const list of data.extended) {
    if (list.entries.length < (rules.minExtendedEntries ?? 0)) {
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
    rules.minExtendedEntries !== null &&
    !data.extended.some((list) => list.period.from <= data.today && data.today <= list.period.to)
  ) {
    warn('coverage', `no extended-hours list covers ${data.today}`);
  }

  return { errors, warnings };
}
