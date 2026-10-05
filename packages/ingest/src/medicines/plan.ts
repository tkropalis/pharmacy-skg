import type { MohArticleLink, MohFile } from '../sources/moh.ts';

/** The yearly revision of prescription prices: the base the later bulletins change. */
export const PRESCRIPTION_BASE = /Δελτίο αναθεωρημένων τιμών/i;
/** The yearly revision of the non-prescription (ΜΗΣΥΦΑ) catalogue. */
export const OTC_BASE = /Αναθεώρηση\s+καταλόγου μη συνταγογραφούμενων/i;

export interface PlannedTable {
  readonly article: MohArticleLink;
  readonly file: MohFile;
}

export interface Plan {
  readonly base: MohArticleLink;
  /** The base's tables, then every later table, oldest first. */
  readonly tables: readonly PlannedTable[];
  /** Later articles without an .xlsx table (their changes are not applied). */
  readonly withoutTable: readonly MohArticleLink[];
}

export const isTable = (file: MohFile) => /\.xlsx$/i.test(file.name);

/**
 * The newest article whose title names a yearly revision, if any. Its amendment ("Τροποποίηση
 * της … «Δελτίο αναθεωρημένων τιμών…»") quotes that title and republishes the whole table, so
 * it is the base when there is one.
 */
export function findBase(
  articles: readonly MohArticleLink[],
  title: RegExp,
): MohArticleLink | null {
  return [...articles].sort((a, b) => b.id - a.id).find((a) => title.test(a.title)) ?? null;
}

/** Orders the base and every later article's tables by article id (publication order). */
export function planTables(
  base: MohArticleLink,
  articles: readonly MohArticleLink[],
  filesOf: (article: MohArticleLink) => readonly MohFile[],
): Plan {
  const baseTables = filesOf(base).filter(isTable);
  if (baseTables.length !== 1) {
    throw new Error(`Base ${base.url} has ${baseTables.length} .xlsx tables, expected 1`);
  }
  const later = [...new Map(articles.map((a) => [a.id, a])).values()]
    .filter((a) => a.id > base.id)
    .sort((a, b) => a.id - b.id);
  const tables: PlannedTable[] = baseTables.map((file) => ({ article: base, file }));
  const withoutTable: MohArticleLink[] = [];
  for (const article of later) {
    const files = filesOf(article).filter(isTable);
    if (files.length === 0) withoutTable.push(article);
    for (const file of files) tables.push({ article, file });
  }
  return { base, tables, withoutTable };
}
