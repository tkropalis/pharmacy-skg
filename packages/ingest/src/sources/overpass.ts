/**
 * Reads the names of the named streets inside a box from OpenStreetMap, through the Overpass API
 * (a mirror: overpass-api.de drops connections from cloud containers, CLAUDE.md). One request per
 * area, once: the names are kept in data/<city>/inputs/streets.json (registry/streets.ts). The
 * names are facts about places; no geometry is read or stored, so OpenStreetMap's share-alike
 * does not reach the data (D22).
 */
import { z } from 'zod';
import type { Bounds } from '@pharmacy-skg/core';
import { HttpClient, type HttpTransport } from './http.ts';

export const OVERPASS_ENDPOINT = 'https://overpass.kumi.systems/api/interpreter';

const ResponseSchema = z.object({
  elements: z.array(z.object({ tags: z.object({ name: z.string().optional() }).optional() })),
});

/** The query: every named road, path and street of the box, tags only. */
export function streetsQuery([west, south, east, north]: Bounds): string {
  return `[out:json][timeout:90];way["highway"]["name"](${south},${west},${north},${east});out tags;`;
}

/** The distinct names of an Overpass answer, in Greek alphabetical order. */
export function streetNames(json: unknown): string[] {
  const names = new Set<string>();
  for (const element of ResponseSchema.parse(json).elements) {
    const name = element.tags?.name?.replace(/\s+/g, ' ').trim();
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'el'));
}

/**
 * The servers to ask, in order: the mirror that works from cloud containers, then the main one
 * (which refuses the browser-like User-Agent the other sites need, so it gets the project's own).
 */
export const OVERPASS_ENDPOINTS = [OVERPASS_ENDPOINT, 'https://overpass-api.de/api/interpreter'];
const OWN_USER_AGENT = 'pharmacy-skg/0.1 (+https://github.com/tkropalis/pharmacy-skg)';

/** The names of the streets inside `bounds`; the first server that answers wins. */
export async function fetchStreetNames(
  bounds: Bounds,
  transport: HttpTransport = {},
  endpoints: readonly string[] = OVERPASS_ENDPOINTS,
): Promise<string[]> {
  const http = new HttpClient({
    ...transport,
    attempts: 2,
    timeoutMs: 120_000,
    backoffMs: () => 10_000,
  });
  const form = new URLSearchParams({ data: streetsQuery(bounds) });
  let lastError: unknown;
  for (const endpoint of endpoints) {
    try {
      return streetNames(
        await http.json(endpoint, {
          accept: '*/*',
          headers: { 'User-Agent': OWN_USER_AGENT },
          form,
        }),
      );
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
