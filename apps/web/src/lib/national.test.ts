import { LARISA, THESSALONIKI, localToInstant } from '@pharmacy-skg/core';
import type { DutyDay, DutySection, Meta, Pharmacy } from '@pharmacy-skg/core';
import { describe, expect, it } from 'vitest';
import {
  buildNationalDutyDay,
  buildNationalIndex,
  isNationalDutyDate,
  loadNationalDutyDay,
  loadNationalIndex,
  nationalDutyDateOf,
  nationalDutyPath,
  onDutyAt,
} from './national.ts';

const ATHENS = 'Europe/Athens';

function pharmacy(id: string, location: Pharmacy['location']): Pharmacy {
  return {
    id,
    name: `Pharmacy ${id}`,
    address: '',
    locality: '',
    postcode: null,
    phone: null,
    groupId: null,
    location,
    sources: [],
    firstSeen: '2026-06-01',
    lastSeen: '2026-10-01',
  };
}

const exact = (lat: number, lon: number): Pharmacy['location'] => ({
  lat,
  lon,
  source: 'override',
  precision: 'exact',
});

function section(
  hours: DutySection['hours'],
  ids: string[],
  extra: Partial<DutySection> = {},
): DutySection {
  return {
    kind: 'on-duty',
    heading: '',
    hours,
    extraHours: [],
    notes: [],
    entries: ids.map((pharmacyId) => ({
      pharmacyId,
      name: pharmacyId,
      address: '',
      locality: '',
      phone: '',
    })),
    ...extra,
  };
}

function day(date: string, sections: DutySection[]): DutyDay {
  return {
    schemaVersion: 1,
    date,
    groups: [
      {
        id: 'g',
        name: 'g',
        source: { url: 'https://example.invalid', uploadedAt: '2026-10-01T00:00:00Z' },
        sections,
      },
    ],
  };
}

describe('buildNationalIndex', () => {
  const meta = (extra: Partial<Meta>): Meta => ({
    schemaVersion: 1,
    city: 'x',
    updatedAt: '2026-10-05T10:00:00.000Z',
    duties: null,
    extendedHours: [],
    sources: [],
    ...extra,
  });

  it("lists each area's bounds, size, freshness and published dates", () => {
    const index = buildNationalIndex([
      {
        city: THESSALONIKI,
        pharmacies: 700,
        meta: meta({
          checkedAt: '2026-10-05T10:05:00.000Z',
          duties: { from: '2026-10-01', to: '2026-10-08', dates: ['2026-10-08', '2026-10-01'] },
        }),
      },
      { city: LARISA, pharmacies: 3, meta: meta({}) },
    ]);
    expect(index.schemaVersion).toBe(1);
    expect(index.cities.map((c) => c.id)).toEqual(['thessaloniki', 'larisa']);
    expect(index.cities[0]).toEqual({
      id: 'thessaloniki',
      bounds: THESSALONIKI.bounds,
      center: THESSALONIKI.center,
      pharmacies: 700,
      updatedAt: '2026-10-05T10:00:00.000Z',
      checkedAt: '2026-10-05T10:05:00.000Z',
      duties: { from: '2026-10-01', to: '2026-10-08' },
      dutyDates: ['2026-10-01', '2026-10-08'],
    });
    expect(index.cities[1]).toMatchObject({ checkedAt: null, duties: null, dutyDates: [] });
  });
});

describe('the dates of the national duty files', () => {
  it('has a path for each date, and reads a date back from it', () => {
    expect(nationalDutyPath('2026-10-05')).toBe('duty/2026-10-05.json');
    expect(nationalDutyDateOf('duty/2026-10-05.json')).toBe('2026-10-05');
    expect(nationalDutyDateOf('duty/../meta.json')).toBeNull();
    expect(nationalDutyDateOf('thessaloniki/duties/2026-10-05.json')).toBeNull();
  });

  it('runs from yesterday to two weeks ahead', () => {
    expect(isNationalDutyDate('2026-10-04', '2026-10-05')).toBe(true);
    expect(isNationalDutyDate('2026-10-03', '2026-10-05')).toBe(false);
    expect(isNationalDutyDate('2026-10-19', '2026-10-05')).toBe(true);
    expect(isNationalDutyDate('2026-10-20', '2026-10-05')).toBe(false);
  });
});

