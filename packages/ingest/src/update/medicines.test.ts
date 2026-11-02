import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import type { MedicinePrice } from '@pharmacy-skg/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachShortages } from '../medicines/assemble.ts';
import type { ShortageEntry } from '../medicines/shortages.ts';
import { MedicinesSchema, SCHEMA_VERSION, type Medicines } from '../schema.ts';
import type { ShortageListLink } from '../sources/eof.ts';
import { PRESCRIPTION_LISTING, type MohArticleLink } from '../sources/moh.ts';
import { medicinesPaths, readJson, writeIfChanged, type MedicinesPaths } from '../store.ts';
import type { Logger } from './logger.ts';
import { updateMedicines, type MedicinesSources } from './medicines.ts';

const BEFORE = '2026-10-20T08:00:00.000Z';
const NOW = new Date('2026-11-02T08:00:00.000Z');

let root: string;
let paths: MedicinesPaths;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'update-medicines-'));
  paths = medicinesPaths(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function recorder(): Logger & { logs: string[]; errors: string[] } {
  const logs: string[] = [];
  const errors: string[] = [];
  return { logs, errors, log: (m) => void logs.push(m), error: (m) => void errors.push(m) };
}

const barcode = (n: number) => String(5_000_000_000_000 + n);

const OLD_LIST: ShortageListLink = {
  title: 'ΛΙΣΤΑ ΦΑΡΜΑΚΕΥΤΙΚΩΝ ΣΚΕΥΑΣΜΑΤΩΝ ΠΕΡΙΟΡΙΣΜΕΝΗΣ ΔΙΑΘΕΣΙΜΟΤΗΤΑΣ 30 ΣΕΠΤΕΜΒΡΙΟΥ 2026',
  date: '2026-09-30',
  postUrl: 'https://www.eof.gr/post/1',
  fileUrl: 'https://www.eof.gr/files/2026-09-30.pdf',
};
const NEW_LIST: ShortageListLink = {
  title: 'ΛΙΣΤΑ ΦΑΡΜΑΚΕΥΤΙΚΩΝ ΣΚΕΥΑΣΜΑΤΩΝ ΠΕΡΙΟΡΙΣΜΕΝΗΣ ΔΙΑΘΕΣΙΜΟΤΗΤΑΣ 30 ΟΚΤΩΒΡΙΟΥ 2026',
  date: '2026-10-30',
  postUrl: 'https://www.eof.gr/post/2',
  fileUrl: 'https://www.eof.gr/files/2026-10-30.pdf',
};

const BULLETINS: Medicines['bulletins'] = [
  {
    id: '100/7',
    kind: 'prescription',
    title: 'Δελτίο αναθεωρημένων τιμών 2026',
    date: '2026-01-05',
    articleUrl: 'https://www.moh.gov.gr/articles/times-farmakwn/deltia-timwn/100-deltio',
    fileName: 'prices.xlsx',
    fileUrl: 'https://www.moh.gov.gr/articles/times-farmakwn/deltia-timwn/100-deltio?fdl=7',
  },
  {
    id: '200/8',
    kind: 'otc',
    title: 'Αναθεώρηση καταλόγου μη συνταγογραφούμενων',
    date: '2026-01-06',
    articleUrl: 'https://www.moh.gov.gr/articles/times-farmakwn/deltia-timwn-mhsyfa/200-mhsyfa',
    fileName: 'otc.xlsx',
    fileUrl: 'https://www.moh.gov.gr/articles/times-farmakwn/deltia-timwn-mhsyfa/200-mhsyfa?fdl=8',
  },
];

/** The ranges the validation expects: over 6,000 prescription packs, over 400 non-prescription. */
function pack(n: number, otc: boolean, shortage: MedicinePrice['shortage']): MedicinePrice {
  return {
    barcode: barcode(n),
    name: `Φάρμακο ${n}`,
    atc: 'N02BE01',
    substance: 'ΠΑΡΑΚΕΤΑΜΟΛΗ',
    company: 'ΕΤΑΙΡΕΙΑ',
    price: 2.5,
    otc,
    notReimbursed: false,
    bulletin: otc ? '200/8' : '100/7',
    shortage,
  };
}

/** A stored file on the 30 Sept shortage list, with the first 30 packs short. */
function stored(): Medicines {
  const medicines = [
    ...Array.from({ length: 6000 }, (_, n) =>
      pack(
        n,
        false,
        n < 30 ? { from: '2026-08-01', to: null, reason: 'ΠΑΡΑΓΩΓΙΚΟ ΠΡΟΒΛΗΜΑ' } : null,
      ),
    ),
    ...Array.from({ length: 400 }, (_, n) => pack(10_000 + n, true, null)),
  ];
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: BEFORE,
    bulletins: BULLETINS,
    shortageList: OLD_LIST,
    medicines,
  };
}

