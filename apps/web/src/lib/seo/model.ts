import type {
  DutyDay,
  DutyGroup,
  DutySection,
  ExtendedHours,
  IsoDate,
  Pharmacy,
} from '@pharmacy-skg/core';
import { addDays } from '@pharmacy-skg/core';
import { selectDutyFiles } from '../../../integrations/data-files.ts';
import { groupDisplayName } from '../groups.ts';
import { assignSlugs } from './translit.ts';

/** Most duty-date pages one build generates (bounds the build size). */
export const MAX_DUTY_PAGES = 45;
/** How many days back a pharmacy page lists its duties. */
export const RECENT_DUTY_DAYS = 14;

/** What the build reads from data/<city>/. */
export interface SeoInput {
  readonly cityId: string;
  /** The build day in the city's time zone. */
  readonly today: IsoDate;
  /** meta.json `updatedAt`. */
  readonly updatedAt: string;
  /** The association that publishes the duty lists (meta.json's first source), by locale. */
  readonly dutySource: Readonly<Partial<Record<'el' | 'en', string>>>;
  readonly pharmacies: readonly Pharmacy[];
  /** Every loaded duty file; at least `today - RECENT_DUTY_DAYS` onward. */
  readonly duties: ReadonlyMap<IsoDate, DutyDay>;
  readonly extendedHours: readonly ExtendedHours[];
}

/** One section of one group of one date's list that names a pharmacy. */
export interface DutyListing {
  readonly date: IsoDate;
  readonly group: DutyGroup;
  readonly section: DutySection;
}

export interface AreaInfo {
  /** URL slug, unique and stable. */
  readonly slug: string;
  /** The locality as the data spells it (Greek). */
  readonly locality: string;
  /** The duty group most of the locality's pharmacies belong to, or null. */
  readonly groupId: string | null;
  /** Sorted by name. */
  readonly pharmacies: readonly Pharmacy[];
}

export interface SeoModel {
  readonly cityId: string;
  readonly today: IsoDate;
  readonly updatedAt: string;
  readonly dutySource: Readonly<Partial<Record<'el' | 'en', string>>>;
  /** Sorted by id. */
  readonly pharmacies: readonly Pharmacy[];
  readonly pharmacyById: ReadonlyMap<string, Pharmacy>;
  readonly groupNames: ReadonlyMap<string, string>;
  readonly duties: ReadonlyMap<IsoDate, DutyDay>;
  /** Dates that get a page (the ones whose duty file is published into dist), ascending. */
  readonly publishedDates: readonly IsoDate[];
  readonly extendedHours: readonly ExtendedHours[];
  /** Pharmacy id to its duty listings, ascending by date. */
  readonly listingsByPharmacy: ReadonlyMap<string, readonly DutyListing[]>;
  /** Sorted by slug. */
  readonly areas: readonly AreaInfo[];
  readonly areaByLocality: ReadonlyMap<string, AreaInfo>;
  readonly areaBySlug: ReadonlyMap<string, AreaInfo>;
}

const greek = new Intl.Collator('el');

/** The dates that get a page: the data integration's window, at most MAX_DUTY_PAGES. */
export function publishedDutyDates(dates: Iterable<IsoDate>, today: IsoDate): IsoDate[] {
  const names = [...dates].map((date) => `${date}.json`);
  return selectDutyFiles(names, today)
    .map((name) => name.slice(0, -'.json'.length))
    .slice(0, MAX_DUTY_PAGES);
}

function dominantGroup(pharmacies: readonly Pharmacy[]): string | null {
  const counts = new Map<string, number>();
  for (const { groupId } of pharmacies) {
    if (groupId !== null) counts.set(groupId, (counts.get(groupId) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [id, count] of [...counts].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (best === null || count > (counts.get(best) ?? 0)) best = id;
  }
  return best;
}

export function buildSeoModel(input: SeoInput): SeoModel {
  const pharmacies = [...input.pharmacies].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const pharmacyById = new Map(pharmacies.map((p) => [p.id, p]));

  const groupNames = new Map<string, string>();
  const listingsByPharmacy = new Map<string, DutyListing[]>();
  for (const date of [...input.duties.keys()].sort()) {
    const day = input.duties.get(date);
    for (const group of day?.groups ?? []) {
      groupNames.set(group.id, groupDisplayName(input.cityId, group.id, group.name));
      for (const section of group.sections) {
        for (const { pharmacyId } of section.entries) {
          const list = listingsByPharmacy.get(pharmacyId) ?? [];
          list.push({ date, group, section });
          listingsByPharmacy.set(pharmacyId, list);
        }
      }
    }
  }

  const byLocality = new Map<string, Pharmacy[]>();
  for (const pharmacy of pharmacies) {
    if (pharmacy.locality.trim() === '') continue;
    const list = byLocality.get(pharmacy.locality) ?? [];
    list.push(pharmacy);
    byLocality.set(pharmacy.locality, list);
  }
  const slugs = assignSlugs(byLocality.keys());
  const areas: AreaInfo[] = [...byLocality.entries()]
    .map(([locality, list]) => ({
      slug: slugs.get(locality) ?? locality,
      locality,
      groupId: dominantGroup(list),
      pharmacies: list.sort((a, b) => greek.compare(a.name, b.name) || (a.id < b.id ? -1 : 1)),
    }))
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

  return {
    cityId: input.cityId,
    today: input.today,
    updatedAt: input.updatedAt,
    dutySource: input.dutySource,
    pharmacies,
    pharmacyById,
    groupNames,
    duties: input.duties,
    publishedDates: publishedDutyDates(input.duties.keys(), input.today),
    extendedHours: input.extendedHours,
    listingsByPharmacy,
    areas,
    areaByLocality: new Map(areas.map((a) => [a.locality, a])),
    areaBySlug: new Map(areas.map((a) => [a.slug, a])),
  };
}

/** The earliest duty date the loader must read: the pharmacy pages look this far back. */
export function earliestDutyDate(today: IsoDate): IsoDate {
  return addDays(today, -RECENT_DUTY_DAYS);
}
