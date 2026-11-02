import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { corfuPipeline } from '../cities/corfu.ts';
import type { RosterEntry } from '../cities/pipeline.ts';
import { extractPages, type PdfPage } from '../pdf.ts';
import { extendedPeriod } from '../sources/corfu-diavgeia.ts';
import { corfuRoster } from '../cities/corfu.ts';
import { parseCorfuMembers } from './parse.ts';
import {
  matchMember,
  readCorfuExtended,
  readCorfuHours,
  readCorfuTable,
  UnreadableRowError,
} from './extended.ts';

const fixture = (name: string) => new URL(`../../fixtures/${name}`, import.meta.url);
const PERIOD = { from: '2026-11-01', to: '2026-12-31' } as const;

const roster: RosterEntry[] = corfuRoster(
  parseCorfuMembers(readFileSync(fixture('corfu/2026-11-02_members.html'), 'utf8')),
  { today: '2026-11-02', before: null },
).roster.entries as RosterEntry[];

let pages: PdfPage[];
beforeAll(async () => {
  pages = await extractPages(
    new Uint8Array(readFileSync(fixture('diavgeia/corfu-2026-11_ΡΡ6Ζ7ΛΕ-ΤΔΖ.pdf'))),
  );
}, 60_000);

describe('extendedPeriod', () => {
  it.each([
    ['ΠΙΝΑΚΑΣ ΕΝΤΑΞΗΣ ΦΑΡΜΑΚΟΠΟΙΩΝ ... ΝΟΕΜΒΡΙΟΣ-ΔΕΚΕΜΒΡΙΟΣ 2026', '2026-11-01', '2026-12-31'],
    [
      'ΔΙΕΥΡΥΜΕΝΟ ΩΡΑΡΙΟ ΛΕΙΤΟΥΡΓΙΑΣ ΦΑΡΜΑΚΕΙΩΝ ΠΕ ΚΕΡΚΥΡΑΣ ΓΙΑ ΝΟΕΜΒΡΙΟ -ΔΕΚΕΜΒΡΙΟ 2025',
      '2025-11-01',
      '2025-12-31',
    ],
    [
      'ΔΙΕΥΡΥΜΕΝΟ ΩΡΑΡΙΟ ΛΕΙΤΟΥΡΓΙΑΣ ΦΑΡΜΑΚΕΙΩΝ ΠΕ ΚΕΡΚΥΡΑΣΓΙΑ ΤΟ ΔΙΜΗΝΟ ΜΑΙΟΥ -ΙΟΥΝΙΟΥ 2026',
      '2026-05-01',
      '2026-06-30',
    ],
    ['ΔΙΕΥΡΥΜΕΝΟ ΩΡΑΡΙΟ ΛΕΙΤΟΥΡΓΙΑΣ ΦΑΡΜΑΚΕΙΩΝ ΜΑΡΤΙΟΥ-ΑΠΡΙΛΙΟΥ 2025', '2025-03-01', '2025-04-30'],
    ['ΔΙΕΥΡΥΜΕΝΟ ΩΡΑΡΙΟ ΦΑΡΜΑΚΕΙΩΝ ΣΕΠΤΕΜΒΡΙΟΥ-ΟΚΤΩΒΡΙΟΥ 2025', '2025-09-01', '2025-10-31'],
  ])('reads the months of "%s"', (subject, from, to) => {
    expect(extendedPeriod(subject)).toEqual({ from, to });
  });

  it('gives none for a title with no two months and a year', () => {
    expect(extendedPeriod('ΔΙΕΥΡΥΜΕΝΟ ΩΡΑΡΙΟ ΦΑΡΜΑΚΕΙΩΝ')).toBeNull();
  });
});