async function seed(file: Medicines = stored()): Promise<Medicines> {
  await writeIfChanged(paths.medicines, `${JSON.stringify(file, null, 2)}\n`);
  return file;
}

async function snapshot(dir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  async function walk(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else files[relative(dir, path)] = await readFile(path, 'utf8');
    }
  }
  await walk(dir);
  return files;
}

/** A shortage list of `count` packs, from the pack numbered `from` on. */
const shortageEntries = (from: number, count: number): ShortageEntry[] =>
  Array.from({ length: count }, (_, i) => ({
    barcode: barcode(from + i),
    from: '2026-10-01',
    to: '2026-12-31',
    reason: 'ΕΛΛΕΙΨΗ ΠΡΩΤΗΣ ΥΛΗΣ',
  }));

/** Sources that fail the way the ministry's site did for GitHub's runners. */
function ministryRefuses(overrides: Partial<MedicinesSources> = {}): {
  sources: MedicinesSources;
  calls: string[];
} {
  const calls: string[] = [];
  const sources: MedicinesSources = {
    listArticles: async (listing) => {
      calls.push(`listArticles ${listing}`);
      throw new Error(
        'HTTP 421 Misdirected Request for https://www.moh.gov.gr/articles/times-farmakwn (server: nginx)',
      );
    },
    articleFiles: async () => {
      throw new Error('not expected');
    },
    findShortageList: async () => {
      calls.push('findShortageList');
      return NEW_LIST;
    },
    readShortageList: async (link) => {
      calls.push(`readShortageList ${link.fileUrl}`);
      return shortageEntries(100, 25);
    },
    getBytes: async () => {
      throw new Error('not expected');
    },
    ...overrides,
  };
  return { sources, calls };
}

const run = (sources: MedicinesSources, logger: Logger, force = false) =>
  updateMedicines({ sources, paths, force, logger, now: () => NOW });

