import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { LARISA } from '@pharmacy-skg/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  locationKey,
  type CityPipeline,
  type FetchContext,
  type FetchedDutyLists,
  type ListedLocation,
} from '../cities/pipeline.ts';
import type { DutyEntry, DutyList } from '../fsth/parse.ts';
import {
  MetaSchema,
  PharmaciesSchema,
  SCHEMA_VERSION,
  type ExtendedHours,
  type Meta,
} from '../schema.ts';
import { cityPaths, readJson, toJson, writeIfChanged, type CityPaths } from '../store.ts';
import { BlockedError } from '../sources/http.ts';
import type { Logger } from './logger.ts';
import { updateCity, type UpdateCityOptions } from './city.ts';
import { runUpdate } from './run.ts';

const TODAY = '2026-11-02';
const TOMORROW = '2026-11-03';
const NOW = new Date('2026-11-02T08:00:00.000Z');
const BEFORE = '2026-10-30T08:00:00.000Z';

let root: string;
let paths: CityPaths;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'update-city-'));
  paths = cityPaths(LARISA.id, root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** A logger that keeps what it is told. */
function recorder(): Logger & { logs: string[]; errors: string[] } {
  const logs: string[] = [];
  const errors: string[] = [];
  return { logs, errors, log: (m) => void logs.push(m), error: (m) => void errors.push(m) };
}

const FIRST: DutyEntry = {
  locality: 'ΛΑΡΙΣΑ',
  name: 'ΦΑΡΜΑΚΕΙΟ ΠΡΩΤΟ',
  address: 'ΚΕΝΤΡΙΚΗ 1',
  phone: '2410111111',
};

function dutyList(date: string, entries: readonly DutyEntry[] = [FIRST]): DutyList {
  return {
    groupId: 'g',
    groupName: 'Ομάδα',
    date,
    sections: [
      {
        kind: 'day',
        heading: 'Διημερεύοντα',
        hours: { from: '08:00', to: '21:00', toNextDay: false },
        extraHours: [],
        notes: [],
        entries,
      },
    ],
  };
}

const LOCATION: ListedLocation = { lat: 39.64, lon: 22.42, ref: 'https://example.gr/details/1' };

/** The day's list, and where the first pharmacy is. */
function published(date: string, withLocation = true): FetchedDutyLists {
  return {
    items: [
      {
        list: dutyList(date),
        source: { url: 'https://example.gr/list.pdf', uploadedAt: '2026-11-02T06:00:00.000Z' },
      },
    ],
    failures: [],
    ...(withLocation ? { locations: new Map([[FIRST.phone, LOCATION]]) } : {}),
  };
}

function pipeline(overrides: Partial<CityPipeline> = {}): CityPipeline {
  return {
    city: LARISA,
    sources: [{ id: 'src', name: { el: 'Πηγή', en: 'Source' }, url: 'https://example.gr/' }],
    sourceIds: { duty: 'src', extended: 'src' },
    fetchDutyLists: async () => published(TODAY),
    fetchExtendedHours: async () => ({ items: [], failures: [] }),
    geocoding: {},
    rules: {
      groupIds: ['g'],
      sectionRange: () => [1, 10],
      pharmacies: [1, 10],
      minExtendedEntries: null,
    },
    ...overrides,
  };
}

/** What a run before this one left: a meta.json, last checked on 30 Oct. */
async function seedMeta(): Promise<Meta> {
  const meta: Meta = {
    schemaVersion: SCHEMA_VERSION,
    city: LARISA.id,
    updatedAt: BEFORE,
    checkedAt: BEFORE,
    duties: null,
    extendedHours: [],
    sources: [{ id: 'src', name: { el: 'Πηγή', en: 'Source' }, url: 'https://example.gr/' }],
  };
  await writeIfChanged(paths.meta, toJson(meta));
  return meta;
}

const STORED_EXTENDED_FILE = '2026-11-01_2026-11-30.json';

/** A stored extended-hours list for November that names the first pharmacy. */
async function seedExtended(): Promise<ExtendedHours> {
  const list: ExtendedHours = {
    schemaVersion: SCHEMA_VERSION,
    period: { from: '2026-11-01', to: '2026-11-30' },
    title: 'ΠΙΝΑΚΑΣ ΔΙΕΥΡΥΜΕΝΟΥ ΩΡΑΡΙΟΥ',
    announcementUrl: 'https://example.gr/post',
    source: { url: 'https://example.gr/table.pdf', uploadedAt: '2026-10-25T08:00:00.000Z' },
    entries: [
      {
        pharmacyId: FIRST.phone,
        name: FIRST.name,
        address: FIRST.address,
        postcode: '41222',
        area: 'ΛΑΡΙΣΑ',
        schedule: { type: 'weekly', days: { '1': [{ from: '08:00', to: '21:00' }] } },
        scheduleText: 'Δευτέρα 08:00-21:00',
      },
    ],
  };
  await writeIfChanged(join(paths.extendedHours, STORED_EXTENDED_FILE), toJson(list));
  return list;
}

/** Every file under `dir` with its content, by path. */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else files[relative(dir, path)] = await readFile(path, 'utf8');
    }
  }
  await walk(dir);
  return files;
}

