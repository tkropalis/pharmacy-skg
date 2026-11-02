import { CITIES, LARISA, THESSALONIKI } from '@pharmacy-skg/core';
import type { Meta } from '@pharmacy-skg/core';
import { describe, expect, it } from 'vitest';
import { dutyRangeText, formatChecked, statusRows } from './data-status.ts';

const meta = (overrides: Partial<Meta>): Meta => ({
  schemaVersion: 1,
  city: 'thessaloniki',
  updatedAt: '2026-11-01T11:19:30.227Z',
  checkedAt: '2026-11-01T20:32:45.398Z',
  duties: { from: '2026-10-07', to: '2026-11-07' },
  extendedHours: [],
  sources: [],
  ...overrides,
});

describe('formatChecked', () => {
  it('is the day and the time in the city, whatever the device', () => {
    // 20:32 UTC is 22:32 in Athens in winter time (UTC+2).
    expect(formatChecked('2026-11-01T20:32:45Z', 'el')).toBe('1 Νοε 22:32');
    expect(formatChecked('2026-11-01T20:32:45Z', 'en')).toBe('1 Nov 22:32');
    // Past midnight there, still the evening before in UTC.
    expect(formatChecked('2026-11-01T22:30:00Z', 'en')).toBe('2 Nov 00:30');
  });

  it('gives an unreadable time back as it is', () => {
    expect(formatChecked('soon', 'en')).toBe('soon');
  });
});

describe('dutyRangeText', () => {
  it('joins the dates with an unspaced en dash', () => {
    expect(dutyRangeText('2026-10-07', '2026-11-07', 'el')).toBe('7 Οκτ–7 Νοε');
    expect(dutyRangeText('2026-10-07', '2026-11-07', 'en')).toBe('7 Oct–7 Nov');
  });

  it('adds the years only when the range crosses one', () => {
    expect(dutyRangeText('2026-12-20', '2027-01-03', 'en')).toBe('20 Dec 2026–3 Jan 2027');
  });
});

describe('statusRows', () => {
  const entries = [
    { city: THESSALONIKI, meta: meta({}) },
    { city: LARISA, meta: meta({ city: 'larisa', checkedAt: '2026-10-28T08:00:00Z' }) },
    { city: CITIES[2] ?? THESSALONIKI, meta: meta({ checkedAt: undefined, duties: null }) },
  ];
  const now = new Date('2026-11-02T08:00:00Z');

  it('names each area in the language, with when it was checked and its duty days', () => {
    const rows = statusRows(entries, 'en', now);
    expect(rows[0]).toMatchObject({
      name: 'Thessaloniki',
      checkedText: '1 Nov 22:32',
      dutyText: '7 Oct–7 Nov',
    });
    expect(statusRows(entries, 'el', now)[1]?.name).toBe('Λάρισα');
  });

  it('is fresh within 36 hours of the check, and old after', () => {
    expect(statusRows(entries, 'en', now).map((row) => row.fresh)).toEqual([true, false, true]);
    expect(statusRows(entries, 'en', new Date('2026-11-04T00:00:00Z'))[0]?.fresh).toBe(false);
  });

  it('falls back to the last change when no check was recorded, and has no duty days to show', () => {
    const row = statusRows(entries, 'en', now)[2];
    expect(row?.checkedAt).toBe('2026-11-01T11:19:30.227Z');
    expect(row?.dutyText).toBeNull();
  });
});
