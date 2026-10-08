import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { extractPages } from '../pdf.ts';
import { parseFsaExtendedPosts } from '../sources/fsa.ts';
import { monthPeriod, monthsOf, phonesIn, readFsaTable } from './extended.ts';
import { parseFsaHours } from './hours.ts';

const FIXTURES = new URL('../../fixtures/fsa/', import.meta.url);

// Pages 1–4 and the last of the September–October 2026 table (fsa.gr, 3 Aug 2026).
async function table() {
  const data = new Uint8Array(await readFile(new URL('extended_2026-09_2026-10.pdf', FIXTURES)));
  return readFsaTable(await extractPages(data));
}

describe('readFsaTable', () => {
  it('reads one row per pharmacy, by the cells’ borders', async () => {
    const rows = await table();
    expect(rows).toHaveLength(149);
    expect(rows.every((row) => row.hours.length === 2)).toBe(true);
    expect(rows[1]).toEqual({
      phones: ['2102619800'],
      hours: ['ΓΔΤΣ-ΠΑΡ 8.00-21.00 ΢ΑΒΒΑΣΟ 8.00-16.00', 'ΓΔΤΣ-ΠΑΡ 8.00-21.00 ΢ΑΒΒΑΣΟ 8.00-16.00'],
      printed: 'ΑΓ.ΑΝΑΡΓΤΡΟΗ | ΛΟΓΗΧΣΑΣΗΓΟΤ ΜΑΡΗΑ | ΢ΟΦ.ΒΔΝΗΕΔΛΟΤ 151 | 2102619800',
    });
  });

  it('joins a row that runs onto the next page', async () => {
    const row = (await table()).find((r) => r.phones.includes('2105446458'));
    expect(row?.printed).toContain('(΢ΣΑΜΑΣΗΟΤ ΣΖΛΔΜΑΥΟ΢) Δ.Δ.');
    expect(row?.hours[0]).toMatch(/^ΓΔΤ, 14:00-20:30, .* ΢ΑΒ 12\/09 ΚΛΔΗ΢ΣΑ$/);
  });

  it('reads most of the hours, and refuses the rest', async () => {
    const rows = await table();
    const read = rows.filter((row) => {
      try {
        parseFsaHours(row.hours[0] ?? '', { year: 2026, month: 9 });
        return true;
      } catch {
        return false;
      }
    });
    expect(read.length / rows.length).toBeGreaterThan(0.8);
  });
});

describe('phonesIn', () => {
  it('reads one or two numbers, split or short', () => {
    expect(phonesIn('2102610666 2102626377')).toEqual(['2102610666', '2102626377']);
    expect(phonesIn('210 9618251')).toEqual(['2109618251']);
    expect(phonesIn('6006565')).toEqual(['2106006565']);
    expect(phonesIn('')).toEqual([]);
  });
});

describe('monthsOf', () => {
  it.each([
    ['ΠΙΝΑΚΑΣ ΔΙΕΥΡΥΜΕΝΩΝ ΦΑΡΜΑΚΕΙΩΝ ΔΙΜΗΝΟΥ ΣΕΠΤΕΜΒΡΙΟΣ – ΟΚΤΩΒΡΙΟΣ 2026', 9],
    ['ΠΙΝΑΚΑΣ ΜΕ ΦΑΡΜΑΚΕΙΑ ΔΙΕΥΡΥΜΕΝΟΥ ΩΡΑΡΙΟΥ, ΔΙΜΗΝΟΥ ΙΑΝΟΥΑΡΙΟΥ ΦΕΒΡΟΥΑΡΙΟΥ 2026', 1],
    ['ΠΙΝΑΚΑΣ ΔΙΕΥΡΥΜΕΝΩΝ ΦΑΡΜΑΚΕΙΩΝ, ΔΙΜΗΝΟΥ ΜΑΙΟΥ – ΙΟΥΝΙΟΥ 2026', 5],
  ])('reads %s', (title, first) => {
    expect(monthsOf(title)).toEqual([
      { year: 2026, month: first },
      { year: 2026, month: first + 1 },
    ]);
  });

  it('wants two months in a row', () => {
    expect(monthsOf('ΠΙΝΑΚΑΣ ΔΙΕΥΡΥΜΕΝΟΥ ΩΡΑΡΙΟΥ 2026')).toBeNull();
    expect(monthsOf('ΙΑΝΟΥΑΡΙΟΣ ΜΑΡΤΙΟΣ 2026')).toBeNull();
  });

  it('gives a month its first and last date', () => {
    expect(monthPeriod({ year: 2026, month: 9 })).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(monthPeriod({ year: 2028, month: 2 })).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
});

describe('parseFsaExtendedPosts', () => {
  it('keeps the posts with a table, newest first', async () => {
    const posts = JSON.parse(await readFile(new URL('extended-posts.json', FIXTURES), 'utf8'));
    const links = parseFsaExtendedPosts(posts);
    expect(links.map((l) => l.title)).toEqual([
      'ΠΙΝΑΚΑΣ ΔΙΕΥΡΥΜΕΝΩΝ ΦΑΡΜΑΚΕΙΩΝ ΔΙΜΗΝΟΥ ΣΕΠΤΕΜΒΡΙΟΣ – ΟΚΤΩΒΡΙΟΣ 2026',
      'ΠΙΝΑΚΑΣ ΦΑΡΜΑΚΕΙΩΝ ΜΕ ΔΙΕΥΡΥΜΕΝΟ ΩΡΑΡΙΟ ΔΙΜΗΝΟΥ ΙΟΥΛΙΟΥ – ΑΥΓΟΥΣΤΟΥ 2026',
      'ΠΙΝΑΚΑΣ ΔΙΕΥΡΥΜΕΝΩΝ ΦΑΡΜΑΚΕΙΩΝ, ΔΙΜΗΝΟΥ ΜΑΙΟΥ – ΙΟΥΝΙΟΥ 2026',
      'ΠΙΝΑΚΑΣ ΜΕ ΦΑΡΜΑΚΕΙΑ ΔΙΕΥΡΥΜΕΝΟΥ ΩΡΑΡΙΟΥ, ΔΙΜΗΝΟΥ ΜΑΡΤΙΟΥ – ΑΠΡΙΛΙΟΥ 2026',
      'ΠΙΝΑΚΑΣ ΜΕ ΦΑΡΜΑΚΕΙΑ ΔΙΕΥΡΥΜΕΝΟΥ ΩΡΑΡΙΟΥ, ΔΙΜΗΝΟΥ ΙΑΝΟΥΑΡΙΟΥ ΦΕΒΡΟΥΑΡΙΟΥ 2026',
    ]);
    expect(links[0]?.fileUrl).toBe(
      'https://fsa.gr/wp-content/uploads/2026/08/%CE%A3%CE%95%CE%A0%CE%A4-%CE%9F%CE%9A%CE%A4-2026-final.pdf',
    );
  });
});
