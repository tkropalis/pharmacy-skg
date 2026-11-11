/**
 * View models for the search-engine pages. Pure functions from the loaded data to the strings
 * and links a page prints, so the .astro files only lay them out and the logic is testable.
 */
import { LOCALES, cityById, hasRegularHours, holidaysOn, isoWeekday } from '@pharmacy-skg/core';
import type { DutyKind, Locale, Pharmacy } from '@pharmacy-skg/core';
import { t } from '../../i18n/index.ts';
import {
  areaIndexPath,
  areaPath,
  dutyCityPath,
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
  scheduleLines,
  windowText,
} from './format.ts';
import type { RegularHoursView } from './format.ts';
import { pharmacyMapUrl } from '../deep-link.ts';
import { formatPhone } from '../format.ts';
import { KNOWN_GROUPS, groupDisplayName } from '../groups.ts';
import { displayName } from '../names.ts';
import { stripAccents } from '../places.ts';
import { breadcrumbJsonLd, jsonLdScript, pharmacyJsonLd, telHref } from './jsonld.ts';
import { latinOrGreek, nearbyView, nearestPharmacies } from './nearby.ts';
import type { NearbyView } from './nearby.ts';
import type { AreaInfo, DutyListing, SeoModel } from './model.ts';
import { romanize, romanizeLocality } from './translit.ts';

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

/** The kind of duty in plain words, the same as on the home screen (i18n/status-labels.ts). */
function dutyKindLabel(kind: DutyKind, locale: Locale): string {
  return t(locale).app.status.kinds[kind];
}

/**
 * The printed notes of a duty section, unless they were read into its extra hours (every note
 * seen so far is "Τρίτη, Πέμπτη & Παρασκευή … 14:00-17:00"): the page shows those once.
 */
function sectionNotes(section: { extraHours: readonly unknown[]; notes: readonly string[] }) {
  return section.extraHours.length > 0 ? [] : section.notes;
}

const greek = new Intl.Collator('el');

/** The city's name in the locale ("Λάρισα", "Larissa"). */
function cityName(cityId: string, locale: Locale): string {
  return cityById(cityId)?.name[locale] ?? cityId;
}

/** One step of a page's breadcrumb trail; the last is the page itself. */
export interface Crumb {
  readonly name: string;
  readonly path: string;
}

/** The latest update of several cities' data. */
function latest(models: readonly SeoModel[]): string {
  return models.map((model) => model.updatedAt).reduce((a, b) => (a > b ? a : b), '');
}

// --- Pharmacy page --------------------------------------------------------------------------

/**
 * One duty on a pharmacy's page, on one line, in the home screen's favourites format:
 * "Τρί 6 Οκτ · Νυχτερινή εφημερία · 21:00–00:00 · Επίσης: 14:00–17:00".
 */
export interface PharmacyDutyView {
  readonly date: string;
  /** "Τρί 6 Οκτ" */
  readonly dateLabel: string;
  /** The duty-date page, when that date has one. */
  readonly pagePath: string | null;
  readonly kindLabel: string;
  readonly hoursText: string;
  /** The section's extra hours that apply on this date ("14:00–17:00"). */
  readonly extraHours: readonly string[];
}

export interface ExtendedHoursView {
  readonly periodText: string;
  /** In the page's language, one line per set of days. */
  readonly lines: readonly string[];
  readonly announcementUrl: string;
}

/** The pharmacy's place on the map, or null when it has none. */
export interface PharmacyMapView {
  readonly lat: number;
  readonly lon: number;
  /** Only the locality is known: the marker is dashed and the page says so. */
  readonly approximate: boolean;
}

