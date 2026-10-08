import { describe, expect, it } from 'vitest';
import type { DutyDay, DutySection } from './data.ts';
import { holidays, holidaysOn, isHoliday, orthodoxEaster } from './holidays.ts';
import type { CityData } from './open.ts';
import { THESSALONIKI } from './city.ts';

describe('orthodoxEaster', () => {
  const cases: [number, string][] = [
    [2024, '2024-05-05'],
    [2025, '2025-04-20'],
    [2026, '2026-04-12'],
    [2027, '2027-05-02'],
    [2028, '2028-04-16'],
    [2000, '2000-04-30'],
    [2010, '2010-04-04'],
    [2099, '2099-04-12'],
  ];
  it.each(cases)('%i is %s', (year, date) => {
    expect(orthodoxEaster(year)).toBe(date);
  });

  it('refuses years outside the valid range of the 13-day offset', () => {
    expect(() => orthodoxEaster(1899)).toThrow(RangeError);
    expect(() => orthodoxEaster(2100)).toThrow(RangeError);
  });
});

describe('holidays', () => {
  const dates = (year: number, cityId = 'thessaloniki') =>
    holidays(year, cityId).map((h) => [h.date, h.name.en]);

  it('lists the 2026 holidays, with the moveable ones tied to Easter on 12 Apr', () => {
    expect(dates(2026)).toEqual([
      ['2026-01-01', "New Year's Day"],
      ['2026-01-06', 'Epiphany'],
      ['2026-02-23', 'Clean Monday'],
      ['2026-03-25', 'Independence Day'],
      ['2026-04-10', 'Good Friday'],
      ['2026-04-12', 'Easter Sunday'],
      ['2026-04-13', 'Easter Monday'],
      ['2026-05-01', 'Labour Day'],
      ['2026-06-01', 'Whit Monday'],
      ['2026-08-15', 'Dormition of the Theotokos'],
      ['2026-10-26', 'Feast of Saint Demetrius'],
      ['2026-10-28', 'Ohi Day'],
      ['2026-12-25', 'Christmas Day'],
      ['2026-12-26', 'Boxing Day'],
    ]);
  });

  it('lists the 2027 holidays, with Easter on 2 May', () => {
    expect(dates(2027)).toEqual([
      ['2027-01-01', "New Year's Day"],
      ['2027-01-06', 'Epiphany'],
      ['2027-03-15', 'Clean Monday'],
      ['2027-03-25', 'Independence Day'],
      ['2027-04-30', 'Good Friday'],
      ['2027-05-01', 'Labour Day'],
      ['2027-05-02', 'Easter Sunday'],
      ['2027-05-03', 'Easter Monday'],
      ['2027-06-21', 'Whit Monday'],
      ['2027-08-15', 'Dormition of the Theotokos'],
      ['2027-10-26', 'Feast of Saint Demetrius'],
      ['2027-10-28', 'Ohi Day'],
      ['2027-12-25', 'Christmas Day'],
      ['2027-12-26', 'Boxing Day'],
    ]);
  });

  it('scopes 26 Oct to the metro group of Thessaloniki only', () => {
    const demetrius = holidays(2026, 'thessaloniki').find((h) => h.date === '2026-10-26');
    expect(demetrius?.scope).toEqual({ groupIds: ['metro'] });
    expect(demetrius?.name.el).toBe('Αγίου Δημητρίου');
    expect(holidays(2026, 'larissa').some((h) => h.date === '2026-10-26')).toBe(false);
    expect(holidays(2026, 'larissa')).toHaveLength(13);
  });

  it('gives Attica 14 Sep in place of the patron saints, and not 26 Oct', () => {
    const cross = holidays(2026, 'attiki').find((h) => h.date === '2026-09-14');
    expect(cross?.scope).toEqual({ groupIds: ['attiki'] });
    expect(holidays(2026, 'attiki').some((h) => h.date === '2026-10-26')).toBe(false);
    expect(holidaysOn('attiki', '2026-09-14', null)).toHaveLength(1);
  });

  it('gives every holiday a Greek and an English name', () => {
    for (const h of holidays(2026, 'thessaloniki')) {
      expect(h.name.el).not.toBe('');
      expect(h.name.en).not.toBe('');
    }
  });
});

describe('holidaysOn', () => {
  it('filters local holidays by group, treating no group as metro', () => {
    expect(holidaysOn('thessaloniki', '2026-10-26', 'metro')).toHaveLength(1);
    expect(holidaysOn('thessaloniki', '2026-10-26', null)).toHaveLength(1);
    expect(holidaysOn('thessaloniki', '2026-10-26', 'lagkadas')).toHaveLength(0);
    expect(holidaysOn('thessaloniki', '2026-10-28', 'lagkadas')).toHaveLength(1);
  });
});

function section(heading: string): DutySection {
  return { kind: 'day', heading, hours: null, extraHours: [], notes: [], entries: [] };
}

function withDuties(days: [string, string, string][]): CityData {
  const duties = new Map<string, DutyDay>();
  for (const [date, groupId, heading] of days) {
    const existing = duties.get(date);
    const group = {
      id: groupId,
      name: groupId,
      source: { url: '', uploadedAt: '' },
      sections: [section(heading)],
    };
    duties.set(date, {
      schemaVersion: 1,
      date,
      groups: [...(existing?.groups ?? []), group],
    });
  }
  return { city: THESSALONIKI, pharmacies: [], duties, extendedHours: [] };
}

