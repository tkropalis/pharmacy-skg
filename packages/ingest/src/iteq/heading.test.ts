import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { iteqDuties } from './heading.ts';
import { parseIteqPage } from './parse.ts';

const w = (from: string, to: string, toNextDay = to <= from) => ({ from, to, toNextDay });
// 7 Oct 2026 is a Wednesday, 10 Oct a Saturday.
const WEDNESDAY = '2026-10-07';
const SATURDAY = '2026-10-10';

describe('iteqDuties', () => {
  it.each([
    // Larissa
    ['ΑΠΟ 08:00 ΕΩΣ 23:00', WEDNESDAY, [['day', w('08:00', '23:00'), false]]],
    ['ΑΠΟ 08:00 ΕΩΣ 14:00', SATURDAY, [['saturday-extra', w('08:00', '14:00'), false]]],
    ['ΑΠΟ 08:00 ΕΩΣ 14:00', WEDNESDAY, [['day', w('08:00', '14:00'), false]]],
    ['ΔΙΑΝΥΚΤΕΡΕΥΕΙ 23:00 ΕΩΣ 08:00', WEDNESDAY, [['overnight', w('23:00', '08:00'), false]]],
    ['ΕΦΗΜΕΡΕΥΕΙ', WEDNESDAY, [['on-duty', null, false]]],
    // Piraeus: no "ΑΠΟ", two windows, the next day said in words
    ['08:00 ΕΩΣ 20:00', WEDNESDAY, [['day', w('08:00', '20:00'), false]]],
    [
      '08:00 ΕΩΣ 14:00 & 17:00 ΕΩΣ 23:00',
      WEDNESDAY,
      [
        ['day', w('08:00', '14:00'), false],
        ['day', w('17:00', '23:00'), false],
      ],
    ],
    [
      '08:00 ΕΩΣ 14:00 & 17:00 ΕΩΣ 08:00 ΕΠΟΜΕΝΗΣ',
      WEDNESDAY,
      [
        ['day', w('08:00', '14:00'), false],
        ['overnight', w('17:00', '08:00'), false],
      ],
    ],
    ['08:00 ΕΩΣ 08:00 ΕΠΟΜΕΝΗΣ ΗΜΕΡΑΣ', WEDNESDAY, [['on-duty', w('08:00', '08:00'), false]]],
    ['17:00 ΕΩΣ 08:00 ΕΠΟΜΕΝΗΣ', WEDNESDAY, [['overnight', w('17:00', '08:00'), false]]],
    // Chania
    ['ΔΙΑΝΥΚΤΕΡΕΥΕΙ ΑΠΟ 8:30 ΕΩΣ 8:30 ΠΡΩΙ', WEDNESDAY, [['on-duty', w('08:30', '08:30'), false]]],
    ['ΑΠΟ 8:30 ΕΩΣ 22:30 ΕΦΗΜΕΡΕΥΟΝ', WEDNESDAY, [['day', w('08:30', '22:30'), false]]],
    ['08:15 ΕΩΣ 08:15 ΕΠΟΜΕΝΗΣ ΗΜΕΡΑΣ*', WEDNESDAY, [['on-duty', w('08:15', '08:15'), true]]],
    // Evros: dashes
    ['08:00-08:00', WEDNESDAY, [['on-duty', w('08:00', '08:00'), false]]],
    ['08:00-08:00*', WEDNESDAY, [['on-duty', w('08:00', '08:00'), true]]],
    ['14:30-22:00', WEDNESDAY, [['day', w('14:30', '22:00'), false]]],
    // Kozani and Samos: the part of the day in words
    ['8 ΠΡΩΙ - 9 ΒΡΑΔΥ', WEDNESDAY, [['day', w('08:00', '21:00'), false]]],
    [
      '8:30 ΠΡΩΙ - 2:30 ΜΕΣΗΜΕΡΙ & 5:30 ΑΠΟΓΕΥΜΑ - 8 ΠΡΩΙ ΕΠΟΜΕΝΗΣ',
      WEDNESDAY,
      [
        ['day', w('08:30', '14:30'), false],
        ['overnight', w('17:30', '08:00'), false],
      ],
    ],
    [
      '9 ΠΡΩΙ - 1:30 ΜΕΣΗΜΕΡΙ & 6 ΑΠΟΓΕΥΜΑ - 10:30 ΒΡΑΔΥ',
      WEDNESDAY,
      [
        ['day', w('09:00', '13:30'), false],
        ['day', w('18:00', '22:30'), false],
      ],
    ],
    ['9 ΒΡΑΔΥ- 8 ΠΡΩΙ ΕΠΟΜΕΝΗΣ', WEDNESDAY, [['overnight', w('21:00', '08:00'), false]]],
    ['ΕΦΗΜΕΡΕΥΕΙ*', WEDNESDAY, [['on-duty', null, true]]],
    // Lakonia: on call from the evening
    ['20:30 ΕΩΣ 20:30 ΕΠΟΜΕΝΗΣ ΗΜΕΡΑΣ*', WEDNESDAY, [['overnight', w('20:30', '20:30'), true]]],
    // Corinthia: a note in parentheses
    [
      '08:30 ΕΩΣ 22:00 (ΠΡΟΑΙΡΕΤΙΚΗ ΜΕΣΗΜΒΡΙΝΗ ΔΙΑΚΟΠΗ)',
      WEDNESDAY,
      [['day', w('08:30', '22:00'), false]],
    ],
    // Accents and lower case read the same
    ['8 πρωί - 9 βράδυ', WEDNESDAY, [['day', w('08:00', '21:00'), false]]],
  ])('%s on %s', (heading, date, expected) => {
    expect(iteqDuties(heading, date)).toEqual(
      expected.map(([kind, hours, onCall]) => ({ kind, hours, onCall })),
    );
  });

  it('reads no other heading, nor hours printed only in part', () => {
    expect(iteqDuties('ΚΛΕΙΣΤΟ', WEDNESDAY)).toBeNull();
    expect(iteqDuties('ΕΦΗΜΕΡΕΥΕΙ 08:00 ΕΩΣ', WEDNESDAY)).toBeNull();
    // A bare "8" could be any time of day.
    expect(iteqDuties('ΑΠΟ 8 ΕΩΣ 9', WEDNESDAY)).toBeNull();
    expect(iteqDuties('08:00 ΕΩΣ 14:00 & ΑΠΟΓΕΥΜΑ', WEDNESDAY)).toBeNull();
    expect(iteqDuties('25:00 ΕΩΣ 08:00', WEDNESDAY)).toBeNull();
  });

  it('reads every heading of the saved pages', () => {
    const dir = new URL('../../fixtures/iteq/', import.meta.url);
    const pages = readdirSync(dir).filter((name) => !name.includes('details'));
    expect(pages.length).toBeGreaterThanOrEqual(8);
    for (const name of pages) {
      const page = parseIteqPage(readFileSync(new URL(name, dir), 'utf8'));
      for (const card of page.cards) {
        expect(
          iteqDuties(card.heading, page.date ?? WEDNESDAY),
          `${name}: ${card.heading}`,
        ).not.toBeNull();
      }
    }
  });
});
