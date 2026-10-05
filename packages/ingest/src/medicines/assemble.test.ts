import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { PriceBulletin } from '@pharmacy-skg/core';
import { readFirstSheet } from '../xlsx.ts';
import { assembleMedicines, type PriceTable } from './assemble.ts';
import { parsePriceTable, type PriceRow } from './price-table.ts';

function bulletin(id: string, kind: PriceBulletin['kind'] = 'prescription'): PriceBulletin {
  return {
    id,
    kind,
    title: id,
    date: '2026-01-01',
    articleUrl: `https://www.moh.gov.gr/a/${id}`,
    fileName: `${id}.xlsx`,
    fileUrl: `https://www.moh.gov.gr/a/${id}?fdl=1`,
  };
}

function row(overrides: Partial<PriceRow>): PriceRow {
  return {
    barcode: '2800000000001',
    code: '1',
    name: 'X TABLET 1MG/TAB BTx10',
    atc: 'A01',
    substance: 'X',
    company: 'C',
    price: 1,
    notReimbursed: false,
    ...overrides,
  };
}

async function real(name: string, id: string, kind: PriceBulletin['kind']): Promise<PriceTable> {
  const data = await readFile(new URL(`../../fixtures/moh/${name}`, import.meta.url));
  return { bulletin: bulletin(id, kind), rows: parsePriceTable(readFirstSheet(data)).rows };
}

describe('assembleMedicines', () => {
  it('lets a later bulletin change the price but keep what it leaves out', () => {
    const { medicines } = assembleMedicines(
      [
        { bulletin: bulletin('base'), rows: [row({ notReimbursed: true })] },
        {
          bulletin: bulletin('cut'),
          rows: [row({ price: 0.8, atc: '', company: '', notReimbursed: null })],
        },
      ],
      [],
    );
    expect(medicines).toEqual([
      {
        barcode: '2800000000001',
        name: 'X TABLET 1MG/TAB BTx10',
        atc: 'A01',
        substance: 'X',
        company: 'C',
        price: 0.8,
        otc: false,
        notReimbursed: true,
        bulletin: 'cut',
        shortage: null,
      },
    ]);
  });

  it('attaches shortages by barcode and counts the ones without a priced pack', () => {
    const result = assembleMedicines(
      [{ bulletin: bulletin('base'), rows: [row({})] }],
      [
        { barcode: '2800000000001', from: '2026-09-01', to: null, reason: 'Αυξημένη ζήτηση' },
        { barcode: '2809000000001', from: '2026-09-01', to: '2026-10-01', reason: '' },
      ],
    );
    expect(result.medicines[0]?.shortage).toEqual({
      from: '2026-09-01',
      to: null,
      reason: 'Αυξημένη ζήτηση',
    });
    expect(result.unmatchedShortages).toBe(1);
  });

  it('warns when a pack moves between the prescription and non-prescription lists', () => {
    const { warnings, medicines } = assembleMedicines(
      [
        { bulletin: bulletin('rx'), rows: [row({})] },
        { bulletin: bulletin('otc', 'otc'), rows: [row({ price: 3 })] },
      ],
      [],
    );
    expect(warnings.map((w) => w.code)).toEqual(['changed-kind']);
    expect(medicines[0]).toMatchObject({ otc: true, price: 3 });
  });

  it('applies real bulletins to the real base', async () => {
    const base = await real('14046_revision-dec-2025-amended.xlsx', '14046/30656', 'prescription');
    const cut = await real('14099_voluntary-cut-wegovy.xlsx', '14099/30689', 'prescription');
    const q2 = await real('14805_new-q2-2026.xlsx', '14805/31831', 'prescription');
    const otc = await real('13661_otc-catalogue-2025.xlsx', '13661/29735', 'otc');
    const { medicines, warnings } = assembleMedicines([base, cut, q2, otc], []);
    expect(warnings).toEqual([]);
    const known = new Set(base.rows.map((r) => r.barcode));
    const added = q2.rows.filter((r) => !known.has(r.barcode)).length;
    expect(medicines).toHaveLength(base.rows.length + added + otc.rows.length);
    for (const cutRow of cut.rows) {
      expect(medicines.find((m) => m.barcode === cutRow.barcode)).toMatchObject({
        price: cutRow.price,
        bulletin: '14099/30689',
      });
    }
    expect(medicines.filter((m) => m.otc)).toHaveLength(otc.rows.length);
  });
});