describe('readCorfuHours', () => {
  const text = (cell: string[]) => readCorfuHours(cell, PERIOD);

  it('reads Monday to Friday and Saturday as a weekly schedule', () => {
    const { schedule } = text(['ΔΕΥΤΕΡΑ-ΠΑΡΑΣΚΕΥΗ', '8:30-21:00', 'ΣΑΒΒΑΤΟ', '8:30-20:00']);
    expect(schedule).toEqual({
      type: 'weekly',
      days: {
        1: [{ from: '08:30', to: '21:00' }],
        2: [{ from: '08:30', to: '21:00' }],
        3: [{ from: '08:30', to: '21:00' }],
        4: [{ from: '08:30', to: '21:00' }],
        5: [{ from: '08:30', to: '21:00' }],
        6: [{ from: '08:30', to: '20:00' }],
      },
    });
  });

  it('tells a list of weekdays from a range by the weekdays another line gives', () => {
    const { schedule } = text([
      'ΔΕΥΤΕΡΑ-ΤΡΙΤΗ-ΠΕΜΠΤΗ-ΠΑΡΑΣΚΕΥΗ',
      '8:30-14:30 & 17:30-21:00',
      'ΤΕΤΑΡΤΗ-ΣΑΒΒΑΤΟ',
      '8:30-14:30',
    ]);
    if (schedule.type !== 'weekly') throw new Error('weekly');
    expect(Object.keys(schedule.days)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(schedule.days[3]).toEqual([{ from: '08:30', to: '14:30' }]);
    expect(schedule.days[6]).toEqual([{ from: '08:30', to: '14:30' }]);
    expect(schedule.days[5]).toHaveLength(2);
  });

  it('keeps the regular morning of a day that lists only an afternoon', () => {
    const { schedule } = text(['ΔΕΥΤΕΡΑ-ΠΑΡΑΣΚΕΥΗ', '14:00-21:00']);
    if (schedule.type !== 'weekly') throw new Error('weekly');
    // Winter 2026: Monday and Wednesday mornings run to 14:00 and 14:30.
    expect(schedule.days[1]).toEqual([{ from: '08:30', to: '21:00' }]);
    expect(schedule.days[3]).toEqual([{ from: '08:30', to: '21:00' }]);
  });

  it('writes out every day of the period when a date has its own hours, holidays left alone', () => {
    const { schedule } = text([
      'ΔΕΥΤΕΡΑ-ΠΑΡΑΣΚΕΥΗ',
      '8:30-21:00',
      'ΠΕΜΠΤΗ 24/12/26 & ΠΕΜΠΤΗ 31/12/26',
      '8:30-15:30',
    ]);
    if (schedule.type !== 'dates') throw new Error('dates');
    expect(schedule.dates['2026-12-24']).toEqual([{ from: '08:30', to: '15:30' }]);
    expect(schedule.dates['2026-12-31']).toEqual([{ from: '08:30', to: '15:30' }]);
    expect(schedule.dates['2026-11-02']).toEqual([{ from: '08:30', to: '21:00' }]);
    // Christmas Day is a holiday: no hours are written for it. Sunday has none either.
    expect(schedule.dates['2026-12-25']).toBeUndefined();
    expect(schedule.dates['2026-11-01']).toBeUndefined();
  });

  it('reads "ΣΑΒΒΑΤΟ 19 ΔΕΚΕΜΒΡΙΟΥ" as that Saturday', () => {
    const { schedule } = text(['ΣΑΒΒΑΤΟ', '9:30-14:30', 'ΣΑΒΒΑΤΟ 19 ΔΕΚΕΜΒΡΙΟΥ', '9:30-20:00']);
    if (schedule.type !== 'dates') throw new Error('dates');
    expect(schedule.dates['2026-12-19']).toEqual([{ from: '09:30', to: '20:00' }]);
    expect(schedule.dates['2026-12-12']).toEqual([{ from: '09:30', to: '14:30' }]);
  });

  it.each([
    ['hours with a typo', ['ΣΑΒΒΑΤΟ', '8:30-16.:30']],
    ['hours that end before they start', ['ΣΑΒΒΑΤΟ', '14:00-9:00']],
    ['days with no hours', ['ΣΑΒΒΑΤΟ']],
    ['hours with no days', ['8:30-14:00']],
    [
      'a note about closing earlier',
      ['ΔΕΥΤΕΡΑ-ΠΑΡΑΣΚΕΥΗ', '8:30-21:00', '24/12 & 31/12 TO ΦΑΡΜΑΚΕΙΟ ΘΑ'],
    ],
    ['a weekday that is not the date', ['ΠΕΜΠΤΗ 25/12/26', '8:30-15:30']],
    ['a date outside the months', ['ΠΕΜΠΤΗ 07/01/27', '8:30-15:30']],
    ['a range into Saturday that nothing settles', ['ΤΕΤΑΡΤΗ-ΣΑΒΒΑΤΟ', '8:30-14:30']],
  ])('refuses %s, and does not guess', (_, cell) => {
    expect(() => text(cell)).toThrow(UnreadableRowError);
  });
});

describe('matchMember', () => {
  it('matches a company of two licensees to their one pharmacy', () => {
    const member = matchMember(['ΣΥΣΤΕΓΑΣΜΕΝΑ ΦΑΡΜΑΚΕΙΑ', 'Ε.Α.ΑΓΑΘΟΥ & Ι.ΑΓΑΘΟΣ Ο.Ε'], [], roster);
    expect(typeof member === 'string' ? member : member.phone).toBe('2661058290');
  });

  it('knows "ΣΠΥΡΟΣ" for "ΣΠΥΡΙΔΩΝΑΣ", but not a first name alone for a member', () => {
    const ertsos = matchMember(['ΕΡΤΣΟΣ ΣΠΥΡΟΣ'], [], roster);
    expect(typeof ertsos === 'string' ? ertsos : ertsos.phone).toBe('2661031992');
    // Not a member of the association (the members page does not list him): never another Panagiotis.
    expect(matchMember(['ΚΟΥΦΟΠΑΝΤΕΛΗΣ ΠΑΝΑΓΙΩΤΗΣ'], ['ΚΑΝΑΛΙΑ'], roster)).toBe(
      'no member with these names',
    );
  });

  it('refuses a name that several members share, unless the shop in brackets settles it', () => {
    expect(matchMember(['ΠΑΝΔΗ'], [], roster)).toMatch(/members fit/);
    const samara = matchMember(['ΜΠΟΥΖΟΥΚΗΣ ΗΛΙΑΣ'], ['ΣΑΜΑΡΑ 7-9'], roster);
    expect(typeof samara === 'string' ? samara : samara.address).toContain('ΣΑΜΑΡΑ');
  });

  it("refuses a shop the pharmacist has that is not a member's", () => {
    const wrong = matchMember(['ΚΑΤΣΩΡΑ ΑΦΡΟΔΙΤΗ'], ['ΠΕΡΟΥΛΑΔΕΣ'], roster);
    expect(typeof wrong).toBe('string');
    const right = matchMember(['ΚΑΤΣΩΡΑ ΑΦΡΟΔΙΤΗ'], ['ΑΧΑΡΑΒΗ'], roster);
    expect(typeof right === 'string' ? right : right.address).toBe('ΑΧΑΡΑΒΗ');
  });
});

describe('the table of November and December 2026', () => {
  it('has 127 rows, 62 of them giving hours', () => {
    const rows = readCorfuTable(pages);
    expect(rows).toHaveLength(127);
    expect(rows.filter((row) => row.hours.length > 0)).toHaveLength(62);
  });

  it('joins an hours cell that runs onto the next page back to its row', () => {
    const rows = readCorfuTable(pages);
    const agathou = rows.find((row) => row.names.join(' ').includes('ΑΓΑΘΟΥ'));
    expect(agathou?.hours).toContain('ΠΕΜΠΤΗ 24/12/26 & ΠΕΜΠΤΗ 31/12/26');
    expect(agathou?.hours.at(-1)).toBe('8:30-15:30');
  });

  it('reads 54 pharmacies and reports the 8 rows it cannot read for certain', () => {
    const read = readCorfuExtended(readCorfuTable(pages), roster, PERIOD);
    expect(read.withHours).toBe(62);
    expect(read.entries).toHaveLength(54);
    expect(read.failures).toHaveLength(8);
    const phones = read.entries.map((entry) => entry.member.phone);
    expect(new Set(phones).size).toBe(phones.length);
    const ertsos = read.entries.find((entry) => entry.member.phone === '2661031992');
    expect(ertsos?.hours.schedule).toMatchObject({
      type: 'weekly',
      days: { 1: [{ from: '08:30', to: '21:00' }], 6: [{ from: '08:30', to: '20:00' }] },
    });
    const messages = read.failures.map((f) => f.message).join('\n');
    // A typo in the hours, a note about closing early and a shop that is not a member's.
    expect(messages).toContain('8:30-16.:30');
    expect(messages).toContain('ΘΑ ΚΛΕΙΣΕΙ');
    expect(messages).toContain('ΠΕΡΟΥΛΑΔΕΣ');
  });
});

describe('the pipeline, with that table', () => {
  const pipeline = (pageList: () => Promise<PdfPage[]>) =>
    corfuPipeline({
      diavgeia: () => ({
        extendedDecisions: async () => [
          {
            ada: 'ΡΡ6Ζ7ΛΕ-ΤΔΖ',
            subject: 'ΠΙΝΑΚΑΣ ΕΝΤΑΞΗΣ ... ΝΟΕΜΒΡΙΟΣ-ΔΕΚΕΜΒΡΙΟΣ 2026',
            period: PERIOD,
            postedAt: '2026-10-30T10:00:00.000Z',
            url: 'https://diavgeia.gov.gr/decision/view/ΡΡ6Ζ7ΛΕ-ΤΔΖ',
          },
        ],
        document: async () => new Uint8Array(),
        requests: 2,
      }),
      pages: pageList,
    });
  const context = (extendedFiles = new Map()) => ({
    today: '2026-11-02',
    since: '2026-11-02',
    knownSources: new Set<string>(),
    extendedFiles,
    listedLocations: new Map(),
    roster: { sweptAt: '2026-11-02', readThrough: '2026-11-02', entries: roster },
    log: () => undefined,
  });

  it('makes one list for the two months, with the members it matched', async () => {
    const { items, failures } = await pipeline(async () => pages).fetchExtendedHours(context());
    expect(failures).toHaveLength(8);
    expect(items.map(([file]) => file)).toEqual(['2026-11-01_2026-12-31.json']);
    const list = items[0]?.[1];
    expect(list?.entries).toHaveLength(54);
    expect(list?.source.url).toBe('https://diavgeia.gov.gr/decision/view/ΡΡ6Ζ7ΛΕ-ΤΔΖ');
    expect(list?.entries.find((e) => e.name === 'ΕΡΤΣΟΣ ΣΠΥΡΙΔΩΝΑΣ-ΠΑΝΑΓΙΩΤΗΣ')?.area).toBe(
      'Κέρκυρα',
    );
  });

  it('does not read a table again that is already stored', async () => {
    const first = await pipeline(async () => pages).fetchExtendedHours(context());
    const stored = new Map(first.items);
    let read = 0;
    const again = await pipeline(async () => {
      read++;
      return pages;
    }).fetchExtendedHours(context(stored));
    expect(again.items).toEqual([]);
    expect(read).toBe(0);
  });

  it('refuses a table that gives almost nothing, rather than replace the stored one with it', async () => {
    await expect(pipeline(async () => []).fetchExtendedHours(context())).rejects.toThrow(
      /only 0 of 0 rows/,
    );
  });
});
