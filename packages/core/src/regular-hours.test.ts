import { describe, expect, it } from 'vitest';
import { CITIES } from './city.ts';
import { holidaysOn } from './holidays.ts';
import { REGULAR_HOURS, hasRegularHours, regularRanges } from './regular-hours.ts';

describe('REGULAR_HOURS', () => {
  it('belongs to cities the app covers', () => {
    const known = new Set(CITIES.map((city) => city.id));
    for (const id of Object.keys(REGULAR_HOURS)) expect(known.has(id)).toBe(true);
  });

  it("never lets a city's periods overlap or run backwards", () => {
    for (const periods of Object.values(REGULAR_HOURS)) {
      const sorted = [...periods].sort((a, b) => a.from.localeCompare(b.from));
      sorted.forEach((period, i) => {
        if (period.to !== null) expect(period.to >= period.from).toBe(true);
        const next = sorted[i + 1];
        if (next) expect(period.to !== null && period.to < next.from).toBe(true);
      });
    }
  });

  it('keeps every range on a weekday, within 08:00 to 21:00 (the legal frame)', () => {
    for (const periods of Object.values(REGULAR_HOURS)) {
      for (const period of periods) {
        expect(period.days[6]).toEqual([]);
        expect(period.days[7]).toEqual([]);
        for (const ranges of Object.values(period.days)) {
          for (const range of ranges) {
            expect(range.from >= '08:00' && range.from < range.to && range.to <= '21:00').toBe(
              true,
            );
          }
        }
      }
    }
  });
});

describe('Attica', () => {
  it('opens Monday and Wednesday mornings until 14:30', () => {
    expect(regularRanges('attiki', '2026-10-12')).toEqual([{ from: '08:00', to: '14:30' }]);
    expect(regularRanges('attiki', '2026-10-14')).toEqual([{ from: '08:00', to: '14:30' }]);
  });

  it('has summer afternoons until 31 Oct and winter ones from 1 Nov', () => {
    // Thursday 29 Oct and Tuesday 3 Nov 2026.
    expect(regularRanges('attiki', '2026-10-29')).toEqual([
      { from: '08:00', to: '14:00' },
      { from: '17:30', to: '20:30' },
    ]);
    expect(regularRanges('attiki', '2026-11-03')).toEqual([
      { from: '08:00', to: '14:00' },
      { from: '17:00', to: '20:00' },
    ]);
  });

  it('keeps to the hours both seasons share from 1 Apr 2027, the switch being unknown', () => {
    expect(regularRanges('attiki', '2027-04-02')).toEqual([
      { from: '08:00', to: '14:00' },
      { from: '17:30', to: '20:00' },
    ]);
  });

  it('is closed at the weekend', () => {
    expect(regularRanges('attiki', '2026-10-10')).toEqual([]);
    expect(regularRanges('attiki', '2026-10-11')).toEqual([]);
  });

  it('knows its hours only while the decision is in force', () => {
    expect(hasRegularHours('attiki', '2026-05-12')).toBe(false);
    expect(hasRegularHours('attiki', '2026-05-13')).toBe(true);
    expect(hasRegularHours('attiki', '2027-05-12')).toBe(true);
    expect(hasRegularHours('attiki', '2027-05-13')).toBe(false);
  });

  it('closes on 14 Sep in place of the patron saints', () => {
    expect(holidaysOn('attiki', '2026-09-14', 'attiki')).toHaveLength(1);
    expect(holidaysOn('piraeus', '2026-09-14', 'piraeus')).toEqual([]);
  });
});

describe('Karditsa', () => {
  const afternoon = (from: string) => [
    { from: '08:00', to: '14:00' },
    { from, to: '21:00' },
  ];
  const longMorning = [{ from: '08:00', to: '14:30' }];
  const cases: [string, string, { from: string; to: string }[]][] = [
    // Monday 2 Nov 2026 to Sunday 8 Nov, in winter: Mon, Wed and Fri split, Tue and Thu to 14:30.
    ['Monday', '2026-11-02', afternoon('17:00')],
    ['Tuesday', '2026-11-03', longMorning],
    ['Wednesday', '2026-11-04', afternoon('17:00')],
    ['Thursday', '2026-11-05', longMorning],
    ['Friday', '2026-11-06', afternoon('17:00')],
    ['Saturday', '2026-11-07', []],
    ['Sunday', '2026-11-08', []],
    // Summer afternoons until 31 Oct, winter ones from 1 Nov (Saturday 31 Oct is closed; Fri 30).
    ['Friday 30 Oct, summer', '2026-10-30', afternoon('17:30')],
    ['Monday 2 Nov, winter', '2026-11-02', afternoon('17:00')],
    ['Monday in July, summer', '2026-07-06', afternoon('17:30')],
    ['Monday in January, winter', '2027-01-04', afternoon('17:00')],
    // The return to summer is unknown: from 1 Apr 2027 only the hours both seasons share.
    ['Wednesday 31 Mar 2027, winter', '2027-03-31', afternoon('17:00')],
    ['Thursday 1 Apr 2027, shared', '2027-04-01', longMorning],
    ['Friday 2 Apr 2027, shared', '2027-04-02', afternoon('17:30')],
    ['Monday in July 2027, shared', '2027-07-05', afternoon('17:30')],
  ];
  it.each(cases)('%s (%s)', (_name, date, expected) => {
    expect(regularRanges('karditsa', date)).toEqual(expected);
  });

  it('knows its hours from the decision of 29 May 2026, which gives no end', () => {
    expect(hasRegularHours('karditsa', '2026-05-28')).toBe(false);
    expect(hasRegularHours('karditsa', '2026-05-29')).toBe(true);
    expect(hasRegularHours('karditsa', '2030-01-01')).toBe(true);
  });

  it('closes on the national holidays, the decision naming no local one', () => {
    expect(holidaysOn('karditsa', '2026-10-28', 'karditsa').map((h) => h.name.en)).toEqual([
      'Ohi Day',
    ]);
    expect(holidaysOn('karditsa', '2026-10-26', 'karditsa')).toEqual([]);
  });
});

