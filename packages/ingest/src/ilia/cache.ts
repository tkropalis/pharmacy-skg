/**
 * The duty table's rows, kept between runs (data/ilia/inputs/duty-table.json) under the table's
 * ADA and version, so a run reads its 212 pages only when the decision is new or corrected. The
 * file is the table as rows, one to a line, not the PDF: the PDF is 5 MB, the rows a few hundred
 * KB, and the reading of it is what the parser's version stands for.
 */
import { z } from 'zod';
import { cityPaths, readJson, writeIfChanged } from '../store.ts';
import type { Table } from './table.ts';

/** Changes when the reading of the table changes, so a stored table is read again. */
export const PARSER_VERSION = 1;

export const CachedTableSchema = z.object({
  ada: z.string(),
  versionId: z.string(),
  parser: z.number(),
  issueDate: z.string(),
  postedAt: z.string(),
  year: z.number(),
  /** One per phone, or per name where the table has no phone. */
  pharmacies: z.array(
    z.object({
      phone: z.string().nullable(),
      town: z.string(),
      name: z.string(),
      address: z.string(),
    }),
  ),
  /** [date, town, hours, overnight, phone, name]. */
  rows: z.array(
    z.tuple([
      z.string(),
      z.string(),
      z.string().nullable(),
      z.union([z.literal(0), z.literal(1)]),
      z.string().nullable(),
      z.string().nullable(),
    ]),
  ),
});
export type CachedTable = z.infer<typeof CachedTableSchema>;

const CacheSchema = z.object({ schemaVersion: z.literal(1), tables: z.array(CachedTableSchema) });

export function toCached(
  decision: { ada: string; versionId: string; issueDate: string; postedAt: string },
  table: Table,
): CachedTable {
  return {
    ada: decision.ada,
    versionId: decision.versionId,
    parser: PARSER_VERSION,
    issueDate: decision.issueDate,
    postedAt: decision.postedAt,
    year: table.year,
    pharmacies: [...table.pharmacies],
    rows: table.rows.map((row) => [
      row.date,
      row.town,
      row.hours,
      row.overnight ? 1 : 0,
      row.phone,
      row.name,
    ]),
  };
}

export function fromCached(cached: CachedTable): Table {
  return {
    year: cached.year,
    pharmacies: cached.pharmacies,
    rows: cached.rows.map(([date, town, hours, overnight, phone, name]) => ({
      date,
      town,
      hours,
      overnight: overnight === 1,
      phone,
      name,
      page: 0,
    })),
    warnings: [],
  };
}

/** The file's text: each table's head on a line, then its pharmacies and rows a line each. */
export function cacheText(tables: readonly CachedTable[]): string {
  const json = (value: unknown) => JSON.stringify(value);
  const lines = (items: readonly unknown[]) => items.map((i) => `        ${json(i)}`).join(',\n');
  const parts = tables.map(({ pharmacies, rows, ...head }) => {
    const fields = Object.entries(head).map(([key, value]) => `      ${json(key)}: ${json(value)}`);
    return [
      '    {',
      `${fields.join(',\n')},`,
      '      "pharmacies": [',
      lines(pharmacies),
      '      ],',
      '      "rows": [',
      lines(rows),
      '      ]',
      '    }',
    ].join('\n');
  });
  return `{\n  "schemaVersion": 1,\n  "tables": [\n${parts.join(',\n')}\n  ]\n}\n`;
}

/** Where the stored tables are kept. */
export interface TableCache {
  read(): Promise<CachedTable[]>;
  write(tables: readonly CachedTable[]): Promise<void>;
}

export function fileTableCache(
  path = `${cityPaths('ilia').root}/inputs/duty-table.json`,
): TableCache {
  return {
    async read() {
      return (await readJson(path, CacheSchema))?.tables ?? [];
    },
    async write(tables) {
      CacheSchema.parse({ schemaVersion: 1, tables });
      await writeIfChanged(path, cacheText(tables));
    },
  };
}
