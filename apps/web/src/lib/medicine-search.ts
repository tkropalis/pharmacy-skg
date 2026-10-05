/**
 * Medicine search, entirely on the device (decision D24): the query is matched here against
 * the downloaded index and never leaves this module.
 *
 * Names in the bulletins are Latin capitals ("DEPON TABLET 500MG/TAB"), substances Latin
 * ("PARACETAMOL"), but people type Greek as often as Latin, with or without accents. Both sides
 * are reduced to a rough sound key: Greek is spelled in Latin letters by sound (ου → u,
 * μπ → b, η → i), then spellings that sound alike are folded (c → k, y → i, ph → f, b → v,
 * double letters), so "ντεπον" finds DEPON and "ιβουπροφαίνη" finds IBUPROFEN.
 */
import type { IndexedMedicine } from '@pharmacy-skg/core';

const GREEK_PAIRS: Readonly<Record<string, string>> = {
  ου: 'u',
  αυ: 'av',
  ευ: 'ev',
  μπ: 'b',
  ντ: 'd',
  γκ: 'g',
  γγ: 'ng',
  τσ: 'ts',
  τζ: 'tz',
};

const GREEK_LETTERS: Readonly<Record<string, string>> = {
  α: 'a',
  β: 'v',
  γ: 'g',
  δ: 'd',
  ε: 'e',
  ζ: 'z',
  η: 'i',
  θ: 't',
  ι: 'i',
  κ: 'k',
  λ: 'l',
  μ: 'm',
  ν: 'n',
  ξ: 'ks',
  ο: 'o',
  π: 'p',
  ρ: 'r',
  σ: 's',
  ς: 's',
  τ: 't',
  υ: 'i',
  φ: 'f',
  χ: 'h',
  ψ: 'ps',
  ω: 'o',
};

