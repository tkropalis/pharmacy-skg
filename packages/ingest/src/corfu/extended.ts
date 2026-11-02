/**
 * Corfu's extended hours: every two months the Region of the Ionian Islands posts on Diavgeia the
 * table of the association's pharmacies whose hours go beyond the regular ones ("ΠΙΝΑΚΑΣ ΕΝΤΑΞΗΣ
 * ΦΑΡΜΑΚΟΠΟΙΩΝ ΤΟΥ ΦΣΚ ΣΤΟ ΔΙΕΥΡΥΜΕΝΟ ΩΡΑΡΙΟ"). Word drew it as two columns with a rule
 * under every row: the pharmacists' names on the left (a company, or several licensees of one
 * pharmacy, with "ΣΥΣΤΕΓΑΣΜΕΝΑ ΦΑΡΜΑΚΕΙΑ" for those sharing a shop), the hours on the right, typed
 * freely by the association: "ΔΕΥΤΕΡΑ-ΠΑΡΑΣΚΕΥΗ" / "8:30-21:00", "ΣΑΒΒΑΤΟ" / "9:00-14:00",
 * "ΠΕΜΠΤΗ 24/12/26 & ΠΕΜΠΤΗ 31/12/26" / "8:30-15:30". A row with no hours is listed without
 * any: that pharmacy keeps its regular hours.
 *
 * The reader is strict, as fsa/hours.ts is: a row whose hours it cannot read for certain, or whose
 * names do not point to exactly one member (pharmacists share surnames), is reported and left
 * out, and that pharmacy keeps its regular hours. Never guess what was meant.
 *
 * Fixture: fixtures/diavgeia/corfu-2026-11_ΡΡ6Ζ7ΛΕ-ΤΔΖ.pdf (Nov–Dec 2026).
 */
import { addDays, holidaysOn, isoWeekday, regularRanges, CORFU } from '@pharmacy-skg/core';
import { withMornings } from '../fsa/hours.ts';
import type { PdfPage } from '../pdf.ts';
import type { Schedule, TimeRange } from '../pkm/parse.ts';
import type { Warning } from '../registry/build.ts';
import { sameStreetAddress } from '../registry/names.ts';
import { matchKey, squash } from '../text.ts';
import { scheduleText } from '../fsa/hours.ts';
import type { RosterEntry } from '../cities/pipeline.ts';

export class UnreadableRowError extends Error {}

export interface TableRow {
  /** The names cell, one string per line. */
  readonly names: readonly string[];
  /** The hours cell, one string per line. */
  readonly hours: readonly string[];
}

/** A rule this wide and this thin is the bottom of a row. */
const MIN_RULE_WIDTH = 100;
const MAX_RULE_HEIGHT = 2.5;

function lines(items: readonly { x: number; y: number; text: string }[]): string[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const out: { y: number; parts: string[] }[] = [];
  for (const item of sorted) {
    const last = out.at(-1);
    if (last && Math.abs(last.y - item.y) <= 3) last.parts.push(item.text);
    else out.push({ y: item.y, parts: [item.text] });
  }
  return out.map((line) => squash(line.parts.join(' '))).filter((line) => line !== '');
}

/** The table's rows in order: the cells between each pair of rules, split at the column rule. */
export function readCorfuTable(pages: readonly PdfPage[]): TableRow[] {
  const rows: TableRow[] = [];
  for (const page of pages) {
    const rules = page.boxes.filter(
      (b) => b.y1 - b.y0 <= MAX_RULE_HEIGHT && b.x1 - b.x0 >= MIN_RULE_WIDTH,
    );
    if (rules.length === 0) continue;
    const left = Math.min(...rules.map((b) => b.x0));
    const right = Math.max(...rules.map((b) => b.x1));
    const middle = (left + right) / 2;
    const ys = rules
      .map((b) => (b.y0 + b.y1) / 2)
      .sort((a, b) => b - a)
      .filter((y, i, all) => i === 0 || (all[i - 1] ?? 0) - y > 3);
    for (let i = 0; i + 1 < ys.length; i++) {
      const top = ys[i] ?? 0;
      const bottom = ys[i + 1] ?? 0;
      const inside = page.items.filter((item) => item.y < top && item.y > bottom);
      const names = lines(inside.filter((item) => item.x < middle));
      const hours = lines(inside.filter((item) => item.x >= middle));
      const before = rows.at(-1);
      // A row with no names is the rest of the hours cell of the row above, run onto this page.
      if (names.length === 0 && hours.length > 0 && before) {
        rows[rows.length - 1] = { names: before.names, hours: [...before.hours, ...hours] };
      } else {
        rows.push({ names, hours });
      }
    }
  }
  return rows;
}

