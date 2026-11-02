import { describe, expect, it } from 'vitest';
import type { PinKind } from './list.ts';
import { changeSource, indexPins, splitPins } from './map-data.ts';
import type { PinCollection, PinFeature } from './map-data.ts';

function pin(
  id: string,
  kind: PinKind,
  coordinates: [number, number] = [22.94, 40.63],
  name = '',
): PinFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates },
    properties: { id, kind, approximate: false, image: `pin-${kind}`, sort: 0, name },
  };
}

function collection(kinds: readonly PinKind[]): PinCollection {
  return {
    type: 'FeatureCollection',
    features: kinds.map((kind, index) => pin(`p${index}`, kind)),
  };
}

describe('splitPins', () => {
  it('keeps every duty pin out of the clustered group', () => {
    const split = splitPins(
      collection(['open', 'duty', 'open', 'duty-unknown', 'closed', 'duty', 'open']),
    );
    expect(split.duty.map((f) => f.properties.kind)).toEqual(['duty', 'duty-unknown', 'duty']);
    expect(split.clustered.map((f) => f.properties.kind)).toEqual(['open', 'open', 'open']);
    expect(split.closed.map((f) => f.properties.kind)).toEqual(['closed']);
  });

  it('loses nothing', () => {
    const all = collection(['duty', 'open', 'closed', 'open']);
    const { duty, clustered, closed } = splitPins(all);
    expect(duty.length + clustered.length + closed.length).toBe(all.features.length);
  });
});

describe('changeSource', () => {
  const many = (n: number): PinFeature[] =>
    Array.from({ length: n }, (_, i) => pin(`p${i}`, 'open', [22 + i / 100, 40]));
  const withProperties = (feature: PinFeature, changes: Partial<PinFeature['properties']>) => ({
    ...feature,
    properties: { ...feature.properties, ...changes },
  });

  it('says nothing when nothing changed, whatever the order', () => {
    const features = many(10);
    expect(changeSource(indexPins(features), indexPins([...features].reverse()))).toBeNull();
    expect(changeSource(new Map(), new Map())).toBeNull();
  });

  it('sends the whole data to an empty source, and when it ends up empty', () => {
    const features = many(3);
    expect(changeSource(new Map(), indexPins(features))).toEqual({ type: 'replace', features });
    expect(changeSource(indexPins(features), new Map())).toEqual({
      type: 'replace',
      features: [],
    });
  });

  it('sends only what was added, removed or changed', () => {
    const before = many(10);
    const after = [
      ...before.slice(1, 9),
      ...before.slice(9).map((feature) => withProperties(feature, { kind: 'duty' })),
      pin('new', 'open'),
    ];
    const change = changeSource(indexPins(before), indexPins(after));
    expect(change).toEqual({
      type: 'diff',
      diff: {
        remove: ['p0'],
        add: [pin('new', 'open')],
        update: [{ id: 'p9', addOrUpdateProperties: [{ key: 'kind', value: 'duty' }] }],
      },
    });
  });

  it('moves a pin that changed place, and sends a changed name', () => {
    const before = many(10);
    const after = before.map((feature, i) => {
      if (i === 2) {
        return {
          ...feature,
          geometry: { type: 'Point' as const, coordinates: [23, 41] as [number, number] },
        };
      }
      return i === 3 ? withProperties(feature, { name: 'Νέο όνομα' }) : feature;
    });
    expect(changeSource(indexPins(before), indexPins(after))).toEqual({
      type: 'diff',
      diff: {
        update: [
          { id: 'p2', newGeometry: { type: 'Point', coordinates: [23, 41] } },
          { id: 'p3', addOrUpdateProperties: [{ key: 'name', value: 'Νέο όνομα' }] },
        ],
      },
    });
  });

  it('sends the whole data when more than half of it changed (another city)', () => {
    const before = many(10);
    const other = Array.from({ length: 10 }, (_, i) => pin(`q${i}`, 'open'));
    expect(changeSource(indexPins(before), indexPins(other))?.type).toBe('replace');
  });

  it('sends one removal and one addition for a pin taken out and put back', () => {
    const before = many(10);
    const without = before.filter((f) => f.properties.id !== 'p4');
    expect(changeSource(indexPins(before), indexPins(without))).toEqual({
      type: 'diff',
      diff: { remove: ['p4'] },
    });
    expect(changeSource(indexPins(without), indexPins(before))).toEqual({
      type: 'diff',
      diff: { add: before.slice(4, 5) },
    });
  });

  it('keeps the last of two pins with the same id', () => {
    const index = indexPins([pin('a', 'open'), pin('a', 'duty')]);
    expect(index.size).toBe(1);
    expect(index.get('a')?.properties.kind).toBe('duty');
  });
});
