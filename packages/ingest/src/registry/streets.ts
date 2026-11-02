/**
 * Street names with their accents, for lists that print addresses in capitals without them
 * ("ΕΡΜΟΥ 49", "Μ. ΜΕΡΚΟΥΡΗ 11"): Nominatim does not match those to OpenStreetMap's "Ερμού" or
 * "Μιχαήλ Μερκούρη", so a pharmacy is placed only at its town. The names of an area's streets are
 * read once from OpenStreetMap (sources/overpass.ts) and kept in data/<city>/inputs/streets.json;
 * an address is matched to them by its accent-stripped capitals, a first name or a saint's title
 * written short ("Μ.", "ΑΓ.") counting as the start of the long one.
 */
import { z } from 'zod';
import { matchKey } from '../text.ts';

export const StreetsFileSchema = z.object({
  schemaVersion: z.literal(1),
  /** Where the names came from and when, for tracing. */
  source: z.string(),
  fetchedAt: z.string(),
  /** Sorted, each once. */
  names: z.array(z.string()),
});
export type StreetsFile = z.infer<typeof StreetsFileSchema>;

/** The words of a name as matchKey writes them. */
const words = (text: string): string[] => matchKey(text).split(' ').filter(Boolean);

/** A printed word is short when it ends in a dot or is a single letter. */
const isShort = (printed: string): boolean => /\.$/.test(printed) || printed.length === 1;

export class StreetIndex {
  private readonly streets: readonly { name: string; words: readonly string[] }[];
  private readonly exact = new Map<string, string>();

  constructor(names: readonly string[]) {
    this.streets = names.map((name) => ({ name, words: words(name) }));
    for (const street of this.streets) {
      const key = street.words.join(' ');
      // Two names that differ only in their accents have no right answer: neither is used.
      const known = this.exact.get(key);
      this.exact.set(key, known === undefined || known === street.name ? street.name : '');
    }
  }

  get size(): number {
    return this.streets.length;
  }

  /**
   * The street of an address as OpenStreetMap writes it, with the house number kept
   * ("ΕΡΜΟΥ 49" gives "Ερμού 49"); the address itself when no street matches, or several do.
   */
  restore(address: string): string {
    const match = /^(.*?)[\s,]*(\d+\s*\p{L}?)?$/u.exec(address.trim());
    const printed = (match?.[1] ?? address).trim();
    const number = (match?.[2] ?? '').replace(/\s+/g, '');
    if (printed === '') return address;
    const found = this.find(printed);
    return found === null ? address : number ? `${found} ${number}` : found;
  }

  private find(printed: string): string | null {
    const key = words(printed).join(' ');
    const exact = this.exact.get(key);
    if (exact) return exact;
    if (exact === '') return null;
    // Words written short, or a first name the printed address leaves out: the printed words are,
    // in order, the start of words of the name, and the last is the whole last word.
    const tokens = printed
      .replace(/\.(?=\S)/g, '. ')
      .split(/\s+/)
      .filter(Boolean);
    const keys = tokens.map((token) => matchKey(token));
    const matches = this.streets.filter((street) => fits(tokens, keys, street.words));
    const names = new Set(matches.map((street) => street.name));
    return names.size === 1 ? ([...names][0] ?? null) : null;
  }
}

function fits(
  tokens: readonly string[],
  keys: readonly string[],
  name: readonly string[],
): boolean {
  if (keys.length === 0 || keys.length > name.length) return false;
  let at = 0;
  for (const [i, key] of keys.entries()) {
    if (key === '') continue;
    const short = isShort(tokens[i] ?? '');
    const last = i === keys.length - 1;
    // The printed words follow the name's, skipping at most the words the print left out.
    let found = false;
    while (at < name.length) {
      const word = name[at++] ?? '';
      if (short && !last ? word.startsWith(key) : word === key || (short && word.startsWith(key))) {
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  // The print ends with the name's last word.
  return at === name.length;
}
