/**
 * Updates one city's data/<city>/ from its pipeline's fetchers (cities/pipeline.ts): merges what
 * the sources published into what is stored, validates the result and writes only what changed.
 * Everything it touches comes in through its options (the pipeline with its fetchers, the data
 * paths, today's date, a logger), so a test can run it on a temporary directory with fake
 * fetchers; cli/update.ts supplies the real ones.
 */
import { join } from 'node:path';
import type { Bounds } from '@pharmacy-skg/core';
import { z } from 'zod';
import {
  locationKey,
  type CityPipeline,
  type FetchContext,
  type ListedLocation,
  type Roster,
} from '../cities/pipeline.ts';
import { addDays } from '../time.ts';
import {
  buildRegistry,
  dutyEntryId,
  matchExtendedEntries,
  type Override,
  type Warning,
} from '../registry/build.ts';
import { describeError } from '../sources/http.ts';
import { GeocodeCacheSchema, Geocoder } from '../registry/geocode.ts';
import { StreetIndex, StreetsFileSchema } from '../registry/streets.ts';
import { fetchStreetNames } from '../sources/overpass.ts';
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
  listJsonFiles,
  readJson,
  removeFile,
  toJson,
  writeIfChanged,
  type CityPaths,
} from '../store.ts';
import { implausibleCount, validate } from '../validate.ts';
import type { Logger } from './logger.ts';

const ListedLocationsSchema = z.record(
  z.string(),
  z.object({ lat: z.number(), lon: z.number(), ref: z.string() }),
);

const point = z.object({ lat: z.number(), lon: z.number() });
const RosterSchema = z.object({
  sweptAt: z.string(),
  readThrough: z.string(),
  entries: z.array(
    z.object({
      groupId: z.string(),
      date: z.string(),
      locality: z.string(),
      name: z.string(),
      address: z.string(),
      phone: z.string(),
      location: point.nullable(),
    }),
  ),
});

/** About 30 km: far enough for a village past the area's known pharmacies, not for a namesake. */
const LISTED_MARGIN_DEGREES = 0.3;

function nearBounds(
  [west, south, east, north]: Bounds,
  { lat, lon }: { lat: number; lon: number },
  margin: number,
): boolean {
  return (
    lon >= west - margin && lon <= east + margin && lat >= south - margin && lat <= north + margin
  );
}

export interface UpdateCityOptions {
  readonly pipeline: CityPipeline;
  /** Where the city's data is read and written (store.ts, cityPaths). */
  readonly paths: CityPaths;
  /** Today's date in the city's time zone (YYYY-MM-DD). */
  readonly today: string;
  /** Fetch duty lists published on or after this date. */
  readonly since: string;
  /** Use only cached geocoding results. */
  readonly offline: boolean;
  readonly logger: Logger;
  /** The time that goes into meta.json. */
  readonly now?: () => Date;
  /** Reads an area's street names (sources/overpass.ts); a test replaces it. */
  readonly fetchStreets?: (bounds: Bounds) => Promise<string[]>;
}

/**
 * Updates one city's data. Returns false, writing nothing but the geocoding cache, if it fails
 * validation; and false, having written what it read, if nothing covers today or the extended
 * hours could not be read. Anything else a fetcher throws is the caller's to report.
 */
