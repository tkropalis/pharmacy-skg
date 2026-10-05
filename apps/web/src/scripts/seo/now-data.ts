import type { CityData } from '@pharmacy-skg/core';
import { DEFAULT_CITY_ID } from '../../config.ts';
import { loadCityData } from '../../lib/data.ts';
import { addDays, localIsoDate } from '../../lib/dates.ts';

/**
 * The city data needed to answer "what is open now": the duty lists from yesterday (shifts that
 * run past midnight) to a week ahead (the look-ahead horizon). Dates are the city's, not the
 * device's.
 */
export function loadNowData(now: Date): Promise<CityData> {
  const today = localIsoDate(now);
  const dates = Array.from({ length: 9 }, (_, i) => addDays(today, i - 1));
  return loadCityData(DEFAULT_CITY_ID, dates);
}
