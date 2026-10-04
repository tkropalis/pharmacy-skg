import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parseExtendedHours, parseSchedule } from './parse.ts';
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

  it('rejects text it cannot read', () => {
    expect(() => parseSchedule('Δευτέρα: κατόπιν συνεννόησης')).toThrow(/cannot read hours/);
    expect(() => parseSchedule('Δευτέρα: 08:00 - 21:00\nΤρίτη 01/09/2026: 08:00 - 21:00')).toThrow(
      /not both/,
    );
  });
});

describe('parseExtendedHours on the real ΠΚΜ file for Sep–Oct 2026', () => {
  it('reads every row', async () => {
    const { periodLabel, entries } = parseExtendedHours(
      readFirstSheet(new Uint8Array(await readFile(FIXTURE))),
    );
    expect(periodLabel).toBe('Σεπτέμβριος - Οκτώβριος 2026');
    expect(entries).toHaveLength(398);
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
