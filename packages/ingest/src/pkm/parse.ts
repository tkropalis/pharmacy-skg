import { normalizeTime } from '../fsth/heading.ts';
import { cleanDisplay, squash } from '../text.ts';
import type { Sheet } from './xlsx.ts';

export interface TimeRange {
  readonly from: string;
  readonly to: string;
}

/**
 * Opening hours as published. Most pharmacies give hours per weekday; some
 * give hours per date instead. A day that is not listed has no extended hours.
 */
export type Schedule =
  | { readonly type: 'weekly'; readonly days: Readonly<Partial<Record<number, TimeRange[]>>> }
  | { readonly type: 'dates'; readonly dates: Readonly<Record<string, TimeRange[]>> };

export interface ExtendedHoursEntry {
  readonly name: string;
  readonly address: string;
  readonly postcode: string;
  /** Δημοτική ενότητα, e.g. "Καλαμαριά". */
  readonly area: string;
  readonly schedule: Schedule;
  /** The Πρόγραμμα cell as published. */
  readonly scheduleText: string;
}

const WEEKDAYS: Readonly<Record<string, number>> = {
  Δευτέρα: 1,
  Τρίτη: 2,
  Τετάρτη: 3,
  Πέμπτη: 4,
  Παρασκευή: 5,
  Σάββατο: 6,
  Κυριακή: 7,
};

const HEADERS = {
  period: 'Περίοδος',
  name: 'Φαρμακείο',
  address: 'Διεύθυνση',
  postcode: 'Τ.Κ.',
  area: 'Δημοτική ενότητα',
  schedule: 'Πρόγραμμα',
} as const;

function parseRanges(text: string, context: string): TimeRange[] {
  const ranges: TimeRange[] = [];
  const rest = text.replace(
    /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g,
    (_, from: string, to: string) => {
      ranges.push({ from: normalizeTime(from), to: normalizeTime(to) });
      return ' ';
    },
  );
  if (ranges.length === 0 || rest.replace(/και|,/g, '').trim() !== '') {
    throw new Error(`${context}: cannot read hours "${text}"`);
  }
  return ranges;
}

/** Parses one Πρόγραμμα cell, e.g. "Δευτέρα: 08:00 - 14:30 και 17:00 - 21:00\nΣάββατο: 09:00 - 14:30". */
export function parseSchedule(cell: string, context = 'schedule'): Schedule {
  const days: Partial<Record<number, TimeRange[]>> = {};
  const dates: Record<string, TimeRange[]> = {};
  for (const rawLine of cell.split('\n')) {
    const line = squash(rawLine);
    if (!line) continue;
    const match = /^(\p{L}+)(?:\s+(\d{2})\/(\d{2})\/(\d{4}))?\s*:\s*(.+)$/u.exec(line);
    const [, dayName = '', day, month, year, hours = ''] = match ?? [];
    const weekday = WEEKDAYS[dayName];
    if (!match || !weekday) throw new Error(`${context}: cannot read "${line}"`);
    const ranges = parseRanges(hours, context);
    if (day && month && year) {
      const iso = `${year}-${month}-${day}`;
      const isoWeekday = ((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
      if (isoWeekday !== weekday) throw new Error(`${context}: ${dayName} is not ${iso}`);
      dates[iso] = [...(dates[iso] ?? []), ...ranges];
    } else {
      days[weekday] = [...(days[weekday] ?? []), ...ranges];
    }
  }
  const hasDays = Object.keys(days).length > 0;
  const hasDates = Object.keys(dates).length > 0;
  if (hasDays === hasDates)
    throw new Error(`${context}: expected weekdays or dates, not both or neither`);
  return hasDays ? { type: 'weekly', days } : { type: 'dates', dates };
}

/** Parses the ΠΚΜ extended-hours sheet ("Δεδομένα: Διευρυμένο ωράριο"). */
export function parseExtendedHours(sheet: Sheet): {
  periodLabel: string;
  entries: ExtendedHoursEntry[];
} {
  const headerIndex = sheet.findIndex((row) => row.some((cell) => squash(cell) === HEADERS.name));
  if (headerIndex < 0) throw new Error('No header row with "Φαρμακείο"');
  const header = (sheet[headerIndex] ?? []).map(squash);
  const column = (label: string) => {
    const index = header.indexOf(label);
    if (index < 0) throw new Error(`Missing column "${label}"`);
    return index;
  };
  const columns = {
    period: column(HEADERS.period),
    name: column(HEADERS.name),
    address: column(HEADERS.address),
    postcode: column(HEADERS.postcode),
    area: column(HEADERS.area),
    schedule: column(HEADERS.schedule),
  };

  const periods = new Set<string>();
  const entries: ExtendedHoursEntry[] = [];
  for (const [offset, row] of sheet.slice(headerIndex + 1).entries()) {
    if (row.every((cell) => squash(cell) === '')) continue;
    const cell = (index: number) => row[index] ?? '';
    const name = cleanDisplay(cell(columns.name));
    const context = `row ${headerIndex + offset + 2} (${name})`;
    periods.add(squash(cell(columns.period)));
    entries.push({
      name,
      address: cleanDisplay(cell(columns.address)),
      postcode: squash(cell(columns.postcode)),
      area: squash(cell(columns.area)),
      schedule: parseSchedule(cell(columns.schedule), context),
      scheduleText: cell(columns.schedule).trim(),
    });
  }
  const [periodLabel, ...others] = periods;
  if (periodLabel === undefined || others.length > 0) {
    throw new Error(`Expected one period, found ${[...periods].join(', ')}`);
  }
  return { periodLabel, entries };
}
