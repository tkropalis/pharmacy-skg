import type { Pharmacy } from '@pharmacy-skg/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildLocalities,
  searchLocalities,
  soundKey,
  stripAccents,
  loadNationalPlaces,
} from './places.ts';

function pharmacy(
  id: string,
  locality: string,
  location: [number, number, 'exact' | 'street' | 'locality'] | null,
): Pharmacy {
  return {
    id,
    name: id,
    address: '',
    locality,
    postcode: null,
    phone: null,
    groupId: null,
    location: location && {
      lat: location[0],
      lon: location[1],
      source: 'override',
      precision: location[2],
    },
    sources: ['fsth'],
    firstSeen: '2026-01-01',
    lastSeen: '2026-01-01',
  };
}

describe('buildLocalities', () => {
  const list = buildLocalities([
    pharmacy('1', 'Καλαμαριά', [40.58, 22.95, 'exact']),
    pharmacy('2', 'Καλαμαριά', [40.6, 22.97, 'street']),
    pharmacy('3', 'Καλαμαριά', [41, 23, 'locality']),
    pharmacy('4', 'Πυλαία', [40.6, 22.99, 'locality']),
    pharmacy('5', 'Θέρμη', null),
    pharmacy('6', 'Άγιος Παύλος', [40.65, 22.95, 'exact']),
  ]);

  it('averages the precise pharmacies of each locality', () => {
    const kalamaria = list.find((l) => l.name === 'Καλαμαριά');
    expect(kalamaria?.lat).toBeCloseTo(40.59);
    expect(kalamaria?.lon).toBeCloseTo(22.96);
    expect(kalamaria?.count).toBe(3);
  });
  it('falls back to locality-level points and skips unlocated localities', () => {
    expect(list.find((l) => l.name === 'Πυλαία')?.lat).toBeCloseTo(40.6);
    expect(list.map((l) => l.name)).not.toContain('Θέρμη');
  });
  it('sorts in Greek order, ignoring accents', () => {
    expect(list.map((l) => l.name)).toEqual(['Άγιος Παύλος', 'Καλαμαριά', 'Πυλαία']);
  });
});

describe('stripAccents', () => {
  it('removes accents, case and final sigma', () => {
    expect(stripAccents('Εύοσμος')).toBe('ευοσμοσ');
    expect(stripAccents('ΚΑΛΑΜΑΡΙΆ')).toBe('καλαμαρια');
  });
});

describe('soundKey', () => {
  it.each([
    ['Καλαμαριά', 'kalamaria'],
    ['Καλαμαριά', 'KALAMARIA'],
    ['Εύοσμος', 'evosmos'],
    ['Εύοσμος', 'efosmos'],
    ['Συκιές', 'sykies'],
    ['Πυλαία', 'pylaia'],
    ['Πυλαία', 'pilea'],
    ['Θέρμη', 'thermi'],
    ['Θέρμη', 'termi'],
    ['Χορτιάτης', 'chortiatis'],
    ['Χορτιάτης', 'xortiatis'],
    ['Ωραιόκαστρο', 'oraiokastro'],
    ['Νέα Μηχανιώνα', 'nea michaniona'],
    ['Ελευθέριο-Κορδελιό', 'eleftherio kordelio'],
    ['Σταυρούπολη', 'stavroupoli'],
    ['Άγιος Παύλος', 'agios pavlos'],
  ])('%s matches %s', (greek, latin) => {
    expect(soundKey(greek)).toBe(soundKey(latin));
  });

  it('does not conflate different places', () => {
    expect(soundKey('Καλαμαριά')).not.toBe(soundKey('Καλοχώρι'));
  });
});

describe('searchLocalities', () => {
  const localities = buildLocalities(
    ['Καλαμαριά', 'Καλοχώρι', 'Εύοσμος', 'Νέα Μαγνησία', 'Άγιος Παύλος', 'Πυλαία'].map((name, i) =>
      pharmacy(String(i), name, [40 + i / 100, 22.9, 'exact']),
    ),
  );
  const names = (query: string) => searchLocalities(localities, query).map((l) => l.name);

  it('lists everything for an empty query', () => {
    expect(names('')).toHaveLength(6);
  });
  it('matches Greek prefixes ignoring accents and case', () => {
    expect(names('καλα')).toEqual(['Καλαμαριά']);
    expect(names('ΕΥΟΣ')).toEqual(['Εύοσμος']);
    expect(names('kal')).toEqual(['Καλαμαριά', 'Καλοχώρι']);
  });
  it('matches Greeklish and anywhere in a name, prefix matches first', () => {
    expect(names('evosmos')).toEqual(['Εύοσμος']);
    expect(names('pavlos')).toEqual(['Άγιος Παύλος']);
    expect(names('magn')).toEqual(['Νέα Μαγνησία']);
    expect(names('a')[0]).toBe('Άγιος Παύλος');
  });
  it('returns nothing for an unknown place and respects the limit', () => {
    expect(names('zzzz')).toEqual([]);
    expect(searchLocalities(localities, '', 2)).toHaveLength(2);
  });
});

describe('loadNationalPlaces', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the places, leaving out anything malformed', async () => {
    const good = { name: 'Ρόδος', cityId: 'dodecanese', lat: 36.43, lon: 28.22, count: 12 };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json([good, { name: 'Κως' }, null, 'x'])),
    );
    expect(await loadNationalPlaces('/data/places.json')).toEqual([good]);
  });

  it('gives none when the file cannot be read (offline before the first read)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      }),
    );
    expect(await loadNationalPlaces('/data/places.json')).toEqual([]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    expect(await loadNationalPlaces('/data/places.json')).toEqual([]);
  });
});