export interface PharmacyPageProps {
  readonly meta: PageMeta;
  readonly id: string;
  readonly cityId: string;
  /** The registered name (the title and the search engines), in Latin letters on an English page. */
  readonly name: string;
  /** The heading and the labels: the name without its legal form, in the page's alphabet. */
  readonly shortName: string;
  /** English pages keep the Greek name and address: they are what is on the sign. */
  readonly nativeName: string | null;
  readonly nativeAddress: string | null;
  readonly address: string;
  readonly locality: string;
  readonly postcode: string | null;
  /** "Κλήση 2310 023026", or null when there is no phone number. */
  readonly callText: string | null;
  readonly phoneHref: string | null;
  readonly localityLabel: string;
  readonly areaPagePath: string | null;
  readonly directionsUrl: string;
  readonly map: PharmacyMapView | null;
  /** The home screen with this pharmacy chosen on the big map. */
  readonly mapPath: string;
  /** The nearest pharmacies; the browser puts the ones open now in their place. */
  readonly nearby: readonly NearbyView[];
  readonly breadcrumbs: readonly Crumb[];
  /** Null where the city's regular hours are not known (decision D26): call for the hours. */
  readonly regularHours: RegularHoursView | null;
  readonly regularClosedText: string | null;
  readonly extendedHours: readonly ExtendedHoursView[];
  readonly upcomingDuties: readonly PharmacyDutyView[];
  readonly reportPath: string;
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
  const holiday = holidaysOn(model.cityId, date, group.id).length > 0;
  return {
    date,
    dateLabel: formatShortDate(date, locale),
    pagePath: model.publishedDates.includes(date) ? dutyPath(locale, model.cityId, date) : null,
    kindLabel: dutyKindLabel(section.kind, locale),
    hoursText: windowText(section.hours, seo),
    extraHours: section.extraHours
      .filter(
        (extra) => extra.weekdays.includes(isoWeekday(date)) && !(extra.exceptHolidays && holiday),
      )
      .map((extra) => `${extra.from}–${extra.to}`),
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
  const upcoming = listings.filter((l) => l.date >= model.today);

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
      lines: scheduleLines(entry.schedule, locale, seo),
      announcementUrl: file.announcementUrl,
    });
  }

  const regularHours = hasRegularHours(model.cityId, model.today)
    ? regularHoursView(model.cityId, model.today, seo, pharmacy.groupId)
    : null;
  const area = model.areaByLocality.get(pharmacy.locality);
  const url = new URL(path(locale), siteOrigin).href;
  const latin = locale === 'en';
  const name = latin ? latinOrGreek(displayName(pharmacy.name), locale) : pharmacy.name;
  const address = latinOrGreek(pharmacy.address, locale);
  const localityLabel = areaLabel(pharmacy.locality, locale);
  const city = cityName(model.cityId, locale);
  const directions = directionsUrl(pharmacy);
  const location = pharmacy.location;
  const areaCrumbPath = area === undefined ? null : areaPath(locale, model.cityId, area.slug);
  const breadcrumbs: Crumb[] = [
    { name: seo.area.allAreas, path: areaIndexPath(locale) },
    ...(areaCrumbPath === null ? [] : [{ name: localityLabel, path: areaCrumbPath }]),
    { name, path: path(locale) },
  ];

  return {
    meta: meta(
      locale,
      fill(seo.pharmacy.title, { name, locality: localityLabel }),
      fill(seo.pharmacy.description, { name, address, locality: localityLabel }),
      path,
    ),
    id,
    cityId: model.cityId,
    name,
    shortName: latinOrGreek(displayName(pharmacy.name), locale),
    nativeName: latin ? pharmacy.name : null,
    nativeAddress: latin ? pharmacy.address : null,
    address,
    locality: pharmacy.locality,
    postcode: pharmacy.postcode,
    callText:
      pharmacy.phone === null
        ? null
        : fill(seo.pharmacy.call, { phone: formatPhone(pharmacy.phone) }),
    phoneHref: telHref(pharmacy.phone),
    localityLabel,
    areaPagePath: areaCrumbPath,
    directionsUrl: directions,
    map:
      location === null
        ? null
        : {
            lat: location.lat,
            lon: location.lon,
            approximate: location.precision === 'locality',
          },
    mapPath: pharmacyMapUrl(locale, model.cityId, id),
    nearby: nearestPharmacies(model.pharmacies, pharmacy).map((near) =>
      nearbyView(near.pharmacy, near.distance, locale, city, d.app.row),
    ),
    breadcrumbs,
    regularHours,
    regularClosedText:
      regularHours === null || regularHours.closedDays === ''
        ? null
        : fill(seo.pharmacy.regularClosed, { days: regularHours.closedDays }),
    extendedHours,
    upcomingDuties: upcoming.map((l) => dutyView(model, locale, l)),
    reportPath: `${localizedPath(locale, 'report')}?pharmacy=${encodeURIComponent(id)}`,
    updatedAt: model.updatedAt,
    updatedAtText: formatUpdatedAt(model.updatedAt, locale),
    jsonLd: jsonLdScript([
      pharmacyJsonLd(pharmacy, url, {
        mapUrl: directions,
        alternateName: latin ? name : undefined,
      }),
      breadcrumbJsonLd(breadcrumbs, siteOrigin),
    ]),
  };
}

