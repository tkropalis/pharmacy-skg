import { describe, expect, it } from 'vitest';
import type { Pharmacy } from '@pharmacy-skg/core';
import { nearestPharmacies } from './nearby.ts';

function pharmacy(
  id: string,
  lat: number,
  precision: 'exact' | 'street' | 'locality' = 'exact',
  locality = 'Πυλαία',
): Pharmacy {
  return {
    id,
    name: id,
    address: '',
    locality,
    postcode: null,
    phone: null,
    groupId: null,
    sources: [],
    firstSeen: '2026-01-01',
    lastSeen: '2026-01-01',
    location: { lat, lon: 22.9, source: 'overrides', precision, ref: '' },
  } as unknown as Pharmacy;
}

describe('nearestPharmacies', () => {
  it('lists the closest others, nearest first, without the pharmacy itself', () => {
    const self = pharmacy('self', 40.6);
    const all = [self, pharmacy('far', 40.7), pharmacy('near', 40.601), pharmacy('mid', 40.61)];
    const found = nearestPharmacies(all, self, 2);
    expect(found.map((n) => n.pharmacy.id)).toEqual(['near', 'mid']);
    expect(found[0]?.distance).toBeGreaterThan(100);
    expect(found[0]?.distance).toBeLessThan(120);
  });

  it('leaves out neighbours whose position is only their locality', () => {
    const self = pharmacy('self', 40.6);
    const found = nearestPharmacies([self, pharmacy('rough', 40.6001, 'locality')], self);
    expect(found).toEqual([]);
  });

  it('falls back to the same locality, with no distance, when its own position is rough', () => {
    const self = pharmacy('self', 40.6, 'locality');
    const all = [self, pharmacy('same', 40.61), pharmacy('other', 40.6, 'exact', 'Θέρμη')];
    expect(nearestPharmacies(all, self)).toEqual([
      expect.objectContaining({
        distance: null,
        pharmacy: expect.objectContaining({ id: 'same' }),
      }),
    ]);
  });
});
