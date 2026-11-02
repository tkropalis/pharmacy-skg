import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { TextItem } from '../pdf.ts';
import { required } from '../required.ts';
import { dutyWindows, EXEMPTIONS, ILIA_TOWNS, iliaDutyLists, iliaRoster } from './duties.ts';
import { parseDutyTable, type Table } from './table.ts';

function table(name: string): Table {
  const rows = JSON.parse(
    readFileSync(new URL(`../../fixtures/ilia/duty-table_${name}.json`, import.meta.url), 'utf8'),
  ) as [number, number, number, number, number, string][];
  const items: TextItem[] = rows.map(([page, x, y, width, height, text]) => ({
    page,
    x,
    y,
    width,
    height,
    text,
  }));
  return parseDutyTable(items);
}

describe('dutyWindows', () => {
  it('reads each window, and the night column decides night duty', () => {
    expect(dutyWindows('08:00-17:00', false, '2026-01-01')).toEqual([
      { hours: { from: '08:00', to: '17:00', toNextDay: false }, kind: 'day', onCall: false },
    ]);
    expect(dutyWindows('08:00-14:30 & 17:30-08:00', true, '2026-01-02')).toEqual([
      { hours: { from: '08:00', to: '14:30', toNextDay: false }, kind: 'day', onCall: false },
      { hours: { from: '17:30', to: '08:00', toNextDay: true }, kind: 'overnight', onCall: false },
    ]);
  });

  it("reads a Saturday morning's window as the Saturday rota's, as the ITeQ lists do", () => {
    // 3 Jan 2026 is a Saturday: the night pharmacy's morning window, and a day pharmacy to 14:00.
    expect(
      dutyWindows('08:00-14:30 & 18:00-08:00', true, '2026-01-03')?.map((w) => w.kind),
    ).toEqual(['saturday-extra', 'overnight']);
    expect(dutyWindows('08:00-14:00', false, '2026-03-14')?.[0]?.kind).toBe('saturday-extra');
    // Later than 15:00, or on another day, it is a day duty.
    expect(dutyWindows('08:00-17:30', false, '2026-01-03')?.[0]?.kind).toBe('day');
    expect(dutyWindows('08:00-14:00', false, '2026-03-13')?.[0]?.kind).toBe('day');
  });

  it('reads a window from morning to morning as round the clock, and "*" as on call', () => {
    expect(dutyWindows('08:00-08:00*', true, '2026-01-26')).toEqual([
      { hours: { from: '08:00', to: '08:00', toNextDay: true }, kind: 'on-duty', onCall: true },
    ]);
  });

  it('gives a row without hours (Varda) one overnight duty with no hours stated', () => {
    expect(dutyWindows(null, true, '2026-01-01')).toEqual([]);
  });

  it('refuses a row that contradicts its night column', () => {
    expect(dutyWindows('08:00-17:00', true, '2026-01-01')).toBeNull();
    expect(dutyWindows('17:00-08:00', false, '2026-01-01')).toBeNull();
    expect(dutyWindows('8-5', false, '2026-01-01')).toBeNull();
    expect(dutyWindows(null, false, '2026-01-01')).toBeNull();
  });
});

