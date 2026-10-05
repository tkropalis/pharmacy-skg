import { describe, expect, it } from 'vitest';
import { addDays, isoWeekday, localToInstant, zonedDate, zonedParts } from './zoned.ts';

const ATHENS = 'Europe/Athens';

describe('zonedDate and zonedParts', () => {
  const cases: [string, string, string, number, number][] = [
    // instant, zone, local date, minutes since midnight, ISO weekday
    ['2026-10-05T11:30:00Z', ATHENS, '2026-10-05', 14 * 60 + 30, 1], // summer time, UTC+3
    ['2026-12-01T06:00:00Z', ATHENS, '2026-12-01', 8 * 60, 2], // winter time, UTC+2
    ['2026-10-05T21:00:00Z', ATHENS, '2026-10-06', 0, 2], // local midnight
    ['2026-10-05T20:59:59Z', ATHENS, '2026-10-05', 23 * 60 + 59, 1], // one second before
    ['2026-12-31T22:30:00Z', ATHENS, '2027-01-01', 30, 5], // new year in local time only
    ['2026-10-04T21:30:00Z', ATHENS, '2026-10-05', 30, 1], // Sunday UTC evening is Monday locally
    ['2026-10-05T01:00:00Z', 'America/New_York', '2026-10-04', 21 * 60, 7], // another zone
  ];
  it.each(cases)('%s in %s', (iso, zone, date, minutes, weekday) => {
    const at = new Date(iso);
    expect(zonedDate(at, zone)).toBe(date);
    expect(zonedParts(at, zone)).toEqual({ date, minutes, weekday });
  });
});

