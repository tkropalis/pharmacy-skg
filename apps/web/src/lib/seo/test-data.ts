/** Real data for the tests: the files in data/thessaloniki/, read from disk. */
import { readdirSync, readFileSync } from 'node:fs';
import type { DutyDay, ExtendedHours, Meta, Pharmacies } from '@pharmacy-skg/core';
import { buildSeoModel, earliestDutyDate } from './model.ts';
import type { SeoModel } from './model.ts';

const ROOT = new URL('../../../../../data/thessaloniki/', import.meta.url);

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, ROOT), 'utf8')) as T;
}

/** A model of the real data as of `today` (fixed, so the tests do not depend on the clock). */
export function realModel(today = '2026-10-05'): SeoModel {
  const meta = readJson<Meta>('meta.json');
  const earliest = earliestDutyDate(today);
  const duties = new Map<string, DutyDay>();
  for (const name of readdirSync(new URL('duties/', ROOT))) {
    const date = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(name)?.[1];
    if (date !== undefined && date >= earliest) {
      duties.set(date, readJson<DutyDay>(`duties/${name}`));
    }
  }
  return buildSeoModel({
    cityId: 'thessaloniki',
    today,
    updatedAt: meta.updatedAt,
    pharmacies: readJson<Pharmacies>('pharmacies.json').pharmacies,
    duties,
    extendedHours: meta.extendedHours.map((e) => readJson<ExtendedHours>(e.file)),
  });
}
