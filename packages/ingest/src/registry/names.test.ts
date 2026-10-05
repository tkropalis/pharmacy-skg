import { describe, expect, it } from 'vitest';
import { nameSimilarity, nameTokens, pharmacyId, sameStreetAddress } from './names.ts';

describe('nameTokens', () => {
  it('drops legal forms and abbreviations', () => {
    expect([...nameTokens('Σ.Φ. ΚΕΖΟΣ ΔΗΜΗΤΡΙΟΣ - ΚΕΖΟΣ ΑΛΕΞΑΝΔΡΟΣ ΟΕ')]).toEqual([
      'ΚΕΖΟΣ',
      'ΔΗΜΗΤΡΙΟΣ',
      'ΑΛΕΞΑΝΔΡΟΣ',
    ]);
    expect([...nameTokens('Φαρμακείο Κωστηκίδου Σοφία')]).toEqual(['ΚΩΣΤΗΚΙΔΟΥ', 'ΣΟΦΙΑ']);
  });
});

describe('nameSimilarity', () => {
  it('ignores punctuation and legal forms', () => {
    expect(nameSimilarity('ΛΩΤΙΔΗΣ - ΣΤΑΥΡΑΚΗΣ Ο.Ε.', 'ΛΩΤΙΔΗΣ - ΣΤΑΥΡΑΚΗΣ ΟΕ')).toBe(1);
    expect(nameSimilarity('ΛΩΤΙΔΗΣ - ΣΤΑΥΡΑΚΗΣ ΟΕ', 'ΣΤΑΥΡΑΚΗΣ ΣΤΑΥΡΟΣ - ΛΩΤΙΔΗΣ ΙΣΑΑΚ ΟΕ')).toBe(
      0.5,
    );
  });
});

describe('sameStreetAddress', () => {
  it('tolerates abbreviations but needs the same number', () => {
    expect(sameStreetAddress('Ε.ΒΕΝΙΖΕΛΟΥ 99', 'ΕΛ. ΒΕΝΙΖΕΛΟΥ 99')).toBe(true);
    expect(sameStreetAddress('ΒΕΝΙΖΕΛΟΥ 85', 'ΒΕΝΙΖΕΛΟΥ 99')).toBe(false);
    expect(sameStreetAddress('ΒΕΝΙΖΕΛΟΥ 85', 'ΒΟΥΛΓΑΡΗ 85')).toBe(false);
  });
});

describe('pharmacyId', () => {
  it('uses the phone number, or a stable hash without one', () => {
    expect(pharmacyId('2310733843', 'X', 'Y')).toBe('2310733843');
    const id = pharmacyId('239722000', 'ΠΑΠΑΣΤΕΦΑΝΟΥ Χ. - ΠΑΠΑΔΟΠΟΥΛΟΥ Α. Ο.Ε.', 'Ασπροβάλτα');
    expect(id).toMatch(/^x-[0-9a-f]{10}$/);
    expect(pharmacyId(null, 'Παπαστεφάνου Χ. - Παπαδοπούλου Α. ΟΕ', 'ΑΣΠΡΟΒΑΛΤΑ')).toBe(id);
  });
});
