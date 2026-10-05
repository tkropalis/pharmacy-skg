import { describe, expect, it } from 'vitest';
import { isSectionHeading, parseExtraHours, parseHeading } from './heading.ts';

describe('parseHeading', () => {
  it.each([
    [
      'Διημερεύοντα Φαρμακεία (Σάββατο, Κυριακή και αργίες από 08:00 έως 21:00)',
      'day',
      { from: '08:00', to: '21:00', toNextDay: false },
    ],
    [
      'Επιπλέον Φαρμακεία Σαββάτου (από 08:30 έως 14:30)',
      'saturday-extra',
      { from: '08:30', to: '14:30', toNextDay: false },
    ],
    [
      'Διανυκτερεύοντα Φαρμακεία (από 21:00 έως 00:00)',
      'overnight',
      { from: '21:00', to: '00:00', toNextDay: true },
    ],
    [
      'Μεταμεσονύκτια Φαρμακεία (από 21:00 έως 08:00 το επόμενο πρωί)',
      'after-midnight',
      { from: '21:00', to: '08:00', toNextDay: true },
    ],
    [
      'Εφημερεύοντα Φαρμακεία (από 08:00 έως 24:00)',
      'on-duty',
      { from: '08:00', to: '00:00', toNextDay: true },
    ],
    [
      'Εφημερεύοντα Φαρμακεία (Από 08:00 έως 00:00)',
      'on-duty',
      { from: '08:00', to: '00:00', toNextDay: true },
    ],
    [
      'Εφημερεύοντα Φαρμακεία από 08:00 έως 23:00',
      'on-duty',
      { from: '08:00', to: '23:00', toNextDay: false },
    ],
    ['Διανυκτερεύοντα Φαρμακεία', 'overnight', null],
  ])('%s', (heading, kind, hours) => {
    expect(parseHeading(heading)).toEqual({ kind, hours });
  });

  it('rejects headings it does not know', () => {
    expect(() => parseHeading('Κλειστά Φαρμακεία')).toThrow(/Unknown section heading/);
  });
});

describe('isSectionHeading', () => {
  it('does not mistake the title line or a note for a heading… unless it names a kind', () => {
    expect(isSectionHeading('Διανυκτερεύοντα Φαρμακεία (από 21:00 έως 00:00)')).toBe(true);
    expect(isSectionHeading('λειτουργούν και 14:00-17:00 (όχι τα Μεταμεσονύκτια)')).toBe(false);
  });
});

describe('parseExtraHours', () => {
  it('reads the Tue/Thu/Fri midday note', () => {
    expect(
      parseExtraHours(
        'Τρίτη, Πέμπτη & Παρασκευή (εκτός αργιών), λειτουργούν και 14:00-17:00 (όχι τα Μεταμεσονύκτια)',
      ),
    ).toEqual({ weekdays: [2, 4, 5], from: '14:00', to: '17:00', exceptHolidays: true });
  });

  it('returns null for other notes', () => {
    expect(parseExtraHours('Κάτι άλλο')).toBeNull();
  });
});
