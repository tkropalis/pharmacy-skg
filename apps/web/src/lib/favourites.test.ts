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

function memory(initial: Record<string, string> = {}): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe('parseFavourites', () => {
  it('reads an array of ids', () => {
    expect(parseFavourites('["1","2"]')).toEqual(['1', '2']);
  });
  it('drops duplicates, non-strings and empty ids', () => {
    expect(parseFavourites('["1",1,null,"","1","2"]')).toEqual(['1', '2']);
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
    expect(saveFavourites(['a', 'b'], storage)).toBe(true);
    expect(storage.data.get(FAVOURITES_KEY)).toBe('["a","b"]');
    expect(loadFavourites(storage)).toEqual(['a', 'b']);
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
    expect(saveFavourites(['a'], broken)).toBe(false);
  });
  it('reports no storage at all', () => {
    expect(loadFavourites(null)).toEqual([]);
    expect(saveFavourites(['a'], null)).toBe(false);
  });
});

describe('toggleFavourite', () => {
  it('adds and removes', () => {
    expect(toggleFavourite(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleFavourite(['a', 'b'], 'a')).toEqual(['b']);
  });
});
