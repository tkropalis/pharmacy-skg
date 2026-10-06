import { describe, expect, it } from 'vitest';
import {
  FREQUENT_SHOWN,
  VISITS_MAX,
  VISIT_GAP_MS,
  frequentPharmacies,
  loadPosition,
  loadRecentAreas,
  loadVisits,
  parsePosition,
  parseVisits,
  recordVisit,
  rememberArea,
  savePosition,
  forgetPosition,
  withRecentArea,
  withVisit,
} from './memory.ts';
import type { KeyValueStorage } from './storage.ts';

function memoryStorage(): KeyValueStorage & { readonly map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

describe('the last position', () => {
  it('is kept rounded to about 100 m, with when it was taken', () => {
    const storage = memoryStorage();
    savePosition({ lat: 40.632612345, lon: 22.940987654 }, 1_000, storage);
    expect(loadPosition(storage)).toEqual({ lat: 40.633, lon: 22.941, at: 1_000 });
    forgetPosition(storage);
    expect(loadPosition(storage)).toBeNull();
  });

  it('is nothing when the stored value is broken', () => {
    expect(parsePosition(null)).toBeNull();
    expect(parsePosition('nope')).toBeNull();
    expect(parsePosition('{"lat":"40","lon":22,"at":1}')).toBeNull();
    expect(parsePosition('{"lat":91,"lon":22,"at":1}')).toBeNull();
    expect(parsePosition('null')).toBeNull();
  });
});

describe('recent areas', () => {
  it('keeps the latest first, without repeats, four at most', () => {
    const storage = memoryStorage();
    for (const name of ['Καλαμαριά', 'Θέρμη', 'Εύοσμος', 'Καλαμαριά', 'Πυλαία', 'Σίνδος']) {
      rememberArea(name, storage);
    }
    expect(loadRecentAreas(storage)).toEqual(['Σίνδος', 'Πυλαία', 'Καλαμαριά', 'Εύοσμος']);
    expect(withRecentArea([], 'Θέρμη')).toEqual(['Θέρμη']);
  });

  it('ignores a broken value', () => {
    const storage = memoryStorage();
    storage.setItem('pharmacy-skg:recent-areas', '{"a":1}');
    expect(loadRecentAreas(storage)).toEqual([]);
  });
});

describe('visits', () => {
  const hour = 60 * 60_000;

  it('counts a pharmacy once per visit, not every tap', () => {
    let visits = withVisit({}, 'a', 0);
    visits = withVisit(visits, 'a', VISIT_GAP_MS - 1);
    expect(visits['a']).toEqual([1, VISIT_GAP_MS - 1]);
    visits = withVisit(visits, 'a', VISIT_GAP_MS - 1 + VISIT_GAP_MS);
    expect(visits['a']?.[0]).toBe(2);
  });

  it('shows the most opened, seen on two visits or more, without the favourites', () => {
    let visits = {};
    for (const [id, times] of [
      ['a', 3],
      ['b', 1],
      ['c', 2],
      ['d', 5],
      ['e', 2],
    ] as const) {
      for (let i = 0; i < times; i += 1) visits = withVisit(visits, id, i * hour);
    }
    expect(frequentPharmacies(visits, [])).toEqual(['d', 'a', 'c'].slice(0, FREQUENT_SHOWN));
    // A favourite is already one tap away.
    expect(frequentPharmacies(visits, ['d'])).toEqual(['a', 'c', 'e']);
    // Between equals, the latest first.
    expect(frequentPharmacies(withVisit(visits, 'e', 99 * hour), ['d', 'a'])).toEqual(['e', 'c']);
  });

  it('keeps 50 pharmacies at most, always with room for a new one', () => {
    let visits = {};
    for (let i = 0; i < VISITS_MAX; i += 1) {
      visits = withVisit(visits, `p${i}`, 0);
      visits = withVisit(visits, `p${i}`, hour);
    }
    visits = withVisit(visits, 'new', 2 * hour);
    expect(Object.keys(visits)).toHaveLength(VISITS_MAX);
    expect(visits).toHaveProperty('new');
  });

  it('is stored on the device and survives a broken value', () => {
    const storage = memoryStorage();
    recordVisit('2310023026', 0, storage);
    recordVisit('2310023026', 2 * hour, storage);
    expect(loadVisits(storage)['2310023026']).toEqual([2, 2 * hour]);
    expect(parseVisits('[1,2]')).toEqual({});
    expect(parseVisits('{"a":[0,1],"b":["x",1],"c":[2,5]}')).toEqual({ c: [2, 5] });
  });
});
