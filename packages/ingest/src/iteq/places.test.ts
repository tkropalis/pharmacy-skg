import { describe, expect, it } from 'vitest';
import { placeName } from './places.ts';

describe('placeName', () => {
  it('writes a printed place out, accents and all', () => {
    expect(placeName('ΚΕΡΑΤΣΙΝΙ')).toBe('Κερατσίνι');
    expect(placeName('ΠΤΟΛΕΜΑΪΔΑ')).toBe('Πτολεμαΐδα');
    expect(placeName(' ΝΕΑ  ΚΙΔΩΝΙΑ ')).toBe('Νέα Κυδωνία');
  });

  it('names a town and its neighbourhood part by part', () => {
    expect(placeName('ΠΕΙΡΑΙΑΣ-ΚΑΣΤΕΛΛΑ')).toBe('Πειραιάς, Καστέλλα');
    expect(placeName('ΠΕΙΡΑΙΑΣ - ΑΓ.ΒΑΣΙΛΕΙΟΣ')).toBe('Πειραιάς, Άγιος Βασίλειος');
    expect(placeName('ΝΙΚΑΙΑ-ΑΣΠΡΑ ΧΩΜΑΤΑ')).toBe('Νίκαια, Άσπρα Χώματα');
  });

  it('keeps a place it does not know as printed', () => {
    expect(placeName('ΑΤΛΑΝΤΙΔΑ')).toBe('ΑΤΛΑΝΤΙΔΑ');
    expect(placeName('ΠΕΙΡΑΙΑΣ-ΑΤΛΑΝΤΙΔΑ')).toBe('ΠΕΙΡΑΙΑΣ-ΑΤΛΑΝΤΙΔΑ');
  });
});
