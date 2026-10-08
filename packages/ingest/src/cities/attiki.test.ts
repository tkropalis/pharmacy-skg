import { describe, expect, it } from 'vitest';
import { nextRoster } from './attiki.ts';
import type { Roster, RosterEntry } from './pipeline.ts';

const entry = (phone: string, locality: string, date: string): RosterEntry => ({
  phone,
  name: `ΦΑΡΜΑΚΕΙΟ ${phone}`,
  address: 'ΣΤΑΔΙΟΥ 5',
  locality,
  groupId: 'attiki',
  date,
  location: { lat: 37.98, lon: 23.73 },
});

const stored: Roster = {
  sweptAt: '2026-10-08',
  readThrough: '2027-04-26',
  entries: [entry('2101111111', 'ΑΘΗΝΑ', '2026-11-01')],
};

describe('nextRoster', () => {
  it('keeps the last date read when a later run reads only the next days', () => {
    const named = new Map([['2102222222', entry('2102222222', 'Σύνταγμα', '2026-10-09')]]);
    const read = { today: '2026-10-09', sweep: false, lastRead: '2026-10-15', complete: true };
    const roster = nextRoster(stored, named, read);
    expect(roster?.readThrough).toBe('2027-04-26');
    expect(roster?.sweptAt).toBe('2026-10-08');
    expect(roster?.entries.map((e) => [e.phone, e.locality])).toEqual([
      ['2101111111', 'Αθήνα'],
      ['2102222222', 'Σύνταγμα'],
    ]);
  });

  it('replaces the roster after a full read, and keeps it after a failed one', () => {
    const named = new Map([['2102222222', entry('2102222222', 'Σύνταγμα', '2026-10-15')]]);
    const full = { today: '2026-10-15', sweep: true, lastRead: '2027-05-03', complete: true };
    expect(nextRoster(stored, named, full)).toEqual({
      sweptAt: '2026-10-15',
      readThrough: '2027-05-03',
      entries: [named.get('2102222222')],
    });
    const failed = nextRoster(stored, named, { ...full, complete: false });
    expect(failed?.sweptAt).toBe('2026-10-08');
    expect(failed?.readThrough).toBe('2027-04-26');
    expect(failed?.entries).toHaveLength(2);
  });

  it('has nothing to keep before a first full read', () => {
    const read = { today: '2026-10-08', sweep: true, lastRead: '2027-04-26', complete: false };
    expect(nextRoster(null, new Map(), read)).toBeUndefined();
  });
});
