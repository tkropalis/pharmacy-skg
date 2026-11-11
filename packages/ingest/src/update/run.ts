/**
 * The update command, without its process: runs `updateCity` for each chosen pipeline, reports
 * a city that throws and goes on with the next. Returns the exit code: 0 when every city is
 * current, 1 when one failed (validation, a source gone quiet, an extended-hours site that
 * could not be read, an error), 2 for a city id that is not covered.
 *
 * A city whose site answers with a bot challenge (`BlockedError`) is reported as blocked and
 * does not fail the run: it keeps its data and its `checkedAt`, so the app shows the stale-data
 * banner after 36 hours and the Stale data workflow lists it in its issue (docs/decisions.md,
 * "Stale data"). A run cannot fix a block, and one that stays red for it every twelve hours
 * hides the failures it can (Achaia and the Cyclades, from 2 and 5 Nov 2026).
 */
import type { CityPipeline } from '../cities/pipeline.ts';
import { describeError, isBlocked } from '../sources/http.ts';
import { cityPaths, type CityPaths } from '../store.ts';
import { updateCity } from './city.ts';
import type { Logger } from './logger.ts';

export interface RunUpdateOptions {
  readonly pipelines: readonly CityPipeline[];
  /** Only these cities (default: every pipeline). */
  readonly cities?: readonly string[];
  readonly today: string;
  readonly since: string;
  readonly offline: boolean;
  readonly logger: Logger;
  readonly pathsFor?: (cityId: string) => CityPaths;
  readonly now?: () => Date;
}

export async function runUpdate({
  pipelines,
  cities,
  today,
  since,
  offline,
  logger,
  pathsFor = cityPaths,
  now,
}: RunUpdateOptions): Promise<number> {
  const unknown = (cities ?? []).filter((id) => !pipelines.some((p) => p.city.id === id));
  if (unknown.length > 0) {
    logger.error(`Unknown city: ${unknown.join(', ')}`);
    return 2;
  }
  const chosen = cities ? pipelines.filter((p) => cities.includes(p.city.id)) : pipelines;

  let failed = 0;
  for (const pipeline of chosen) {
    logger.log(`--- ${pipeline.city.id}`);
    try {
      const done = await updateCity({
        pipeline,
        paths: pathsFor(pipeline.city.id),
        today,
        since,
        offline,
        logger,
        ...(now ? { now } : {}),
      });
      if (!done) failed++;
    } catch (error) {
      if (isBlocked(error)) {
        (logger.warn ?? logger.error)(
          `warning [blocked] ${pipeline.city.id}: its site answers this network with a bot challenge; the stored data is kept and goes stale: ${describeError(error)}`,
        );
        continue;
      }
      logger.error(`${pipeline.city.id}: ${describeError(error)}`);
      failed++;
    }
  }
  return failed > 0 ? 1 : 0;
}
