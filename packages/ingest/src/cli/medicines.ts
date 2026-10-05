/**
 * Rebuilds data/medicines/medicines.json from the Ministry of Health's price bulletins and ΕΟΦ's
 * limited-availability list, validates it and writes it only if it changed. Exits non-zero,
 * writing nothing, if validation fails.
 *
 *   node src/cli/medicines.ts [--force]
 *
 * The bulletins and the list are downloaded only when the set of them changed since the last
 * run (or with --force). Each article's attachments are cached in data/medicines/inputs/, as
 * published articles do not change.
 */
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import type { PriceBulletin } from '@pharmacy-skg/core';
import { assembleMedicines, type PriceTable } from '../medicines/assemble.ts';
import {
  OTC_BASE,
  PRESCRIPTION_BASE,
  findBase,
  isTable,
  planTables,
  type Plan,
} from '../medicines/plan.ts';
import { parsePriceTable } from '../medicines/price-table.ts';
import { parseShortageList, type ShortageEntry } from '../medicines/shortages.ts';
import { validateMedicines } from '../medicines/validate.ts';
import { extractTextItems } from '../pdf.ts';
import { MedicinesSchema, SCHEMA_VERSION, type Medicines } from '../schema.ts';
import { findShortageList } from '../sources/eof.ts';
import { getBytes } from '../sources/http.ts';
import {
  OTC_LISTING,
  PRESCRIPTION_LISTING,
  articleFiles,
  listArticles,
  type MohArticleLink,
  type MohFile,
} from '../sources/moh.ts';
import { medicinesPaths, readJson, toJson, writeIfChanged } from '../store.ts';
import { readFirstSheet } from '../xlsx.ts';
import { z } from 'zod';

const { values: args } = parseArgs({
  options: { force: { type: 'boolean', default: false } },
});
const log = (message: string) => console.log(message);
const paths = medicinesPaths();

const FileCacheSchema = z.record(
  z.string(),
  z.array(z.object({ id: z.number(), name: z.string(), url: z.string() })),
);
const fileCache = (await readJson(paths.articleFiles, FileCacheSchema)) ?? {};
const previous = await readJson(paths.medicines, MedicinesSchema);

async function plan(kind: PriceBulletin['kind'], listing: string, title: RegExp): Promise<Plan> {
  const articles = await listArticles(listing, (found) => findBase(found, title) !== null);
  const base = findBase(articles, title);
  if (!base) throw new Error(`No yearly revision found in ${listing}`);
  const files = new Map<number, readonly MohFile[]>();
  for (const article of articles) {
    if (article.id < base.id) continue;
    const cached = fileCache[article.id];
    // An article listed without tables may get them later; ask again for those.
    const known = cached?.some(isTable) ? cached : await articleFiles(article);
    fileCache[article.id] = [...known];
    files.set(article.id, known);
  }
  const result = planTables(base, articles, (article) => files.get(article.id) ?? []);
  log(`${kind}: base ${base.id} (${base.date}), ${result.tables.length} tables`);
  for (const article of result.withoutTable) {
    log(`  note: ${article.id} (${article.date}) has no .xlsx table and is not applied`);
  }
  return result;
}

function bulletinOf(
  kind: PriceBulletin['kind'],
  article: MohArticleLink,
  file: MohFile,
): PriceBulletin {
  return {
    id: `${article.id}/${file.id}`,
    kind,
    title: article.title,
    date: article.date,
    articleUrl: article.url,
    fileName: file.name,
    fileUrl: file.url,
  };
}

const plans = {
  prescription: await plan('prescription', PRESCRIPTION_LISTING, PRESCRIPTION_BASE),
  otc: await plan('otc', OTC_LISTING, OTC_BASE),
};
await writeIfChanged(
  paths.articleFiles,
  toJson(Object.fromEntries(Object.entries(fileCache).sort(([a], [b]) => Number(a) - Number(b)))),
);
const bulletins = (['prescription', 'otc'] as const).flatMap((kind) =>
  plans[kind].tables.map(({ article, file }) => bulletinOf(kind, article, file)),
);
const shortageLink = await findShortageList();
log(shortageLink ? `ΕΟΦ: ${shortageLink.title}` : 'ΕΟΦ: no limited-availability list found');

const unchanged =
  previous !== undefined &&
  JSON.stringify(previous.bulletins) === JSON.stringify(bulletins) &&
  previous.shortageList?.fileUrl === shortageLink?.fileUrl;
if (unchanged && !args.force) {
  log('No new bulletins or shortage list. No changes.');
  process.exit(0);
}

const tables: PriceTable[] = [];
const rowWarnings: string[] = [];
for (const bulletin of bulletins) {
  const { rows, warnings } = parsePriceTable(readFirstSheet(await getBytes(bulletin.fileUrl)));
  rowWarnings.push(...warnings.map((w) => `${bulletin.id}: ${w.message}`));
  tables.push({ bulletin, rows });
}
let shortages: ShortageEntry[] = [];
if (shortageLink) {
  shortages = parseShortageList(await extractTextItems(await getBytes(shortageLink.fileUrl)));
}

const assembled = assembleMedicines(tables, shortages);
const file: Medicines = {
  schemaVersion: SCHEMA_VERSION,
  updatedAt: previous?.updatedAt ?? new Date().toISOString(),
  bulletins,
  shortageList: shortageLink,
  medicines: assembled.medicines,
};
const report = validateMedicines(file, shortages.length);
for (const message of rowWarnings) log(`warning [price-row-skipped] ${message}`);
for (const w of [...assembled.warnings, ...report.warnings])
  log(`warning [${w.code}] ${w.message}`);
log(
  `${assembled.medicines.length} packs (${assembled.medicines.filter((m) => m.otc).length} non-prescription), ` +
    `${shortages.length} on the shortage list (${assembled.unmatchedShortages} without a price)`,
);
for (const e of report.errors) console.error(`error [${e.code}] ${e.message}`);
if (report.errors.length > 0) {
  console.error(`Validation failed with ${report.errors.length} errors; nothing was written.`);
  process.exit(1);
}

// updatedAt moves only when what is published changed.
const onDisk = await readFile(paths.medicines, 'utf8').catch(() => null);
const changed = previous === undefined || onDisk !== medicinesJson(file);
if (changed) {
  await writeIfChanged(
    paths.medicines,
    medicinesJson({ ...file, updatedAt: new Date().toISOString() }),
  );
}
log(changed ? 'Medicines updated.' : 'No changes.');

/** Pretty JSON, but one line per medicine: about 9,000 of them. */
function medicinesJson(value: Medicines): string {
  const { medicines, ...rest } = value;
  const head = JSON.stringify({ ...rest, medicines: [] }, null, 2);
  const lines = medicines.map((m) => `    ${JSON.stringify(m)}`).join(',\n');
  return `${head.replace(/"medicines": \[\]\n\}$/, `"medicines": [\n${lines}\n  ]\n}`)}\n`;
}
