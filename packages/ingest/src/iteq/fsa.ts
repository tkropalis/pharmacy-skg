/**
 * The duty site of the Pharmaceutical Association of Attica, `fsa-efimeries.gr`
 * (docs/research-greece.md, section 2). ITeQ built it too, but not on the shared platform: the
 * home page's form offers the dates (about 200 days ahead), and posting a date to
 * `/Home/FilteredHomeResults` returns that day's cards as an HTML fragment. Each card prints the
 * address, the place, the name, the hours in words ("8 ΠΡΩΙ - 11 ΒΡΑΔΥ"), the phone and, in its
 * maps link, the coordinates, so no details page is needed. Read on 8 Oct 2026 (fixtures/fsa).
 */
import { cleanDisplay } from '../text.ts';
import { decodeEntities, phoneOf, type IteqCard } from './parse.ts';
import { squash } from '../text.ts';

export interface FsaCard extends IteqCard {
  /** From the card's maps link; null when it has none. */
  readonly location: { readonly lat: number; readonly lon: number } | null;
}

function textOf(html: string): string {
  return squash(decodeEntities(html.replace(/<[^>]*>/g, ' ')));
}

/** The dates the home page's form offers, in order. */
export function parseFsaDates(html: string): string[] {
  const select = /<select[^>]*name="Date"[^>]*>([\s\S]*?)<\/select>/.exec(html)?.[1] ?? '';
  return [...select.matchAll(/<option[^>]*value="(\d{4}-\d{2}-\d{2})"/g)].map((m) => m[1] ?? '');
}

/** The cards of one day's results, in the order the page shows them. */
export function parseFsaCards(html: string): FsaCard[] {
  const cards: FsaCard[] = [];
  // Each card starts with its id; the map's script above the first one is not a card.
  for (const part of html.split(/<div id="\d+" class="card\b/).slice(1)) {
    const address = /<div class="card-title[^"]*"[^>]*>\s*<h6[^>]*>([\s\S]*?)<\/h6>/.exec(part);
    const place = /<div class="card-subtitle[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(part);
    // The name, then the hours, then the phone.
    const text = /<div class="[^"]*\bcard-text\b[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(part)?.[1];
    const spans = [...(text ?? '').matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map((m) =>
      textOf(m[1] ?? ''),
    );
    const phone = /<h6[^>]*>([\s\S]*?)<\/h6>/.exec(text ?? '');
    const query = /maps\/search\/\?api=1&(?:amp;)?query=(-?\d+(?:\.\d+)?)%2C(-?\d+(?:\.\d+)?)/.exec(
      part,
    );
    const point = query ? { lat: Number(query[1]), lon: Number(query[2]) } : null;
    cards.push({
      heading: spans[1] ?? '',
      name: cleanDisplay(spans[0] ?? ''),
      address: cleanDisplay(textOf(address?.[1] ?? '')),
      locality: cleanDisplay(textOf(place?.[1] ?? '')),
      phone: phoneOf(textOf(phone?.[1] ?? '')),
      detailsId: null,
      // An unplaced pharmacy would have 0, 0.
      location: point && !(point.lat === 0 && point.lon === 0) ? point : null,
    });
  }
  return cards;
}
