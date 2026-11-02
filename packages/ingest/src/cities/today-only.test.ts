/**
 * Achaia and Corfu show only today's duty list. These run the real update on a temporary
 * directory with their real fixtures: a day's list is stored under the page's own date, the
 * earlier days stay, tomorrow's list is not asked for, and yesterday's list is never taken for
 * today's.
 */
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ACHAIA, CORFU } from '@pharmacy-skg/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCorfuDuties, parseCorfuMembers } from '../corfu/parse.ts';
import { parseEfimeriaPage, type EfimeriaPage } from '../efimeria/parse.ts';
import {
  DutyDaySchema,
  ExtendedHoursSchema,
  MetaSchema,
  PharmaciesSchema,
  type DutyDay,
} from '../schema.ts';
import { cityPaths, readJson, toJson, writeIfChanged, type CityPaths } from '../store.ts';
import { updateCity } from '../update/city.ts';
import type { Logger } from '../update/logger.ts';
import { achaiaPipeline, EXTENDED_FILE } from './achaia.ts';
import { corfuPipeline } from './corfu.ts';

const fixture = (name: string) =>
  readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8');

const NOON = new Date('2026-11-02T10:00:00.000Z');
let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'today-only-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function recorder(): Logger & { logs: string[]; errors: string[] } {
  const logs: string[] = [];
  const errors: string[] = [];
  return { logs, errors, log: (m) => void logs.push(m), error: (m) => void errors.push(m) };
}

async function days(paths: CityPaths): Promise<string[]> {
  return (await readdir(paths.duties).catch(() => [])).sort();
}

