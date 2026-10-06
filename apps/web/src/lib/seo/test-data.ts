/** Real data for the tests: the files in data/<city>/, read from disk. */
import { readdirSync, readFileSync } from 'node:fs';
import type { DutyDay, ExtendedHours, Meta, Pharmacies } from '@pharmacy-skg/core';
import { buildSeoModel, earliestDutyDate } from './model.ts';
import type { SeoModel } from './model.ts';

/** A model of a city's real data as of `today` (fixed, so the tests do not depend on the clock). */
export function realModel(today = '2026-10-05', cityId = 'thessaloniki'): SeoModel {
  const root = new URL(`../../../../../data/${cityId}/`, import.meta.url);
  const readJson = <T>(path: string): T =>
    JSON.parse(readFileSync(new URL(path, root), 'utf8')) as T;
  const meta = readJson<Meta>('meta.json');
  const earliest = earliestDutyDate(today);
  const duties = new Map<string, DutyDay>();
  for (const name of readdirSync(new URL('duties/', root))) {
    const date = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(name)?.[1];
    if (date !== undefined && date >= earliest) {
      duties.set(date, readJson<DutyDay>(`duties/${name}`));
    }
  }
  return buildSeoModel({
    cityId,
    today,
    updatedAt: meta.updatedAt,
    dutySource: meta.sources[0]?.name ?? {},
    pharmacies: readJson<Pharmacies>('pharmacies.json').pharmacies,
    duties,
    extendedHours: meta.extendedHours.map((e) => readJson<ExtendedHours>(e.file)),
  });
}
