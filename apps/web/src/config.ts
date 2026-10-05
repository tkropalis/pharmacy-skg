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

/** The name in the header bar on a phone, where the full name does not fit on one row. */
export const APP_HEADER_NAME: Readonly<Record<Locale, string>> = {
  el: 'Ανοιχτά Φαρμακεία',
  en: 'Open Pharmacies',
};

/** The city the app currently serves (decision D5: data and URLs carry a city key). */
export const DEFAULT_CITY_ID = 'thessaloniki';

/** The owner's public contact address (about and privacy pages). */
export const CONTACT_EMAIL = 'kropalis.th@protonmail.com';

export const REPO = 'tkropalis/pharmacy-skg';
export const REPO_URL = `https://github.com/${REPO}`;

/** Theme colours; keep in sync with the tokens in styles/global.css. */
export const THEME_COLORS = {
  light: '#ffffff',
  accent: '#0a7d45',
} as const;

/** Data older than this triggers the stale-data banner (docs/decisions.md, Defaults). */
export const STALE_AFTER_HOURS = 36;

export const EMERGENCY_NUMBERS = {
  ambulance: '166',
  europe: '112',
  /** Κέντρο Δηλητηριάσεων, as displayed. */
  poison: '210 7793777',
} as const;
