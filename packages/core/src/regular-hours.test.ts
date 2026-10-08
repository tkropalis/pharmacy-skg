import { describe, expect, it } from 'vitest';
import { holidaysOn } from './holidays.ts';
import { REGULAR_HOURS, hasRegularHours, regularRanges } from './regular-hours.ts';

describe('REGULAR_HOURS', () => {
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

describe('hasRegularHours', () => {
  it('is true for Thessaloniki, whose decision has no end, and false where none is known', () => {
    expect(hasRegularHours('thessaloniki', '2026-10-08')).toBe(true);
    expect(hasRegularHours('thessaloniki', '2030-01-01')).toBe(true);
    expect(hasRegularHours('larisa', '2026-10-08')).toBe(false);
  });
});
