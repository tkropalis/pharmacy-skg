/**
 * View models for the search-engine pages. Pure functions from the loaded data to the strings
 * and links a page prints, so the .astro files only lay them out and the logic is testable.
 */
import { LOCALES } from '@pharmacy-skg/core';
import type { DutyKind, Locale, Pharmacy } from '@pharmacy-skg/core';
import { t } from '../../i18n/index.ts';
import {
  areaIndexPath,
  areaPath,
  dutyIndexPath,
  dutyPath,
  localizedPath,
  pharmacyPath,
} from '../../i18n/routes.ts';
import { formatUpdatedAt } from '../freshness.ts';
import {
  extraHoursText,
  fill,
  formatDate,
  formatLongDate,
  formatShortDate,
  regularHoursView,
  windowText,
} from './format.ts';
import type { RegularHoursView } from './format.ts';
import { jsonLdScript, pharmacyJsonLd, telHref } from './jsonld.ts';
import { RECENT_DUTY_DAYS } from './model.ts';
import type { AreaInfo, DutyListing, SeoModel } from './model.ts';
import { romanize, romanizeLocality } from './translit.ts';
import { addDays } from '../dates.ts';

export type Alternates = Record<Locale, string>;

export interface PageMeta {
  readonly locale: Locale;
  readonly title: string;
  readonly description: string;
  /** This page's path in this locale. */
  readonly path: string;
  /** The same page's path in every locale (hreflang and the language switcher). */
  readonly alternates: Alternates;
}

/** The same page in every locale: `alternatesFor((l) => pharmacyPath(l, id))`. */
export function alternatesFor(path: (locale: Locale) => string): Alternates {
  return Object.fromEntries(LOCALES.map((l) => [l, path(l)])) as Alternates;
}

function meta(
  locale: Locale,
  title: string,
  description: string,
  path: (locale: Locale) => string,
): PageMeta {
  return { locale, title, description, path: path(locale), alternates: alternatesFor(path) };
}

/** English pages show a transliterated name; Greek pages the name as the data spells it. */
export function areaLabel(locality: string, locale: Locale): string {
  return locale === 'el' ? locality : romanizeLocality(locality);
}

/** "Kalamaria (Καλαμαριά)" in English, "Καλαμαριά" in Greek. */
export function areaLabelBoth(locality: string, locale: Locale): string {
  return locale === 'el' ? locality : `${romanizeLocality(locality)} (${locality})`;
}

function groupLabel(name: string, locale: Locale): string {
  return locale === 'el' ? name : `${romanize(name)} (${name})`;
}

function dutyKindLabel(kind: DutyKind, locale: Locale): string {
  return t(locale).seo.duty.kinds[kind];
}

const greek = new Intl.Collator('el');

// --- Pharmacy page --------------------------------------------------------------------------

export interface PharmacyDutyView {
  readonly date: string;
  readonly dateLabel: string;
  /** The duty-date page, when that date has one. */
  readonly pagePath: string | null;
  readonly groupName: string;
  readonly heading: string;
  readonly kindLabel: string;
  readonly hoursText: string;
  readonly extraHours: readonly string[];
  readonly notes: readonly string[];
}

export interface ExtendedHoursView {
  readonly periodText: string;
  readonly scheduleText: string;
  readonly announcementUrl: string;
}

export interface PharmacyPageProps {
  readonly meta: PageMeta;
  readonly id: string;
  readonly name: string;
  readonly address: string;
  readonly locality: string;
  readonly postcode: string | null;
  readonly phone: string | null;
  readonly phoneHref: string | null;
  readonly localityLabel: string;
  readonly areaPagePath: string | null;
  readonly groupName: string | null;
  readonly directionsUrl: string;
  readonly regularHours: RegularHoursView;
  readonly regularClosedText: string | null;
  readonly extendedHours: readonly ExtendedHoursView[];
  readonly upcomingDuties: readonly PharmacyDutyView[];
  readonly recentDuties: readonly PharmacyDutyView[];
  readonly reportPath: string;
  readonly homePath: string;
  readonly dutyIndexPath: string;
  readonly updatedAt: string;
  readonly updatedAtText: string;
  readonly jsonLd: string;
}

