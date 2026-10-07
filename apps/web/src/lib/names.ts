import { stripAccents } from './places.ts';

/**
 * A pharmacy's name as people say it, for the screen: the registered name without its legal
 * form ("& ΣΙΑ Ο.Ε.", "ΙΚΕ") or the "Σ.Φ." prefix of shared premises, which are what makes long
 * names run off a phone. The number of a second shop ("(2ο)") stays: it tells two apart. The
 * pharmacy's own page keeps the registered name.
 */

/** A legal form at the end: Ο.Ε., ΟΕ, Ε.Ε., Ι.Κ.Ε., ΕΠΕ, Α.Ε. (and a Latin "OE" typed by mistake). */
const LEGAL_FORM =
  /\s+(?:Ο\.?\s?Ε\.?|OE|Ε\.?\s?Ε\.?|Ι\.?\s?Κ\.?\s?Ε\.?|Ε\.?\s?Π\.?\s?Ε\.?|Α\.?\s?Ε\.?)\s*$/u;
/** "& ΣΙΑ", "ΚΑΙ ΣΙΑ" at the end, once the legal form is gone. */
const PARTNERS = /(?:\s*&|\s+ΚΑΙ)\s*ΣΙΑ\s*$/u;
/** "(2ο)", "( 3ο )": kept, tidied, and put back after the rest is trimmed. */
const BRANCH = /\s*\(\s*(\d+)\s*ο\s*\)\s*$/u;
const SHARED = /^Σ\.\s?Φ\.?\s+/u;

/**
 * The row's address line: the address and, unless it is the city's own name, the locality.
 * Where the list prints the place as the address (village pharmacies on ITeQ's sites:
 * "ΞΗΡΟΚΑΜΠΙ"), the place is written once, in the locality's spelling ("Ξηροκάμπι").
 */
export function placeLine(address: string, locality: string, cityName: string): string {
  const same = (a: string, b: string) => stripAccents(a).trim() === stripAccents(b).trim();
  if (locality !== '' && same(address, locality)) return locality === cityName ? address : locality;
  return [address, locality === cityName ? '' : locality].filter((part) => part !== '').join(', ');
}

export function displayName(name: string): string {
  let rest = name.trim();
  const branch = BRANCH.exec(rest);
  if (branch) rest = rest.slice(0, branch.index);
  rest = rest.replace(SHARED, '');
  // Twice: "& ΣΙΑ Ο.Ε." is a partners clause followed by a legal form.
  for (let pass = 0; pass < 2; pass++) {
    rest = rest.replace(LEGAL_FORM, '').replace(PARTNERS, '');
  }
  rest = rest.replace(/[\s,\-–]+$/u, '').trim();
  if (rest === '') rest = name.trim();
  return branch ? `${rest} (${branch[1]}ο)` : rest;
}
