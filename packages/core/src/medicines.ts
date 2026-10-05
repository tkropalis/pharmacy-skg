/**
 * Medicine prices (data/medicines/medicines.json) and the compact index the app downloads when
 * the medicine search opens. The zod schema in @pharmacy-skg/ingest is the source of truth for
 * the published file and is tested to stay assignable to these types.
 */

import type { IsoDate } from './data.ts';

/** One price table of the Ministry of Health (an .xlsx attached to a ministerial decision). */
export interface PriceBulletin {
  /** `<article id>/<file id>` on moh.gov.gr. */
  readonly id: string;
  /** 'prescription': the price bulletin; 'otc': the non-prescription (ΜΗΣΥΦΑ) bulletin. */
  readonly kind: 'prescription' | 'otc';
  /** The announcement's title, as published. */
  readonly title: string;
  /** The announcement's date. */
  readonly date: IsoDate;
  readonly articleUrl: string;
  readonly fileName: string;
  readonly fileUrl: string;
}

/** An entry of the ΕΟΦ limited-availability list. Dates as printed (null when blank). */
export interface Shortage {
  readonly from: IsoDate | null;
  readonly to: IsoDate | null;
  readonly reason: string;
}

export interface ShortageList {
  readonly title: string;
  /** The date the list is "as of", from its title. */
  readonly date: IsoDate;
  readonly postUrl: string;
  readonly fileUrl: string;
}

export interface MedicinePrice {
  /** The 13-digit code printed on the pack (ΕΟΦ barcode). */
  readonly barcode: string;
  /** Name, form, strength and pack, as printed in the bulletin. */
  readonly name: string;
  readonly atc: string;
  /** Active substances, comma-separated. */
  readonly substance: string;
  /** Marketing authorisation holder. */
  readonly company: string;
  /** Retail price in euros, VAT included: the maximum for prescription medicines, indicative for 'otc'. */
  readonly price: number;
  readonly otc: boolean;
  /** Flagged "Μη αποζημιούμενο" (not reimbursed) in the bulletin. */
  readonly notReimbursed: boolean;
  /** The PriceBulletin id that set the current price. */
  readonly bulletin: string;
  readonly shortage: Shortage | null;
}

export interface MedicinesFile {
  readonly schemaVersion: 1;
  /** When the published prices or shortages last changed. */
  readonly updatedAt: string;
  readonly bulletins: readonly PriceBulletin[];
  readonly shortageList: ShortageList | null;
  readonly medicines: readonly MedicinePrice[];
}

// --- The compact index ---------------------------------------------------------------

export const MEDICINE_INDEX_VERSION = 1;

/** barcode, name, substance index, company index, price in cents, flags, bulletin index. */
export type IndexRow = readonly [string, string, number, number, number, number, number];

const FLAG_OTC = 1;
const FLAG_NOT_REIMBURSED = 2;

/** What the app downloads: repeated strings are listed once, rows refer to them by index. */
export interface MedicineIndex {
  readonly v: typeof MEDICINE_INDEX_VERSION;
  readonly updatedAt: string;
  readonly bulletins: readonly Pick<PriceBulletin, 'kind' | 'title' | 'date' | 'articleUrl'>[];
  readonly shortageList: Pick<ShortageList, 'date' | 'postUrl'> | null;
  readonly substances: readonly string[];
  readonly companies: readonly string[];
  readonly rows: readonly IndexRow[];
  /** Row index, from, to. */
  readonly shortages: readonly (readonly [number, IsoDate | null, IsoDate | null])[];
}

/** A medicine as the app shows it. */
export interface IndexedMedicine {
  readonly barcode: string;
  readonly name: string;
  readonly substance: string;
  readonly company: string;
  readonly price: number;
  readonly otc: boolean;
  readonly notReimbursed: boolean;
  readonly bulletin: MedicineIndex['bulletins'][number];
  readonly shortage: { readonly from: IsoDate | null; readonly to: IsoDate | null } | null;
}

/** Builds the compact index from the published file. Rows keep the file's order. */
export function encodeMedicineIndex(file: MedicinesFile): MedicineIndex {
  const strings = () => {
    const list: string[] = [];
    const seen = new Map<string, number>();
    return {
      list,
      index(value: string): number {
        let i = seen.get(value);
        if (i === undefined) {
          i = list.length;
          list.push(value);
          seen.set(value, i);
        }
        return i;
      },
    };
  };
  const substances = strings();
  const companies = strings();
  const bulletinIndex = new Map(file.bulletins.map((b, i) => [b.id, i]));
  const rows: IndexRow[] = [];
  const shortages: [number, IsoDate | null, IsoDate | null][] = [];
  for (const m of file.medicines) {
    const bulletin = bulletinIndex.get(m.bulletin);
    if (bulletin === undefined) throw new Error(`${m.barcode}: unknown bulletin ${m.bulletin}`);
    const flags = (m.otc ? FLAG_OTC : 0) | (m.notReimbursed ? FLAG_NOT_REIMBURSED : 0);
    if (m.shortage) shortages.push([rows.length, m.shortage.from, m.shortage.to]);
    rows.push([
      m.barcode,
      m.name,
      substances.index(m.substance),
      companies.index(m.company),
      Math.round(m.price * 100),
      flags,
      bulletin,
    ]);
  }
  return {
    v: MEDICINE_INDEX_VERSION,
    updatedAt: file.updatedAt,
    bulletins: file.bulletins.map(({ kind, title, date, articleUrl }) => ({
      kind,
      title,
      date,
      articleUrl,
    })),
    shortageList: file.shortageList
      ? { date: file.shortageList.date, postUrl: file.shortageList.postUrl }
      : null,
    substances: substances.list,
    companies: companies.list,
    rows,
    shortages,
  };
}

/** Expands the index into medicines, in the index's order. Throws on a malformed index. */
export function decodeMedicineIndex(index: MedicineIndex): IndexedMedicine[] {
  if (index.v !== MEDICINE_INDEX_VERSION) throw new Error(`Unknown index version ${index.v}`);
  const shortages = new Map(index.shortages.map(([row, from, to]) => [row, { from, to }]));
  return index.rows.map((row, i) => {
    const [barcode, name, substance, company, cents, flags, bulletin] = row;
    const source = index.bulletins[bulletin];
    if (source === undefined) throw new Error(`Row ${i}: unknown bulletin ${bulletin}`);
    return {
      barcode,
      name,
      substance: index.substances[substance] ?? '',
      company: index.companies[company] ?? '',
      price: cents / 100,
      otc: (flags & FLAG_OTC) !== 0,
      notReimbursed: (flags & FLAG_NOT_REIMBURSED) !== 0,
      bulletin: source,
      shortage: shortages.get(i) ?? null,
    };
  });
}
