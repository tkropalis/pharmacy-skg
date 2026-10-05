/**
 * ΕΟΦ (eof.gr) posts its "limited availability" list every month, as a PDF linked from a
 * WordPress post. The parallel-export bans are posted too, but as scanned images (no text), so
 * they are not read.
 */
import { z } from 'zod';
import { dateFromTitle } from '../medicines/shortages.ts';
import { decodeHtml } from './moh.ts';
import { getJson } from './http.ts';

export const EOF_ORIGIN = 'https://www.eof.gr';
const POSTS_API = `${EOF_ORIGIN}/wp-json/wp/v2/posts`;

export const PostsSchema = z.array(
  z.object({
    link: z.string(),
    date_gmt: z.string(),
    title: z.object({ rendered: z.string() }),
    content: z.object({ rendered: z.string() }),
  }),
);

export interface ShortageListLink {
  readonly title: string;
  /** The date the list is "as of" (from its title; the post's date if the title has none). */
  readonly date: string;
  readonly postUrl: string;
  readonly fileUrl: string;
}

/** The newest limited-availability list among the posts, or null. */
export function latestShortageList(posts: z.infer<typeof PostsSchema>): ShortageListLink | null {
  const lists = posts
    .map((post) => ({ post, title: decodeHtml(post.title.rendered) }))
    .filter(({ title }) =>
      /ΛΙΣΤΑ ΦΑΡΜΑΚΕΥΤΙΚΩΝ ΣΚΕΥΑΣΜΑΤΩΝ ΠΕΡΙΟΡΙΣΜΕΝΗΣ ΔΙΑΘΕΣΙΜΟΤΗΤΑΣ/i.test(title),
    )
    .sort((a, b) => b.post.date_gmt.localeCompare(a.post.date_gmt));
  for (const { post, title } of lists) {
    const href = /href="([^"]+\.pdf)"/i.exec(post.content.rendered)?.[1];
    if (!href) continue;
    return {
      title,
      date: dateFromTitle(title) ?? post.date_gmt.slice(0, 10),
      postUrl: post.link,
      fileUrl: encodeURI(decodeURI(new URL(href, EOF_ORIGIN).href)),
    };
  }
  return null;
}

export async function findShortageList(): Promise<ShortageListLink | null> {
  const params = new URLSearchParams({
    search: 'ΠΕΡΙΟΡΙΣΜΕΝΗΣ ΔΙΑΘΕΣΙΜΟΤΗΤΑΣ',
    per_page: '10',
    _fields: 'link,date_gmt,title,content',
  });
  return latestShortageList(PostsSchema.parse(await getJson(`${POSTS_API}?${params}`)));
}
