import { useState } from 'react';
import type { CityData } from '@pharmacy-skg/core';
import { advanceStatusClock } from '../../lib/status-clock.ts';
import type { StatusClock } from '../../lib/status-clock.ts';

/**
 * The instant to work the statuses out for: `at` itself the first time, then the same instant
 * (so the rows, the map's pins and the coverage computed from it are not made again) until a
 * status can change, which the engine says (`nextStatusChange`). Words that count down, such as
 * "closes in 12 minutes", are still made from the live `at` by the components that show them.
 *
 * It is state kept by adjusting during render, which React allows for a value derived from
 * props: it renders again at once, before anything is drawn.
 */
export function useStatusAt(data: CityData | null, at: Date): Date {
  const [clock, setClock] = useState<StatusClock | null>(null);
  const current = data === null ? null : advanceStatusClock(clock, data, at);
  if (current !== clock) setClock(current);
  return current === null ? at : current.at;
}
