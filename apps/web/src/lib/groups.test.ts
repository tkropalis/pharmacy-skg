import type { CityData, Pharmacy } from '@pharmacy-skg/core';
import { THESSALONIKI } from '@pharmacy-skg/core';
import { describe, expect, it } from 'vitest';
import { dominantGroup, groupList, groupNames, groupNear } from './groups.ts';

const pharmacy = (id: string, groupId: string | null, lat = 40.6, lon = 22.9): Pharmacy =>
  ({ id, groupId, location: { lat, lon, precision: 'address' } }) as unknown as Pharmacy;

const day = (date: string, groups: [string, string][]) => ({
  schemaVersion: 1 as const,
  date,
  groups: groups.map(([id, name]) => ({
    id,
    name,
    source: { url: '', uploadedAt: '' },
    sections: [],
  })),
});

describe('groupNames / groupList', () => {
  const data = {
    city: THESSALONIKI,
    duties: new Map([
      [
        '2026-10-05',
        day('2026-10-05', [
          ['metro', 'Παλιό όνομα'],
          ['thermi', 'Δήμος Θέρμης (παλιό όνομα)'],
        ]),
      ],
      [
        '2026-10-06',
        day('2026-10-06', [
          ['metro', 'Πολεοδομικό Συγκρότημα'],
          ['thermi', 'Δήμος Θέρμης'],
        ]),
      ],
    ]),
  } as unknown as CityData;

  it('names the groups from the loaded days, the newest day first', () => {
    const names = groupNames(data);
    expect(names.get('thermi')).toBe('Δήμος Θέρμης');
    expect(groupList(['thermi', 'volvi'], names)).toBe('Δήμος Θέρμης, volvi');
  });

  it('calls the metro group by the city, not by its administrative name', () => {
    expect(groupNames(data).get('metro')).toBe('Θεσσαλονίκη');
  });
});

describe('dominantGroup / groupNear', () => {
  it('picks the most common group, ignoring pharmacies without one', () => {
    expect(
      dominantGroup([pharmacy('1', 'thermi'), pharmacy('2', 'metro'), pharmacy('3', 'thermi')]),
    ).toBe('thermi');
    expect(dominantGroup([pharmacy('1', null)])).toBeNull();
  });

  it('takes the group of the nearest located pharmacy', () => {
    const list = [pharmacy('1', 'metro', 40.63, 22.94), pharmacy('2', 'thermi', 40.55, 23.02)];
    expect(groupNear(list, { lat: 40.56, lon: 23.0 })).toBe('thermi');
    expect(groupNear([], { lat: 40, lon: 22 })).toBeNull();
  });
});
