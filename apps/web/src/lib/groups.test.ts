import { readdirSync, readFileSync } from 'node:fs';
import type { CityData, DutyDay, Pharmacy } from '@pharmacy-skg/core';
import { CITIES, THESSALONIKI } from '@pharmacy-skg/core';
import { describe, expect, it } from 'vitest';
import { dominantGroup, groupList, groupNames, groupNear, KNOWN_GROUPS } from './groups.ts';

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
    expect(groupList(['thermi'], names, 'el')).toBe('Δήμος Θέρμης');
  });

  it('names a group that has no list on the loaded days too, never by its id', () => {
    // "Not announced yet for: ..." is about exactly the groups the loaded days do not have.
    const names = groupNames(data);
    expect(groupList(['volvi', 'asvestochori'], names, 'el')).toBe(
      'Δήμος Βόλβης και Ασβεστοχώρι/Εξοχή-Χορτιάτης-Φίλυρο',
    );
  });

  it('joins the names the way each language does, in Latin letters in English', () => {
    const names = groupNames(data);
    const ids = ['chalkidona', 'delta', 'lagkadas'];
    expect(groupList(ids, names, 'el')).toBe('Δήμος Χαλκηδόνας, Δήμος Δέλτα και Δήμος Λαγκαδά');
    expect(groupList(ids, names, 'en')).toBe('Dimos Chalkidonas, Dimos Delta and Dimos Lagkada');
    expect(groupList(['metro'], names, 'en')).toBe('Thessaloniki');
  });

  it('has a name for every group of every city that has several (data/)', () => {
    for (const city of CITIES) {
      const dir = new URL(`../../../../data/${city.id}/duties/`, import.meta.url);
      const ids = new Set<string>();
      for (const file of readdirSync(dir)) {
        const day = JSON.parse(readFileSync(new URL(file, dir), 'utf8')) as DutyDay;
        for (const group of day.groups) ids.add(group.id);
      }
      if (ids.size < 2) continue;
      expect(
        [...ids].filter((id) => KNOWN_GROUPS[city.id]?.[id] === undefined),
        city.id,
      ).toEqual([]);
    }
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
