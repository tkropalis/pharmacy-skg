import type { CityData, IsoDate } from '@pharmacy-skg/core';
import { loadCityBundle } from '../../lib/data.ts';
import { addDays, localIsoDate } from '../../lib/dates.ts';

export interface NowData {
  readonly data: CityData;
  /** Duty dates that should exist but could not be fetched (offline, server error). */
  readonly failedDates: readonly IsoDate[];
}

/**
 * The data of the page's city needed to answer "what is open now": the duty lists from yesterday (shifts that
 * run past midnight) to a week ahead (the look-ahead horizon). Dates are the city's, not the
 * device's. Days meta.json does not list are not requested (a 404 would show up as an error in
 * the browser console), and a day that failed to load is reported, not mistaken for unpublished.
 */
export async function loadNowData(cityId: string, now: Date): Promise<NowData> {
  const today = localIsoDate(now);
  const dates = Array.from({ length: 9 }, (_, i) => addDays(today, i - 1));
  const bundle = await loadCityBundle(cityId, dates, { onlyPublishedDates: true });
  return { data: bundle.data, failedDates: bundle.failedDates };
}
