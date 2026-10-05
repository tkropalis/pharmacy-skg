import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { InvalidHoursError, parseExtendedHours, parseSchedule } from './parse.ts';
import { readFirstSheet } from './xlsx.ts';

const FIXTURE = new URL('../../fixtures/pkm/2026-09_2026-10.xlsx', import.meta.url);

describe('parseSchedule', () => {
  it('reads weekday schedules with split shifts', () => {
    expect(
      parseSchedule('Δευτέρα: 08:00 - 14:30 και 17:00 - 21:00\nΣάββατο: 9:00 - 14:30'),
    ).toEqual({
      type: 'weekly',
      days: {
        1: [
          { from: '08:00', to: '14:30' },
          { from: '17:00', to: '21:00' },
        ],
        6: [{ from: '09:00', to: '14:30' }],
      },
    });
  });

  it('reads date schedules and checks their weekdays', () => {
    expect(parseSchedule('Τρίτη 01/09/2026: 08:00 - 21:00')).toEqual({
      type: 'dates',
      dates: { '2026-09-01': [{ from: '08:00', to: '21:00' }] },
    });
    expect(() => parseSchedule('Δευτέρα 01/09/2026: 08:00 - 21:00')).toThrow(/not 2026-09-01/);
  });

  it('rejects hours that do not end after they start', () => {
    for (const text of [
      'Δευτέρα: 14:00 - 14:00',
      'Δευτέρα: 21:00 - 08:30',
      'Δευτέρα: 00:00 - 00:00',
    ]) {
      expect(() => parseSchedule(text), text).toThrow(InvalidHoursError);
    }
    expect(() => parseSchedule('Δευτέρα: 08:00 - 12:00 και 20:00 - 10:00')).toThrow(
      /20:00 - 10:00/,
    );
  });

  it('accepts a range that ends at midnight, written 00:00 or 24:00', () => {
    expect(parseSchedule('Σάββατο: 18:00 - 24:00')).toEqual({
      type: 'weekly',
      days: { 6: [{ from: '18:00', to: '00:00' }] },
    });
    expect(parseSchedule('Σάββατο: 18:00 - 00:00')).toMatchObject({ type: 'weekly' });
  });

  it('rejects text it cannot read', () => {
    expect(() => parseSchedule('Δευτέρα: κατόπιν συνεννόησης')).toThrow(/cannot read hours/);
    expect(() => parseSchedule('Δευτέρα: 08:00 - 21:00\nΤρίτη 01/09/2026: 08:00 - 21:00')).toThrow(
      /not both/,
    );
  });
});

describe('parseExtendedHours with bad hours', () => {
  const header = ['Περίοδος', 'Φαρμακείο', 'Διεύθυνση', 'Τ.Κ.', 'Δημοτική ενότητα', 'Πρόγραμμα'];
  const row = (name: string, schedule: string) => [
    'Οκτώβριος 2026',
    name,
    'ΟΔΟΣ 1',
    '54622',
    'Θεσσαλονίκη',
    schedule,
  ];

  it('leaves such a row out with a warning and keeps the others', () => {
    const { entries, warnings } = parseExtendedHours([
      header,
      row('ΚΑΛΟ', 'Δευτέρα: 08:00 - 21:00'),
      row('ΣΚΑΡΤΟ', 'Δευτέρα: 14:00 - 14:00\nΤρίτη: 08:00 - 21:00'),
      row('ΑΝΑΠΟΔΟ', 'Τρίτη: 21:00 - 08:30'),
      row('ΚΑΙ ΑΛΛΟ', 'Τρίτη: 09:00 - 17:00'),
    ]);
    expect(entries.map((e) => e.name)).toEqual(['ΚΑΛΟ', 'ΚΑΙ ΑΛΛΟ']);
    expect(warnings.map((w) => w.code)).toEqual(['invalid-hours', 'invalid-hours']);
    expect(warnings[0]?.message).toContain('ΣΚΑΡΤΟ');
    expect(warnings[0]?.message).toContain('14:00 - 14:00');
    expect(warnings[1]?.message).toContain('21:00 - 08:30');
  });

  it('still throws on text it cannot read', () => {
    expect(() => parseExtendedHours([header, row('ΚΑΛΟ', 'Δευτέρα: κατόπιν συνεννόησης')])).toThrow(
      /cannot read hours/,
    );
  });
});

describe('parseExtendedHours on the real ΠΚΜ file for Sep–Oct 2026', () => {
  it('reads every row', async () => {
    const { periodLabel, entries, warnings } = parseExtendedHours(
      readFirstSheet(new Uint8Array(await readFile(FIXTURE))),
    );
    expect(periodLabel).toBe('Σεπτέμβριος - Οκτώβριος 2026');
    expect(entries).toHaveLength(398);
    expect(warnings).toEqual([]);
    expect(entries.filter((entry) => entry.schedule.type === 'dates')).toHaveLength(33);
    expect(entries[0]).toMatchObject({
      name: 'ΣΑΡΔΕΛΗΣ ΧΑΡΑΛΑΜΠΟΣ & ΣΙΑ Ε.Ε',
      address: 'ΦΙΛΙΠΠΟΥ 38',
      postcode: '57019',
      area: 'Περαία',
      schedule: {
        type: 'weekly',
        days: {
          1: [
            { from: '08:00', to: '14:30' },
            { from: '17:00', to: '21:00' },
          ],
          6: [{ from: '09:00', to: '18:00' }],
        },
      },
    });
    // Odd minutes are kept as published.
    const vlasopoulou = entries.find((entry) => entry.name === 'ΒΛΑΣΟΠΟΥΛΟΥ ΜΑΡΙΑ');
    expect(vlasopoulou?.schedule).toMatchObject({ days: { 1: [{ from: '08:00', to: '14:31' }] } });
  });
});
