import { describe, expect, it } from 'vitest';
import { cleanDisplay, joinLines, matchKey, normalizePhone } from './text.ts';

describe('joinLines', () => {
  it('joins wrapped lines, keeping hyphenated words together', () => {
    expect(joinLines(['Σ.Φ. ΑΝΔΡΕΑΔΟΥ ΒΕΡΟΝΙΚΗ - ΧΙΤΑΡΟΒΑ-', 'ΑΝΔΡΕΑΔΟΥ ΣΥΛΒΑΝΑ Ο.Ε.'])).toBe(
      'Σ.Φ. ΑΝΔΡΕΑΔΟΥ ΒΕΡΟΝΙΚΗ - ΧΙΤΑΡΟΒΑ-ΑΝΔΡΕΑΔΟΥ ΣΥΛΒΑΝΑ Ο.Ε.',
    );
    expect(joinLines(['Σ.Φ. ΚΕΖΟΣ ΔΗΜΗΤΡΙΟΣ', ' ', 'ΟΕ'])).toBe('Σ.Φ. ΚΕΖΟΣ ΔΗΜΗΤΡΙΟΣ ΟΕ');
  });
});

describe('cleanDisplay', () => {
  it('replaces Latin look-alikes only inside Greek words', () => {
    expect(cleanDisplay('M.AΛΕΞΑΝΔΡΟΥ 80')).toBe('Μ.ΑΛΕΞΑΝΔΡΟΥ 80');
    expect(cleanDisplay('ΚΟΥΚΟΥΡΙΚΟΥ ΑΘΑΝΑΣΙΑ &ΣΙΑ 0Ε')).toBe('ΚΟΥΚΟΥΡΙΚΟΥ ΑΘΑΝΑΣΙΑ &ΣΙΑ ΟΕ');
    expect(cleanDisplay('ΚΕΣΙΔΗΣ - HELLAS PHARMACY Ι.Κ.Ε')).toBe('ΚΕΣΙΔΗΣ - HELLAS PHARMACY Ι.Κ.Ε');
    expect(cleanDisplay('28ΗΣ ΟΚΤΩΒΡΙΟΥ 204')).toBe('28ΗΣ ΟΚΤΩΒΡΙΟΥ 204');
  });
});

describe('matchKey', () => {
  it('ignores case, accents, look-alikes and punctuation', () => {
    expect(matchKey('Καραολή & Δημητρίου 204')).toBe(matchKey('ΚΑΡΑΟΛΗ ΔΗΜΗΤΡΙΟΥ, 204'));
    expect(matchKey('M.AΛΕΞΑΝΔΡΟΥ')).toBe(matchKey('Μ. Αλεξάνδρου'));
  });
});

describe('normalizePhone', () => {
  it.each([
    ['2310733843', '2310733843'],
    ['+302310733843', '2310733843'],
    ['231 083 7109', '2310837109'],
    ['0030 2392 026944', '2392026944'],
    ['6971234567', '6971234567'],
    ['12345', null],
    [null, null],
  ])('%s → %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });
});
