/**
 * Geocoding with Nominatim, once per query: results (including misses) are
 * cached in the repo. Nominatim's policy allows at most one request per
 * second and requires an identifying User-Agent.
 */
import { z } from 'zod';
import { USER_AGENT } from '../sources/http.ts';
import { squash } from '../text.ts';

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
// The Thessaloniki regional unit (Βόλβη reaches past 23.9°E), so that e.g. "Αμπελόκηποι" doesn't resolve to Athens.
const VIEWBOX = '22.55,41.05,24.0,40.35';

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

// In ΦΣΘ lists "Θεσσαλονίκη" is the municipality; neighbouring municipalities
// are listed by their own names. OpenStreetMap tags their addresses with the
// city "Θεσσαλονίκη" too, so a plain query finds e.g. Κομνηνών 17 in Καλαμαριά.
const THESSALONIKI = 'Θεσσαλονίκη';
const THESSALONIKI_MUNICIPALITY = 'Δήμος Θεσσαλονίκης';

function queryLocality(locality: string): string {
  return locality === THESSALONIKI ? THESSALONIKI_MUNICIPALITY : locality;
}

/** Rejects a result for Θεσσαλονίκη that lies in another municipality. */
export function inLocality(hit: Pick<GeocodeHit, 'displayName'>, locality: string): boolean {
  if (locality !== THESSALONIKI) return true;
  const municipality = /Δήμος [^,]+/.exec(hit.displayName)?.[0];
  return municipality === undefined || municipality === THESSALONIKI_MUNICIPALITY;
}

const EXACT_TYPES = new Set(['building', 'house', 'place', 'amenity', 'shop', 'healthcare']);
const STREET_TYPES = new Set(['road', 'street', 'square']);

export class Geocoder {
  private lastRequest = 0;
  requests = 0;
  /** Why online lookups stopped during this run, if they did. */
  stopped: string | null = null;

  readonly cache: GeocodeCache;
  private online: boolean;

  private readonly budget: number;

  /**
   * With `online` false, only cached results are used. `budget` caps the
   * requests per run; Nominatim's usage policy forbids bulk geocoding.
   */
  constructor(cache: GeocodeCache, online: boolean, budget = 150) {
    this.cache = cache;
    this.online = online;
    this.budget = budget;
  }

  private readonly used = new Set<string>();

  /** The cache entries this run looked up, so stale queries can be dropped. */
  usedEntries(): GeocodeCache {
    return Object.fromEntries(Object.entries(this.cache).filter(([query]) => this.used.has(query)));
  }

  private async search(query: string, cachedOnly: boolean): Promise<GeocodeHit | null> {
    this.used.add(query);
    const cached = this.cache[query];
    if (cached) return cached.hit;
    if (!this.online || cachedOnly) return null;
    if (this.requests >= this.budget) {
      this.stopped ??= `geocoding budget of ${this.budget} requests reached`;
      return null;
    }
    const response = await this.request(query);
    if (!response) return null;

    const [first] = ResultsSchema.parse(response.json);
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

  /**
   * One rate-limited request. If Nominatim refuses (429, 5xx or a network
   * error) after one retry, stops online lookups for the rest of the run:
   * uncached addresses stay unlocated, and validation decides whether that
   * blocks publishing.
   */
  private async request(query: string): Promise<{ json: unknown } | null> {
    const params = new URLSearchParams({
      q: query,
      countrycodes: 'gr',
      viewbox: VIEWBOX,
      bounded: '1',
      format: 'jsonv2',
      limit: '1',
      'accept-language': 'el',
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      const wait = this.lastRequest + (attempt === 0 ? 1100 : 60_000) - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.lastRequest = Date.now();
      this.requests++;
      try {
        const response = await fetch(`${ENDPOINT}?${params}`, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(30_000),
        });
        if (response.ok) return { json: await response.json() };
        this.stopped = `Nominatim HTTP ${response.status}`;
        if (response.status !== 429 && response.status < 500) break;
      } catch (error) {
        this.stopped = `Nominatim: ${String(error)}`;
      }
    }
    this.online = false;
    return null;
  }

  /**
   * Geocodes an address in a locality, falling back to the locality alone.
   * With `cachedOnly`, never goes online.
   */
  async geocode(
    address: string,
    locality: string,
    { cachedOnly = false } = {},
  ): Promise<(GeocodeHit & { query: string }) | null> {
    const street = cleanAddress(address);
    const place = queryLocality(locality);
    const queries = [street && /\d/.test(street) ? `${street}, ${place}` : null, place];
    for (const query of queries) {
      if (!query) continue;
      const hit = await this.search(query, cachedOnly);
      if (hit && inLocality(hit, locality)) {
        const precision = query === place ? 'locality' : hit.precision;
        return { ...hit, precision, query };
      }
    }
    return null;
  }
}
