import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { THESSALONIKI, localToInstant } from '@pharmacy-skg/core';
import type { CityData, DutyDay, ExtendedHours, Pharmacies, Pharmacy } from '@pharmacy-skg/core';
import { describe, expect, it } from 'vitest';
import { buildRows } from './list.ts';
import { advanceStatusClock } from './status-clock.ts';

const at = (date: string, time: string) => localToInstant(date, time, 'Europe/Athens');

const pharmacy: Pharmacy = {
  id: 'a',
  name: 'Pharmacy a',
  address: 'Somewhere 1',
  locality: 'Θεσσαλονίκη',
  postcode: null,
  phone: '2310000000',
  groupId: 'metro',
  location: null,
  sources: ['fsth'],
  firstSeen: '2026-06-01',
  lastSeen: '2026-10-01',
};

function cityData(): CityData {
  return { city: THESSALONIKI, pharmacies: [pharmacy], duties: new Map(), extendedHours: [] };
}

describe('advanceStatusClock', () => {
  it('keeps the same clock for every minute until the next change', () => {
    const data = cityData();
    // Monday 10:00: the next change is 14:00, when it starts to close soon.
    const first = advanceStatusClock(null, data, at('2026-10-05', '10:00'));
    expect(first.at).toEqual(at('2026-10-05', '10:00'));
    expect(first.next).toBe(at('2026-10-05', '14:00').getTime());
    let clock = first;
    for (let minutes = 10 * 60 + 1; minutes < 14 * 60; minutes += 1) {
      const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
      clock = advanceStatusClock(clock, data, at('2026-10-05', time));
      expect(clock).toBe(first);
    }
  });

  it('moves on at the change, and when the data or the time before it changes', () => {
    const data = cityData();
    const first = advanceStatusClock(null, data, at('2026-10-05', '10:00'));
    const atChange = advanceStatusClock(first, data, at('2026-10-05', '14:00'));
    expect(atChange).not.toBe(first);
    expect(atChange.at).toEqual(at('2026-10-05', '14:00'));
    // New data: worked out again, even within the same window.
    expect(advanceStatusClock(first, cityData(), at('2026-10-05', '10:01'))).not.toBe(first);
    // A time picked before the clock's own: worked out again.
    expect(advanceStatusClock(first, data, at('2026-10-05', '09:00')).at).toEqual(
      at('2026-10-05', '09:00'),
    );
    // A page that slept for hours.
    expect(advanceStatusClock(first, data, at('2026-10-05', '23:00')).at).toEqual(
      at('2026-10-05', '23:00'),
    );
  });
});

describe('the rows of the real data across a window with no change', () => {
  const DATA_DIR = resolve(import.meta.dirname, '../../../../data/thessaloniki');
  const readJson = <T>(path: string): T =>
    JSON.parse(readFileSync(resolve(DATA_DIR, path), 'utf8')) as T;
  const duties = new Map<string, DutyDay>();
  for (const file of readdirSync(resolve(DATA_DIR, 'duties')).filter((f) => f.endsWith('.json'))) {
    const day = readJson<DutyDay>(`duties/${file}`);
    duties.set(day.date, day);
  }
  const data: CityData = {
    city: THESSALONIKI,
    pharmacies: readJson<Pharmacies>('pharmacies.json').pharmacies,
    duties,
    extendedHours: readdirSync(resolve(DATA_DIR, 'extended-hours'))
      .filter((f) => f.endsWith('.json'))
      .map((f) => readJson<ExtendedHours>(`extended-hours/${f}`)),
  };

  it.each([
    ['2026-10-05', '10:00'],
    ['2026-10-05', '22:30'],
    ['2026-10-06', '03:00'],
    ['2026-10-06', '15:10'],
  ])('%s %s: the list is the same until the clock says it can change', (date, time) => {
    const from = at(date, time);
    const clock = advanceStatusClock(null, data, from);
    const last = new Date(clock.next - 1);
    const strip = (when: Date) =>
      buildRows(data, when, null, true).rows.map((row) => ({
        id: row.pharmacy.id,
        kind: row.kind,
        status: row.status,
        dutiesPublished: row.dutiesPublished,
      }));
    expect(strip(last)).toEqual(strip(from));
  });
});
