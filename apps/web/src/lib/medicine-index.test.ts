import { describe, expect, it, vi } from 'vitest';
import { MEDICINE_INDEX_VERSION } from '@pharmacy-skg/core';
import type { MedicineIndex } from '@pharmacy-skg/core';
import { MEDICINE_INDEX_URL, loadMedicines } from './medicine-index.ts';

const INDEX: MedicineIndex = {
  v: MEDICINE_INDEX_VERSION,
  updatedAt: '2026-10-05T09:00:00.000Z',
  bulletins: [{ kind: 'otc', title: 't', date: '2026-09-03', articleUrl: 'https://x/' }],
  shortageList: null,
  substances: ['PARACETAMOL'],
  companies: ['UPSA'],
  rows: [['2800232806054', 'DEPON SYR 120MG/5ML FLx150ML', 0, 0, 225, 1, 0]],
  shortages: [],
};

describe('loadMedicines', () => {
  it('asks for the index once, with no query, and retries after a failure', async () => {
    const failing = vi.fn(async () => new Response('', { status: 503 }));
    await expect(loadMedicines(failing)).rejects.toThrow(/503/);
    const working = vi.fn(async () => Response.json(INDEX));
    const first = await loadMedicines(working);
    const second = await loadMedicines(working);
    expect(second).toBe(first);
    expect(working).toHaveBeenCalledTimes(1);
    expect(working).toHaveBeenCalledWith(MEDICINE_INDEX_URL);
    expect(MEDICINE_INDEX_URL).toBe('/data/medicines/index.json');
    expect(first.medicines[0]).toMatchObject({ name: 'DEPON SYR 120MG/5ML FLx150ML', otc: true });
  });
});
