/**
 * The national files (src/lib/national.ts) read from data/: the index of every covered area and
 * each day's pharmacies on duty across all of them. Used by the build and by `astro dev`.
 */
import { readFile } from 'node:fs/promises';
import { CITIES } from '@pharmacy-skg/core';
import type { DutyDay, Meta, Pharmacy } from '@pharmacy-skg/core';
import {
  buildNationalDutyDay,
  buildNationalIndex,
  isNationalDutyDate,
  nationalDutyDateOf,
  nationalDutyPath,
} from '../src/lib/national.ts';
import type { NationalSource } from '../src/lib/national.ts';
import { DATA_ROOT, publishedMeta, readPharmacies } from './city-files.ts';

interface LoadedCity {
  readonly id: string;
  readonly meta: Meta;
  readonly pharmacies: readonly Pharmacy[];
}

async function loadCities(today: string): Promise<LoadedCity[]> {
  return Promise.all(
    CITIES.map(async ({ id }) => ({
      id,
      meta: (await publishedMeta(id, today)).meta,
      pharmacies: await readPharmacies(id),
    })),
  );
}

/** The index of every covered area, as the JSON the site publishes. */
export async function nationalIndexBody(today: string): Promise<string> {
  const loaded = await loadCities(today);
  const sources: NationalSource[] = [];
  for (const city of CITIES) {
    const found = loaded.find(({ id }) => id === city.id);
    if (found === undefined) continue;
    sources.push({ city, meta: found.meta, pharmacies: found.pharmacies.length });
  }
  return JSON.stringify(buildNationalIndex(sources));
}

/** The dates that get a national duty file: any area's published list, yesterday to two weeks ahead. */
function dutyDates(loaded: readonly LoadedCity[], today: string): string[] {
  const dates = new Set<string>();
  for (const { meta } of loaded) {
    for (const date of meta.duties?.dates ?? []) {
      if (isNationalDutyDate(date, today)) dates.add(date);
    }
  }
  return [...dates].sort();
}

async function dutyDayBody(date: string, loaded: readonly LoadedCity[]): Promise<string | null> {
  const sources = await Promise.all(
    loaded.map(async ({ id, meta, pharmacies }) => ({
      cityId: id,
      pharmacies,
      day:
        meta.duties?.dates?.includes(date) === true
          ? (JSON.parse(await readFile(`${DATA_ROOT}${id}/duties/${date}.json`, 'utf8')) as DutyDay)
          : undefined,
    })),
  );
  const built = buildNationalDutyDay(date, sources);
  return Object.keys(built.cities).length === 0 ? null : JSON.stringify(built);
}

/** Every national duty file of a build made on `today`: its path under /data/ and its JSON. */
export async function nationalDutyFiles(today: string): Promise<[path: string, body: string][]> {
  const loaded = await loadCities(today);
  const files: [string, string][] = [];
  for (const date of dutyDates(loaded, today)) {
    const body = await dutyDayBody(date, loaded);
    if (body !== null) files.push([nationalDutyPath(date), body]);
  }
  return files;
}

/**
 * One day's national duty file as JSON, or null when no area publishes a list for the date or
 * the path is not one (the dev server is asked with whatever the browser sends).
 */
export async function nationalDutyBody(path: string, today: string): Promise<string | null> {
  const date = nationalDutyDateOf(path);
  if (date === null || !isNationalDutyDate(date, today)) return null;
  return dutyDayBody(date, await loadCities(today));
}
