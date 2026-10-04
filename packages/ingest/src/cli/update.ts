/**
 * Fetches the official lists, rebuilds data/<city>/, validates it and writes
 * only what changed. Exits non-zero, writing nothing, if validation fails.
 *
 *   node src/cli/update.ts [--since YYYY-MM-DD] [--offline]
 *
 * --since   fetch duty PDFs uploaded on or after this date (default: 3 days ago)
 * --offline use only cached geocoding results
 */
import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { THESSALONIKI } from '@pharmacy-skg/core';
import { parseDutyList, type DutyList } from '../fsth/parse.ts';
import { extractTextItems } from '../pdf.ts';
import { parseExtendedHours } from '../pkm/parse.ts';
import { readFirstSheet } from '../pkm/xlsx.ts';
import {
  buildRegistry,
  dutyEntryId,
  matchExtendedEntry,
  type Override,
  type Warning,
} from '../registry/build.ts';
import { GeocodeCacheSchema, Geocoder } from '../registry/geocode.ts';
import { pharmacyId } from '../registry/names.ts';
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
import { getBytes } from '../sources/http.ts';
import { listExtendedHours } from '../sources/pkm.ts';
import { listDutyPdfs, type DutyPdfLink } from '../sources/thessguide.ts';
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
import { z } from 'zod';

const { values: args } = parseArgs({
  options: {
    since: { type: 'string' },
    offline: { type: 'boolean', default: false },
  },
});

const city = THESSALONIKI.id;
const paths = cityPaths(city);
const today = cityToday();
const since = args.since ?? addDays(today, -3);
const log = (message: string) => console.log(message);

const SOURCES: Meta['sources'] = [
  {
    id: 'fsth',
    name: {
      el: 'Φαρμακευτικός Σύλλογος Θεσσαλονίκης',
      en: 'Pharmaceutical Association of Thessaloniki',
    },
    url: 'https://fsth.gr/',
    note: 'Duty lists, read from the copies re-hosted by thess.guide',
  },
  {
    id: 'pkm',
    name: { el: 'Περιφέρεια Κεντρικής Μακεδονίας', en: 'Region of Central Macedonia' },
    url: 'https://www.pkm.gov.gr/',
    note: 'Extended opening hours',
  },
  {
    id: 'overture',
    name: { el: 'Overture Maps Foundation', en: 'Overture Maps Foundation' },
    url: 'https://overturemaps.org/',
    note: 'Pharmacy locations, CDLA-Permissive-2.0',
  },
  {
    id: 'osm',
    name: { el: 'Συντελεστές OpenStreetMap', en: 'OpenStreetMap contributors' },
    url: 'https://www.openstreetmap.org/copyright',
    note: 'Geocoding via Nominatim, ODbL',
  },
];

// --- Load what is already published -------------------------------------------------

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

// --- Duty lists ---------------------------------------------------------------------

const knownSources = new Set(
  [...days.values()].flatMap((day) =>
    day.groups.map((group) => `${group.source.url}|${group.source.uploadedAt}`),
  ),
);
const links = await listDutyPdfs(since);
log(`thess.guide: ${links.length} duty PDFs uploaded since ${since}`);

const parsed: { link: DutyPdfLink; list: DutyList }[] = [];
const parseFailures: Warning[] = [];
for (const link of links) {
  if (knownSources.has(`${link.url}|${link.uploadedAt}`)) continue;
  let list: DutyList;
  try {
    list = parseDutyList(await extractTextItems(await getBytes(link.url)));
  } catch (error) {
    // Report and carry on: validation fails the run if this leaves today's or
    // tomorrow's lists incomplete.
    parseFailures.push({ code: 'unreadable-pdf', message: `${link.url}: ${String(error)}` });
    continue;
  }
  if (list.date !== link.date) {
    log(`  note: ${link.url} is named ${link.date} but lists ${list.date}`);
  }
  parsed.push({ link, list });
}
log(`  parsed ${parsed.length} new or updated PDFs`);

