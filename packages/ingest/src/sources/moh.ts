/**
 * The Ministry of Health (moh.gov.gr) publishes medicine prices as ministerial decisions, one
 * article per decision, each with the decision as a PDF and its price tables as .xlsx and PDF.
 * The site has no API: the listing pages and articles are read as HTML.
 *
 * The connection is sometimes reset; getText/getBytes retry.
 */
import { getText } from './http.ts';

export const MOH_ORIGIN = 'https://www.moh.gov.gr';
/** Prescription medicines (δελτία τιμών). */
export const PRESCRIPTION_LISTING = `${MOH_ORIGIN}/articles/times-farmakwn/deltia-timwn`;
/** Non-prescription medicines (δελτία τιμών ΜΗΣΥΦΑ). */
export const OTC_LISTING = `${MOH_ORIGIN}/articles/times-farmakwn/deltia-timwn-mhsyfa`;

export interface MohArticleLink {
  /** The numeric id at the start of the article's slug; ids grow with publication. */
  readonly id: number;
  readonly url: string;
  readonly title: string;
  /** YYYY-MM-DD, as listed. */
  readonly date: string;
}

export interface MohFile {
  /** The `fdl` download id. */
  readonly id: number;
  readonly name: string;
  readonly url: string;
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  laquo: '«',
  raquo: '»',
  nbsp: ' ',
};

export function decodeHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole)
    .replace(/\s+/g, ' ')
    .trim();
}

function isoFromGreekDate(text: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

/** The articles of a listing page: each item is a date followed by a linked heading. */
export function parseListing(html: string, listingUrl: string): MohArticleLink[] {
  const prefix = `${listingUrl.replace(/\/$/, '')}/`;
  const links: MohArticleLink[] = [];
  const item =
    /<span class="datetime">([^<]+)<\/span>[\s\S]*?<h1><a href="([^"]+)">([\s\S]*?)<\/a><\/h1>/g;
  for (const match of html.matchAll(item)) {
    const [, rawDate = '', url = '', rawTitle = ''] = match;
    if (!url.startsWith(prefix)) continue;
    const id = /^(\d+)-/.exec(url.slice(prefix.length))?.[1];
    const date = isoFromGreekDate(rawDate);
    if (id === undefined || date === null) continue;
    links.push({ id: Number(id), url, title: decodeHtml(rawTitle), date });
  }
  return links;
}

/** The files attached to an article ("Αρχεία"), in the order listed. */
export function parseArticleFiles(html: string, articleUrl: string): MohFile[] {
  const files: MohFile[] = [];
  const seen = new Set<number>();
  for (const match of html.matchAll(
    /<a href="\?fdl=(\d+)"[^>]*?title="Download: ([^"]+?) \([\d.,]+ [KMG]?B\)"/g,
  )) {
    const id = Number(match[1]);
    if (seen.has(id)) continue;
    seen.add(id);
    files.push({ id, name: decodeHtml(match[2] ?? ''), url: `${articleUrl}?fdl=${id}` });
  }
  return files;
}

/** Listing pages, newest first, until `enough` says the articles read so far suffice. */
export async function listArticles(
  listingUrl: string,
  enough: (articles: readonly MohArticleLink[]) => boolean,
  maxPages = 6,
): Promise<MohArticleLink[]> {
  const articles: MohArticleLink[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const found = parseListing(await getText(`${listingUrl}?page=${page}`), listingUrl);
    if (found.length === 0) break;
    articles.push(...found);
    if (enough(articles)) break;
  }
  return articles;
}

export async function articleFiles(article: MohArticleLink): Promise<MohFile[]> {
  return parseArticleFiles(await getText(article.url), article.url);
}
