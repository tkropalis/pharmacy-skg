/**
 * The Region of Central Macedonia (ΠΚΜ) announces the extended-hours list for
 * the Thessaloniki regional unit every two months, with an .xlsx attachment.
 */
import { z } from 'zod';
import { getJson, getText } from './http.ts';

const POSTS_API = 'https://www.pkm.gov.gr/wp-json/wp/v2/posts';

export interface ExtendedHoursLink {
  readonly title: string;
  readonly announcementUrl: string;
  readonly fileUrl: string;
  readonly publishedAt: string;
  readonly period: { readonly from: string; readonly to: string };
}

const PostsSchema = z.array(
  z.object({
    link: z.string(),
    date_gmt: z.string(),
    title: z.object({ rendered: z.string() }),
    content: z.object({ rendered: z.string() }),
  }),
);

function decodeEntities(html: string): string {
  return html
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '');
}

/** Reads "… της Μ.Ε. Θεσσαλονίκης από 01-09-2026 έως 31-10-2026 …" into a period. */
export function periodFromTitle(title: string): { from: string; to: string } | null {
  if (!/Θεσσαλονίκης/.test(title) || !/διευρυμένο ωράριο/i.test(title)) return null;
  const match = /από\s+(\d{2})-(\d{2})-(\d{4})\s+έως\s+(\d{2})-(\d{2})-(\d{4})/.exec(title);
  if (!match) return null;
  const [, d1, m1, y1, d2, m2, y2] = match;
  return { from: `${y1}-${m1}-${d1}`, to: `${y2}-${m2}-${d2}` };
}

/** Finds the .xlsx attachment linked from an announcement's HTML. */
export function findXlsxLink(html: string): string | null {
  const match = /href="([^"]+\.xlsx)"/i.exec(html);
  return match?.[1] ?? null;
}

/** Lists the recent extended-hours announcements for the Thessaloniki regional unit. */
export async function listExtendedHours(): Promise<ExtendedHoursLink[]> {
  const params = new URLSearchParams({
    search: 'διευρυμένο ωράριο φαρμακείων',
    per_page: '20',
    _fields: 'link,date_gmt,title,content',
  });
  const posts = PostsSchema.parse(await getJson(`${POSTS_API}?${params}`));
  const links: ExtendedHoursLink[] = [];
  for (const post of posts) {
    const title = decodeEntities(post.title.rendered).trim();
    const period = periodFromTitle(title);
    if (!period) continue;
    const fileUrl = findXlsxLink(post.content.rendered) ?? findXlsxLink(await getText(post.link));
    if (!fileUrl) continue;
    links.push({
      title,
      announcementUrl: post.link,
      fileUrl,
      publishedAt: `${post.date_gmt}Z`,
      period,
    });
  }
  return links;
}
