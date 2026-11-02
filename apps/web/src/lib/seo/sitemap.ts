import { LOCALES } from '@pharmacy-skg/core';
import type { Locale } from '@pharmacy-skg/core';
import {
  alternatePaths,
  areaIndexPath,
  areaPath,
  dutyCityPath,
  dutyIndexPath,
  dutyPath,
  pharmacyPath,
  ROUTE_KEYS,
} from '../../i18n/routes.ts';
import type { SeoModel } from './model.ts';
import { alternatesFor, todayDutyDate } from './views.ts';
import type { Alternates } from './views.ts';

/**
 * Pages left out of the sitemap: the problem report form and the data status page have nothing
 * to search for.
 */
const EXCLUDED_ROUTES: readonly string[] = ['report', 'status'];

export interface SitemapEntry {
  /** The page in every locale. */
  readonly alternates: Alternates;
  /** W3C date (YYYY-MM-DD) of the last data change, for data pages. */
  readonly lastmod?: string | undefined;
}

/** The date of the latest data change among the cities, W3C style. */
function latestChange(models: readonly SeoModel[]): string {
  return models.map((model) => model.updatedAt.slice(0, 10)).reduce((a, b) => (a > b ? a : b), '');
}

/** The pages that belong to no city: the home, about and privacy pages and the two indexes. */
export function pageEntries(models: readonly SeoModel[]): SitemapEntry[] {
  const latest = latestChange(models);
  const entries: SitemapEntry[] = [];
  for (const route of ROUTE_KEYS) {
    if (EXCLUDED_ROUTES.includes(route)) continue;
    entries.push({ alternates: alternatePaths(route) });
  }
  entries.push({ alternates: alternatesFor(dutyIndexPath), lastmod: latest });
  entries.push({ alternates: alternatesFor(areaIndexPath), lastmod: latest });
  return entries;
}

/**
 * One city's pages: its page for today, its dated duty pages, its areas and its pharmacies. A
 * page's lastmod is the city's last data change.
 */
export function cityEntries(model: SeoModel): SitemapEntry[] {
  const lastmod = model.updatedAt.slice(0, 10);
  const entries: SitemapEntry[] = [];
  if (todayDutyDate(model) !== null) {
    entries.push({ alternates: alternatesFor((l) => dutyCityPath(l, model.cityId)), lastmod });
  }
  for (const date of model.publishedDates) {
    entries.push({ alternates: alternatesFor((l) => dutyPath(l, model.cityId, date)), lastmod });
  }
  for (const area of model.areas) {
    entries.push({
      alternates: alternatesFor((l) => areaPath(l, model.cityId, area.slug)),
      lastmod,
    });
  }
  for (const pharmacy of model.pharmacies) {
    entries.push({ alternates: alternatesFor((l) => pharmacyPath(l, pharmacy.id)), lastmod });
  }
  return entries;
}

/**
 * Every indexable page of every city, one entry per page (not per locale). The 404 page is never
 * listed. The site publishes them as one sitemap per city and one for the pages that belong to
 * none (`sitemapRefs`), under an index.
 */
export function sitemapEntries(models: readonly SeoModel[]): SitemapEntry[] {
  return [...pageEntries(models), ...models.flatMap(cityEntries)];
}

/** The name of the sitemap of the pages that belong to no city. */
export const PAGES_SITEMAP = 'pages';

/** Where a sitemap of the site is published. */
export function sitemapPath(name: string): string {
  return `/sitemaps/${name}.xml`;
}

export interface SitemapRef {
  /** `pages`, or a city's id. */
  readonly name: string;
  /** W3C date of its latest data change. */
  readonly lastmod: string;
}

/** The sitemaps the index lists: the pages that belong to no city, then each city's. */
export function sitemapRefs(models: readonly SeoModel[]): SitemapRef[] {
  return [
    { name: PAGES_SITEMAP, lastmod: latestChange(models) },
    ...models.map((model) => ({ name: model.cityId, lastmod: model.updatedAt.slice(0, 10) })),
  ];
}

/** The entries of one of the sitemaps `sitemapRefs` names, or null for a name it does not. */
export function entriesForSitemap(
  name: string,
  models: readonly SeoModel[],
): SitemapEntry[] | null {
  if (name === PAGES_SITEMAP) return pageEntries(models);
  const model = models.find((m) => m.cityId === name);
  return model === undefined ? null : cityEntries(model);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A sitemap with an `xhtml:link` alternate for every locale (and x-default) on every URL. */
export function renderSitemap(entries: readonly SitemapEntry[], origin: string): string {
  const absolute = (path: string) => escapeXml(new URL(path, origin).href);
  const locales: readonly Locale[] = LOCALES;
  const urls = entries.flatMap((entry) =>
    locales.map((locale) => {
      const links = [
        ...locales.map(
          (l) =>
            `    <xhtml:link rel="alternate" hreflang="${l}" href="${absolute(entry.alternates[l])}"/>`,
        ),
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${absolute(entry.alternates.el)}"/>`,
      ];
      return [
        '  <url>',
        `    <loc>${absolute(entry.alternates[locale])}</loc>`,
        ...(entry.lastmod === undefined ? [] : [`    <lastmod>${entry.lastmod}</lastmod>`]),
        ...links,
        '  </url>',
      ].join('\n');
    }),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

/** The index of the site's sitemaps, which is what `/sitemap.xml` and robots.txt point to. */
export function renderSitemapIndex(refs: readonly SitemapRef[], origin: string): string {
  const sitemaps = refs.map((ref) =>
    [
      '  <sitemap>',
      `    <loc>${escapeXml(new URL(sitemapPath(ref.name), origin).href)}</loc>`,
      ...(ref.lastmod === '' ? [] : [`    <lastmod>${ref.lastmod}</lastmod>`]),
      '  </sitemap>',
    ].join('\n'),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...sitemaps,
    '</sitemapindex>',
    '',
  ].join('\n');
}

export function renderRobots(origin: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /data/',
    '',
    `Sitemap: ${new URL('/sitemap.xml', origin).href}`,
    '',
  ].join('\n');
}