// --- Duty pages -----------------------------------------------------------------------------

export interface DutyEntryView {
  readonly pharmacyId: string;
  /** Without its legal form, in Latin letters on English pages. */
  readonly name: string;
  /** "Αγία Βαρβάρα · Π.ΠΑΤΡΩΝ ΓΕΡΜΑΝΟΥ 80": the area first, since the rows are sorted by it. */
  readonly place: string;
  /** "2310 023026" */
  readonly phone: string;
  readonly phoneHref: string | null;
  /** "Κλήση: {name}" */
  readonly callLabel: string;
  /** The pharmacy's page, or null when the registry does not know the id. */
  readonly pagePath: string | null;
  /** For the map at the top; null when its position is not known. */
  readonly location: { readonly lat: number; readonly lon: number } | null;
}

export interface DutySectionView {
  readonly kindLabel: string;
  readonly hoursText: string;
  /** "08:00", "23:00" and whether it ends the next day, for marking the lists on duty now. */
  readonly window: { readonly from: string; readonly to: string; readonly nextDay: boolean } | null;
  readonly extraHours: readonly string[];
  readonly notes: readonly string[];
  readonly entries: readonly DutyEntryView[];
}

export interface DutyGroupView {
  readonly id: string;
  readonly name: string;
  /** The published PDF. */
  readonly sourceUrl: string;
  readonly sections: readonly DutySectionView[];
}

export interface DutyNeighbour {
  readonly date: string;
  readonly label: string;
  /** "Σάβ 7 Νοε" */
  readonly shortLabel: string;
  readonly path: string;
}

export interface DutyPageProps {
  readonly meta: PageMeta;
  readonly cityId: string;
  readonly date: string;
  readonly dateLabel: string;
  readonly h1: string;
  /** The h1 without its date, which the page sets on a line of its own; null if it does not end with it. */
  readonly h1Lead: string | null;
  /** The duty index, the city's page for today and, on a dated page, the date. */
  readonly breadcrumbs: readonly Crumb[];
  readonly prev: DutyNeighbour | null;
  readonly next: DutyNeighbour | null;
  readonly groups: readonly DutyGroupView[];
  /** The home screen opened on the city. */
  readonly mapPath: string;
  /** Names of the area groups with no list in this day's file (each group has its own PDF). */
  readonly missingGroups: readonly string[];
  readonly indexPath: string;
  readonly updatedAt: string;
  readonly updatedAtText: string;
}

function neighbour(cityId: string, date: string | undefined, locale: Locale): DutyNeighbour | null {
  if (date === undefined) return null;
  return {
    date,
    label: formatLongDate(date, locale),
    shortLabel: formatShortDate(date, locale),
    path: dutyPath(locale, cityId, date),
  };
}

/**
 * The groups that exist (seen in any loaded day, or on a pharmacy) but are not in this day's
 * file, by name; a group never seen in a list falls back to its id.
 */
