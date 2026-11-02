import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DutyDaySchema, ExtendedHoursSchema } from '../schema.ts';
import {
  efimeriaDutyList,
  efimeriaExtendedHours,
  parseEfimeriaHours,
  townName,
  UnreadableHoursError,
} from './lists.ts';
import { parseEfimeriaPage, parsePageStamp, splitPhone, type EfimeriaPage } from './parse.ts';

const fixture = (name: string) =>
  readFileSync(new URL(`../../fixtures/efimeria/${name}`, import.meta.url), 'utf8');

const all = parseEfimeriaPage(fixture('2026-11-02_All.html'));

describe('parsePageStamp', () => {
  it("reads the server's date and time from the header", () => {
    expect(parsePageStamp(fixture('2026-11-02_All.html'))).toEqual({
      date: '2026-11-02',
      time: '12:25:21',
    });
    expect(parsePageStamp('<strong>Τετάρτη, 9 Δεκεμβρίου 2026 06:20:01</strong>')).toEqual({
      date: '2026-12-09',
      time: '06:20:01',
    });
  });

  it('fails on a page with no date, rather than guessing one', () => {
    expect(() => parsePageStamp('<html></html>')).toThrow(/no date/);
  });
});

describe('splitPhone', () => {
  it('takes the phone off a village address, whatever its spelling', () => {
    expect(splitPhone('ΑΓΙΟΥ ΙΩΑΝΝΟΥ ΠΡΟΔΡΟΜΟΥ 93 (ΚΑΤΩ ΑΧΑΪΑ) ΤΗΛ.: 26930 23100')).toEqual({
      address: 'ΑΓΙΟΥ ΙΩΑΝΝΟΥ ΠΡΟΔΡΟΜΟΥ 93 (ΚΑΤΩ ΑΧΑΪΑ)',
      phone: '2693023100',
    });
    expect(splitPhone('25ης ΜΑΡΤΙΟΥ 2 - ΠΑΡΑΛΙΑ ΠΑΤΡΩΝ ΤΗΛ.: 2610 524.492').phone).toBe(
      '2610524492',
    );
    expect(splitPhone('ΠΑΝΟΥ ΠΟΛΚΑ 5 ΤΗΛ.: 26920-22.506').phone).toBe('2692022506');
  });

  it('takes the first phone when there are two, and none from an address without one', () => {
    expect(
      splitPhone('Π.Ε.Ο. ΠΑΤΡΩΝ ΠΥΡΓΟΥ 690 (ΘΕΣΗ ΚΑΜΙΝΙΑ) ΤΗΛ.: 2610-670.324 & 6976408046'),
    ).toEqual({
      address: 'Π.Ε.Ο. ΠΑΤΡΩΝ ΠΥΡΓΟΥ 690 (ΘΕΣΗ ΚΑΜΙΝΙΑ)',
      phone: '2610670324',
    });
    expect(splitPhone('ΡΗΓΑ ΦΕΡΑΙΟΥ 24')).toEqual({ address: 'ΡΗΓΑ ΦΕΡΑΙΟΥ 24', phone: '' });
  });
});

describe('parseEfimeriaPage', () => {
  it('reads the 16 pharmacies on duty on 2 Nov 2026, with coordinates, from /All', () => {
    expect(all.date).toBe('2026-11-02');
    expect(all.pharmacies).toHaveLength(16);
    expect(all.pharmacies[0]).toMatchObject({
      id: 117,
      name: 'ΘΕΟΔΩΡΑΚΟΠΟΥΛΟΥ ΔΗΜΗΤΡΑ',
      address: 'ΗΡΩΩΝ ΠΟΛΥΤΕΧΝΕΙΟΥ 44-46 & ΠΕΝΤΕ ΠΗΓΑΔΙΩΝ 2',
      phone: '',
      town: 'Πάτρα',
      townKey: 'Patra',
      lat: 38.25943089,
      lon: 21.73868,
      windows: [{ fromSec: 52_200, toSec: 75_600, printed: '14:30 - 21:00 μμ' }],
    });
    for (const pharmacy of all.pharmacies) {
      expect(pharmacy.lat).toBeGreaterThan(37.9);
      expect(pharmacy.lat).toBeLessThan(38.4);
      expect(pharmacy.lon).toBeGreaterThan(21.4);
      expect(pharmacy.lon).toBeLessThan(22.3);
      expect(pharmacy.windows.length).toBeGreaterThan(0);
    }
  });

  it('reads the night pharmacy of Patras in two windows', () => {
    const night = all.pharmacies.find((p) => p.id === 635);
    expect(night?.windows.map((w) => [w.fromSec, w.toSec, w.printed])).toEqual([
      [75_600, 93_600, '21:00 μμ - 02:00 πμ'],
      [93_600, 117_000, '02:00 - 08:30'],
    ]);
  });

  it('reads the village pharmacies with their phones', () => {
    expect(all.pharmacies.filter((p) => p.phone !== '').map((p) => p.phone)).toEqual([
      '2693023100',
      '2610524492',
      '2610670324',
      '2610911416',
      '2610526096',
      '2692022506',
      '2691031403',
    ]);
  });

  it('reads the longer hours in seven groups, 53 pharmacies', () => {
    expect(all.extended).toHaveLength(7);
    expect(all.extended.reduce((n, g) => n + g.pharmacies.length, 0)).toBe(53);
    expect(all.extended[0]?.hours).toEqual([
      'Δευ. & Τετ. : 08.30 - 14.30',
      'Τρι. & Πεμ. & Παρ. : 8.30 - 14.30 & 17.30 - 21.00',
      'Σαβ. : 9.00 - 14.30',
    ]);
    // The site shuffles the block on every request: find a pharmacy, do not rely on its place.
    expect(all.extended[0]?.pharmacies).toContainEqual({
      name: 'ΜΑΚΡΥΓΕΝΗΣ ΠΑΝΑΓΙΩΤΗΣ',
      address: 'ΠΕΛΟΠΟΣ 42 - ΛΑΓΓΟΥΡΑ',
    });
  });

  it('reads the same day from the other views of the page', () => {
    for (const name of ['2026-11-02_Patra.html', '2026-11-02_Dimi.html']) {
      const view = parseEfimeriaPage(fixture(name));
      expect(view.pharmacies.map((p) => p.id)).toEqual(all.pharmacies.map((p) => p.id));
      const sorted = (groups: typeof all.extended) =>
        groups.map((g) => ({
          ...g,
          pharmacies: [...g.pharmacies].sort((a, b) => a.name.localeCompare(b.name, 'el')),
        }));
      expect(sorted(view.extended)).toEqual(sorted(all.extended));
    }
  });
});