describe('Achaia', () => {
  const monday = parseEfimeriaPage(fixture('efimeria/2026-11-02_All.html'));
  const paths = () => cityPaths(ACHAIA.id, root);

  /** The page on another day: the same pharmacies, one day further down the rota. */
  function pageOn(date: string, rotate = true): EfimeriaPage {
    const [first, ...rest] = monday.pharmacies;
    return {
      ...monday,
      date,
      pharmacies:
        rotate && first
          ? [...rest, { ...first, id: first.id + 1000, name: `${first.name} Β` }]
          : monday.pharmacies,
    };
  }

  const run = (page: EfimeriaPage, today: string, logger = recorder()) =>
    updateCity({
      pipeline: achaiaPipeline(() => ({ page: async () => page, requests: 1 })),
      paths: paths(),
      today,
      since: today,
      offline: true,
      logger,
      now: () => NOON,
    }).then((ok) => ({ ok, logger }));

  it('stores today under the page date, with the coordinates and the longer hours', async () => {
    const { ok, logger } = await run(monday, '2026-11-02');
    expect(logger.errors).toEqual([]);
    expect(ok).toBe(true);
    expect(await days(paths())).toEqual(['2026-11-02.json']);

    const day = await readJson(join(paths().duties, '2026-11-02.json'), DutyDaySchema);
    const entries = day?.groups[0]?.sections.flatMap((s) => s.entries) ?? [];
    expect(day?.groups.map((g) => g.id)).toEqual(['achaia']);
    expect(new Set(entries.map((e) => e.pharmacyId)).size).toBe(16);

    // Every pharmacy on duty is placed by the coordinates the page gives.
    const registry = await readJson(paths().pharmacies, PharmaciesSchema);
    const onDuty = registry?.pharmacies.filter((p) => p.groupId === 'achaia') ?? [];
    expect(onDuty).toHaveLength(16);
    expect(onDuty.every((p) => p.location?.source === 'list')).toBe(true);
    expect(onDuty.find((p) => p.name === 'ΤΟΥΜΠΟΥΛΗΣ ΓΕΩΡΓΙΟΣ')).toMatchObject({
      id: '2693023100',
      phone: '2693023100',
      locality: 'Δύμη',
    });
    // The town's pharmacies print no phone: a stable id of their own.
    expect(onDuty.find((p) => p.name === 'ΚΟΜΝΗΝΟΣ ΓΕΩΡΓΙΟΣ')?.id).toMatch(/^x-[0-9a-f]{10}$/);

    // The longer hours: one file, matched to the pharmacies on duty where they are the same.
    const extended = await readJson(
      join(paths().extendedHours, EXTENDED_FILE),
      ExtendedHoursSchema,
    );
    expect(extended?.period).toEqual({ from: '2026-11-02', to: '2026-11-09' });
    expect(extended?.entries.length).toBeGreaterThan(40);
    const kominos = extended?.entries.find((e) => e.name === 'ΚΟΜΝΗΝΟΣ ΓΕΩΡΓΙΟΣ');
    expect(kominos?.pharmacyId).toBe(onDuty.find((p) => p.name === 'ΚΟΜΝΗΝΟΣ ΓΕΩΡΓΙΟΣ')?.id);

    const meta = await readJson(paths().meta, MetaSchema);
    expect(meta?.duties).toEqual({ from: '2026-11-02', to: '2026-11-02' });
    expect(meta?.extendedHours).toEqual([
      { from: '2026-11-02', to: '2026-11-09', file: 'extended-hours/efimeria.json' },
    ]);
    expect(meta?.checkedAt).toBe(NOON.toISOString());
  });

  it('does not ask for tomorrow, and warns of nothing for lacking it', async () => {
    const { logger } = await run(monday, '2026-11-02');
    expect(logger.logs.filter((l) => /latest duty list|coverage/.test(l))).toEqual([]);
  });

  it('changes nothing when run again on the same page', async () => {
    await run(monday, '2026-11-02');
    const before = await readFile(join(paths().duties, '2026-11-02.json'), 'utf8');
    const { logger } = await run(monday, '2026-11-02');
    expect(logger.logs).toContain('achaia: no changes.');
    expect(await readFile(join(paths().duties, '2026-11-02.json'), 'utf8')).toBe(before);
  });

  it("adds the next day's list and keeps the day before", async () => {
    await run(monday, '2026-11-02');
    const { ok } = await run(pageOn('2026-11-03'), '2026-11-03');
    expect(ok).toBe(true);
    expect(await days(paths())).toEqual(['2026-11-02.json', '2026-11-03.json']);
    const meta = await readJson(paths().meta, MetaSchema);
    expect(meta?.duties).toEqual({ from: '2026-11-02', to: '2026-11-03' });
    // The longer hours are the same, so they keep their first day and move their end.
    const extended = await readJson(
      join(paths().extendedHours, EXTENDED_FILE),
      ExtendedHoursSchema,
    );
    expect(extended?.period).toEqual({ from: '2026-11-02', to: '2026-11-10' });
  });

  it("does not take yesterday's list for today's: the same list under a new date is refused", async () => {
    await run(monday, '2026-11-02');
    const { ok, logger } = await run(pageOn('2026-11-03', false), '2026-11-03');
    expect(ok).toBe(false);
    expect(logger.errors.join('\n')).toMatch(/no duty list for today, 2026-11-03/);
    expect(logger.logs.join('\n')).toMatch(
      /repeated-list\] 2026-11-03 achaia: the same list as 2026-11-02/,
    );
    expect(await days(paths())).toEqual(['2026-11-02.json']);
    // And the data is not counted as checked: the stale-data banner will show in time.
    const meta = await readJson(paths().meta, MetaSchema);
    expect(meta?.checkedAt).toBe(NOON.toISOString());
  });

  it('keeps checkedAt back when the page still shows yesterday, and says so', async () => {
    await run(monday, '2026-11-02');
    const later = new Date('2026-11-03T04:20:00.000Z');
    const logger = recorder();
    const ok = await updateCity({
      pipeline: achaiaPipeline(() => ({ page: async () => monday, requests: 1 })),
      paths: paths(),
      today: '2026-11-03',
      since: '2026-11-03',
      offline: true,
      logger,
      now: () => later,
    });
    expect(ok).toBe(false);
    expect(logger.logs.join('\n')).toMatch(
      /\[page-date\] efimeria.gr shows 2026-11-02 12:25:21 on 2026-11-03/,
    );
    expect(logger.errors.join('\n')).toMatch(/no duty list for today, 2026-11-03/);
    expect((await readJson(paths().meta, MetaSchema))?.checkedAt).toBe(NOON.toISOString());
  });

  it('reads no list from a page dated more than a day away', async () => {
    const logger = recorder();
    const ok = await updateCity({
      pipeline: achaiaPipeline(() => ({ page: async () => pageOn('2026-12-25'), requests: 1 })),
      paths: paths(),
      today: '2026-11-02',
      since: '2026-11-02',
      offline: true,
      logger,
      now: () => NOON,
    });
    expect(ok).toBe(false);
    expect(await days(paths())).toEqual([]);
    expect(logger.logs.join('\n')).toMatch(/\[page-date\] efimeria.gr shows 2026-12-25/);
  });

  it('puts the night pharmacy on duty until 08:30 in the stored list', async () => {
    await run(monday, '2026-11-02');
    const day: DutyDay | undefined = await readJson(
      join(paths().duties, '2026-11-02.json'),
      DutyDaySchema,
    );
    const night = day?.groups[0]?.sections.find((s) => s.heading.includes('+'));
    expect(night?.hours).toEqual({ from: '21:00', to: '08:30', toNextDay: true });
  });
});

