import { describe, expect, it } from 'vitest';
import { inLocality, queryLocality } from './thessaloniki.ts';

describe('queryLocality', () => {
  it('searches Θεσσαλονίκη as the municipality, other localities by name', () => {
    expect(queryLocality('Θεσσαλονίκη')).toBe('Δήμος Θεσσαλονίκης');
    expect(queryLocality('Καλαμαριά')).toBe('Καλαμαριά');
  });
});

describe('inLocality', () => {
  it('rejects a street of the same name in another municipality', () => {
    const kalamaria = '17, Κομνηνών, Κέντρο, Δήμος Καλαμαριάς, Θεσσαλονίκη, Θέρμη';
    expect(inLocality({ displayName: kalamaria }, 'Θεσσαλονίκη')).toBe(false);
    expect(inLocality({ displayName: kalamaria }, 'Καλαμαριά')).toBe(true);
    expect(
      inLocality(
        { displayName: 'Κομνηνών, Λουλουδάδικα, 1η Κοινότητα Θεσσαλονίκης, Δήμος Θεσσαλονίκης' },
        'Θεσσαλονίκη',
      ),
    ).toBe(true);
  });
});