describe('iliaDutyLists', () => {
  it("makes a town's day a group with a section for each window", () => {
    const { lists, warnings, exempted } = iliaDutyLists(
      table('p007-008'),
      new Set(['2026-01-01', '2026-01-02']),
    );
    expect(warnings).toEqual([]);
    expect(exempted).toEqual([]);
    expect(lists.map((l) => [l.date, l.groupId, l.groupName])).toEqual([
      ['2026-01-01', 'amaliada', 'Αμαλιάδα'],
      ['2026-01-02', 'amaliada', 'Αμαλιάδα'],
    ]);

    const first = lists[0];
    expect(first?.sections.map((s) => [s.kind, s.hours?.from, s.hours?.to, s.heading])).toEqual([
      ['day', '08:00', '17:00', '08:00-17:00'],
      ['overnight', '17:00', '08:00', '17:00-08:00'],
    ]);
    expect(first?.sections[0]?.entries).toEqual([
      {
        locality: 'Αμαλιάδα',
        name: 'ΓΙΑΝΝΑΚΟΠΟΥΛΟΣ ΠΕΤΡΟΣ',
        address: 'ΚΑΛΑΒΡΥΤΩΝ 19',
        phone: '2622022244',
      },
    ]);

    // 2 Jan: the night pharmacy's two windows are two sections under one heading, and the other
    // pharmacy is open the whole day.
    const second = lists[1];
    expect(
      second?.sections.map((s) => [s.kind, s.hours?.from, s.hours?.to, s.entries[0]?.phone]),
    ).toEqual([
      ['day', '08:00', '14:30', '2622021543'],
      ['day', '08:00', '21:00', '2622027979'],
      ['overnight', '17:30', '08:00', '2622021543'],
    ]);
  });

  it('keeps the small towns as one on-call section, and Varda as an overnight one', () => {
    const olympia = iliaDutyLists(table('p057-060'), new Set(['2026-01-26'])).lists;
    expect(olympia).toHaveLength(1);
    expect(olympia[0]?.sections).toEqual([
      expect.objectContaining({
        kind: 'on-duty',
        hours: { from: '08:00', to: '08:00', toNextDay: true },
        onCall: true,
      }),
    ]);

    const varda = iliaDutyLists(table('p073'), new Set(['2026-01-01'])).lists;
    expect(varda[0]).toMatchObject({ groupId: 'varda', groupName: 'Βάρδα' });
    expect(varda[0]?.sections).toEqual([
      {
        kind: 'overnight',
        heading: 'ΔΙΑΝΥΚΤΕΡΕΥΣΗ',
        hours: null,
        extraHours: [],
        notes: [],
        entries: [{ locality: 'Βάρδα', name: 'ΛΕΥΚΑΔΙΤΗ Σ. ΓΕΩΡΓΙΑ', address: '', phone: '' }],
      },
    ]);
  });

  it("leaves a pharmacist's duty off while a decision excuses her, and says so", () => {
    const liosi = EXEMPTIONS.find((e) => e.phone === '2622029394');
    expect(liosi).toMatchObject({ ada: '9ΤΝΗ7Λ6-710', from: '2026-02-06', to: '2026-12-31' });
    const base = table('p007-008');
    const row = (date: string) => ({
      town: 'ΑΜΑΛΙΑΔΑ',
      date,
      hours: '08:00-17:30',
      overnight: false,
      phone: '2622029394',
      name: null,
      page: 1,
    });
    const liosiTable: Table = {
      ...base,
      rows: [row('2026-01-31'), row('2026-02-06'), row('2026-11-07'), row('2027-01-01')],
      pharmacies: [
        {
          phone: '2622029394',
          town: 'ΑΜΑΛΙΑΔΑ',
          name: 'ΛΙΩΣΗ ΑΛΙΚΗ',
          address: 'ΚΟΛΟΚΟΤΡΩΝΗ 10',
        },
      ],
    };
    const dates = new Set(['2026-01-31', '2026-02-06', '2026-11-07', '2027-01-01']);
    const { lists, exempted } = iliaDutyLists(liosiTable, dates);
    // Before the decision's first day and after its last she serves; in between she does not.
    expect(lists.map((l) => l.date)).toEqual(['2026-01-31', '2027-01-01']);
    expect(exempted).toEqual([liosi]);
  });

  it('reports a row it cannot use, and a town it does not know', () => {
    const base = table('p007-008');
    const [first, second] = [required(base.rows[0], 'row'), required(base.rows[1], 'row')];
    const odd: Table = {
      ...base,
      rows: [
        { ...first, hours: '08:00-17:00', overnight: true },
        { ...second, town: 'ΠΑΤΡΑ' },
      ],
    };
    const { lists, warnings } = iliaDutyLists(odd, new Set([first.date]));
    expect(lists).toEqual([]);
    expect(warnings.map((w) => w.code).sort()).toEqual(['unknown-town', 'unusable-row']);
  });
});

describe('iliaRoster', () => {
  it('names every pharmacy once, with the first day it is on duty', () => {
    const roster = iliaRoster(table('p057-060'));
    expect(roster).toEqual([
      {
        groupId: 'ancient-olympia',
        date: '2026-01-05',
        locality: 'Αρχαία Ολυμπία',
        name: 'ΠΑΠΑΒΑΣΙΛΕΙΟΥ ΔΗΜΗΤΡΙΟΣ',
        address: 'ΚΟΝΔΥΛΗ ΠΡΑΞΙΤΕΛΗ 60',
        phone: '2624022000',
        location: null,
      },
      {
        groupId: 'ancient-olympia',
        date: '2026-01-01',
        locality: 'Αρχαία Ολυμπία',
        name: 'Σ.Φ. ΜΙΤΕΒΑ ΙΒΑΝΚΑ ΚΑΙ ΠΟΛΙΤΗΣ ΓΙΑΝΝΗΣ Ο.Ε.',
        address: 'ΤΣΟΥΡΕΚΑ 2',
        phone: '2624023306',
        location: null,
      },
    ]);
  });

  it("has a pharmacy with no phone by its name, Varda's six", () => {
    const roster = iliaRoster(table('p073'));
    expect(roster).toHaveLength(6);
    expect(roster.every((entry) => entry.phone === '' && entry.groupId === 'varda')).toBe(true);
  });
});

describe('ILIA_TOWNS', () => {
  it('has the eleven towns of the table, each with its own id', () => {
    expect(ILIA_TOWNS).toHaveLength(11);
    expect(new Set(ILIA_TOWNS.map((town) => town.id)).size).toBe(11);
  });
});
