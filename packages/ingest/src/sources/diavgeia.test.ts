import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DiavgeiaClient, diavgeiaUrl, searchWindows } from './diavgeia.ts';
import { USER_AGENT } from './http.ts';

const fixture = (name: string) =>
  readFileSync(new URL(`../../fixtures/diavgeia/${name}`, import.meta.url), 'utf8');

/** Answers each request in turn and records it; waits are recorded, not made. */
function transport(answers: (() => Response)[]) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const sleeps: number[] = [];
  return {
    calls,
    sleeps,
    fetch: async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: new URL(String(url)), init: init ?? {} });
      const answer = answers.shift();
      if (!answer) throw new Error('no answer left');
      return answer();
    },
    sleep: async (ms: number) => void sleeps.push(ms),
  };
}

const json = (body: string) => () =>
  new Response(body, { headers: { 'content-type': 'application/json' } });

describe('searchWindows', () => {
  it('cuts a long span into windows the API does not shorten, and leaves a short one whole', () => {
    expect(searchWindows('2026-05-01', '2026-11-02')).toEqual([
      ['2026-05-01', '2026-09-27'],
      ['2026-09-28', '2026-11-02'],
    ]);
    expect(searchWindows('2026-10-01', '2026-11-02')).toEqual([['2026-10-01', '2026-11-02']]);
    expect(searchWindows('2026-11-03', '2026-11-02')).toEqual([]);
  });
});

describe('DiavgeiaClient', () => {
  it('searches the open-data API for decisions of a unit by subject, as the API answers', async () => {
    const t = transport([json(fixture('search_diimerefseis.json'))]);
    const client = new DiavgeiaClient(t);

    const found = await client.search({
      org: '5004',
      unit: '78414',
      subject: 'Διημερεύσεις',
      from: '2024-10-01',
      to: '2025-02-15',
    });

    expect(found).toEqual([
      {
        ada: '6Ρ5Φ7Λ6-Ε70',
        subject:
          '«Διημερεύσεις – Διανυκτερεύσεις φαρμακείων της Περιφερειακής Ενότητας Ηλείας έτους 2025 »',
        issueDate: '2024-12-24',
        postedAt: '2024-12-24T09:19:27.197Z',
        versionId: '6bc18ba9-ca49-4ffd-8c3a-151363aaff88',
        status: 'PUBLISHED',
        organizationId: '5004',
        unitIds: ['78414'],
      },
    ]);
    expect(client.requests).toBe(1);
    const [call] = t.calls;
    expect(call?.url.href.split('?')[0]).toBe('https://diavgeia.gov.gr/luminapi/opendata/search');
    expect(Object.fromEntries(call?.url.searchParams ?? [])).toEqual({
      org: '5004',
      unit: '78414',
      subject: 'Διημερεύσεις',
      from_issue_date: '2024-10-01',
      to_issue_date: '2025-02-15',
      status: 'published',
      sort: 'recent',
      size: '100',
      page: '0',
    });
    expect(call?.init.headers).toEqual({ 'User-Agent': USER_AGENT, Accept: 'application/json' });
  });

  it('asks for a long span in windows and for every page of each, newest first', async () => {
    const one = JSON.parse(fixture('search_diimerefseis.json')) as {
      decisions: { ada: string; issueDate: number }[];
      info: { total: number };
    };
    const decision = (ada: string, issueDate: number) => ({ ...one.decisions[0], ada, issueDate });
    const page = (decisions: unknown[], total: number) =>
      json(JSON.stringify({ decisions, info: { total } }));
    const t = transport([
      page([decision('A', Date.UTC(2026, 0, 10))], 101),
      page([decision('B', Date.UTC(2026, 0, 12))], 101),
      page([decision('C', Date.UTC(2026, 6, 1)), decision('A', Date.UTC(2026, 0, 10))], 2),
    ]);
    const client = new DiavgeiaClient(t);

    const found = await client.search({
      org: '5004',
      subject: 'απαλλαγή',
      from: '2026-01-01',
      to: '2026-09-01',
    });

    expect(found.map((d) => d.ada)).toEqual(['C', 'B', 'A']);
    expect(
      t.calls.map((c) => [
        c.url.searchParams.get('from_issue_date'),
        c.url.searchParams.get('page'),
      ]),
    ).toEqual([
      ['2026-01-01', '0'],
      ['2026-01-01', '1'],
      ['2026-05-31', '0'],
    ]);
    expect(t.calls[0]?.url.searchParams.has('unit')).toBe(false);
    // One request a second at most.
    expect(t.sleeps).toHaveLength(2);
  });

  it("reads one decision's data and its document by ADA", async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const t = transport([
      json(fixture('decision_RSFX7L6-2K3.json')),
      () => new Response(pdf, { headers: { 'content-type': 'application/pdf' } }),
    ]);
    const client = new DiavgeiaClient(t);

    const decision = await client.decision('ΡΣΦΞ7Λ6-2Κ3');
    expect(decision).toMatchObject({
      ada: 'ΡΣΦΞ7Λ6-2Κ3',
      issueDate: '2025-12-16',
      postedAt: '2025-12-16T12:43:57.736Z',
      versionId: 'c75065bd-6ab2-46c4-b4f1-5fcc2e0855c6',
      status: 'PUBLISHED',
    });
    expect(await client.document('ΡΣΦΞ7Λ6-2Κ3')).toEqual(pdf);

    const [first, second] = t.calls;
    expect(first?.url.href).toBe(
      'https://diavgeia.gov.gr/luminapi/opendata/decisions/%CE%A1%CE%A3%CE%A6%CE%9E7%CE%9B6-2%CE%9A3',
    );
    expect(second?.url.pathname.endsWith('/document')).toBe(true);
    // Only the open-data API: the site's own /doc/ and /luminapi/api/ are disallowed.
    for (const call of t.calls) expect(call.url.pathname).toMatch(/^\/luminapi\/opendata\//);
  });

  it('fails with the status when the API refuses', async () => {
    const t = transport([() => new Response('no', { status: 404 })]);
    await expect(new DiavgeiaClient(t).decision('X')).rejects.toThrow(/HTTP 404/);
  });
});

describe('diavgeiaUrl', () => {
  it('is the page people read a decision on', () => {
    expect(diavgeiaUrl('ΡΣΦΞ7Λ6-2Κ3')).toBe('https://diavgeia.gov.gr/decision/view/ΡΣΦΞ7Λ6-2Κ3');
  });
});
