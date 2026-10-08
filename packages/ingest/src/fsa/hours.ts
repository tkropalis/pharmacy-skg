/**
 * The hours each pharmacy declares in ΦΣΑ's extended-hours table, typed by the pharmacist in any
 * form ("ΔΕΥ-ΠΑΡ 8πμ-9μμ ΣΑΒ 9-15", "ΔΕΥΤΕΡΑ ΕΩΣ ΠΑΡΑΣΚΕΥΗ 08:00-21:00 ΚΑΙ ΣΑΒΒΑΤΟ 3/10, 17/10
 * 09.00-14.00") and printed in a font whose letters come out shifted (fsa/extended.ts). The
 * reader is strict: whatever it cannot read for certain, or reads as implausible ("8-9" for a
 * weekday, an afternoon written "5-8,30"), throws, and the row is left out, so the pharmacy keeps
 * its regular hours. Never guess what was meant.
 */
import type { Schedule, TimeRange } from '../pkm/parse.ts';

/** Why a cell was not read. */
export class UnreadableHoursError extends Error {}

/**
 * How the PDF prints each capital: one font shifts every letter from Δ on by one ("ΓΔΤΣΔΡΑ" for
 * ΔΕΥΤΕΡΑ), another only those from Σ on ("ΔΕΤΣΕΡΑ"), and lower case is shifted its own way
 * ("δεσηερα"), which reads as "ΔΕΣΗΕΡΑ" in capitals. Two letters can share a glyph (Γ for both Γ
 * and Δ), so text is matched against words letter by letter, never decoded.
 */
const SHIFTED: readonly Readonly<Record<string, string>>[] = [
  { Δ: 'Γ', Ε: 'Δ', Ζ: 'Ε', Η: 'Ζ', Ι: 'Η', Σ: '΢', Τ: 'Σ', Υ: 'Τ', Χ: 'Υ', Ω: 'Χ', Ψ: 'Φ' },
  { Σ: '΢', Τ: 'Σ', Υ: 'Τ' },
  { Σ: 'Ζ', Τ: 'Η', Υ: 'Σ', Χ: 'Τ', Φ: 'Θ' },
  // The second font's lower case: "ζωσ" for έως.
  { Ε: 'Ζ' },
];

/** Every way the letter can be printed. */
function printings(letter: string): Set<string> {
  return new Set([letter, ...SHIFTED.map((map) => map[letter] ?? letter)]);
}

const LETTERS = new Map<string, Set<string>>();
function printedAs(letter: string): Set<string> {
  let found = LETTERS.get(letter);
  if (!found) {
    found = printings(letter);
    LETTERS.set(letter, found);
  }
  return found;
}

/** Whether a printed word (capitals, no accents) is `word`, in any of the PDF's printings. */
export function printedWord(printed: string, word: string): boolean {
  const a = [...printed];
  const b = [...word];
  return a.length === b.length && a.every((c, i) => printedAs(b[i] ?? '').has(c));
}

type Word =
  | { readonly kind: 'day'; readonly day: number }
  | { readonly kind: 'to' }
  | { readonly kind: 'and' }
  | { readonly kind: 'skip' }
  | { readonly kind: 'am' }
  | { readonly kind: 'pm' }
  | { readonly kind: 'noon' }
  | { readonly kind: 'closed' };

const DAY_NAMES = ['ΔΕΥΤΕΡΑ', 'ΤΡΙΤΗ', 'ΤΕΤΑΡΤΗ', 'ΠΕΜΠΤΗ', 'ΠΑΡΑΣΚΕΥΗ', 'ΣΑΒΒΑΤΟ'] as const;