const run = (options: Partial<UpdateCityOptions> & Pick<UpdateCityOptions, 'logger'>) =>
  updateCity({
    pipeline: pipeline(),
    paths,
    today: TODAY,
    since: '2026-10-30',
    offline: true,
    now: () => NOW,
    ...options,
  });

describe('updateCity', () => {
  it('writes the duty lists, the registry and meta.json, and has no changes the second time', async () => {
    const logger = recorder();
    let context: FetchContext | undefined;
    const fetchExtendedHours: CityPipeline['fetchExtendedHours'] = async (c) => {
      context = c;
      return { items: [], failures: [] };
    };
    await seedExtended();

    expect(await run({ logger, pipeline: pipeline({ fetchExtendedHours }) })).toBe('current');
    expect(logger.errors).toEqual([]);
    expect(logger.logs).toContain('larisa: data updated.');
    expect(context?.today).toBe(TODAY);
    expect(context?.since).toBe('2026-10-30');
    expect([...(context?.extendedFiles.keys() ?? [])]).toEqual([STORED_EXTENDED_FILE]);

    expect(Object.keys(await snapshot(root)).sort()).toEqual([
      `larisa/duties/${TODAY}.json`,
      `larisa/extended-hours/${STORED_EXTENDED_FILE}`,
      'larisa/inputs/geocode-cache.json',
      'larisa/inputs/listed-locations.json',
      'larisa/meta.json',
      'larisa/pharmacies.json',
    ]);
    const pharmacies = await readJson(paths.pharmacies, PharmaciesSchema);
    expect(pharmacies?.pharmacies.map((p) => [p.id, p.location?.source])).toEqual([
      [FIRST.phone, 'list'],
    ]);
    const meta = await readJson(paths.meta, MetaSchema);
    expect(meta).toMatchObject({
      city: 'larisa',
      updatedAt: NOW.toISOString(),
      checkedAt: NOW.toISOString(),
      duties: { from: TODAY, to: TODAY },
      extendedHours: [
        { from: '2026-11-01', to: '2026-11-30', file: `extended-hours/${STORED_EXTENDED_FILE}` },
      ],
    });

    // The same lists again, an hour later: the data is checked, not changed.
    const again = recorder();
    const later = new Date(NOW.getTime() + 3_600_000);
    expect(await run({ logger: again, now: () => later })).toBe('current');
    expect(again.logs).toContain('larisa: no changes.');
    const second = await readJson(paths.meta, MetaSchema);
    expect(second?.updatedAt).toBe(NOW.toISOString());
    expect(second?.checkedAt).toBe(later.toISOString());
  });

  it('places an entry printed without a phone by the coordinates the list gave for its locality and name', async () => {
    const unphoned: DutyEntry = { ...FIRST, phone: '', name: 'ΦΑΡΜΑΚΕΙΟ ΔΕΥΤΕΡΟ' };
    const fetchDutyLists: CityPipeline['fetchDutyLists'] = async () => ({
      items: [
        {
          list: dutyList(TODAY, [FIRST, unphoned]),
          source: { url: 'https://example.gr/list.pdf', uploadedAt: '2026-11-02T06:00:00.000Z' },
        },
      ],
      failures: [],
      locations: new Map([
        [FIRST.phone, LOCATION],
        [locationKey(unphoned), { lat: 39.7, lon: 22.5, ref: 'https://example.gr/details/2' }],
      ]),
    });

    expect(await run({ logger: recorder(), pipeline: pipeline({ fetchDutyLists }) })).toBe(
      'current',
    );
    const pharmacies = (await readJson(paths.pharmacies, PharmaciesSchema))?.pharmacies ?? [];
    expect(pharmacies).toHaveLength(2);
    const second = pharmacies.find((p) => p.name === unphoned.name);
    // An id from its name, not the first pharmacy's; the coordinates are the list's.
    expect(second?.id).toMatch(/^x-/);
    expect(second?.phone).toBeNull();
    expect(second?.location).toMatchObject({ lat: 39.7, lon: 22.5, source: 'list' });
  });

  it('keeps the stored extended hours and writes the duty lists when the extended hours cannot be read', async () => {
    const stored = await seedExtended();
    await seedMeta();
    const logger = recorder();
    const unreachable = pipeline({
      fetchExtendedHours: async () => {
        throw new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND fsa.gr') });
      },
    });

    expect(await run({ logger, pipeline: unreachable })).toBe('waiting');

    expect(logger.errors).toEqual([
      'warning [extended-hours] larisa: its site does not answer this network; the stored lists were kept: ' +
        'TypeError: fetch failed: Error: getaddrinfo ENOTFOUND fsa.gr',
    ]);
    // The duty lists went through...
    const files = await snapshot(root);
    expect(files[`larisa/duties/${TODAY}.json`]).toBeDefined();
    expect(JSON.parse(files['larisa/pharmacies.json'] ?? '{}').pharmacies).toHaveLength(1);
    // ...and the stored list is still there, matched to the pharmacy the new duty list names.
    expect(JSON.parse(files[`larisa/extended-hours/${STORED_EXTENDED_FILE}`] ?? '{}')).toEqual(
      stored,
    );
    const meta = await readJson(paths.meta, MetaSchema);
    expect(meta?.extendedHours.map((e) => e.file)).toEqual([
      `extended-hours/${STORED_EXTENDED_FILE}`,
    ]);
    expect(meta?.duties).toEqual({ from: TODAY, to: TODAY });
  });

  it('fails when the extended hours were reached and could not be read', async () => {
    await seedExtended();
    const logger = recorder();
    const unread = pipeline({
      fetchExtendedHours: async () => {
        throw new Error('no table on the page');
      },
    });
    expect(await run({ logger, pipeline: unread })).toBe('failed');
    expect(logger.errors).toEqual([
      'error [extended-hours] larisa: not read, the stored lists were kept: Error: no table on the page',
    ]);
  });

  it('writes what it read but keeps checkedAt when no list covers today, and waits', async () => {
    const before = await seedMeta();
    const logger = recorder();
    const quiet = pipeline({ fetchDutyLists: async () => published(TOMORROW) });

    expect(await run({ logger, pipeline: quiet })).toBe('waiting');

    expect(logger.errors).toEqual([
      `warning [coverage] larisa: no duty list for today, ${TODAY}: its source has published none; the stored data is kept and goes stale`,
    ]);
    const files = await snapshot(root);
    expect(files[`larisa/duties/${TOMORROW}.json`]).toBeDefined();
    expect(files['larisa/pharmacies.json']).toBeDefined();
    const meta = await readJson(paths.meta, MetaSchema);
    expect(meta?.checkedAt).toBe(before.checkedAt);
    // What was read did change the data, so that moved.
    expect(meta?.updatedAt).toBe(NOW.toISOString());
    expect(meta?.duties).toEqual({ from: TOMORROW, to: TOMORROW });
  });

  it('falls back to updatedAt for checkedAt when meta.json predates it', async () => {
    const before = await seedMeta();
    const old = { ...before, checkedAt: undefined };
    await writeIfChanged(paths.meta, toJson(old));
    const quiet = pipeline({ fetchDutyLists: async () => published(TOMORROW) });
    expect(await run({ logger: recorder(), pipeline: quiet })).toBe('waiting');
    expect((await readJson(paths.meta, MetaSchema))?.checkedAt).toBe(before.updatedAt);
  });

  it('writes nothing but the geocoding cache when the city fails validation', async () => {
    await seedMeta();
    await seedExtended();
    const stored = await snapshot(root);
    const logger = recorder();
    // No coordinates anywhere, and offline: the pharmacy cannot be placed.
    const unlocated = pipeline({ fetchDutyLists: async () => published(TODAY, false) });

    expect(await run({ logger, pipeline: unlocated })).toBe('failed');

    expect(logger.errors).toEqual([
      `error [no-location] ${TODAY} g: ${FIRST.phone} ${FIRST.name}, ${FIRST.address}`,
      'larisa: validation failed with 1 errors; nothing was written.',
    ]);
    expect(await snapshot(root)).toEqual({
      ...stored,
      'larisa/inputs/geocode-cache.json': '{}\n',
    });
  });

  it('keeps the coordinates and the roster it read when the city fails validation', async () => {
    await seedMeta();
    const stored = await snapshot(root);
    const logger = recorder();
    const roster = {
      sweptAt: TODAY,
      readThrough: '2027-05-01',
      entries: [
        {
          groupId: 'g',
          date: TODAY,
          locality: 'ΛΑΡΙΣΑ',
          name: 'ΦΑΡΜΑΚΕΙΟ ΔΕΥΤΕΡΟ',
          address: 'ΚΕΝΤΡΙΚΗ 2',
          phone: '2410222222',
          location: null,
        },
      ],
    };
    // Two pharmacies where the rules expect at most one.
    const tooMany = pipeline({
      fetchDutyLists: async () => ({ ...published(TODAY), roster }),
      rules: { ...pipeline().rules, pharmacies: [1, 1] },
    });

    expect(await run({ logger, pipeline: tooMany })).toBe('failed');

    expect(logger.errors).toEqual([
      'error [count] 2 pharmacies, expected 1–1',
      'larisa: validation failed with 1 errors; nothing was written.',
    ]);
    const after = await snapshot(root);
    expect(Object.keys(after).sort()).toEqual([
      'larisa/inputs/geocode-cache.json',
      'larisa/inputs/listed-locations.json',
      'larisa/inputs/roster.json',
      'larisa/meta.json',
    ]);
    expect(after['larisa/meta.json']).toBe(stored['larisa/meta.json']);
    expect(JSON.parse(after['larisa/inputs/listed-locations.json'] ?? '{}')).toEqual({
      [FIRST.phone]: LOCATION,
    });
  });

  it('does not publish a list whose counts look wrong; the others go through', async () => {
    const logger = recorder();
    const strict = pipeline({
      rules: { ...pipeline().rules, sectionRange: () => [2, 10], pharmacies: [0, 10] },
    });
    // The only list has one entry where two are expected: it is left out, and so is today.
    expect(await run({ logger, pipeline: strict })).toBe('failed');
    expect(logger.logs).toContain(
      `warning [count] ${TODAY} g day: 1 entries, expected 2–10: not published (https://example.gr/list.pdf)`,
    );
    expect(logger.errors).toEqual([`error [coverage] larisa: no duty list for today, ${TODAY}`]);
    expect(Object.keys(await snapshot(root))).not.toContain(`larisa/duties/${TODAY}.json`);
  });
});

