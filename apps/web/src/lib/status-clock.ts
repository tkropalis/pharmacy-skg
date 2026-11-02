import type { CityData } from '@pharmacy-skg/core';
import { nextStatusChange } from './engine.ts';

/**
 * The instant the statuses on screen were worked out for, and the first instant after it at
 * which any of them can differ (`nextStatusChange`). The clock of the page ticks every minute;
 * the statuses are worked out again only when it passes `next`, or when the data or the chosen
 * moment changes, so the minutes in between cost nothing.
 */
export interface StatusClock {
  readonly data: CityData;
  readonly at: Date;
  readonly next: number;
}

/**
 * The clock to use for `at`: the same object while nothing can have changed since it was made
 * (so everything computed from it stays as it is), otherwise a new one for `at`.
 */
export function advanceStatusClock(
  previous: StatusClock | null,
  data: CityData,
  at: Date,
): StatusClock {
  const t = at.getTime();
  if (
    previous !== null &&
    previous.data === data &&
    previous.at.getTime() <= t &&
    t < previous.next
  ) {
    return previous;
  }
  return { data, at, next: nextStatusChange(data, at).getTime() };
}
