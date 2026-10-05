import { decodeMedicineIndex } from '@pharmacy-skg/core';
import type { IndexedMedicine, MedicineIndex } from '@pharmacy-skg/core';
import { DATA_BASE_PATH } from './data.ts';

/** Published by integrations/data.ts from data/medicines/medicines.json. */
export const MEDICINE_INDEX_URL = `${DATA_BASE_PATH}/medicines/index.json`;

export interface LoadedMedicines {
  readonly medicines: readonly IndexedMedicine[];
  readonly updatedAt: string;
  readonly shortageList: MedicineIndex['shortageList'];
}

let pending: Promise<LoadedMedicines> | null = null;

/**
 * Downloads the index once per page (about 0.2 MB compressed). The request carries no query:
 * the search runs on the device. The service worker keeps the last copy for offline use.
 * A failed load is forgotten, so a retry asks again.
 */
export function loadMedicines(doFetch: typeof fetch = fetch): Promise<LoadedMedicines> {
  pending ??= (async () => {
    const response = await doFetch(MEDICINE_INDEX_URL);
    if (!response.ok)
      throw new Error(`GET ${MEDICINE_INDEX_URL} failed with HTTP ${response.status}`);
    const index = (await response.json()) as MedicineIndex;
    return {
      medicines: decodeMedicineIndex(index),
      updatedAt: index.updatedAt,
      shortageList: index.shortageList,
    };
  })().catch((error: unknown) => {
    pending = null;
    throw error;
  });
  return pending;
}
