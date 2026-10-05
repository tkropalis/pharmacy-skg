import { THESSALONIKI } from '@pharmacy-skg/core';
import type { Meta } from '@pharmacy-skg/core';
import { describe, expect, it, vi } from 'vitest';
import { cityDataUrl, loadCityBundle, loadCityData, loadDutyDays, loadMeta } from './data.ts';

const meta = {
  schemaVersion: 1,
  city: 'thessaloniki',
  updatedAt: '2026-10-04T23:04:48.920Z',
  duties: { from: '2026-10-05', to: '2026-10-07' },
  extendedHours: [{ from: '2026-09-01', to: '2026-10-31', file: 'extended-hours/a_b.json' }],
  sources: [],
};
const pharmacies = { schemaVersion: 1, pharmacies: [{ id: '2310000001', name: 'Test' }] };
const extended = { schemaVersion: 1, entries: [] };
const day = (date: string) => ({ schemaVersion: 1, date, groups: [] });

/** A fake server: path to JSON body, anything else is 404. `fail` paths throw like a dead network. */
function fakeFetch(files: Record<string, unknown>, fail: string[] = []) {
  return vi.fn<typeof fetch>((input) => {
    const path = String(input);
    if (fail.includes(path)) return Promise.reject(new TypeError('Failed to fetch'));
    const body = files[path];
    return Promise.resolve(
      body === undefined
        ? new Response('not found', { status: 404 })
        : new Response(JSON.stringify(body), { status: 200 }),
    );
  });
}

const base = '/data/thessaloniki';
const server = {
  [`${base}/meta.json`]: meta,
  [`${base}/pharmacies.json`]: pharmacies,
  [`${base}/extended-hours/a_b.json`]: extended,
  [`${base}/duties/2026-10-05.json`]: day('2026-10-05'),
  [`${base}/duties/2026-10-06.json`]: day('2026-10-06'),
};

describe('cityDataUrl', () => {
  it('joins base, city and path', () => {
    expect(cityDataUrl('thessaloniki', 'meta.json')).toBe('/data/thessaloniki/meta.json');
    expect(cityDataUrl('thessaloniki', 'meta.json', 'https://x.test/data')).toBe(
      'https://x.test/data/thessaloniki/meta.json',
    );
  });
});

describe('loadCityData', () => {
  it('returns CityData with duties as a Map', async () => {
    const data = await loadCityData('thessaloniki', ['2026-10-05', '2026-10-06'], {
      fetch: fakeFetch(server),
    });
    expect(data.city).toBe(THESSALONIKI);
    expect(data.pharmacies).toHaveLength(1);
    expect(data.extendedHours).toHaveLength(1);
    expect(data.duties).toBeInstanceOf(Map);
    expect([...data.duties.keys()]).toEqual(['2026-10-05', '2026-10-06']);
    expect(data.duties.get('2026-10-06')?.date).toBe('2026-10-06');
  });

  it('leaves unpublished dates (404) out without an error', async () => {
    const bundle = await loadCityBundle('thessaloniki', ['2026-10-05', '2026-10-09'], {
      fetch: fakeFetch(server),
    });
    expect([...bundle.data.duties.keys()]).toEqual(['2026-10-05']);
    expect(bundle.failedDates).toEqual([]);
  });

  it('reports dates that failed for another reason, and still loads the rest', async () => {
    const bundle = await loadCityBundle('thessaloniki', ['2026-10-05', '2026-10-06'], {
      fetch: fakeFetch(server, [`${base}/duties/2026-10-06.json`]),
    });
    expect([...bundle.data.duties.keys()]).toEqual(['2026-10-05']);
    expect(bundle.failedDates).toEqual(['2026-10-06']);
  });

  it('asks for each date once', async () => {
    const f = fakeFetch(server);
    await loadCityData('thessaloniki', ['2026-10-05', '2026-10-05'], { fetch: f });
    const asked = f.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('duties'));
    expect(asked).toEqual([`${base}/duties/2026-10-05.json`]);
  });

  it('works with no dates', async () => {
    const data = await loadCityData('thessaloniki', [], { fetch: fakeFetch(server) });
    expect(data.duties.size).toBe(0);
  });

  it('fails when a required file is missing or has an unknown schema', async () => {
    const withoutPharmacies = Object.fromEntries(
      Object.entries(server).filter(([path]) => path !== `${base}/pharmacies.json`),
    );
    await expect(
      loadCityData('thessaloniki', [], { fetch: fakeFetch(withoutPharmacies) }),
    ).rejects.toThrow(/404/);
    await expect(
      loadCityData('thessaloniki', [], {
        fetch: fakeFetch({ ...server, [`${base}/pharmacies.json`]: { schemaVersion: 2 } }),
      }),
    ).rejects.toThrow(/schemaVersion/);
  });

  it('rejects an unknown city before any request', async () => {
    const f = fakeFetch(server);
    await expect(loadCityData('atlantis', [], { fetch: f })).rejects.toThrow(/Unknown city/);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('onlyPublishedDates', () => {
  it('does not ask for dates outside the published range', async () => {
    const f = fakeFetch(server);
    const bundle = await loadCityBundle(
      'thessaloniki',
      ['2026-10-04', '2026-10-05', '2026-10-07', '2026-10-08'],
      { fetch: f, onlyPublishedDates: true },
    );
    const asked = f.mock.calls
      .map(([input]) => String(input))
      .filter((u) => u.includes('/duties/'));
    expect(asked.sort()).toEqual([
      `${base}/duties/2026-10-05.json`,
      `${base}/duties/2026-10-07.json`,
    ]);
    expect([...bundle.data.duties.keys()]).toEqual(['2026-10-05']);
    expect(bundle.failedDates).toEqual([]);
  });

  it('loadDutyDays loads only duty lists', async () => {
    const f = fakeFetch(server);
    const { duties, failedDates } = await loadDutyDays(
      'thessaloniki',
      ['2026-10-05', '2026-10-06', '2026-10-09'],
      meta as Meta,
      { fetch: f, onlyPublishedDates: true },
    );
    expect([...duties.keys()].sort()).toEqual(['2026-10-05', '2026-10-06']);
    expect(failedDates).toEqual([]);
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe('loadMeta', () => {
  it('reads meta.json', async () => {
    expect((await loadMeta('thessaloniki', { fetch: fakeFetch(server) })).updatedAt).toBe(
      meta.updatedAt,
    );
  });
});
