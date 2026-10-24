import { describe, expect, it } from 'vitest';
import { isPublishedDutyDate } from './data.ts';

describe('isPublishedDutyDate', () => {
  const range = { from: '2026-10-01', to: '2026-10-29' };

  it('counts every date in the range when meta.json lists no dates', () => {
    expect(isPublishedDutyDate(range, '2026-10-15')).toBe(true);
    expect(isPublishedDutyDate(range, '2026-10-30')).toBe(false);
  });

  it('counts only the listed dates when there are any', () => {
    const gappy = { ...range, dates: ['2026-10-08', '2026-10-24'] };
    expect(isPublishedDutyDate(gappy, '2026-10-24')).toBe(true);
    expect(isPublishedDutyDate(gappy, '2026-10-15')).toBe(false);
  });

  it('counts nothing without duties', () => {
    expect(isPublishedDutyDate(null, '2026-10-24')).toBe(false);
  });
});
