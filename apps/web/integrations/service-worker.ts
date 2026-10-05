import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { buildVersion, precacheEntries, renderServiceWorker, urlForFile } from './precache.ts';
import type { PrecacheFile } from './precache.ts';

async function listFiles(root: string, prefix = ''): Promise<PrecacheFile[]> {
  const found: PrecacheFile[] = [];
  for (const entry of await readdir(`${root}${prefix}`, { withFileTypes: true })) {
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...(await listFiles(root, `${path}/`)));
    } else {
      const hash = createHash('sha256')
        .update(await readFile(`${root}${path}`))
        .digest('hex');
      found.push({ path, hash });
    }
  }
  return found;
}

/**
 * Writes sw.js into the build output from sw/sw.js, with the precache list (generated from
 * what was actually built) and a version derived from its contents.
 */
export function serviceWorkerIntegration(): AstroIntegration {
  return {
    name: 'pharmacy-service-worker',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const entries = precacheEntries(await listFiles(root));
        const version = buildVersion(entries);
        const template = await readFile(new URL('../sw/sw.js', import.meta.url), 'utf8');
        const urls = entries.map((entry) => urlForFile(entry.path));
        await writeFile(`${root}sw.js`, renderServiceWorker(template, version, urls));
        logger.info(`service worker ${version}: precaching ${urls.length} files`);
      },
    },
  };
}
