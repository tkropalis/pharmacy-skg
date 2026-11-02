import { describe, expect, it } from 'vitest';
import {
  fetchStreetNames,
  OVERPASS_ENDPOINT,
  OVERPASS_ENDPOINTS,
  streetNames,
  streetsQuery,
} from './overpass.ts';

// The shape Overpass answers `out tags` with: ways with their tags, some without a name.
const answer = {
  version: 0.6,
  generator: 'Overpass API',
  elements: [
    { type: 'way', id: 1, tags: { highway: 'residential', name: 'Ερμού' } },
    { type: 'way', id: 2, tags: { highway: 'residential', name: 'Ερμού' } },
    { type: 'way', id: 3, tags: { highway: 'tertiary', name: 'Αγίου  Γεωργίου ' } },
    { type: 'way', id: 4, tags: { highway: 'track' } },
    { type: 'way', id: 5 },
  ],
};

describe('streetNames', () => {
  it('gives each name once, tidied, in Greek order', () => {
    expect(streetNames(answer)).toEqual(['Αγίου Γεωργίου', 'Ερμού']);
  });

  it('refuses an answer that is not Overpass', () => {
    expect(() => streetNames({ remark: 'runtime error: Query timed out' })).toThrow();
  });
});

describe('streetsQuery', () => {
  it('asks for the named roads of the box, south first', () => {
    expect(streetsQuery([21.05, 37.38, 21.8, 38.05])).toBe(
      '[out:json][timeout:90];way["highway"]["name"](37.38,21.05,38.05,21.8);out tags;',
    );
  });
});

describe('fetchStreetNames', () => {
  it('posts the query to the mirror once', async () => {
    const calls: { url: string; body: string }[] = [];
    const names = await fetchStreetNames([21.05, 37.38, 21.8, 38.05], {
      fetch: async (url, init) => {
        calls.push({ url: String(url), body: String(init?.body) });
        return new Response(JSON.stringify(answer));
      },
      sleep: async () => undefined,
    });
    expect(names).toEqual(['Αγίου Γεωργίου', 'Ερμού']);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(OVERPASS_ENDPOINT);
    expect(decodeURIComponent(calls[0]?.body ?? '')).toContain('way["highway"]["name"]');
  });

  it('asks the next server when the first does not answer, with the project own User-Agent', async () => {
    const asked: string[] = [];
    const agents: string[] = [];
    const names = await fetchStreetNames(
      [21.05, 37.38, 21.8, 38.05],
      {
        fetch: async (url, init) => {
          asked.push(String(url));
          agents.push(String((init?.headers as Record<string, string>)['User-Agent']));
          return String(url).includes('kumi')
            ? new Response('timeout', { status: 504 })
            : new Response(JSON.stringify(answer));
        },
        sleep: async () => undefined,
      },
      OVERPASS_ENDPOINTS,
    );
    expect(names).toEqual(['Αγίου Γεωργίου', 'Ερμού']);
    expect(asked.map((url) => new URL(url).host)).toEqual([
      'overpass.kumi.systems',
      'overpass.kumi.systems',
      'overpass-api.de',
    ]);
    expect(agents.every((agent) => agent.startsWith('pharmacy-skg/'))).toBe(true);
  });
});
