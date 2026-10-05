/**
 * Reads a Ministry of Health price table (.xlsx). The tables share their columns but not their
 * headers, order or casing ("Barcode", "BARCODE"; "Λιανική Τιμή", "ΛΙΑΝΙΚΗ ΤΙΜΗ", "Ενδεικτική
 * Λιανική Τιμή"; "ΟΝΟΝΑΣΙΑ ΚΑΚ" with its typo), so columns are found by their header.
 */
import type { Sheet } from '../xlsx.ts';

export interface PriceRow {
  readonly barcode: string;
  /** The ministry's product code (Κωδικός), as printed. */
  readonly code: string;
  readonly name: string;
  readonly atc: string;
  readonly substance: string;
  readonly company: string;
  /** Retail price in euros, VAT included, rounded to cents. */
  readonly price: number;
  /** Flagged in the "Μη αποζημιούμενο" column; null when the table has no such column. */
  readonly notReimbursed: boolean | null;
}

export interface PriceTableWarning {
  readonly code: 'price-row-skipped';
  readonly message: string;
}

type Column = 'barcode' | 'code' | 'name' | 'atc' | 'substance' | 'company' | 'price' | 'flag';

/** Upper case, no accents, no dots, single spaces. */
function key(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Which column a header names, or null for columns the app does not use. */
export function columnFor(header: string): Column | null {
  const k = key(header);
  // Latin "KAK" appears too, and "ΟΝΟΝΑΣΙΑ ΚΑΚ" must not be read as the product name.
  if (/(^| )(ΚΑΚ|KAK)( |$)/.test(k) || k.startsWith('ΚΑΤΟΧΟΣ')) return 'company';
  if (k === 'BARCODE') return 'barcode';
  if (k === 'ΚΩΔΙΚΟΣ') return 'code';
  if (k === 'ATC') return 'atc';
  if (k.startsWith('ΔΡΑΣΤΙΚ')) return 'substance';
  if (k === 'ΛΙΑΝΙΚΗ ΤΙΜΗ' || k === 'ΕΝΔΕΙΚΤΙΚΗ ΛΙΑΝΙΚΗ ΤΙΜΗ') return 'price';
  if (k === 'ΜΗ ΑΠΟΖΗΜΙΟΥΜΕΝΟ') return 'flag';
  if (k === 'ΠΡΟΙΟΝ' || k === 'ΠΕΡΙΓΡΑΦΗ ΠΡΟΙΟΝΤΟΣ' || k.startsWith('ΟΝΟΜΑΣΙΑ')) return 'name';
  return null;
}

/** Collapses whitespace, including the line breaks some cells carry. */
export function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** "CAPTOPRIL:HYDROCHLOROTHIAZIDE" and "A,B" both become "A, B". */
export function cleanSubstance(text: string): string {
  return clean(text)
    .split(/\s*[:,;]\s*/)
    .filter((part) => part !== '')
    .join(', ');
}

/** A price cell: a number ("8.19", "4.4000000000000004") or text with a decimal comma. */
export function parsePrice(text: string): number | null {
  const value = Number(clean(text).replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

/** Reads every priced row. Rows without a barcode (blank lines, notes) are ignored. */
export function parsePriceTable(sheet: Sheet): { rows: PriceRow[]; warnings: PriceTableWarning[] } {
  const headerIndex = sheet.findIndex((row) => row.some((cell) => key(cell) === 'BARCODE'));
  const header = sheet[headerIndex];
  if (!header) throw new Error('No header row with a "Barcode" column');
  const columns = new Map<Column, number>();
  header.forEach((cell, i) => {
    const column = columnFor(cell);
    if (column !== null && !columns.has(column)) columns.set(column, i);
  });
  for (const required of ['barcode', 'name', 'price'] as const) {
    if (!columns.has(required)) throw new Error(`No "${required}" column in ${header.join(' | ')}`);
  }
  const cell = (row: readonly string[], column: Column) => {
    const i = columns.get(column);
    return i === undefined ? '' : (row[i] ?? '');
  };

  const rows: PriceRow[] = [];
  const warnings: PriceTableWarning[] = [];
  for (const row of sheet.slice(headerIndex + 1)) {
    const barcode = clean(cell(row, 'barcode'));
    if (barcode === '') continue;
    const name = clean(cell(row, 'name'));
    const price = parsePrice(cell(row, 'price'));
    if (!/^\d{13}$/.test(barcode) || name === '' || price === null) {
      warnings.push({
        code: 'price-row-skipped',
        message: `barcode "${barcode}", name "${name}", price "${cell(row, 'price')}"`,
      });
      continue;
    }
    rows.push({
      barcode,
      code: clean(cell(row, 'code')),
      name,
      atc: clean(cell(row, 'atc')),
      substance: cleanSubstance(cell(row, 'substance')),
      company: clean(cell(row, 'company')),
      price,
      notReimbursed: columns.has('flag') ? clean(cell(row, 'flag')) !== '' : null,
    });
  }
  return { rows, warnings };
}