/** A Google Maps directions deep link: coordinates when the geocoder was sure, else the address. */
export function directionsUrl(pharmacy: Pharmacy): string {
  const loc = pharmacy.location;
  const destination =
    loc !== null && (loc.precision === 'exact' || loc.precision === 'street')
      ? `${loc.lat},${loc.lon}`
      : [pharmacy.address, pharmacy.postcode, pharmacy.locality].filter(Boolean).join(', ');
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

function dutyView(model: SeoModel, locale: Locale, listing: DutyListing): PharmacyDutyView {
  const seo = t(locale).seo;
  const { date, group, section } = listing;
  return {
    date,
    dateLabel: formatLongDate(date, locale),
    pagePath: model.publishedDates.includes(date) ? dutyPath(locale, date) : null,
    groupName: group.name,
    heading: section.heading,
    kindLabel: dutyKindLabel(section.kind, locale),
    hoursText: windowText(section.hours, seo),
    extraHours: section.extraHours.map((extra) => extraHoursText(extra, seo)),
    notes: section.notes,
  };
}

export function pharmacyPageProps(
  model: SeoModel,
  locale: Locale,
  id: string,
  siteOrigin: string,
): PharmacyPageProps | null {
  const pharmacy = model.pharmacyById.get(id);
  if (pharmacy === undefined) return null;
  const d = t(locale);
  const seo = d.seo;
  const path = (l: Locale) => pharmacyPath(l, id);

  const listings = model.listingsByPharmacy.get(id) ?? [];
  const recentFrom = addDays(model.today, -RECENT_DUTY_DAYS);
  const upcoming = listings.filter((l) => l.date >= model.today);
  const recent = listings.filter((l) => l.date < model.today && l.date >= recentFrom).reverse();

  const extendedHours: ExtendedHoursView[] = [];
  for (const file of model.extendedHours) {
    if (file.period.to < model.today) continue;
    const entry = file.entries.find((e) => e.pharmacyId === id);
    if (entry === undefined) continue;
    extendedHours.push({
      periodText: fill(seo.pharmacy.extendedPeriod, {
        from: formatDate(file.period.from, locale),
        to: formatDate(file.period.to, locale),
      }),
      scheduleText: entry.scheduleText,
      announcementUrl: file.announcementUrl,
    });
  }

  const regularHours = regularHoursView(model.cityId, model.today, seo);
  const area = model.areaByLocality.get(pharmacy.locality);
  const groupName =
    pharmacy.groupId === null ? null : (model.groupNames.get(pharmacy.groupId) ?? null);
  const url = new URL(path(locale), siteOrigin).href;

  return {
    meta: meta(
      locale,
      fill(seo.pharmacy.title, {
        name: pharmacy.name,
        locality: areaLabel(pharmacy.locality, locale),
      }),
      fill(seo.pharmacy.description, {
        name: pharmacy.name,
        address: pharmacy.address,
        locality: areaLabel(pharmacy.locality, locale),
      }),
      path,
    ),
    id,
    name: pharmacy.name,
    address: pharmacy.address,
    locality: pharmacy.locality,
    postcode: pharmacy.postcode,
    phone: pharmacy.phone,
    phoneHref: telHref(pharmacy.phone),
    localityLabel: areaLabel(pharmacy.locality, locale),
    areaPagePath: area === undefined ? null : areaPath(locale, area.slug),
    groupName: groupName === null ? null : groupLabel(groupName, locale),
    directionsUrl: directionsUrl(pharmacy),
    regularHours,
    regularClosedText:
      regularHours.closedDays === ''
        ? null
        : fill(seo.pharmacy.regularClosed, { days: regularHours.closedDays }),
    extendedHours,
    upcomingDuties: upcoming.map((l) => dutyView(model, locale, l)),
    recentDuties: recent.map((l) => dutyView(model, locale, l)),
    reportPath: `${localizedPath(locale, 'report')}?pharmacy=${encodeURIComponent(id)}`,
    homePath: localizedPath(locale, 'home'),
    dutyIndexPath: dutyIndexPath(locale),
    updatedAt: model.updatedAt,
    updatedAtText: formatUpdatedAt(model.updatedAt, locale),
    jsonLd: jsonLdScript(pharmacyJsonLd(pharmacy, url)),
  };
}

// --- Duty pages -----------------------------------------------------------------------------

export interface DutyEntryView {
  readonly pharmacyId: string;
  readonly name: string;
  readonly address: string;
  readonly locality: string;
  readonly phone: string;
  readonly phoneHref: string | null;
  /** The pharmacy's page, or null when the registry does not know the id. */
  readonly pagePath: string | null;
}

export interface DutySectionView {
  readonly heading: string;
  readonly kindLabel: string;
  readonly hoursText: string;
  readonly extraHours: readonly string[];
  readonly notes: readonly string[];
  readonly entries: readonly DutyEntryView[];
}

export interface DutyGroupView {
  readonly id: string;
  readonly name: string;
  readonly sourceUrl: string;
  readonly uploadedAt: string;
  readonly uploadedAtText: string;
  readonly sections: readonly DutySectionView[];
}

export interface DutyNeighbour {
  readonly date: string;
  readonly label: string;
  readonly path: string;
}

export interface DutyPageProps {
  readonly meta: PageMeta;
  readonly date: string;
  readonly dateLabel: string;
  readonly h1: string;
  readonly prev: DutyNeighbour | null;
  readonly next: DutyNeighbour | null;
  readonly groups: readonly DutyGroupView[];
  readonly indexPath: string;
  readonly updatedAt: string;
  readonly updatedAtText: string;
}

function neighbour(date: string | undefined, locale: Locale): DutyNeighbour | null {
  if (date === undefined) return null;
  return { date, label: formatLongDate(date, locale), path: dutyPath(locale, date) };
}

export function dutyPageProps(model: SeoModel, locale: Locale, date: string): DutyPageProps | null {
  const day = model.duties.get(date);
  const position = model.publishedDates.indexOf(date);
  if (day === undefined || position < 0) return null;
  const seo = t(locale).seo;
  const dateLabel = formatLongDate(date, locale);
  const title = fill(seo.duty.pageTitle, { date: dateLabel });

  const groups = day.groups.map((group): DutyGroupView => {
    const uploadedAt = group.source.uploadedAt;
    return {
      id: group.id,
      name: group.name,
      sourceUrl: group.source.url,
      uploadedAt,
      uploadedAtText: formatUpdatedAt(uploadedAt, locale),
      sections: group.sections.map((section): DutySectionView => ({
        heading: section.heading,
        kindLabel: dutyKindLabel(section.kind, locale),
        hoursText: windowText(section.hours, seo),
        extraHours: section.extraHours.map((extra) => extraHoursText(extra, seo)),
        notes: section.notes,
        entries: section.entries.map((entry): DutyEntryView => ({
          pharmacyId: entry.pharmacyId,
          name: entry.name,
          address: entry.address,
          locality: entry.locality,
          phone: entry.phone,
          phoneHref: telHref(entry.phone),
          pagePath: model.pharmacyById.has(entry.pharmacyId)
            ? pharmacyPath(locale, entry.pharmacyId)
            : null,
        })),
      })),
    };
  });

  return {
    meta: meta(locale, title, fill(seo.duty.pageDescription, { date: dateLabel }), (l) =>
      dutyPath(l, date),
    ),
    date,
    dateLabel,
    h1: title,
    prev: neighbour(model.publishedDates[position - 1], locale),
    next: neighbour(model.publishedDates[position + 1], locale),
    groups,
    indexPath: dutyIndexPath(locale),
    updatedAt: model.updatedAt,
    updatedAtText: formatUpdatedAt(model.updatedAt, locale),
  };
}

export interface DutyIndexItem {
  readonly date: string;
  readonly label: string;
  readonly shortLabel: string;
  readonly path: string;
  readonly counts: string;
}

export interface DutyIndexProps {
  readonly meta: PageMeta;
  readonly items: readonly DutyIndexItem[];
  readonly updatedAt: string;
  readonly updatedAtText: string;
}

export function dutyIndexProps(model: SeoModel, locale: Locale): DutyIndexProps {
  const seo = t(locale).seo;
  const items = model.publishedDates.map((date): DutyIndexItem => {
    const day = model.duties.get(date);
    const ids = new Set<string>();
    for (const group of day?.groups ?? []) {
      for (const section of group.sections) for (const e of section.entries) ids.add(e.pharmacyId);
    }
    return {
      date,
      label: formatLongDate(date, locale),
      shortLabel: formatShortDate(date, locale),
      path: dutyPath(locale, date),
      counts: fill(seo.duty.indexCounts, { groups: day?.groups.length ?? 0, pharmacies: ids.size }),
    };
  });
  return {
    meta: meta(locale, seo.duty.indexTitle, seo.duty.indexDescription, dutyIndexPath),
    items,
    updatedAt: model.updatedAt,
    updatedAtText: formatUpdatedAt(model.updatedAt, locale),
  };
}

// --- Area pages -----------------------------------------------------------------------------

export interface AreaPharmacyView {
  readonly id: string;
  readonly name: string;
  readonly address: string;
  readonly phone: string | null;
  readonly phoneHref: string | null;
  readonly path: string;
}

export interface AreaDutyDayView {
  readonly date: string;
  readonly dateLabel: string;
  readonly pagePath: string;
  readonly items: readonly {
    readonly pharmacyName: string;
    readonly pharmacyPath: string | null;
    readonly heading: string;
  }[];
}

export interface AreaPageProps {
  readonly meta: PageMeta;
  readonly slug: string;
  readonly locality: string;
  readonly label: string;
  readonly h1: string;
  readonly groupName: string | null;
  readonly pharmacies: readonly AreaPharmacyView[];
  readonly dutyDays: readonly AreaDutyDayView[];
  readonly indexPath: string;
  readonly updatedAt: string;
  readonly updatedAtText: string;
}

function countText(count: number, locale: Locale): string {
  const area = t(locale).seo.area;
  return count === 1 ? area.countOne : fill(area.countMany, { count });
}

export function areaPageProps(model: SeoModel, locale: Locale, slug: string): AreaPageProps | null {
  const area = model.areaBySlug.get(slug);
  if (area === undefined) return null;
  const seo = t(locale).seo;
  const label = areaLabel(area.locality, locale);
  const seoArea = seo.area;

  const dutyDays: AreaDutyDayView[] = [];
  for (const date of model.publishedDates) {
    if (date < model.today) continue;
    const items: AreaDutyDayView['items'][number][] = [];
    for (const group of model.duties.get(date)?.groups ?? []) {
      for (const section of group.sections) {
        for (const entry of section.entries) {
          const registry = model.pharmacyById.get(entry.pharmacyId);
          if ((registry?.locality ?? entry.locality) !== area.locality) continue;
          items.push({
            pharmacyName: entry.name,
            pharmacyPath: registry === undefined ? null : pharmacyPath(locale, entry.pharmacyId),
            heading: section.heading,
          });
        }
      }
    }
    if (items.length > 0) {
      dutyDays.push({
        date,
        dateLabel: formatLongDate(date, locale),
        pagePath: dutyPath(locale, date),
        items,
      });
    }
  }

  const groupName = area.groupId === null ? null : (model.groupNames.get(area.groupId) ?? null);
  return {
    meta: meta(
      locale,
      fill(seoArea.pageTitle, { area: label }),
      fill(seoArea.pageDescription, { area: label, count: area.pharmacies.length }),
      (l) => areaPath(l, slug),
    ),
    slug,
    locality: area.locality,
    label,
    h1: fill(seoArea.h1, { area: areaLabelBoth(area.locality, locale) }),
    groupName: groupName === null ? null : groupLabel(groupName, locale),
    pharmacies: area.pharmacies.map((p) => ({
      id: p.id,
      name: p.name,
      address: p.address,
      phone: p.phone,
      phoneHref: telHref(p.phone),
      path: pharmacyPath(locale, p.id),
    })),
    dutyDays,
    indexPath: areaIndexPath(locale),
    updatedAt: model.updatedAt,
    updatedAtText: formatUpdatedAt(model.updatedAt, locale),
  };
}

export interface AreaIndexGroup {
  readonly id: string | null;
  readonly name: string;
  readonly areas: readonly {
    readonly slug: string;
    readonly label: string;
    readonly path: string;
    readonly count: number;
    readonly countText: string;
  }[];
}

export interface AreaIndexProps {
  readonly meta: PageMeta;
  readonly groups: readonly AreaIndexGroup[];
  readonly updatedAt: string;
  readonly updatedAtText: string;
}

/** Areas grouped by the ΦΣΘ group they mostly belong to; groups and areas in alphabetical order. */
export function areaIndexProps(model: SeoModel, locale: Locale): AreaIndexProps {
  const seo = t(locale).seo;
  const byGroup = new Map<string | null, AreaInfo[]>();
  for (const area of model.areas) {
    const known = area.groupId !== null && model.groupNames.has(area.groupId);
    const key = known ? area.groupId : null;
    byGroup.set(key, [...(byGroup.get(key) ?? []), area]);
  }
  const ordered = [...byGroup.entries()].sort(([a], [b]) => {
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
    return greek.compare(model.groupNames.get(a) ?? a, model.groupNames.get(b) ?? b);
  });
  const groups = ordered.map(([id, areas]): AreaIndexGroup => {
    const name =
      id === null ? seo.area.otherGroup : groupLabel(model.groupNames.get(id) ?? id, locale);
    const sorted = [...areas].sort((a, b) =>
      locale === 'el'
        ? greek.compare(a.locality, b.locality)
        : areaLabel(a.locality, locale).localeCompare(areaLabel(b.locality, locale), 'en'),
    );
    return {
      id,
      name,
      areas: sorted.map((area) => ({
        slug: area.slug,
        label: areaLabel(area.locality, locale),
        path: areaPath(locale, area.slug),
        count: area.pharmacies.length,
        countText: countText(area.pharmacies.length, locale),
      })),
    };
  });
  return {
    meta: meta(locale, seo.area.indexTitle, seo.area.indexDescription, areaIndexPath),
    groups,
    updatedAt: model.updatedAt,
    updatedAtText: formatUpdatedAt(model.updatedAt, locale),
  };
}
