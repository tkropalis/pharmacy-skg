/**
 * Reads the Ilia pharmacists' duty table (Diavgeia ADA ΡΣΦΞ7Λ6-2Κ3, "Διημερεύσεις –
 * Διανυκτερεύσεις φαρμακείων της Περιφερειακής Ενότητας Ηλείας έτους 2026"): a PDF that a web
 * page was printed to, with a table for each of eleven towns, ten of them one row per duty:
 *
 *   1/1/2026, Πέμπτη | 17:00-08:00 | ΤΡΑΓΟΥΣΤΗΣ ΑΘΑΝΑΣΙΟΣ | ΦΙΛ. ΕΤΑΙΡΕΙΑΣ 6 | 2622023912 | Ναι
 *
 * and Varda's, which names only the pharmacist who is on duty overnight each day:
 *
 *   1/1/2026 ΠΕΜΠΤΗ | ΝΑΙ (a holiday) | ΛΕΥΚΑΔΙΤΗ Σ. ΓΕΩΡΓΙΑ | ΔΙΑΝΥΚΤΕΡΕΥΣΗ | ΒΑΡΔΑ
 *
 * The printing makes the rows hard to read from their positions (2026 table):
 * - a cell wraps onto up to four lines (the hours "08:00-" / "14:30 &" / "18:00-" / "08:00");
 * - the columns' positions differ from page to page, and the address is centred;
 * - where a page ends, a row can be cut in two. Its hours and "Ναι" or "Όχι" (or all but its date)
 *   stay at the foot of the page, and the rest comes first on the next page, or on the same one,
 *   in other positions and with the phone and the weekday run together; or its hours are cut
 *   short, with the rest of them at the top of the next page; or it is printed twice. The table's
 *   header can also fall between a row's lines;
 * - a few rows are printed as one line of text ("12/1/2026, 08:00-21:00 NAME ADDRESS 2622022244
 *   Όχι Δευτέρα");
 * - a name and an address can be merged into one run of text, or an address and a phone.
 *
 * So a row is found by its date and takes the cells that follow it up to the next date. Cells are
 * told apart by what they say (a phone is ten digits, hours have colons, "Ναι" or "Όχι") rather
 * than by where they are, and the two halves of a cut row are joined. Only the hours, the phone
 * and the night flag decide a duty; a pharmacy's name and address, which the layout can garble in
 * a row, are the reading most of its rows agree on. A row that is incomplete or contradicts
 * itself (a weekday that is not its date's) is reported and left out, never guessed.
 */
import { isoWeekday } from '@pharmacy-skg/core';
import type { TextItem } from '../pdf.ts';
import type { Warning } from '../registry/build.ts';
import { cleanDisplay, joinLines, matchKey, squash } from '../text.ts';

/** One duty: a town's pharmacy on a date, in the hours printed. */
export interface TableRow {
  /** The town's heading as printed ("ΑΜΑΛΙΑΔΑ"). */
  readonly town: string;
  /** ISO date. */
  readonly date: string;
  /**
   * The windows as printed, "08:00-14:30 & 17:30-08:00" ("*" after a window is kept); null when
   * the row states none (Varda's, "ΔΙΑΝΥΚΤΕΡΕΥΣΗ").
   */
  readonly hours: string | null;
  /** The "Διανυκτερεύει" column; Varda's rows are all overnight. */
  readonly overnight: boolean;
  /** Ten digits; null for Varda's rows, which have none and name the pharmacist instead. */
  readonly phone: string | null;
  /** The pharmacist, for a row without a phone. */
  readonly name: string | null;
  readonly page: number;
}

export interface TablePharmacy {
  /** Null for a pharmacy that is only named (Varda's). */
  readonly phone: string | null;
  readonly town: string;
  readonly name: string;
  readonly address: string;
}

export interface Table {
  /** The year in the town headings ("ΑΜΑΛΙΑΔΑ 2026"). */
  readonly year: number;
  readonly rows: readonly TableRow[];
  /** One per phone (or per name, where there is no phone): what most of its rows print. */
  readonly pharmacies: readonly TablePharmacy[];
  /** Rows and cells that could not be read for certain; those rows are left out. */
  readonly warnings: readonly Warning[];
}

