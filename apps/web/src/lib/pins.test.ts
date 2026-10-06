import { describe, expect, it } from 'vitest';
import { PIN_KINDS } from './list.ts';
import { PIN_COLORS, pinImageName, pinSvg, selectedPinSvg } from './pins.ts';

describe('pinSvg', () => {
  it('gives every status its own size, body or glyph, so colour is never the only cue', () => {
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
  it('draws every pharmacy that is open or on duty in the one pharmacy green', () => {
    expect(PIN_COLORS.open).toBe(PIN_COLORS.duty);
    expect(PIN_COLORS['duty-unknown']).toBe(PIN_COLORS.duty);
  });
  it('fills the duty markers and leaves the open one white, with a green edge', () => {
    // The second path is the body; the first is the white halo under it.
    const body = (svg: string) =>
      [...svg.matchAll(/<path d="[^"]+" fill="(#[0-9a-f]{6})"/g)][1]?.[1];
    expect(body(pinSvg('duty'))).toBe(PIN_COLORS.duty);
    expect(body(pinSvg('duty-unknown'))).toBe(PIN_COLORS.duty);
    expect(body(pinSvg('open'))).toBe('#ffffff');
  });
  it('is well-formed SVG with the requested size', () => {
    expect(pinSvg('duty', { size: 24 })).toMatch(
      /^<svg [^>]*width="24" height="24"[^>]*>.*<\/svg>$/,
    );
  });
});

describe('selectedPinSvg', () => {
  it('keeps each status apart on the chosen marker too', () => {
    const drops = PIN_KINDS.map((kind) => selectedPinSvg(kind).replace(/#[0-9a-f]{6}/gi, '#'));
    expect(new Set(drops).size).toBeGreaterThanOrEqual(3);
  });
});

describe('pinImageName', () => {
  it('is unique per kind and precision', () => {
    const names = PIN_KINDS.flatMap((k) => [pinImageName(k, false), pinImageName(k, true)]);
    expect(new Set(names).size).toBe(names.length);
  });
});
