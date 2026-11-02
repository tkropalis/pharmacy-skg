import type { APIRoute, GetStaticPaths } from 'astro';
import { SITE_URL } from '../../config.ts';
import { loadSeoModels } from '../../lib/seo/site-data.ts';
import { entriesForSitemap, renderSitemap, sitemapRefs } from '../../lib/seo/sitemap.ts';

/** `/sitemaps/pages.xml` and `/sitemaps/<city>.xml`, listed by `/sitemap.xml`. */
export const getStaticPaths: GetStaticPaths = async () =>
  sitemapRefs(await loadSeoModels()).map(({ name }) => ({ params: { name } }));

export const GET: APIRoute = async ({ params, site }) => {
  const origin = (site ?? new URL(SITE_URL)).origin;
  const entries = entriesForSitemap(params['name'] ?? '', await loadSeoModels());
  if (entries === null) return new Response(null, { status: 404 });
  return new Response(renderSitemap(entries, origin), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
