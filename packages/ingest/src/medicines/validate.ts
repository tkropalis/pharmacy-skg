import type { Warning } from '../registry/build.ts';
import { MedicinesSchema, type Medicines } from '../schema.ts';

export interface MedicinesReport {
  errors: Warning[];
  warnings: Warning[];
}

/**
 * Expected counts, from the lists of 2025–2026 (about 8,500 prescription packs in the December
 * 2025 revision plus a few hundred since, about 750 non-prescription ones). A count outside these
 * ranges means a parser or a source broke, e.g. a partial table taken for the base revision.
 */
const PRESCRIPTION_RANGE = [6000, 15000] as const;
const OTC_RANGE = [400, 3000] as const;
const SHORTAGE_RANGE = [20, 2000] as const;
/** Most packs on ΕΟΦ's list are priced; the rest are hospital-only or emergency imports. */
const MIN_SHORTAGE_MATCH = 0.5;

/** Checks the file the pipeline is about to publish. Errors block publishing. */
export function validateMedicines(file: Medicines, shortageEntries: number): MedicinesReport {
  const errors: Warning[] = [];
  const warnings: Warning[] = [];
  const error = (code: string, message: string) => errors.push({ code, message });

  const parsed = MedicinesSchema.safeParse(file);
  if (!parsed.success) error('schema', `medicines: ${parsed.error.message}`);

  const barcodes = new Set(file.medicines.map((m) => m.barcode));
  if (barcodes.size !== file.medicines.length) error('duplicate-barcode', 'barcodes repeat');

  const inRange = (code: string, what: string, n: number, [min, max]: readonly number[]) => {
    if (n < (min ?? 0) || n > (max ?? Infinity))
      error(code, `${n} ${what}, expected ${min}–${max}`);
  };
  inRange(
    'prescription-count',
    'prescription packs',
    file.medicines.filter((m) => !m.otc).length,
    PRESCRIPTION_RANGE,
  );
  inRange(
    'otc-count',
    'non-prescription packs',
    file.medicines.filter((m) => m.otc).length,
    OTC_RANGE,
  );

  if (file.shortageList) {
    inRange('shortage-count', 'packs on the shortage list', shortageEntries, SHORTAGE_RANGE);
    const matched = file.medicines.filter((m) => m.shortage !== null).length;
    if (matched < shortageEntries * MIN_SHORTAGE_MATCH) {
      error(
        'shortage-match',
        `only ${matched} of ${shortageEntries} packs on the shortage list have a price`,
      );
    }
  } else {
    warnings.push({ code: 'no-shortage-list', message: 'no ΕΟΦ shortage list was found' });
  }
  return { errors, warnings };
}
