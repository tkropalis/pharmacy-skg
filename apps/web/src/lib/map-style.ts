import type { Locale } from '@pharmacy-skg/core';

/** OpenFreeMap's Positron: a quiet, pale base, so the pharmacy markers are what stands out. */
export const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
/** Its dark counterpart, for the night look (docs/decisions.md, Look). */
export const DARK_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

type Expression = unknown[];

/** Label expression per locale: the local name first, then the fallbacks (docs/research.md, 7). */
export function nameExpression(locale: Locale): Expression {
  return locale === 'el'
    ? ['coalesce', ['get', 'name:el'], ['get', 'name']]
    : ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']];
}

interface StyleLayer {
  type?: string;
  layout?: Record<string, unknown>;
  [key: string]: unknown;
}

interface StyleLike {
  layers?: StyleLayer[];
  [key: string]: unknown;
}

/**
 * Does a text-field print a place name? Road shields (`ref`) and house numbers must keep
 * their own field; everything that mentions a name property gets the locale's names.
 */
function printsNames(textField: unknown): boolean {
  return JSON.stringify(textField).includes('name');
}

/**
 * Returns the style with every symbol layer that prints names rewritten to the locale's names.
 * The input is not changed.
 */
export function localizeStyle<T extends StyleLike>(style: T, locale: Locale): T {
  const expression = nameExpression(locale);
  return {
    ...style,
    layers: style.layers?.map((layer) => {
      const textField = layer.layout?.['text-field'];
      if (layer.type !== 'symbol' || textField === undefined || !printsNames(textField)) {
        return layer;
      }
      return { ...layer, layout: { ...layer.layout, 'text-field': expression } };
    }),
  };
}

const STYLE_TIMEOUT_MS = 20_000;

/**
 * Fetches the base style and gives it the locale's place names. The map
 * chunk is large, so the page starts this at the same time as that import and hands the result
 * over (the style would otherwise be asked for only after the library has loaded).
 */
export async function loadMapStyle(
  locale: Locale,
  dark = false,
  timeoutMs: number = STYLE_TIMEOUT_MS,
): Promise<Record<string, unknown>> {
  const response = await fetch(dark ? DARK_STYLE_URL : STYLE_URL, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Style request failed: HTTP ${response.status}`);
  return localizeStyle((await response.json()) as { layers?: never[] }, locale);
}
