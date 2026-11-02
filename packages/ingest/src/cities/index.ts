import { attiki } from './attiki.ts';
import { cyclades } from './cyclades.ts';
import { ITEQ_PIPELINES } from './iteq-areas.ts';
import type { CityPipeline } from './pipeline.ts';
import { kilkis } from './kilkis.ts';
import { larisa } from './larisa.ts';
import { thessaloniki } from './thessaloniki.ts';

export type { CityPipeline } from './pipeline.ts';

/** Every covered city's pipeline, in the order the update command runs them. */
export const PIPELINES: readonly CityPipeline[] = [
  thessaloniki,
  larisa,
  attiki,
  cyclades,
  kilkis,
  ...ITEQ_PIPELINES,
];
