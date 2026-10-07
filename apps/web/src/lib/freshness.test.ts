import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { checkedAt, formatUpdatedAt, isStale } from './freshness.ts';

const updatedAt = '2026-10-04T23:04:48.920Z';
const hours = (h: number) => new Date(Date.parse(updatedAt) + h * 3_600_000);

describe('isStale', () => {
  it('is false up to 36 hours and true after', () => {
    expect(isStale(updatedAt, hours(0))).toBe(false);
    expect(isStale(updatedAt, hours(36))).toBe(false);
    expect(isStale(updatedAt, new Date(hours(36).getTime() + 1))).toBe(true);
    expect(isStale(updatedAt, hours(100))).toBe(true);
  });

  it('warns when the timestamp is missing or unreadable', () => {
    expect(isStale(null, hours(0))).toBe(true);
    expect(isStale(undefined, hours(0))).toBe(true);
    expect(isStale('yesterday', hours(0))).toBe(true);
  });

  it('is not stale for a timestamp slightly in the future (clock skew)', () => {
    expect(isStale(updatedAt, hours(-2))).toBe(false);
  });
});

describe('checkedAt', () => {
  it('is the last check, which runs even when nothing changed', () => {
    expect(checkedAt({ updatedAt, checkedAt: '2026-10-07T10:58:49.000Z' })).toBe(
      '2026-10-07T10:58:49.000Z',
    );
  });

  it('falls back to the last change in a meta file written before checks were recorded', () => {
    expect(checkedAt({ updatedAt })).toBe(updatedAt);
  });
});

describe('formatUpdatedAt', () => {
  it('formats in the Athens time zone whatever the device uses', () => {
    expect(formatUpdatedAt(updatedAt, 'en')).toBe('5 Oct 2026, 02:04');
    expect(formatUpdatedAt(updatedAt, 'el')).toMatch(/^5 Οκτ 2026,? 02:04$/);
  });

  it('shows an unreadable value as it is rather than "Invalid Date"', () => {
    expect(formatUpdatedAt('garbage', 'en')).toBe('garbage');
  });
});

describe('public/stale-check.js', () => {
  const script = readFileSync(new URL('../../public/stale-check.js', import.meta.url), 'utf8');

  /** Runs the blocking head script against a fake document and clock. */
  function runs(content: string | null, now: Date): boolean {
    let flagged = false;
    const fakeDate = Object.assign(
      function FakeDate() {
        return now;
      },
      { now: () => now.getTime(), parse: Date.parse },
    );
    runInNewContext(script, {
      Date: fakeDate,
      isNaN,
      localStorage: { getItem: () => content },
      document: {
        documentElement: {
          setAttribute: (name: string) => {
            if (name === 'data-stale') flagged = true;
          },
        },
      },
    });
    return flagged;
  }

  it('flags exactly the cases isStale flags', () => {
    const cases: [string, Date][] = [
      [updatedAt, hours(1)],
      [updatedAt, hours(36)],
      [updatedAt, new Date(hours(36).getTime() + 1000)],
      [updatedAt, hours(200)],
      [updatedAt, hours(-3)],
      ['garbage', hours(1)],
      ['', hours(1)],
    ];
    for (const [content, now] of cases) {
      expect(runs(content, now), `${content} at ${now.toISOString()}`).toBe(isStale(content, now));
    }
  });

  it('waits for the runtime check when nothing is remembered yet (a first visit)', () => {
    expect(runs(null, hours(500))).toBe(false);
  });
});
