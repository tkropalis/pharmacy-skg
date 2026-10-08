import { attiki } from './attiki.ts';
import { ITEQ_PIPELINES } from './iteq-areas.ts';
import type { CityPipeline } from './pipeline.ts';
import { larisa } from './larisa.ts';
import { thessaloniki } from './thessaloniki.ts';

export type { CityPipeline } from './pipeline.ts';

/** Every covered city's pipeline, in the order the update command runs them. */
export const PIPELINES: readonly CityPipeline[] = [thessaloniki, larisa, attiki, ...ITEQ_PIPELINES];
