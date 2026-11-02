/**
 * The update command, without its process: runs `updateCity` for each chosen pipeline, reports
 * a city that throws and goes on with the next. Returns the exit code: 0 when every city is
 * current, 1 when one failed (validation, a source gone quiet, an extended-hours site that
 * could not be read, an error), 2 for a city id that is not covered.
 */
import type { CityPipeline } from '../cities/pipeline.ts';
import { describeError } from '../sources/http.ts';
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
      logger.error(`${pipeline.city.id}: ${describeError(error)}`);
      failed++;
    }
  }
  return failed > 0 ? 1 : 0;
}
