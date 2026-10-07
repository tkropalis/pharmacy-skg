import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { CITIES, encodeMedicineIndex } from '@pharmacy-skg/core';
import type { MedicinesFile, Meta, Pharmacies } from '@pharmacy-skg/core';
import { buildToday } from '../src/lib/build-today.ts';
import { buildLocalities, PLACES_PATH } from '../src/lib/places.ts';
import type { NationalPlace } from '../src/lib/places.ts';
import { isExtendedHoursPath, isPublishedPath, selectDutyFiles } from './data-files.ts';

/** <repo>/data/, which lives outside apps/web (Vercel: "include files outside root"). */
const DATA_ROOT = fileURLToPath(new URL('../../../data/', import.meta.url));

const CITY_IDS = CITIES.map((city) => city.id);

/** Where the app reads the medicine index (lib/medicine-index.ts). */
export const MEDICINE_INDEX_PATH = 'medicines/index.json';

/** The compact medicine index, built from data/medicines/medicines.json (decision D24). */
async function medicineIndex(): Promise<string> {
  const file = JSON.parse(
    await readFile(`${DATA_ROOT}medicines/medicines.json`, 'utf8'),
  ) as MedicinesFile;
  return JSON.stringify(encodeMedicineIndex(file));
}

/**
 * Every covered city's places, for the area picker: a person can type their town wherever it
 * is (lib/places.ts, loadNationalPlaces). About 400 places.
 */
async function nationalPlaces(): Promise<string> {
  const places: NationalPlace[] = [];
  for (const cityId of CITY_IDS) {
    const { pharmacies } = JSON.parse(
      await readFile(`${DATA_ROOT}${cityId}/pharmacies.json`, 'utf8'),
    ) as Pharmacies;
    for (const locality of buildLocalities(pharmacies)) {
      places.push({
        name: locality.name,
        cityId,
        lat: Math.round(locality.lat * 1e5) / 1e5,
        lon: Math.round(locality.lon * 1e5) / 1e5,
        count: locality.count,
      });
    }
  }
  return JSON.stringify(places);
}

/**
 * Publishes data/<city>/ under /data/<city>/: in the build output, and through a small
 * middleware in `astro dev`. Only the files the app reads are published (see isPublishedPath).
 */
export function dataIntegration(): AstroIntegration {
  return {
    name: 'pharmacy-data',
    hooks: {
      'astro:server:setup': ({ server }) => {
        server.middlewares.use('/data', (req, res, next) => {
          const path = decodeURIComponent((req.url ?? '').split('?')[0] ?? '').replace(/^\//, '');
          if (path === MEDICINE_INDEX_PATH || path === PLACES_PATH) {
            (path === PLACES_PATH ? nationalPlaces() : medicineIndex()).then(
              (body) => {
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Cache-Control', 'no-cache');
                res.end(body);
              },
              (error: unknown) => next(error),
            );
            return;
          }
          const [cityId, ...rest] = path.split('/');
          const relative = rest.join('/');
          if (!cityId || !CITY_IDS.includes(cityId) || !isPublishedPath(relative)) {
            next();
            return;
          }
          readFile(`${DATA_ROOT}${cityId}/${relative}`).then(
            (body) => {
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Cache-Control', 'no-cache');
              res.end(body);
            },
            () => {
              res.statusCode = 404;
              res.end();
            },
          );
        });
      },

      'astro:build:done': async ({ dir, logger }) => {
        const today = buildToday();
        for (const cityId of CITY_IDS) {
          const source = `${DATA_ROOT}${cityId}/`;
          const target = fileURLToPath(new URL(`data/${cityId}/`, dir));
          const meta = JSON.parse(await readFile(`${source}meta.json`, 'utf8')) as Meta;

          const files = [
            'meta.json',
            'pharmacies.json',
            ...meta.extendedHours.map((entry) => entry.file),
            ...selectDutyFiles(await readdir(`${source}duties`), today).map((n) => `duties/${n}`),
          ];
          for (const file of files) {
            if (file.startsWith('extended-hours/') && !isExtendedHoursPath(file)) {
              throw new Error(`meta.json lists an unexpected extended-hours path: ${file}`);
            }
            await mkdir(dirname(`${target}${file}`), { recursive: true });
            await cp(`${source}${file}`, `${target}${file}`);
          }
          logger.info(`${cityId}: published ${files.length} data files`);
        }
        const index = await medicineIndex();
        const indexPath = fileURLToPath(new URL(`data/${MEDICINE_INDEX_PATH}`, dir));
        await mkdir(dirname(indexPath), { recursive: true });
        await writeFile(indexPath, index);
        logger.info(`medicines: published the index (${Math.round(index.length / 1024)} KB)`);
        const places = await nationalPlaces();
        await writeFile(fileURLToPath(new URL(`data/${PLACES_PATH}`, dir)), places);
        logger.info(`places: published ${Math.round(places.length / 1024)} KB`);
      },
    },
  };
}
