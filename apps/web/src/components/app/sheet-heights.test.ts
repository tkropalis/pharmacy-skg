import { describe, expect, it } from 'vitest';
import { nearestSize, sheetHeights } from './Sheet.tsx';

describe('sheetHeights', () => {
  it('keeps the default sheet tall enough for the first pharmacy on a short screen', () => {
    // 390x664 with the bars: the map area is about 575 px high.
    const short = sheetHeights(575);
    expect(short.medium).toBeGreaterThanOrEqual(400);
    // The map keeps a strip of the screen above it.
    expect(575 - short.medium).toBeGreaterThanOrEqual(150);
    // 390x844.
    const tall = sheetHeights(755);
    expect(tall.medium).toBeCloseTo(755 * 0.6, 0);
    expect(tall.small).toBeLessThan(tall.medium);
    expect(tall.medium).toBeLessThan(tall.large);
  });

  it('adds the room under the content (home indicator, floating toolbar) to every height', () => {
    const plain = sheetHeights(755);
    const inset = sheetHeights(755, 34);
    expect(inset.small).toBe(plain.small + 34);
    expect(inset.medium).toBeGreaterThanOrEqual(plain.medium);
  });

  it('snaps a dragged height to the nearest size', () => {
    const heights = sheetHeights(755);
    expect(nearestSize(heights.small + 5, heights)).toBe('small');
    expect(nearestSize(heights.medium - 5, heights)).toBe('medium');
    expect(nearestSize(heights.large, heights)).toBe('large');
  });
});