// --- Hours ----------------------------------------------------------------------------------

const WEEKDAY_WORDS: Readonly<Record<string, number>> = {
  ΔΕΥΤΕΡΑ: 1,
  ΤΡΙΤΗ: 2,
  ΤΕΤΑΡΤΗ: 3,
  ΠΕΜΠΤΗ: 4,
  ΠΑΡΑΣΚΕΥΗ: 5,
  ΣΑΒΒΑΤΟ: 6,
};

const MONTH_WORDS: Readonly<Record<string, number>> = {
  ΝΟΕΜΒΡΙΟΥ: 11,
  ΔΕΚΕΜΒΡΙΟΥ: 12,
  ΙΑΝΟΥΑΡΙΟΥ: 1,
  ΦΕΒΡΟΥΑΡΙΟΥ: 2,
  ΜΑΡΤΙΟΥ: 3,
  ΑΠΡΙΛΙΟΥ: 4,
  ΜΑΙΟΥ: 5,
  ΙΟΥΝΙΟΥ: 6,
  ΙΟΥΛΙΟΥ: 7,
  ΑΥΓΟΥΣΤΟΥ: 8,
  ΣΕΠΤΕΜΒΡΙΟΥ: 9,
  ΟΚΤΩΒΡΙΟΥ: 10,
};

const pad = (n: number | string) => String(n).padStart(2, '0');
const RANGE = /^(\d{1,2})[:.](\d{2})-(\d{1,2})[:.](\d{2})$/;

/** "8:30-15:00& 17:30-20:30" as ranges; throws on anything else. */
function parseRanges(text: string): TimeRange[] {
  const ranges = text
    .replace(/\s+/g, '')
    .split('&')
    .map((part) => {
      const m = RANGE.exec(part);
      if (!m) throw new UnreadableRowError(`not hours: "${text}"`);
      const [, h1 = '', m1 = '', h2 = '', m2 = ''] = m;
      const range = { from: `${pad(h1)}:${m1}`, to: `${pad(h2)}:${m2}` };
      if (Number(h1) > 23 || Number(h2) > 23 || Number(m1) > 59 || Number(m2) > 59) {
        throw new UnreadableRowError(`not hours: "${text}"`);
      }
      if (range.from >= range.to) throw new UnreadableRowError(`not hours: "${text}"`);
      return range;
    });
  return ranges;
}

type DaySpec =
  | { readonly kind: 'weekdays'; readonly words: readonly string[] }
  | { readonly kind: 'dates'; readonly dates: readonly string[] };