describe('updateMedicines when the ministry cannot be read', () => {
  it('keeps the stored prices, applies the current shortage list and fails', async () => {
    const before = await seed();
    const logger = recorder();
    const { sources, calls } = ministryRefuses();

    expect(await run(sources, logger)).toBe(1);

    expect(calls).toEqual([
      `listArticles ${PRESCRIPTION_LISTING}`,
      'findShortageList',
      `readShortageList ${NEW_LIST.fileUrl}`,
    ]);
    expect(logger.errors).toEqual([
      'error [bulletins] not read, the stored prices were kept: Error: HTTP 421 Misdirected Request ' +
        'for https://www.moh.gov.gr/articles/times-farmakwn (server: nginx)',
    ]);
    const after = await readJson(paths.medicines, MedicinesSchema);
    // The prices and the bulletins are the stored ones...
    expect(after?.bulletins).toEqual(before.bulletins);
    expect(after?.medicines.map((m) => [m.barcode, m.price, m.bulletin])).toEqual(
      before.medicines.map((m) => [m.barcode, m.price, m.bulletin]),
    );
    // ...and the shortages are the new list's, not the old one's.
    const expected = attachShortages(before.medicines, shortageEntries(100, 25));
    expect(after?.medicines).toEqual(expected.medicines);
    expect(after?.medicines.filter((m) => m.shortage).map((m) => m.barcode)).toEqual(
      shortageEntries(100, 25).map((e) => e.barcode),
    );
    expect(after?.shortageList).toEqual(NEW_LIST);
    expect(after?.updatedAt).toBe(NOW.toISOString());
    expect(logger.logs).toContain(
      '6400 packs (400 non-prescription), 25 on the shortage list (0 without a price)',
    );
    expect(logger.logs).toContain('Medicines updated.');
  });

  it('writes nothing when the shortage list is the one already applied', async () => {
    await seed({ ...stored(), shortageList: NEW_LIST });
    const files = await snapshot(root);
    const logger = recorder();
    const { sources, calls } = ministryRefuses();

    expect(await run(sources, logger)).toBe(1);

    expect(await snapshot(root)).toEqual(files);
    expect(calls).toEqual([`listArticles ${PRESCRIPTION_LISTING}`, 'findShortageList']);
    expect(logger.logs).toContain('No new shortage list. No changes.');
    expect(logger.errors).toHaveLength(1);
    expect(logger.errors[0]).toContain('error [bulletins] not read, the stored prices were kept');
  });

  it('applies the list again with force', async () => {
    await seed({ ...stored(), shortageList: NEW_LIST });
    const logger = recorder();
    const { sources, calls } = ministryRefuses();
    expect(await run(sources, logger, true)).toBe(1);
    expect(calls).toContain(`readShortageList ${NEW_LIST.fileUrl}`);
    expect(logger.logs).toContain('Medicines updated.');
  });

  it('writes nothing when the new shortage list fails validation', async () => {
    await seed();
    const files = await snapshot(root);
    const logger = recorder();
    // Five packs on a list that should have at least twenty: a misread, not a short month.
    const { sources } = ministryRefuses({ readShortageList: async () => shortageEntries(100, 5) });

    expect(await run(sources, logger)).toBe(1);

    expect(await snapshot(root)).toEqual(files);
    expect(logger.errors).toContain(
      'error [shortage-count] 5 packs on the shortage list, expected 20–2000',
    );
    expect(logger.errors).toContain('Validation failed with 1 errors; nothing was written.');
  });

  it('throws when there are no stored prices to keep', async () => {
    const { sources } = ministryRefuses();
    await expect(run(sources, recorder())).rejects.toThrow('HTTP 421 Misdirected Request');
    expect(await readJson(paths.medicines, MedicinesSchema)).toBeUndefined();
  });
});

describe('updateMedicines when the ministry can be read', () => {
  const article = (id: number, listing: string, slug: string, title: string): MohArticleLink => ({
    id,
    url: `${listing}/${id}-${slug}`,
    title,
    date: id === 100 ? '2026-01-05' : '2026-01-06',
  });

  function ministryAnswers(downloads: string[]): MedicinesSources {
    return {
      listArticles: async (listing) =>
        listing === PRESCRIPTION_LISTING
          ? [article(100, listing, 'deltio', 'Δελτίο αναθεωρημένων τιμών 2026')]
          : [article(200, listing, 'mhsyfa', 'Αναθεώρηση καταλόγου μη συνταγογραφούμενων')],
      articleFiles: async (found) => [
        found.id === 100
          ? { id: 7, name: 'prices.xlsx', url: `${found.url}?fdl=7` }
          : { id: 8, name: 'otc.xlsx', url: `${found.url}?fdl=8` },
      ],
      findShortageList: async () => OLD_LIST,
      readShortageList: async () => {
        throw new Error('not expected');
      },
      getBytes: async (url) => {
        downloads.push(url);
        throw new Error('not expected');
      },
    };
  }

  it('changes nothing when neither the bulletins nor the shortage list changed', async () => {
    await seed();
    const onDisk = await readFile(paths.medicines, 'utf8');
    const downloads: string[] = [];
    const logger = recorder();

    expect(await run(ministryAnswers(downloads), logger)).toBe(0);

    expect(logger.logs).toContain('No new bulletins or shortage list. No changes.');
    expect(downloads).toEqual([]);
    expect(logger.errors).toEqual([]);
    expect(await readFile(paths.medicines, 'utf8')).toBe(onDisk);
    // Only the cache of article attachments is new.
    expect(Object.keys(await snapshot(root)).sort()).toEqual([
      'medicines/inputs/moh-article-files.json',
      'medicines/medicines.json',
    ]);
  });

  it('downloads and rebuilds when the shortage list is new', async () => {
    await seed();
    const downloads: string[] = [];
    const sources = {
      ...ministryAnswers(downloads),
      findShortageList: async () => NEW_LIST,
    };
    // The tables are not .xlsx files here, so reading them fails: what matters is that it tried.
    await expect(run(sources, recorder())).rejects.toThrow('not expected');
    expect(downloads).toEqual([BULLETINS[0]?.fileUrl]);
  });
});
