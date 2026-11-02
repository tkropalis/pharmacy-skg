import { describe, expect, it } from 'vitest';
import { issueBody, STALE_AFTER_HOURS, staleAreas, type AreaMeta } from './freshness.ts';

const now = new Date('2026-11-02T07:00:00.000Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
const area = (name: string, checkedAt: string | undefined): AreaMeta => ({ area: name, checkedAt });

describe('staleAreas', () => {
  it('is empty when every area was checked within 36 hours', () => {
    expect(staleAreas([area('a', hoursAgo(1)), area('b', hoursAgo(36))], now)).toEqual([]);
  });

  it('flags only what is older than the threshold, as the app does', () => {
    const justOver = new Date(now.getTime() - STALE_AFTER_HOURS * 3_600_000 - 1).toISOString();
    expect(staleAreas([area('a', hoursAgo(36)), area('b', justOver)], now)).toEqual([
      { area: 'b', checkedAt: justOver, ageHours: 36 },
    ]);
  });

  it('lists the oldest first, then by name, and rounds the age down', () => {
    const result = staleAreas(
      [
        area('c', hoursAgo(40.5)),
        area('b', hoursAgo(300)),
        area('a', hoursAgo(40.9)),
        area('d', hoursAgo(10)),
      ],
      now,
    );
    expect(result.map((r) => [r.area, r.ageHours])).toEqual([
      ['b', 300],
      ['a', 40],
      ['c', 40],
    ]);
  });

  it('flags a missing or unreadable date, first of all', () => {
    const result = staleAreas(
      [area('old', hoursAgo(100)), area('none', undefined), area('bad', 'yesterday')],
      now,
    );
    expect(result).toEqual([
      { area: 'bad', checkedAt: undefined, ageHours: undefined },
      { area: 'none', checkedAt: undefined, ageHours: undefined },
      { area: 'old', checkedAt: hoursAgo(100), ageHours: 100 },
    ]);
  });

  it('takes the threshold as a parameter', () => {
    expect(staleAreas([area('a', hoursAgo(5))], now, 4)).toHaveLength(1);
    expect(staleAreas([area('a', hoursAgo(5))], now, 6)).toHaveLength(0);
  });
});

describe('issueBody', () => {
  const url = 'https://github.com/o/r/actions/workflows/update-data.yml';
  const stale = staleAreas(
    [area('attiki', '2026-10-22T03:41:00.000Z'), area('larisa', undefined)],
    now,
  );
  const body = issueBody(stale, 33, url);

  it('counts the stale areas out of all of them and names the threshold', () => {
    expect(body).toContain('2 of 33 areas were last checked more than 36 hours ago');
  });

  it('shows each last check in Athens time, summer or winter', () => {
    expect(body).toContain('| `attiki` | 2026-10-22 06:41 |');
    expect(issueBody(staleAreas([area('x', '2026-01-10T10:00:00.000Z')], now), 1, url)).toContain(
      '2026-01-10 12:00',
    );
  });

  it('says so when an area has no date', () => {
    expect(body).toContain('| `larisa` | no valid date in meta.json |');
  });

  it('links the workflow and does not change from day to day', () => {
    expect(body).toContain(`(${url})`);
    const later = new Date(now.getTime() + 86_400_000);
    const list = [area('attiki', '2026-10-22T03:41:00.000Z')];
    expect(issueBody(staleAreas(list, later), 33, url)).toBe(
      issueBody(staleAreas(list, now), 33, url),
    );
  });
});