/** The words a cell may contain, each with every abbreviation people use for it. */
export const VOCABULARY: readonly (readonly [string, Word])[] = [
  ...DAY_NAMES.flatMap((name, i) =>
    // Any abbreviation of two letters or more: "ΔΕ", "ΤΡ", "ΠΑΡΑΣΚ".
    Array.from({ length: name.length - 1 }, (_, n): readonly [string, Word] => [
      name.slice(0, n + 2),
      { kind: 'day', day: i + 1 },
    ]),
  ),
  ...['ΕΩΣ', 'ΩΣ', 'ΜΕΧΡΙ', 'ΜΕ'].map((w) => [w, { kind: 'to' } as const] as const),
  ...['ΚΑΙ', 'Κ'].map((w) => [w, { kind: 'and' } as const] as const),
  ...['ΑΠΟ', 'ΣΥΝΕΧΕΣ', 'ΣΥΝΕΧΩΣ', 'ΩΡΑΡΙΟ', 'ΚΑΘΕ', 'ΤΟ', 'ΤΙΣ', 'ΣΤΙΣ', 'ΣΤΑ', 'ΩΡΑ'].map(
    (w) => [w, { kind: 'skip' } as const] as const,
  ),
  ...['ΠΜ', 'ΠΡΩΙ', 'ΠΡΩΙΝΟ'].map((w) => [w, { kind: 'am' } as const] as const),
  ...['ΜΜ', 'ΑΠΟΓΕΥΜΑ', 'ΑΠΟΓΕΥΜΑΤΟΣ', 'ΒΡΑΔΥ', 'ΒΡΑΔΙ'].map(
    (w) => [w, { kind: 'pm' } as const] as const,
  ),
  ...['ΜΕΣΗΜΕΡΙ', 'ΜΕΣΗΜΕΡΙΟΥ'].map((w) => [w, { kind: 'noon' } as const] as const),
  ...['ΚΛΕΙΣΤΑ', 'ΚΛΕΙΣΤΟ', 'ΚΛΕΙΣΤΟΙ'].map((w) => [w, { kind: 'closed' } as const] as const),
  ['ΣΑΒΒΑΤΑ', { kind: 'day', day: 6 }],
];

function lookUp(printed: string): Word | null {
  const found = VOCABULARY.filter(([word]) => printedWord(printed, word));
  // Two readings that disagree (they never do for the words above; see the tests) are no reading.
  const kinds = new Set(found.map(([, word]) => JSON.stringify(word)));
  return found.length > 0 && kinds.size === 1 ? (found[0]?.[1] ?? null) : null;
}

type Token =
  | Word
  | {
      readonly kind: 'time';
      readonly hour: number;
      readonly minute: number;
      readonly bare: boolean;
    }
  | {
      readonly kind: 'date';
      readonly day: number;
      readonly month: number;
      readonly year: number | null;
    }
  | { readonly kind: 'dash' };

const LATIN_TO_GREEK: Readonly<Record<string, string>> = {
  A: 'Α',
  B: 'Β',
  E: 'Ε',
  H: 'Η',
  I: 'Ι',
  K: 'Κ',
  M: 'Μ',
  N: 'Ν',
  O: 'Ο',
  P: 'Ρ',
  S: 'Σ',
  T: 'Τ',
  X: 'Χ',
  Y: 'Υ',
  Z: 'Ζ',
};

/** Capitals without accents, Latin look-alikes as Greek, "Π.Μ." as one word. */
function normalize(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toUpperCase()
      .replace(/[ABEHIKMNOPSTXYZ]/g, (c) => LATIN_TO_GREEK[c] ?? c)
      // A letter O typed for a zero: "21:ΟΟ".
      .replace(/(\d[:.])ΟΟ/g, '$100')
      .replace(/([ΠΜ])\.\s?Μ\.?/g, '$1Μ')
      .replace(/[–—−]/g, '-')
  );
}

