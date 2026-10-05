import type { TextItem } from '../pdf.ts';
import { required } from '../required.ts';
import { cleanDisplay, joinLines, matchKey, squash } from '../text.ts';
import { findAreaGroup } from './groups.ts';
import {
  isSectionHeading,
  parseExtraHours,
  parseHeading,
  type DutyKind,
  type ExtraHours,
  type TimeWindow,
} from './heading.ts';

export interface DutyEntry {
  readonly locality: string;
  readonly name: string;
  readonly address: string;
  /** Digits as printed: normally 10, but the source has typos. */
  readonly phone: string;
}

export interface DutySection {
  readonly kind: DutyKind;
  /** The heading exactly as printed. */
  readonly heading: string;
  /** Hours stated in the heading, or null when the heading states none. */
  readonly hours: TimeWindow | null;
  /** Extra hours read from the notes under the heading. */
  readonly extraHours: readonly ExtraHours[];
  /** Notes under the heading, as printed. */
  readonly notes: readonly string[];
  readonly entries: readonly DutyEntry[];
}

/** One ΦΣΘ PDF: the duty list of one area group for one day. */
export interface DutyList {
  readonly groupId: string;
  readonly groupName: string;
  /** ISO date (YYYY-MM-DD) of the duty day. */
  readonly date: string;
  readonly sections: readonly DutySection[];
}

// Font sizes used by the ΦΣΘ generator: 13 for the two title lines, 11 for
// section headings and their notes, 8 for table text.
const TITLE_MIN_HEIGHT = 12;
const HEADING_MIN_HEIGHT = 10;

const COLUMNS = ['locality', 'name', 'address', 'phone'] as const;
type Column = (typeof COLUMNS)[number];
const HEADER_LABELS: Readonly<Record<Column, string>> = {
  locality: 'Περιοχή',
  name: 'Όνομα',
  address: 'Διεύθυνση',
  phone: 'Τηλέφωνο',
};

const MONTHS: Readonly<Record<string, number>> = {
  ΙΑΝ: 1,
  ΦΕΒ: 2,
  ΜΑΡ: 3,
  ΑΠΡ: 4,
  ΜΑΙ: 5,
  ΙΟΥΝ: 6,
  ΙΟΥΛ: 7,
  ΑΥΓ: 8,
  ΣΕΠ: 9,
  ΟΚΤ: 10,
  ΝΟΕ: 11,
  ΔΕΚ: 12,
};

const WEEKDAY_NAMES = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'];

interface Line {
  readonly page: number;
  readonly y: number;
  readonly height: number;
  readonly items: readonly TextItem[];
  readonly text: string;
}

function toLines(items: readonly TextItem[]): Line[] {
  const lines: TextItem[][] = [];
  for (const item of items) {
    const last = lines.at(-1);
    const head = last?.[0];
    if (last && head && head.page === item.page && Math.abs(head.y - item.y) < 0.5) last.push(item);
    else lines.push([item]);
  }
  return lines.map((lineItems) => {
    const sorted = [...lineItems].sort((a, b) => a.x - b.x);
    const first = required(sorted[0], 'line item');
    return {
      page: first.page,
      y: first.y,
      height: Math.max(...sorted.map((item) => item.height)),
      items: sorted,
      text: squash(sorted.map((item) => item.text).join(' ')),
    };
  });
}

/** Parses "Εφημερεύοντα Φαρμακεία Σάββατο 03 Οκτ 2026" into an ISO date, checking the weekday. */
export function parseTitleDate(title: string): string {
  const match = /(\S+)\s+(\d{1,2})\s+(\S+)\s+(\d{4})\s*$/.exec(squash(title));
  if (!match) throw new Error(`No date in title: "${title}"`);
  const [, weekday = '', day = '', monthName = '', year = ''] = match;
  const month = MONTHS[matchKey(monthName)];
  if (!month) throw new Error(`Unknown month "${monthName}" in title: "${title}"`);
  const date = new Date(Date.UTC(Number(year), month - 1, Number(day)));
  if (date.getUTCDate() !== Number(day)) throw new Error(`Invalid date in title: "${title}"`);
  const expected = required(WEEKDAY_NAMES[date.getUTCDay()], 'weekday name');
  if (matchKey(expected) !== matchKey(weekday)) {
    throw new Error(`Weekday "${weekday}" does not match the date in title: "${title}"`);
  }
  return date.toISOString().slice(0, 10);
}

interface SectionDraft {
  heading: string;
  notes: string[];
  columns: Record<Column, number> | null;
  body: TextItem[];
}

function headerColumns(line: Line): Record<Column, number> | null {
  const centers: Partial<Record<Column, number>> = {};
  for (const column of COLUMNS) {
    const item = line.items.find((candidate) => squash(candidate.text) === HEADER_LABELS[column]);
    if (!item) return null;
    centers[column] = item.x + item.width / 2;
  }
  return centers as Record<Column, number>;
}

/**
 * Column boxes are contiguous and each header is centred in its box, so the
 * box edges follow from the header centres once the table's left edge is
 * known. Cells are left-aligned in their box, so an item belongs to the box
 * its left edge falls in. (Comparing centres fails for short names.)
 */
