/**
 * Rebuilds data/medicines/medicines.json from the Ministry of Health's price bulletins and ΕΟΦ's
 * limited-availability list, validates it and writes it only if it changed. Exits non-zero,
 * writing nothing, if validation fails.
 *
 *   node src/cli/medicines.ts [--force]
 *
 * The bulletins and the list are downloaded only when the set of them changed since the last
 * run (or with --force). Each article's attachments are cached in data/medicines/inputs/, as
 * published articles rarely change; one whose cached table is gone is read again.
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
/** Articles whose attachments are read again even though they are cached. */
const reread = new Set<number>();

async function plan(kind: PriceBulletin['kind'], listing: string, title: RegExp): Promise<Plan> {
  const articles = await listArticles(listing, (found) => findBase(found, title) !== null);
  const base = findBase(articles, title);
  if (!base) throw new Error(`No yearly revision found in ${listing}`);
  const files = new Map<number, readonly MohFile[]>();
  for (const article of articles) {
    if (article.id < base.id) continue;
    const cached = fileCache[article.id];
    // An article listed without tables may get them later; ask again for those.
    const known =
      cached?.some(isTable) && !reread.has(article.id) ? cached : await articleFiles(article);
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

/** Every table to apply, in order, with the article it is attached to. */
async function planBulletins(): Promise<{ articleId: number; bulletin: PriceBulletin }[]> {
  const plans = {
    prescription: await plan('prescription', PRESCRIPTION_LISTING, PRESCRIPTION_BASE),
    otc: await plan('otc', OTC_LISTING, OTC_BASE),
  };
  await writeIfChanged(
    paths.articleFiles,
    toJson(Object.fromEntries(Object.entries(fileCache).sort(([a], [b]) => Number(a) - Number(b)))),
  );
  return (['prescription', 'otc'] as const).flatMap((kind) =>
    plans[kind].tables.map(({ article, file }) => ({
      articleId: article.id,
      bulletin: bulletinOf(kind, article, file),
    })),
  );
}

/** An .xlsx file is a zip archive; a removed attachment comes back as an HTML page instead. */
const isZip = (bytes: Uint8Array) =>
  bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

let planned = await planBulletins();
let bulletins = planned.map(({ bulletin }) => bulletin);
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

// The ministry sometimes re-issues an article with new attachments ("Ο.Ε.", a corrected
// version), and the cached file no longer exists. Read such an article's attachments again, once.
const downloads = new Map<string, Uint8Array>();
for (let attempt = 0; ; attempt++) {
  const stale = new Set<number>();
  for (const { articleId, bulletin } of planned) {
    const bytes = downloads.get(bulletin.fileUrl) ?? (await getBytes(bulletin.fileUrl));
    if (isZip(bytes)) downloads.set(bulletin.fileUrl, bytes);
    else stale.add(articleId);
  }
  if (stale.size === 0) break;
  if (attempt > 0) throw new Error(`No .xlsx table could be read from articles ${[...stale]}`);
  for (const id of stale) {
    log(`  note: ${id} no longer has its cached table; reading its attachments again`);
    reread.add(id);
  }
  planned = await planBulletins();
  bulletins = planned.map(({ bulletin }) => bulletin);
}

const tables: PriceTable[] = [];
const rowWarnings: string[] = [];
for (const bulletin of bulletins) {
  const bytes = downloads.get(bulletin.fileUrl);
  if (!bytes) throw new Error(`${bulletin.fileUrl} was not downloaded`);
  const { rows, warnings } = parsePriceTable(readFirstSheet(bytes));
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
