// Latin capitals that look identical to Greek ones. Source documents mix them
// (e.g. "M.AΛΕΞΑΝΔΡΟΥ" starts with Latin M and A).
const LATIN_TO_GREEK: Readonly<Record<string, string>> = {
  A: 'Α',
  B: 'Β',
  E: 'Ε',
  Z: 'Ζ',
  H: 'Η',
  I: 'Ι',
  K: 'Κ',
  M: 'Μ',
  N: 'Ν',
  O: 'Ο',
  P: 'Ρ',
  T: 'Τ',
  Y: 'Υ',
  X: 'Χ',
};

const GREEK = /[Ͱ-Ͽἀ-῿]/;

/** Collapses whitespace and trims. */
export function squash(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Joins the lines of a wrapped table cell. A line ending in a hyphen continues
 * the same word or compound, so it is joined without a space.
 */
export function joinLines(lines: readonly string[]): string {
  let out = '';
  for (const raw of lines) {
    const line = squash(raw);
    if (!line) continue;
    out = out === '' ? line : out.endsWith('-') ? out + line : `${out} ${line}`;
  }
  return out;
}

/**
 * Cleans text for display: collapses whitespace and, inside words that contain
 * Greek letters, replaces Latin look-alike capitals (and a zero between
 * letters) with the Greek letters that were meant.
 */
export function cleanDisplay(text: string): string {
  return squash(text).replace(/[^\s]+/g, (word) => {
    if (!GREEK.test(word)) return word;
    return word
      .replace(/[ABEZHIKMNOPTYX]/g, (c) => LATIN_TO_GREEK[c] ?? c)
      .replace(/(?<=[Ͱ-Ͽ])0|0(?=[Ͱ-Ͽ])/g, 'Ο');
  });
}

/**
 * A key for comparing names and addresses across sources: upper case, no
 * accents, Greek letters only for look-alikes, punctuation as single spaces.
 */
export function matchKey(text: string): string {
  return cleanDisplay(text)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[ABEZHIKMNOPTYX]/g, (c) => LATIN_TO_GREEK[c] ?? c)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Normalises a Greek phone number to its 10 national digits, or returns null
 * if it is not one. Accepts "+30", "0030", spaces, dots and dashes.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0030')) digits = digits.slice(4);
  else if (digits.startsWith('30') && digits.length === 12) digits = digits.slice(2);
  return /^[26]\d{9}$/.test(digits) ? digits : null;
}
