import type { Locale } from '@pharmacy-skg/core';

export const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/liberty';
export const STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';

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
