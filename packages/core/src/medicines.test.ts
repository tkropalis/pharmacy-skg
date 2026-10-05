import { describe, expect, it } from 'vitest';
import { decodeMedicineIndex, encodeMedicineIndex } from './medicines.ts';
import type { MedicinesFile } from './medicines.ts';

const FILE: MedicinesFile = {
  schemaVersion: 1,
  updatedAt: '2026-10-05T09:00:00.000Z',
  bulletins: [
    {
      id: '14046/30656',
      kind: 'prescription',
      title: 'Δελτίο αναθεωρημένων τιμών',
      date: '2026-02-20',
      articleUrl: 'https://www.moh.gov.gr/articles/a',
      fileName: 'a.xlsx',
      fileUrl: 'https://www.moh.gov.gr/articles/a?fdl=30656',
    },
    {
      id: '13661/29735',
      kind: 'otc',
      title: 'Αναθεώρηση καταλόγου ΜΗΣΥΦΑ',
      date: '2025-09-10',
      articleUrl: 'https://www.moh.gov.gr/articles/b',
      fileName: 'b.xlsx',
      fileUrl: 'https://www.moh.gov.gr/articles/b?fdl=29735',
    },
  ],
  shortageList: {
    title: 'ΛΙΣΤΑ',
    date: '2026-09-30',
    postUrl: 'https://www.eof.gr/x/',
    fileUrl: 'https://www.eof.gr/x.pdf',
  },
  medicines: [
    {
      barcode: '2802100402016',
      name: 'DORALIN F.C.TAB 40MG/TAB ΒΤx30 (BLIST 3x10)',
      atc: 'A03AB06',
      substance: 'OTILONIUM',
      company: 'A.MENARINI',
      price: 8.19,
      otc: false,
      notReimbursed: false,
      bulletin: '14046/30656',
      shortage: { from: '2026-10-30', to: null, reason: 'Αυξημένη ζήτηση' },
    },
    {
      barcode: '2800232806054',
      name: 'DEPON SYR 120MG/5ML FLx150ML',
      atc: 'N02BE01',
      substance: 'PARACETAMOL',
      company: 'UPSA SAS, FRANCE',
      price: 2.25,
      otc: true,
      notReimbursed: true,
      bulletin: '13661/29735',
      shortage: null,
    },
    {
      barcode: '2802024201023',
      name: 'MAXUDIN TABLET 20MG/TAB BTx14',
      atc: 'C10AA03',
      substance: 'PRAVASTATIN',
      company: 'A.MENARINI',
      price: 4.07,
      otc: false,
      notReimbursed: false,
      bulletin: '14046/30656',
      shortage: null,
    },
  ],
};

const [DORALIN, DEPON] = FILE.medicines;
if (!DORALIN || !DEPON) throw new Error('fixture');

describe('medicine index', () => {
  it('round-trips the published file, sharing repeated strings', () => {
    const index = encodeMedicineIndex(FILE);
    expect(index.companies).toEqual(['A.MENARINI', 'UPSA SAS, FRANCE']);
    expect(index.rows[0]).toEqual([
      '2802100402016',
      'DORALIN F.C.TAB 40MG/TAB ΒΤx30 (BLIST 3x10)',
      0,
      0,
      819,
      0,
      0,
    ]);
    const decoded = decodeMedicineIndex(JSON.parse(JSON.stringify(index)));
    expect(decoded).toHaveLength(3);
    expect(decoded[0]).toMatchObject({
      barcode: '2802100402016',
      price: 8.19,
      otc: false,
      shortage: { from: '2026-10-30', to: null },
      bulletin: { kind: 'prescription', date: '2026-02-20' },
    });
    expect(decoded[1]).toMatchObject({ otc: true, notReimbursed: true, shortage: null });
    expect(decoded[2]?.company).toBe('A.MENARINI');
  });

  it('keeps prices exact in cents', () => {
    const index = encodeMedicineIndex({
      ...FILE,
      medicines: [{ ...DEPON, price: 4.4 }],
    });
    expect(index.rows[0]?.[4]).toBe(440);
  });

  it('rejects an unknown bulletin or version', () => {
    expect(() =>
      encodeMedicineIndex({ ...FILE, medicines: [{ ...DORALIN, bulletin: 'x' }] }),
    ).toThrow(/unknown bulletin/);
    const index = encodeMedicineIndex(FILE);
    expect(() => decodeMedicineIndex({ ...index, v: 2 as 1 })).toThrow(/version/);
  });
});
