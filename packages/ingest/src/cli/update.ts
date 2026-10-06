/**
 * Fetches the official lists, rebuilds data/<city>/ for every covered city (cities/index.ts),
 * validates it and writes only what changed. A city whose data fails validation is left as it
 * was; the others are still written, and the command exits non-zero.
 *
 *   node src/cli/update.ts [--city ID ...] [--since YYYY-MM-DD] [--offline]
 *
 * --city    only this city (repeatable; default: every city)
 * --since   fetch duty lists published on or after this date (default: 3 days ago)
 * --offline use only cached geocoding results
 */
import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { z } from 'zod';
import { PIPELINES, type CityPipeline } from '../cities/index.ts';
import type { FetchContext } from '../cities/pipeline.ts';
import {
  buildRegistry,
  dutyEntryId,
  matchExtendedEntries,
  type Override,
  type Warning,
} from '../registry/build.ts';
import { GeocodeCacheSchema, Geocoder } from '../registry/geocode.ts';
import { OverturePlaceSchema, OvertureIndex } from '../registry/overture.ts';
import {
  DutyDaySchema,
  DutyGroupSchema,
  ExtendedHoursSchema,
  MetaSchema,
  PharmaciesSchema,
  SCHEMA_VERSION,
  type DutyDay,
  type DutyGroup,
  type ExtendedHours,
  type Meta,
} from '../schema.ts';
import {
  cityPaths,
  listJsonFiles,
  readJson,
  removeFile,
  toJson,
  writeIfChanged,
} from '../store.ts';
import { addDays, cityToday } from '../time.ts';
import { validate } from '../validate.ts';

const { values: args } = parseArgs({
  options: {
    city: { type: 'string', multiple: true },
    since: { type: 'string' },
    offline: { type: 'boolean', default: false },
  },
});

const today = cityToday();
const since = args.since ?? addDays(today, -3);
const log = (message: string) => console.log(message);

const unknown = (args.city ?? []).filter((id) => !PIPELINES.some((p) => p.city.id === id));
if (unknown.length > 0) {
  console.error(`Unknown city: ${unknown.join(', ')}`);
  process.exit(2);
}
const chosen = args.city ? PIPELINES.filter((p) => args.city?.includes(p.city.id)) : PIPELINES;

let failed = 0;
for (const pipeline of chosen) {
  log(`--- ${pipeline.city.id}`);
  try {
    if (!(await updateCity(pipeline))) failed++;
  } catch (error) {
    console.error(`${pipeline.city.id}: ${String(error)}`);
    failed++;
  }
}
if (failed > 0) process.exit(1);

