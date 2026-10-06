/**
 * The duty pages of ITeQ's platform, which about 33 pharmacists' associations use for their
 * official duty lists (`<area>.efhmeries.gr`, docs/research-greece.md, section 2). The page is
 * server-rendered: a form with the dates on offer (today and six days ahead) and the sectors, and
 * one card per pharmacy on duty: the hours, the name, the address, the sector and the phone, with
 * a link to a details page that holds the coordinates.
 */
import type { DutyKind, TimeWindow } from '@pharmacy-skg/core';
import { isoWeekday } from '@pharmacy-skg/core';
import { toWindow } from '../fsth/heading.ts';
import { cleanDisplay, squash } from '../text.ts';

export interface IteqCard {
  /** The card's heading as printed: "ΑΠΟ 08:00 ΕΩΣ 23:00", "ΕΦΗΜΕΡΕΥΕΙ", ... */
  readonly heading: string;
  readonly name: string;
  readonly address: string;
  /** The sector, as printed under the address ("ΛΑΡΙΣΑ"). */
  readonly locality: string;
  readonly phone: string;
  /** The id of the pharmacy's details page (/Home/Details/<id>), which has its coordinates. */
  readonly detailsId: string | null;
}

export interface IteqPage {
  /** The date the page shows (the selected option). */
  readonly date: string | null;
  /** The dates the form offers, in order. */
  readonly dates: readonly string[];
  /** The antiforgery token the form posts back. */
  readonly token: string | null;
  readonly cards: readonly IteqCard[];
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const value =
        code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(value) ? String.fromCodePoint(value) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** The visible text of an HTML fragment, on one line. */
function textOf(html: string): string {
  return squash(decodeEntities(html.replace(/<[^>]*>/g, ' ')));
}

function cardsOf(html: string): IteqCard[] {
  const cards: IteqCard[] = [];
  // Each card starts with its column; a page past the last card holds the footer.
  for (const part of html.split(/<div class="col-sm-6 col-xl-4\b/).slice(1)) {
    const header = /<div class="card-header[^"]*"[^>]*>([\s\S]*?)<div class="card-body/.exec(part);
    const body = /<div class="card-body[^"]*"[^>]*>([\s\S]*?)<div class="card-footer/.exec(part);
    if (!header?.[1] || !body?.[1]) continue;
    const title = /class="card-title"[^>]*>([\s\S]*?)<\/(?:div|h\d)>/.exec(body[1]);
    // The rows under the name: address, sector (in <strong>), phone.
    const rows = [...body[1].matchAll(/<div class="col-10[^"]*">([\s\S]*?)<\/div>/g)].map((m) =>
      textOf(m[1] ?? ''),
    );
    const locality = /<strong>([\s\S]*?)<\/strong>/.exec(body[1]);
    const details = /\/Home\/Details\/(\d+)/.exec(part);
    cards.push({
      heading: textOf(header[1]),
      name: cleanDisplay(textOf(title?.[1] ?? '')),
      address: cleanDisplay(rows[0] ?? ''),
      locality: cleanDisplay(textOf(locality?.[1] ?? rows[1] ?? '')),
      phone: (rows[2] ?? '').replace(/\D/g, ''),
      detailsId: details?.[1] ?? null,
    });
  }
  return cards;
}

/** Reads a duty page: the date it shows, the dates on offer, the form's token and the cards. */
export function parseIteqPage(html: string): IteqPage {
  const select = /<select[^>]*name="date"[^>]*>([\s\S]*?)<\/select>/.exec(html)?.[1] ?? '';
  const dates = [...select.matchAll(/<option[^>]*value="(\d{4}-\d{2}-\d{2})"/g)].map(
    (m) => m[1] ?? '',
  );
  const selected = /<option selected="selected" value="(\d{4}-\d{2}-\d{2})"/.exec(select);
  const token = /name="__RequestVerificationToken" type="hidden" value="([^"]+)"/.exec(html);
  return {
    date: selected?.[1] ?? null,
    dates,
    token: token?.[1] ?? null,
    cards: cardsOf(html),
  };
}

/** The coordinates on a pharmacy's details page (`var _lat = 39.63 ; var _lng = 22.41 ;`). */
export function parseIteqDetails(html: string): { lat: number; lon: number } | null {
  const lat = /var _lat\s*=\s*(-?\d+(?:\.\d+)?)/.exec(html);
  const lon = /var _lng\s*=\s*(-?\d+(?:\.\d+)?)/.exec(html);
  if (!lat?.[1] || !lon?.[1]) return null;
  const point = { lat: Number(lat[1]), lon: Number(lon[1]) };
  // An unplaced pharmacy has 0, 0.
  return point.lat === 0 && point.lon === 0 ? null : point;
}

/**
 * The kind and hours of a card's heading on `date`:
 * - "ΔΙΑΝΥΚΤΕΡΕΥΕΙ 23:00 ΕΩΣ 08:00": overnight;
 * - "ΑΠΟ 08:00 ΕΩΣ 14:00" on a Saturday, ending by 15:00: the Saturday-morning rota;
 * - "ΑΠΟ 08:00 ΕΩΣ 23:00": day duty;
 * - "ΕΦΗΜΕΡΕΥΕΙ": on duty, hours not printed ("ΕΦΗΜΕΡΕΥΕΙ 08:00 ΕΩΣ 23:00" with them).
 * Null for a heading in none of these forms, or with hours only half printed.
 */
export function iteqHeading(
  heading: string,
  date: string,
): { kind: DutyKind; hours: TimeWindow | null } | null {
  const text = heading.toUpperCase();
  const times = /(\d{1,2}:\d{2})\s+ΕΩΣ\s+(\d{1,2}:\d{2})/.exec(text);
  const hours = times ? toWindow(times[1] ?? '', times[2] ?? '') : null;
  if (/ΔΙΑΝΥΚΤΕΡΕΥ/.test(text) && hours) return { kind: 'overnight', hours };
  if (/^ΑΠΟ\s/.test(text) && hours) {
    const saturdayMorning = isoWeekday(date) === 6 && !hours.toNextDay && hours.to <= '15:00';
    return { kind: saturdayMorning ? 'saturday-extra' : 'day', hours };
  }
  if (/^ΕΦΗΜΕΡΕΥ/.test(text) && (hours || !/\d/.test(text))) return { kind: 'on-duty', hours };
  return null;
}
