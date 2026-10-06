import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { THESSALONIKI } from '@pharmacy-skg/core';
import type { CityData, DutyDay, ExtendedHours, Pharmacies } from '@pharmacy-skg/core';
import { describe, expect, it } from 'vitest';
import { distanceMetres, coverage } from './engine.ts';
import {
  applyListFilter,
  buildRows,
  isDutyKind,
  nextToOpen,
  pinKindOf,
  rankClosingSoonLast,
  rowFor,
} from './list.ts';
import { pinCollection } from './map-data.ts';

const DATA_DIR = resolve(import.meta.dirname, '../../../../data/thessaloniki');
const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(resolve(DATA_DIR, path), 'utf8')) as T;

function load(): CityData {
  const duties = new Map<string, DutyDay>();
  for (const file of readdirSync(resolve(DATA_DIR, 'duties')).filter((f) => f.endsWith('.json'))) {
    const day = readJson<DutyDay>(`duties/${file}`);
    duties.set(day.date, day);
  }
  return {
    city: THESSALONIKI,
    pharmacies: readJson<Pharmacies>('pharmacies.json').pharmacies,
    duties,
    extendedHours: readdirSync(resolve(DATA_DIR, 'extended-hours'))
      .filter((f) => f.endsWith('.json'))
      .map((f) => readJson<ExtendedHours>(`extended-hours/${f}`)),
  };
}

const data = load();
const aristotelous = { lat: 40.6326, lon: 22.9409 };
// Monday night, 22:30 in Athens (UTC+3): only duty pharmacies are open.
const night = new Date('2026-10-05T19:30:00Z');

describe('buildRows (real data, Monday 22:30)', () => {
  const { rows, openCount } = buildRows(data, night, aristotelous, false);

  it('lists only duty pharmacies at night', () => {
    expect(rows.length).toBeGreaterThan(5);
    expect(openCount).toBe(rows.length);
    expect(rows.every((r) => r.kind === 'duty' || r.kind === 'duty-unknown')).toBe(true);
    expect(rows.every((r) => r.status.state !== 'closed')).toBe(true);
  });

  it('is sorted by distance from the origin, unlocated pharmacies last', () => {
    // Those about to close come last (see below); the order is checked among the others.
    const distances = rows
      .filter((r) => !(r.status.state === 'open' && r.status.closingSoon))
      .map((r) => r.distance);
    const located = distances.filter((d): d is number => d !== null);
    expect(located).toEqual([...located].sort((a, b) => a - b));
    expect(distances.lastIndexOf(null)).toBeGreaterThanOrEqual(distances.indexOf(null));
    const first = rows[0];
    expect(first?.pharmacy.location).not.toBeNull();
    if (first?.pharmacy.location) {
      expect(first.distance).toBeCloseTo(distanceMetres(aristotelous, first.pharmacy.location), 3);
    }
  });

  it('sorts by name without an origin', () => {
    const byName = buildRows(data, night, null, false)
      .rows.filter((r) => !(r.status.state === 'open' && r.status.closingSoon))
      .map((r) => r.pharmacy.name);
    expect(byName).toEqual([...byName].sort(new Intl.Collator('el').compare));
    expect(buildRows(data, night, null, false).rows.every((r) => r.distance === null)).toBe(true);
  });
});

