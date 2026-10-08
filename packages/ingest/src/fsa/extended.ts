/**
 * ΦΣΑ's extended-hours table (docs/research-greece.md, section 3): a PDF every two months, about
 * 2,000 pharmacies of Attica outside Piraeus, one row each, with the hours for each of the two
 * months as each pharmacy typed them. Word drew it with no row rules, but each cell's border is a
 * thin filled box, so the rows and columns come from those boxes, never from where the text
 * happens to sit (a cell of five lines lies against its neighbours' single lines). The letters
 * are printed shifted (fsa/hours.ts), so names and addresses are not read from it: each row is
 * matched by its phone number to a pharmacy the duty site names.
 */
import { normalizePhone } from '../text.ts';
import type { PdfPage } from '../pdf.ts';
import { squash } from '../text.ts';
import type { Month } from './hours.ts';

export interface FsaRow {
  /** The phone numbers printed in the row (some print two). */
  readonly phones: readonly string[];
  /** The hours cell for each month, in the table's order. */
  readonly hours: readonly string[];
  /** The row as printed, for reports: place, name, address and phone, still shifted. */
  readonly printed: string;
}

interface Cell {
  readonly x0: number;
  readonly x1: number;
}

interface Row {
  readonly y0: number;
  readonly y1: number;
  readonly cells: Cell[];
  readonly texts: string[][];
}

/** A box this thin is a cell's side, not a shaded area. */
const RULE = 2.5;
const COLUMNS = 6;

/** The table's rows, in order, a row that runs onto the next page joined back together. */
export function readFsaTable(pages: readonly PdfPage[]): FsaRow[] {
  const rows: Row[] = [];
  for (const page of pages) {
    const sides = page.boxes.filter((b) => b.x1 - b.x0 <= RULE && b.y1 - b.y0 >= 2);
    if (sides.length === 0) continue;
    const left = Math.min(...sides.map((b) => b.x0));
    // One side on the far left per row.
    const pageRows: Row[] = sides
      .filter((b) => b.x0 - left < 1)
      .sort((a, b) => b.y1 - a.y1)
      .map((side) => {
        const edges = sides
          .filter((b) => b.y0 < side.y1 - 1 && b.y1 > side.y0 + 1)
          .map((b) => (b.x0 + b.x1) / 2)
          .sort((a, b) => a - b)
          .filter((x, i, all) => i === 0 || x - (all[i - 1] ?? 0) > 4);
        const cells = edges.slice(1).map((x1, i) => ({ x0: edges[i] ?? 0, x1 }));
        return { y0: side.y0, y1: side.y1, cells, texts: cells.map(() => []) };
      });
    for (const item of page.items) {
      const row = pageRows.find((r) => item.y >= r.y0 - 1 && item.y <= r.y1 + 1);
      const column = row?.cells.findIndex((c) => item.x >= c.x0 - 1 && item.x < c.x1);
      if (row && column !== undefined && column >= 0) row.texts[column]?.push(item.text);
    }
    for (const row of pageRows) {
      if (row.cells.length !== COLUMNS) continue;
      const [place = [], , , phone = []] = row.texts;
      // A row with neither place nor phone continues the previous page's last row.
      const previous = rows.at(-1);
      if (place.length === 0 && phone.length === 0 && previous && rows.length > 0) {
        row.texts.forEach((texts, i) => previous.texts[i]?.push(...texts));
        continue;
      }
      rows.push(row);
    }
  }

  const table: FsaRow[] = [];
  for (const row of rows) {
    const [place, name, address, phone, ...months] = row.texts.map((t) => squash(t.join(' ')));
    // The header: its first cell is ΠΕΡΙΟΧΗ.
    if (place === 'ΠΕΡΙΟΧΗ' || (place === '' && phone === '')) continue;
    const phones = phonesIn(phone ?? '');
    table.push({
      phones: [...new Set(phones)],
      hours: months,
      printed: [place, name, address, phone].join(' | '),
    });
  }
  return table;
}

/**
 * The numbers in a phone cell: one or two, sometimes split after the area code ("210 9618251"),
 * sometimes an Athens number without it ("6006565").
 */
export function phonesIn(cell: string): string[] {
  const groups = cell.match(/\d+/g) ?? [];
  const numbers: string[] = [];
  for (let i = 0; i < groups.length; i++) {
    let digits = groups[i] ?? '';
    const next = groups[i + 1] ?? '';
    if (digits.length < 10 && digits.length + next.length === 10) {
      digits += next;
      i++;
    }
    if (digits.length === 7) digits = `210${digits}`;
    const normalized = normalizePhone(digits);
    if (normalized !== null) numbers.push(normalized);
  }
  return numbers;
}

const MONTHS: readonly (readonly [RegExp, number])[] = [
  [/ΙΑΝΟΥΑΡ/, 1],
  [/ΦΕΒΡΟΥΑΡ/, 2],
  [/ΜΑΡΤ/, 3],
  [/ΑΠΡΙΛ/, 4],
  [/ΜΑ[ΙΪ](?:ΟΣ|ΟΥ)?(?!\p{L})/u, 5],
  [/ΙΟΥΝ/, 6],
  [/ΙΟΥΛ/, 7],
  [/ΑΥΓΟΥΣΤ/, 8],
  [/ΣΕΠΤ/, 9],
  [/ΟΚΤ[ΩΟ]/, 10],
  [/ΝΟΕΜ/, 11],
  [/ΔΕΚΕΜ/, 12],
];

/**
 * The two months a list covers, from its announcement's title ("ΠΙΝΑΚΑΣ ΔΙΕΥΡΥΜΕΝΩΝ ΦΑΡΜΑΚΕΙΩΝ
 * ΔΙΜΗΝΟΥ ΣΕΠΤΕΜΒΡΙΟΣ – ΟΚΤΩΒΡΙΟΣ 2026"), or null when it names no two consecutive months.
 */
export function monthsOf(title: string): [Month, Month] | null {
  const text = title.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
  const year = /\b(20\d{2})\b/.exec(text)?.[1];
  const found = MONTHS.map(([pattern, month]) => ({ month, at: text.search(pattern) }))
    .filter((m) => m.at >= 0)
    .sort((a, b) => a.at - b.at);
  const [first, second] = found;
  if (!year || found.length !== 2 || !first || !second) return null;
  if (second.month !== first.month + 1) return null;
  return [
    { year: Number(year), month: first.month },
    { year: Number(year), month: second.month },
  ];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The first and last date of a month. */
export function monthPeriod({ year, month }: Month): { from: string; to: string } {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(last)}` };
}
