import { describe, expect, it } from 'vitest';
import { pharmacyLinkOf, pharmacyMapUrl } from './deep-link.ts';

describe('pharmacy links to the home screen', () => {
  it('reads back what it writes, in each language', () => {
    expect(pharmacyMapUrl('el', 'larisa', '2410')).toBe('/?city=larisa&pharmacy=2410');
    expect(pharmacyMapUrl('en', 'larisa')).toBe('/en/?city=larisa');
    expect(pharmacyLinkOf('?city=larisa&pharmacy=2410')).toEqual({
      cityId: 'larisa',
      pharmacyId: '2410',
    });
    expect(pharmacyLinkOf('?city=larisa')).toEqual({ cityId: 'larisa', pharmacyId: null });
  });

  it('ignores any other address', () => {
    expect(pharmacyLinkOf('')).toBeNull();
    expect(pharmacyLinkOf('?show=duty')).toBeNull();
    expect(pharmacyLinkOf('?pharmacy=2410')).toBeNull();
  });
});
