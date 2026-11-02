import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseCycladesPlaces,
  parseCycladesResult,
  type CycladesResult,
} from '../cyclades/parse.ts';
import { cyclades, readCycladesLists, type CycladesSource } from './cyclades.ts';

const fixture = (name: string) =>
  readFileSync(new URL(`../../fixtures/fscyclades/${name}`, import.meta.url), 'utf8');

const PLACES = parseCycladesPlaces(fixture('form_2026-11-02.html'));

/** The places we have a real answer for; the date is whatever day is asked, as the site would. */
const ANSWERS: Readonly<Record<string, string>> = {
  'Τήνος (Χώρα)': '2026-11-02_tinos.html',
  'Θήρα (Φηρά)': '2026-11-02_santorini-fira.html',
  'Μύκονος (Χώρα)': '2026-11-02_mykonos-chora.html',
  'Άνδρος (Κόρθι)': '2026-11-15_andros-korthi.html',
  'Πάρος (Νάουσα)': '2026-11-16_paros-naoussa.html',
};

interface Fake extends CycladesSource {
  asked: string[];
}

function fakeSource(
  answer: (date: string, place: string) => CycladesResult | Error = (date, place) => {
    const file = ANSWERS[place];
    const result = file
      ? parseCycladesResult(fixture(file))
      : { date, place, duties: [] satisfies CycladesResult['duties'] };
    return { ...result, date };
  },
  places: string[] = PLACES,
): Fake {
  const asked: string[] = [];
  return {
    page: 'https://www.fscyclades.gr/onduty-cyclades/',
    asked,
    get requests() {
      return asked.length;
    },
    places: async () => places,
    day: async (date, place) => {
      asked.push(`${date} ${place}`);
      const result = answer(date, place);
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

const read = (source: Fake, today = '2026-11-02') => readCycladesLists(source, today, () => {});

describe('readCycladesLists', () => {
  it('asks every place of the form for each of the next 7 days, and nothing else', async () => {
    const source = fakeSource();
    await read(source);
    expect(source.asked).toHaveLength(13 * 7);
    expect(source.asked[0]).toBe('2026-11-02 Άνδρος (Κόρθι)');
    expect(source.asked.at(-1)).toBe('2026-11-08 Τήνος (Χώρα)');
  });

  it('makes a list for each island with a duty, and none for a place without one', async () => {
    const { items, failures } = await read(fakeSource());
    expect(failures).toEqual([]);
    const day = items.filter((item) => item.list.date === '2026-11-03');
    expect(day.map((item) => item.list.groupId).sort()).toEqual([
      'andros',
      'mykonos',
      'paros',
      'santorini',
      'tinos',
    ]);
    // Thira is called Santorini, as everyone does; Sifnos had no duty at all.
    expect(day.find((item) => item.list.groupId === 'santorini')?.list.groupName).toBe('Σαντορίνη');
    expect(items.some((item) => item.list.groupId === 'sifnos')).toBe(false);
  });

  it('states no hours: a place of 6 pharmacies or fewer is on call, a larger one is on duty', async () => {
    const { items } = await read(fakeSource());
    const section = (id: string) =>
      items.find((item) => item.list.groupId === id && item.list.date === '2026-11-02')?.list
        .sections;
    expect(section('tinos')).toEqual([
      {
        kind: 'on-duty',
        heading: 'Εφημερεύον φαρμακείο',
        hours: null,
        onCall: true,
        extraHours: [],
        notes: [],
        entries: [
          {
            locality: 'Τήνος',
            name: 'ΕΥΔΟΚΙΑ ΚΡΙΚΕΛΛΗ ΜΙΧΑΗΛ ΒΑΡΣΑΛΗΣ ΚΑΙ ΣΙΑ ΟΕ',
            address: 'Πλατεία Παντανάσσης 21',
            phone: '2283022272',
          },
        ],
      },
    ]);
    // Mykonos has 8 pharmacies on its rota.
    expect(section('mykonos')?.[0]).toMatchObject({ kind: 'on-duty', hours: null });
    expect(section('mykonos')?.[0]).not.toHaveProperty('onCall');
  });

  it('takes the coordinates from the page, by phone', async () => {
    const { locations } = await read(fakeSource());
    expect(locations?.get('2283022272')).toEqual({
      lat: 37.53773267707573,
      lon: 25.161790148772035,
      ref: 'https://www.fscyclades.gr/onduty-cyclades/',
    });
  });

  it("prints no phone for a pharmacy the page gives another's number", async () => {
    const { items, locations } = await read(fakeSource());
    const andros = items.find((item) => item.list.groupId === 'andros')?.list.sections[0];
    expect(andros?.entries[0]).toEqual({
      locality: 'Άνδρος',
      name: 'ΤΣΑΓΚΑΣ ΧΑΡΑΛΑΜΠΟΣ',
      address: 'Όρμος Κορθίου',
      phone: '',
    });
    // Its coordinates are found by locality and name.
    expect(locations?.get('Άνδρος|ΤΣΑΓΚΑΣ ΧΑΡΑΛΑΜΠΟΣ')?.lat).toBeCloseTo(37.773, 3);
    expect(locations?.has('2282023203')).toBe(false);
    const paros = items.find((item) => item.list.groupId === 'paros')?.list.sections[0];
    expect(paros?.entries[0]).toMatchObject({ name: 'ΣΠΑΝΟΥ ΚΡΥΣΤΑΛΛΙΑ', phone: '' });
  });

  it('publishes no list for an island when one of its places could not be read', async () => {
    const source = fakeSource((date, place) =>
      place === 'Θήρα (Εμπορείο)' && date === '2026-11-03'
        ? new Error('HTTP 500')
        : { ...parseCycladesResult(fixture('2026-11-02_santorini-fira.html')), date, place },
    );
    const { items, failures } = await read(source);
    // On the 3rd Santorini is missing, though Fira was read: the list would say Emporio has no duty.
    expect(items.some((i) => i.list.groupId === 'santorini' && i.list.date === '2026-11-03')).toBe(
      false,
    );
    expect(items.some((i) => i.list.groupId === 'santorini' && i.list.date === '2026-11-04')).toBe(
      true,
    );
    expect(failures).toHaveLength(1 + 0);
    expect(failures[0]?.message).toContain('2026-11-03 Θήρα (Εμπορείο)');
  });

  it('reports an answer for another day or place than the one asked for', async () => {
    const source = fakeSource((date, place) =>
      place === 'Τήνος (Χώρα)'
        ? { ...parseCycladesResult(fixture('2026-11-02_tinos.html')), date: '2026-11-01' }
        : { date, place, duties: [] },
    );
    const { items, failures } = await read(source);
    expect(items).toEqual([]);
    expect(failures[0]).toMatchObject({ code: 'unreadable-page' });
    expect(failures[0]?.message).toContain('asked for 2026-11-02 Τήνος (Χώρα), got 2026-11-01');
  });

  it('reads a place the form adds as on call, and says so once', async () => {
    const source = fakeSource(
      (date, place) => ({
        date,
        place,
        duties: [
          {
            name: 'ΝΕΟ ΦΑΡΜΑΚΕΙΟ',
            address: 'Χώρα',
            phone: '2284000001',
            location: { lat: 37.0, lon: 25.0 },
          },
        ],
      }),
      ['Πάρος (Λεύκες)'],
    );
    const { items, failures } = await read(source);
    expect(items[0]?.list.sections[0]).toMatchObject({ onCall: true });
    expect(failures.filter((f) => f.code === 'unknown-place')).toHaveLength(1);
  });

  it('reports a place on an island it does not know, and leaves it out', async () => {
    const source = fakeSource((date, place) => ({ date, place, duties: [] }), ['Μήλος (Αδάμας)']);
    const { items, failures } = await read(source);
    expect(items).toEqual([]);
    expect(failures).toEqual([
      { code: 'unknown-place', message: 'fscyclades.gr: "Μήλος (Αδάμας)" is on no known island' },
    ]);
    expect(source.asked).toEqual([]);
  });

  it('warns when two pharmacies print one phone, which is their id', async () => {
    const duty = (name: string, address: string) => ({
      name,
      address,
      phone: '2284099999',
      location: { lat: 37.0, lon: 25.0 },
    });
    const source = fakeSource(
      (date, place) => ({
        date,
        place,
        duties: [
          place === 'Πάρος (Νάουσα)'
            ? duty('ΑΛΦΑ ΑΛΕΞΑΝΔΡΟΣ', 'Νάουσα')
            : duty('ΒΗΤΑ ΒΑΣΙΛΕΙΟΣ', 'Παροικιά'),
        ],
      }),
      ['Πάρος (Νάουσα)', 'Πάρος (Παροικιά)'],
    );
    const { failures } = await read(source);
    expect(failures.filter((f) => f.code === 'phone-clash')).toHaveLength(1);
  });

  it('refuses a page whose form offers no places', async () => {
    await expect(read(fakeSource(undefined, []))).rejects.toThrow('the form offers no places');
  });
});

describe('the Cyclades pipeline', () => {
  it('is for the Cyclades, credits the association and reads no extended hours', async () => {
    expect(cyclades.city.id).toBe('cyclades');
    expect(cyclades.sources.map((source) => source.id)).toEqual(['fsc', 'osm']);
    expect(cyclades.sourceIds).toEqual({ duty: 'fsc', extended: null });
    expect(await cyclades.fetchExtendedHours({} as never)).toEqual({ items: [], failures: [] });
  });

  it('expects a list every day only from the islands that had one every day', () => {
    expect(cyclades.rules.groupIds).not.toContain('sifnos');
    expect(cyclades.rules.groupIds).toHaveLength(7);
  });
});
