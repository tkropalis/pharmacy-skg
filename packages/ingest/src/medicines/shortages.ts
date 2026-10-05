/**
 * Reads ΕΟΦ's monthly "Λίστα φαρμακευτικών σκευασμάτων περιορισμένης διαθεσιμότητας" (PDF): one
 * row per pack, with its barcode, the start and expected end of the limited availability, and
 * the reason. Each page repeats the header, and the last section (packs imported through
 * Ι.Φ.Ε.Τ.) places the columns differently, so columns are found per page from the header.
 * Rows are vertically centred and wrap, so a row's text lies between the midpoints to the
 * neighbouring barcodes.
 */
import type { TextItem } from '../pdf.ts';

export interface ShortageEntry {
  readonly barcode: string;
  readonly from: string | null;
  readonly to: string | null;
  readonly reason: string;
}

const BARCODE = /^\d{13}$/;
const DATE = /^(\d{2})\/(\d{2})\/(\d{2})$/;
/** How far (in points) a date may sit from its barcode's baseline and from its column. */
const SAME_LINE = 3;
const SAME_COLUMN = 20;

const GREEK_MONTHS: Readonly<Record<string, string>> = {
  ΙΑΝΟΥΑΡΙΟΥ: '01',
  ΦΕΒΡΟΥΑΡΙΟΥ: '02',
  ΜΑΡΤΙΟΥ: '03',
  ΑΠΡΙΛΙΟΥ: '04',
  ΜΑΙΟΥ: '05',
  ΙΟΥΝΙΟΥ: '06',
  ΙΟΥΛΙΟΥ: '07',
  ΑΥΓΟΥΣΤΟΥ: '08',
  ΣΕΠΤΕΜΒΡΙΟΥ: '09',
  ΟΚΤΩΒΡΙΟΥ: '10',
  ΝΟΕΜΒΡΙΟΥ: '11',
  ΔΕΚΕΜΒΡΙΟΥ: '12',
};

/** "… 30 ΣΕΠΤΕΜΒΡΙΟΥ 2026" (any case or accents) to 2026-09-30, or null. */
export function dateFromTitle(title: string): string | null {
  const plain = title.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
  const match = /(\d{1,2})\s+([Α-Ω]+)\s+(\d{4})/.exec(plain);
  const month = match ? GREEK_MONTHS[match[2] ?? ''] : undefined;
  if (!match || month === undefined) return null;
  return `${match[3]}-${month}-${(match[1] ?? '').padStart(2, '0')}`;
}

function isoDate(text: string): string | null {
  const match = DATE.exec(text.trim());
  if (!match) return null;
  const [, d, m, y] = match;
  const iso = `20${y}-${m}-${d}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso ? null : iso;
}

interface PageColumns {
  readonly headerY: number;
  readonly from: number;
  readonly to: number;
  readonly reason: number;
  /** Where the reason column ends: the next column's x, if the page has one. */
  readonly reasonEnd: number;
}

function pageColumns(items: readonly TextItem[]): PageColumns | null {
  const find = (pattern: RegExp) => items.find((item) => pattern.test(item.text.trim()));
  const barcode = find(/^Barcode$/i);
  const from = find(/^Ημ\. έναρξης$/);
  const to = find(/^Ημ\. λήξης$/);
  const reason = find(/^Αιτία/);
  if (!barcode || !from || !to || !reason) return null;
  const after = items
    .filter((item) => item.y >= barcode.y - 1 && item.x > reason.x + 1)
    .map((item) => item.x);
  return {
    headerY: barcode.y,
    from: from.x,
    to: to.x,
    reason: reason.x,
    reasonEnd: after.length > 0 ? Math.min(...after) : Number.POSITIVE_INFINITY,
  };
}

export function parseShortageList(items: readonly TextItem[]): ShortageEntry[] {
  const entries: ShortageEntry[] = [];
  const pages = new Map<number, TextItem[]>();
  for (const item of items) {
    const page = pages.get(item.page);
    if (page) page.push(item);
    else pages.set(item.page, [item]);
  }
  for (const [page, pageItems] of pages) {
    const columns = pageColumns(pageItems);
    if (!columns) throw new Error(`Page ${page}: no table header`);
    const barcodes = pageItems
      .filter((item) => BARCODE.test(item.text.trim()) && item.y < columns.headerY)
      .sort((a, b) => b.y - a.y);
    barcodes.forEach((barcode, i) => {
      const above = barcodes[i - 1];
      const below = barcodes[i + 1];
      const top = above ? (above.y + barcode.y) / 2 : columns.headerY - 1;
      const bottom = below ? (below.y + barcode.y) / 2 : Number.NEGATIVE_INFINITY;
      const inRow = pageItems.filter((item) => item.y < top && item.y >= bottom);

      const dateIn = (x: number) => {
        const found = inRow.find(
          (item) =>
            Math.abs(item.y - barcode.y) <= SAME_LINE &&
            Math.abs(item.x - x) <= SAME_COLUMN &&
            DATE.test(item.text.trim()),
        );
        return found ? isoDate(found.text) : null;
      };
      const reason = inRow
        .filter((item) => item.x >= columns.reason - 1 && item.x < columns.reasonEnd - 1)
        .sort((a, b) => b.y - a.y || a.x - b.x)
        .map((item) => item.text.trim())
        .join(' ')
        .replace(/\s+/g, ' ');
      entries.push({
        barcode: barcode.text.trim(),
        from: dateIn(columns.from),
        to: dateIn(columns.to),
        reason,
      });
    });
  }
  return entries;
}
