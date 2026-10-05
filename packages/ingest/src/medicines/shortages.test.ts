import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { extractTextItems } from '../pdf.ts';
import { dateFromTitle, parseShortageList, type ShortageEntry } from './shortages.ts';

const FIXTURE = new URL('../../fixtures/eof/2026-09-30_limited-availability.pdf', import.meta.url);

describe('dateFromTitle', () => {
  it('reads the date in the list titles', () => {
    expect(
      dateFromTitle(
        'ΛΙΣΤΑ ΦΑΡΜΑΚΕΥΤΙΚΩΝ ΣΚΕΥΑΣΜΑΤΩΝ ΠΕΡΙΟΡΙΣΜΕΝΗΣ ΔΙΑΘΕΣΙΜΟΤΗΤΑΣ 30 ΣΕΠΤΕΜΒΡΙΟΥ 2026',
      ),
    ).toBe('2026-09-30');
    expect(dateFromTitle('… ΔΙΑΘΕΣΙΜΟΤΗΤΑΣ 31 ΜΑΪΟΥ 2026')).toBe('2026-05-31');
    // The May list's title has no year: unknown, not guessed.
    expect(dateFromTitle('… ΔΙΑΘΕΣΙΜΟΤΗΤΑΣ 31 ΜΑΪΟΥ')).toBeNull();
  });
});

describe('parseShortageList (the list of 30 September 2026)', () => {
  let entries: ShortageEntry[];
  beforeAll(async () => {
    entries = parseShortageList(await extractTextItems(new Uint8Array(await readFile(FIXTURE))));
  });

  it('finds every pack once', () => {
    expect(entries).toHaveLength(289);
    expect(new Set(entries.map((e) => e.barcode)).size).toBe(289);
  });

  it('reads the dates and the reason of a one-line row', () => {
    expect(entries[0]).toEqual({
      barcode: '2801928501017',
      from: '2026-10-30',
      to: '2026-11-30',
      reason: 'Αυξημένη ζήτηση',
    });
  });

  it('reads wrapped rows and the Ι.Φ.Ε.Τ. section with its own columns', () => {
    expect(entries.find((e) => e.barcode === '2801961802010')).toEqual({
      barcode: '2801961802010',
      from: '2027-01-01',
      to: '2027-02-01',
      reason: 'Προβλήματα στην παραγωγική διαδικασία',
    });
    expect(entries.find((e) => e.barcode === '2809747001015')).toEqual({
      barcode: '2809747001015',
      from: '2026-09-24',
      to: '2026-10-15',
      reason: 'ΑΝΑΜΕΝΕΤΑΙ',
    });
    // No end date printed.
    expect(entries.find((e) => e.barcode === '2809173401014')).toMatchObject({
      from: '2026-09-24',
      to: null,
    });
  });

  it('dates nearly every row', () => {
    expect(entries.filter((e) => e.from === null)).toHaveLength(0);
    expect(entries.filter((e) => e.to === null).length).toBeLessThan(10);
  });
});
