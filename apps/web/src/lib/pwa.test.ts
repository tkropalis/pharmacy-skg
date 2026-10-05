import { describe, expect, it } from 'vitest';
import { shouldWarmAgain } from './pwa.ts';

describe('shouldWarmAgain', () => {
  const at = (iso: string) => Date.parse(iso);

  it('warms the first time', () => {
    expect(shouldWarmAgain(null, at('2026-10-05T09:00:00Z'))).toBe(true);
  });

  it('waits an hour', () => {
    const last = at('2026-10-05T09:00:00Z');
    expect(shouldWarmAgain(last, at('2026-10-05T09:59:00Z'))).toBe(false);
    expect(shouldWarmAgain(last, at('2026-10-05T10:00:00Z'))).toBe(true);
  });

  it('warms again on a new day in Athens, not on the device', () => {
    // 20:50 and 21:10 UTC are 23:50 and 00:10 in Athens (UTC+3): a new day there.
    expect(shouldWarmAgain(at('2026-10-05T20:50:00Z'), at('2026-10-05T21:10:00Z'))).toBe(true);
    // 20:10 and 20:40 UTC: still the 5th in Athens.
    expect(shouldWarmAgain(at('2026-10-05T20:10:00Z'), at('2026-10-05T20:40:00Z'))).toBe(false);
  });
});
