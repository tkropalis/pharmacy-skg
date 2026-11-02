/**
 * The duty page of the Pharmaceutical Association of the Cyclades, `fscyclades.gr/onduty-cyclades/`
 * (docs/research-greece.md, section 2). A WordPress page with a form: posting `selected_date`
 * (YYYY-MM-DD) and `selected_location` (one of the form's options, "Τήνος (Χώρα)") returns the
 * whole page again with the answer below the form: the pharmacy on duty with its name, address,
 * phone, mobile and a map whose script holds its coordinates, then the next two days' pharmacies
 * (without coordinates), or "Δεν βρέθηκαν φαρμακεία" when the place has no duty that
 * day. The page states no hours: it says only that a duty lasts until 08:00 the next morning.
 * Read on 2 Nov 2026 (fixtures/fscyclades).
 */
import { cleanDisplay, squash } from '../text.ts';
import { decodeEntities, phoneOf } from '../iteq/parse.ts';

export interface CycladesDuty {
  readonly name: string;
  readonly address: string;
  /** The landline, which is the pharmacy's id. */
  readonly phone: string;
  /** From the map's script; null when the page gives none. */
  readonly location: { readonly lat: number; readonly lon: number } | null;
}

/** A pharmacy the answer lists for one of the next days: no coordinates. */
export interface CycladesFollowing {
  /** YYYY-MM-DD, from the date the page prints. */
  readonly date: string;
  readonly name: string;
  readonly address: string;
  readonly phone: string;
}

export interface CycladesResult {
  /** The date the answer is for (YYYY-MM-DD), as the page prints it. */
  readonly date: string | null;
  /** The place the answer is for, as the page prints it ("Τήνος (Χώρα)"). */
  readonly place: string | null;
  /** Empty when the place has no duty that day. */
  readonly duties: readonly CycladesDuty[];
  /** The pharmacies listed for the next two days, in order; none when there is no duty that day. */
  readonly following: readonly CycladesFollowing[];
}

function textOf(html: string): string {
  return squash(decodeEntities(html.replace(/<[^>]*>/g, ' ')));
}

/** The places the form offers, as posted back ("Άνδρος (Κόρθι)"), in the order it lists them. */
export function parseCycladesPlaces(html: string): string[] {
  const select = /<select[^>]*name="selected_location"[^>]*>([\s\S]*?)<\/select>/.exec(html)?.[1];
  return [...(select ?? '').matchAll(/<option[^>]*value="([^"]*)"/g)].map((m) =>
    squash(decodeEntities(m[1] ?? '')),
  );
}

/** "02/11/2026" as "2026-11-02"; null for anything else. */
function isoDate(printed: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(printed.trim());
  if (!match) return null;
  const [, day = '', month = '', year = ''] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/** The coordinates in a pharmacy's map script, or null (an unplaced pharmacy would have 0, 0). */
function coordinates(part: string): CycladesDuty['location'] {
  const found =
    /lat:\s*parseFloat\('(-?\d+(?:\.\d+)?)'\),\s*lng:\s*parseFloat\('(-?\d+(?:\.\d+)?)'\)/.exec(
      part,
    );
  if (!found) return null;
  const lat = Number(found[1]);
  const lon = Number(found[2]);
  return lat === 0 && lon === 0 ? null : { lat, lon };
}

/** What follows `label` in a pharmacy's address line, up to the next icon or comma. */
function field(line: string, label: string): string {
  const start = line.indexOf(label);
  if (start < 0) return '';
  const rest = line.slice(start + label.length);
  const end = rest.search(/<i\b/);
  return textOf(end < 0 ? rest : rest.slice(0, end)).replace(/,$/, '');
}

/** The answer a post returns: its date and place, and the pharmacies on duty. */
export function parseCycladesResult(html: string): CycladesResult {
  const heading =
    /Εφημερεύον Φαρμακείο για\s*<strong>\s*([^<]*?)\s*<\/strong>\s*στην τοποθεσία:\s*<strong>([^<]*)<\/strong>/.exec(
      html,
    );
  const duties: CycladesDuty[] = [];
  // Each pharmacy on duty is a block of its own; the next days' are in blocks of another class.
  for (const part of html.split('<div class="pharmacy-duty">').slice(1)) {
    const block = part.split(/<div class="next-pharmacy">|<h3>\s*Επόμενες/)[0] ?? '';
    const name = /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(block)?.[1];
    const line = /<h3[^>]*>([\s\S]*?)<\/h3>/.exec(block)?.[1] ?? '';
    duties.push({
      name: cleanDisplay(textOf(name ?? '')),
      address: cleanDisplay(field(line, 'Διεύθυνση:')),
      phone: phoneOf(field(line, 'Τηλέφωνο:')),
      location: coordinates(block),
    });
  }
  const following: CycladesFollowing[] = [];
  for (const part of html.split('<div class="next-pharmacy">').slice(1)) {
    const block = part.split('</div>')[0] ?? '';
    const title = /<h3[^>]*>([\s\S]*?)<\/h3>/.exec(block)?.[1] ?? '';
    const date = isoDate(/(\d{1,2}\/\d{1,2}\/\d{4})/.exec(textOf(title))?.[1] ?? '');
    const name = /<strong>([\s\S]*?)<\/strong>/.exec(title)?.[1];
    const line = /<h4[^>]*>([\s\S]*?)<\/h4>/.exec(block)?.[1] ?? '';
    if (date === null || name === undefined) continue;
    following.push({
      date,
      name: cleanDisplay(textOf(name)),
      address: cleanDisplay(field(line, 'Διεύθυνση:')),
      phone: phoneOf(field(line, 'Τηλέφωνο:')),
    });
  }
  return {
    date: heading?.[1] ? isoDate(textOf(heading[1])) : null,
    place: heading?.[2] ? squash(decodeEntities(heading[2])) : null,
    duties,
    following,
  };
}