describe('pharmacies about to close', () => {
  // Monday 22:40 in Athens: some evening duties end at 23:00.
  const late = new Date('2026-10-05T19:40:00Z');
  const soon = (row: { status: { state: string; closingSoon?: boolean } }) =>
    row.status.state === 'open' && row.status.closingSoon === true;

  it('come after the ones that stay open, each group nearest first', () => {
    const { rows } = buildRows(data, late, aristotelous, false);
    const firstSoon = rows.findIndex(soon);
    expect(firstSoon).toBeGreaterThan(0);
    expect(rows.slice(firstSoon).every(soon)).toBe(true);
    for (const group of [rows.slice(0, firstSoon), rows.slice(firstSoon)]) {
      const located = group.map((r) => r.distance).filter((d): d is number => d !== null);
      expect(located).toEqual([...located].sort((a, b) => a - b));
    }
  });

  it('keep the order of each group', () => {
    const row = (id: string, closingSoon: boolean) =>
      ({ id, status: { state: 'open', closingSoon } }) as unknown as Parameters<
        typeof rankClosingSoonLast
      >[0][number];
    const ranked = rankClosingSoonLast([
      row('a', true),
      row('b', false),
      row('c', true),
      row('d', false),
    ]);
    expect(ranked.map((r) => (r as unknown as { id: string }).id)).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('buildRows with closed pharmacies', () => {
  it('appends every other pharmacy after the open ones', () => {
    const { rows, openCount } = buildRows(data, night, aristotelous, true);
    expect(rows).toHaveLength(data.pharmacies.length);
    expect(new Set(rows.map((r) => r.pharmacy.id)).size).toBe(rows.length);
    expect(rows.slice(0, openCount).every((r) => r.kind !== 'closed')).toBe(true);
    expect(rows.slice(openCount).every((r) => r.kind === 'closed')).toBe(true);
  });

  it('shows regular-hours pharmacies during the day', () => {
    const noon = new Date('2026-10-05T09:00:00Z'); // Monday 12:00
    const { rows } = buildRows(data, noon, null, false);
    expect(rows.some((r) => r.kind === 'open')).toBe(true);
  });
});

describe('rowFor', () => {
  it('returns a row for a known id and null for a stale one', () => {
    const id = data.pharmacies[0]?.id ?? '';
    expect(rowFor(data, id, night, null)?.pharmacy.id).toBe(id);
    expect(rowFor(data, 'no-such-id', night, null)).toBeNull();
  });
});

describe('pinKindOf', () => {
  it('lets duty win over extended and regular, which share one look', () => {
    const base = { state: 'open', until: new Date(), closingSoon: false, runReasons: [] } as const;
    expect(pinKindOf({ ...base, reasons: [{ kind: 'regular' }] })).toBe('open');
    expect(pinKindOf({ ...base, reasons: [{ kind: 'extended' }] })).toBe('open');
    expect(
      pinKindOf({
        ...base,
        reasons: [
          { kind: 'extended' },
          { kind: 'duty-extra', duty: 'day', date: '2026-10-05', groupId: 'metro' },
        ],
      }),
    ).toBe('duty');
  });
});

describe('pinCollection', () => {
  it('leaves out pharmacies without a location and marks approximate ones', () => {
    const built = buildRows(data, night, null, true).rows;
    // The real data may have every pharmacy located (it has since 6 Oct 2026), so one without a
    // location is added here.
    const [first] = built;
    if (first === undefined) throw new Error('no rows');
    const rows = [
      ...built,
      { ...first, pharmacy: { ...first.pharmacy, id: 'x-unlocated', location: null } },
    ];
    const collection = pinCollection(rows);
    const located = rows.filter((r) => r.pharmacy.location !== null);
    expect(collection.features).toHaveLength(located.length);
    expect(collection.features.length).toBe(rows.length - 1);
    const approx = collection.features.filter((f) => f.properties.approximate);
    expect(approx.length).toBe(
      located.filter((r) => r.pharmacy.location?.precision === 'locality').length,
    );
    expect(approx.every((f) => f.properties.image.endsWith('-approx'))).toBe(true);
    const [lon, lat] = collection.features[0]?.geometry.coordinates ?? [0, 0];
    expect(lat).toBeGreaterThan(40);
    expect(lon).toBeGreaterThan(22);
  });
});

describe('coverage', () => {
  it('reports published duty lists and extended hours', () => {
    expect(coverage(data, night)).toMatchObject({ duties: true, extendedHours: true });
    expect(coverage(data, new Date('2026-12-01T10:00:00Z')).duties).toBe(false);
    expect(coverage(data, new Date('2026-12-01T10:00:00Z')).extendedHours).toBe(false);
  });
  it('uses yesterday’s list before 08:00 and today’s afterwards', () => {
    const lastDay = [...data.duties.keys()].sort().at(-1) ?? '';
    const next = (hourUtc: number) => {
      const at = new Date(`${lastDay}T00:00:00Z`);
      at.setUTCDate(at.getUTCDate() + 1);
      at.setUTCHours(hourUtc);
      return at;
    };
    expect(coverage(data, next(1)).duties).toBe(true); // 04:00 Athens: the last list still rules
    expect(coverage(data, next(8)).duties).toBe(false); // 11:00 Athens: no list for the new day
  });
});

describe('applyListFilter (real data)', () => {
  // Monday 08:01 in Athens: every pharmacy is open by its regular hours.
  const morning = new Date('2026-10-05T05:01:00Z');

  it('shows only the duty pharmacies when asked, by day', () => {
    const all = buildRows(data, morning, null, false);
    const everything = applyListFilter(all, 'all');
    expect(everything.chips).toBe(true);
    expect(everything.rows).toBe(all.rows);
    expect(everything.active).toBe('all');
    expect(everything.dutyCount).toBeGreaterThan(0);
    expect(everything.dutyCount).toBeLessThan(everything.openCount);

    const duty = applyListFilter(all, 'duty');
    expect(duty.active).toBe('duty');
    expect(duty.rows.length).toBe(duty.dutyCount);
    expect(duty.openCount).toBe(duty.dutyCount);
    expect(duty.rows.every((row) => isDutyKind(row.kind))).toBe(true);
  });

  it('leaves out the closed pharmacies under the duty filter', () => {
    const withClosed = buildRows(data, morning, null, true);
    const duty = applyListFilter(withClosed, 'duty');
    expect(duty.rows.every((row) => row.kind !== 'closed')).toBe(true);
  });

  it('hides the chips and ignores the filter when only duty pharmacies are open (night)', () => {
    const result = buildRows(data, night, null, false);
    const filtered = applyListFilter(result, 'duty');
    expect(filtered.chips).toBe(false);
    expect(filtered.active).toBe('all');
    expect(filtered.rows).toBe(result.rows);
  });
});

describe('nextToOpen (real data)', () => {
  // Monday 03:00 in Athens: regular hours open at 08:00.
  const early = new Date('2026-10-05T00:00:00Z');
  const rows = nextToOpen(data, early, aristotelous, 5);

  it('lists closed pharmacies that open later, soonest first, then nearest', () => {
    expect(rows).toHaveLength(5);
    const opens = rows.map((row) => (row.status.state === 'closed' ? row.status.nextOpen : null));
    expect(opens.every((date) => date !== null && date > early)).toBe(true);
    const times = opens.map((date) => date?.getTime() ?? 0);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    for (let i = 1; i < rows.length; i++) {
      const [a, b] = [rows[i - 1], rows[i]];
      if (a && b && times[i - 1] === times[i] && a.distance !== null && b.distance !== null) {
        expect(a.distance).toBeLessThanOrEqual(b.distance);
      }
    }
  });

  it('never lists a pharmacy that is open', () => {
    expect(rows.every((row) => row.kind === 'closed')).toBe(true);
  });
});