/** Updates one city's data. Returns false, writing nothing but the geocoding cache, if it fails validation. */
async function updateCity(pipeline: CityPipeline): Promise<boolean> {
  const { city } = pipeline;
  const paths = cityPaths(city.id);

  // --- Load what is already published -----------------------------------------------

  const days = new Map<string, DutyDay>();
  for (const file of await listJsonFiles(paths.duties)) {
    const day = await readJson(join(paths.duties, file), DutyDaySchema);
    if (day) days.set(day.date, day);
  }
  const previousPharmacies = (await readJson(paths.pharmacies, PharmaciesSchema))?.pharmacies ?? [];
  const extendedFiles = new Map<string, ExtendedHours>();
  for (const file of await listJsonFiles(paths.extendedHours)) {
    const list = await readJson(join(paths.extendedHours, file), ExtendedHoursSchema);
    if (list) extendedFiles.set(file, list);
  }

  const context: FetchContext = {
    today,
    since,
    knownSources: new Set(
      [...days.values()].flatMap((day) =>
        day.groups.map((group) => `${group.source.url}|${group.source.uploadedAt}`),
      ),
    ),
    extendedFiles,
    log,
  };

  // --- Duty lists -------------------------------------------------------------------

  const duties = await pipeline.fetchDutyLists(context);
  const parseFailures: Warning[] = [...duties.failures];

  // Oldest uploads first, so a later re-upload of the same day and group wins.
  const fetched = [...duties.items].sort((a, b) =>
    a.source.uploadedAt.localeCompare(b.source.uploadedAt),
  );
  const known = [...previousPharmacies];
  for (const { list, source } of fetched) {
    const group: DutyGroup = DutyGroupSchema.parse({
      id: list.groupId,
      name: list.groupName,
      source,
      sections: list.sections.map((section) => ({
        kind: section.kind,
        heading: section.heading,
        hours: section.hours,
        extraHours: [...section.extraHours],
        notes: [...section.notes],
        entries: section.entries.map((entry) => ({
          pharmacyId: dutyEntryId(entry, known),
          ...entry,
        })),
      })),
    });
    const day = days.get(list.date) ?? {
      schemaVersion: SCHEMA_VERSION,
      date: list.date,
      groups: [],
    };
    const existing = day.groups.find((g) => g.id === group.id);
    if (existing && existing.source.uploadedAt > group.source.uploadedAt) continue;
    const groups = [...day.groups.filter((g) => g.id !== group.id), group];
    groups.sort((a, b) => a.id.localeCompare(b.id));
    days.set(list.date, { ...day, groups });
  }

  // --- Extended hours ---------------------------------------------------------------

  const extended = await pipeline.fetchExtendedHours(context);
  parseFailures.push(...extended.failures);
  for (const [file, list] of extended.items) extendedFiles.set(file, list);

  // Pharmacies from the duty lists, to match extended-hours entries against.
  const dutyPharmacies = new Map<string, { id: string; name: string; address: string }>();
  for (const day of [...days.values()].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const group of day.groups) {
      for (const section of group.sections) {
        for (const entry of section.entries)
          dutyPharmacies.set(entry.pharmacyId, { id: entry.pharmacyId, ...entry });
      }
    }
  }
  const dutyPharmacyList = [...dutyPharmacies.values()];

  // Drop lists whose period is over, and re-match every entry (the duty lists grow over time).
  for (const [file, list] of extendedFiles) {
    if (list.period.to < today) {
      extendedFiles.delete(file);
      continue;
    }
    const matched = matchExtendedEntries(list.entries, dutyPharmacyList);
    parseFailures.push(
      ...matched.warnings.map((w) => ({ ...w, message: `${file}: ${w.message}` })),
    );
    extendedFiles.set(file, {
      ...list,
      entries: list.entries.flatMap((entry, i) => {
        const pharmacyId = matched.ids[i];
        return pharmacyId ? [{ ...entry, pharmacyId }] : [];
      }),
    });
  }

  // --- Registry ---------------------------------------------------------------------

  const overture = new OvertureIndex(
    (await readJson(paths.overture, z.array(OverturePlaceSchema))) ?? [],
  );
  const geocoder = new Geocoder(
    (await readJson(paths.geocodeCache, GeocodeCacheSchema)) ?? {},
    !args.offline,
    city.bounds,
    pipeline.geocoding,
  );
  const overrides =
    (await readJson(paths.overrides, z.record(z.string(), z.custom<Override>()))) ?? {};

  const sortedDays = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  const extendedLists = [...extendedFiles.values()];
  let registry: Awaited<ReturnType<typeof buildRegistry>> | undefined;
  try {
    registry = await buildRegistry({
      days: sortedDays,
      extended: extendedLists.map((list) => ({ from: list.period.from, entries: list.entries })),
      overrides,
      overture,
      geocoder,
    });
  } finally {
    // Keep geocoding results even if a later step fails, to spare Nominatim.
    // After a complete run, drop entries no longer used (e.g. old query forms).
    const cache = registry === undefined ? geocoder.cache : geocoder.usedEntries();
    await writeIfChanged(paths.geocodeCache, toJson(sortKeys(cache)));
  }
  log(
    `registry: ${registry.pharmacies.length} pharmacies (${geocoder.requests} Nominatim requests)`,
  );
  {
    const counts = new Map<string, number>();
    for (const { location } of registry.pharmacies) {
      const key = location ? `${location.source}/${location.precision}` : 'unlocated';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    log(`  locations: ${[...counts].map(([key, n]) => `${key} ${n}`).join(', ')}`);
  }
  if (geocoder.stopped) {
    registry.warnings.push({
      code: 'geocoding-stopped',
      message: `${geocoder.stopped}; uncached addresses were left unlocated this run`,
    });
  }

  // --- Validate and write -----------------------------------------------------------

  const report = validate(
    { today, days: sortedDays, pharmacies: registry.pharmacies, extended: extendedLists },
    pipeline.rules,
  );
  const warnings = [...parseFailures, ...registry.warnings, ...report.warnings];
  for (const warning of warnings) log(`warning [${warning.code}] ${warning.message}`);
  for (const error of report.errors) console.error(`error [${error.code}] ${error.message}`);
  if (report.errors.length > 0) {
    console.error(
      `${city.id}: validation failed with ${report.errors.length} errors; nothing was written.`,
    );
    return false;
  }

  let changed = false;
  for (const day of sortedDays) {
    changed =
      (await writeIfChanged(join(paths.duties, `${day.date}.json`), toJson(day))) || changed;
  }
  changed =
    (await writeIfChanged(
      paths.pharmacies,
      toJson({ schemaVersion: SCHEMA_VERSION, pharmacies: registry.pharmacies }),
    )) || changed;
  for (const file of await listJsonFiles(paths.extendedHours)) {
    if (!extendedFiles.has(file)) {
      await removeFile(join(paths.extendedHours, file));
      changed = true;
    }
  }
  for (const [file, list] of extendedFiles) {
    changed = (await writeIfChanged(join(paths.extendedHours, file), toJson(list))) || changed;
  }

  const previousMeta = await readJson(paths.meta, MetaSchema);
  const meta: Meta = {
    schemaVersion: SCHEMA_VERSION,
    city: city.id,
    updatedAt: changed || !previousMeta ? new Date().toISOString() : previousMeta.updatedAt,
    duties: sortedDays.length
      ? { from: sortedDays[0]?.date ?? today, to: sortedDays.at(-1)?.date ?? today }
      : null,
    extendedHours: [...extendedFiles]
      .map(([file, list]) => ({ ...list.period, file: `extended-hours/${file}` }))
      .sort((a, b) => a.from.localeCompare(b.from)),
    sources: pipeline.sources,
  };
  MetaSchema.parse(meta);
  await writeIfChanged(paths.meta, toJson(meta));
  log(changed ? `${city.id}: data updated.` : `${city.id}: no changes.`);
  return true;
}

function sortKeys<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b))) as T;
}