describe('Magnesia', () => {
  const split = [
    { from: '08:00', to: '13:30' },
    { from: '17:00', to: '21:00' },
  ];
  const cases: [string, string, { from: string; to: string }[]][] = [
    // Monday 2 Nov 2026 to Sunday 8 Nov, the Volos regional unit.
    ['Monday: a morning until 14:00 only', '2026-11-02', [{ from: '08:00', to: '14:00' }]],
    ['Tuesday', '2026-11-03', split],
    ['Wednesday: a morning until 13:30 only', '2026-11-04', [{ from: '08:00', to: '13:30' }]],
    ['Thursday', '2026-11-05', split],
    ['Friday', '2026-11-06', split],
    ['Saturday', '2026-11-07', []],
    ['Sunday', '2026-11-08', []],
    // The decision has one schedule for the year, no seasons.
    ['Tuesday in July', '2026-07-07', split],
  ];
  it.each(cases)('%s (%s)', (_name, date, expected) => {
    expect(regularRanges('magnesia', date)).toEqual(expected);
  });

  it('counts the decision for 2026 and 2027, "2026-2027" read literally, and not after', () => {
    expect(hasRegularHours('magnesia', '2025-12-31')).toBe(false);
    expect(hasRegularHours('magnesia', '2026-01-01')).toBe(true);
    expect(hasRegularHours('magnesia', '2027-01-01')).toBe(true);
    expect(hasRegularHours('magnesia', '2027-12-31')).toBe(true);
    expect(hasRegularHours('magnesia', '2028-01-01')).toBe(false);
    expect(regularRanges('magnesia', '2027-01-05')).toEqual([
      { from: '08:00', to: '13:30' },
      { from: '17:00', to: '21:00' },
    ]);
    expect(regularRanges('magnesia', '2028-01-04')).toEqual([]);
  });

  it('keeps every holiday the decision lists, its patron saint having no date', () => {
    // 25 Mar, Good Friday, Easter Monday, 15 Aug, 25 and 26 Dec, 1 Jan, 6 Jan, Clean Monday,
    // 1 May, 28 Oct and Whit Monday of 2026 (Orthodox Easter was on 12 Apr).
    const listed = [
      '2026-03-25',
      '2026-04-10',
      '2026-04-13',
      '2026-08-15',
      '2026-12-25',
      '2026-12-26',
      '2026-01-01',
      '2026-01-06',
      '2026-02-23',
      '2026-05-01',
      '2026-10-28',
      '2026-06-01',
    ];
    for (const date of listed) {
      expect(holidaysOn('magnesia', date, 'magnesia'), date).not.toHaveLength(0);
    }
  });
});

describe('areas whose Region has published nothing in force', () => {
  it.each(['larisa', 'trikala', 'chania', 'herakleion', 'lasithi'])(
    '%s shows only its duties',
    (id) => {
      expect(hasRegularHours(id, '2026-11-02')).toBe(false);
      expect(regularRanges(id, '2026-11-02')).toEqual([]);
    },
  );
});

describe('Corfu', () => {
  it('has the winter hours of the Region from 14 Sep 2026: a long Wednesday morning, afternoons 17:30–20:30', () => {
    // Monday 2 Nov, Wednesday 4 Nov, Saturday 7 Nov 2026.
    expect(regularRanges('corfu', '2026-11-02')).toEqual([
      { from: '08:30', to: '14:00' },
      { from: '17:30', to: '20:30' },
    ]);
    expect(regularRanges('corfu', '2026-11-04')).toEqual([{ from: '08:30', to: '14:30' }]);
    expect(regularRanges('corfu', '2026-11-07')).toEqual([]);
  });

  it('had the summer hours before it, with afternoons 18:00–21:00', () => {
    expect(regularRanges('corfu', '2026-09-11')).toEqual([
      { from: '08:30', to: '14:00' },
      { from: '18:00', to: '21:00' },
    ]);
    expect(hasRegularHours('corfu', '2026-04-29')).toBe(false);
  });

  it('counts the winter hours only until the day before the next summer is expected', () => {
    expect(hasRegularHours('corfu', '2027-04-29')).toBe(true);
    expect(hasRegularHours('corfu', '2027-04-30')).toBe(false);
  });
});

describe('hasRegularHours', () => {
  it('is true for Thessaloniki, whose decision has no end, and false where none is known', () => {
    expect(hasRegularHours('thessaloniki', '2026-10-08')).toBe(true);
    expect(hasRegularHours('thessaloniki', '2030-01-01')).toBe(true);
    expect(hasRegularHours('larisa', '2026-10-08')).toBe(false);
  });
});
