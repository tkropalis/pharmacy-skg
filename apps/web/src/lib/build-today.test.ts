import { describe, expect, it } from 'vitest';
import { buildToday } from './build-today.ts';

describe('buildToday', () => {
  const at = new Date('2026-10-05T22:30:00Z'); // 01:30 on the 6th in Athens

  it('is the Athens calendar date by default', () => {
    expect(buildToday(at, {})).toBe('2026-10-06');
    expect(buildToday(at, { PHARMACY_TODAY: '' })).toBe('2026-10-06');
  });

  it('can be fixed with PHARMACY_TODAY', () => {
    expect(buildToday(at, { PHARMACY_TODAY: '2026-10-05' })).toBe('2026-10-05');
  });

  it('rejects something that is not a date', () => {
    expect(() => buildToday(at, { PHARMACY_TODAY: 'today' })).toThrow(/PHARMACY_TODAY/);
    expect(() => buildToday(at, { PHARMACY_TODAY: '2026-13-45' })).toThrow(/PHARMACY_TODAY/);
  });
});