describe('the same day in the evening', () => {
  it('lists the same 16 pharmacies: the site flags a shift 0 once it has started, which is not read', () => {
    const evening = parseEfimeriaPage(fixture('2026-11-02_All_evening.html'));
    expect(evening.time).toBe('19:53:31');
    expect(evening.pharmacies.map((p) => [p.id, p.windows])).toEqual(
      all.pharmacies.map((p) => [p.id, p.windows]),
    );
  });
});

describe('efimeriaDutyList', () => {
  const group = { id: 'achaia', name: 'Αχαΐα' };
  const { list, warnings } = efimeriaDutyList(all, group);

  it('is a valid duty day, with one section per distinct window', () => {
    expect(warnings).toEqual([]);
    expect(list).not.toBeNull();
    DutyDaySchema.parse({
      schemaVersion: 1,
      date: list?.date,
      groups: [
        {
          id: list?.groupId,
          name: list?.groupName,
          source: { url: 'https://www.efimeria.gr/All', uploadedAt: '2026-11-02T12:00:00.000Z' },
          sections: list?.sections.map((section) => ({
            ...section,
            entries: section.entries.map((entry) => ({ pharmacyId: 'x', ...entry })),
          })),
        },
      ],
    });
    expect(list?.date).toBe('2026-11-02');
    expect(list?.sections.map((s) => [s.heading, s.hours, s.kind, s.entries.length])).toEqual([
      ['14:30-08:30', { from: '14:30', to: '08:30', toNextDay: true }, 'overnight', 1],
      ['14:30 - 21:00 μμ', { from: '14:30', to: '21:00', toNextDay: false }, 'day', 7],
      ['14:30-21:00', { from: '14:30', to: '21:00', toNextDay: false }, 'day', 2],
      ['14:30-22:30', { from: '14:30', to: '22:30', toNextDay: false }, 'day', 4],
      ['21:00 μμ - 02:00 πμ', { from: '21:00', to: '02:00', toNextDay: true }, 'overnight', 1],
      [
        '21:00 μμ - 02:00 πμ + 02:00 - 08:30',
        { from: '21:00', to: '08:30', toNextDay: true },
        'overnight',
        1,
      ],
    ]);
  });

  it("joins a pharmacy's windows that touch, so the night pharmacy is on duty until 08:30", () => {
    const night = list?.sections.find((s) => s.heading.includes('+'));
    expect(night?.entries.map((e) => e.name)).toEqual(['ΜΠΑΡΔΟΥΤΣΟΣ ΓΕΩΡΓΙΟΣ']);
  });

  it('gives each pharmacy the town it is in as its place', () => {
    const places = new Set(list?.sections.flatMap((s) => s.entries.map((e) => e.locality)));
    expect([...places].sort()).toEqual(
      [
        'Δύμη',
        'Καλάβρυτα',
        'Μεσσάτιδα',
        'Νέος Ερινεός',
        'Παραλία Πατρών',
        'Πάτρα',
        'Ρίο',
        'Βραχνέικα',
      ].sort(),
    );
    expect(townName({ townKey: 'Somewhere', town: 'Κάπου' })).toBe('Κάπου');
  });

  it('reports a window that starts after midnight with none before it, and leaves it out', () => {
    const page: EfimeriaPage = {
      ...all,
      pharmacies: [
        {
          ...(all.pharmacies[0] as EfimeriaPage['pharmacies'][number]),
          windows: [{ fromSec: 93_600, toSec: 117_000, printed: '02:00 - 08:30' }],
        },
      ],
    };
    const result = efimeriaDutyList(page, group);
    expect(result.list).toBeNull();
    expect(result.warnings.map((w) => w.code)).toEqual(['unwritable-window']);
  });
});