// Oldest uploads first, so a later re-upload of the same day and group wins.
parsed.sort((a, b) => a.link.uploadedAt.localeCompare(b.link.uploadedAt));
const known = [...previousPharmacies];
for (const { link, list } of parsed) {
  const group: DutyGroup = DutyGroupSchema.parse({
    id: list.groupId,
    name: list.groupName,
    source: { url: link.url, uploadedAt: link.uploadedAt },
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
  const day = days.get(list.date) ?? { schemaVersion: SCHEMA_VERSION, date: list.date, groups: [] };
  const existing = day.groups.find((g) => g.id === group.id);
  if (existing && existing.source.uploadedAt > group.source.uploadedAt) continue;
  const groups = [...day.groups.filter((g) => g.id !== group.id), group];
  groups.sort((a, b) => a.id.localeCompare(b.id));
  days.set(list.date, { ...day, groups });
}

// --- Extended hours -----------------------------------------------------------------

// The latest announcement per period wins (ΠΚΜ re-publishes corrections).
const announcements = new Map<string, Awaited<ReturnType<typeof listExtendedHours>>[number]>();
for (const link of await listExtendedHours()) {
  if (link.period.to < today) continue;
  const key = `${link.period.from}_${link.period.to}`;
  const current = announcements.get(key);
  if (!current || current.publishedAt < link.publishedAt) announcements.set(key, link);
}
log(`ΠΚΜ: ${announcements.size} current extended-hours lists`);

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

for (const [key, link] of announcements) {
  const file = `${key}.json`;
  const existing = extendedFiles.get(file);
  if (
    existing &&
    existing.source.url === link.fileUrl &&
    existing.source.uploadedAt === link.publishedAt
  ) {
    continue;
  }
  const { entries } = parseExtendedHours(readFirstSheet(await getBytes(link.fileUrl)));
  extendedFiles.set(
    file,
    ExtendedHoursSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      period: link.period,
      title: link.title,
      announcementUrl: link.announcementUrl,
      source: { url: link.fileUrl, uploadedAt: link.publishedAt },
      entries: entries.map((entry) => ({ pharmacyId: '', ...entry })),
    }),
  );
  log(`  parsed ${file}: ${entries.length} entries`);
}
// Drop lists whose period is over, and re-match every entry (the duty lists grow over time).
for (const [file, list] of extendedFiles) {
  if (list.period.to < today) {
    extendedFiles.delete(file);
    continue;
  }
  extendedFiles.set(file, {
    ...list,
    entries: list.entries.map((entry) => ({
      ...entry,
      pharmacyId:
        matchExtendedEntry(entry, dutyPharmacyList) ?? pharmacyId(null, entry.name, entry.area),
    })),
  });
}

// --- Registry -----------------------------------------------------------------------

const overture = new OvertureIndex(
  (await readJson(paths.overture, z.array(OverturePlaceSchema))) ?? [],
);
const geocoder = new Geocoder(
  (await readJson(paths.geocodeCache, GeocodeCacheSchema)) ?? {},
  !args.offline,
);
const overrides =
  (await readJson(paths.overrides, z.record(z.string(), z.custom<Override>()))) ?? {};

const sortedDays = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
const extendedLists = [...extendedFiles.values()];
let registry: Awaited<ReturnType<typeof buildRegistry>>;
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
  await writeIfChanged(paths.geocodeCache, toJson(sortKeys(geocoder.cache)));
}
log(`registry: ${registry.pharmacies.length} pharmacies (${geocoder.requests} Nominatim requests)`);
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

// --- Validate and write -------------------------------------------------------------

const report = validate({
  today,
  days: sortedDays,
  pharmacies: registry.pharmacies,
  extended: extendedLists,
});
const warnings = [...parseFailures, ...registry.warnings, ...report.warnings];
for (const warning of warnings) log(`warning [${warning.code}] ${warning.message}`);
for (const error of report.errors) console.error(`error [${error.code}] ${error.message}`);
if (report.errors.length > 0) {
  console.error(`Validation failed with ${report.errors.length} errors; nothing was written.`);
  process.exit(1);
}

let changed = false;
for (const day of sortedDays) {
  changed = (await writeIfChanged(join(paths.duties, `${day.date}.json`), toJson(day))) || changed;
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
  city,
  updatedAt: changed || !previousMeta ? new Date().toISOString() : previousMeta.updatedAt,
  duties: sortedDays.length
    ? { from: sortedDays[0]?.date ?? today, to: sortedDays.at(-1)?.date ?? today }
    : null,
  extendedHours: [...extendedFiles]
    .map(([file, list]) => ({ ...list.period, file: `extended-hours/${file}` }))
    .sort((a, b) => a.from.localeCompare(b.from)),
  sources: SOURCES,
};
MetaSchema.parse(meta);
await writeIfChanged(paths.meta, toJson(meta));
log(changed ? 'Data updated.' : 'No changes.');

function sortKeys<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b))) as T;
}
