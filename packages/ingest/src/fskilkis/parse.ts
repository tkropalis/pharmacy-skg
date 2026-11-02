/**
 * The duty site of the Pharmaceutical Association of Kilkis, `fskilkis.gr/efimeries`
 * (docs/research-greece.md, section 2). A Joomla site with one article per town and month, each
 * with one HTML table. Read on 2 Nov 2026 (fixtures/fskilkis):
 *
 * - Polykastro, Axioupoli and Goumenissa: a plain table, one row per day (date, name, address,
 *   phone). It states no hours.
 * - Kilkis: two pharmacies a day, in a table made for the eye. A day is a block of rows whose
 *   date cell spans them; a pharmacy's cell is followed, in the same column, by a cell with its
 *   hours ("Από 8:00 Έως 21:00", "Από 17:30 Έως 8:00 της επομένης"). On Saturdays the left column
 *   lists the morning pharmacies, each with its hours, and the right column's cell spans them
 *   all: a pharmacy can stand in both columns, with a window in each.
 *
 * Neither has coordinates. The article's title says the town and the month; the table's dates
 * give the year.
 */
import { decodeEntities, phoneOf } from '../iteq/parse.ts';
import { cleanDisplay, squash } from '../text.ts';

export interface KilkisDuty {
  readonly name: string;
  readonly address: string;
  readonly phone: string;
  /** The hours as printed, one text per window; empty when the table states none. */
  readonly hours: readonly string[];
}

export interface KilkisDay {
  /** YYYY-MM-DD. */
  readonly date: string;
  readonly duties: readonly KilkisDuty[];
}

type MutableDuty = { -readonly [K in keyof KilkisDuty]: KilkisDuty[K] };

interface Cell {
  readonly row: number;
  readonly col: number;
  readonly rowspan: number;
  readonly html: string;
}

/** The lines of a cell, in order: its text between the line breaks. */
function linesOf(html: string): string[] {
  return html
    .split(/<br\s*\/?>/i)
    .map((line) => squash(decodeEntities(line.replace(/<[^>]*>/g, ' '))))
    .filter((line) => line !== '');
}

