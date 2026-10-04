/**
 * The kinds of duty section ΦΣΘ prints. The kind only names the section; the
 * hours always come from the heading, because the same kind means different
 * hours in different area groups (see docs/research.md, section 2).
 */
export const DUTY_KINDS = [
  'day',
  'saturday-extra',
  'on-duty',
  'overnight',
  'after-midnight',
] as const;
export type DutyKind = (typeof DUTY_KINDS)[number];

/** A span of local time. `toNextDay` is true when it ends after midnight (including at exactly 00:00). */
export interface TimeWindow {
  readonly from: string;
  readonly to: string;
  readonly toNextDay: boolean;
}

/** Extra hours stated in a section note, e.g. Tue/Thu/Fri 14:00–17:00 except on holidays. */
export interface ExtraHours {
  /** ISO weekdays: 1 = Monday … 7 = Sunday. */
  readonly weekdays: readonly number[];
  readonly from: string;
  readonly to: string;
  readonly exceptHolidays: boolean;
}

// Checked in order: "Εφημερεύοντα" is the generic word, so it comes last.
const KIND_WORDS: readonly (readonly [RegExp, DutyKind])[] = [
  [/Επιπλέον\s+Φαρμακεία\s+Σαββάτου/i, 'saturday-extra'],
  [/Διημερεύοντα/i, 'day'],
  [/Διανυκτερεύοντα/i, 'overnight'],
  [/Μεταμεσονύκτια/i, 'after-midnight'],
  [/Εφημερεύοντα/i, 'on-duty'],
];

const WEEKDAYS: readonly (readonly [RegExp, number])[] = [
  [/Δευτέρα/i, 1],
  [/Τρίτη/i, 2],
  [/Τετάρτη/i, 3],
  [/Πέμπτη/i, 4],
  [/Παρασκευή/i, 5],
  [/Σάββατο/i, 6],
  [/Κυριακή/i, 7],
];

/** Pads "8:00" to "08:00" and writes midnight as "00:00". Throws on anything else. */
export function normalizeTime(raw: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!match) throw new Error(`Not a time: "${raw}"`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes !== 0)) {
    throw new Error(`Not a time: "${raw}"`);
  }
  return `${String(hours % 24).padStart(2, '0')}:${match[2]}`;
}

export function toWindow(fromRaw: string, toRaw: string): TimeWindow {
  const from = normalizeTime(fromRaw);
  const to = normalizeTime(toRaw);
  return { from, to, toNextDay: to <= from };
}

/** Is this line a section heading? */
export function isSectionHeading(text: string): boolean {
  return /Φαρμακεία/.test(text) && KIND_WORDS.some(([pattern]) => pattern.test(text));
}

/** Reads the kind and, when stated, the hours of a section heading. */
export function parseHeading(text: string): { kind: DutyKind; hours: TimeWindow | null } {
  const kind = KIND_WORDS.find(([pattern]) => pattern.test(text))?.[1];
  if (!kind) throw new Error(`Unknown section heading: "${text}"`);
  const match = /από\s+(\d{1,2}:\d{2})\s+έως\s+(\d{1,2}:\d{2})/i.exec(text);
  if (!match) return { kind, hours: null };
  const [, from = '', to = ''] = match;
  return { kind, hours: toWindow(from, to) };
}

/**
 * Reads extra hours from the note printed under a heading, e.g.
 * "Τρίτη, Πέμπτη & Παρασκευή (εκτός αργιών), λειτουργούν και 14:00-17:00".
 * Returns null if the note is not in that form.
 */
export function parseExtraHours(note: string): ExtraHours | null {
  const time = /(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/.exec(note);
  const weekdays = WEEKDAYS.filter(([pattern]) => pattern.test(note)).map(([, day]) => day);
  if (!time || weekdays.length === 0) return null;
  const [, from = '', to = ''] = time;
  return {
    weekdays,
    from: normalizeTime(from),
    to: normalizeTime(to),
    exceptHolidays: /εκτός\s+αργιών/i.test(note),
  };
}
