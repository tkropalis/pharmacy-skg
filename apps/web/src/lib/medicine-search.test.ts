import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeMedicineIndex, encodeMedicineIndex } from '@pharmacy-skg/core';
import type { IndexedMedicine, MedicinesFile } from '@pharmacy-skg/core';
import { prepareSearch, searchMedicines, soundKey, splitName } from './medicine-search.ts';

function medicine(name: string, substance: string, barcode = '2800000000000'): IndexedMedicine {
  return {
    barcode,
    name,
    substance,
    company: 'C',
    price: 1,
    otc: false,
    notReimbursed: false,
    bulletin: { kind: 'prescription', title: 't', date: '2026-01-01', articleUrl: 'https://x/' },
    shortage: null,
  };
}

const SMALL = prepareSearch([
  medicine('ALGINE TAB (500+65)MG/TAB BTX12', 'PARACETAMOL, CAFFEINE', '2802423702015'),
  medicine('DEPON TABLET 500MG/TAB BTx20', 'PARACETAMOL', '2800232802018'),
  medicine('DEPON SYR 120MG/5ML FLx150ML', 'PARACETAMOL', '2800232806054'),
  medicine('ZIRTEK F.C.TAB 10MG/TAB BTx20', 'CETIRIZINE DIHYDROCHLORIDE', '2801111111111'),
  medicine('ADVIL C.TAB 200MG/TAB BTx20', 'IBUPROFEN', '2802222222222'),
  medicine('DEPOT X INJ.SOL 1MG/ML', 'X', '2803333333333'),
]);
const names = (query: string) => searchMedicines(SMALL, query).results.map((m) => m.name);

describe('soundKey', () => {
  it('spells Greek by sound and folds Latin spellings that sound alike', () => {
    expect(soundKey('Ντεπόν')).toBe('depon');
    expect(soundKey('DEPON')).toBe('depon');
    expect(soundKey('ιβουπροφαίνη')).toBe(soundKey('IBUPROFENI'));
    expect(soundKey('Αμοξικιλλίνη')).toBe('amoksikilini');
    expect(soundKey('AMOXICILLIN')).toBe('amoksikilin');
    expect(soundKey('500MG/TAB')).toBe('500 mg tav');
    expect(soundKey('CETIRIZINE', true)).toBe('setirizine');
  });
});

describe('searchMedicines', () => {
  it('finds a brand typed in Greek or Latin, with or without accents', () => {
    for (const query of ['depon', 'DEPON', 'ντεπον', 'Ντεπόν']) {
      expect(names(query), query).toEqual([
        'DEPON SYR 120MG/5ML FLx150ML',
        'DEPON TABLET 500MG/TAB BTx20',
      ]);
    }
  });

  it('finds the active substance, in Greek with its endings too', () => {
    expect(names('παρακεταμόλη')).toEqual([
      'ALGINE TAB (500+65)MG/TAB BTX12',
      'DEPON SYR 120MG/5ML FLx150ML',
      'DEPON TABLET 500MG/TAB BTx20',
    ]);
    expect(names('σετιριζίνη')).toEqual(['ZIRTEK F.C.TAB 10MG/TAB BTx20']);
    expect(names('ιβουπροφαίνη')).toEqual(['ADVIL C.TAB 200MG/TAB BTx20']);
  });

  it('ranks the name before the substance, then sorts by name', () => {
    expect(names('depon 500')).toEqual(['DEPON TABLET 500MG/TAB BTx20']);
    expect(names('500')).toEqual([
      'ALGINE TAB (500+65)MG/TAB BTX12',
      'DEPON TABLET 500MG/TAB BTx20',
    ]);
  });

  it('does not match a different short word that only looks alike', () => {
    expect(names('depon')).not.toContain('DEPOT X INJ.SOL 1MG/ML');
  });

  it('finds a barcode and waits for two letters', () => {
    expect(names('2800232806054')).toEqual(['DEPON SYR 120MG/5ML FLx150ML']);
    expect(searchMedicines(SMALL, 'd')).toEqual({ results: [], tooShort: true });
    expect(searchMedicines(SMALL, ' - ')).toEqual({ results: [], tooShort: true });
    expect(names('xyzzy')).toEqual([]);
  });

  it('works on the published list', () => {
    const file = JSON.parse(
      readFileSync(new URL('../../../../data/medicines/medicines.json', import.meta.url), 'utf8'),
    ) as MedicinesFile;
    const entries = prepareSearch(decodeMedicineIndex(encodeMedicineIndex(file)));
    const found = searchMedicines(entries, 'ντεπον').results;
    expect(found.length).toBeGreaterThan(5);
    expect(found.every((m) => m.name.startsWith('DEPON'))).toBe(true);
  });
});

describe('splitName', () => {
  const forms = new Set(['TABLET', 'SYR']);
  it('splits the brand from the form code', () => {
    expect(splitName('DORALIN F.C.TAB 40MG/TAB ΒΤx30', forms)).toEqual({
      brand: 'DORALIN',
      form: 'F.C.TAB',
      rest: '40MG/TAB ΒΤx30',
    });
    expect(splitName('PANADOL MAXIMUM TABLET 1G', forms).brand).toBe('PANADOL MAXIMUM');
    expect(splitName('WATER FOR INJECTION/ADIPHARM SOLV.INJ 100%', forms).brand).toBe(
      'WATER FOR INJECTION/ADIPHARM',
    );
    expect(splitName('SOMETHING ELSE', forms)).toEqual({
      brand: 'SOMETHING ELSE',
      form: null,
      rest: '',
    });
  });
});
