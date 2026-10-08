import { describe, expect, it } from 'vitest';
import {
  UnreadableHoursError,
  VOCABULARY,
  parseFsaHours,
  printedWord,
  scheduleText,
  withMornings,
} from './hours.ts';

const SEPTEMBER = { year: 2026, month: 9 };
const OCTOBER = { year: 2026, month: 10 };
const r = (from: string, to: string) => ({ from, to });

describe('printedWord', () => {
  it('reads a word in each of the PDF’s printings', () => {
    expect(printedWord('ΔΕΥΤΕΡΑ', 'ΔΕΥΤΕΡΑ')).toBe(true);
    expect(printedWord('ΓΔΤΣΔΡΑ', 'ΔΕΥΤΕΡΑ')).toBe(true); // every letter from Δ on shifted
    expect(printedWord('ΔΕΤΣΕΡΑ', 'ΔΕΥΤΕΡΑ')).toBe(true); // only from Σ on
    expect(printedWord('ΔΕΣΗΕΡΑ', 'ΔΕΥΤΕΡΑ')).toBe(true); // "δεσηερα", lower case
    expect(printedWord('ΠΑΡΑ΢ΚΔΤΖ', 'ΠΑΡΑΣΚΕΥΗ')).toBe(true);
    expect(printedWord('ΓΔΤΣΔΡΑ', 'ΤΕΤΑΡΤΗ')).toBe(false);
  });

  it('never reads one printed word as two different words', () => {
    for (const [a, wordA] of VOCABULARY) {
      for (const [b, wordB] of VOCABULARY) {
        if (a.length !== b.length || JSON.stringify(wordA) === JSON.stringify(wordB)) continue;
        // Some printing both could have: every letter of one can be printed as the other's.
        const clash = [...a].every((letter, i) => {
          const other = [...b][i] ?? '';
          return [...'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡ΢ΣΤΥΦΧΨΩ'].some(
            (glyph) => printedWord(glyph, letter) && printedWord(glyph, other),
          );
        });
        expect(clash, `${a} / ${b}`).toBe(false);
      }
    }
  });
});