/** "1/11/2026" as "2026-11-02"; null for anything else. */
function isoDate(printed: string): string | null {
  const match = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(printed);
  if (!match) return null;
  const [, day = '', month = '', year = ''] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/** The table's cells with the row and column each one starts in, rowspans and colspans applied. */
function cellsOf(table: string): Cell[] {
  const cells: Cell[] = [];
  const taken = new Set<string>();
  let row = 0;
  for (const tr of table.split(/<tr\b/i).slice(1)) {
    let col = 0;
    for (const td of tr.matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)) {
      while (taken.has(`${row},${col}`)) col++;
      const rowspan = Number(/rowspan="?(\d+)/i.exec(td[1] ?? '')?.[1] ?? 1);
      const colspan = Number(/colspan="?(\d+)/i.exec(td[1] ?? '')?.[1] ?? 1);
      for (let r = row; r < row + rowspan; r++) {
        for (let c = col; c < col + colspan; c++) taken.add(`${r},${c}`);
      }
      cells.push({ row, col, rowspan, html: td[2] ?? '' });
      col += colspan;
    }
    row++;
  }
  return cells;
}

/** A pharmacy's cell: the name, then the address, then "Τηλ.2341022271". */
function pharmacyOf(html: string): Omit<KilkisDuty, 'hours'> | null {
  const lines = linesOf(html);
  const phoneAt = lines.findIndex((line) => /^Τηλ/i.test(line));
  if (phoneAt < 1) return null;
  return {
    name: cleanDisplay(lines[0] ?? ''),
    address: cleanDisplay(lines.slice(1, phoneAt).join(' ')),
    phone: phoneOf((lines[phoneAt] ?? '').replace(/^Τηλ\.?/i, '')),
  };
}

const HOURS = /\d{1,2}[:.]\d{2}/;

/** The article's table as days, in the order it prints them. Throws on a layout it does not know. */
export function parseKilkisDays(html: string): KilkisDay[] {
  const section = /<section class="article-content"[^>]*>([\s\S]*?)<\/section>/.exec(html)?.[1];
  const table = /<table\b[\s\S]*?<\/table>/i.exec(section ?? '')?.[0];
  if (!table) throw new Error('no duty table in the article');
  const cells = cellsOf(table);
  const days: KilkisDay[] = [];

  // A plain table: a header row, then date, name, address, phone.
  if (/^Ημερομηνία/.test(linesOf(cells[0]?.html ?? '')[0] ?? '')) {
    const byRow = new Map<number, Cell[]>();
    for (const cell of cells) byRow.set(cell.row, [...(byRow.get(cell.row) ?? []), cell]);
    for (const [row, rowCells] of byRow) {
      if (row === 0) continue;
      const [dateCell, name, address, phone] = rowCells;
      const date = isoDate(linesOf(dateCell?.html ?? '').join(' '));
      if (!date || !name || !address || !phone || rowCells.length !== 4) {
        throw new Error(`row ${row} is not a date, a name, an address and a phone`);
      }
      days.push({
        date,
        duties: [
          {
            name: cleanDisplay(linesOf(name.html).join(' ')),
            address: cleanDisplay(linesOf(address.html).join(' ')),
            phone: phoneOf(linesOf(phone.html).join(' ')),
            hours: [],
          },
        ],
      });
    }
    return days;
  }

  // Blocks of rows under a date cell. In each column the cells alternate: a pharmacy, then its
  // hours (a pharmacy's cell may span several of the hours' rows).
  for (const dateCell of cells.filter((cell) => cell.col === 0)) {
    const date = isoDate(linesOf(dateCell.html).join(' '));
    if (!date) continue;
    const duties: MutableDuty[] = [];
    const columns = new Set(cells.map((cell) => cell.col));
    for (const col of [...columns].filter((c) => c > 0).sort((a, b) => a - b)) {
      const column = cells
        .filter(
          (cell) =>
            cell.col === col &&
            cell.row >= dateCell.row &&
            cell.row < dateCell.row + dateCell.rowspan,
        )
        .sort((a, b) => a.row - b.row);
      let current: MutableDuty | undefined;
      for (const cell of column) {
        const text = linesOf(cell.html).join(' ');
        const pharmacy = pharmacyOf(cell.html);
        if (pharmacy) {
          // The same pharmacy in both columns is one duty with a window in each.
          current = duties.find((duty) => duty.phone === pharmacy.phone);
          if (!current) {
            current = { ...pharmacy, hours: [] };
            duties.push(current);
          }
        } else if (HOURS.test(text)) {
          if (!current) throw new Error(`${date}: hours "${text}" with no pharmacy before them`);
          current.hours = [...current.hours, text];
        }
      }
    }
    if (duties.length === 0) throw new Error(`${date}: no pharmacy`);
    days.push({ date, duties });
  }
  return days;
}

/** One monthly article of a town. */
export interface KilkisArticle {
  /** The section's id in the address, `63-kilkis`. */
  readonly section: string;
  /** The month, 1 to 12. */
  readonly month: number;
  readonly path: string;
}

const MONTHS = [
  'ιανουαριου',
  'φεβρουαριου',
  'μαρτιου',
  'απριλιου',
  'μαιου',
  'ιουνιου',
  'ιουλιου',
  'αυγουστου',
  'σεπτεμβριου',
  'οκτωβριου',
  'νοεμβριου',
  'δεκεμβριου',
] as const;

/** Lower case, without accents, a final sigma as a sigma: "Νοεμβρίου" is "νοεμβριου". */
function plain(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ς/g, 'σ');
}

/**
 * The monthly articles the index page links to (`/efimeries/63-kilkis/111-...-noemvriou`), each
 * with its town's section and the month its title names ("Εφημερεύοντα Φαρμακεία Κιλκίς
 * Νοεμβρίου"). Links that are not such an article (the legislation section) are left out.
 */
export function parseKilkisIndex(html: string): KilkisArticle[] {
  const found = new Map<string, KilkisArticle>();
  for (const link of html.matchAll(
    /<a href="(\/efimeries\/(\d+-[a-z]+)\/\d+-efimereuonta-famakeia-[a-z-]+)"[^>]*>\s*([^<]*?)\s*<\/a>/g,
  )) {
    const [, path = '', section = '', title = ''] = link;
    const month = MONTHS.findIndex((name) => plain(title).endsWith(name));
    if (month < 0 || found.has(path)) continue;
    found.set(path, { section, month: month + 1, path });
  }
  return [...found.values()];
}
