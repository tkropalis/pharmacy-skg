import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { MedicinesSchema, type Medicines } from '../schema.ts';
import { medicinesPaths } from '../store.ts';
import { validateMedicines } from './validate.ts';

async function published(): Promise<Medicines> {
  return MedicinesSchema.parse(JSON.parse(await readFile(medicinesPaths().medicines, 'utf8')));
}

describe('validateMedicines', () => {
  it('passes the published file', async () => {
    const file = await published();
    const onList = file.medicines.filter((m) => m.shortage !== null).length;
    expect(validateMedicines(file, onList)).toEqual({ errors: [], warnings: [] });
  });

  it('fails when a list shrinks, e.g. a partial table taken for the yearly revision', async () => {
    const file = await published();
    const partial = { ...file, medicines: file.medicines.slice(0, 2000) };
    const codes = validateMedicines(partial, 0).errors.map((e) => e.code);
    expect(codes).toContain('prescription-count');
  });

  it('fails when the shortage list no longer lines up with the prices', async () => {
    const file = await published();
    const none = { ...file, medicines: file.medicines.map((m) => ({ ...m, shortage: null })) };
    expect(validateMedicines(none, 289).errors.map((e) => e.code)).toEqual(['shortage-match']);
  });

  it('fails on a duplicate barcode or an unknown bulletin', async () => {
    const file = await published();
    const first = file.medicines[0];
    if (!first) throw new Error('empty');
    const broken = {
      ...file,
      medicines: [...file.medicines, { ...first, bulletin: 'nope' }],
    };
    const codes = validateMedicines(broken, 0).errors.map((e) => e.code);
    expect(codes).toEqual(expect.arrayContaining(['schema', 'duplicate-barcode']));
  });
});