describe('parseFsaHours', () => {
  it('reads weekday ranges, with every way of writing a time', () => {
    expect(parseFsaHours('ΓΔΤΣ-ΠΑΡ 8.00-21.00 ΢ΑΒΒΑΣΟ 8.00-16.00', SEPTEMBER)).toEqual({
      type: 'weekly',
      days: {
        1: [r('08:00', '21:00')],
        2: [r('08:00', '21:00')],
        3: [r('08:00', '21:00')],
        4: [r('08:00', '21:00')],
        5: [r('08:00', '21:00')],
        6: [r('08:00', '16:00')],
      },
    });
    expect(parseFsaHours('ΓΔΤΣΔΡΑ-ΠΑΡΑ΢ΚΔΤΖ 8πμ-9μμ ΢ΑΒΒΑΣΟ 9πμ-4μμ', SEPTEMBER)).toMatchObject({
      days: { 1: [r('08:00', '21:00')], 6: [r('09:00', '16:00')] },
    });
    expect(parseFsaHours('ΔΕΥΤΕΡΑ 8 ΠΡΩΙ - 2 ΜΕΣΗΜΕΡΙ', SEPTEMBER)).toMatchObject({
      days: { 1: [r('08:00', '14:00')] },
    });
    expect(
      parseFsaHours('ΓΔΤΣΔΡΑ ΠΑΡΑ΢ΚΔΤΖ 08 00 - 21 00 ΢ΑΒΒΑΣΟ 08 00-20 00', SEPTEMBER),
    ).toMatchObject({
      days: { 1: [r('08:00', '21:00')], 5: [r('08:00', '21:00')], 6: [r('08:00', '20:00')] },
    });
  });

  it('reads "until" in words, split ranges and ranges joined by a slash', () => {
    expect(
      parseFsaHours(
        'ΓΔΤΣΔΡΑ ΔΧ΢ ΚΑΗ ΠΑΡΑ΢ΚΔΤΖ 9.00-15.00/18.00-21.00 ΚΑΗ ΢ΑΒΒΑΣΟ 09.00 ΔΧ΢ 20.00',
        SEPTEMBER,
      ),
    ).toMatchObject({
      days: { 3: [r('09:00', '15:00'), r('18:00', '21:00')], 6: [r('09:00', '20:00')] },
    });
  });

  it('lists days joined by dashes, and a dash over named days is a list', () => {
    const list = parseFsaHours('ΓΔΤΣ-ΣΔΣ 8.00-16.00 & ΣΡΗΣΖ-ΠΔΜΠ-ΠΑΡ 8.00-20.30', SEPTEMBER);
    expect(list).toEqual({
      type: 'weekly',
      days: {
        1: [r('08:00', '16:00')],
        3: [r('08:00', '16:00')],
        2: [r('08:00', '20:30')],
        4: [r('08:00', '20:30')],
        5: [r('08:00', '20:30')],
      },
    });
  });

  it('reads dates, spreads the weekdays over the month and skips its holidays', () => {
    const schedule = parseFsaHours(
      'ΓΔΤ-ΠΑΡ 8:00-21:00 ΚΑΗ ΢ΑΒΒΑΣΟ 3/10, 17/10 ΑΠΟ 09.00 ΔΧ΢ 14.00',
      OCTOBER,
      new Set(['2026-10-28']),
    );
    expect(schedule.type).toBe('dates');
    if (schedule.type !== 'dates') return;
    expect(schedule.dates['2026-10-03']).toEqual([r('09:00', '14:00')]);
    expect(schedule.dates['2026-10-05']).toEqual([r('08:00', '21:00')]);
    expect(schedule.dates['2026-10-10']).toBeUndefined(); // a Saturday not named
    expect(schedule.dates['2026-10-28']).toBeUndefined(); // a holiday
    expect(Object.keys(schedule.dates)).toHaveLength(22 - 1 + 2);
  });

  it('reads a date closed', () => {
    const schedule = parseFsaHours('΢ΑΒ 9:00-20:00, ΢ΑΒ 12/09 ΚΛΔΗ΢ΣΑ', SEPTEMBER);
    expect(schedule.type === 'dates' && schedule.dates).toMatchObject({
      '2026-09-05': [r('09:00', '20:00')],
      '2026-09-12': [],
    });
  });

  it.each([
    ['an afternoon on a twelve-hour clock', 'ΓΔΤ/ΣΔΣ/8-2,30 5-8,30'],
    ['under two hours', 'ΓΔΤΣΔΡΑ-ΠΑΡΑ΢ΚΔΤΖ 8-9'],
    ['words it does not know', 'ΟΜΟΗΧ΢ ΜΔ ΣΟΝ ΗΟΤΛΗΟ'],
    ['a date in another month', '΢ΑΒΒΑΣΟ 12/10/2026 9.00-14.00'],
    ['a date on another weekday', '΢ΑΒΒΑΣΟ 14/09 9.00-14.00'],
    ['a year that is wrong', '΢ΑΒΒΑΣΟ 12/09/2016 9.00-14.00'],
    ['hours before any day', '17,30-20,30'],
    ['the same day twice, overlapping', 'ΓΔΤ. ΔΧ΢ ΠΑΡ. 8-21,΢ΑΒ 8-20,ΣΔΣ8-15'],
    ['Sunday', 'ΚΤΡΗΑΚΖ 9-14'],
    ['a dash that could be a range or a list', 'ΓΔΤΣ-΢ΑΒ 08:00-14:00, ΣΡΗΣΖ 17:00-21:00'],
  ])('refuses %s', (_why, text) => {
    expect(() => parseFsaHours(text, SEPTEMBER)).toThrow(UnreadableHoursError);
  });
});

describe('scheduleText', () => {
  it('writes the hours out as ΠΚΜ does', () => {
    expect(
      scheduleText({
        type: 'weekly',
        days: { 6: [r('09:00', '14:00')], 1: [r('08:00', '14:00'), r('17:00', '21:00')] },
      }),
    ).toBe('Δευτέρα: 08:00 - 14:00 και 17:00 - 21:00\nΣάββατο: 09:00 - 14:00');
    expect(scheduleText({ type: 'dates', dates: { '2026-09-12': [r('09:00', '14:00')] } })).toBe(
      'Σάββατο 12/09/2026: 09:00 - 14:00',
    );
  });
});

describe('withMornings', () => {
  const morning = (weekday: number) =>
    weekday === 1 || weekday === 3
      ? [r('08:00', '14:30')]
      : weekday <= 5
        ? [r('08:00', '14:00')]
        : [];

  it('keeps the regular morning of a weekday listed with only its afternoon', () => {
    const listed = parseFsaHours('ΓΔΤΣΔΡΑ,ΣΡΗΣΖ 14,30-20,30 ΢ΑΒ 17:00-20:00 ΠΑΡ 8-21', SEPTEMBER);
    expect(withMornings(listed, morning)).toEqual({
      type: 'weekly',
      days: {
        1: [r('08:00', '20:30')],
        2: [r('08:00', '14:00'), r('14:30', '20:30')],
        5: [r('08:00', '21:00')],
        6: [r('17:00', '20:00')],
      },
    });
  });

  it('leaves a dated holiday as listed', () => {
    const listed = { type: 'dates' as const, dates: { '2026-10-28': [r('17:00', '21:00')] } };
    expect(withMornings(listed, morning, new Set(['2026-10-28']))).toEqual(listed);
  });
});
