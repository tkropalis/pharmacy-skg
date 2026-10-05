import { cp, mkdir, readdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import type { Meta } from '@pharmacy-skg/core';
import { buildToday } from '../src/lib/build-today.ts';
import { isExtendedHoursPath, isPublishedPath, selectDutyFiles } from './data-files.ts';

/** <repo>/data/, which lives outside apps/web (Vercel: "include files outside root"). */
const DATA_ROOT = fileURLToPath(new URL('../../../data/', import.meta.url));

const CITY_IDS = ['thessaloniki'];

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
      },
    },
  };
}
