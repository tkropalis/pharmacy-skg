import type { Locale } from '@pharmacy-skg/core';
import { APP_NAME, APP_SHORT_NAME, THEME_COLORS } from '../config.ts';
import { localePrefix, localizedPath } from '../i18n/routes.ts';
import { t } from '../i18n/index.ts';

/** Where a locale's pages link their manifest: '/manifest.webmanifest', '/en/manifest.webmanifest'. */
export function manifestPath(locale: Locale): string {
  return `${localePrefix(locale)}/manifest.webmanifest`;
}

/**
 * The web app manifest of a locale, built from config.ts, so renaming the app there renames the
 * installed app too. Every locale has the same `id`: installed from a Greek or an English page,
 * it is one app, which opens on the home screen of the language it was installed in.
 */
export function webManifest(locale: Locale): Record<string, unknown> {
  return {
    name: APP_NAME[locale],
    short_name: APP_SHORT_NAME[locale],
    description: t(locale).home.description,
    lang: locale,
    dir: 'ltr',
    id: '/',
    start_url: localizedPath(locale, 'home'),
    scope: '/',
    display: 'standalone',
    // An open app window is reused for a link into the app, instead of opening a second one.
    launch_handler: { client_mode: ['navigate-existing', 'auto'] },
    theme_color: THEME_COLORS.accent,
    background_color: THEME_COLORS.light,
    categories: ['health', 'medical', 'utilities'],
    prefer_related_applications: false,
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
}

export function manifestResponse(locale: Locale): Response {
  return new Response(JSON.stringify(webManifest(locale), null, 2), {
    headers: { 'Content-Type': 'application/manifest+json' },
  });
}
