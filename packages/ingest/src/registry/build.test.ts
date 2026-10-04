import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parseDutyList } from '../fsth/parse.ts';
import { extractTextItems } from '../pdf.ts';
import { parseExtendedHours } from '../pkm/parse.ts';
import { readFirstSheet } from '../pkm/xlsx.ts';
import { dutyEntryId, matchExtendedEntry } from './build.ts';

const FIXTURES = new URL('../../fixtures/', import.meta.url);

async function dutyPharmacies() {
  const byId = new Map<string, { id: string; name: string; address: string; locality: string }>();
  const dir = new URL('fsth/', FIXTURES);
  for (const file of await readdir(dir)) {
    const list = parseDutyList(
      await extractTextItems(new Uint8Array(await readFile(new URL(file, dir)))),
    );
    for (const section of list.sections) {
      for (const entry of section.entries) {
        const id = dutyEntryId(entry, []);
        byId.set(id, { id, ...entry });
      }
    }
  }
  return [...byId.values()];
}

describe('matchExtendedEntry against the real fixtures', () => {
  it('matches ΠΚΜ entries to duty-list pharmacies by name and street', async () => {
    const pharmacies = await dutyPharmacies();
    const { entries } = parseExtendedHours(
      readFirstSheet(new Uint8Array(await readFile(new URL('pkm/2026-09_2026-10.xlsx', FIXTURES)))),
    );
    const find = (name: string) => {
      const entry = entries.find((candidate) => candidate.name === name);
      if (!entry) throw new Error(`No ΠΚΜ entry ${name}`);
      return matchExtendedEntry(entry, pharmacies);
    };

    // Same partnership, punctuation differs ("ΟΕ" vs "Ο.Ε.").
    expect(find('ΛΩΤΙΔΗΣ - ΣΤΑΥΡΑΚΗΣ ΟΕ')).toBe('2310733843');
    // Shares both surnames with the one above, but is a different pharmacy
    // on another street, so it must not match it.
    expect(find('ΣΤΑΥΡΑΚΗΣ ΣΤΑΥΡΟΣ - ΛΩΤΙΔΗΣ ΙΣΑΑΚ ΟΕ')).not.toBe('2310733843');

    // With a week of duty lists, a good share of the 398 entries already match.
    const matched = entries.filter((entry) => matchExtendedEntry(entry, pharmacies) !== null);
    expect(matched.length).toBeGreaterThan(100);
  });
});

describe('dutyEntryId', () => {
  const known = [
    { id: '2397022000', name: 'ΠΑΠΑΣΤΕΦΑΝΟΥ Χ. - ΠΑΠΑΔΟΠΟΥΛΟΥ Α. Ο.Ε.', locality: 'Ασπροβάλτα' },
  ];

  it('uses a valid phone number', () => {
    expect(dutyEntryId({ name: 'X', locality: 'Y', phone: '2310733843' }, known)).toBe(
      '2310733843',
    );
  });

  it('recognises a known pharmacy printed with a phone typo', () => {
    expect(
      dutyEntryId(
        {
          name: 'ΠΑΠΑΣΤΕΦΑΝΟΥ Χ. - ΠΑΠΑΔΟΠΟΥΛΟΥ Α. Ο.Ε.',
          locality: 'Ασπροβάλτα',
          phone: '239722000',
        },
        known,
      ),
    ).toBe('2397022000');
  });

  it('falls back to a name-based id', () => {
    expect(dutyEntryId({ name: 'ΝΕΟ ΦΑΡΜΑΚΕΙΟ', locality: 'Σίνδος', phone: '123' }, known)).toMatch(
      /^x-/,
    );
  });
});