function missingGroupNames(model: SeoModel, present: readonly string[], locale: Locale): string[] {
  const known = new Set<string>(model.groupNames.keys());
  for (const pharmacy of model.pharmacies)
    if (pharmacy.groupId !== null) known.add(pharmacy.groupId);
  const printed = KNOWN_GROUPS[model.cityId] ?? {};
  return [...known]
    .filter((id) => !present.includes(id))
    .map((id) => {
      const name =
        model.groupNames.get(id) ?? groupDisplayName(model.cityId, id, printed[id] ?? id);
      return locale === 'en' ? romanize(name) : name;
    })
    .sort((a, b) => greek.compare(a, b));
}

/**
 * A row of a day's list, as on the home screen: the name without its legal form, the area before
 * the street, a Call button. Sorted by area, so someone looking for theirs finds it by reading
 * down the left edge.
 */
function dutyEntryView(
  model: SeoModel,
  entry: { pharmacyId: string; name: string; address: string; locality: string; phone: string },
  locale: Locale,
  city: string,
): { view: DutyEntryView; sortKey: string } {
  const name = latinOrGreek(displayName(entry.name), locale);
  const locality = locale === 'en' ? romanizeLocality(entry.locality) : entry.locality;
  const address = latinOrGreek(entry.address, locale);
  const same = (a: string, b: string) => stripAccents(a).trim() === stripAccents(b).trim();
  const area = locality === city || locality === '' ? '' : locality;
  const place = area === '' || same(area, address) ? address : `${area} · ${address}`;
  const pharmacy = model.pharmacyById.get(entry.pharmacyId);
  return {
    sortKey: area,
    view: {
      pharmacyId: entry.pharmacyId,
      name,
      place,
      phone: formatPhone(entry.phone),
      phoneHref: telHref(entry.phone),
      callLabel: fill(t(locale).app.row.callLabel, { name }),
      pagePath: pharmacy === undefined ? null : pharmacyPath(locale, entry.pharmacyId),
      location:
        pharmacy?.location == null
          ? null
          : { lat: pharmacy.location.lat, lon: pharmacy.location.lon },
    },
  };
}

export function dutyPageProps(model: SeoModel, locale: Locale, date: string): DutyPageProps | null {
  const day = model.duties.get(date);
  const position = model.publishedDates.indexOf(date);
  if (day === undefined || position < 0) return null;
  const seo = t(locale).seo;
  const dateLabel = formatLongDate(date, locale);
  const city = cityName(model.cityId, locale);
  const title = fill(seo.duty.pageTitle, { city, date: dateLabel });
  const path = (l: Locale) => dutyPath(l, model.cityId, date);

  const groups = day.groups.map((group): DutyGroupView => ({
    id: group.id,
    name: groupDisplayName(model.cityId, group.id, group.name),
    sourceUrl: group.source.url,
    sections: group.sections.map((section): DutySectionView => ({
      kindLabel: dutyKindLabel(section.kind, locale),
      hoursText: windowText(section.hours, seo),
      extraHours: section.extraHours.map((extra) => extraHoursText(extra, seo)),
      notes: sectionNotes(section),
      window:
        section.hours === null
          ? null
          : { from: section.hours.from, to: section.hours.to, nextDay: section.hours.toNextDay },
      entries: section.entries
        .map((entry) => dutyEntryView(model, entry, locale, city))
        .sort(
          (a, b) => greek.compare(a.sortKey, b.sortKey) || greek.compare(a.view.name, b.view.name),
        )
        .map((entry) => entry.view),
    })),
  }));

  return {
    meta: meta(
      locale,
      title,
      fill(seo.duty.pageDescription, {
        city,
        date: dateLabel,
        source: model.dutySource[locale] ?? model.dutySource.el ?? '',
      }),
      path,
    ),
    cityId: model.cityId,
    date,
    dateLabel,
    h1: title,
    h1Lead: title.endsWith(dateLabel)
      ? title.slice(0, -dateLabel.length).replace(/[\s,]+$/u, '')
      : null,
    breadcrumbs: [
      { name: seo.footerDuty, path: dutyIndexPath(locale) },
      { name: city, path: dutyCityPath(locale, model.cityId) },
      { name: dateLabel, path: path(locale) },
    ],
    prev: neighbour(model.cityId, model.publishedDates[position - 1], locale),
    next: neighbour(model.cityId, model.publishedDates[position + 1], locale),
    groups,
    mapPath: pharmacyMapUrl(locale, model.cityId),
    missingGroups: missingGroupNames(
      model,
      day.groups.map((g) => g.id),
      locale,
    ),
    indexPath: dutyIndexPath(locale),
    updatedAt: model.updatedAt,
    updatedAtText: formatUpdatedAt(model.updatedAt, locale),
  };
}

