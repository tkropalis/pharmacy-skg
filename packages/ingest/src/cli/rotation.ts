/**
 * Reconstructs the duty rotation from the stored lists, for internal analysis
 * only. Decision D11: forecasts are not published unless ΦΣΘ agrees, so the
 * output goes to .cache/ (git-ignored) and nothing in data/ depends on it.
 *
 * For each metro section kind, pharmacies that are always on duty together
 * form a "card"; the report lists each card's dates and the gaps between them.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { THESSALONIKI } from '@pharmacy-skg/core';
import { DutyDaySchema } from '../schema.ts';
import { cityPaths, listJsonFiles, readJson, REPO_ROOT, toJson } from '../store.ts';

const paths = cityPaths(THESSALONIKI.id);
const cards = new Map<string, { kind: string; members: string[]; dates: string[] }>();
for (const file of await listJsonFiles(paths.duties)) {
  const day = await readJson(join(paths.duties, file), DutyDaySchema);
  const metro = day?.groups.find((group) => group.id === 'metro');
  if (!day || !metro) continue;
  for (const section of metro.sections) {
    const members = section.entries.map((entry) => entry.pharmacyId).sort();
    const key = `${section.kind}|${members.join(',')}`;
    const card = cards.get(key) ?? { kind: section.kind, members, dates: [] };
    card.dates.push(day.date);
    cards.set(key, card);
  }
}

const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;
const report = [...cards.values()]
  .map((card) => ({
    ...card,
    gaps: card.dates.slice(1).map((date, i) => days(card.dates[i] ?? date, date)),
  }))
  .sort(
    (a, b) => a.kind.localeCompare(b.kind) || (a.dates[0] ?? '').localeCompare(b.dates[0] ?? ''),
  );

const out = join(REPO_ROOT, '.cache', 'rotation.json');
await mkdir(join(REPO_ROOT, '.cache'), { recursive: true });
await writeFile(out, toJson(report));
const repeating = report.filter((card) => card.dates.length > 1);
console.log(
  `${report.length} distinct metro duty sets, ${repeating.length} seen more than once → ${out}`,
);
