import type { Locale } from '@pharmacy-skg/core';

/**
 * Working title (docs/decisions.md, Defaults): the public name is chosen before launch.
 * This is the only place to rename the app; the manifest, header, titles and footer read it.
 */
export const APP_NAME: Readonly<Record<Locale, string>> = {
  el: 'Ανοιχτά Φαρμακεία Θεσσαλονίκης',
  en: 'Open Pharmacies Thessaloniki',
};

/** Home-screen label (about 12 characters fit under an app icon). */
export const APP_SHORT_NAME: Readonly<Record<Locale, string>> = {
  el: 'Φαρμακεία',
  en: 'Pharmacies',
};

/** The city the app currently serves (decision D5: data and URLs carry a city key). */
export const DEFAULT_CITY_ID = 'thessaloniki';

export const REPO = 'tkropalis/pharmacy-skg';
export const REPO_URL = `https://github.com/${REPO}`;

/** Theme colours; keep in sync with the tokens in styles/global.css. */
export const THEME_COLORS = {
  light: '#f7faf8',
  dark: '#0d1512',
  accent: '#0b7a43',
} as const;

/** Data older than this triggers the stale-data banner (docs/decisions.md, Defaults). */
export const STALE_AFTER_HOURS = 36;

export const EMERGENCY_NUMBERS = {
  ambulance: '166',
  europe: '112',
  /** Κέντρο Δηλητηριάσεων, as displayed. */
  poison: '210 7793777',
} as const;