function columnEdges(columns: Record<Column, number>, tableLeft: number): number[] {
  const edges = [tableLeft];
  let left = tableLeft;
  for (const column of COLUMNS) {
    const right = 2 * columns[column] - left;
    if (right <= left) {
      throw new Error(`Cannot derive table columns from header centres ${JSON.stringify(columns)}`);
    }
    edges.push(right);
    left = right;
  }
  return edges;
}

function columnAt(x: number, edges: readonly number[]): Column {
  let found: Column = 'locality';
  COLUMNS.forEach((column, i) => {
    if (x >= (edges[i] ?? Infinity) - 1) found = column;
  });
  return found;
}

function buildEntries(draft: SectionDraft, context: string): DutyEntry[] {
  if (draft.body.length === 0) return [];
  const columns = draft.columns;
  if (!columns) throw new Error(`${context}: table rows without a header row`);

  // Every row has exactly one phone, on a single line, vertically centred in
  // the row. Wrapped cells spread their lines around that centre, so each
  // text item belongs to the nearest phone on the same page.
  const edges = columnEdges(columns, Math.min(...draft.body.map((item) => item.x)) - 1);
  const placed = draft.body.map((item) => ({ item, column: columnAt(item.x, edges) }));
  const anchors = placed.filter((p) => p.column === 'phone').map((p) => p.item);
  const rows = new Map<TextItem, Map<Column, TextItem[]>>(anchors.map((a) => [a, new Map()]));
  for (const { item, column } of placed) {
    let best: TextItem | undefined;
    for (const anchor of anchors) {
      if (anchor.page !== item.page) continue;
      if (!best || Math.abs(anchor.y - item.y) < Math.abs(best.y - item.y)) best = anchor;
    }
    if (!best || Math.abs(best.y - item.y) > 20) {
      throw new Error(`${context}: "${item.text}" is not next to any phone number`);
    }
    const cells = required(rows.get(best), 'row');
    cells.set(column, [...(cells.get(column) ?? []), item]);
  }

  return anchors.map((anchor) => {
    const cells = required(rows.get(anchor), 'row');
    const cell = (column: Column) =>
      joinLines((cells.get(column) ?? []).sort((a, b) => b.y - a.y).map((item) => item.text));
    const entry: DutyEntry = {
      locality: cleanDisplay(cell('locality')),
      name: cleanDisplay(cell('name')),
      address: cleanDisplay(cell('address')),
      phone: cell('phone').replace(/\s/g, ''),
    };
    // Only the shape is checked here. The source does contain typos (a
    // 9-digit number on 4 Oct 2026), which the registry and validation report.
    if (!/^\d{5,12}$/.test(entry.phone)) {
      throw new Error(`${context}: unexpected phone "${entry.phone}" for ${entry.name}`);
    }
    if (!entry.locality || !entry.name) {
      throw new Error(`${context}: incomplete row ${JSON.stringify(entry)}`);
    }
    return entry;
  });
}

/** Parses the text of one ΦΣΘ duty PDF. Throws on anything it does not recognise. */
export function parseDutyList(items: readonly TextItem[]): DutyList {
  const lines = toLines(items);
  const titles = lines.filter((line) => line.height >= TITLE_MIN_HEIGHT);
  // The first title line names the group; the date line wraps on long
  // weekday names ("…Παρασκευή 31 Ιουλ" / "2026").
  const [groupTitle, ...dateTitles] = titles;
  if (!groupTitle || dateTitles.length === 0 || dateTitles.length > 2) {
    throw new Error(`Expected 2 or 3 title lines, found ${titles.length}`);
  }
  const groupName = groupTitle.text;
  const group = findAreaGroup(groupName);
  if (!group) throw new Error(`Unknown area group: "${groupName}"`);
  const date = parseTitleDate(dateTitles.map((line) => line.text).join(' '));
  const context = `${group.id} ${date}`;

  const drafts: SectionDraft[] = [];
  let current: SectionDraft | undefined;
  for (const line of lines) {
    if (line.height >= TITLE_MIN_HEIGHT) continue;
    if (/ταξινόμηση/.test(line.text) || line.text === 'φαρμακείου') continue; // sort-order footer
    if (line.height >= HEADING_MIN_HEIGHT) {
      if (isSectionHeading(line.text)) {
        current = { heading: line.text, notes: [], columns: null, body: [] };
        drafts.push(current);
      } else if (current && !current.columns) {
        current.notes.push(line.text);
      } else {
        throw new Error(`${context}: unexpected line "${line.text}"`);
      }
      continue;
    }
    if (!current) throw new Error(`${context}: text before the first section: "${line.text}"`);
    const columns = headerColumns(line);
    if (columns) current.columns = columns;
    else current.body.push(...line.items);
  }

  const sections = drafts.map((draft): DutySection => {
    const { kind, hours } = parseHeading(draft.heading);
    // A note can wrap over several lines; read it as one sentence.
    const note = draft.notes.join(' ');
    const extra = note ? parseExtraHours(note) : null;
    return {
      kind,
      heading: draft.heading,
      hours,
      extraHours: extra ? [extra] : [],
      notes: note ? [note] : [],
      entries: buildEntries(draft, context),
    };
  });

  return { groupId: group.id, groupName: group.name, date, sections };
}
