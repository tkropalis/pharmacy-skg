import { describe, expect, it } from 'vitest';
import type { PinKind } from './list.ts';
import { splitPins } from './map-data.ts';
import type { PinCollection } from './map-data.ts';

function collection(kinds: readonly PinKind[]): PinCollection {
  return {
    type: 'FeatureCollection',
    features: kinds.map((kind, id) => ({
      type: 'Feature',
      id,
      geometry: { type: 'Point', coordinates: [22.94, 40.63] },
      properties: {
        id: `p${id}`,
        kind,
        approximate: false,
        image: `pin-${kind}`,
        sort: id,
        name: '',
      },
    })),
  };
}

describe('splitPins', () => {
  it('keeps every duty pin out of the clustered group', () => {
    const split = splitPins(
      collection(['regular', 'duty', 'extended', 'duty-unknown', 'closed', 'duty', 'regular']),
    );
    expect(split.duty.map((f) => f.properties.kind)).toEqual(['duty', 'duty-unknown', 'duty']);
    expect(split.clustered.map((f) => f.properties.kind)).toEqual([
      'regular',
      'extended',
      'regular',
    ]);
    expect(split.closed.map((f) => f.properties.kind)).toEqual(['closed']);
  });

  it('loses nothing', () => {
    const all = collection(['duty', 'regular', 'closed', 'extended']);
    const { duty, clustered, closed } = splitPins(all);
    expect(duty.length + clustered.length + closed.length).toBe(all.features.length);
  });
});