/**
 * The date a city's page for today shows: today when its list is published, otherwise the next
 * published date, otherwise the last one. The page is built twice a day, so between midnight and
 * the morning build it still shows the day before; its heading always names the date.
 */
export function todayDutyDate(model: SeoModel): string | null {
  const dates = model.publishedDates;
  if (dates.includes(model.today)) return model.today;
  return dates.find((date) => date > model.today) ?? dates.at(-1) ?? null;
}

/**
 * A city's page for today ('/efimeries/thessaloniki/'): the dated page of todayDutyDate at an
 * address that does not change, so links and search results keep pointing at the current list.
 * Only the title, description, address and breadcrumb differ from the dated page.
 */
export function dutyTodayPageProps(model: SeoModel, locale: Locale): DutyPageProps | null {
  const date = todayDutyDate(model);
  const page = date === null ? null : dutyPageProps(model, locale, date);
  if (page === null) return null;
  const seo = t(locale).seo;
  const city = cityName(model.cityId, locale);
  return {
    ...page,
    meta: meta(
      locale,
      fill(seo.duty.todayTitle, { city }),
      fill(seo.duty.todayDescription, {
        city,
        source: model.dutySource[locale] ?? model.dutySource.el ?? '',
      }),
      (l) => dutyCityPath(l, model.cityId),
    ),
    breadcrumbs: page.breadcrumbs.slice(0, 2),
  };
}

export interface DutyIndexItem {
  readonly date: string;
  readonly label: string;
  readonly shortLabel: string;
  readonly path: string;
  readonly counts: string;
}

export interface DutyIndexCity {
  readonly id: string;
  readonly name: string;
  /** The city's page for today, or null when it has no published list. */
  readonly todayPath: string | null;
  readonly items: readonly DutyIndexItem[];
}

export interface DutyIndexProps {
  readonly meta: PageMeta;
  /** One section per city, in the order of CITIES. */
  readonly cities: readonly DutyIndexCity[];
  readonly updatedAt: string;
  readonly updatedAtText: string;
}

function dutyIndexItems(model: SeoModel, locale: Locale): DutyIndexItem[] {
  const seo = t(locale).seo;
  return model.publishedDates.map((date): DutyIndexItem => {
    const day = model.duties.get(date);
    const ids = new Set<string>();
    for (const group of day?.groups ?? []) {
      for (const section of group.sections) for (const e of section.entries) ids.add(e.pharmacyId);
    }
    return {
      date,
      label: formatLongDate(date, locale),
      shortLabel: formatShortDate(date, locale),
      path: dutyPath(locale, model.cityId, date),
      counts: fill(seo.duty.indexCounts, { groups: day?.groups.length ?? 0, pharmacies: ids.size }),
    };
  });
}

export function dutyIndexProps(models: readonly SeoModel[], locale: Locale): DutyIndexProps {
  const seo = t(locale).seo;
  const updatedAt = latest(models);
  return {
    meta: meta(locale, seo.duty.indexTitle, seo.duty.indexDescription, dutyIndexPath),
    cities: models.map((model) => ({
      id: model.cityId,
      name: cityName(model.cityId, locale),
      todayPath: todayDutyDate(model) === null ? null : dutyCityPath(locale, model.cityId),
      items: dutyIndexItems(model, locale),
    })),
    updatedAt,
    updatedAtText: formatUpdatedAt(updatedAt, locale),
  };
}

