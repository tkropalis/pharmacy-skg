import type { APIRoute } from 'astro';
import { APP_NAME, APP_SHORT_NAME, THEME_COLORS } from '../config.ts';
import { t } from '../i18n/index.ts';

// Built from config.ts, so renaming the app there renames the installed app too.
export const GET: APIRoute = () => {
  const manifest = {
    name: APP_NAME.el,
    short_name: APP_SHORT_NAME.el,
    description: t('el').home.description,
    lang: 'el',
    dir: 'ltr',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: THEME_COLORS.accent,
    background_color: THEME_COLORS.light,
    categories: ['health', 'medical', 'utilities'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
  return new Response(JSON.stringify(manifest, null, 2), {
    headers: { 'Content-Type': 'application/manifest+json' },
  });
};
