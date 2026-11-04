import type { Locale } from '@pharmacy-skg/core';
import { localizedPath } from '../i18n/routes.ts';

/**
 * The home screen opened on one pharmacy: a pharmacy's page links to it, so the big map shows the
 * pharmacy that person was looking at, in that pharmacy's city. Like the shortcuts
 * (lib/shortcuts.ts) it is not a screen of its own, and the address is cleaned once read.
 */
const PHARMACY_PARAM = 'pharmacy';
const CITY_PARAM = 'city';

export interface PharmacyLink {
  readonly cityId: string;
  /** Null opens the city's list with nothing chosen. */
  readonly pharmacyId: string | null;
}

export function pharmacyMapUrl(locale: Locale, cityId: string, pharmacyId?: string): string {
  const params = new URLSearchParams({ [CITY_PARAM]: cityId });
  if (pharmacyId !== undefined) params.set(PHARMACY_PARAM, pharmacyId);
  return `${localizedPath(locale, 'home')}?${params.toString()}`;
}

/** What the address asks for, or null for any other address. */
export function pharmacyLinkOf(search: string): PharmacyLink | null {
  const params = new URLSearchParams(search);
  const cityId = params.get(CITY_PARAM);
  if (cityId === null || cityId === '') return null;
  const pharmacyId = params.get(PHARMACY_PARAM);
  return { cityId, pharmacyId: pharmacyId === '' ? null : pharmacyId };
}

/**
 * The link this page was opened with, read once when the script loads (the address is cleaned
 * afterwards, `clearPharmacyLink`).
 */
export const openedOn: PharmacyLink | null =
  typeof window === 'undefined' ? null : pharmacyLinkOf(window.location.search);

/** Takes the link out of the address, so a reload opens the home screen as usual. */
export function clearPharmacyLink(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(CITY_PARAM)) return;
  url.searchParams.delete(CITY_PARAM);
  url.searchParams.delete(PHARMACY_PARAM);
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}
