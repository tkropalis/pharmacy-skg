import type { CityPipeline } from './pipeline.ts';
import { thessaloniki } from './thessaloniki.ts';

export type { CityPipeline } from './pipeline.ts';

/** Every covered city's pipeline, in the order the update command runs them. */
export const PIPELINES: readonly CityPipeline[] = [thessaloniki];
