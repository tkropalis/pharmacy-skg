import { describe, expect, it } from 'vitest';
import { PIN_KINDS } from './list.ts';
import { pinImageName, pinSvg } from './pins.ts';

describe('pinSvg', () => {
  it('gives every status its own silhouette or glyph, so colour is never the only cue', () => {
    const shapes = PIN_KINDS.map((kind) => pinSvg(kind).replace(/#[0-9a-f]{6}/gi, '#'));
    expect(new Set(shapes).size).toBe(PIN_KINDS.length);
  });
  it('draws approximate locations with a dashed outline and a white body', () => {
    for (const kind of PIN_KINDS) {
      const exact = pinSvg(kind);
      const approximate = pinSvg(kind, { approximate: true });
      expect(approximate).not.toBe(exact);
      expect(approximate).toContain('stroke-dasharray');
      expect(exact).not.toContain('stroke-dasharray');
    }
  });
  it('is well-formed SVG with the requested size', () => {
    expect(pinSvg('duty', { size: 24 })).toMatch(/^<svg [^>]*width="24" height="24"[^>]*>.*<\/svg>$/);
  });
});

describe('pinImageName', () => {
  it('is unique per kind and precision', () => {
    const names = PIN_KINDS.flatMap((k) => [pinImageName(k, false), pinImageName(k, true)]);
    expect(new Set(names).size).toBe(names.length);
  });
});
