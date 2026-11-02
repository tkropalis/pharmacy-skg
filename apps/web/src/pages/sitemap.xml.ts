import type { APIRoute } from 'astro';
import { SITE_URL } from '../config.ts';
import { loadSeoModels } from '../lib/seo/site-data.ts';
import { renderSitemapIndex, sitemapRefs } from '../lib/seo/sitemap.ts';

/** The index of the sitemaps: one for the pages of no city, then one per city. */
export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL(SITE_URL)).origin;
  const body = renderSitemapIndex(sitemapRefs(await loadSeoModels()), origin);
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
