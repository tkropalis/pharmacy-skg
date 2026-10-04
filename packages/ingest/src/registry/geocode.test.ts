import { describe, expect, it } from 'vitest';
import { cleanAddress, inLocality } from './geocode.ts';

describe('cleanAddress', () => {
  it.each([
    ['ΚΑΡΑΟΛΗ ΔΗΜΗΤΡΙΟΥ 204', 'ΚΑΡΑΟΛΗ ΔΗΜΗΤΡΙΟΥ 204'],
    ['ΜΑΚΡΥΓΙΑΝΝΗ 59 - ΦΕΙΔΙΟΥ 18', 'ΜΑΚΡΥΓΙΑΝΝΗ 59'],
    ['ΘΕΣΣΑΛΟΝΙΚΗΣ & ΚΥΠΡΟΥ 1 (ΔΗΜΑΡΧΕΙΟ)', 'ΘΕΣΣΑΛΟΝΙΚΗΣ'],
    ['ΔΑΒΑΚΗ 65-Α.ΗΛΙΟΥΠΟΛΗ', 'ΔΑΒΑΚΗ 65'],
    ['ΑΝ. ΔΗΜΗΤΡΙΟΥ 26 ΕΝΑΝΤΙ ΕΚ/ΣΙΑΣ', 'ΑΝ. ΔΗΜΗΤΡΙΟΥ 26'],
    ['ΛΕΩΦ. ΠΑΠΑΝΙΚΟΛΑΟΥ 114', 'ΛΕΩΦΟΡΟΣ ΠΑΠΑΝΙΚΟΛΑΟΥ 114'],
  ])('%s → %s', (address, expected) => {
    expect(cleanAddress(address)).toBe(expected);
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
