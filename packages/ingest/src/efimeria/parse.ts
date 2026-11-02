/**
 * The duty page of the Pharmaceutical Association of Achaia, efimeria.gr (run by Silktech). One
 * page, `/All`, carries everything for today: the whole day's duties as a GeoJSON string in a
 * script (`var data = '{"type":"FeatureCollection",…}'`) with each pharmacy's coordinates, and
 * the "Διευρυμένο ωράριο" block, whose longer hours are listed with a name and an address per
 * pharmacy. The page shows only today and prints its own date and time (the server's).
 *
 * Fixtures: fixtures/efimeria, saved on 2 Nov 2026.
 */
import { z } from 'zod';
import { matchKey } from '../text.ts';

const MONTHS = [
  'ΙΑΝΟΥΑΡΙΟΥ',
  'ΦΕΒΡΟΥΑΡΙΟΥ',
  'ΜΑΡΤΙΟΥ',
  'ΑΠΡΙΛΙΟΥ',
  'ΜΑΙΟΥ',
  'ΙΟΥΝΙΟΥ',
  'ΙΟΥΛΙΟΥ',
  'ΑΥΓΟΥΣΤΟΥ',
  'ΣΕΠΤΕΜΒΡΙΟΥ',
  'ΟΚΤΩΒΡΙΟΥ',
  'ΝΟΕΜΒΡΙΟΥ',
  'ΔΕΚΕΜΒΡΙΟΥ',
];

/** What the page's header says: "Δευτέρα, 2 Νοεμβρίου 2026 12:25:21". */
export function parsePageStamp(html: string): { date: string; time: string } {
  const match =
    /<strong>\s*[^<,]+,\s*(\d{1,2})\s+([^\s<]+)\s+(\d{4})\s+(\d{1,2}:\d{2}:\d{2})\s*<\/strong>/.exec(
      html,
    );
  const [, day = '', monthName = '', year = '', time = ''] = match ?? [];
  const month = MONTHS.indexOf(matchKey(monthName)) + 1;
  if (!match || month === 0) throw new Error('efimeria.gr: no date and time in the page');
  return {
    date: `${year}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`,
    time,
  };
}

/** The value of a JavaScript string literal's body (what the browser's parser makes of it). */
function unescapeJs(body: string): string {
  return body.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (_, escape: string) => {
    if (escape.length > 1) return String.fromCharCode(parseInt(escape.slice(1), 16));
    switch (escape) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      default:
        return escape;
    }
  });
}

const DutySchema = z.object({
  duty_name: z.string(),
  /** 1 before the shift starts, 0 once it has (seen at 12:25 and 19:53 on 2 Nov 2026): not read. */
  duty_status: z.number(),
  start_time: z.number().int().nullable(),
  end_time: z.number().int().nullable(),
  start_time2: z.number().int().nullable().optional(),
  end_time2: z.number().int().nullable().optional(),
});

const FeatureSchema = z.object({
  geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
  properties: z.object({
    pharmacy_id: z.number().int(),
    city_name: z.string(),
    city_short_name: z.string(),
    pharmacy_name: z.string(),
    pharmacy_address: z.string(),
    duties: z.record(z.string(), DutySchema),
  }),
});

const CollectionSchema = z.object({ features: z.array(z.unknown()) });

/** One window of a duty, in seconds from midnight of the page's date (86,400 and more: next day). */
export interface EfimeriaWindow {
  readonly fromSec: number;
  readonly toSec: number;
  /** The window as the page prints it ("14:30 - 21:00 μμ"). */
  readonly printed: string;
}

export interface EfimeriaPharmacy {
  /** The site's own id; stable from day to day. */
  readonly id: number;
  readonly name: string;
  /** Without the phone numbers the site prints at the end of a village's address. */
  readonly address: string;
  /** The first phone printed in the address, 10 digits, or empty when it prints none. */
  readonly phone: string;
  readonly town: string;
  /** The site's short name for the town ("Patra", "Paralia_Patrwn"), stable. */
  readonly townKey: string;
  readonly lat: number;
  readonly lon: number;
  /** Duties in the order of the site's ids. */
  readonly windows: readonly EfimeriaWindow[];
}

