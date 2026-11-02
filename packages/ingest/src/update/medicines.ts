/**
 * Rebuilds data/medicines/medicines.json from the Ministry of Health's price bulletins and ΕΟΦ's
 * limited-availability list, validates it and writes it only if it changed. Fails, writing
 * nothing, if validation fails. When the ministry's site cannot be read, the stored prices stay,
 * ΕΟΦ's list is still applied to them, and it fails.
 *
 * The bulletins and the list are downloaded only when the set of them changed since the last
 * run (or with `force`). Each article's attachments are cached in data/medicines/inputs/, as
 * published articles rarely change; one whose cached table is gone is read again.
 *
 * The sites come in through `sources`, the files through `paths`, so a test can run it on a
 * temporary directory with fake sources; cli/medicines.ts supplies the real ones.
 */
import { readFile } from 'node:fs/promises';
import type { PriceBulletin } from '@pharmacy-skg/core';
import { z } from 'zod';
import { assembleMedicines, attachShortages, type PriceTable } from '../medicines/assemble.ts';
import {
  OTC_BASE,
  PRESCRIPTION_BASE,
  findBase,
  isTable,
  planTables,
  type Plan,
} from '../medicines/plan.ts';
import { parsePriceTable } from '../medicines/price-table.ts';
import type { ShortageEntry } from '../medicines/shortages.ts';
import { validateMedicines } from '../medicines/validate.ts';
import { MedicinesSchema, SCHEMA_VERSION, type Medicines } from '../schema.ts';
import type { ShortageListLink } from '../sources/eof.ts';
import { describeError } from '../sources/http.ts';
import {
  OTC_LISTING,
  PRESCRIPTION_LISTING,
  type MohArticleLink,
  type MohFile,
} from '../sources/moh.ts';
import { readJson, toJson, writeIfChanged, type MedicinesPaths } from '../store.ts';
import { readFirstSheet } from '../xlsx.ts';
import type { Logger } from './logger.ts';

/** What the command reads from the sites; the live ones are in cli/medicines.ts. */
export interface MedicinesSources {
  /** The ministry's listing pages, newest first, until `enough` says the articles suffice. */
  readonly listArticles: (
    listingUrl: string,
    enough: (articles: readonly MohArticleLink[]) => boolean,
  ) => Promise<MohArticleLink[]>;
  readonly articleFiles: (article: MohArticleLink) => Promise<MohFile[]>;
  /** The newest ΕΟΦ limited-availability list, or null. */
  readonly findShortageList: () => Promise<ShortageListLink | null>;
  /** The packs on that list. */
  readonly readShortageList: (link: ShortageListLink) => Promise<ShortageEntry[]>;
  /** A bulletin's table. */
  readonly getBytes: (url: string) => Promise<Uint8Array>;
}

export interface UpdateMedicinesOptions {
  readonly sources: MedicinesSources;
  readonly paths: MedicinesPaths;
  /** Rebuild even when no bulletin or list changed. */
  readonly force: boolean;
  readonly logger: Logger;
  /** The time that goes into medicines.json when what is published changed. */
  readonly now?: () => Date;
}

const FileCacheSchema = z.record(
  z.string(),
  z.array(z.object({ id: z.number(), name: z.string(), url: z.string() })),
);

/** An .xlsx file is a zip archive; a removed attachment comes back as an HTML page instead. */
const isZip = (bytes: Uint8Array) =>
  bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

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

/**
 * Returns the exit code: 0 when the file is current (written or not), 1 when it is not (it
 * failed validation, or the ministry's site could not be read). Anything else that goes wrong
 * is thrown.
 */
