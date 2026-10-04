import { createHash } from 'node:crypto';
import { latinKey, matchKey, normalizePhone } from '../text.ts';

// Legal forms and connecting words that say nothing about which pharmacy it is.
const NOISE = new Set([
  'ΟΕ',
  'ΕΕ',
  'ΙΚΕ',
  'ΑΕ',
  'ΕΠΕ',
  'ΣΦ',
  'ΣΙΑ',
  'ΚΑΙ',
  'ΦΑΡΜΑΚΕΙΟ',
  'ΦΑΡΜΑΚΕΙΑ',
  'PHARMACY',
]);

/** Caches a function of one string; matching compares every pair of names. */
function memo<T>(fn: (text: string) => T): (text: string) => T {
  const cache = new Map<string, T>();
  return (text) => {
    let value = cache.get(text);
    if (value === undefined) {
      value = fn(text);
      cache.set(text, value);
    }
    return value;
  };
}

/** The distinctive words of a pharmacy name: surnames and first names. */
export const nameTokens = memo((name: string): ReadonlySet<string> => {
  // Join dotted abbreviations ("Ο.Ε." → "ΟΕ") before splitting into words.
  const key = matchKey(
    name.replace(/\b(\p{L})\.(?=\p{L}\.)/gu, '$1').replace(/(\p{L})\.(\p{L})\./gu, '$1$2'),
  );
  return new Set(key.split(' ').filter((token) => token.length > 2 && !NOISE.has(token)));
});

/** Share of name tokens in common (Jaccard index), 0–1. */
export function nameSimilarity(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let common = 0;
  for (const token of ta) if (tb.has(token)) common++;
  return common / (ta.size + tb.size - common);
}

const latinNameTokens = memo(
  (name: string): ReadonlySet<string> => new Set([...nameTokens(name)].map(latinKey)),
);

/** Do two names share a distinctive word (e.g. a surname), in Greek or Greeklish? */
export function shareNameToken(a: string, b: string): boolean {
  const tb = latinNameTokens(b);
  for (const token of latinNameTokens(a)) if (tb.has(token)) return true;
  return false;
}

/**
 * Do two printed addresses name the same place? Sources abbreviate street
 * names differently ("Ε.ΒΕΝΙΖΕΛΟΥ 99" vs "ΕΛ. ΒΕΝΙΖΕΛΟΥ 99"), so this asks for
 * a house number and a street word (4+ letters) in common.
 */
const addressParts = memo((address: string) => {
  const words = latinKey(address).split(' ');
  return {
    numbers: new Set(words.filter((word) => /^\d+$/.test(word))),
    words: new Set(words.filter((word) => /^[A-Z]{4,}$/.test(word))),
  };
});

export function sameStreetAddress(a: string, b: string): boolean {
  const pa = addressParts(a);
  const pb = addressParts(b);
  const overlap = (x: ReadonlySet<string>, y: ReadonlySet<string>) =>
    [...x].some((item) => y.has(item));
  return overlap(pa.numbers, pb.numbers) && overlap(pa.words, pb.words);
}

/**
 * A pharmacy's id: its phone number when it has a valid one, otherwise a
 * hash of its name and locality (for pharmacies only known from ΠΚΜ, or
 * printed with a typo in the phone).
 */
export function pharmacyId(phone: string | null, name: string, locality: string): string {
  const valid = normalizePhone(phone);
  if (valid) return valid;
  const key = `${[...nameTokens(name)].sort().join(' ')}|${matchKey(locality)}`;
  const hash = createHash('sha256').update(key).digest('hex');
  return `x-${hash.slice(0, 10)}`;
}
