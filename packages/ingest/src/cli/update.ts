/**
 * Fetches the official lists, rebuilds data/<city>/ for every covered city (cities/index.ts),
 * validates it and writes only what changed. A city whose data fails validation is left as it
 * was; the others are still written, and the command exits non-zero. So it does when a city's
 * extended-hours site cannot be read, after writing that city's duty lists. The work is in
 * update/city.ts and update/run.ts.
 *
 *   node src/cli/update.ts [--city ID ...] [--since YYYY-MM-DD] [--offline]
 *
 * --city    only this city (repeatable; default: every city)
 * --since   fetch duty lists published on or after this date (default: 3 days ago)
 * --offline use only cached geocoding results
 */
import { parseArgs } from 'node:util';
import { PIPELINES } from '../cities/index.ts';
import { addDays, cityToday } from '../time.ts';
import { consoleLogger } from '../update/logger.ts';
import { runUpdate } from '../update/run.ts';

const { values: args } = parseArgs({
  options: {
    city: { type: 'string', multiple: true },
    since: { type: 'string' },
    offline: { type: 'boolean', default: false },
  },
});

const today = cityToday();
process.exitCode = await runUpdate({
  pipelines: PIPELINES,
  ...(args.city ? { cities: args.city } : {}),
  today,
  since: args.since ?? addDays(today, -3),
  offline: args.offline,
  logger: consoleLogger,
});
