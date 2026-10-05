/**
 * "Open now" logic (milestone M2). Pure functions over the published data:
 * no I/O, no device clock, no device time zone. Every local time is
 * interpreted in the city's IANA time zone.
 *
 * SKELETON: the signatures below are the contract the app builds against.
 */
import type { City } from './city.ts';
import type { DutyDay, DutyKind, ExtendedHours, IsoDate, Pharmacy, TimeWindow } from './data.ts';

/** Everything the engine needs for one city, loaded by the app. */
export interface CityData {
  readonly city: City;
  readonly pharmacies: readonly Pharmacy[];
  /** Published duty lists, by date. Missing dates are unpublished, not "no duty". */
  readonly duties: ReadonlyMap<IsoDate, DutyDay>;
  readonly extendedHours: readonly ExtendedHours[];
}

/** Why a pharmacy is open during an interval. */
export type OpenReason =
  | { readonly kind: 'regular' }
  | { readonly kind: 'extended' }
  | {
      readonly kind: 'duty';
      readonly duty: DutyKind;
      /** The duty list's date (an overnight window started that evening). */
      readonly date: IsoDate;
      readonly groupId: string;
      readonly heading: string;
    }
  | {
      /** Extra hours printed under a duty heading, e.g. Tue/Thu/Fri 14:00–17:00. */
      readonly kind: 'duty-extra';
      readonly duty: DutyKind;
      readonly date: IsoDate;
      readonly groupId: string;
    };

/** A half-open interval [start, end) in absolute time. */
export interface OpenInterval {
  readonly start: Date;
  readonly end: Date;
  readonly reasons: readonly OpenReason[];
}

/** An on-duty listing whose heading prints no hours (e.g. Θέρμη, Ασβεστοχώρι). */
export interface DutyWithoutHours {
  readonly date: IsoDate;
  readonly duty: DutyKind;
  readonly groupId: string;
  readonly heading: string;
}

export type PharmacyStatus =
  | {
      readonly state: 'open';
      /** End of the merged open interval containing `at` (adjacent intervals merge). */
      readonly until: Date;
      readonly reasons: readonly OpenReason[];
      /** True if `until` is within 30 minutes of `at`. */
      readonly closingSoon: boolean;
    }
  | {
      /** Listed as on duty today, but the list prints no hours: "call to check". */
      readonly state: 'duty-hours-unknown';
      readonly duty: DutyWithoutHours;
      readonly nextOpen: Date | null;
    }
  | {
      readonly state: 'closed';
      /** Next known opening within the horizon (7 days), or null. */
      readonly nextOpen: Date | null;
      readonly nextReasons: readonly OpenReason[];
    };

export interface StatusDetails {
  readonly status: PharmacyStatus;
  /**
   * False when a date the answer depends on (today, or the day of `nextOpen`)
   * has no published duty list yet, so the answer may change once it is.
   */
  readonly dutiesPublished: boolean;
}

export interface NearbyPharmacy {
  readonly pharmacy: Pharmacy;
  readonly status: PharmacyStatus;
  /** Metres from the origin; null without an origin or a location. */
  readonly distance: number | null;
}

export declare function openIntervals(
  data: CityData,
  pharmacyId: string,
  from: Date,
  to: Date,
): OpenInterval[];

export declare function pharmacyStatus(data: CityData, pharmacyId: string, at: Date): StatusDetails;

export declare function openPharmacies(
  data: CityData,
  at: Date,
  options?: { readonly origin?: { readonly lat: number; readonly lon: number } },
): NearbyPharmacy[];

export interface PublishedDuty {
  readonly date: IsoDate;
  readonly groupId: string;
  readonly duty: DutyKind;
  readonly heading: string;
  readonly hours: TimeWindow | null;
}

export declare function publishedDuties(
  data: CityData,
  pharmacyId: string,
  fromDate: IsoDate,
): PublishedDuty[];
