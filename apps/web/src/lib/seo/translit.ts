/**
 * Greek to Latin transliteration after ELOT 743 (the Greek standard behind ISO 843), used for
 * area URL slugs and for the English display names of localities. It is deterministic and has
 * no dependencies, so a slug never changes between builds unless the locality's name does.
 */

const SIMPLE: Readonly<Record<string, string>> = {
  α: 'a',
  β: 'v',
  γ: 'g',
  δ: 'd',
  ε: 'e',
  ζ: 'z',
  η: 'i',
  θ: 'th',
  ι: 'i',
  κ: 'k',
  λ: 'l',
  μ: 'm',
  ν: 'n',
  ξ: 'x',
  ο: 'o',
  π: 'p',
  ρ: 'r',
  σ: 's',
  ς: 's',
  τ: 't',
  υ: 'y',
  φ: 'f',
  χ: 'ch',
  ψ: 'ps',
  ω: 'o',
};

/** Two-letter groups, checked before the single letters. `initial` applies at a word start. */
const PAIRS: Readonly<Record<string, { initial?: string; other: string }>> = {
  αι: { other: 'ai' },
  ει: { other: 'ei' },
  οι: { other: 'oi' },
  υι: { other: 'yi' },
  ου: { other: 'ou' },
  γγ: { other: 'ng' },
  γκ: { other: 'gk' },
  γξ: { other: 'nx' },
  γχ: { other: 'nch' },
  μπ: { initial: 'b', other: 'mp' },
  ντ: { initial: 'd', other: 'nt' },
};

/** After αυ, ευ, ηυ these letters make the υ sound like "f"; before anything else it is "v". */
const VOICELESS = new Set(['θ', 'κ', 'ξ', 'π', 'σ', 'ς', 'τ', 'φ', 'χ', 'ψ']);

/** Removes accents and the diaeresis, and lower-cases. Final sigma stays distinct. */
function plain(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().normalize('NFC');
}

/** ELOT 743 transliteration of a Greek text, lower case, other characters kept as they are. */
export function transliterate(text: string): string {
  const chars = [...plain(text)];
  let out = '';
  for (let i = 0; i < chars.length; i += 1) {
    const char = chars[i] ?? '';
    const next = chars[i + 1] ?? '';
    const atWordStart = i === 0 || !/\p{L}/u.test(chars[i - 1] ?? '');

    if ((char === 'α' || char === 'ε' || char === 'η') && next === 'υ') {
      const after = chars[i + 2] ?? '';
      const f = after === '' || !/\p{L}/u.test(after) || VOICELESS.has(after);
      out += `${SIMPLE[char] ?? ''}${f ? 'f' : 'v'}`;
      i += 1;
      continue;
    }
    const pair = PAIRS[char + next];
    if (pair !== undefined) {
      out += atWordStart && pair.initial !== undefined ? pair.initial : pair.other;
      i += 1;
      continue;
    }
    out += SIMPLE[char] ?? char;
  }
  return out;
}

/** "Νέα Μηχανιώνα" becomes "Nea Michaniona": for English page text. */
export function romanize(text: string): string {
  return transliterate(text).replace(
    /(^|[\s\-/(])(\p{L})/gu,
    (_, before: string, letter: string) => `${before}${letter.toUpperCase()}`,
  );
}

/** A URL-safe, lower-case ASCII slug: "Άγιος Αθανάσιος" becomes "agios-athanasios". */
export function slugify(text: string): string {
  return transliterate(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Names that cannot be transliterated as written, because the data abbreviates them. The slug
 * is spelt out here so it stays stable if the abbreviation is later fixed in the data.
 */
const SLUG_OVERRIDES: Readonly<Record<string, string>> = {
  'Ν. Επιβάτες': 'neoi-epivates',
};

/** Spelt-out names for English text where the data abbreviates. */
const ROMANIZED_OVERRIDES: Readonly<Record<string, string>> = {
  'Ν. Επιβάτες': 'Neoi Epivates',
};

export function romanizeLocality(locality: string): string {
  return ROMANIZED_OVERRIDES[locality] ?? romanize(locality);
}

/**
 * One slug per name, unique and independent of the order of the input: names are processed in
 * sorted order, and a slug that is already taken gets "-2", "-3" and so on. Adding a new name
 * can only change the slug of a name that sorts after it and collides with it.
 */
export function assignSlugs(names: Iterable<string>): Map<string, string> {
  const slugs = new Map<string, string>();
  const taken = new Set<string>();
  for (const name of [...new Set(names)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const base = SLUG_OVERRIDES[name] ?? (slugify(name) || 'area');
    let slug = base;
    for (let n = 2; taken.has(slug); n += 1) slug = `${base}-${n}`;
    taken.add(slug);
    slugs.set(name, slug);
  }
  return slugs;
}