describe('localToInstant', () => {
  const cases: [string, string, string, string][] = [
    // date, time, expected instant, note
    ['2026-10-05', '14:30', '2026-10-05T11:30:00.000Z', 'summer time (UTC+3)'],
    ['2026-12-01', '08:00', '2026-12-01T06:00:00.000Z', 'winter time (UTC+2)'],
    ['2026-10-05', '00:00', '2026-10-04T21:00:00.000Z', 'local midnight is the previous UTC day'],
    ['2026-10-05', '23:59', '2026-10-05T20:59:00.000Z', 'last minute of the day'],

    // Spring forward on 2027-03-28: 03:00 EET (UTC+2) becomes 04:00 EEST (UTC+3) at 01:00Z.
    ['2027-03-28', '02:59', '2027-03-28T00:59:00.000Z', 'before the gap'],
    ['2027-03-28', '03:00', '2027-03-28T01:00:00.000Z', 'gap start: first instant after the gap'],
    ['2027-03-28', '03:30', '2027-03-28T01:00:00.000Z', 'inside the gap: first instant after it'],
    ['2027-03-28', '03:59', '2027-03-28T01:00:00.000Z', 'last minute of the gap'],
    ['2027-03-28', '04:00', '2027-03-28T01:00:00.000Z', 'first minute after the gap'],
    ['2027-03-28', '04:30', '2027-03-28T01:30:00.000Z', 'after the gap'],

    // Fall back on 2026-10-25: 04:00 EEST (UTC+3) becomes 03:00 EET (UTC+2) at 01:00Z.
    ['2026-10-25', '02:59', '2026-10-24T23:59:00.000Z', 'before the overlap'],
    ['2026-10-25', '03:00', '2026-10-25T00:00:00.000Z', 'overlap start: the earlier instant'],
    ['2026-10-25', '03:30', '2026-10-25T00:30:00.000Z', 'ambiguous: the earlier instant'],
    ['2026-10-25', '03:59', '2026-10-25T00:59:00.000Z', 'ambiguous: the earlier instant'],
    ['2026-10-25', '04:00', '2026-10-25T02:00:00.000Z', 'after the overlap (UTC+2)'],
    ['2026-10-25', '08:00', '2026-10-25T06:00:00.000Z', 'morning after the change'],
  ];
  it.each(cases)('%s %s -> %s (%s)', (date, time, expected) => {
    expect(localToInstant(date, time, ATHENS).toISOString()).toBe(expected);
  });

  it('round-trips every minute of a day, except the skipped hour', () => {
    const roundTrip = (date: string) => {
      const mismatches: [number, number][] = [];
      for (let minute = 0; minute < 24 * 60; minute += 1) {
        const hh = String(Math.floor(minute / 60)).padStart(2, '0');
        const mm = String(minute % 60).padStart(2, '0');
        const parts = zonedParts(localToInstant(date, `${hh}:${mm}`, ATHENS), ATHENS);
        if (parts.date !== date || parts.minutes !== minute)
          mismatches.push([minute, parts.minutes]);
      }
      return mismatches;
    };
    expect(roundTrip('2026-07-01')).toEqual([]);
    expect(roundTrip('2026-10-25')).toEqual([]); // the repeated hour resolves to its first pass
    const skipped = roundTrip('2027-03-28');
    expect(skipped).toHaveLength(60);
    expect(skipped.every(([from, to]) => from >= 180 && from < 240 && to === 240)).toBe(true);
  });

  it('measures the overnight 21:00-08:00 shift across the clock changes', () => {
    const hours = (date: string, nextDate: string) => {
      const start = localToInstant(date, '21:00', ATHENS);
      const end = localToInstant(nextDate, '08:00', ATHENS);
      return [
        start.toISOString(),
        end.toISOString(),
        (end.getTime() - start.getTime()) / 3_600_000,
      ];
    };
    // An ordinary night: 11 hours.
    expect(hours('2026-10-05', '2026-10-06')).toEqual([
      '2026-10-05T18:00:00.000Z',
      '2026-10-06T05:00:00.000Z',
      11,
    ]);
    // Fall back: 11 wall-clock hours plus the repeated hour is 12 real hours.
    expect(hours('2026-10-24', '2026-10-25')).toEqual([
      '2026-10-24T18:00:00.000Z',
      '2026-10-25T06:00:00.000Z',
      12,
    ]);
    // Spring forward: 11 wall-clock hours minus the skipped hour is 10 real hours.
    expect(hours('2027-03-27', '2027-03-28')).toEqual([
      '2027-03-27T19:00:00.000Z',
      '2027-03-28T05:00:00.000Z',
      10,
    ]);
  });

  it('rejects malformed input', () => {
    expect(() => localToInstant('2026-02-30', '10:00', ATHENS)).toThrow(RangeError);
    expect(() => localToInstant('2026-10-05', '24:00', ATHENS)).toThrow(RangeError);
    expect(() => localToInstant('2026-10-05', '9:00', ATHENS)).toThrow(RangeError);
    expect(() => localToInstant('2026-10-05', '10:60', ATHENS)).toThrow(RangeError);
  });
});

describe('addDays', () => {
  const cases: [string, number, string][] = [
    ['2026-10-05', 1, '2026-10-06'],
    ['2026-10-31', 1, '2026-11-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2027-01-01', -1, '2026-12-31'],
    ['2028-02-28', 1, '2028-02-29'], // leap year
    ['2027-02-28', 1, '2027-03-01'],
    ['2026-10-05', 0, '2026-10-05'],
    ['2026-10-05', 30, '2026-11-04'],
    ['2026-10-25', 1, '2026-10-26'], // across a DST change
  ];
  it.each(cases)('%s + %i = %s', (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });
});

describe('isoWeekday', () => {
  const cases: [string, number][] = [
    ['2026-10-05', 1],
    ['2026-10-06', 2],
    ['2026-10-07', 3],
    ['2026-10-08', 4],
    ['2026-10-09', 5],
    ['2026-10-10', 6],
    ['2026-10-11', 7],
  ];
  it.each(cases)('%s is weekday %i', (date, weekday) => {
    expect(isoWeekday(date)).toBe(weekday);
  });
});
