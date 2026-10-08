/**
 * What the update command needs to know about one covered city (one pharmacists' association):
 * where its duty lists and extended hours come from, how its addresses are geocoded and what its
 * data should look like. Everything else in cli/update.ts is the same for every city.
 */
import type { City, DutyKind } from '@pharmacy-skg/core';
import type { DutyEntry, DutyList } from '../fsth/parse.ts';
import type { Warning } from '../registry/build.ts';
import type { GeocodeHit } from '../registry/geocode.ts';
import type { ExtendedHours, Meta } from '../schema.ts';

/**
 * One group's duty list for one day, before pharmacy ids are assigned. `source` says where it
 * came from; of two lists for the same day and group, the later `uploadedAt` wins.
 */
export interface FetchedDutyList {
  readonly list: DutyList;
  readonly source: { readonly url: string; readonly uploadedAt: string };
}

/** Coordinates a duty list gives for a pharmacy (ITeQ's details pages). */
export interface ListedLocation {
  readonly lat: number;
  readonly lon: number;
  /** Where they were read, e.g. the details page's URL. */
  readonly ref: string;
}

/**
 * The pharmacies a source names beyond the stored duty lists (Attica's site offers about 200
 * days, of which only the next 7 are stored): every pharmacy in the area, with the date it was
 * last named. Kept in inputs/roster.json between runs.
 */
export interface Roster {
  /** When every offered date was last read; a run reads them all again after a week. */
  readonly sweptAt: string;
  /** The last date read. */
  readonly readThrough: string;
  readonly entries: readonly RosterEntry[];
}

export interface RosterEntry extends DutyEntry {
  readonly groupId: string;
  /** The duty date that named it. */
  readonly date: string;
  readonly location: { readonly lat: number; readonly lon: number } | null;
}

export interface FetchContext {
  readonly today: string;
  /** Fetch duty lists published on or after this date. */
  readonly since: string;
  /** `${source.url}|${source.uploadedAt}` of every duty list already stored. */
  readonly knownSources: ReadonlySet<string>;
  /** The extended-hours lists already stored, by file name (`<from>_<to>.json`). */
  readonly extendedFiles: ReadonlyMap<string, ExtendedHours>;
  /** Coordinates already read from the lists, by pharmacy id (inputs/listed-locations.json). */
  readonly listedLocations: ReadonlyMap<string, ListedLocation>;
  /** The stored roster, if the city keeps one (inputs/roster.json). */
  readonly roster: Roster | null;
  readonly log: (message: string) => void;
}

export interface Fetched<T> {
  readonly items: readonly T[];
  /** Files that could not be read; validation decides whether the gap blocks publishing. */
  readonly failures: readonly Warning[];
}

export interface FetchedDutyLists extends Fetched<FetchedDutyList> {
  /** New coordinates the source gives, by the phone printed in the list. */
  readonly locations?: ReadonlyMap<string, ListedLocation>;
  /** The updated roster, for a source that names more pharmacies than the stored lists. */
  readonly roster?: Roster;
}

/** How addresses in the city are geocoded (registry/geocode.ts). */
export interface GeocodeArea {
  /** The place to ask for when searching a locality (default: its name). */
  readonly queryLocality?: (locality: string) => string;
  /** Whether a result belongs to the locality the list printed (default: always). */
  readonly accepts?: (hit: Pick<GeocodeHit, 'displayName'>, locality: string) => boolean;
}

/** What a plausible data set looks like for the city (validate.ts). */
export interface ValidationRules {
  /** The groups whose lists must be published for today and tomorrow. */
  readonly groupIds: readonly string[];
  /** Expected entries in a section; a count outside means the parser or the source broke. */
  readonly sectionRange: (groupId: string, kind: DutyKind) => readonly [number, number];
  readonly pharmacies: readonly [number, number];
  /** Fewest entries an extended-hours list may have; null when the city publishes none. */
  readonly minExtendedEntries: number | null;
}

export interface CityPipeline {
  readonly city: City;
  /** Credited in meta.json and on the about page. */
  readonly sources: Meta['sources'];
  /** Which of `sources` publishes the duty lists and the extended hours (if any). */
  readonly sourceIds: { readonly duty: string; readonly extended: string | null };
  /** New or re-published duty lists since `context.since`. */
  readonly fetchDutyLists: (context: FetchContext) => Promise<FetchedDutyLists>;
  /**
   * New or re-published extended-hours lists for periods not over yet, with empty pharmacy ids
   * (they are matched to the duty lists afterwards), keyed by file name.
   */
  readonly fetchExtendedHours: (
    context: FetchContext,
  ) => Promise<Fetched<readonly [file: string, list: ExtendedHours]>>;
  readonly geocoding: GeocodeArea;
  readonly rules: ValidationRules;
}
