import { describe, expect, it } from 'vitest';
import { displayName } from './names.ts';

describe('displayName', () => {
  it.each([
    ['ΚΟΥΡΤΙΔΗΣ ΓΕΩΡΓΙΟΣ & ΣΙΑ Ο.Ε.', 'ΚΟΥΡΤΙΔΗΣ ΓΕΩΡΓΙΟΣ'],
    ['ΚΟΥΡΤΙΔΗΣ ΓΕΩΡΓΙΟΣ &ΣΙΑ ΟΕ', 'ΚΟΥΡΤΙΔΗΣ ΓΕΩΡΓΙΟΣ'],
    ['ΒΑΜΒΑΚΑ ΚΑΛΛΙΟΠΗ ΚΑΙ ΣΙΑ Ε.Ε', 'ΒΑΜΒΑΚΑ ΚΑΛΛΙΟΠΗ'],
    ['ΠΑΠΑΔΟΠΟΥΛΟΣ ΝΙΚΟΣ Ι.Κ.Ε.', 'ΠΑΠΑΔΟΠΟΥΛΟΣ ΝΙΚΟΣ'],
    ['ΠΑΠΑΔΟΠΟΥΛΟΣ ΝΙΚΟΣ & ΣΙΑ OE', 'ΠΑΠΑΔΟΠΟΥΛΟΣ ΝΙΚΟΣ'],
    ['Σ.Φ ΛΑΜΠΡΙΝΗ ΚΥΡΙΑΚΟΥ', 'ΛΑΜΠΡΙΝΗ ΚΥΡΙΑΚΟΥ'],
    [
      'Σ.Φ. ΑΛΕΞΟΥΔΗΣ ΑΛΕΞΑΝΔΡΟΣ - ΑΛΕΞΟΥΔΗΣ ΕΥΑΓΓΕΛΟΣ ΑΠ. Ο.Ε.',
      'ΑΛΕΞΟΥΔΗΣ ΑΛΕΞΑΝΔΡΟΣ - ΑΛΕΞΟΥΔΗΣ ΕΥΑΓΓΕΛΟΣ ΑΠ.',
    ],
  ])('drops the legal form: %s', (name, expected) => {
    expect(displayName(name)).toBe(expected);
  });

  it('keeps the number of a second shop', () => {
    expect(displayName('ΝΙΚΟΛΑΟΥ ΣΟΦΙΑ Ο.Ε. ( 2ο )')).toBe('ΝΙΚΟΛΑΟΥ ΣΟΦΙΑ (2ο)');
    expect(displayName('ΚΩΝΣΤΑΝΤΙΝΙΔΗΣ ΧΡΙΣΤΟΣ ΚΑΙ ΣΙΑ Ο.Ε (2ο)')).toBe(
      'ΚΩΝΣΤΑΝΤΙΝΙΔΗΣ ΧΡΙΣΤΟΣ (2ο)',
    );
  });

  it('leaves plain names and words that only end like a legal form alone', () => {
    expect(displayName('ΣΤΡΟΥΛΙΑ ΕΛΕΝΗ')).toBe('ΣΤΡΟΥΛΙΑ ΕΛΕΝΗ');
    expect(displayName('ΧΑΤΖΗΜΙΧΑΛΗ-ΚΟΥΪΑ ΔΕΣΠΟΙΝΑ')).toBe('ΧΑΤΖΗΜΙΧΑΛΗ-ΚΟΥΪΑ ΔΕΣΠΟΙΝΑ');
    expect(displayName('ΦΑΡΜΑΚΕΙΟ ΝΕΑΣ ΑΕ')).toBe('ΦΑΡΜΑΚΕΙΟ ΝΕΑΣ');
  });

  it('never returns an empty name', () => {
    expect(displayName('Ο.Ε.')).toBe('Ο.Ε.');
  });
});
