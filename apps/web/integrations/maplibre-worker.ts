import { cp, mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';

/**
 * MapLibre GL JS 6 runs its tile workers from a separate ES module file
 * (maplibre-gl-worker.mjs) that imports maplibre-gl-shared.mjs. A bundler cannot see that
 * dependency (the URL is built at runtime), so these two files are published untouched
 * under a versioned path and the app points MapLibre at them with setWorkerUrl()
 * (src/components/app/map-controller.ts). The path changes with the library version, so the
 * immutable cache headers for /_astro/ stay correct.
 */
const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

const require = createRequire(import.meta.url);
const packageJson = require.resolve('maplibre-gl/package.json');
const distDir = `${dirname(packageJson)}/dist/`;

/** Where the worker files are served, relative to the site root. */
export function workerBasePath(version: string): string {
  return `/_astro/maplibre-${version}/`;
}

async function installedVersion(): Promise<string> {
  return (JSON.parse(await readFile(packageJson, 'utf8')) as { version: string }).version;
}

export function maplibreWorkerIntegration(): AstroIntegration {
  return {
    name: 'pharmacy-maplibre-worker',
    hooks: {
      'astro:server:setup': async ({ server }) => {
        const base = workerBasePath(await installedVersion());
        server.middlewares.use(base, (req, res, next) => {
          const name = (req.url ?? '').split('?')[0]?.replace(/^\//, '') ?? '';
          if (!FILES.includes(name)) {
            next();
            return;
          }
          readFile(`${distDir}${name}`).then(
            (body) => {
              res.setHeader('Content-Type', 'text/javascript');
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
        const target = fileURLToPath(new URL(`.${workerBasePath(await installedVersion())}`, dir));
        await mkdir(target, { recursive: true });
        for (const name of FILES) await cp(`${distDir}${name}`, `${target}${name}`);
        logger.info(
          `MapLibre worker files published under ${workerBasePath(await installedVersion())}`,
        );
      },
    },
  };
}