/** Lower case, no accents or diaeresis. */
function plain(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * The sound key of a text: lower-case Latin letters and digits, other characters as spaces.
 * `softC` reads c before e, i, y as s (CETIRIZINE, σετιριζίνη) instead of k (PARACETAMOL,
 * παρακεταμόλη): Greek spelling follows either, so names are indexed both ways.
 */
export function soundKey(text: string, softC = false): string {
  const chars = [...plain(text)];
  let latin = '';
  for (let i = 0; i < chars.length; i++) {
    const pair = GREEK_PAIRS[`${chars[i]}${chars[i + 1] ?? ''}`];
    if (pair !== undefined) {
      latin += pair;
      i++;
      continue;
    }
    const char = chars[i] ?? '';
    latin += GREEK_LETTERS[char] ?? char;
  }
  return (
    latin
      .replace(/[^a-z0-9]+/g, ' ')
      // Letters next to digits are separate words: "40mg" is "40 mg".
      .replace(/(\d)([a-z])/g, '$1 $2')
      .replace(/([a-z])(\d)/g, '$1 $2')
      .replace(/ph/g, 'f')
      .replace(/th/g, 't')
      .replace(/ch/g, 'h')
      .replace(/ou/g, 'u')
      .replace(/ai/g, 'e')
      .replace(/[eo]i/g, 'i')
      .replace(/qu/g, 'kv')
      .replace(/x/g, 'ks')
      .replace(softC ? /c(?=[eiy])/g : /$^/g, 's')
      .replace(/c/g, 'k')
      .replace(/y/g, 'i')
      .replace(/w/g, 'v')
      .replace(/b/g, 'v')
      .replace(/j/g, 'i')
      .replace(/([a-z])\1+/g, '$1')
      .trim()
  );
}

function words(text: string): string[] {
  const key = soundKey(text);
  return key === '' ? [] : key.split(' ');
}

/** The words of a name in both readings of c. */
function indexWords(text: string): string[] {
  const hard = words(text);
  if (!/c[eiy]/i.test(text)) return hard;
  return [...new Set([...hard, ...soundKey(text, true).split(' ')])];
}

/**
 * A query word matches a word that starts with it, or a long word it spells with a Greek
 * ending: "parasetamoli" (παρακεταμόλη) for "parasetamol", "setirizini" (σετιριζίνη) for
 * "setirizine". Only for words of seven letters or more: they may differ in the last letter, plus two more.
 */
function wordMatches(query: string, word: string): boolean {
  if (word.startsWith(query)) return true;
  if (word.length < 7) return false;
  let common = 0;
  while (common < word.length && query[common] === word[common]) common++;
  return common >= word.length - 1 && query.length - common <= 2;
}

export interface SearchEntry {
  readonly medicine: IndexedMedicine;
  readonly name: readonly string[];
  readonly substance: readonly string[];
}

/** Precomputes the words of every medicine, once, when the index has loaded. */
export function prepareSearch(medicines: readonly IndexedMedicine[]): SearchEntry[] {
  return medicines.map((medicine) => ({
    medicine,
    name: indexWords(medicine.name),
    substance: indexWords(medicine.substance),
  }));
}

export interface SearchResult {
  readonly results: readonly IndexedMedicine[];
  /** The query is too short to search (fewer than MIN_QUERY_LENGTH letters or digits). */
  readonly tooShort: boolean;
}

export const MIN_QUERY_LENGTH = 2;
const byName = new Intl.Collator('el', { sensitivity: 'base', numeric: true });

/**
 * Every medicine whose name or active substance has all the words of the query, best match
 * first: the name starts with the first word, then the name has every word, then the
 * substance. Within each, alphabetical by name. Never by price or company (D24). A query of
 * digits only is also matched against the barcode.
 */
export function searchMedicines(entries: readonly SearchEntry[], query: string): SearchResult {
  const digits = query.replace(/\s/g, '');
  const queryWords = words(query);
  if (queryWords.join('').length < MIN_QUERY_LENGTH) return { results: [], tooShort: true };
  const barcode = /^\d{6,13}$/.test(digits) ? digits : null;

  const scored: { medicine: IndexedMedicine; score: number }[] = [];
  for (const entry of entries) {
    const inName = queryWords.every((q) => entry.name.some((w) => wordMatches(q, w)));
    let score: number | null = null;
    if (inName) {
      score =
        entry.name[0] !== undefined && wordMatches(queryWords[0] ?? '', entry.name[0]) ? 0 : 1;
    } else if (
      queryWords.every((q) => [...entry.name, ...entry.substance].some((w) => wordMatches(q, w)))
    ) {
      score = 2;
    } else if (barcode !== null && entry.medicine.barcode.includes(barcode)) {
      score = 0;
    }
    if (score !== null) scored.push({ medicine: entry.medicine, score });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      byName.compare(a.medicine.name, b.medicine.name) ||
      a.medicine.barcode.localeCompare(b.medicine.barcode),
  );
  return { results: scored.map((s) => s.medicine), tooShort: false };
}

/**
 * Splits a bulletin name ("DORALIN F.C.TAB 40MG/TAB ΒΤx30") into the brand, the form code and
 * the rest. A form code is a dotted code ("F.C.TAB") or one of `forms` ("TABLET", "SYR"); plain
 * words are not, since brands have several ("PANADOL MAXIMUM").
 */
export function splitName(
  name: string,
  forms: ReadonlySet<string>,
): { brand: string; form: string | null; rest: string } {
  const parts = name.split(/\s+/);
  const formAt = parts.findIndex(
    (part, i) => i > 0 && (/^[A-Z]+(\.[A-Z]+)+$/.test(part) || forms.has(part)),
  );
  if (formAt < 1) return { brand: name, form: null, rest: '' };
  return {
    brand: parts.slice(0, formAt).join(' '),
    form: parts[formAt] ?? null,
    rest: parts.slice(formAt + 1).join(' '),
  };
}
