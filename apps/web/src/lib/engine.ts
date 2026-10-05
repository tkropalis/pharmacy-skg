/**
 * The one place the screen touches the open-now engine's newer API. The review fixes in
 * packages/core (`coverage`, `StatusDetails.found`) land on m2-open-now; until they are merged
 * these local stand-ins answer the same questions, and they are deleted after the merge.
 */
import { addDays, zonedParts } from '@pharmacy-skg/core';
import type { CityData } from '@pharmacy-skg/core';

export {
  distanceMetres,
  openPharmacies,
  pharmacyStatus,
  publishedDuties,
} from '@pharmacy-skg/core';

export interface Coverage {
  /** The duty list for the duty day containing the moment is published. */
  readonly duties: boolean;
  /** A ΠΚΜ extended-hours list covers the moment's date. */
  readonly extendedHours: boolean;
}

export function coverageAt(data: CityData, at: Date): Coverage {
  const now = zonedParts(at, data.city.timeZone);
  // Before 08:00 the duty day is still yesterday's.
  const dutyDay = now.minutes < 8 * 60 ? addDays(now.date, -1) : now.date;
  return {
    duties: data.duties.has(dutyDay) && data.duties.has(now.date),
    extendedHours: data.extendedHours.some(
      ({ period }) => now.date >= period.from && now.date <= period.to,
    ),
  };
}
