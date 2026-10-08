import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parseDutyList } from '../fsth/parse.ts';
import { extractTextItems } from '../pdf.ts';
import { parseExtendedHours } from '../pkm/parse.ts';
import { readFirstSheet } from '../xlsx.ts';
import { LARISA } from '@pharmacy-skg/core';
import type { DutyDay } from '../schema.ts';
import { buildRegistry, dutyEntryId, matchExtendedEntries, matchExtendedEntry } from './build.ts';
import { Geocoder } from './geocode.ts';
import { OvertureIndex } from './overture.ts';

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

describe('matchExtendedEntries', () => {
  const pharmacies = [
    {
      id: '2310606083',
      name: 'ΣΤΡΟΥΜΠΙΝΗ ΑΛΕΞΑΝΔΡΑ & ΣΙΑ ΟΕ',
      address: 'ΩΡΑΙΟΚΑΣΤΡΟΥ 143',
      locality: 'Σταυρούπολη',
    },
    {
      id: '2310111111',
      name: 'ΑΛΛΗ ΦΑΡΜΑΚΟΠΟΙΟΣ ΕΕ',
      address: 'ΤΣΙΜΙΣΚΗ 5',
      locality: 'Θεσσαλονίκη',
    },
  ];
  const row = (name: string, address: string, postcode: string, area: string) => ({
    name,
    address,
    postcode,
    area,
  });
  const shopOnMadytos = row('ΣΤΡΟΥΜΠΙΝΗ ΑΛΕΞΑΝΔΡΑ', 'Ν. ΜΑΔΥΤΟΣ', '57014', 'Νέα Μάδυτος');
  const shopOnStavroupoli = row(
    'ΣΤΡΟΥΜΠΙΝΗ ΑΛΕΞΑΝΔΡΑ & ΣΙΑ ΟΕ',
    'ΩΡΑΙΟΚΑΣΤΡΟΥ 143',
    '56430',
    'Σταυρούπολη',
  );

  it('keeps the street match when a namesake shop comes first, and gives the namesake its own id', () => {
    const { ids, warnings } = matchExtendedEntries([shopOnMadytos, shopOnStavroupoli], pharmacies);
    expect(ids[1]).toBe('2310606083');
    expect(ids[0]).toMatch(/^x-[0-9a-f]{10}$/);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe('duplicate-extended');
    expect(warnings[0]?.message).toContain('Ν. ΜΑΔΥΤΟΣ');
  });

  it('is independent of the row order', () => {
    const forward = matchExtendedEntries([shopOnMadytos, shopOnStavroupoli], pharmacies);
    const backward = matchExtendedEntries([shopOnStavroupoli, shopOnMadytos], pharmacies);
    expect(backward.ids[0]).toBe('2310606083');
    expect(backward.ids[1]).toBe(forward.ids[0]);
  });

  it('drops a second row for the same shop and says so', () => {
    const { ids, warnings } = matchExtendedEntries(
      [shopOnStavroupoli, { ...shopOnStavroupoli, postcode: '99999' }],
      pharmacies,
    );
    expect(ids).toEqual(['2310606083', null]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain('99999');
  });

  it('gives two unmatched namesakes different ids', () => {
    const a = row('ΝΙΚΟΠΟΥΛΟΣ ΑΛΕΞΑΝΔΡΟΣ', 'ΕΠΙΔΑΥΡΟΥ 35', '54454', 'Θεσσαλονίκη');
    const b = row('ΝΙΚΟΠΟΥΛΟΣ ΑΛΕΞΑΝΔΡΟΣ', 'ΠΥΛΑΙΑΣ 27', '54454', 'Θεσσαλονίκη');
    const { ids } = matchExtendedEntries([a, b], []);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids.every((id) => id?.startsWith('x-'))).toBe(true);
  });

  it('matches like matchExtendedEntry when nothing collides', () => {
    const { ids, warnings } = matchExtendedEntries(
      [row('ΑΛΛΗ ΦΑΡΜΑΚΟΠΟΙΟΣ', 'ΤΣΙΜΙΣΚΗ 5', '54623', 'Θεσσαλονίκη')],
      pharmacies,
    );
    expect(ids).toEqual(['2310111111']);
    expect(warnings).toEqual([]);
  });

  it('gives every row of the real ΠΚΜ file a different id, whatever it matches', async () => {
    const { entries } = parseExtendedHours(
      readFirstSheet(new Uint8Array(await readFile(new URL('pkm/2026-09_2026-10.xlsx', FIXTURES)))),
    );
    const { ids } = matchExtendedEntries(entries, await dutyPharmacies());
    const kept = ids.filter((id): id is string => id !== null);
    expect(new Set(kept).size).toBe(kept.length);
    expect(kept.length).toBeGreaterThan(entries.length - 5);
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

describe('buildRegistry with coordinates from the lists', () => {
  const entry = (phone: string, name: string) => ({
    pharmacyId: phone,
    name,
    address: 'ΑΝΘΙΜΟΥ ΓΑΖΗ 41',
    locality: 'Λάρισα',
    phone,
  });
  const day: DutyDay = {
    schemaVersion: 1,
    date: '2026-10-06',
    groups: [
      {
        id: 'larisa',
        name: 'Λάρισα',
        source: { url: 'https://larisa.efhmeries.gr/', uploadedAt: '2026-10-06T13:30:00.000Z' },
        sections: [
          {
            kind: 'day',
            heading: 'ΑΠΟ 08:00 ΕΩΣ 23:00',
            hours: { from: '08:00', to: '23:00', toNextDay: false },
            extraHours: [],
            notes: [],
            entries: [entry('2410672566', 'ΔΑΣΤΑΜΑΝΗΣ'), entry('2410536972', 'ΓΕΩΡΓΟΥΛΟΠΟΥΛΟΥ')],
          },
        ],
      },
    ],
  };
  const listed = new Map([
    [
      '2410672566',
      { lat: 39.6335, lon: 22.4133, ref: 'https://larisa.efhmeries.gr/Home/Details/23023' },
    ],
    [
      '2410536972',
      { lat: 39.64, lon: 22.42, ref: 'https://larisa.efhmeries.gr/Home/Details/23022' },
    ],
  ]);

  it("places a pharmacy where its list says, after a manual fix, and records the city's source ids", async () => {
    const { pharmacies } = await buildRegistry({
      days: [day],
      extended: [],
      overrides: { '2410536972': { location: { lat: 39.65, lon: 22.43 } } },
      listed,
      overture: new OvertureIndex([]),
      geocoder: new Geocoder({}, false, LARISA.bounds),
      sourceIds: { duty: 'fsl', extended: null },
    });
    expect(pharmacies.map((p) => [p.id, p.location, p.sources])).toEqual([
      ['2410536972', { lat: 39.65, lon: 22.43, source: 'override', precision: 'exact' }, ['fsl']],
      [
        '2410672566',
        {
          lat: 39.6335,
          lon: 22.4133,
          ref: 'https://larisa.efhmeries.gr/Home/Details/23023',
          source: 'list',
          precision: 'exact',
        },
        ['fsl'],
      ],
    ]);
  });

  it('adds the pharmacies a roster names beyond the stored lists, the lists winning', async () => {
    const roster = [
      { ...entry('2410672566', 'ΔΑΣΤΑΜΑΝΗΣ ΠΑΛΙΟ'), groupId: 'larisa', date: '2026-12-01' },
      { ...entry('2410999999', 'ΝΕΟ ΦΑΡΜΑΚΕΙΟ'), groupId: 'larisa', date: '2027-01-15' },
    ];
    const { pharmacies } = await buildRegistry({
      days: [day],
      extended: [],
      roster,
      overrides: {},
      listed: new Map([...listed, ['2410999999', { lat: 39.6, lon: 22.4, ref: 'roster' }]]),
      overture: new OvertureIndex([]),
      geocoder: new Geocoder({}, false, LARISA.bounds),
      sourceIds: { duty: 'fsl', extended: null },
    });
    expect(
      pharmacies.map((p) => [p.id, p.name, p.groupId, p.firstSeen, p.location?.source]),
    ).toEqual([
      ['2410536972', 'ΓΕΩΡΓΟΥΛΟΠΟΥΛΟΥ', 'larisa', '2026-10-06', 'list'],
      ['2410672566', 'ΔΑΣΤΑΜΑΝΗΣ', 'larisa', '2026-10-06', 'list'],
      ['2410999999', 'ΝΕΟ ΦΑΡΜΑΚΕΙΟ', 'larisa', '2027-01-15', 'list'],
    ]);
  });
});
