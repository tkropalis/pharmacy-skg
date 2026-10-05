import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  OTC_LISTING,
  PRESCRIPTION_LISTING,
  decodeHtml,
  parseArticleFiles,
  parseListing,
} from './moh.ts';

const fixture = (name: string) =>
  readFile(new URL(`../../fixtures/moh/${name}`, import.meta.url), 'utf8');

describe('moh.gov.gr pages (real)', () => {
  it('lists the price bulletins with their ids and dates', async () => {
    const links = parseListing(await fixture('deltia-timwn-page1.html'), PRESCRIPTION_LISTING);
    expect(links).toHaveLength(20);
    expect(links[0]).toMatchObject({ id: 14805, date: '2026-09-30' });
    expect(links[0]?.title).toMatch(/^«Δελτίο Τιμών: α\) Νέων Φαρμάκων 2ου Τριμήνου 2026/);
    expect(links.find((l) => l.id === 14304)?.date).toBe('2026-05-20');
    expect(links.at(-1)?.id).toBe(14115);
  });

  it('lists the non-prescription bulletins', async () => {
    const links = parseListing(await fixture('deltia-timwn-mhsyfa-page1.html'), OTC_LISTING);
    expect(links[0]).toMatchObject({ id: 14636, date: '2026-09-03' });
    expect(links.find((l) => l.id === 13661)?.title).toMatch(
      /Αναθεώρηση καταλόγου μη συνταγογραφούμενων φαρμάκων/,
    );
  });

  it("reads an article's attachments", async () => {
    const url = `${PRESCRIPTION_LISTING}/14805-x`;
    const files = parseArticleFiles(await fixture('article-14805.html'), url);
    expect(files.map((f) => f.name)).toEqual([
      '40962 Σχέδιο Υ.Α. Νέα 2ου Tριμ. 2026 . Aνατ. Aναφοράς . Αναπρ. Μη Αποζ.pdf',
      'Πίνακας Νέων 2ου Τριμ. 2026.xlsx',
      'Πίνακας Νέων 2ου Τριμ. 2026.pdf',
      'Πίνακας Ανατιμ. Φαρμ. Αναφ..xlsx',
      'Πίνακας Ανατιμ. Φαρμ. Αναφ..pdf',
      'Πίνακας Αναπρ. Τιμής Μη Αποζ..xlsx',
      'Πίνακας Αναπρ. Τιμής Μη Αποζ..pdf',
    ]);
    expect(files[1]).toEqual({
      id: 31831,
      name: 'Πίνακας Νέων 2ου Τριμ. 2026.xlsx',
      url: `${url}?fdl=31831`,
    });
  });

  it('decodes entities and tags', () => {
    expect(decodeHtml('&laquo;A &amp; B&raquo; <b>x</b>&#39;')).toBe("«A & B» x'");
  });
});
