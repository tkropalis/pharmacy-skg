import type { Locale } from '@pharmacy-skg/core';
import { localizedPath } from '../i18n/routes.ts';

/**
 * What a long press on the installed app's icon offers (the manifest's `shortcuts`): states the
 * home screen already has, reached with `?show=` on the home address. They are not screens of
 * their own: the page is the home screen, opened with its list on that choice.
 */
export const SHORTCUTS = ['open', 'duty', 'favourites', 'medicines'] as const;
export type Shortcut = (typeof SHORTCUTS)[number];

/** The query parameter the shortcuts use. */
export const SHORTCUT_PARAM = 'show';

export function isShortcut(value: string | null): value is Shortcut {
  return value !== null && (SHORTCUTS as readonly string[]).includes(value);
}

/** The shortcut a page was opened with ("?show=duty"), or null for any other address. */
export function shortcutOf(search: string): Shortcut | null {
  const value = new URLSearchParams(search).get(SHORTCUT_PARAM);
  return isShortcut(value) ? value : null;
}

/**
 * The shortcut this page was opened with, read once when the script loads (the address is
 * cleaned afterwards, `clearShortcut`), so the list and the medicine search both see it.
 */
export const openedWith: Shortcut | null =
  typeof window === 'undefined' ? null : shortcutOf(window.location.search);

/** The address a shortcut opens in a language: '/?show=duty', '/en/?show=duty'. */
export function shortcutUrl(locale: Locale, shortcut: Shortcut): string {
  return `${localizedPath(locale, 'home')}?${SHORTCUT_PARAM}=${shortcut}`;
}

/**
 * Takes the parameter out of the address once it has been read, so a reload or a shared link
 * opens the home screen as usual and the choice does not stick to the address.
 */
export function clearShortcut(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(SHORTCUT_PARAM)) return;
  url.searchParams.delete(SHORTCUT_PARAM);
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}