const HEADER_LABELS = new Set([
  'Ημερομηνία',
  'Ωράριο',
  'Φαρμακείο',
  'Διεύθυνση',
  'Τηλέφωνο',
  'Διανυκτερεύει',
  'Ημέρα',
  'Αργία',
  'Υπεύθυνος',
  'Φαρμακοποιός',
  'Περιοχή',
]);

const WEEKDAYS = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'];
/** ISO weekday (1 = Monday) by the day's printed name, in any case. */
const WEEKDAY_NUMBER = new Map(WEEKDAYS.map((name, i) => [matchKey(name), i === 0 ? 7 : i]));

/** A town's heading: "ΑΜΑΛΙΑΔΑ 2026", in capitals, in a larger or the ordinary size. */
const HEADING = /^(\p{Lu}[\p{Lu} ]*\p{Lu})\s+(20\d\d)$/u;
const DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?(?:\s+(\p{L}+))?$/u;
const DATE_AND_MORE = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\p{L}+)\s*(.*)$/u;
const WINDOW = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})(\*?)$/;
const PHONE = /^\d{10}$/;
/** A row printed as one line: date, hours, name and address together, phone, flag, weekday. */
const COLLAPSED =
  /^(\d{1,2}\/\d{1,2}\/\d{4}),\s+((?:\d{1,2}:\d{2}-\d{1,2}:\d{2}\*?(?:\s*&\s*)?)+)\s+(.*?)\s*(\d{10})\s+(Ναι|Όχι)\s+(\p{L}+)$/u;
/** Text of the hours column: times, dashes, a "*" and the "&" between two windows. */
const HOURS_FRAGMENT = /^[\d:\-*&\s]+$/;

/** How far above a row's date an item may sit and still be the row's (points). */
const ABOVE_TOLERANCE = 7;
/** A flag this far below its row's first line is the foot of the page's, not the row's. */
const TAIL_GAP = 15;
/** The date column is the leftmost; no other cell starts this far right. */
const DATE_COLUMN_MAX_X = 90;

function isoDate(day: string, month: string, year: string): string | null {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCDate() !== Number(day) || date.getUTCMonth() !== Number(month) - 1) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * "08:00-14:30 & 17:30-08:00" from its pieces, or null when they are not one or two whole
 * windows (a window cut at "&" or "-" is not).
 */
function normalizeHours(text: string): string | null {
  const bare = text.replace(/\s+/g, '');
  const windows = bare.split('&');
  if (windows.length > 2 || windows.some((part) => part === '')) return null;
  const out: string[] = [];
  for (const part of windows) {
    const match = WINDOW.exec(part);
    if (!match) return null;
    const [, fromHour = '', fromMinute = '', toHour = '', toMinute = '', star = ''] = match;
    const pad = (n: string) => n.padStart(2, '0');
    out.push(`${pad(fromHour)}:${fromMinute}-${pad(toHour)}:${toMinute}${star}`);
  }
  return out.join(' & ');
}

interface Cell {
  readonly x: number;
  readonly y: number;
  readonly text: string;
}

interface Reading {
  readonly name: string;
  readonly address: string;
}

interface RawRow {
  readonly row: TableRow;
  /** Null for a row printed as one line, which has no cells to read a name and address from. */
  readonly reading: Reading | null;
}

const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
};

const byLine = (a: Cell, b: Cell) => b.y - a.y || a.x - b.x;

/**
 * A cell's own words, with a phone, a flag or a weekday that the printing ran into them taken
 * out: "ΕΘΝ. ΟΔΟΣ ΠΥΡΓΟΥ - 2625036166", "2624023306 Δευτέρα", "Ναι ΠΟΛΙΤΗΣ".
 */