export interface EfimeriaExtendedGroup {
  /** The hours lines as printed ("Δευ. & Τετ. : 08.30 - 14.30"). */
  readonly hours: readonly string[];
  readonly pharmacies: readonly { readonly name: string; readonly address: string }[];
}

export interface EfimeriaPage {
  /** The page's own date (the server's, Athens), YYYY-MM-DD. */
  readonly date: string;
  /** The page's own time, HH:MM:SS. */
  readonly time: string;
  readonly pharmacies: readonly EfimeriaPharmacy[];
  readonly extended: readonly EfimeriaExtendedGroup[];
}

const decode = (text: string) =>
  text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The phone numbers a village's address ends with ("… ΤΗΛ.: 26930 23100", "2610-670.324 & 69…"). */
export function splitPhone(printed: string): { address: string; phone: string } {
  const at = printed.search(/\s*ΤΗΛ\.?\s*:?\s*\d/i);
  if (at < 0) return { address: decode(printed), phone: '' };
  const address = decode(printed.slice(0, at)).replace(/[\s,-]+$/, '');
  const numbers = printed.slice(at).replace(/^\s*ΤΗΛ\.?\s*:?/i, '');
  for (const part of numbers.split(/\s*[&,/]\s*/)) {
    const digits = part.replace(/\D/g, '');
    if (/^[26]\d{9}$/.test(digits)) return { address, phone: digits };
  }
  return { address, phone: '' };
}

function parseFeatures(html: string): EfimeriaPharmacy[] {
  const literal = /var data = '((?:[^'\\]|\\.)*)'/.exec(html);
  if (!literal) throw new Error('efimeria.gr: no duty data in the page');
  const collection = CollectionSchema.parse(JSON.parse(unescapeJs(literal[1] ?? '')));
  return collection.features.map((raw) => {
    const feature = FeatureSchema.parse(raw);
    const p = feature.properties;
    const windows: EfimeriaWindow[] = [];
    for (const duty of Object.values(p.duties)) {
      const pairs = [
        [duty.start_time, duty.end_time],
        [duty.start_time2 ?? null, duty.end_time2 ?? null],
      ] as const;
      for (const [from, to] of pairs) {
        if (from !== null && to !== null) {
          windows.push({ fromSec: from, toSec: to, printed: decode(duty.duty_name) });
        }
      }
    }
    const { address, phone } = splitPhone(p.pharmacy_address);
    const [lon, lat] = feature.geometry.coordinates;
    return {
      id: p.pharmacy_id,
      name: decode(p.pharmacy_name),
      address,
      phone,
      town: decode(p.city_name),
      townKey: p.city_short_name,
      lat,
      lon,
      windows,
    };
  });
}

/**
 * The "Διευρυμένο ωράριο" block: hours lines, then the pharmacies that keep them; another hours
 * line after a pharmacy starts the next group.
 */
function parseExtended(html: string): EfimeriaExtendedGroup[] {
  const start = html.indexOf('id="extras"');
  if (start < 0) return [];
  const token =
    /<span class="glyphicon[^"]*" aria-hidden="true"><\/span>\s*<strong>([^<]+)<\/strong>|<span class="pharmacy_name">([^<]*)<\/span><br \/><span class="pharmacy_address"><strong>([^<]*)<\/strong>/g;
  token.lastIndex = start;
  const groups: { hours: string[]; pharmacies: { name: string; address: string }[] }[] = [];
  let current: (typeof groups)[number] | undefined;
  for (let match = token.exec(html); match; match = token.exec(html)) {
    const [, hours, name, address] = match;
    if (hours !== undefined) {
      if (!current || current.pharmacies.length > 0) {
        current = { hours: [], pharmacies: [] };
        groups.push(current);
      }
      current.hours.push(decode(hours));
    } else if (current && name !== undefined && address !== undefined) {
      current.pharmacies.push({ name: decode(name), address: decode(address) });
    }
  }
  return groups;
}

export function parseEfimeriaPage(html: string): EfimeriaPage {
  const { date, time } = parsePageStamp(html);
  return { date, time, pharmacies: parseFeatures(html), extended: parseExtended(html) };
}
