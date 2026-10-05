import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { PostsSchema, latestShortageList } from './eof.ts';

describe('ΕΟΦ posts (real search result)', () => {
  it('finds the newest limited-availability list and its PDF', async () => {
    const posts = PostsSchema.parse(
      JSON.parse(
        await readFile(new URL('../../fixtures/eof/posts-search.json', import.meta.url), 'utf8'),
      ),
    );
    const list = latestShortageList(posts);
    expect(list).toEqual({
      title: 'ΛΙΣΤΑ ΦΑΡΜΑΚΕΥΤΙΚΩΝ ΣΚΕΥΑΣΜΑΤΩΝ ΠΕΡΙΟΡΙΣΜΕΝΗΣ ΔΙΑΘΕΣΙΜΟΤΗΤΑΣ 30 ΣΕΠΤΕΜΒΡΙΟΥ 2026',
      date: '2026-09-30',
      postUrl: expect.stringMatching(/^https:\/\/www\.eof\.gr\/%ce%bb/) as string,
      fileUrl: encodeURI(
        'https://www.eof.gr/wp-content/uploads/2026/10/ΛΙΣΤΑ-ΦΑΡΜΑΚΕΥΤΙΚΩΝ-ΣΚΕΥΑΣΜΑΤΩΝ-ΠΕΡΙΟΡΙΣΜΕΝΗΣ-ΔΙΑΘΕΣΙΜΟΤΗΤΑΣ-30-ΣΕΠΤΕΜΒΡΙΟΥ-2026.pdf',
      ),
    });
  });

  it('returns null when no post is a list', () => {
    expect(latestShortageList([])).toBeNull();
  });
});