describe('runUpdate', () => {
  const second = (overrides: Partial<CityPipeline> = {}): CityPipeline =>
    pipeline({ city: { ...LARISA, id: 'second' }, ...overrides });
  const options = (logger: Logger, chosen: CityPipeline[], cities?: string[]) => ({
    pipelines: chosen,
    ...(cities ? { cities } : {}),
    today: TODAY,
    since: '2026-10-30',
    offline: true,
    logger,
    now: () => NOW,
    pathsFor: (id: string) => cityPaths(id, root),
  });

  it('exits 0 when every city is current', async () => {
    const logger = recorder();
    expect(await runUpdate(options(logger, [pipeline(), second()]))).toBe(0);
    expect(logger.logs.filter((m) => m.startsWith('---'))).toEqual(['--- larisa', '--- second']);
  });

  it('exits 2 for a city that is not covered, before reading anything', async () => {
    const logger = recorder();
    let fetched = false;
    const spy = pipeline({
      fetchDutyLists: async () => {
        fetched = true;
        return published(TODAY);
      },
    });
    expect(await runUpdate(options(logger, [spy], ['larisa', 'atlantis']))).toBe(2);
    expect(logger.errors).toEqual(['Unknown city: atlantis']);
    expect(fetched).toBe(false);
  });

  it('reports a city whose site does not answer as a warning, keeping its data, and exits 0', async () => {
    const logger = recorder();
    const warnings: string[] = [];
    const down = pipeline({
      fetchDutyLists: async () => {
        throw new TypeError('fetch failed', { cause: new Error('ECONNRESET') });
      },
    });
    const code = await runUpdate({
      ...options(logger, [down, second()]),
      logger: { ...logger, warn: (m: string) => void warnings.push(m) },
    });
    expect(code).toBe(0);
    expect(warnings).toEqual([
      'warning [unreachable] larisa: its site does not answer this network; the stored data is kept and goes stale: TypeError: fetch failed: Error: ECONNRESET',
    ]);
    expect(logger.errors).toEqual([]);
    expect(await readJson(cityPaths('second', root).meta, MetaSchema)).toBeDefined();
    expect(await readJson(cityPaths('larisa', root).meta, MetaSchema)).toBeUndefined();
  });

  it('exits 0 when a source has published nothing for today', async () => {
    const logger = recorder();
    const quiet = second({ fetchDutyLists: async () => published(TOMORROW) });
    expect(await runUpdate(options(logger, [pipeline(), quiet]))).toBe(0);
    expect(logger.errors).toEqual([
      `warning [coverage] second: no duty list for today, ${TODAY}: its source has published none; the stored data is kept and goes stale`,
    ]);
  });

  it('reports a city that throws and still updates the others, exiting 1', async () => {
    const logger = recorder();
    const broken = pipeline({
      fetchDutyLists: async () => {
        throw new Error('no table on the page');
      },
    });
    expect(await runUpdate(options(logger, [broken, second()]))).toBe(1);
    expect(logger.errors).toEqual(['larisa: Error: no table on the page']);
    expect(await readJson(cityPaths('second', root).meta, MetaSchema)).toBeDefined();
    expect(await readJson(cityPaths('larisa', root).meta, MetaSchema)).toBeUndefined();
  });

  it('reports a city whose site blocks the run as a warning, keeping its data, and exits 0', async () => {
    const logger = recorder();
    const warnings: string[] = [];
    const blocked = pipeline({
      fetchDutyLists: async () => {
        throw new BlockedError(
          'HTTP 403 Forbidden for https://www.efimeria.gr/All (server: cloudflare; cf-mitigated: challenge): Just a moment...',
        );
      },
    });
    const code = await runUpdate({
      ...options(logger, [blocked, second()]),
      logger: { ...logger, warn: (m: string) => void warnings.push(m) },
    });
    expect(code).toBe(0);
    expect(warnings).toEqual([
      'warning [blocked] larisa: its site answers this network with a bot challenge; the stored data is kept and goes stale: BlockedError: HTTP 403 Forbidden for https://www.efimeria.gr/All (server: cloudflare; cf-mitigated: challenge): Just a moment...',
    ]);
    expect(logger.errors).toEqual([]);
    expect(await readJson(cityPaths('larisa', root).meta, MetaSchema)).toBeUndefined();
    expect(await readJson(cityPaths('second', root).meta, MetaSchema)).toBeDefined();
  });

  it('still exits 1 for a city that fails when another is only blocked', async () => {
    const logger = recorder();
    const blocked = pipeline({
      fetchDutyLists: async () => {
        throw new Error('read failed', { cause: new BlockedError('HTTP 403 Forbidden') });
      },
    });
    const broken = second({
      fetchDutyLists: async () => {
        throw new Error('no table on the page');
      },
    });
    expect(await runUpdate(options(logger, [blocked, broken]))).toBe(1);
    expect(logger.errors[0]).toMatch(/^warning \[blocked\] larisa: /);
  });

  it('exits 1 when a city fails validation, and runs only the chosen cities', async () => {
    const logger = recorder();
    const strict = second({
      rules: { ...pipeline().rules, sectionRange: () => [2, 10], pharmacies: [0, 10] },
    });
    expect(await runUpdate(options(logger, [pipeline(), strict], ['second']))).toBe(1);
    expect(logger.logs.filter((m) => m.startsWith('---'))).toEqual(['--- second']);
    expect(await readJson(cityPaths('larisa', root).meta, MetaSchema)).toBeUndefined();
  });
});
