/**
 * The current price list, assembled from the ministry's bulletins. There is no single current
 * file: the yearly revision is the base, and every later bulletin (new generics, new medicines,
 * re-pricing, voluntary price cuts) changes or adds packs. Applying them in publication order,
 * keyed by barcode, gives the prices in force. Non-prescription (ΜΗΣΥΦΑ) packs come from their
 * own catalogue and bulletins the same way; the two lists share no barcode.
 *
 * Not covered: a pack withdrawn after the base revision stays listed until the next revision
 * (withdrawals are not in the price bulletins), and bulletins published only as PDF.
 */
import type { MedicinePrice, PriceBulletin, Shortage } from '@pharmacy-skg/core';
import type { PriceRow } from './price-table.ts';
import type { ShortageEntry } from './shortages.ts';

export interface PriceTable {
  readonly bulletin: PriceBulletin;
  readonly rows: readonly PriceRow[];
}

export interface AssembleWarning {
  readonly code: 'changed-kind';
  readonly message: string;
}

const byName = new Intl.Collator('el', { sensitivity: 'base', numeric: true });

/**
 * Applies the tables in the order given (oldest first) and attaches the shortages. A later row
 * replaces the price; a cell the later table leaves blank or lacks keeps the earlier value.
 */
export function assembleMedicines(
  tables: readonly PriceTable[],
  shortages: readonly ShortageEntry[],
): { medicines: MedicinePrice[]; unmatchedShortages: number; warnings: AssembleWarning[] } {
  const byBarcode = new Map<string, MedicinePrice>();
  const warnings: AssembleWarning[] = [];
  for (const { bulletin, rows } of tables) {
    const otc = bulletin.kind === 'otc';
    for (const row of rows) {
      const previous = byBarcode.get(row.barcode);
      if (previous && previous.otc !== otc) {
        warnings.push({
          code: 'changed-kind',
          message: `${row.barcode} ${row.name}: ${previous.bulletin} → ${bulletin.id}`,
        });
      }
      byBarcode.set(row.barcode, {
        barcode: row.barcode,
        name: row.name,
        atc: row.atc || previous?.atc || '',
        substance: row.substance || previous?.substance || '',
        company: row.company || previous?.company || '',
        price: row.price,
        otc,
        notReimbursed: row.notReimbursed ?? previous?.notReimbursed ?? false,
        bulletin: bulletin.id,
        shortage: null,
      });
    }
  }

  const sorted = [...byBarcode.values()].sort(
    (a, b) => byName.compare(a.name, b.name) || a.barcode.localeCompare(b.barcode),
  );
  return { ...attachShortages(sorted, shortages), warnings };
}

/**
 * Puts the list's shortages on the packs it names by barcode, replacing any earlier ones, and
 * counts the entries without a priced pack. The stored prices take a new list this way when the
 * bulletins cannot be read (cli/medicines.ts).
 */
export function attachShortages(
  medicines: readonly MedicinePrice[],
  shortages: readonly ShortageEntry[],
): { medicines: MedicinePrice[]; unmatchedShortages: number } {
  const byBarcode = new Map(shortages.map((entry) => [entry.barcode, entry]));
  const priced = new Set(medicines.map((m) => m.barcode));
  return {
    medicines: medicines.map((medicine) => {
      const entry = byBarcode.get(medicine.barcode);
      const shortage: Shortage | null = entry
        ? { from: entry.from, to: entry.to, reason: entry.reason }
        : null;
      return { ...medicine, shortage };
    }),
    unmatchedShortages: shortages.filter((entry) => !priced.has(entry.barcode)).length,
  };
}