function peel(text: string): {
  phones: string[];
  flags: string[];
  weekdays: string[];
  rest: string;
} {
  const tokens = text.split(/\s+/);
  const phones: string[] = [];
  const flags: string[] = [];
  const weekdays: string[] = [];
  const isFlag = (token: string) => token === 'Ναι' || token === 'Όχι';
  const take = (token: string) => {
    if (PHONE.test(token)) phones.push(token);
    else if (isFlag(token)) flags.push(token);
    else weekdays.push(token);
  };
  // A cell of one word is what it is; of several, a phone or flag in it is another cell's, and a
  // weekday beside one of those, at either end, is the row's.
  if (tokens.length > 1) {
    for (let i = tokens.length - 1; i >= 0; i--) {
      const token = tokens[i] ?? '';
      if (PHONE.test(token) || isFlag(token)) {
        take(token);
        tokens.splice(i, 1);
      }
    }
  }
  while (tokens.length > 1 && phones.length + flags.length > 0) {
    const first = tokens[0] ?? '';
    const last = tokens.at(-1) ?? '';
    if (WEEKDAY_NUMBER.has(matchKey(last))) take(tokens.pop() ?? '');
    else if (WEEKDAY_NUMBER.has(matchKey(first))) take(tokens.shift() ?? '');
    else break;
  }
  // What is left of a cell that had a phone or flag peeled off it may be the weekday alone.
  if (phones.length + flags.length > 0 && tokens.length === 1) {
    const only = tokens[0] ?? '';
    if (WEEKDAY_NUMBER.has(matchKey(only))) {
      weekdays.push(only);
      tokens.length = 0;
    }
  }
  return { phones, flags, weekdays, rest: tokens.join(' ') };
}

/** The cells of a row, told apart by what they say: its date, weekday, phone, flag and hours. */
function partsOf(item: TextItem, cells: readonly Cell[]) {
  const [, day = '', month = '', yearText = '', inlineWeekday = ''] = DATE.exec(item.text) ?? [];
  const date = isoDate(day, month, yearText);
  let weekday = inlineWeekday;
  const phones: string[] = [];
  const flags: Cell[] = [];
  const hoursParts: Cell[] = [];
  const text: Cell[] = [];
  for (const cell of cells) {
    const peeled = peel(cell.text);
    phones.push(...peeled.phones);
    for (const flag of peeled.flags) flags.push({ ...cell, text: flag });
    weekday ||= peeled.weekdays[0] ?? '';
    const rest = peeled.rest;
    if (rest === '') continue;
    if (PHONE.test(rest)) phones.push(rest);
    else if (rest === 'Ναι' || rest === 'Όχι') flags.push({ ...cell, text: rest });
    else if (WEEKDAY_NUMBER.has(matchKey(rest)) && Math.abs(cell.x - item.x) < 25) {
      weekday ||= rest;
    } else if (HOURS_FRAGMENT.test(rest) && /[:&]/.test(rest)) {
      hoursParts.push({ ...cell, text: rest });
    } else text.push({ ...cell, text: rest });
  }
  hoursParts.sort(byLine);
  text.sort(byLine);
  return { item, date, weekday, phones, flags, hoursParts, text };
}

type Draft = ReturnType<typeof partsOf>;

/** What a page leaves for the next. */
interface Held {
  /** The rest of a row the page break cut: the cells at the foot of the page. */
  readonly tail: readonly Cell[];
  /** The page's last row, whose lines can go on at the top of the next page. */
  readonly open: OpenRow | null;
}

interface OpenRow {
  readonly town: string;
  readonly item: TextItem;
  readonly cells: readonly Cell[];
  readonly page: number;
}

interface PageRead {
  readonly rows: RawRow[];
  readonly town: string | null;
  readonly year: number | null;
  readonly held: Held;
}

/** A row of the table from what was read of it; null, with the reason reported, if it is not one. */
function toRow(
  draft: Draft,
  town: string,
  page: number,
  columns: { nameX: number | null; addressX: number | null },
  warnings: Warning[],
): RawRow | null {
  const hours = normalizeHours(draft.hoursParts.map((cell) => cell.text).join(''));
  const weekdayOk =
    draft.date !== null && WEEKDAY_NUMBER.get(matchKey(draft.weekday)) === isoWeekday(draft.date);
  const phone = draft.phones[0];
  const flag = draft.flags[0]?.text;
  if (
    !draft.date ||
    !hours ||
    phone === undefined ||
    draft.phones.length !== 1 ||
    !flag ||
    draft.flags.length !== 1 ||
    !weekdayOk
  ) {
    warnings.push({
      code: 'unreadable-row',
      message:
        `page ${page} ${draft.item.text} (${town}): ` +
        `date ${draft.date ?? 'invalid'}, weekday "${draft.weekday}" ${weekdayOk ? 'ok' : 'wrong'}, ` +
        `hours "${draft.hoursParts.map((cell) => cell.text).join(' ')}", ` +
        `phones [${draft.phones.join(', ')}], flags [${draft.flags.map((f) => f.text).join(', ')}]`,
    });
    return null;
  }

  // Name and address: the first line's left part and right part, else this page's usual places;
  // later lines follow the nearer of the two columns.
  const firstLine = draft.text.filter((cell) => Math.abs(cell.y - draft.item.y) <= ABOVE_TOLERANCE);
  let { nameX, addressX } = columns;
  if (firstLine.length >= 2) {
    nameX = firstLine[0]?.x ?? nameX;
    addressX = firstLine.at(-1)?.x ?? addressX;
  }
  const nameLines: Cell[] = [];
  const addressLines: Cell[] = [];
  for (const cell of draft.text) {
    const toName =
      nameX === null || addressX === null
        ? true
        : Math.abs(cell.x - nameX) <= Math.abs(cell.x - addressX);
    (toName ? nameLines : addressLines).push(cell);
  }
  return {
    row: { town, date: draft.date, hours, overnight: flag === 'Ναι', phone, name: null, page },
    reading: {
      name: cleanDisplay(joinLines(nameLines.map((cell) => cell.text))),
      address: cleanDisplay(joinLines(addressLines.map((cell) => cell.text))),
    },
  };
}

