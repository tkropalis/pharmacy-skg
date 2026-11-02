/**
 * The pages of the Pharmaceutical Association of Corfu on farmakeu.static.otenet.gr, both plain
 * HTML in Greek and English, with no coordinates:
 *
 * - `phduties.php`: today's duties only. Under the date, a heading ("ΔΙΗΜΕΡΕΥΟΥΝ ΑΠΟ ΤΙΣ 8:00 ΕΩΣ
 *   ΤΙΣ 21:00", and one for the night) and the pharmacies on duty, each with name, address and
 *   phone in Greek and again in English.
 * - `members.php`: every member of the association with the address and phone of the pharmacy,
 *   the name in capitals as the duty page prints it. A pharmacy with partners has a row each.
 *
 * Fixtures: fixtures/corfu, saved on 2 Nov 2026.
 */
import { normalizePhone, squash } from '../text.ts';

export interface CorfuPharmacy {
  /** In capitals, as printed. */
  readonly name: string;
  /** The address as printed, without the phone. */
  readonly address: string;
  /** 10 digits, or empty when the line prints none that is valid. */
  readonly phone: string;
}

export interface CorfuDutyBlock {
  /** The heading as printed, white space collapsed. */
  readonly heading: string;
  readonly pharmacies: readonly CorfuPharmacy[];
}

export interface CorfuDuties {
  /** The page's own date, YYYY-MM-DD. */
  readonly date: string;
  readonly blocks: readonly CorfuDutyBlock[];
}

function decode(text: string): string {
  return squash(
    text
      .replace(/<[^>]*>/g, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#0?39;|&apos;/gi, "'")
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>'),
  );
}

/** A phone printed as "26610 20376", "2661-0..." or twice ("2661037872 - 2661044720"). */
const PHONE = /\d{4,5}[ .-]?\d{5,6}/g;

/**
 * Splits "ΜΙΛΤΙΑΔΟΥ ΜΑΡΓΑΡΙΤΗ 8  - ΤΗΛ. 2661031992" into the address and the first valid phone. The
 * marker is spelled "ΤΗΛ.", "ΤΗΛ:", "ΤΗΛ", "ΤHΛ." (with a Latin H) or "THL.", or missing
 * ("ΚΑΝΑΛΙΑ - 2661039264").
 */
export function splitAddressAndPhone(line: string): { address: string; phone: string } {
  const text = decode(line);
  const first = text.search(PHONE);
  if (first < 0) return { address: text.replace(/[\s,–-]+$/, ''), phone: '' };
  const address = text
    .slice(0, first)
    .replace(/[ΤT][ΗH][ΛL]\.?:?\s*$/i, '')
    .replace(/[\s,.:–-]+$/, '');
  let phone = '';
  for (const match of text.slice(first).matchAll(PHONE)) {
    phone = normalizePhone(match[0]) ?? '';
    if (phone) break;
  }
  return { address, phone };
}

/** "Δευτέρα 02/11/2026" in the page's heading. */
function parseDate(html: string): string {
  const match = /<h3[^>]*>\s*[^<\d]*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*<\/h3>/i.exec(html);
  const [, day = '', month = '', year = ''] = match ?? [];
  if (!match) throw new Error('farmakeu.static.otenet.gr: no date in the duty page');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/** The duty page: its date, and under each red heading the pharmacies up to the next. */
export function parseCorfuDuties(html: string): CorfuDuties {
  const date = parseDate(html);
  const blocks: { heading: string; pharmacies: CorfuPharmacy[] }[] = [];
  for (const [, inner = ''] of html.matchAll(/<center>([\s\S]*?)<\/center>/gi)) {
    if (/color:\s*#800000/i.test(inner)) {
      blocks.push({ heading: decode(inner), pharmacies: [] });
    } else if (/color:\s*#000080/i.test(inner)) {
      // <span><strong>NAME</strong></span><br>ADDRESS - ΤΗΛ. PHONE<br><strong>NAME</strong><br>…
      const [nameCell = '', addressLine = ''] = inner.split(/<br\s*\/?>/i);
      const name = decode(nameCell);
      const { address, phone } = splitAddressAndPhone(addressLine);
      const block = blocks.at(-1);
      if (name === '' || !block) {
        throw new Error(`farmakeu.static.otenet.gr: a pharmacy outside a heading: "${name}"`);
      }
      block.pharmacies.push({ name, address, phone });
    }
  }
  return { date, blocks };
}

/** Every row of the members' page. */
export function parseCorfuMembers(html: string): CorfuPharmacy[] {
  const members: CorfuPharmacy[] = [];
  for (const [, row = ''] of html.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(([, cell = '']) => cell);
    if (cells.length !== 2) continue;
    const name = decode(cells[0] ?? '');
    const { address, phone } = splitAddressAndPhone(cells[1] ?? '');
    if (name !== '') members.push({ name, address, phone });
  }
  return members;
}
