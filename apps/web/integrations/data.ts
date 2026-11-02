import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { encodeMedicineIndex } from '@pharmacy-skg/core';
import type { MedicinesFile } from '@pharmacy-skg/core';
import { buildToday } from '../src/lib/build-today.ts';
import { NATIONAL_INDEX_PATH, nationalDutyDateOf } from '../src/lib/national.ts';
import { buildLocalities, PLACES_PATH } from '../src/lib/places.ts';
import type { NationalPlace } from '../src/lib/places.ts';
import { CITY_IDS, DATA_ROOT, publishedMeta, readPharmacies } from './city-files.ts';
import { isExtendedHoursPath, isPublishedPath } from './data-files.ts';
import { nationalDutyBody, nationalDutyFiles, nationalIndexBody } from './national-files.ts';

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
    for (const locality of buildLocalities(await readPharmacies(cityId))) {
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

/** The national files: the index of every area, and a day's pharmacies on duty in all of them. */
function isNationalPath(path: string): boolean {
  return path === NATIONAL_INDEX_PATH || nationalDutyDateOf(path) !== null;
}

/**
 * Publishes data/<city>/ under /data/<city>/: in the build output, and through a small
 * middleware in `astro dev`. Only the files the app reads are published (see isPublishedPath).
 * The national files (src/lib/national.ts) are written beside them.
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
          if (isNationalPath(path)) {
            const today = buildToday();
            const national: Promise<string | null> =
              path === NATIONAL_INDEX_PATH
                ? nationalIndexBody(today)
                : nationalDutyBody(path, today);
            national.then(
              (body) => {
                if (body === null) {
                  res.statusCode = 404;
                  res.end();
                  return;
                }
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
          const body =
            relative === 'meta.json'
              ? publishedMeta(cityId, buildToday()).then(({ meta }) => JSON.stringify(meta))
              : readFile(`${DATA_ROOT}${cityId}/${relative}`);
          body.then(
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
          const { meta, duties } = await publishedMeta(cityId, today);
          await mkdir(target, { recursive: true });
          await writeFile(`${target}meta.json`, `${JSON.stringify(meta, null, 2)}\n`);

          const files = [
            'pharmacies.json',
            ...meta.extendedHours.map((entry) => entry.file),
            ...duties.map((n) => `duties/${n}`),
          ];
          for (const file of files) {
            if (file.startsWith('extended-hours/') && !isExtendedHoursPath(file)) {
              throw new Error(`meta.json lists an unexpected extended-hours path: ${file}`);
            }
            await mkdir(dirname(`${target}${file}`), { recursive: true });
            await cp(`${source}${file}`, `${target}${file}`);
          }
          logger.info(`${cityId}: published ${files.length + 1} data files`);
        }
        const index = await medicineIndex();
        const indexPath = fileURLToPath(new URL(`data/${MEDICINE_INDEX_PATH}`, dir));
        await mkdir(dirname(indexPath), { recursive: true });
        await writeFile(indexPath, index);
        logger.info(`medicines: published the index (${Math.round(index.length / 1024)} KB)`);
        const places = await nationalPlaces();
        await writeFile(fileURLToPath(new URL(`data/${PLACES_PATH}`, dir)), places);
        logger.info(`places: published ${Math.round(places.length / 1024)} KB`);

        const nationalIndex = await nationalIndexBody(today);
        await writeFile(fileURLToPath(new URL(`data/${NATIONAL_INDEX_PATH}`, dir)), nationalIndex);
        let nationalBytes = nationalIndex.length;
        const dutyFiles = await nationalDutyFiles(today);
        for (const [path, body] of dutyFiles) {
          const target = fileURLToPath(new URL(`data/${path}`, dir));
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, body);
          nationalBytes += body.length;
        }
        logger.info(
          `national: published the index and ${dutyFiles.length} days of pharmacies on duty (${Math.round(nationalBytes / 1024)} KB)`,
        );
      },
    },
  };
}
