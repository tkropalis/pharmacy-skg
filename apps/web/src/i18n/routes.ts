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
 * Generated pages with a parameter. The parameter is the same in every locale, so the
 * equivalent page in another locale is always the same function call.
 */
export const PARAM_ROUTES = {
  /** One pharmacy, by registry id: '/farmakeio/2310200022/', '/en/pharmacy/2310200022/'. */
  pharmacy: { el: 'farmakeio', en: 'pharmacy' },
  /** Published duty lists for one date: '/efimeries/2026-10-05/', '/en/duty/2026-10-05/'. */
  duty: { el: 'efimeries', en: 'duty' },
  /** One area (ΦΣΘ group or locality slug): '/perioxi/kalamaria/', '/en/area/kalamaria/'. */
  area: { el: 'perioxi', en: 'area' },
} as const satisfies Record<string, Record<Locale, string>>;

export type ParamRouteKey = keyof typeof PARAM_ROUTES;

export function paramPath(locale: Locale, route: ParamRouteKey, param: string): string {
  return `${localePrefix(locale)}/${PARAM_ROUTES[route][locale]}/${encodeURIComponent(param)}/`;
}

export const pharmacyPath = (locale: Locale, id: string): string =>
  paramPath(locale, 'pharmacy', id);
export const dutyPath = (locale: Locale, date: string): string => paramPath(locale, 'duty', date);
export const areaPath = (locale: Locale, slug: string): string => paramPath(locale, 'area', slug);

/** The index pages of the duty and area routes: '/efimeries/', '/en/area/'. */
export const dutyIndexPath = (locale: Locale): string =>
  `${localePrefix(locale)}/${PARAM_ROUTES.duty[locale]}/`;
export const areaIndexPath = (locale: Locale): string =>
  `${localePrefix(locale)}/${PARAM_ROUTES.area[locale]}/`;
