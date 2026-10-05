import type { APIRoute } from 'astro';
import { renderRobots } from '../lib/seo/sitemap.ts';

export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://pharmacy-skg.vercel.app')).origin;
  return new Response(renderRobots(origin), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
