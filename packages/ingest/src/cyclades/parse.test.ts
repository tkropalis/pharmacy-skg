import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCycladesPlaces, parseCycladesResult } from './parse.ts';

const fixture = (name: string) =>
  readFileSync(new URL(`../../fixtures/fscyclades/${name}`, import.meta.url), 'utf8');

describe('parseCycladesPlaces', () => {
  it('reads the 13 places the form offers, in its order', () => {
    expect(parseCycladesPlaces(fixture('form_2026-11-02.html'))).toEqual([
      'Άνδρος (Κόρθι)',
      'Άνδρος (Χώρα)',
      'Θήρα (Εμπορείο)',
      'Θήρα (Μεσσαριά)',
      'Θήρα (Φηρά)',
      'Μύκονος (Άνω Μερά)',
      'Μύκονος (Χώρα)',
      'Νάξος (Χώρα)',
      'Πάρος (Νάουσα)',
      'Πάρος (Παροικιά)',
      'Σίφνος (Απολλωνία)',
      'Σύρος (Ερμούπολη)',
      'Τήνος (Χώρα)',
    ]);
  });

  it('finds none on a page without the form', () => {
    expect(parseCycladesPlaces('<html><body>Maintenance</body></html>')).toEqual([]);
  });
});

describe('parseCycladesResult', () => {
  it('reads the pharmacy on duty, with its coordinates from the map script', () => {
    expect(parseCycladesResult(fixture('2026-11-02_tinos.html'))).toEqual({
      date: '2026-11-02',
      place: 'Τήνος (Χώρα)',
      duties: [
        {
          name: 'ΕΥΔΟΚΙΑ ΚΡΙΚΕΛΛΗ ΜΙΧΑΗΛ ΒΑΡΣΑΛΗΣ ΚΑΙ ΣΙΑ ΟΕ',
          address: 'Πλατεία Παντανάσσης 21',
          phone: '2283022272',
          location: { lat: 37.53773267707573, lon: 25.161790148772035 },
        },
      ],
      following: [
        {
          date: '2026-11-03',
          name: 'ΑΠΕΡΓΗΣ ΕΜΜΑΝΟΥΗΛ ΚΑΙ ΣΙΑ ΟΕ',
          address: 'Τριών Ιεραρχών 2',
          phone: '2283022213',
        },
        {
          date: '2026-11-04',
          name: 'ΦΡΑΓΚΙΣΚΑ ΧΑΤΖΗΛΟΥΗ',
          address: 'Αλαβάνου Ζανάκη 7',
          phone: '2283023888',
        },
      ],
    });
  });

  it('reads the next two days apart from the pharmacy on duty, with no coordinates', () => {
    const { duties, following } = parseCycladesResult(fixture('2026-11-02_tinos.html'));
    expect(duties).toHaveLength(1);
    expect(following.map((f) => f.date)).toEqual(['2026-11-03', '2026-11-04']);
    expect(following[0]).not.toHaveProperty('location');
    const mykonos = parseCycladesResult(fixture('2026-11-02_mykonos-chora.html'));
    expect(mykonos.following.map((f) => f.date)).toEqual(['2026-11-03', '2026-11-04']);
    expect(mykonos.following[1]?.phone).toBe('2289023900');
  });

  it('decodes the page text and keeps an address as printed', () => {
    const { duties } = parseCycladesResult(fixture('2026-11-02_mykonos-chora.html'));
    expect(duties).toEqual([
      {
        name: 'ΘΕΟΧΑΡΗΣ Ι ΔΑΣΟΥΡΑ Φ Ε ΟΕ',
        address: 'Χώρα & Ζουγανέλη Φλώρου 19',
        phone: '2289023770',
        location: { lat: 37.44664993121274, lon: 25.329208095360237 },
      },
    ]);
    const fira = parseCycladesResult(fixture('2026-11-02_santorini-fira.html'));
    expect(fira.place).toBe('Θήρα (Φηρά)');
    expect(fira.duties[0]?.address).toBe('Φηρά - παραπλεύρως Alpha bank - Κεντρική Πλατεία');
    expect(fira.duties[0]?.phone).toBe('2282022700');
  });

  it('reads an empty result: the place has no duty that day', () => {
    expect(parseCycladesResult(fixture('2026-11-02_sifnos-empty.html'))).toEqual({
      date: '2026-11-02',
      place: 'Σίφνος (Απολλωνία)',
      duties: [],
      following: [],
    });
  });

  it('gives every pharmacy a name, a phone and coordinates in the Cyclades', () => {
    for (const name of [
      '2026-11-02_tinos.html',
      '2026-11-02_santorini-fira.html',
      '2026-11-02_mykonos-chora.html',
      '2026-11-15_andros-korthi.html',
      '2026-11-16_paros-naoussa.html',
    ]) {
      for (const duty of parseCycladesResult(fixture(name)).duties) {
        expect(duty.name).not.toBe('');
        expect(duty.phone).toMatch(/^[26]\d{9}$/);
        expect(duty.location?.lat).toBeGreaterThan(36.2);
        expect(duty.location?.lat).toBeLessThan(38);
        expect(duty.location?.lon).toBeGreaterThan(24.6);
        expect(duty.location?.lon).toBeLessThan(25.6);
      }
    }
  });

  it('reads no date from a page that is not an answer', () => {
    expect(parseCycladesResult(fixture('form_2026-11-02.html'))).toEqual({
      date: null,
      place: null,
      duties: [],
      following: [],
    });
  });
});
