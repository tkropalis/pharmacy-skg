import { describe, expect, it } from 'vitest';
import liberty from './fixtures/liberty-symbol-layers.json' with { type: 'json' };
import { localizeStyle, nameExpression } from './map-style.ts';

/** Symbol layers of OpenFreeMap's "liberty" style (fetched 2026-10-05), trimmed to the fields used. */
const style = liberty as unknown as Parameters<typeof localizeStyle>[0];

describe('nameExpression', () => {
  it('prefers the Greek name in Greek', () => {
    expect(nameExpression('el')).toEqual(['coalesce', ['get', 'name:el'], ['get', 'name']]);
  });
  it('prefers English, then the Latin name, in English', () => {
    expect(nameExpression('en')).toEqual([
      'coalesce',
      ['get', 'name:en'],
      ['get', 'name:latin'],
      ['get', 'name'],
    ]);
  });
});

describe('localizeStyle', () => {
  for (const locale of ['el', 'en'] as const) {
    it(`rewrites every name label to ${locale} and leaves shields alone`, () => {
      const out = localizeStyle(style, locale);
      expect(out.layers).toHaveLength(style.layers?.length ?? -1);
      let rewritten = 0;
      out.layers?.forEach((layer, i) => {
        const before = style.layers?.[i]?.layout?.['text-field'];
        const after = layer.layout?.['text-field'];
        if (before === undefined) return;
        if (JSON.stringify(before).includes('name')) {
          expect(after).toEqual(nameExpression(locale));
          rewritten += 1;
        } else {
          expect(after).toEqual(before);
        }
      });
      expect(rewritten).toBeGreaterThan(15);
      // The ref-printing road shields keep their text.
      const shield = out.layers?.find((l) => l.id === 'highway-shield-non-us');
      expect(shield?.layout?.['text-field']).toEqual(['to-string', ['get', 'ref']]);
    });
  }

  it('does not change its input', () => {
    const before = JSON.stringify(style);
    localizeStyle(style, 'el');
    expect(JSON.stringify(style)).toBe(before);
  });
});