/** The last row of a page, with the lines that went on at the top of the next one. */
function finishRow(open: OpenRow, more: readonly Cell[], warnings: Warning[]): RawRow | null {
  // They come after the row's own lines.
  const later = more.map((cell) => ({ ...cell, y: cell.y - 10_000 }));
  const draft = partsOf(open.item, [...open.cells, ...later]);
  return toRow(draft, open.town, open.page, { nameX: null, addressX: null }, warnings);
}

/** Varda's rows: date and weekday, the pharmacist, "ΔΙΑΝΥΚΤΕΡΕΥΣΗ" and the area. */
function readNamedRows(
  starts: readonly { item: TextItem; cells: Cell[] }[],
  town: string,
  page: number,
  rows: RawRow[],
  warnings: Warning[],
): void {
  for (const { item, cells } of starts) {
    const [, day = '', month = '', yearText = '', weekday = ''] = DATE.exec(item.text) ?? [];
    const date = isoDate(day, month, yearText);
    const name = cleanDisplay(
      joinLines(
        cells
          .filter(
            (cell) =>
              cell.text !== 'ΝΑΙ' &&
              cell.text !== 'ΔΙΑΝΥΚΤΕΡΕΥΣΗ' &&
              matchKey(cell.text) !== matchKey(town),
          )
          .sort(byLine)
          .map((cell) => cell.text),
      ),
    );
    if (!date || WEEKDAY_NUMBER.get(matchKey(weekday)) !== isoWeekday(date) || name === '') {
      warnings.push({
        code: 'unreadable-row',
        message: `page ${page} ${item.text} (${town}): date, weekday or pharmacist not readable`,
      });
      continue;
    }
    rows.push({
      row: { town, date, hours: null, overnight: true, phone: null, name, page },
      reading: null,
    });
  }
}

/**
 * The rows of one page. `start` is the town in force at the top of it; the page may begin
 * another one, whose heading then comes first. `held` is what the page before left.
 */
