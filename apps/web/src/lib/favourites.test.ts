import { describe, expect, it } from 'vitest';
import {
  FAVOURITES_KEY,
  FAVOURITES_MAX,
  loadFavourites,
  parseFavourites,
  saveFavourites,
  toggleFavourite,
} from './favourites.ts';
import type { KeyValueStorage } from './storage.ts';

function memory(
  initial: Record<string, string> = {},
): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const th = (id: string) => ({ id, cityId: 'thessaloniki' });

describe('parseFavourites', () => {
  it('reads "city/id" entries', () => {
    expect(parseFavourites('["thessaloniki/1","larisa/2410672566"]')).toEqual([
      th('1'),
      { id: '2410672566', cityId: 'larisa' },
    ]);
  });
  it('reads a bare id, saved before there were other cities, as the default city', () => {
    expect(parseFavourites('["1","2"]')).toEqual([th('1'), th('2')]);
  });
  it('drops duplicates, non-strings and empty ids', () => {
    expect(parseFavourites('["1",1,null,"","thessaloniki/1","2","/3","larisa/"]')).toEqual([
      th('1'),
      th('2'),
    ]);
  });
  it('treats garbage and non-arrays as empty', () => {
    expect(parseFavourites('{oops')).toEqual([]);
    expect(parseFavourites('{"a":1}')).toEqual([]);
    expect(parseFavourites(null)).toEqual([]);
  });
  it('caps the list', () => {
    const many = JSON.stringify(Array.from({ length: FAVOURITES_MAX + 50 }, (_, i) => String(i)));
    expect(parseFavourites(many)).toHaveLength(FAVOURITES_MAX);
  });
});

describe('storage', () => {
  it('round-trips through storage under the documented key', () => {
    const storage = memory();
    const list = [th('a'), { id: 'b', cityId: 'larisa' }];
    expect(saveFavourites(list, storage)).toBe(true);
    expect(storage.data.get(FAVOURITES_KEY)).toBe('["thessaloniki/a","larisa/b"]');
    expect(loadFavourites(storage)).toEqual(list);
  });
  it('survives storage that throws', () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    expect(loadFavourites(broken)).toEqual([]);
    expect(saveFavourites([th('a')], broken)).toBe(false);
  });
  it('reports no storage at all', () => {
    expect(loadFavourites(null)).toEqual([]);
    expect(saveFavourites([th('a')], null)).toBe(false);
  });
});

describe('toggleFavourite', () => {
  it('adds and removes, by id', () => {
    expect(toggleFavourite([th('a')], th('b'))).toEqual([th('a'), th('b')]);
    expect(toggleFavourite([th('a'), th('b')], th('a'))).toEqual([th('b')]);
  });
});