export async function updateCity({
  pipeline,
  paths,
  today,
  since,
  offline,
  logger,
  now = () => new Date(),
  fetchStreets = (bounds) => fetchStreetNames(bounds),
}: UpdateCityOptions): Promise<boolean> {
  const { city } = pipeline;
  const log = (message: string) => logger.log(message);

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
  const listed = new Map<string, ListedLocation>(
    Object.entries((await readJson(paths.listedLocations, ListedLocationsSchema)) ?? {}),
  );

  const context: FetchContext = {
    today,
    since,
    knownSources: new Set(
      [...days.values()].flatMap((day) =>
        day.groups.map((group) => `${group.source.url}|${group.source.uploadedAt}`),
      ),
    ),
    extendedFiles,
    listedLocations: listed,
    roster: ((await readJson(paths.roster, RosterSchema)) as Roster | undefined) ?? null,
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
    // A list whose counts look wrong (a misread or a changed layout) is not published; the day
    // keeps any earlier upload, and the others still go through.
    const implausible = implausibleCount(
      { id: list.groupId, sections: list.sections },
      pipeline.rules,
    );
    if (implausible) {
      parseFailures.push({
        code: 'count',
        message: `${list.date} ${implausible}: not published (${source.url})`,
      });
      continue;
    }
    const group: DutyGroup = DutyGroupSchema.parse({
      id: list.groupId,
      name: list.groupName,
      source,
      sections: list.sections.map((section) => ({
        kind: section.kind,
        heading: section.heading,
        hours: section.hours,
        ...(section.onCall === true ? { onCall: true } : {}),
        extraHours: [...section.extraHours],
        notes: [...section.notes],
        entries: section.entries.map((entry) => {
          const pharmacyId = dutyEntryId(entry, known);
          const location = duties.locations?.get(locationKey(entry));
          if (location) listed.set(pharmacyId, location);
          return { pharmacyId, ...entry };
        }),
      })),
    });
    const day = days.get(list.date) ?? {
      schemaVersion: SCHEMA_VERSION,
      date: list.date,
      groups: [],
    };
    const existing = day.groups.find((g) => g.id === group.id);
    if (existing && existing.source.uploadedAt > group.source.uploadedAt) continue;
    // A source that shows only today's list, left unchanged by its association, shows
    // yesterday's under today's date. A list identical to the day before's is not today's.
    if (pipeline.rules.todayOnly === true) {
      const before = days.get(addDays(list.date, -1))?.groups.find((g) => g.id === group.id);
      if (before && JSON.stringify(before.sections) === JSON.stringify(group.sections)) {
        parseFailures.push({
          code: 'repeated-list',
          message: `${list.date} ${group.id}: the same list as ${addDays(list.date, -1)}, not taken for today's (${source.url})`,
        });
        continue;
      }
    }
    // A page read afresh on every run (ITeQ) gives the same list most times: keep the stored
    // one, and its time, so nothing is written. (A re-uploaded PDF has its own URL and still
    // replaces the old one.)
    if (
      existing &&
      existing.source.url === group.source.url &&
      existing.name === group.name &&
      JSON.stringify(existing.sections) === JSON.stringify(group.sections)
    ) {
      continue;
    }
    const groups = [...day.groups.filter((g) => g.id !== group.id), group];
    groups.sort((a, b) => a.id.localeCompare(b.id));
    days.set(list.date, { ...day, groups });
  }

  // The roster's pharmacies get their ids as the lists' do, and its coordinates count as theirs.
  const dutySite = pipeline.sources.find((s) => s.id === pipeline.sourceIds.duty)?.url ?? '';
  const roster = (duties.roster?.entries ?? context.roster?.entries ?? []).map((entry) => {
    const pharmacyId = dutyEntryId(entry, known);
    if (entry.location && !listed.has(pharmacyId)) {
      listed.set(pharmacyId, { ...entry.location, ref: dutySite });
    }
    return { ...entry, pharmacyId };
  });

  // --- Extended hours ---------------------------------------------------------------

  // With this run's roster: the first run reads it before any is stored. A site that cannot be
  // read keeps the stored lists and must not hold back the duty lists: fsa.gr, out of reach
  // from 22 to 28 Oct 2026, kept Attica's duties from being updated for a week. The run fails.
  let extendedRead = true;
  // The duty source's own page may carry them (Achaia's), read with the lists.
  parseFailures.push(...(duties.extendedHours?.failures ?? []));
  for (const [file, list] of duties.extendedHours?.items ?? []) extendedFiles.set(file, list);
  try {
    const extended = await pipeline.fetchExtendedHours({
      ...context,
      roster: duties.roster ?? context.roster,
    });
    parseFailures.push(...extended.failures);
    for (const [file, list] of extended.items) extendedFiles.set(file, list);
  } catch (error) {
    extendedRead = false;
    logger.error(
      `error [extended-hours] ${city.id}: not read, the stored lists were kept: ${describeError(error)}`,
    );
  }

  // Pharmacies from the duty lists, to match extended-hours entries against.
  const dutyPharmacies = new Map<string, { id: string; name: string; address: string }>();
  for (const entry of roster)
    dutyPharmacies.set(entry.pharmacyId, { id: entry.pharmacyId, ...entry });
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
  // Street names with their accents, for a list that prints capitals without them: read from
  // OpenStreetMap once, then kept (delete the file to read them again).
  let streets: StreetIndex | undefined;
  if (pipeline.geocoding.restoreStreets) {
    let file = await readJson(paths.streets, StreetsFileSchema);
    if (!file && !offline) {
      try {
        const names = await fetchStreets(city.bounds);
        file = {
          schemaVersion: 1,
          source: 'OpenStreetMap, via Overpass (overpass.kumi.systems)',
          fetchedAt: now().toISOString(),
          names,
        };
        await writeIfChanged(paths.streets, toJson(file));
        log(`streets: ${names.length} names read from OpenStreetMap`);
      } catch (error) {
        logger.error(
          `error [streets] ${city.id}: not read, addresses stay as printed: ${describeError(error)}`,
        );
      }
    }
    if (file) streets = new StreetIndex(file.names);
  }
  const geocoder = new Geocoder(
    (await readJson(paths.geocodeCache, GeocodeCacheSchema)) ?? {},
    !offline,
    city.bounds,
    streets ? { ...pipeline.geocoding, streets } : pipeline.geocoding,
  );
  const overrides =
    (await readJson(paths.overrides, z.record(z.string(), z.custom<Override>()))) ?? {};

  const sortedDays = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  const extendedLists = [...extendedFiles.values()];

  // A list's coordinates are believed only near the area: a site sometimes places a pharmacy
  // at another place of the same name (Νέα Ιωνία near Volos put in Athens). Such a pharmacy is
  // placed like any other, by its address.
  const nearby = new Map<string, ListedLocation>();
  for (const [id, location] of listed) {
    if (nearBounds(city.bounds, location, LISTED_MARGIN_DEGREES)) nearby.set(id, location);
    else
      parseFailures.push({
        code: 'listed-location-far',
        message: `${id}: ${location.lat}, ${location.lon} is far from ${city.id} (${location.ref})`,
      });
  }
  let registry: Awaited<ReturnType<typeof buildRegistry>> | undefined;
  try {
    registry = await buildRegistry({
      days: sortedDays,
      extended: extendedLists.map((list) => ({ from: list.period.from, entries: list.entries })),
      roster,
      overrides,
      listed: nearby,
      overture,
      geocoder,
      sourceIds: pipeline.sourceIds,
    });
  } finally {
    // Keep geocoding results even if a later step fails, to spare Nominatim.
    // After a complete run, drop entries no longer used (e.g. old query forms).
    const cache = registry === undefined ? geocoder.cache : geocoder.usedEntries();
    await writeIfChanged(paths.geocodeCache, toJson(sortKeys(cache)));
    // Coordinates read from the lists are kept the same way (each details page is read once).
    if (listed.size > 0) {
      await writeIfChanged(paths.listedLocations, toJson(sortKeys(Object.fromEntries(listed))));
    }
    if (duties.roster) await writeIfChanged(paths.roster, toJson(duties.roster));
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
  for (const error of report.errors) logger.error(`error [${error.code}] ${error.message}`);
  if (report.errors.length > 0) {
    logger.error(
      `${city.id}: validation failed with ${report.errors.length} errors; nothing was written.`,
    );
    return false;
  }
  // The source has published nothing for today: write what there is, but do not count the data as
  // checked, so the app's stale-data banner shows once it is old and the run fails.
  const coversToday = sortedDays.some((day) => day.date === today);
  if (!coversToday) logger.error(`error [coverage] ${city.id}: no duty list for today, ${today}`);

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
  const stamp = now().toISOString();
  const meta: Meta = {
    schemaVersion: SCHEMA_VERSION,
    city: city.id,
    updatedAt: changed || !previousMeta ? stamp : previousMeta.updatedAt,
    // A run that gets here read the sources and found them valid: the data is current even when
    // an association has published nothing new for days (the stale banner reads this). Not when
    // nothing covers today, which is a source gone quiet rather than a quiet week.
    checkedAt: coversToday ? stamp : (previousMeta?.checkedAt ?? previousMeta?.updatedAt ?? stamp),
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
  return coversToday && extendedRead;
}

function sortKeys<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b))) as T;
}
