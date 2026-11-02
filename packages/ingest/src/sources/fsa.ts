/**
 * Reads the Attica association's duty site (`fsa-efimeries.gr`, iteq/fsa.ts) the way its page
 * does: the home page for the dates on offer, then the form's results for each date. One request
 * at a time, at most one a second; no token or bot challenge is involved.
 */
import { z } from 'zod';
import { parseFsaCards, parseFsaDates, type FsaCard } from '../iteq/fsa.ts';
import { decodeEntities } from '../iteq/parse.ts';
import { squash } from '../text.ts';
import { HttpClient, getJson, type HttpTransport } from './http.ts';

const PAUSE_MS = 1000;

export class FsaClient {
  readonly origin = 'https://fsa-efimeries.gr';
  private readonly http: HttpClient;

  /** `transport` is what a test replaces: the network and the clock. */
  constructor(transport: HttpTransport = {}) {
    this.http = new HttpClient({ ...transport, pauseMs: PAUSE_MS });
  }

  /** Requests made, retries included. */
  get requests(): number {
    return this.http.requests;
  }

  private request(path: string, form?: URLSearchParams): Promise<string> {
    return this.http.text(`${this.origin}${path}`, {
      accept: 'text/html',
      ...(form ? { form } : {}),
    });
  }

  /** The dates the site offers, from today. */
  async dates(): Promise<string[]> {
    return parseFsaDates(await this.request('/'));
  }

  /** Every pharmacy on duty on `date`, open now or not. */
  async day(date: string): Promise<FsaCard[]> {
    const body = new URLSearchParams({ Date: date, IsOpen: 'false' });
    return parseFsaCards(await this.request('/Home/FilteredHomeResults', body));
  }
}

/** The association's own site, where it posts the extended-hours tables (fsa/extended.ts). */
const FSA_SITE = 'https://fsa.gr';

/** One extended-hours table, as fsa.gr announces it. */
export interface FsaExtendedLink {
  readonly title: string;
  readonly announcementUrl: string;
  readonly fileUrl: string;
  /** When the post went up: a corrected table comes in a new post, or as a new file. */
  readonly publishedAt: string;
}

const PostsSchema = z.array(
  z.object({
    // In UTC, without its zone.
    date_gmt: z.string(),
    link: z.string(),
    title: z.object({ rendered: z.string() }),
    content: z.object({ rendered: z.string() }),
  }),
);

/**
 * The tables among the posts of the extended-hours category, newest first. Posts that only
 * remind members to declare their hours have no table (their titles do not start "ΠΙΝΑΚΑΣ").
 */
export function parseFsaExtendedPosts(json: unknown): FsaExtendedLink[] {
  const links: FsaExtendedLink[] = [];
  for (const post of PostsSchema.parse(json)) {
    const title = squash(decodeEntities(post.title.rendered.replace(/<[^>]*>/g, ' ')));
    if (!/^ΠΙΝΑΚΑΣ(?!\p{L})/u.test(title) || !/ΔΙΕΥΡΥΜΕΝ/.test(title)) continue;
    const file = /href="([^"]+\.pdf)"/i.exec(post.content.rendered)?.[1];
    if (!file) continue;
    links.push({
      title,
      announcementUrl: post.link,
      fileUrl: encodeURI(decodeURI(decodeEntities(file))),
      publishedAt: new Date(`${post.date_gmt}Z`).toISOString(),
    });
  }
  return links.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/** The latest extended-hours tables: two requests, the category's id and its posts. */
export async function listFsaExtendedHours(): Promise<FsaExtendedLink[]> {
  const categories = z
    .array(z.object({ id: z.number() }))
    .parse(await getJson(`${FSA_SITE}/wp-json/wp/v2/categories?slug=dievrimeno-orario`));
  const id = categories[0]?.id;
  if (id === undefined) throw new Error('fsa.gr: no extended-hours category');
  return parseFsaExtendedPosts(
    await getJson(
      `${FSA_SITE}/wp-json/wp/v2/posts?categories=${id}&per_page=10&_fields=date_gmt,link,title,content`,
    ),
  );
}
