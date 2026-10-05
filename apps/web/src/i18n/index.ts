import type { Locale } from '@pharmacy-skg/core';
import { en } from './en.ts';
import { el } from './el.ts';

export { alternatePaths, allPathParams, DEFAULT_LOCALE, localizedPath, ROUTES } from './routes.ts';
export type { RouteKey } from './routes.ts';

/**
 * Widens the literal types of the Greek dictionary to string. The dictionary holds plain
 * strings, arrays and objects only, so any section can be passed to a React island as props.
 */
type Widen<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? Widen<U>[]
    : { [K in keyof T]: Widen<T[K]> };

/**
 * The shape of a dictionary, derived from el.ts. en.ts is typed as Dictionary, so a missing
 * or extra key is a type error.
 */
export type Dictionary = Widen<typeof el>;

const dictionaries: Record<Locale, Dictionary> = { el, en };

/** The dictionary for a locale. All UI text goes through it. */
export function t(locale: Locale): Dictionary {
  return dictionaries[locale];
}

export type { Locale };