describe('parseEfimeriaHours', () => {
  it('reads the forms the site prints', () => {
    expect(
      parseEfimeriaHours([
        'Δευ. & Τετ. : 08.30 - 14.30',
        'Τρι. & Πεμ. & Παρ. : 8.30 - 14.30 & 17.30 - 21.00',
        'Σαβ. : 9.00 - 14.30',
      ]),
    ).toEqual({
      1: [{ from: '08:30', to: '14:30' }],
      3: [{ from: '08:30', to: '14:30' }],
      2: [
        { from: '08:30', to: '14:30' },
        { from: '17:30', to: '21:00' },
      ],
      4: [
        { from: '08:30', to: '14:30' },
        { from: '17:30', to: '21:00' },
      ],
      5: [
        { from: '08:30', to: '14:30' },
        { from: '17:30', to: '21:00' },
      ],
      6: [{ from: '09:00', to: '14:30' }],
    });
    expect(Object.keys(parseEfimeriaHours(['Δευ. - Παρ. : 8.00 - 21.00']))).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ]);
    // "Τρ." for Tuesday, as one group of the site writes it.
    expect(Object.keys(parseEfimeriaHours(['Δευ. & Τρ. : 8.30 - 14.30']))).toEqual(['1', '2']);
  });

  it.each([
    ['a weekday it does not know', 'Χθες : 8.00 - 14.00'],
    ['hours that end before they start', 'Δευ. : 21.00 - 8.00'],
    ['hours with no end', 'Δευ. : 8.00'],
    ['a weekday given twice', 'Δευ. - Τρι. : 8.00 - 14.00 ; Δευ. : 9.00 - 12.00'],
    ['a range of weekdays backwards', 'Παρ. - Δευ. : 8.00 - 14.00'],
  ])('refuses %s, and does not guess', (_, line) => {
    expect(() => parseEfimeriaHours(line.split(' ; '))).toThrow(UnreadableHoursError);
  });
});

describe('efimeriaExtendedHours', () => {
  const options = {
    today: '2026-11-02',
    until: '2026-11-09',
    area: 'Πάτρα',
    url: 'https://www.efimeria.gr/All',
    uploadedAt: '2026-11-02T12:00:00.000Z',
    previous: undefined,
  } as const;

  it('makes one entry per pharmacy listed, valid for a week after the reading', () => {
    const { list, warnings } = efimeriaExtendedHours(all.extended, options);
    expect(warnings).toEqual([]);
    expect(list?.entries).toHaveLength(53);
    expect(list?.period).toEqual({ from: '2026-11-02', to: '2026-11-09' });
    expect(list ? ExtendedHoursSchema.safeParse(list).success : false).toBe(true);
    const names = list?.entries.map((entry) => entry.name) ?? [];
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'el')));
    expect(list?.entries.find((entry) => entry.name === 'ΜΑΚΡΥΓΕΝΗΣ ΠΑΝΑΓΙΩΤΗΣ')).toMatchObject({
      pharmacyId: '',
      area: 'Πάτρα',
      scheduleText: [
        'Δευτέρα: 08:30 - 14:30',
        'Τρίτη: 08:30 - 14:30 και 17:30 - 21:00',
        'Τετάρτη: 08:30 - 14:30',
        'Πέμπτη: 08:30 - 14:30 και 17:30 - 21:00',
        'Παρασκευή: 08:30 - 14:30 και 17:30 - 21:00',
        'Σάββατο: 09:00 - 14:30',
      ].join('\n'),
    });
  });

  it('keeps the day the hours first appeared while they do not change, and moves the end', () => {
    const first = efimeriaExtendedHours(all.extended, options).list;
    const again = efimeriaExtendedHours(all.extended, {
      ...options,
      today: '2026-11-05',
      until: '2026-11-12',
      uploadedAt: '2026-11-05T12:00:00.000Z',
      previous: first ?? undefined,
    }).list;
    expect(again?.period).toEqual({ from: '2026-11-02', to: '2026-11-12' });
    expect(again?.source.uploadedAt).toBe('2026-11-02T12:00:00.000Z');
    const changed = efimeriaExtendedHours(
      all.extended.map((g, i) => (i === 0 ? { ...g, pharmacies: g.pharmacies.slice(1) } : g)),
      { ...options, today: '2026-11-05', until: '2026-11-12', previous: first ?? undefined },
    ).list;
    expect(changed?.period.from).toBe('2026-11-05');
  });

  it('reports a group it cannot read and leaves its pharmacies out', () => {
    const { list, warnings } = efimeriaExtendedHours(
      [
        { hours: ['Δευ. : από 8 έως 9'], pharmacies: [{ name: 'Α', address: 'Β 1' }] },
        ...all.extended,
      ],
      options,
    );
    expect(warnings.map((w) => w.code)).toEqual(['invalid-hours']);
    expect(list?.entries).toHaveLength(53);
  });

  it('gives no list when nothing can be read', () => {
    expect(efimeriaExtendedHours([], options).list).toBeNull();
  });
});