function readPage(
  items: readonly TextItem[],
  page: number,
  start: { town: string | null; year: number | null },
  held: Held,
  warnings: Warning[],
): PageRead {
  let lastTown = start.town;
  let year = start.year;
  const rows: RawRow[] = [];
  let nextHeld: Held = { tail: [], open: null };

  // Split the page at its headings: each starts a section with its own town.
  const sections: { town: string | null; items: TextItem[] }[] = [{ town: start.town, items: [] }];
  for (const item of items) {
    const text = squash(item.text);
    if (text === '' || HEADER_LABELS.has(text) || text.startsWith('ΑΔΑ:')) continue;
    const heading = HEADING.exec(text);
    if (heading && item.height >= 9.5) {
      lastTown = squash(heading[1] ?? '');
      year = Number(heading[2]);
      sections.push({ town: lastTown, items: [] });
      continue;
    }
    // A date run together with what follows it ("7/7/2026, Τρίτη ΜΠΑΚΕΛΑΣ 2623061231 ΑΘΑΝΑΣΙΟΣ").
    const joined = DATE_AND_MORE.exec(text);
    if (item.x < DATE_COLUMN_MAX_X && joined && !DATE.test(text)) {
      const [, day = '', month = '', yearText = '', weekday = '', more = ''] = joined;
      const weekdayKnown = WEEKDAY_NUMBER.has(matchKey(weekday));
      const rest = squash(`${weekdayKnown ? '' : weekday} ${more}`);
      sections.at(-1)?.items.push({
        ...item,
        text: `${day}/${month}/${yearText},${weekdayKnown ? ` ${weekday}` : ''}`,
      });
      sections.at(-1)?.items.push({ ...item, x: item.x + 60, text: rest });
      continue;
    }
    sections.at(-1)?.items.push({ ...item, text });
  }

  let tailLeft: readonly Cell[] = held.tail;
  let open = held.open;
  for (const section of sections) {
    if (section.town === null) continue;
    const town = section.town;
    const isLastSection = section === sections.at(-1);
    const named = section.items.some((item) => item.text === 'ΔΙΑΝΥΚΤΕΡΕΥΣΗ');
    const dates = section.items.filter(
      (item) => item.x < DATE_COLUMN_MAX_X && DATE.test(item.text),
    );
    const collapsed = section.items.filter((item) => COLLAPSED.test(item.text));

    for (const item of collapsed) {
      const [, dateText = '', hoursText = '', , phone = '', flag = '', weekday = ''] =
        COLLAPSED.exec(item.text) ?? [];
      const [day = '', month = '', yearText = ''] = dateText.split('/');
      const date = isoDate(day, month, yearText);
      const hours = normalizeHours(hoursText);
      if (!date || !hours || WEEKDAY_NUMBER.get(matchKey(weekday)) !== isoWeekday(date)) {
        warnings.push({
          code: 'unreadable-row',
          message: `page ${page}: "${item.text}" is not a duty (date, hours or weekday)`,
        });
        continue;
      }
      rows.push({
        row: { town, date, hours, overnight: flag === 'Ναι', phone, name: null, page },
        reading: null,
      });
    }

    // Every other item goes to the nearest date at or above it.
    const starts = dates
      .map((item) => ({ item, cells: [] as Cell[] }))
      .sort((a, b) => b.item.y - a.item.y);
    const orphans: Cell[] = [];
    for (const item of section.items) {
      if (dates.includes(item) || collapsed.includes(item)) continue;
      let owner: (typeof starts)[number] | undefined;
      for (const candidate of starts) {
        if (candidate.item.y >= item.y - ABOVE_TOLERANCE) owner = candidate;
        else break;
      }
      const cell = { x: item.x, y: item.y, text: item.text };
      if (owner) owner.cells.push(cell);
      else orphans.push(cell);
    }

    // What stands above the first date goes on with the row the page before ended with.
    if (open) {
      const row = finishRow(open, open.town === town ? orphans : [], warnings);
      if (row) rows.push(row);
      open = null;
    } else {
      for (const orphan of orphans) {
        if (/^(Ναι|Όχι)$/.test(orphan.text) || /\d:\d/.test(orphan.text)) {
          warnings.push({
            code: 'orphan-cell',
            message: `page ${page}: "${orphan.text}" stands above the first date of its page`,
          });
        }
      }
    }

    if (named) {
      readNamedRows(starts, town, page, rows, warnings);
      continue;
    }

    const drafts = starts.map(({ item, cells }) => partsOf(item, cells));

    // The last row of the page may be followed by the rest of a row the page break cut: from a
    // flag well below the row's own line, everything at or below that line is the cut row's.
    let tail: Cell[] = [];
    const last = starts.at(-1);
    if (last && isLastSection) {
      const stray = partsOf(last.item, last.cells)
        .flags.filter((flag) => flag.y < last.item.y - TAIL_GAP)
        .sort((a, b) => b.y - a.y)[0];
      if (stray) {
        const below = (cell: Cell) => cell.y <= stray.y + ABOVE_TOLERANCE;
        tail = last.cells.filter(below);
        last.cells = last.cells.filter((cell) => !below(cell));
        drafts[drafts.length - 1] = partsOf(last.item, last.cells);
      }
    }
    // A row that has a date but no flag is the first half of a cut row, and the rest is a tail: the
    // one the page before left, then this page's own (a page can start with the cut row and end
    // with what completes it). A tail that finds no such row is a row printed twice, once at the
    // foot of a page and whole on the next.
    for (const cells of [tailLeft, tail]) {
      if (cells.length === 0) continue;
      const index = drafts.findIndex((draft) => draft.flags.length === 0);
      const cut = starts[index];
      if (cut) {
        cut.cells = [...cut.cells, ...cells];
        drafts[index] = partsOf(cut.item, cut.cells);
      } else if (cells === tail) {
        nextHeld = { ...nextHeld, tail: cells };
      }
    }
    tailLeft = [];

    // The last row is finished by the lines at the top of the next page, if it has any.
    let emitted = drafts;
    if (last && isLastSection) {
      nextHeld = { ...nextHeld, open: { town, item: last.item, cells: last.cells, page } };
      emitted = drafts.slice(0, -1);
    }

    // Where the name and the address start on this page: from the rows whose first line shows both.
    const nameXs: number[] = [];
    const addressXs: number[] = [];
    for (const draft of drafts) {
      const line = draft.text.filter((cell) => Math.abs(cell.y - draft.item.y) <= ABOVE_TOLERANCE);
      if (line.length >= 2) {
        nameXs.push(line[0]?.x ?? 0);
        addressXs.push(line.at(-1)?.x ?? 0);
      }
    }
    const columns = { nameX: median(nameXs), addressX: median(addressXs) };
    for (const draft of emitted) {
      const row = toRow(draft, town, page, columns, warnings);
      if (row) rows.push(row);
    }
  }
  return { rows, town: lastTown, year, held: nextHeld };
}

