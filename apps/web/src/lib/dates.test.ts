import { describe, expect, it } from 'vitest';
import { addDays, dateRange, localIsoDate, offlineDates } from './dates.ts';

describe('localIsoDate', () => {
  it('uses the city time zone, not UTC', () => {
    // 23:04 UTC on 4 Oct is 02:04 on 5 Oct in Athens (UTC+3 in summer time).
    expect(localIsoDate(new Date('2026-10-04T23:04:48.920Z'))).toBe('2026-10-05');
    expect(localIsoDate(new Date('2026-10-04T20:59:59Z'))).toBe('2026-10-04');
    expect(localIsoDate(new Date('2026-10-04T21:00:00Z'))).toBe('2026-10-05');
  });

  it('follows the winter offset too', () => {
    expect(localIsoDate(new Date('2026-12-31T22:00:00Z'))).toBe('2027-01-01');
    expect(localIsoDate(new Date('2026-12-31T21:59:59Z'))).toBe('2026-12-31');
  });
});

describe('addDays', () => {
  it('crosses month, year and leap-day boundaries', () => {
    expect(addDays('2026-10-05', -7)).toBe('2026-09-28');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26'); // the DST change does not matter
  });

  it('rejects garbage', () => {
    expect(() => addDays('nope', 1)).toThrow();
  });
});

describe('dateRange / offlineDates', () => {
  it('lists consecutive dates', () => {
    expect(dateRange('2026-10-30', 3)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
  });

  it('is today plus three days, by the Athens date', () => {
    expect(offlineDates(new Date('2026-10-04T23:30:00Z'))).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
    ]);
  });
});