export async function updateMedicines({
  sources,
  paths,
  force,
  logger,
  now = () => new Date(),
}: UpdateMedicinesOptions): Promise<number> {
  const log = (message: string) => logger.log(message);
  const fileCache = (await readJson(paths.articleFiles, FileCacheSchema)) ?? {};
  const previous = await readJson(paths.medicines, MedicinesSchema);
  /** Articles whose attachments are read again even though they are cached. */
  const reread = new Set<number>();

  async function plan(kind: PriceBulletin['kind'], listing: string, title: RegExp): Promise<Plan> {
    const articles = await sources.listArticles(
      listing,
      (found) => findBase(found, title) !== null,
    );
    const base = findBase(articles, title);
    if (!base) throw new Error(`No yearly revision found in ${listing}`);
    const files = new Map<number, readonly MohFile[]>();
    for (const article of articles) {
      if (article.id < base.id) continue;
      const cached = fileCache[article.id];
      // An article listed without tables may get them later; ask again for those.
      const known =
        cached?.some(isTable) && !reread.has(article.id)
          ? cached
          : await sources.articleFiles(article);
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

  /** Every table to apply, in order, with the article it is attached to. */
  async function planBulletins(): Promise<{ articleId: number; bulletin: PriceBulletin }[]> {
    const plans = {
      prescription: await plan('prescription', PRESCRIPTION_LISTING, PRESCRIPTION_BASE),
      otc: await plan('otc', OTC_LISTING, OTC_BASE),
    };
    await writeIfChanged(
      paths.articleFiles,
      toJson(
        Object.fromEntries(Object.entries(fileCache).sort(([a], [b]) => Number(a) - Number(b))),
      ),
    );
    return (['prescription', 'otc'] as const).flatMap((kind) =>
      plans[kind].tables.map(({ article, file }) => ({
        articleId: article.id,
        bulletin: bulletinOf(kind, article, file),
      })),
    );
  }

  async function readShortages(link: Medicines['shortageList']): Promise<ShortageEntry[]> {
    return link ? sources.readShortageList(link) : [];
  }

  /** The stored prices with ΕΟΦ's current list, for a run that could not read the bulletins. */
  async function refreshShortages(stored: Medicines): Promise<void> {
    const link = await sources.findShortageList();
    log(link ? `ΕΟΦ: ${link.title}` : 'ΕΟΦ: no limited-availability list found');
    if (stored.shortageList?.fileUrl === link?.fileUrl && !force) {
      log('No new shortage list. No changes.');
      return;
    }
    const shortages = await readShortages(link);
    const attached = attachShortages(stored.medicines, shortages);
    await publish(
      { ...stored, shortageList: link, medicines: attached.medicines },
      shortages.length,
      attached.unmatchedShortages,
    );
  }

  /** Validates the file and writes it if it changed. Returns false, writing nothing, if invalid. */
  async function publish(file: Medicines, shortageEntries: number, unmatched: number) {
    const report = validateMedicines(file, shortageEntries);
    for (const w of report.warnings) log(`warning [${w.code}] ${w.message}`);
    log(
      `${file.medicines.length} packs (${file.medicines.filter((m) => m.otc).length} non-prescription), ` +
        `${shortageEntries} on the shortage list (${unmatched} without a price)`,
    );
    for (const e of report.errors) logger.error(`error [${e.code}] ${e.message}`);
    if (report.errors.length > 0) {
      logger.error(`Validation failed with ${report.errors.length} errors; nothing was written.`);
      return false;
    }

    // updatedAt moves only when what is published changed.
    const onDisk = await readFile(paths.medicines, 'utf8').catch(() => null);
    const changed = previous === undefined || onDisk !== medicinesJson(file);
    if (changed) {
      await writeIfChanged(
        paths.medicines,
        medicinesJson({ ...file, updatedAt: now().toISOString() }),
      );
    }
    log(changed ? 'Medicines updated.' : 'No changes.');
    return true;
  }

  // The ministry's site turned GitHub's runners away (HTTP 421) from 22 Oct 2026 while ΕΟΦ's
  // answered: a failure there must not keep the shortage list from being updated.
  let planned: Awaited<ReturnType<typeof planBulletins>>;
  try {
    planned = await planBulletins();
  } catch (error) {
    if (!previous) throw error;
    logger.error(
      `error [bulletins] not read, the stored prices were kept: ${describeError(error)}`,
    );
    await refreshShortages(previous);
    return 1;
  }
  let bulletins = planned.map(({ bulletin }) => bulletin);
  const shortageLink = await sources.findShortageList();
  log(shortageLink ? `ΕΟΦ: ${shortageLink.title}` : 'ΕΟΦ: no limited-availability list found');

  const unchanged =
    previous !== undefined &&
    JSON.stringify(previous.bulletins) === JSON.stringify(bulletins) &&
    previous.shortageList?.fileUrl === shortageLink?.fileUrl;
  if (unchanged && !force) {
    log('No new bulletins or shortage list. No changes.');
    return 0;
  }

  // The ministry sometimes re-issues an article with new attachments ("Ο.Ε.", a corrected
  // version), and the cached file no longer exists. Read such an article's attachments again, once.
  const downloads = new Map<string, Uint8Array>();
  for (let attempt = 0; ; attempt++) {
    const stale = new Set<number>();
    for (const { articleId, bulletin } of planned) {
      const bytes = downloads.get(bulletin.fileUrl) ?? (await sources.getBytes(bulletin.fileUrl));
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
  const shortages = await readShortages(shortageLink);
  const assembled = assembleMedicines(tables, shortages);
  for (const message of rowWarnings) log(`warning [price-row-skipped] ${message}`);
  for (const w of assembled.warnings) log(`warning [${w.code}] ${w.message}`);
  const file: Medicines = {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: previous?.updatedAt ?? now().toISOString(),
    bulletins,
    shortageList: shortageLink,
    medicines: assembled.medicines,
  };
  return (await publish(file, shortages.length, assembled.unmatchedShortages)) ? 0 : 1;
}

/** Pretty JSON, but one line per medicine: about 9,000 of them. */
function medicinesJson(value: Medicines): string {
  const { medicines, ...rest } = value;
  const head = JSON.stringify({ ...rest, medicines: [] }, null, 2);
  const lines = medicines.map((m) => `    ${JSON.stringify(m)}`).join(',\n');
  return `${head.replace(/"medicines": \[\]\n\}$/, `"medicines": [\n${lines}\n  ]\n}`)}\n`;
}
