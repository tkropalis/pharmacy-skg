import type { Locale } from '@pharmacy-skg/core';

/**
 * The name people see, without a city: the app covers more than Thessaloniki (the owner, 6 Oct
 * 2026; decision D26). This is the only place to rename the app; the manifest, header, titles
 * and footer read it. The repository and the code keep "pharmacy-skg".
 */
export const APP_NAME: Readonly<Record<Locale, string>> = {
  el: 'Ανοιχτά Φαρμακεία',
  en: 'Open Pharmacies',
};

/** Home-screen label (about 12 characters fit under an app icon). */
export const APP_SHORT_NAME: Readonly<Record<Locale, string>> = {
  el: 'Φαρμακεία',
  en: 'Pharmacies',
};

/** The city the app currently serves (decision D5: data and URLs carry a city key). */
export const DEFAULT_CITY_ID = 'thessaloniki';

/** The owner's public contact address (about and privacy pages). */
export const CONTACT_EMAIL = 'kropalis.th@protonmail.com';

/**
 * The public origin (live since 6 Oct 2026). Builds take it from PUBLIC_SITE_URL when set
 * (astro.config.mjs); this is the default there and wherever `Astro.site` is read.
 */
export const SITE_URL = 'https://farmakeiotwra.gr';

export const REPO = 'tkropalis/pharmacy-skg';
export const REPO_URL = `https://github.com/${REPO}`;

/** Theme colours; keep in sync with the tokens in styles/global.css. */
export const THEME_COLORS = {
  light: '#ffffff',
  /** The night look's surface (global.css, scripts/theme.js). */
  dark: '#151d19',
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
