import type { Pharmacy } from '@pharmacy-skg/core';
import { dominantGroup } from './groups.ts';

/** A named area people can choose as the starting point: the middle of its located pharmacies. */
export interface Locality {
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
  readonly count: number;
  /** The duty-list group most of its pharmacies belong to, or null. */
  readonly groupId: string | null;
  /** Set for another covered city offered in the area picker: choosing it switches to it. */
  readonly cityId?: string;
}

const greek = new Intl.Collator('el');

/**
 * Distinct localities with the centroid of their pharmacies. Pharmacies placed only at
 * locality level count if nothing better exists in that locality (those coordinates are the
 * locality's middle already). Localities with no located pharmacy are left out.
 */
export function buildLocalities(pharmacies: readonly Pharmacy[]): Locality[] {
  const groups = new Map<
    string,
    { precise: Pharmacy[]; rough: Pharmacy[]; all: Pharmacy[]; count: number }
  >();
  for (const pharmacy of pharmacies) {
    if (pharmacy.locality === '') continue;
    let group = groups.get(pharmacy.locality);
    if (!group)
      groups.set(pharmacy.locality, (group = { precise: [], rough: [], all: [], count: 0 }));
    group.count += 1;
    group.all.push(pharmacy);
    if (pharmacy.location === null) continue;
    (pharmacy.location.precision === 'locality' ? group.rough : group.precise).push(pharmacy);
  }
  const out: Locality[] = [];
  for (const [name, group] of groups) {
    const located = group.precise.length > 0 ? group.precise : group.rough;
    let lat = 0;
    let lon = 0;
    for (const { location } of located) {
      lat += location?.lat ?? 0;
      lon += location?.lon ?? 0;
    }
    if (located.length === 0) continue;
    out.push({
      name,
      lat: lat / located.length,
      lon: lon / located.length,
      count: group.count,
      groupId: dominantGroup(group.all),
    });
  }
  return out.sort((a, b) => greek.compare(a.name, b.name));
}

// --- Matching ------------------------------------------------------------------

/** Lower case without accents or diacritics; final sigma is plain sigma. */
export function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replaceAll('ς', 'σ');
}

const GREEK_TO_LATIN: Readonly<Record<string, string>> = {
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
  τ: 't',
  υ: 'y',
  φ: 'f',
  χ: 'ch',
  ψ: 'ps',
  ω: 'o',
};

/**
 * Rewrites that make the many Latin spellings of Greek sounds collapse to one string. Order
 * matters: digraphs first, then single letters.
 */
const SOUND_RULES: readonly (readonly [RegExp, string])[] = [
  [/au|ay/g, 'av'],
  [/eu|ey/g, 'ev'],
  [/ai/g, 'e'],
  [/ei|oi|ui|yi/g, 'i'],
  [/ou|oy/g, 'o'],
  [/ph/g, 'f'],
  [/ch|kh/g, 'h'],
  [/th/g, 't'],
  [/dh/g, 'd'],
  [/gh/g, 'g'],
  [/mp|mb/g, 'b'],
  [/nt/g, 'd'],
  [/gk/g, 'g'],
  [/gg/g, 'ng'],
  [/x/g, 'ks'],
  // ξ (ks) and χ (x, h) are often typed alike, so both fold to h.
  [/ks/g, 'h'],
  [/[cq]/g, 'k'],
  [/[jy]/g, 'i'],
  [/w/g, 'o'],
  [/u/g, 'o'],
  [/[bf]/g, 'v'],
  [/e/g, 'i'],
];

/**
 * A rough sound key shared by Greek and Latin spellings, so "καλαμ", "Καλαμαριά", "kalamaria"
 * and "KALAMARIA" all match the same locality, and "Εύοσμος" matches "evosmos" or "efosmos".
 * It ignores accents, case, spaces and punctuation, and is deliberately tolerant: it is for
 * finding an area in a short list, not for comparing words.
 */
export function soundKey(text: string): string {
  let latin = '';
  for (const char of stripAccents(text)) latin += GREEK_TO_LATIN[char] ?? char;
  for (const [pattern, replacement] of SOUND_RULES) latin = latin.replace(pattern, replacement);
  return latin.replace(/[^a-z0-9]/g, '').replace(/(.)\1+/g, '$1');
}

/**
 * Localities matching a typed query: those whose key starts with the query's first, then those
 * that contain it anywhere. An empty query lists everything. Order within each group is kept.
 */
export function searchLocalities(
  localities: readonly Locality[],
  query: string,
  limit = Infinity,
): Locality[] {
  const key = soundKey(query);
  if (key === '') return localities.slice(0, limit);
  const starts: Locality[] = [];
  const contains: Locality[] = [];
  for (const locality of localities) {
    const candidate = soundKey(locality.name);
    if (candidate.startsWith(key)) starts.push(locality);
    else if (candidate.includes(key)) contains.push(locality);
  }
  return [...starts, ...contains].slice(0, limit);
}
