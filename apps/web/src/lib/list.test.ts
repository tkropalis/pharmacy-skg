import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { THESSALONIKI } from '@pharmacy-skg/core';
import type { CityData, DutyDay, ExtendedHours, Pharmacies } from '@pharmacy-skg/core';
import { describe, expect, it } from 'vitest';
import { distanceMetres, coverageAt } from './engine.ts';
import { buildRows, pinKindOf, rowFor } from './list.ts';
import { pinCollection } from './map-data.ts';

const DATA_DIR = resolve(import.meta.dirname, '../../../../data/thessaloniki');
const readJson = <T>(path: string): T => JSON.parse(readFileSync(resolve(DATA_DIR, path), 'utf8')) as T;

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
    const distances = rows.map((r) => r.distance);
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
    const byName = buildRows(data, night, null, false).rows.map((r) => r.pharmacy.name);
    expect(byName).toEqual([...byName].sort(new Intl.Collator('el').compare));
    expect(buildRows(data, night, null, false).rows.every((r) => r.distance === null)).toBe(true);
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
    expect(rows.some((r) => r.kind === 'regular')).toBe(true);
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
  it('lets duty win over extended and regular', () => {
    const base = { state: 'open', until: new Date(), closingSoon: false } as const;
    expect(pinKindOf({ ...base, reasons: [{ kind: 'regular' }] })).toBe('regular');
    expect(pinKindOf({ ...base, reasons: [{ kind: 'extended' }] })).toBe('extended');
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
    const { rows } = buildRows(data, night, null, true);
    const collection = pinCollection(rows);
    const located = rows.filter((r) => r.pharmacy.location !== null);
    expect(collection.features).toHaveLength(located.length);
    expect(collection.features.length).toBeLessThan(rows.length);
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

describe('coverageAt', () => {
  it('reports published duty lists and extended hours', () => {
    expect(coverageAt(data, night)).toEqual({ duties: true, extendedHours: true });
    expect(coverageAt(data, new Date('2026-12-01T10:00:00Z')).duties).toBe(false);
    expect(coverageAt(data, new Date('2026-12-01T10:00:00Z')).extendedHours).toBe(false);
  });
  it('needs yesterday’s list before 08:00', () => {
    const lastDay = [...data.duties.keys()].sort().at(-1) ?? '';
    const nextMorning = new Date(`${lastDay}T00:00:00Z`);
    nextMorning.setUTCDate(nextMorning.getUTCDate() + 1);
    nextMorning.setUTCHours(1); // 04:00 Athens on the day after the last list: no list for it
    expect(coverageAt(data, nextMorning).duties).toBe(false);
  });
});
