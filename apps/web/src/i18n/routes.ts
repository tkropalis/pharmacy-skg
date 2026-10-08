import type { Locale } from '@pharmacy-skg/core';
import { LOCALES } from '@pharmacy-skg/core';

export const DEFAULT_LOCALE: Locale = 'el';

/** Every page, with its slug in each locale. An empty slug is the locale's home. */
export const ROUTES = {
  home: { el: '', en: '' },
  about: { el: 'plirofories', en: 'about' },
  privacy: { el: 'aporrito', en: 'privacy' },
  report: { el: 'anafora', en: 'report' },
} as const satisfies Record<string, Record<Locale, string>>;

export type RouteKey = keyof typeof ROUTES;

export const ROUTE_KEYS = Object.keys(ROUTES) as RouteKey[];

/** Greek is unprefixed; every other locale lives under /<locale>/. */
export function localePrefix(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? '' : `/${locale}`;
}

/** The path of a page in a locale, always with a trailing slash: '/plirofories/', '/en/about/'. */
export function localizedPath(locale: Locale, route: RouteKey): string {
  const slug = ROUTES[route][locale];
  return `${localePrefix(locale)}/${slug === '' ? '' : `${slug}/`}`;
}

/** The same page in every locale, for hreflang alternates and the language switcher. */
export function alternatePaths(route: RouteKey): Record<Locale, string> {
  return Object.fromEntries(LOCALES.map((l) => [l, localizedPath(l, route)])) as Record<
    Locale,
    string
  >;
}

/** Every [...path] param Astro must generate, as getStaticPaths entries. */
export function allPathParams(): { path: string | undefined; locale: Locale; route: RouteKey }[] {
  return LOCALES.flatMap((locale) =>
    ROUTE_KEYS.map((route) => {
      const path = localizedPath(locale, route).replace(/^\/|\/$/g, '');
      return { path: path === '' ? undefined : path, locale, route };
    }),
  );
}

/**
 * Generated pages with parameters. The parameters are the same in every locale, so the
 * equivalent page in another locale is always the same function call. Duty dates and areas
 * belong to a city (decision D26); pharmacy ids are unique across cities.
 */
export const PARAM_ROUTES = {
  /** One pharmacy, by registry id: '/farmakeio/2310200022/', '/en/pharmacy/2310200022/'. */
  pharmacy: { el: 'farmakeio', en: 'pharmacy' },
  /**
   * A city's duty lists for one date, '/efimeries/thessaloniki/2026-10-05/', and the city's page
   * for today, '/efimeries/thessaloniki/'.
   */
  duty: { el: 'efimeries', en: 'duty' },
  /** One locality of a city: '/perioxi/thessaloniki/kalamaria/', '/en/area/larisa/tyrnavos/'. */
  area: { el: 'perioxi', en: 'area' },
} as const satisfies Record<string, Record<Locale, string>>;

export type ParamRouteKey = keyof typeof PARAM_ROUTES;

export function paramPath(locale: Locale, route: ParamRouteKey, ...params: string[]): string {
  const rest = params.map((param) => `${encodeURIComponent(param)}/`).join('');
  return `${localePrefix(locale)}/${PARAM_ROUTES[route][locale]}/${rest}`;
}

export const pharmacyPath = (locale: Locale, id: string): string =>
  paramPath(locale, 'pharmacy', id);
export const dutyPath = (locale: Locale, cityId: string, date: string): string =>
  paramPath(locale, 'duty', cityId, date);
/** The city's duty page for today, at an address that does not change with the date. */
export const dutyCityPath = (locale: Locale, cityId: string): string =>
  paramPath(locale, 'duty', cityId);
export const areaPath = (locale: Locale, cityId: string, slug: string): string =>
  paramPath(locale, 'area', cityId, slug);

/** The index pages of the duty and area routes: '/efimeries/', '/en/area/'. */
export const dutyIndexPath = (locale: Locale): string =>
  `${localePrefix(locale)}/${PARAM_ROUTES.duty[locale]}/`;
export const areaIndexPath = (locale: Locale): string =>
  `${localePrefix(locale)}/${PARAM_ROUTES.area[locale]}/`;
