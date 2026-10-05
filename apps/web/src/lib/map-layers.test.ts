import { describe, expect, it } from 'vitest';
import { SOURCES, SOURCE_OPTIONS, clusterColors, pinLayers } from './map-layers.ts';

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi = 0, lo = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('map sources', () => {
  it('cluster only the regular and extended-hours pharmacies', () => {
    expect(SOURCE_OPTIONS.clustered['cluster']).toBe(true);
    for (const key of ['duty', 'closed', 'selected', 'origin'] as const) {
      expect(SOURCE_OPTIONS[key]['cluster'], key).toBeUndefined();
    }
  });
});

describe.each([false, true])('map layers (dark: %s)', (dark) => {
  const layers = pinLayers({ dark });
  const ids = layers.map((layer) => layer.id);

  it('have unique ids', () => {
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('draw the duty pins from the unclustered source, above everything but the selection', () => {
    const duty = layers.find((layer) => layer.id === 'duty-pins');
    expect(duty?.['source']).toBe(SOURCES.duty);
    expect(duty?.['filter']).toBeUndefined();
    const dutyIndex = ids.indexOf('duty-pins');
    const selected = ids.indexOf('selected-ring');
    expect(selected).toBeGreaterThan(dutyIndex);
    expect(ids.indexOf('selected-pin')).toBeGreaterThan(dutyIndex);
    // Every other layer is below the duty pins, except their names and the selection.
    const above = ids.slice(dutyIndex + 1);
    expect(above).toEqual(['duty-names', 'selected-ring', 'selected-pin']);
  });

  it('use the clustered source only for clusters, the other pins and their names', () => {
    const fromClustered = layers.filter((layer) => layer['source'] === SOURCES.clustered);
    expect(fromClustered.map((layer) => layer.id)).toEqual([
      'clusters',
      'cluster-count',
      'pins',
      'pin-names',
    ]);
    expect(ids.indexOf('pins')).toBeLessThan(ids.indexOf('duty-pins'));
    expect(ids.indexOf('clusters')).toBeLessThan(ids.indexOf('duty-pins'));
  });

  it('keep the clusters small', () => {
    const clusters = layers.find((layer) => layer.id === 'clusters');
    const paint = clusters?.['paint'] as Record<string, unknown>;
    const radius = paint['circle-radius'] as unknown[];
    // ['step', input, r0, from1, r1, from2, r2]: the radii are at the even places after the input.
    const sizes = radius.filter(
      (value, index): value is number => index >= 2 && index % 2 === 0 && typeof value === 'number',
    );
    expect(sizes).toHaveLength(3);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(18);
  });
});

describe('cluster colours', () => {
  it.each([false, true])(
    'read well (dark: %s) without being the loudest thing on the map',
    (dark) => {
      const { fill, stroke, text } = clusterColors(dark);
      expect(contrast(text, fill)).toBeGreaterThanOrEqual(7);
      // The outline of a graphic needs 3:1 against the fill's surroundings; it is a mid tone.
      expect(contrast(stroke, fill)).toBeGreaterThanOrEqual(2.5);
    },
  );
});