// --- Area pages -----------------------------------------------------------------------------

export interface AreaPharmacyView {
  readonly id: string;
  readonly name: string;
  readonly address: string;
  /** "2310 023026" */
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
    readonly kindLabel: string;
  }[];
}

export interface AreaPageProps {
  readonly meta: PageMeta;
  readonly slug: string;
  readonly locality: string;
  readonly label: string;
  readonly h1: string;
  /** All areas, then this area. */
  readonly breadcrumbs: readonly Crumb[];
  readonly pharmacies: readonly AreaPharmacyView[];
  readonly dutyDays: readonly AreaDutyDayView[];
  readonly indexPath: string;
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
  // The city too, unless the area is the city itself: many places share a name across Greece.
  const city = cityName(model.cityId, locale);
  const place = label === city ? label : `${label}, ${city}`;
  const path = (l: Locale) => areaPath(l, model.cityId, slug);

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
            kindLabel: dutyKindLabel(section.kind, locale),
          });
        }
      }
    }
    if (items.length > 0) {
      dutyDays.push({
        date,
        dateLabel: formatLongDate(date, locale),
        pagePath: dutyPath(locale, model.cityId, date),
        items,
      });
    }
  }

  return {
    meta: meta(
      locale,
      fill(seoArea.pageTitle, { area: place }),
      area.pharmacies.length === 1
        ? fill(seoArea.pageDescriptionOne, { area: label })
        : fill(seoArea.pageDescription, { area: label, count: area.pharmacies.length }),
      path,
    ),
    slug,
    locality: area.locality,
    label,
    h1: fill(seoArea.h1, { area: areaLabelBoth(area.locality, locale) }),
    breadcrumbs: [
      { name: seoArea.allAreas, path: areaIndexPath(locale) },
      { name: label, path: path(locale) },
    ],
    pharmacies: area.pharmacies.map((p) => ({
      id: p.id,
      name: p.name,
      address: p.address,
      phone: p.phone === null ? null : formatPhone(p.phone),
      phoneHref: telHref(p.phone),
      path: pharmacyPath(locale, p.id),
    })),
    dutyDays,
    indexPath: areaIndexPath(locale),
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

export interface AreaIndexCity {
  readonly id: string;
  readonly name: string;
  /**
   * Areas by duty group; `flat` (no group headings) when there is one group, as in the areas
   * whose lists cover the whole area, or when every group is a single area.
   */
  readonly groups: readonly AreaIndexGroup[];
  readonly flat: boolean;
}

export interface AreaIndexProps {
  readonly meta: PageMeta;
  /** One section per city, in the order of CITIES. */
  readonly cities: readonly AreaIndexCity[];
  readonly updatedAt: string;
  readonly updatedAtText: string;
}

/** A city's areas grouped by the duty group they mostly belong to, in alphabetical order. */
function areaIndexGroups(model: SeoModel, locale: Locale): AreaIndexGroup[] {
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
  return ordered.map(([id, areas]): AreaIndexGroup => {
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
        path: areaPath(locale, model.cityId, area.slug),
        count: area.pharmacies.length,
        countText: countText(area.pharmacies.length, locale),
      })),
    };
  });
}

export function areaIndexProps(models: readonly SeoModel[], locale: Locale): AreaIndexProps {
  const seo = t(locale).seo;
  const updatedAt = latest(models);
  return {
    meta: meta(locale, seo.area.indexTitle, seo.area.indexDescription, areaIndexPath),
    cities: models.map((model) => {
      const groups = areaIndexGroups(model, locale);
      return {
        id: model.cityId,
        name: cityName(model.cityId, locale),
        groups,
        flat: groups.length <= 1 || groups.every((group) => group.areas.length <= 1),
      };
    }),
    updatedAt,
    updatedAtText: formatUpdatedAt(updatedAt, locale),
  };
}
