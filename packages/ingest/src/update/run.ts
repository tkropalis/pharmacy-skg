/**
 * The update command, without its process: runs `updateCity` for each chosen pipeline, reports
 * a city that throws and goes on with the next. Returns the exit code: 0 when no city failed,
 * 1 when one did (validation, a list that could not be read, an error that is not the
 * network's), 2 for a city id that is not covered.
 *
 * The run fails only for what a change here can fix. A city whose source does not answer this
 * network (`isUnreachable`: a bot challenge, a timeout, a failed connection, a 421, 429 or 5xx)
 * or has published nothing for today is a warning: it keeps its data and its `checkedAt`, so
 * the app shows the stale-data banner after 36 hours and the Stale data workflow lists it in
 * its issue (docs/decisions.md, "Stale data"). With some forty sites read from GitHub's
 * runners, one of them was out of reach or late on every run from 30 Oct to 12 Nov 2026, each
 * time another (the ministry, efimeria.gr, ITeQ's server, Corfu, thess.guide), and a run that is
 * always red hides the failures it can fix.
 */
import type { CityPipeline } from '../cities/pipeline.ts';
import { describeError, isBlocked, isUnreachable } from '../sources/http.ts';
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
      const outcome = await updateCity({
        pipeline,
        paths: pathsFor(pipeline.city.id),
        today,
        since,
        offline,
        logger,
        ...(now ? { now } : {}),
      });
      if (outcome === 'failed') failed++;
    } catch (error) {
      if (isBlocked(error)) {
        (logger.warn ?? logger.error)(
          `warning [blocked] ${pipeline.city.id}: its site answers this network with a bot challenge; the stored data is kept and goes stale: ${describeError(error)}`,
        );
        continue;
      }
      if (isUnreachable(error)) {
        (logger.warn ?? logger.error)(
          `warning [unreachable] ${pipeline.city.id}: its site does not answer this network; the stored data is kept and goes stale: ${describeError(error)}`,
        );
        continue;
      }
      logger.error(`${pipeline.city.id}: ${describeError(error)}`);
      failed++;
    }
  }
  return failed > 0 ? 1 : 0;
}