describe('Corfu', () => {
  const duties = parseCorfuDuties(fixture('corfu/2026-11-02_phduties.html'));
  const members = parseCorfuMembers(fixture('corfu/2026-11-02_members.html'));
  const paths = () => cityPaths(CORFU.id, root);

  /** Overture's snapshot, as a file: the phone places a pharmacy (the pages print no coordinates). */
  async function seedOverture(phones: readonly string[]) {
    await writeIfChanged(
      paths().overture,
      toJson(
        phones.map((phone, i) => ({
          id: `overture-${i}`,
          name: null,
          phone: `+30${phone}`,
          address: null,
          locality: null,
          confidence: 0.9,
          lat: 39.6 + i / 1000,
          lon: 19.9 + i / 1000,
        })),
      ),
    );
  }

  let requests = { duties: 0, members: 0 };
  const client =
    (page = duties) =>
    () => ({
      duties: async () => {
        requests.duties++;
        return page;
      },
      members: async () => {
        requests.members++;
        return members;
      },
      requests: 1,
    });

  const run = (today: string, page = duties, logger = recorder()) =>
    updateCity({
      pipeline: corfuPipeline({
        site: client(page),
        diavgeia: () => ({
          extendedDecisions: async () => [],
          document: async () => new Uint8Array(),
          requests: 0,
        }),
      }),
      paths: paths(),
      today,
      since: today,
      offline: true,
      logger,
      now: () => NOON,
    }).then((ok) => ({ ok, logger }));

  beforeEach(async () => {
    requests = { duties: 0, members: 0 };
    await seedOverture(duties.blocks.flatMap((b) => b.pharmacies.map((p) => p.phone)));
  });

  it('stores today and every member, the pharmacies on duty placed by their phones', async () => {
    const { ok, logger } = await run('2026-11-02');
    expect(logger.errors).toEqual([]);
    expect(ok).toBe(true);
    expect(await days(paths())).toEqual(['2026-11-02.json']);

    const registry = await readJson(paths().pharmacies, PharmaciesSchema);
    expect(registry?.pharmacies).toHaveLength(104);
    const onDuty = registry?.pharmacies.filter((p) => p.location !== null) ?? [];
    expect(onDuty).toHaveLength(5);
    expect(onDuty.every((p) => p.location?.source === 'overture')).toBe(true);
    // Everyone else is a member the lists will name; they are not placed in this run (offline).
    expect(registry?.pharmacies.filter((p) => p.groupId === 'corfu')).toHaveLength(104);

    const day = await readJson(join(paths().duties, '2026-11-02.json'), DutyDaySchema);
    expect(day?.groups[0]?.id).toBe('corfu');
    expect(day?.groups[0]?.sections).toHaveLength(1);
    expect((await readJson(paths().meta, MetaSchema))?.extendedHours).toEqual([]);
  });

  it('reads the members once a week, and the duty page every time', async () => {
    await run('2026-11-02');
    await run('2026-11-02');
    await run('2026-11-08');
    expect(requests).toEqual({ duties: 3, members: 1 });
    await run('2026-11-09');
    expect(requests).toEqual({ duties: 4, members: 2 });
  });

  it("does not take yesterday's list for today's", async () => {
    await run('2026-11-02');
    const { ok, logger } = await run('2026-11-03', { ...duties, date: '2026-11-03' });
    expect(ok).toBe(false);
    expect(logger.logs.join('\n')).toMatch(
      /repeated-list\] 2026-11-03 corfu: the same list as 2026-11-02/,
    );
    expect(await days(paths())).toEqual(['2026-11-02.json']);
  });

  it('keeps yesterday and adds today when the list changes', async () => {
    await run('2026-11-02');
    const [first, ...rest] = duties.blocks[0]?.pharmacies ?? [];
    const other = {
      date: '2026-11-03',
      blocks: [
        {
          heading: duties.blocks[0]?.heading ?? '',
          pharmacies: [...rest, ...(first ? [first] : [])].reverse().slice(1),
        },
      ],
    };
    const { ok } = await run('2026-11-03', other);
    expect(ok).toBe(true);
    expect(await days(paths())).toEqual(['2026-11-02.json', '2026-11-03.json']);
    expect((await readJson(paths().meta, MetaSchema))?.duties).toEqual({
      from: '2026-11-02',
      to: '2026-11-03',
    });
  });
});
