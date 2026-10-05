import type { APIRoute } from 'astro';
import { loadSeoModel } from '../lib/seo/site-data.ts';
import { renderSitemap, sitemapEntries } from '../lib/seo/sitemap.ts';

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://pharmacy-skg.vercel.app')).origin;
  const body = renderSitemap(sitemapEntries(await loadSeoModel()), origin);
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