/** A line that names days: weekdays joined by hyphens, or dates. Null when it is neither. */
function parseDaySpec(line: string, year: number): DaySpec | null {
  const text = squash(line);
  const key = matchKey(text);
  // "ΔΕΥΤΕΡΑ-ΠΑΡΑΣΚΕΥΗ", "ΤΕΤΑΡΤΗ", "ΔΕΥΤΕΡΑ-ΤΡΙΤΗ-ΠΕΜΠΤΗ-ΠΑΡΑΣΚΕΥΗ"
  const words = text.split('-').map((word) => matchKey(word));
  if (words.length > 0 && words.every((word) => WEEKDAY_WORDS[word] !== undefined)) {
    return { kind: 'weekdays', words };
  }
  if (!/\d/.test(key)) return null;
  const dates: string[] = [];
  for (const part of text.split('&')) {
    // "ΠΕΜΠΤΗ 24/12/26", "24/12", "ΣΑΒΒΑΤΟ 19 ΔΕΚΕΜΒΡΙΟΥ"
    const m = /^(?:(\p{L}+)\s+)?(\d{1,2})(?:\/(\d{1,2})(?:\/(\d{2,4}))?|\s+(\p{L}+))$/u.exec(
      part.trim(),
    );
    if (!m) return null;
    const [, weekdayWord, day = '', slashMonth, slashYear, monthWord] = m;
    const month =
      slashMonth !== undefined ? Number(slashMonth) : MONTH_WORDS[matchKey(monthWord ?? '')];
    if (month === undefined || month < 1 || month > 12) return null;
    const fullYear =
      slashYear === undefined
        ? year
        : Number(slashYear) < 100
          ? 2000 + Number(slashYear)
          : Number(slashYear);
    const date = `${fullYear}-${pad(month)}-${pad(day)}`;
    if (Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return null;
    if (weekdayWord !== undefined) {
      const expected = WEEKDAY_WORDS[matchKey(weekdayWord)];
      // A weekday that is not the date's is a typo: not read.
      if (expected === undefined || expected !== isoWeekday(date)) return null;
    }
    dates.push(date);
  }
  return dates.length > 0 ? { kind: 'dates', dates } : null;
}

/** Notes that only repeat what a schedule already does: official holidays are never regular days. */
const IGNORABLE = /^(ΕΚΤΟΣ|ΠΛΗΝ) (ΕΠΙΣΗΜΩΝ )?ΑΡΓΙΩΝ$/;

/**
 * The weekdays a "ΔΕΥΤΕΡΑ-ΠΑΡΑΣΚΕΥΗ" line means. Two words are a range (Mon–Fri) unless it would
 * take a weekday another line gives ("ΔΕΥΤΕΡΑ-ΤΡΙΤΗ-ΠΕΜΠΤΗ-ΠΑΡΑΣΚΕΥΗ" then "ΤΕΤΑΡΤΗ-ΣΑΒΒΑΤΟ" is
 * Wednesday and Saturday); a range that would run into Saturday with nothing to settle it is not
 * read. More than two words are the days listed.
 */
function weekdaysOf(words: readonly string[], taken: ReadonlySet<number>): number[] {
  const days = words.map((word) => WEEKDAY_WORDS[word] ?? 0);
  if (days.length !== 2) return days;
  const [from = 0, to = 0] = days;
  if (from >= to) throw new UnreadableRowError(`not a range of weekdays: ${words.join('-')}`);
  const range = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  if (range.some((day) => taken.has(day))) return days;
  if (to === 6 && range.length > 2) {
    throw new UnreadableRowError(
      `a range into Saturday with nothing to settle it: ${words.join('-')}`,
    );
  }
  return range;
}

export interface ReadHours {
  readonly schedule: Schedule;
  readonly text: string;
}

/**
 * The hours cell as a schedule over the table's period. Weekdays given alone make a weekly
 * schedule; a cell with dated lines ("24/12 & 31/12") makes a dated one, every day of the period
 * written out, since the two cannot be mixed. As ΦΣΑ's pharmacies do, some list only what they add
 * ("14:00-21:00"): a listed weekday with no hours before noon keeps its regular morning.
 */
export function readCorfuHours(
  cell: readonly string[],
  period: { readonly from: string; readonly to: string },
): ReadHours {
  const year = Number(period.from.slice(0, 4));
  const groups: { spec: DaySpec; ranges: TimeRange[] }[] = [];
  let pending: DaySpec | null = null;
  for (const raw of cell) {
    // A location hint in brackets ("(ΣΑΜΑΡΑ 7-9)") says which shop; it is not hours.
    const line = squash(raw.replace(/\([^)]*\)/g, ' '));
    if (line === '') continue;
    if (IGNORABLE.test(matchKey(line))) continue;
    const spec = parseDaySpec(line, year);
    if (spec) {
      if (pending) throw new UnreadableRowError(`days with no hours: "${line}"`);
      pending = spec;
      continue;
    }
    if (!pending) throw new UnreadableRowError(`hours with no days, or not understood: "${line}"`);
    groups.push({ spec: pending, ranges: parseRanges(line) });
    pending = null;
  }
  if (pending || groups.length === 0) throw new UnreadableRowError('no hours');

  const weekly = new Map<number, TimeRange[]>();
  const dated = new Map<string, TimeRange[]>();
  const taken = new Set(
    groups.flatMap((g) =>
      g.spec.kind === 'weekdays' && g.spec.words.length !== 2
        ? g.spec.words.map((w) => WEEKDAY_WORDS[w] ?? 0)
        : [],
    ),
  );
  for (const { spec, ranges } of groups) {
    if (spec.kind === 'weekdays') {
      for (const day of weekdaysOf(spec.words, taken)) {
        if (weekly.has(day)) throw new UnreadableRowError(`weekday ${day} given twice`);
        weekly.set(day, ranges);
      }
    } else {
      for (const date of spec.dates) {
        if (date < period.from || date > period.to) {
          throw new UnreadableRowError(`${date} is outside ${period.from} to ${period.to}`);
        }
        if (dated.has(date)) throw new UnreadableRowError(`${date} given twice`);
        dated.set(date, ranges);
      }
    }
  }

  const mornings = new Map<number, readonly TimeRange[]>();
  for (let d = 0; d < 7; d++) {
    const date = addDays(period.from, d);
    mornings.set(
      isoWeekday(date),
      regularRanges(CORFU.id, date).filter((range) => range.to <= '15:00'),
    );
  }
  const holidays = new Set<string>();
  for (let date = period.from; date <= period.to; date = addDays(date, 1)) {
    if (holidaysOn(CORFU.id, date, CORFU.defaultGroupId).length > 0) holidays.add(date);
  }

  let schedule: Schedule;
  if (dated.size === 0) {
    schedule = { type: 'weekly', days: Object.fromEntries(weekly) };
  } else {
    // Every day of the period: the weekly hours on ordinary days, the dated ones over them.
    const dates: Record<string, TimeRange[]> = {};
    for (let date = period.from; date <= period.to; date = addDays(date, 1)) {
      const own = dated.get(date);
      const ranges = own ?? (holidays.has(date) ? undefined : weekly.get(isoWeekday(date)));
      if (ranges) dates[date] = ranges;
    }
    schedule = { type: 'dates', dates };
  }
  schedule = withMornings(schedule, (weekday) => mornings.get(weekday) ?? [], holidays);
  return { schedule, text: scheduleText(schedule) };
}

