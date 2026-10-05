import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { readFirstSheet } from '../xlsx.ts';
import { cleanSubstance, columnFor, parsePrice, parsePriceTable } from './price-table.ts';

async function table(name: string) {
  const data = await readFile(new URL(`../../fixtures/moh/${name}`, import.meta.url));
  return parsePriceTable(readFirstSheet(new Uint8Array(data)));
}

describe('columnFor', () => {
  it('maps the headers seen in the bulletins', () => {
    expect(columnFor('Barcode')).toBe('barcode');
    expect(columnFor('BARCODE')).toBe('barcode');
    expect(columnFor('Περιγραφή Προϊόντος')).toBe('name');
    expect(columnFor('ΟΝΟΜΑΣΙΑ - ΜΟΡΦΗ - ΠΕΡΙΕΚΤΙΚΟΤΗΤΑ')).toBe('name');
    expect(columnFor('ΟΝΟΜΑΣΙΑ ΠΡΟΪΟΝΤΟΣ ')).toBe('name');
    expect(columnFor('ΠΡΟΪΟΝ')).toBe('name');
    expect(columnFor('ΟΝΟΝΑΣΙΑ ΚΑΚ')).toBe('company');
    expect(columnFor('KAK')).toBe('company');
    expect(columnFor('Κάτοχος Άδειας Κυκλοφορίας')).toBe('company');
    expect(columnFor('Λιανική Τιμή')).toBe('price');
    expect(columnFor('Ενδεικτική Λιανική Τιμή')).toBe('price');
    expect(columnFor('Χονδρική Τιμή ')).toBeNull();
    expect(columnFor('Τιμή Παραγωγού')).toBeNull();
    expect(columnFor('Μη αποζημιούμενο')).toBe('flag');
    expect(columnFor('ΜΗ.ΣΥ.ΦΑ.')).toBeNull();
    expect(columnFor('Δραστική/ες')).toBe('substance');
  });
});

describe('cell values', () => {
  it('rounds floating-point noise to cents and reads decimal commas', () => {
    expect(parsePrice('4.4000000000000004')).toBe(4.4);
    expect(parsePrice('8.1300000000000008')).toBe(8.13);
    expect(parsePrice('12,50')).toBe(12.5);
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('0')).toBeNull();
  });

  it('separates substances with a comma and a space', () => {
    expect(cleanSubstance('CAPTOPRIL:HYDROCHLOROTHIAZIDE')).toBe('CAPTOPRIL, HYDROCHLOROTHIAZIDE');
    expect(cleanSubstance('PARACETAMOL,CAFFEINE')).toBe('PARACETAMOL, CAFFEINE');
    expect(cleanSubstance(' SERTRALINE ')).toBe('SERTRALINE');
  });
});

describe('parsePriceTable (real bulletins)', () => {
  it('reads the yearly revision (amended), the base of the price list', async () => {
    const { rows, warnings } = await table('14046_revision-dec-2025-amended.xlsx');
    expect(warnings).toEqual([]);
    expect(rows).toHaveLength(8507);
    expect(new Set(rows.map((r) => r.barcode)).size).toBe(8507);
    expect(rows[0]).toEqual({
      barcode: '2802100402016',
      code: '210040201',
      name: 'DORALIN F.C.TAB 40MG/TAB ΒΤx30 (BLIST 3x10)',
      atc: 'A03AB06',
      substance: 'OTILONIUM',
      company: 'A.MENARINI INDUSTRIE FARMACEUTICHE RIUNITE SRL, ITALY',
      price: 8.19,
      notReimbursed: false,
    });
    expect(rows.filter((r) => r.notReimbursed)).toHaveLength(314);
    expect(rows.find((r) => r.barcode === '2802009901023')?.price).toBe(4.4);
  });

  it('reads the upper-case layout of voluntary price cuts', async () => {
    const { rows } = await table('14099_voluntary-cut-wegovy.xlsx');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.name).toMatch(/WEGOVY/);
      expect(row.company).toMatch(/NOVO NORDISK/);
      expect(row.price).toBeGreaterThan(0);
    }
  });

  it('reads tables without a reimbursement or ATC column', async () => {
    const repricing = await table('14569_reference-repricing.xlsx');
    expect(repricing.rows.length).toBe(42);
    expect(repricing.rows.every((r) => r.notReimbursed === null)).toBe(true);
    const cannabis = await table('14304_cannabis-update.xlsx');
    expect(cannabis.rows.length).toBeGreaterThan(10);
    expect(cannabis.rows.every((r) => r.atc === '')).toBe(true);
  });

  it('reads the quarterly table of new medicines', async () => {
    const { rows, warnings } = await table('14805_new-q2-2026.xlsx');
    // The published table prices one product at 0: it is left out, with a warning.
    expect(warnings).toEqual([
      {
        code: 'price-row-skipped',
        message: expect.stringContaining('2803344401018') as string,
      },
    ]);
    expect(rows).toHaveLength(56);
    expect(rows.filter((r) => r.notReimbursed)).toHaveLength(2);
  });

  it('reads the non-prescription (ΜΗΣΥΦΑ) tables and their indicative prices', async () => {
    const catalogue = await table('13661_otc-catalogue-2025.xlsx');
    expect(catalogue.warnings).toEqual([]);
    expect(catalogue.rows).toHaveLength(736);
    expect(catalogue.rows.find((r) => r.barcode === '2802784701023')).toMatchObject({
      name: 'REFRESH PLUS EY.DR.S.SD 5MG/ML ΒΤx30 (περιέκτης μιας δόσης) x 0,4 ML',
      price: 5.89,
      substance: 'CARMELLOSE SODIUM',
    });
    const newer = await table('14109_otc-new-q3-q4-2025.xlsx');
    // Its product codes carry line breaks; its companies a leading space.
    expect(newer.rows[0]).toMatchObject({
      code: '338280101',
      company: 'AFLOFARM FARMACJA POLSKA SP. Z O.O., POLAND',
      price: 65.46,
    });
    const latest = await table('14636_otc-new-q1-2026.xlsx');
    expect(latest.rows.map((r) => r.name)).toContain('DEPON SYR 120MG/5ML FLx150ML');
  });
});
