import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { z } from 'zod';

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** Where the published data lives: data/ in the repository. */
export const DATA_ROOT = join(REPO_ROOT, 'data');

/** Paths of a city's data directory. Published files are read by the app; the rest are pipeline inputs and caches. */
export function cityPaths(city: string, dataRoot = DATA_ROOT) {
  const root = join(dataRoot, city);
  return {
    root,
    meta: join(root, 'meta.json'),
    pharmacies: join(root, 'pharmacies.json'),
    duties: join(root, 'duties'),
    extendedHours: join(root, 'extended-hours'),
    overrides: join(root, 'overrides.json'),
    overture: join(root, 'inputs', 'overture-pharmacies.json'),
    geocodeCache: join(root, 'inputs', 'geocode-cache.json'),
    /** Coordinates read from the duty lists (ITeQ), by pharmacy id. */
    listedLocations: join(root, 'inputs', 'listed-locations.json'),
    /** Every pharmacy a source names beyond the stored duty lists (cities/pipeline.ts, Roster). */
    roster: join(root, 'inputs', 'roster.json'),
    /** The area's street names with their accents, from OpenStreetMap (registry/streets.ts). */
    streets: join(root, 'inputs', 'streets.json'),
  };
}

export type CityPaths = ReturnType<typeof cityPaths>;

/** Paths of the medicine data, which is national, not per city. */
export function medicinesPaths(dataRoot = DATA_ROOT) {
  const root = join(dataRoot, 'medicines');
  return {
    root,
    medicines: join(root, 'medicines.json'),
    articleFiles: join(root, 'inputs', 'moh-article-files.json'),
  };
}

export type MedicinesPaths = ReturnType<typeof medicinesPaths>;

export async function readJson<T extends z.ZodType>(
  path: string,
  schema: T,
): Promise<z.infer<T> | undefined> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  return schema.parse(JSON.parse(text));
}

export function toJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Writes a file only if its content changed. Returns whether it did. */
export async function writeIfChanged(path: string, content: string): Promise<boolean> {
  try {
    if ((await readFile(path, 'utf8')) === content) return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  return true;
}

export async function listJsonFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((file) => file.endsWith('.json')).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function removeFile(path: string): Promise<void> {
  await rm(path, { force: true });
}