// --- Names ----------------------------------------------------------------------------------

/** Words of a name that say nothing about who it is. */
const NOISE = new Set([
  'ΣΙΑ',
  'ΜΙΚΕ',
  'ΣΥΣΤΕΓΑΣΜΕΝΑ',
  'ΦΑΡΜΑΚΕΙΑ',
  'ΦΑΡΜΑΚΕΙΟ',
  'ΑΦΩΝ',
  'ΔΗΜΟΤΙΚΗ',
  'ΕΝΟΤΗΤΑ',
  'ΚΑΙ',
]);

/** Short and long forms of the same first name: the table writes "ΣΠΥΡΟΣ", the members "ΣΠΥΡΙΔΩΝΑΣ". */
const FIRST_NAMES: Readonly<Record<string, string>> = {
  ΣΠΥΡΟΣ: 'ΣΠΥΡΙΔΩΝ',
  ΣΠΥΡΙΔΩΝΑΣ: 'ΣΠΥΡΙΔΩΝ',
  ΓΙΩΡΓΟΣ: 'ΓΕΩΡΓΙΟΣ',
  ΝΙΚΟΣ: 'ΝΙΚΟΛΑΟΣ',
  ΚΩΣΤΑΣ: 'ΚΩΝΣΤΑΝΤΙΝΟΣ',
  ΜΙΧΑΛΗΣ: 'ΜΙΧΑΗΛ',
  ΔΗΜΗΤΡΗΣ: 'ΔΗΜΗΤΡΙΟΣ',
  ΒΑΣΙΛΗΣ: 'ΒΑΣΙΛΕΙΟΣ',
  ΑΝΤΩΝΗΣ: 'ΑΝΤΩΝΙΟΣ',
  ΘΑΝΑΣΗΣ: 'ΑΘΑΝΑΣΙΟΣ',
};

function words(text: string): string[] {
  return matchKey(text)
    .split(' ')
    .filter((word) => word.length > 2 && !NOISE.has(word))
    .map((word) => FIRST_NAMES[word] ?? word);
}

