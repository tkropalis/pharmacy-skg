/**
 * The published data format (data/<city>/), as plain types. The zod schemas in
 * @pharmacy-skg/ingest are the source of truth and are tested to stay
 * assignable to these types.
 */

import type { City } from './city.ts';

/** An ISO date, YYYY-MM-DD, in the city's time zone. */
export type IsoDate = string;
/** A local wall-clock time, HH:MM (00:00–23:59). */
export type LocalTime = string;

export const DUTY_KINDS = [
  'day',
  'saturday-extra',
  'on-duty',
  'overnight',
  'after-midnight',
] as const;
export type DutyKind = (typeof DUTY_KINDS)[number];

/** Local times. `toNextDay`: the window ends on the next day (including at 00:00). */
export interface TimeWindow {
  readonly from: LocalTime;
  readonly to: LocalTime;
  readonly toNextDay: boolean;
}

/** Extra opening printed under a heading, e.g. Tue/Thu/Fri 14:00–17:00 except holidays. */
export interface ExtraHours {
  /** ISO weekdays, 1 = Monday. */
  readonly weekdays: readonly number[];
  readonly from: LocalTime;
  readonly to: LocalTime;
  readonly exceptHolidays: boolean;
}

export interface DutyEntry {
  readonly pharmacyId: string;
  readonly name: string;
  readonly address: string;
  readonly locality: string;
  readonly phone: string;
}

export interface DutySection {
  readonly kind: DutyKind;
  /** As printed. */
  readonly heading: string;
  /** From the heading; null when the heading states no hours (decision D21). */
  readonly hours: TimeWindow | null;
  /**
   * On call (some ITeQ lists, marked "*"): the pharmacist may close at midday and is not in the
   * pharmacy overnight, and serves whoever phones. During `hours` the pharmacy is on duty but
   * not open: "call first", like a duty without hours.
   */
  readonly onCall?: boolean;
  readonly extraHours: readonly ExtraHours[];
  readonly notes: readonly string[];
  readonly entries: readonly DutyEntry[];
}

export interface DutyGroup {
  /** The duty group, one per list the association publishes, e.g. 'metro', 'thermi'. */
  readonly id: string;
  readonly name: string;
  readonly source: { readonly url: string; readonly uploadedAt: string };
  readonly sections: readonly DutySection[];
}

/** data/<city>/duties/<date>.json */
export interface DutyDay {
  readonly schemaVersion: 1;
  readonly date: IsoDate;
  readonly groups: readonly DutyGroup[];
}

export interface Location {
  readonly lat: number;
  readonly lon: number;
  /** `list`: the coordinates the duty list itself gives. */
  readonly source: 'override' | 'list' | 'overture' | 'nominatim';
  readonly precision: 'exact' | 'street' | 'locality';
  readonly ref?: string | undefined;
}

export interface Pharmacy {
  readonly id: string;
  readonly name: string;
  readonly address: string;
  readonly locality: string;
  readonly postcode: string | null;
  readonly phone: string | null;
  readonly groupId: string | null;
  readonly location: Location | null;
  /** Ids of the lists it was found in (meta.json's `sources`). */
  readonly sources: readonly string[];
  readonly firstSeen: IsoDate;
  readonly lastSeen: IsoDate;
}

/** data/<city>/pharmacies.json */
export interface Pharmacies {
  readonly schemaVersion: 1;
  readonly pharmacies: readonly Pharmacy[];
}

export interface TimeRange {
  readonly from: LocalTime;
  readonly to: LocalTime;
}

export type Schedule =
  | {
      readonly type: 'weekly';
      /** Keyed by ISO weekday '1'–'7'. */
      readonly days: Readonly<Record<string, readonly TimeRange[]>>;
    }
  | { readonly type: 'dates'; readonly dates: Readonly<Record<IsoDate, readonly TimeRange[]>> };

export interface ExtendedHoursEntry {
  readonly pharmacyId: string;
  readonly name: string;
  readonly address: string;
  readonly postcode: string;
  readonly area: string;
  readonly schedule: Schedule;
  readonly scheduleText: string;
}

/** data/<city>/extended-hours/<from>_<to>.json */
export interface ExtendedHours {
  readonly schemaVersion: 1;
  readonly period: { readonly from: IsoDate; readonly to: IsoDate };
  readonly title: string;
  readonly announcementUrl: string;
  readonly source: { readonly url: string; readonly uploadedAt: string };
  readonly entries: readonly ExtendedHoursEntry[];
}

export interface SourceCredit {
  readonly id: string;
  readonly name: Readonly<Partial<Record<'el' | 'en', string>>>;
  readonly url: string;
  readonly note?: string | undefined;
}

/** data/<city>/meta.json */
export interface Meta {
  readonly schemaVersion: 1;
  readonly city: string;
  /** When the data last changed. */
  readonly updatedAt: string;
  /**
   * When the sources were last read and validated, changed or not: the age people are shown.
   * Missing in meta files written before it existed.
   */
  readonly checkedAt?: string | undefined;
  readonly duties: { readonly from: IsoDate; readonly to: IsoDate } | null;
  readonly extendedHours: readonly {
    readonly from: IsoDate;
    readonly to: IsoDate;
    readonly file: string;
  }[];
  readonly sources: readonly SourceCredit[];
}

/** Everything the open-now engine needs for one city, loaded by the app. */
export interface CityData {
  readonly city: City;
  readonly pharmacies: readonly Pharmacy[];
  /** Published duty lists, by date. Missing dates are unpublished, not "no duty". */
  readonly duties: ReadonlyMap<IsoDate, DutyDay>;
  readonly extendedHours: readonly ExtendedHours[];
}