/** Reads every row of the table from the PDF's text items (pdf.ts, `extractTextItems`). */
export function parseDutyTable(items: readonly TextItem[]): Table {
  const warnings: Warning[] = [];
  const byPage = new Map<number, TextItem[]>();
  for (const item of items) byPage.set(item.page, [...(byPage.get(item.page) ?? []), item]);

  let town: string | null = null;
  let year: number | null = null;
  let held: Held = { tail: [], open: null };
  const raw: RawRow[] = [];
  for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
    const read = readPage(byPage.get(page) ?? [], page, { town, year }, held, warnings);
    town = read.town;
    year = read.year;
    held = read.held;
    raw.push(...read.rows);
  }
  const lastRow = held.open ? finishRow(held.open, [], warnings) : null;
  if (lastRow) raw.push(lastRow);
  if (year === null) throw new Error('No town heading ("ΑΜΑΛΙΑΔΑ 2026") in the duty table');

  // A pharmacy's name and address: what most of its rows agree on, preferring a reading that has
  // both over one whose address was merged into the name.
  const readings = new Map<string, Map<string, { reading: Reading; count: number }>>();
  const townOf = new Map<string, string>();
  const named = new Map<string, TablePharmacy>();
  for (const { row, reading } of raw) {
    if (row.phone === null) {
      const name = row.name ?? '';
      named.set(`${row.town}|${matchKey(name)}`, {
        phone: null,
        town: row.town,
        name,
        address: '',
      });
      continue;
    }
    const known = townOf.get(row.phone);
    if (known !== undefined && known !== row.town) {
      warnings.push({
        code: 'phone-in-two-towns',
        message: `${row.phone} is in ${known} and ${row.town} (page ${row.page})`,
      });
    }
    townOf.set(row.phone, known ?? row.town);
    if (!reading || reading.name === '') continue;
    const key = `${reading.name}|${reading.address}`;
    const forPhone = readings.get(row.phone) ?? new Map();
    forPhone.set(key, { reading, count: (forPhone.get(key)?.count ?? 0) + 1 });
    readings.set(row.phone, forPhone);
  }
  const pharmacies: TablePharmacy[] = [];
  for (const [phone, phoneTown] of townOf) {
    const options = [...(readings.get(phone)?.values() ?? [])].sort(
      (a, b) =>
        Number(b.reading.address !== '') - Number(a.reading.address !== '') ||
        b.count - a.count ||
        // A line cut off is shorter than the name.
        b.reading.name.length - a.reading.name.length ||
        a.reading.name.localeCompare(b.reading.name, 'el'),
    );
    const best = options[0]?.reading;
    if (!best) {
      warnings.push({ code: 'no-name', message: `${phone} (${phoneTown}) has no readable name` });
      continue;
    }
    pharmacies.push({ phone, town: phoneTown, name: best.name, address: best.address });
  }
  pharmacies.sort((a, b) => (a.phone ?? '').localeCompare(b.phone ?? ''));
  pharmacies.push(...[...named.values()].sort((a, b) => a.name.localeCompare(b.name, 'el')));

  return { year, rows: raw.map(({ row }) => row), pharmacies, warnings };
}
