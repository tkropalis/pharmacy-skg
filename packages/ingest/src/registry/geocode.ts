/**
 * Geocoding with Nominatim, once per query: results (including misses) are
 * cached in the repo. Nominatim's policy allows at most one request per
 * second and requires an identifying User-Agent.
 */
import { z } from 'zod';
import { USER_AGENT } from '../sources/http.ts';
import { squash } from '../text.ts';

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
// The Thessaloniki regional unit, so that e.g. "Αμπελόκηποι" doesn't resolve to Athens.
const VIEWBOX = '22.55,41.05,23.65,40.35';

export const GeocodeHitSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  precision: z.enum(['exact', 'street', 'locality']),
  displayName: z.string(),
});
export type GeocodeHit = z.infer<typeof GeocodeHitSchema>;

export const GeocodeCacheSchema = z.record(
  z.string(),
  z.object({ hit: GeocodeHitSchema.nullable(), at: z.string() }),
);
export type GeocodeCache = z.infer<typeof GeocodeCacheSchema>;

const ResultsSchema = z.array(
  z.object({
    lat: z.string(),
    lon: z.string(),
    addresstype: z.string().optional(),
    type: z.string().optional(),
    display_name: z.string(),
  }),
);

/**
 * Turns a printed address into something Nominatim can find: drops landmarks
 * ("ΕΝΑΝΤΙ …", "(ΠΡΩΗΝ …)") and keeps the first of several streets.
 */
export function cleanAddress(address: string): string {
  return squash(
    address
      .replace(/\(.*?\)|\(.*$/g, ' ')
      .split(/\s(?:-|&|ΚΑΙ|ΓΩΝΙΑ|ΕΝΑΝΤΙ|ΠΛΗΣΙΟΝ|ΠΑΡΑΠΛΕΥΡΩΣ)\s|,/i)[0] ?? '',
  )
    .replace(/(\d+)\s*-\s*\p{L}.*$/u, '$1')
    .replace(/^ΛΕΩΦ\.?\s*/i, 'ΛΕΩΦΟΡΟΣ ');
}

const EXACT_TYPES = new Set(['building', 'house', 'place', 'amenity', 'shop', 'healthcare']);
const STREET_TYPES = new Set(['road', 'street', 'square']);

export class Geocoder {
  private lastRequest = 0;
  requests = 0;

  readonly cache: GeocodeCache;
  private readonly online: boolean;

  /** With `online` false, only cached results are used. */
  constructor(cache: GeocodeCache, online: boolean) {
    this.cache = cache;
    this.online = online;
  }

  private async search(query: string): Promise<GeocodeHit | null> {
    const cached = this.cache[query];
    if (cached) return cached.hit;
    if (!this.online) return null;

    const wait = this.lastRequest + 1100 - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastRequest = Date.now();
    this.requests++;

    const params = new URLSearchParams({
      q: query,
      countrycodes: 'gr',
      viewbox: VIEWBOX,
      bounded: '1',
      format: 'jsonv2',
      limit: '1',
      'accept-language': 'el',
    });
    const response = await fetch(`${ENDPOINT}?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
    const [first] = ResultsSchema.parse(await response.json());
    const type = first?.addresstype ?? first?.type ?? '';
    const hit: GeocodeHit | null = first
      ? {
          lat: Number(first.lat),
          lon: Number(first.lon),
          precision: EXACT_TYPES.has(type)
            ? 'exact'
            : STREET_TYPES.has(type)
              ? 'street'
              : 'locality',
          displayName: first.display_name,
        }
      : null;
    this.cache[query] = { hit, at: new Date().toISOString() };
    return hit;
  }

  /** Geocodes an address in a locality, falling back to the locality alone. */
  async geocode(
    address: string,
    locality: string,
  ): Promise<(GeocodeHit & { query: string }) | null> {
    const street = cleanAddress(address);
    const queries = [street && /\d/.test(street) ? `${street}, ${locality}` : null, locality];
    for (const query of queries) {
      if (!query) continue;
      const hit = await this.search(query);
      if (hit) {
        const precision = query === locality ? 'locality' : hit.precision;
        return { ...hit, precision, query };
      }
    }
    return null;
  }
}
