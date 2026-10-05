import type {
  CityData,
  DutyDay,
  ExtendedHours,
  IsoDate,
  Meta,
  Pharmacies,
} from '@pharmacy-skg/core';
import { CITIES } from '@pharmacy-skg/core';

/** Where the build copies data/ to (integrations/data.ts). */
export const DATA_BASE_PATH = '/data';

export interface LoadOptions {
  /** Replaces the global fetch (tests). */
  readonly fetch?: typeof fetch;
  /** Prefix for the data URLs. Defaults to DATA_BASE_PATH on the current origin. */
  readonly basePath?: string;
  readonly signal?: AbortSignal;
}

export interface CityBundle {
  readonly data: CityData;
  readonly meta: Meta;
  /**
   * Requested dates whose file could not be loaded for a reason other than "not published"
   * (offline and not cached, server error). A 404 is not listed: it just means unpublished.
   */
  readonly failedDates: readonly IsoDate[];
}

export function cityDataUrl(cityId: string, path: string, basePath: string = DATA_BASE_PATH) {
  return `${basePath}/${cityId}/${path}`;
}

export function dutyPath(date: IsoDate): string {
  return `duties/${date}.json`;
}

class HttpError extends Error {
  readonly status: number;
  constructor(url: string, status: number) {
    super(`GET ${url} failed with HTTP ${status}`);
    this.name = 'HttpError';
    this.status = status;
  }
}

async function getJson(url: string, doFetch: typeof fetch, signal?: AbortSignal): Promise<unknown> {
  const response = await doFetch(url, signal === undefined ? {} : { signal });
  if (!response.ok) throw new HttpError(url, response.status);
  return response.json();
}

function expectSchemaVersion1<T extends { schemaVersion: 1 }>(value: unknown, what: string): T {
  if (
    typeof value !== 'object' ||
    value === null ||
    (value as { schemaVersion?: unknown }).schemaVersion !== 1
  ) {
    throw new Error(`${what}: unsupported or malformed data (expected schemaVersion 1)`);
  }
  return value as T;
}

/** Fetches meta.json only (freshness checks). */
export async function loadMeta(cityId: string, options: LoadOptions = {}): Promise<Meta> {
  const doFetch = options.fetch ?? fetch;
  const url = cityDataUrl(cityId, 'meta.json', options.basePath);
  return expectSchemaVersion1<Meta>(await getJson(url, doFetch, options.signal), url);
}

/**
 * Loads a city's published data for the given dates. meta.json, pharmacies.json and the
 * extended-hours files it lists are required; a date without a published duty list is simply
 * absent from `duties`.
 */
export async function loadCityBundle(
  cityId: string,
  dates: readonly IsoDate[],
  options: LoadOptions = {},
): Promise<CityBundle> {
  const city = CITIES.find((c) => c.id === cityId);
  if (city === undefined) throw new Error(`Unknown city: ${cityId}`);
  const doFetch = options.fetch ?? fetch;
  const url = (path: string) => cityDataUrl(cityId, path, options.basePath);

  const meta = await loadMeta(cityId, options);
  const [pharmacies, extendedHours, dutyResults] = await Promise.all([
    getJson(url('pharmacies.json'), doFetch, options.signal).then((v) =>
      expectSchemaVersion1<Pharmacies>(v, 'pharmacies.json'),
    ),
    Promise.all(
      meta.extendedHours.map(async (entry) =>
        expectSchemaVersion1<ExtendedHours>(
          await getJson(url(entry.file), doFetch, options.signal),
          entry.file,
        ),
      ),
    ),
    Promise.all(
      [...new Set(dates)].map(async (date) => {
        try {
          const day = expectSchemaVersion1<DutyDay>(
            await getJson(url(dutyPath(date)), doFetch, options.signal),
            dutyPath(date),
          );
          return { date, day, failed: false };
        } catch (error) {
          if (options.signal?.aborted) throw error;
          const unpublished = error instanceof HttpError && error.status === 404;
          return { date, day: null, failed: !unpublished };
        }
      }),
    ),
  ]);

  const duties = new Map<IsoDate, DutyDay>();
  const failedDates: IsoDate[] = [];
  for (const { date, day, failed } of dutyResults) {
    if (day !== null) duties.set(date, day);
    if (failed) failedDates.push(date);
  }

  return {
    data: { city, pharmacies: pharmacies.pharmacies, duties, extendedHours },
    meta,
    failedDates,
  };
}

/** Like loadCityBundle, returning only the CityData the open-now engine takes. */
export async function loadCityData(
  cityId: string,
  dates: readonly IsoDate[],
  options: LoadOptions = {},
): Promise<CityData> {
  return (await loadCityBundle(cityId, dates, options)).data;
}
