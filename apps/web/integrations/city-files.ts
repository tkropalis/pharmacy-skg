import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CITIES } from '@pharmacy-skg/core';
import type { Meta, Pharmacies, Pharmacy } from '@pharmacy-skg/core';
import { selectDutyFiles, withPublishedDates } from './data-files.ts';

/** <repo>/data/, which lives outside apps/web (Vercel: "include files outside root"). */
export const DATA_ROOT = fileURLToPath(new URL('../../../data/', import.meta.url));

export const CITY_IDS = CITIES.map((city) => city.id);

/** A city's meta.json as published, with the dates of the duty files the build publishes. */
export async function publishedMeta(
  cityId: string,
  today: string,
): Promise<{ meta: Meta; duties: string[] }> {
  const source = `${DATA_ROOT}${cityId}/`;
  const meta = JSON.parse(await readFile(`${source}meta.json`, 'utf8')) as Meta;
  const duties = selectDutyFiles(await readdir(`${source}duties`), today);
  return { meta: withPublishedDates(meta, duties), duties };
}

/** A city's pharmacies.json. */
export async function readPharmacies(cityId: string): Promise<readonly Pharmacy[]> {
  const file = JSON.parse(await readFile(`${DATA_ROOT}${cityId}/pharmacies.json`, 'utf8'));
  return (file as Pharmacies).pharmacies;
}
