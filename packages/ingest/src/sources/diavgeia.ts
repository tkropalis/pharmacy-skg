/**
 * Reads Diavgeia (diavgeia.gov.gr), where every Region and many other bodies must post their
 * decisions, through its open-data API only: `luminapi/opendata/search` to find decisions and
 * `luminapi/opendata/decisions/<ADA>` for one decision's data and its document. The site's own
 * `/doc/` and `luminapi/api/` are disallowed by its robots.txt and are never read (the ADA is
 * only linked from the credits). One request at a time, at most one a second.
 *
 * A Region posts its pharmacy duty tables (Ilia, cities/ilia.ts) and its regular hours here, so
 * the client is for any area whose association's lists are Diavgeia decisions.
 */
import { z } from 'zod';
import { addDays } from '../time.ts';
import { HttpClient, type HttpTransport } from './http.ts';

const API = 'https://diavgeia.gov.gr/luminapi/opendata';
const PAUSE_MS = 1000;
/** Decisions asked for at a time (the API's own limit is 500). */
const PAGE_SIZE = 100;
/**
 * The longest span of issue dates one search covers: the API silently cuts a longer one to about
 * six months (2 Nov 2026: from 2025-12-01 it answered up to 2026-05-30). A longer span is
 * asked for in several searches.
 */
const WINDOW_DAYS = 150;

const DecisionSchema = z.object({
  ada: z.string(),
  subject: z.string(),
  /** Epoch ms of the issue date, at midnight UTC. */
  issueDate: z.number(),
  /** Epoch ms of the posting. */
  publishTimestamp: z.number(),
  versionId: z.string(),
  status: z.string(),
  organizationId: z.string(),
  unitIds: z.array(z.string()).default([]),
});

const SearchSchema = z.object({
  decisions: z.array(DecisionSchema),
  info: z.object({ total: z.number() }),
});

/** What the pipeline needs of a decision. */
export interface DiavgeiaDecision {
  readonly ada: string;
  readonly subject: string;
  /** The date the body issued it (YYYY-MM-DD). */
  readonly issueDate: string;
  /** When it was posted on Diavgeia (ISO): stable for a decision, so it dates a list. */
  readonly postedAt: string;
  /** Changes when the decision is corrected: a stored copy is stale when it differs. */
  readonly versionId: string;
  /** "PUBLISHED" for a decision in force, "REVOKED" once withdrawn. */
  readonly status: string;
  readonly organizationId: string;
  readonly unitIds: readonly string[];
}

/** The page people read a decision on; the credits and the lists' sources link to it. */
export function diavgeiaUrl(ada: string): string {
  return `https://diavgeia.gov.gr/decision/view/${ada}`;
}

function toDecision(raw: z.infer<typeof DecisionSchema>): DiavgeiaDecision {
  return {
    ada: raw.ada,
    subject: raw.subject.replace(/\s+/g, ' ').trim(),
    issueDate: new Date(raw.issueDate).toISOString().slice(0, 10),
    postedAt: new Date(raw.publishTimestamp).toISOString(),
    versionId: raw.versionId,
    status: raw.status,
    organizationId: raw.organizationId,
    unitIds: raw.unitIds,
  };
}

export interface DiavgeiaSearch {
  /** The organisation's Diavgeia id (5004: Region of Western Greece). */
  readonly org: string;
  /** Only decisions of this unit (78414: the Ilia regional unit's public health directorate). */
  readonly unit?: string;
  /**
   * Words the subject must contain. The search matches whole words, with accents, as a phrase:
   * "Διημερεύσεις" finds "Διημερεύσεις – Διανυκτερεύσεις …" but not "Διημέρευσης".
   */
  readonly subject: string;
  /** First and last issue date to look at (YYYY-MM-DD), any distance apart. */
  readonly from: string;
  readonly to: string;
}

/** The days a span of dates is cut into for the API: `WINDOW_DAYS` at most each. */
export function searchWindows(from: string, to: string): [from: string, to: string][] {
  const windows: [string, string][] = [];
  for (let start = from; start <= to;) {
    const end = addDays(start, WINDOW_DAYS - 1);
    windows.push([start, end < to ? end : to]);
    start = addDays(start, WINDOW_DAYS);
  }
  return windows;
}

export class DiavgeiaClient {
  private readonly http: HttpClient;

  /** `transport` is what a test replaces: the network and the clock. */
  constructor(transport: HttpTransport = {}) {
    this.http = new HttpClient({ ...transport, pauseMs: PAUSE_MS });
  }

  /** Requests made, retries included. */
  get requests(): number {
    return this.http.requests;
  }

  /** Decisions in force whose subject matches, newest issue date first. */
  async search({ org, unit, subject, from, to }: DiavgeiaSearch): Promise<DiavgeiaDecision[]> {
    const found = new Map<string, DiavgeiaDecision>();
    for (const [windowFrom, windowTo] of searchWindows(from, to)) {
      for (let page = 0; ; page++) {
        const params = new URLSearchParams({
          org,
          ...(unit ? { unit } : {}),
          subject,
          from_issue_date: windowFrom,
          to_issue_date: windowTo,
          status: 'published',
          sort: 'recent',
          size: String(PAGE_SIZE),
          page: String(page),
        });
        const result = SearchSchema.parse(
          await this.http.json(`${API}/search?${params}`, { accept: 'application/json' }),
        );
        for (const decision of result.decisions) found.set(decision.ada, toDecision(decision));
        if ((page + 1) * PAGE_SIZE >= result.info.total) break;
      }
    }
    return [...found.values()].sort(
      (a, b) => b.issueDate.localeCompare(a.issueDate) || a.ada.localeCompare(b.ada),
    );
  }

  /** One decision's data (its version tells whether a stored copy is current). */
  async decision(ada: string): Promise<DiavgeiaDecision> {
    const raw = DecisionSchema.parse(
      await this.http.json(`${API}/decisions/${encodeURIComponent(ada)}`, {
        accept: 'application/json',
      }),
    );
    return toDecision(raw);
  }

  /** The decision's document, a PDF. */
  async document(ada: string): Promise<Uint8Array> {
    const response = await this.http.fetch(`${API}/decisions/${encodeURIComponent(ada)}/document`, {
      accept: 'application/pdf',
    });
    return new Uint8Array(await response.arrayBuffer());
  }
}