const WORD = /^[\p{L}΢]+/u;
const DATE = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?(?!\d)/;
/** Hours and minutes; a slash may follow ("9.00-15.00/18.00-21.00"), as it may not a date. */
const TIME = /^(\d{1,2})[:.,;΄'’`¨](\d{2})(?!\d)/;
/** An hour alone ("8-21"), not a date's day ("12/09"). */
const HOUR = /^(\d{1,2})(?![\d/])/;
/** "800": a morning hour and its minutes run together. */
const THREE_DIGITS = /^([6-9])(\d{2})(?![\d/])/;
/** A year on its own ("2026"), not a time like "2100". */
const YEAR = /^20\d{2}(?!\s*[-:.\d])/;
/** "08 00": hours and minutes apart, followed by a range's dash or the cell's end. */
const SPACED_TIME = /^(\d{1,2}) (\d{2})(?=\s*(?:-|$|[^\d\s:.,/]))/;
const FOUR_DIGITS = /^(\d{2})(\d{2})(?![\d/])/;

const MONTH_NAMES = [
  'ΙΑΝΟΥΑΡΙΟ',
  'ΦΕΒΡΟΥΑΡΙΟ',
  'ΜΑΡΤΙΟ',
  'ΑΠΡΙΛΙΟ',
  'ΜΑΙΟ',
  'ΙΟΥΝΙΟ',
  'ΙΟΥΛΙΟ',
  'ΑΥΓΟΥΣΤΟ',
  'ΣΕΠΤΕΜΒΡΙΟ',
  'ΟΚΤΩΒΡΙΟ',
  'ΝΟΕΜΒΡΙΟ',
  'ΔΕΚΕΜΒΡΙΟ',
];

/** A cell may open with its month ("ΣΕΠΤΕΜΒΡΙΟΣ 2026: ..."); anywhere else a month is not read. */
function withoutLeadingMonth(text: string): string {
  const first = WORD.exec(text.trimStart())?.[0] ?? '';
  const isMonth = MONTH_NAMES.some((m) =>
    ['Σ', 'Υ', ''].some((ending) => printedWord(first, `${m}${ending}`)),
  );
  return isMonth ? text.trimStart().slice(first.length) : text;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let rest = withoutLeadingMonth(normalize(text));
  while (rest.length > 0) {
    let match: RegExpExecArray | null;
    if ((match = /^\s+/.exec(rest))) {
      // whitespace
    } else if ((match = DATE.exec(rest))) {
      const year = match[3] ? Number(match[3].length === 2 ? `20${match[3]}` : match[3]) : null;
      tokens.push({ kind: 'date', day: Number(match[1]), month: Number(match[2]), year });
    } else if ((match = YEAR.exec(rest))) {
      // a year says nothing the month does not
    } else if ((match = FOUR_DIGITS.exec(rest)) && Number(match[1]) <= 24) {
      tokens.push({ kind: 'time', hour: Number(match[1]), minute: Number(match[2]), bare: false });
    } else if ((match = SPACED_TIME.exec(rest))) {
      tokens.push({ kind: 'time', hour: Number(match[1]), minute: Number(match[2]), bare: false });
    } else if ((match = TIME.exec(rest)) || (match = THREE_DIGITS.exec(rest))) {
      tokens.push({ kind: 'time', hour: Number(match[1]), minute: Number(match[2]), bare: false });
    } else if ((match = HOUR.exec(rest))) {
      tokens.push({ kind: 'time', hour: Number(match[1]), minute: 0, bare: true });
    } else if ((match = WORD.exec(rest))) {
      const word = lookUp(match[0]);
      if (!word) throw new UnreadableHoursError(`unknown word "${match[0]}"`);
      if (word.kind !== 'skip') tokens.push(word);
    } else if ((match = /^-+/.exec(rest))) {
      tokens.push({ kind: 'dash' });
    } else if ((match = /^[&,/+;|\\]/.exec(rest))) {
      tokens.push({ kind: 'and' });
    } else if ((match = /^[:.()΄'’`¨]/.exec(rest))) {
      // punctuation that says nothing
    } else {
      throw new UnreadableHoursError(`unexpected "${rest.slice(0, 10)}"`);
    }
    rest = rest.slice(match[0].length);
  }
  return tokens;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A time with its marker ("8 ΜΜ" is 20:00), in minutes from midnight. */
function minutesOf(hour: number, minute: number, marker: Word['kind'] | null): number {
  let h = hour;
  if (marker === 'pm' && h < 12) h += 12;
  if (marker === 'noon' && h < 6) h += 12;
  if (marker === 'am' && h === 12) h = 0;
  return h * 60 + minute;
}

interface Clause {
  /** Closed on its dates ("ΣΑΒ 12/09 ΚΛΕΙΣΤΑ"): no hours. */
  closed: boolean;
  readonly days: Set<number>;
  readonly dates: { day: number; month: number; year: number | null }[];
  readonly ranges: TimeRange[];
}

/** The months of the year a cell's dates must fall in, and the year they take when not printed. */
export interface Month {
  readonly year: number;
  /** 1–12 */
  readonly month: number;
}

/**
 * Reads one cell for one month. A schedule by weekday, or by date when the cell names dates
 * (then the weekdays it gives are spread over the month's dates, except `holidays`).
 */
export function parseFsaHours(
  text: string,
  month: Month,
  holidays: ReadonlySet<string> = new Set(),
): Schedule {
  const tokens = tokenize(text);
  const clauses = readClauses(tokens);
  if (clauses.length === 0) throw new UnreadableHoursError('no hours');

  const days: Record<number, TimeRange[]> = {};
  const dates: Record<string, TimeRange[]> = {};
  // A day named in two clauses ("ΔΕΥ-ΠΑΡ 8-14 ΚΑΙ ΔΕΥ-ΠΑΡ 17-21") has both, if they do not overlap.
  const add = (
    target: Record<string | number, TimeRange[]>,
    key: string | number,
    ranges: TimeRange[],
  ) => {
    // The same hours given twice are the same hours.
    if (JSON.stringify(target[key]) === JSON.stringify(ranges)) return;
    const merged = [...(target[key] ?? []), ...ranges].sort((a, b) => a.from.localeCompare(b.from));
    checkOverlap(merged);
    target[key] = merged;
  };
  for (const clause of clauses) {
    if (clause.dates.length === 0) {
      for (const day of clause.days) add(days, day, clause.ranges);
      continue;
    }
    for (const date of clause.dates) {
      if (date.month !== month.month || (date.year !== null && date.year !== month.year)) {
        throw new UnreadableHoursError(`${date.day}/${date.month} is not in this month`);
      }
      const iso = `${month.year}-${pad(month.month)}-${pad(date.day)}`;
      const weekday = isoWeekday(iso);
      if (weekday === null) throw new UnreadableHoursError(`${iso} is not a date`);
      if (clause.days.size > 0 && !clause.days.has(weekday)) {
        throw new UnreadableHoursError(`${iso} is not on the day named`);
      }
      add(dates, iso, clause.ranges);
    }
  }
  if (Object.keys(dates).length === 0) return { type: 'weekly', days };

  // Some days by date: every date of the month, the weekdays' hours on their dates.
  const all: Record<string, TimeRange[]> = { ...dates };
  for (let d = 1; d <= 31; d++) {
    const iso = `${month.year}-${pad(month.month)}-${pad(d)}`;
    const weekday = isoWeekday(iso);
    if (weekday === null || all[iso] !== undefined || holidays.has(iso)) continue;
    const ranges = days[weekday];
    if (ranges) all[iso] = ranges;
  }
  return { type: 'dates', dates: Object.fromEntries(Object.entries(all).sort()) };
}

/** 1 (Monday) to 7, or null for a date that does not exist (31/9). */
function isoWeekday(iso: string): number | null {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return null;
  return ((date.getUTCDay() + 6) % 7) + 1;
}

/**
 * Splits the tokens into clauses: days (and dates), then their hours. "ΔΕΥ-ΠΑΡ" is Monday to
 * Friday; "ΔΕΥ-ΤΡ-ΤΕΤ" lists days; a dash between two days that are not neighbours is a range
 * only when no day in between is named elsewhere in the cell ("ΔΕΥ-ΤΕΤ 8-16, ΤΡ 8-21" lists two).
 */
function readClauses(tokens: Token[]): Clause[] {
  const named = new Set(tokens.flatMap((t) => (t.kind === 'day' ? [t.day] : [])));
  const clauses: Clause[] = [];
  // Set by startClause too: the assertion keeps it from being narrowed to null.
  let current = null as Clause | null;
  let i = 0;
  const peek = (offset = 0) => tokens[i + offset];

  const startClause = (): Clause => {
    if (current === null || current.ranges.length > 0) {
      current = { closed: false, days: new Set(), dates: [], ranges: [] };
      clauses.push(current);
    }
    return current;
  };

  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) break;
    // A dash or a time word left over once days and ranges have taken theirs only separates:
    // "ΣΑΒ- 09:00-14:30", "08:00-14:00 - 17:00-21:00", "ΑΠΟΓΕΥΜΑ 17:00-20:30".
    if (
      token.kind === 'and' ||
      token.kind === 'dash' ||
      token.kind === 'am' ||
      token.kind === 'pm' ||
      token.kind === 'noon'
    ) {
      i++;
      continue;
    }
    if (token.kind === 'day') {
      const clause = startClause();
      // A day, or a run of days joined by dashes or "ΕΩΣ".
      const run = [token.day];
      const joins: ('dash' | 'to')[] = [];
      i++;
      for (;;) {
        const joiner = peek();
        let next = peek(1);
        let skip = 2;
        // "ΕΩΣ ΚΑΙ ΠΑΡΑΣΚΕΥΗ"
        if (joiner?.kind === 'to' && next?.kind === 'and') {
          next = peek(2);
          skip = 3;
        }
        if ((joiner?.kind === 'dash' || joiner?.kind === 'to') && next?.kind === 'day') {
          run.push(next.day);
          joins.push(joiner.kind);
          i += skip;
        } else break;
      }
      for (const day of expandRun(run, joins, named)) clause.days.add(day);
      continue;
    }
    if (token.kind === 'closed') {
      // Only a date can be closed: "ΤΕΤ ΑΠΟΓΕΥΜΑ ΚΛΕΙΣΤΑ" says too little.
      if (current === null || current.dates.length === 0 || current.ranges.length > 0) {
        throw new UnreadableHoursError('closed, but not on a date');
      }
      current.closed = true;
      // The next day or date starts a clause of its own.
      current = null;
      i++;
      continue;
    }
    if (token.kind === 'date') {
      const clause = startClause();
      clause.dates.push(token);
      i++;
      continue;
    }
    if (token.kind === 'time') {
      if (current === null || (current.days.size === 0 && current.dates.length === 0)) {
        throw new UnreadableHoursError('hours before any day');
      }
      const clause: Clause = current;
      // from [marker] (- | ΕΩΣ) to [marker]
      const fromMarker = markerAt(i + 1);
      const toAt = i + 1 + (fromMarker ? 1 : 0);
      const to = tokens[toAt];
      const end = tokens[toAt + 1];
      if ((to?.kind !== 'dash' && to?.kind !== 'to') || end?.kind !== 'time') {
        throw new UnreadableHoursError('a time without its range');
      }
      const toMarker = markerAt(toAt + 2);
      clause.ranges.push(rangeOf(token, fromMarker, end, toMarker));
      i = toAt + 2 + (toMarker ? 1 : 0);
      continue;
    }
    throw new UnreadableHoursError(`unexpected ${token.kind}`);
  }

  for (const clause of clauses) {
    if (clause.ranges.length === 0 && !clause.closed) {
      throw new UnreadableHoursError('days without hours');
    }
    clause.ranges.sort((a, b) => a.from.localeCompare(b.from));
    checkOverlap(clause.ranges);
    if (clause.days.has(7)) throw new UnreadableHoursError('Sunday');
  }
  return clauses;

  function markerAt(index: number): Word['kind'] | null {
    const t = tokens[index];
    return t?.kind === 'am' || t?.kind === 'pm' || t?.kind === 'noon' ? t.kind : null;
  }
}

/** Ranges sorted by start must not overlap; one that ends at midnight ("00:00") is last. */
function checkOverlap(ranges: readonly TimeRange[]): void {
  for (let k = 1; k < ranges.length; k++) {
    const previous = ranges[k - 1];
    const range = ranges[k];
    if (previous && range && (previous.to === '00:00' || range.from < previous.to)) {
      throw new UnreadableHoursError('overlapping hours');
    }
  }
}

function expandRun(run: number[], joins: ('dash' | 'to')[], named: Set<number>): number[] {
  if (run.length === 1) return run;
  if (run.length > 2) {
    // "ΔΕΥ-ΤΡ-ΤΕΤ": a list, unless a word says otherwise.
    if (joins.some((j) => j === 'to')) throw new UnreadableHoursError('a mixed run of days');
    return run;
  }
  const [from = 0, to = 0] = run;
  if (to <= from) throw new UnreadableHoursError('days out of order');
  const between = Array.from({ length: to - from - 1 }, (_, k) => from + k + 1);
  if (joins[0] === 'to' || between.length === 0 || between.every((d) => !named.has(d))) {
    return [from, ...between, to];
  }
  if (between.every((d) => named.has(d))) return [from, to];
  throw new UnreadableHoursError('a run of days that could be read two ways');
}

const MINUTES = (h: number, m: number) => h * 60 + m;

function rangeOf(
  from: Extract<Token, { kind: 'time' }>,
  fromMarker: Word['kind'] | null,
  to: Extract<Token, { kind: 'time' }>,
  toMarker: Word['kind'] | null,
): TimeRange {
  if (from.minute > 59 || to.minute > 59) throw new UnreadableHoursError('minutes past 59');
  // A marker after the end only ("8-9 ΜΜ") says nothing certain about the start.
  const start = minutesOf(from.hour, from.minute, fromMarker);
  const end = minutesOf(to.hour, to.minute, toMarker);
  if (start < MINUTES(6, 0) || start >= MINUTES(23, 0)) {
    throw new UnreadableHoursError(`opens at ${from.hour}:${pad(from.minute)}`);
  }
  if (end > MINUTES(24, 0) || end <= start) {
    throw new UnreadableHoursError(`closes at ${to.hour}:${pad(to.minute)}`);
  }
  // "8-9" (to 21:00?), "9-1" (to 13:00?): under two hours is a twelve-hour clock, not certain.
  if (end - start < 120) throw new UnreadableHoursError('under two hours');
  const fmt = (m: number) =>
    m === MINUTES(24, 0) ? '00:00' : `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  return { from: fmt(start), to: fmt(end) };
}

const DAY_LABELS = ['Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο', 'Κυριακή'];

/** The schedule written out as ΠΚΜ writes it ("Δευτέρα: 08:00 - 21:00"), for the pages. */
export function scheduleText(schedule: Schedule): string {
  const ranges = (list: readonly TimeRange[]) =>
    list.length === 0 ? 'κλειστό' : list.map((r) => `${r.from} - ${r.to}`).join(' και ');
  if (schedule.type === 'weekly') {
    return Object.entries(schedule.days)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([day, list]) => `${DAY_LABELS[Number(day) - 1]}: ${ranges(list ?? [])}`)
      .join('\n');
  }
  return Object.entries(schedule.dates)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, list]) => {
      const [y, m, d] = iso.split('-');
      return `${DAY_LABELS[(isoWeekday(iso) ?? 1) - 1]} ${d}/${m}/${y}: ${ranges(list)}`;
    })
    .join('\n');
}

/**
 * Some pharmacies list only what they add to the regular hours ("ΔΕΥ-ΠΕΜ 14:30-20:30"), others
 * their whole day. The regular mornings are mandatory, so a weekday listed with no hours before
 * noon keeps its regular morning, joined to what is listed (the engine replaces a listed day's
 * regular hours). `morning` gives the regular morning of a weekday (1–7), or none.
 */
export function withMornings(
  schedule: Schedule,
  morning: (weekday: number) => readonly TimeRange[],
  holidays: ReadonlySet<string> = new Set(),
): Schedule {
  const complete = (ranges: readonly TimeRange[], weekday: number): TimeRange[] => {
    if (ranges.length === 0 || ranges.some((r) => r.from < '12:00')) return [...ranges];
    return joinRanges([...morning(weekday), ...ranges]);
  };
  if (schedule.type === 'weekly') {
    return {
      type: 'weekly',
      days: Object.fromEntries(
        Object.entries(schedule.days).map(([day, ranges]) => [
          day,
          complete(ranges ?? [], Number(day)),
        ]),
      ),
    };
  }
  return {
    type: 'dates',
    dates: Object.fromEntries(
      Object.entries(schedule.dates).map(([date, ranges]) => [
        date,
        holidays.has(date) ? ranges : complete(ranges, isoWeekday(date) ?? 0),
      ]),
    ),
  };
}

/** Sorted, with ranges that overlap or touch made one ("08:00-14:30" and "14:30-20:30"). */
function joinRanges(ranges: readonly TimeRange[]): TimeRange[] {
  const sorted = [...ranges].sort((a, b) => a.from.localeCompare(b.from));
  const joined: TimeRange[] = [];
  for (const range of sorted) {
    const last = joined.at(-1);
    if (last && last.to !== '00:00' && range.from <= last.to) {
      const to = range.to === '00:00' || range.to > last.to ? range.to : last.to;
      joined[joined.length - 1] = { from: last.from, to };
    } else joined.push({ ...range });
  }
  return joined;
}
