import { LOCALES } from '@pharmacy-skg/core';
import type { Locale } from '@pharmacy-skg/core';
import {
  alternatePaths,
  areaIndexPath,
  areaPath,
  dutyIndexPath,
  dutyPath,
  pharmacyPath,
  ROUTE_KEYS,
} from '../../i18n/routes.ts';
import type { SeoModel } from './model.ts';
import { alternatesFor } from './views.ts';
import type { Alternates } from './views.ts';

/** Pages left out of the sitemap: the problem report form has nothing to search for. */
const EXCLUDED_ROUTES: readonly string[] = ['report'];

export interface SitemapEntry {
  /** The page in every locale. */
  readonly alternates: Alternates;
  /** W3C date (YYYY-MM-DD) of the last data change, for data pages. */
  readonly lastmod?: string | undefined;
}

/** Every indexable page, one entry per page (not per locale). The 404 page is never listed. */
export function sitemapEntries(model: SeoModel): SitemapEntry[] {
  const lastmod = model.updatedAt.slice(0, 10);
  const entries: SitemapEntry[] = [];
  for (const route of ROUTE_KEYS) {
    if (EXCLUDED_ROUTES.includes(route)) continue;
    entries.push({ alternates: alternatePaths(route) });
  }
  entries.push({ alternates: alternatesFor(dutyIndexPath), lastmod });
  entries.push({ alternates: alternatesFor(areaIndexPath), lastmod });
  for (const date of model.publishedDates) {
    entries.push({ alternates: alternatesFor((l) => dutyPath(l, date)), lastmod });
  }
  for (const area of model.areas) {
    entries.push({ alternates: alternatesFor((l) => areaPath(l, area.slug)), lastmod });
  }
  for (const pharmacy of model.pharmacies) {
    entries.push({ alternates: alternatesFor((l) => pharmacyPath(l, pharmacy.id)), lastmod });
  }
  return entries;
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

export function renderRobots(origin: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    '',
    `Sitemap: ${new URL('/sitemap.xml', origin).href}`,
    '',
  ].join('\n');
}