describe('isHoliday', () => {
  const weekendHeading = 'Διημερεύοντα Φαρμακεία (Σάββατο, Κυριακή και αργίες από 08:00 έως 21:00)';
  const plainHeading = 'Διημερεύοντα Φαρμακεία (από 08:00 έως 21:00)';
  const data = withDuties([
    ['2026-11-18', 'metro', weekendHeading], // a Wednesday the calendar doesn't know
    ['2026-11-19', 'metro', plainHeading],
    ['2026-11-20', 'thermaikos', weekendHeading], // Friday, but only for Thermaikos
    ['2026-11-21', 'metro', weekendHeading], // Saturday: the heading is printed every weekend
    [
      '2026-11-24',
      'metro',
      'ΔΙΗΜΕΡΕΥΟΝΤΑ ΦΑΡΜΑΚΕΙΑ (ΣΑΒΒΑΤΟ, ΚΥΡΙΑΚΗ ΚΑΙ ΑΡΓΙΕΣ ΑΠΟ 08:00 ΕΩΣ 21:00)',
    ],
    ['2026-11-25', 'metro', 'Διημερεύοντα Φαρμακεία (Αργία 25ης Νοεμβρίου)'],
    ['2026-11-26', 'metro', 'Διημερεύοντα Φαρμακεία (Δευτέρα έως Παρασκευή, εκτός αργιών)'],
  ]);

  const cases: [string, string, string | null, boolean][] = [
    // date, why, group, expected
    ['2026-10-28', 'national fixed date', 'metro', true],
    ['2026-10-28', 'national fixed date, outlying group', 'lagkadas', true],
    ['2026-10-26', 'Αγίου Δημητρίου, metro', 'metro', true],
    ['2026-10-26', 'Αγίου Δημητρίου, unknown group counts as metro', null, true],
    ['2026-10-26', 'Αγίου Δημητρίου does not apply to Lagkadas', 'lagkadas', false],
    ['2026-04-10', 'Good Friday (moveable)', 'metro', true],
    ['2026-04-13', 'Easter Monday (moveable)', 'thermi', true],
    ['2026-08-15', 'a holiday on a Saturday', 'metro', true],
    ['2026-10-05', 'an ordinary Monday', 'metro', false],
    ['2026-11-18', 'a weekday duty list headed "αργίες"', 'metro', true],
    ['2026-11-18', 'the heading belongs to the metro list only', 'thermaikos', false],
    ['2026-11-18', 'the unknown group reads the metro list', null, true],
    ['2026-11-19', 'a weekday list without that heading', 'metro', false],
    ['2026-11-20', 'the heading in Thermaikos’s list', 'thermaikos', true],
    ['2026-11-20', 'the heading in Thermaikos’s list does not reach metro', 'metro', false],
    ['2026-11-21', 'the weekend heading alone makes no holiday', 'metro', false],
    ['2026-11-24', 'upper case, no accents', 'metro', true],
    ['2026-11-25', 'singular "Αργία"', 'metro', true],
    ['2026-11-26', '"εκτός αργιών" in a heading is not a holiday', 'metro', false],
    ['2026-11-17', 'no duty list published', 'metro', false],
    ['2026-11-24', 'upper case without accents', 'metro', true],
    ['2026-11-25', 'singular "Αργία"', 'metro', true],
    ['2026-11-26', '"εκτός αργιών" is not an "αργίες" heading', 'metro', false],
  ];
  it.each(cases)('%s: %s (%s) -> %s', (date, _why, group, expected) => {
    expect(isHoliday(data, date, group)).toBe(expected);
  });
});

describe('holidays that the duty list confirms', () => {
  const weekendHeading = 'Διημερεύοντα Φαρμακεία (Σάββατο, Κυριακή και αργίες από 08:00 έως 21:00)';
  const plainHeading = 'Διημερεύοντα Φαρμακεία (από 08:00 έως 21:00)';

  it('marks only Μεγάλη Παρασκευή and Αγίου Πνεύματος as soft', () => {
    expect(
      holidays(2026, 'thessaloniki')
        .filter((h) => h.confirmedByList)
        .map((h) => h.name.en),
    ).toEqual(['Good Friday', 'Whit Monday']);
  });

  const data = withDuties([
    ['2026-04-10', 'metro', plainHeading], // Good Friday, list without the heading
    ['2026-06-01', 'metro', weekendHeading], // Whit Monday, list with the heading
    ['2027-04-30', 'thermaikos', plainHeading], // Good Friday 2027, but only another group's list
    ['2026-04-13', 'metro', plainHeading], // Easter Monday: not soft
    ['2026-10-28', 'metro', plainHeading], // Ohi Day: not soft
    ['2026-10-26', 'metro', plainHeading], // Αγίου Δημητρίου: not soft
  ]);
  const cases: [string, string, string | null, boolean][] = [
    ['2026-04-10', 'the published list decides: no heading, not a holiday', 'metro', false],
    ['2026-04-10', 'a null group reads the metro list', null, false],
    ['2026-06-01', 'the published list decides: heading, a holiday', 'metro', true],
    ['2027-04-30', 'no list for the group, so the calendar applies', 'metro', true],
    ['2027-04-30', 'the group with a list decides', 'thermaikos', false],
    ['2027-06-21', 'no list at all, so the calendar applies', 'metro', true],
    ['2026-04-13', 'Easter Monday stays a holiday despite the list', 'metro', true],
    ['2026-10-28', 'a fixed national holiday stays one', 'metro', true],
    ['2026-10-26', 'Αγίου Δημητρίου stays one', 'metro', true],
  ];
  it.each(cases)('%s: %s (%s) -> %s', (date, _why, group, expected) => {
    expect(isHoliday(data, date, group)).toBe(expected);
  });
});
