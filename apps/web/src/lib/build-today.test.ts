import { describe, expect, it } from 'vitest';
import { buildToday } from './build-today.ts';

describe('buildToday', () => {
  const at = new Date('2026-10-05T22:30:00Z'); // 01:30 on the 6th in Athens

  it('is the Athens calendar date by default', () => {
    expect(buildToday(at, {})).toBe('2026-10-06');
    expect(buildToday(at, { PHARMACY_TODAY: '' })).toBe('2026-10-06');
  });

  it('can be fixed with PHARMACY_TODAY, and says so in the build log', () => {
    const warnings: string[] = [];
    const warn = (message: string) => warnings.push(message);
    expect(buildToday(at, { PHARMACY_TODAY: '2026-10-05' }, warn)).toBe('2026-10-05');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('2026-10-05');
  });

  it('does not warn when it is not set', () => {
    const warnings: string[] = [];
    buildToday(at, {}, (message) => warnings.push(message));
    expect(warnings).toEqual([]);
  });

  it('refuses to be set in a production build, so it can never freeze production data', () => {
    const env = { PHARMACY_TODAY: '2026-10-05', VERCEL_ENV: 'production' };
    expect(() => buildToday(at, env, () => {})).toThrow(/production/);
  });

  it('is allowed in a preview build and unset in production', () => {
    expect(buildToday(at, { PHARMACY_TODAY: '2026-10-05', VERCEL_ENV: 'preview' }, () => {})).toBe(
      '2026-10-05',
    );
    expect(buildToday(at, { VERCEL_ENV: 'production' })).toBe('2026-10-06');
  });

  it('rejects something that is not a date', () => {
    expect(() => buildToday(at, { PHARMACY_TODAY: 'today' })).toThrow(/PHARMACY_TODAY/);
    expect(() => buildToday(at, { PHARMACY_TODAY: '2026-13-45' })).toThrow(/PHARMACY_TODAY/);
  });
});
