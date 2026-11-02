/**
 * Finds and reads the Region of the Ionian Islands' bimonthly decisions on Corfu's extended hours
 * on Diavgeia (diavgeia.gov.gr), through its open-data API only: `luminapi/opendata/search` to
 * find them and `luminapi/opendata/decisions/<ADA>/document` for the PDF. The site's own `/doc/`
 * and `luminapi/api/` are disallowed by its robots.txt and are never read (the ADA is only linked
 * from the credits). A request a second at most, the project's User-Agent.
 *
 * The decisions are titled "ΠΙΝΑΚΑΣ ΕΝΤΑΞΗΣ ΦΑΡΜΑΚΟΠΟΙΩΝ ΤΟΥ ΦΣΚ ΣΤΟ ΔΙΕΥΡΥΜΕΝΟ ΩΡΑΡΙΟ ΛΕΙΤΟΥΡΓΙΑΣ
 * ΦΑΡΜΑΚΕΙΩΝ ΝΟΕΜΒΡΙΟΣ-ΔΕΚΕΜΒΡΙΟΣ 2026" or "ΔΙΕΥΡΥΜΕΝΟ ΩΡΑΡΙΟ ΛΕΙΤΟΥΡΓΙΑΣ ΦΑΡΜΑΚΕΙΩΝ ΠΕ ΚΕΡΚΥΡΑΣ
 * ΜΑΙΟΥ-ΙΟΥΝΙΟΥ 2025"; the months in the title are the period. Each run asks for the word
 * "ΔΙΕΥΡΥΜΕΝΟ" in the last 100 days (the API cuts a longer span of issue dates to about six
 * months), so the next decision is found when it is posted, without a date written down here.
 */
import { z } from 'zod';
import { matchKey } from '../text.ts';
import { addDays } from '../time.ts';
import { HttpClient, type HttpTransport } from './http.ts';

const API = 'https://diavgeia.gov.gr/luminapi/opendata';
/** The Region of the Ionian Islands. */
export const IONIAN_ORG = '5008';

const SearchSchema = z.object({
  decisions: z.array(
    z.object({
      ada: z.string(),
      subject: z.string(),
      publishTimestamp: z.number(),
      status: z.string(),
      organizationId: z.string(),
    }),
  ),
});

export interface ExtendedDecision {
  readonly ada: string;
  readonly subject: string;
  /** The months the table is for. */
  readonly period: { readonly from: string; readonly to: string };
  /** When it was posted on Diavgeia (ISO). */
  readonly postedAt: string;
  /** The page people read it on. */
  readonly url: string;
}

const MONTH_STEMS = [
  'ΙΑΝΟΥ',
  'ΦΕΒΡΟ',
  'ΜΑΡΤΙ',
  'ΑΠΡΙΛ',
  'ΜΑΙΟΥ',
  'ΙΟΥΝΙ',
  'ΙΟΥΛΙ',
  'ΑΥΓΟΥ',
  'ΣΕΠΤΕ',
  'ΟΚΤΩΒ',
  'ΝΟΕΜΒ',
  'ΔΕΚΕΜ',
];

/** "…ΝΟΕΜΒΡΙΟΣ-ΔΕΚΕΜΒΡΙΟΣ 2026" and its variants as the two months; null if the title has none. */
export function extendedPeriod(subject: string): { from: string; to: string } | null {
  const words = matchKey(subject).split(' ');
  const months = words
    .map((word) => MONTH_STEMS.findIndex((stem) => word.startsWith(stem)) + 1)
    .filter((month) => month > 0);
  const year = words.find((word) => /^20\d{2}$/.test(word));
  const [first, second] = months;
  if (first === undefined || second === undefined || year === undefined || second < first) {
    return null;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = new Date(Date.UTC(Number(year), second, 0)).getUTCDate();
  return { from: `${year}-${pad(first)}-01`, to: `${year}-${pad(second)}-${pad(lastDay)}` };
}

export function decisionUrl(ada: string): string {
  return `https://diavgeia.gov.gr/decision/view/${ada}`;
}

export class CorfuDiavgeia {
  private readonly http: HttpClient;

  constructor(transport: HttpTransport = {}) {
    this.http = new HttpClient({ ...transport, pauseMs: 1000 });
  }

  /** Requests made, retries included. */
  get requests(): number {
    return this.http.requests;
  }

  /**
   * The tables for periods that are not over, newest posting first for each period (a corrected
   * table is posted again).
   */
  async extendedDecisions(today: string): Promise<ExtendedDecision[]> {
    const query = new URLSearchParams({
      subject: 'ΔΙΕΥΡΥΜΕΝΟ',
      org: IONIAN_ORG,
      from_issue_date: addDays(today, -100),
      size: '100',
    });
    const found = SearchSchema.parse(
      await this.http.json(`${API}/search?${query}`, { accept: 'application/json' }),
    );
    const byPeriod = new Map<string, ExtendedDecision>();
    for (const raw of found.decisions) {
      const key = matchKey(raw.subject);
      if (raw.status !== 'PUBLISHED' || raw.organizationId !== IONIAN_ORG) continue;
      if (!key.includes('ΦΑΡΜΑΚ') || !key.includes('ΩΡΑΡΙΟ')) continue;
      const period = extendedPeriod(raw.subject);
      if (!period || period.to < today) continue;
      const decision: ExtendedDecision = {
        ada: raw.ada,
        subject: raw.subject.replace(/\s+/g, ' ').trim(),
        period,
        postedAt: new Date(raw.publishTimestamp).toISOString(),
        url: decisionUrl(raw.ada),
      };
      const before = byPeriod.get(period.from);
      if (!before || before.postedAt < decision.postedAt) byPeriod.set(period.from, decision);
    }
    return [...byPeriod.values()].sort((a, b) => a.period.from.localeCompare(b.period.from));
  }

  /** The decision's PDF. */
  async document(ada: string): Promise<Uint8Array> {
    const response = await this.http.fetch(`${API}/decisions/${ada}/document`, { accept: '*/*' });
    return new Uint8Array(await response.arrayBuffer());
  }
}