describe('buildNationalDutyDay', () => {
  const pharmacies = [
    pharmacy('day', exact(40.6312345678, 22.94)),
    pharmacy('both', exact(40.64, 22.95)),
    pharmacy('rough', { lat: 40.65, lon: 22.96, source: 'nominatim', precision: 'locality' }),
    pharmacy('nowhere', null),
    pharmacy('quiet', exact(40.7, 22.9)),
  ];
  const date = '2026-10-05';
  const list = day(date, [
    section({ from: '08:00', to: '21:00', toNextDay: false }, ['day', 'both', 'nowhere']),
    section({ from: '21:00', to: '08:00', toNextDay: true }, ['both']),
    section({ from: '21:00', to: '08:00', toNextDay: true }, ['both']),
    section(null, ['rough']),
    section({ from: '12:00', to: '12:00', toNextDay: true }, ['rough'], { onCall: true }),
  ]);
  const built = buildNationalDutyDay(date, [
    { cityId: 'thessaloniki', pharmacies, day: list },
    { cityId: 'larisa', pharmacies, day: undefined },
  ]);

  it('is for the date, with the areas that have a list', () => {
    expect(built.schemaVersion).toBe(1);
    expect(built.date).toBe(date);
    expect(Object.keys(built.cities)).toEqual(['thessaloniki']);
  });

  it('puts a pharmacy once, with each of its windows, and rounds where it is', () => {
    const entries = built.cities['thessaloniki'] ?? [];
    expect(entries.map((e) => e.id)).toEqual(['day', 'both', 'rough']);
    expect(entries[0]).toEqual({
      id: 'day',
      lat: 40.63123,
      lon: 22.94,
      windows: [['08:00', '21:00', false, false]],
    });
    expect(entries[1]?.windows).toEqual([
      ['08:00', '21:00', false, false],
      ['21:00', '08:00', true, false],
    ]);
  });

  it('leaves out a pharmacy with no location and one that is not on the list', () => {
    const ids = (built.cities['thessaloniki'] ?? []).map((e) => e.id);
    expect(ids).not.toContain('nowhere');
    expect(ids).not.toContain('quiet');
  });

  it('marks a locality-level place, a list with no hours, and on call', () => {
    const rough = built.cities['thessaloniki']?.find((e) => e.id === 'rough');
    expect(rough).toEqual({
      id: 'rough',
      lat: 40.65,
      lon: 22.96,
      approximate: true,
      windows: [['12:00', '12:00', true, true]],
      unknown: true,
    });
  });
});

describe('onDutyAt', () => {
  const at = (date: string, time: string) => localToInstant(date, time, ATHENS);
  const night = { id: 'a', lat: 0, lon: 0, windows: [['21:00', '08:00', true, false]] } as const;
  const noHours = { id: 'b', lat: 0, lon: 0, windows: [], unknown: true } as const;

  it('is true inside a window that runs into the next day, and not outside it', () => {
    expect(onDutyAt(night, '2026-10-05', at('2026-10-05', '20:59'), ATHENS)).toBe(false);
    expect(onDutyAt(night, '2026-10-05', at('2026-10-05', '21:00'), ATHENS)).toBe(true);
    expect(onDutyAt(night, '2026-10-05', at('2026-10-06', '07:59'), ATHENS)).toBe(true);
    expect(onDutyAt(night, '2026-10-05', at('2026-10-06', '08:00'), ATHENS)).toBe(false);
  });

  it('is true for the duty day, 08:00 to 08:00, when the list prints no hours', () => {
    expect(onDutyAt(noHours, '2026-10-05', at('2026-10-05', '07:59'), ATHENS)).toBe(false);
    expect(onDutyAt(noHours, '2026-10-05', at('2026-10-05', '08:00'), ATHENS)).toBe(true);
    expect(onDutyAt(noHours, '2026-10-05', at('2026-10-06', '07:59'), ATHENS)).toBe(true);
    expect(onDutyAt(noHours, '2026-10-05', at('2026-10-06', '08:00'), ATHENS)).toBe(false);
  });
});

describe('the loaders', () => {
  const answer = (status: number, body: unknown): typeof fetch =>
    (() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as typeof fetch;

  it('read the index and a day, and give null for what is not there', async () => {
    const index = { schemaVersion: 1, cities: [] };
    expect(await loadNationalIndex({ fetch: answer(200, index) })).toEqual(index);
    expect(await loadNationalIndex({ fetch: answer(404, {}) })).toBeNull();
    expect(await loadNationalIndex({ fetch: answer(200, { schemaVersion: 2 }) })).toBeNull();

    const dutyDay = { schemaVersion: 1, date: '2026-10-05', cities: {} };
    expect(await loadNationalDutyDay('2026-10-05', { fetch: answer(200, dutyDay) })).toEqual(
      dutyDay,
    );
    expect(await loadNationalDutyDay('2026-10-06', { fetch: answer(200, dutyDay) })).toBeNull();
    expect(await loadNationalDutyDay('2026-10-05', { fetch: answer(404, {}) })).toBeNull();
  });

  it('ask for the published paths', async () => {
    const urls: string[] = [];
    const record = ((url: string) => {
      urls.push(url);
      return Promise.resolve(new Response('{}', { status: 404 }));
    }) as unknown as typeof fetch;
    await loadNationalIndex({ fetch: record });
    await loadNationalDutyDay('2026-10-05', { fetch: record, basePath: '/x' });
    expect(urls).toEqual(['/data/index.json', '/x/duty/2026-10-05.json']);
  });

  it('fail on a server error', async () => {
    await expect(loadNationalIndex({ fetch: answer(500, {}) })).rejects.toThrow('HTTP 500');
  });
});