/** Equal, or a letter apart in a long word (the table spells "ΝΙΚΟΛΕΤΑ" for "ΝΙΚΟΛΕΤΤΑ"). */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 6 || b.length < 6 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const tail = (s: string) => s.slice(i);
  return (
    tail(a).slice(1) === tail(b).slice(1) ||
    tail(a).slice(1) === tail(b) ||
    tail(a) === tail(b).slice(1)
  );
}

/**
 * The one member a names cell points to: the roster pharmacy sharing most words with it, and
 * only if no other shares as many. Several pharmacies of one family or one pharmacist ("ΚΑΤΣΩΡΑ
 * ΑΦΡΟΔΙΤΗ" has four) are told apart by the place in brackets in either cell; if that does not
 * settle it, the row is left out.
 */
export function matchMember(
  names: readonly string[],
  hints: readonly string[],
  roster: readonly RosterEntry[],
): RosterEntry | string {
  const wanted = names.flatMap((line) => words(line.replace(/\([^)]*\)/g, ' ')));
  if (wanted.length === 0) return 'no names';
  const fitsHint = (entry: RosterEntry) =>
    hints.some(
      (hint) =>
        matchKey(`${entry.address} ${entry.locality}`).includes(matchKey(hint)) ||
        sameStreetAddress(entry.address, hint),
    );
  let best: RosterEntry[] = [];
  let bestScore = 0;
  for (const entry of roster) {
    const have = words(entry.name);
    // A first name alone never makes a match: one surname at least must be the member's.
    const surnames = entry.name.split(' - ').map((person) => words(person)[0] ?? '');
    const hit = (w: string) => (list: readonly string[]) => list.some((h) => sameWord(w, h));
    if (!wanted.some((w) => hit(w)(surnames))) continue;
    const score = new Set(wanted.filter((w) => hit(w)(have))).size;
    if (score > bestScore) {
      best = [entry];
      bestScore = score;
    } else if (score === bestScore) {
      best.push(entry);
    }
  }
  if (bestScore === 0) return 'no member with these names';
  if (best.length > 1 && hints.length > 0) {
    const narrowed = best.filter(fitsHint);
    if (narrowed.length > 0) best = narrowed;
  }
  const [only] = best;
  if (!only || best.length > 1) {
    return `${best.length} members fit: ${best.map((entry) => entry.name).join(' / ')}`;
  }
  // The place in brackets says which of a pharmacist's shops: a member elsewhere is not it.
  if (hints.length > 0 && !fitsHint(only)) {
    return `${only.name} is at ${only.address}, not ${hints.join(' / ')}`;
  }
  return only;
}

/** The text in brackets of a cell's lines. */
function hintsOf(cell: readonly string[]): string[] {
  return cell.flatMap((line) => [...line.matchAll(/\(([^)]*)\)/g)].map((m) => squash(m[1] ?? '')));
}

export interface ReadEntry {
  readonly member: RosterEntry;
  readonly hours: ReadHours;
}

/**
 * Every row of the table that gives hours, matched to the roster. Rows with no hours are the
 * association's members with nothing to add. The rest that cannot be read or matched are
 * reported with the row as printed.
 */
export function readCorfuExtended(
  rows: readonly TableRow[],
  roster: readonly RosterEntry[],
  period: { readonly from: string; readonly to: string },
): { entries: ReadEntry[]; failures: Warning[]; withHours: number } {
  const entries: ReadEntry[] = [];
  const failures: Warning[] = [];
  const seen = new Set<string>();
  let withHours = 0;
  for (const row of rows) {
    if (row.hours.length === 0) continue;
    withHours++;
    const printed = `${row.names.join(' ')} | ${row.hours.join(' ')}`;
    try {
      const hours = readCorfuHours(row.hours, period);
      const member = matchMember(row.names, [...hintsOf(row.names), ...hintsOf(row.hours)], roster);
      if (typeof member === 'string') throw new UnreadableRowError(member);
      if (seen.has(member.phone)) {
        throw new UnreadableRowError(`${member.name} is already given hours by an earlier row`);
      }
      seen.add(member.phone);
      entries.push({ member, hours });
    } catch (error) {
      if (!(error instanceof UnreadableRowError)) throw error;
      failures.push({
        code: 'extended-unread',
        message: `${period.from.slice(0, 7)}: ${error.message}; left out: ${printed}`,
      });
    }
  }
  return { entries, failures, withHours };
}
