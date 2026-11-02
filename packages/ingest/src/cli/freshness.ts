/**
 * Lists the areas whose data was last checked more than 36 hours ago (the app's stale-data
 * banner, docs/decisions.md). The Stale data workflow runs it and keeps one GitHub issue current.
 *
 * With `--body-file <path>` it writes the issue text there when some area is stale, and removes
 * the file when none is. It exits 0 once it has read the data: stale data is its news, not a
 * failure of this command.
 */
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { issueBody, STALE_AFTER_HOURS, staleAreas, type AreaMeta } from '../freshness.ts';
import { REPO_ROOT } from '../store.ts';

const args = process.argv.slice(2);
const flag = args.indexOf('--body-file');
const bodyFile = flag === -1 ? undefined : args[flag + 1];
if (flag !== -1 && !bodyFile) throw new Error('--body-file needs a path');

/** Every data/<area>/meta.json. A folder without one (medicines, schema) is not an area. */
async function readAreas(): Promise<AreaMeta[]> {
  const dataDir = join(REPO_ROOT, 'data');
  const folders = (await readdir(dataDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const areas: AreaMeta[] = [];
  for (const area of folders) {
    let text: string;
    try {
      text = await readFile(join(dataDir, area, 'meta.json'), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    // The date the app shows: checkedAt, or updatedAt for an older file. A file that does not
    // parse counts as stale rather than stopping the check.
    let meta: { checkedAt?: unknown; updatedAt?: unknown } = {};
    try {
      meta = JSON.parse(text) as typeof meta;
    } catch {
      // left empty: no date
    }
    const date = meta.checkedAt ?? meta.updatedAt;
    areas.push({ area, checkedAt: typeof date === 'string' ? date : undefined });
  }
  return areas;
}

const areas = await readAreas();
if (areas.length === 0) throw new Error('No data/<area>/meta.json found');
const stale = staleAreas(areas, new Date());

if (stale.length === 0) {
  console.log(`All ${areas.length} areas were checked within the last ${STALE_AFTER_HOURS} hours.`);
  if (bodyFile) await rm(bodyFile, { force: true });
} else {
  for (const { area, checkedAt, ageHours } of stale) {
    const age = ageHours === undefined ? 'no valid date' : `${ageHours} h`;
    console.log(`${area}: ${age} ${checkedAt ?? ''}`.trimEnd());
  }
  console.log(`${stale.length} of ${areas.length} areas are stale.`);
  if (bodyFile) {
    const server = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
    const repo = process.env.GITHUB_REPOSITORY ?? 'tkropalis/pharmacy-skg';
    const url = `${server}/${repo}/actions/workflows/update-data.yml`;
    await writeFile(bodyFile, `${issueBody(stale, areas.length, url)}\n`);
  }
}
