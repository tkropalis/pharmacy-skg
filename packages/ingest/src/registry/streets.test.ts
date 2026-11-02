import { describe, expect, it } from 'vitest';
import { StreetIndex } from './streets.ts';

// Names as OpenStreetMap writes them in Pyrgos and the towns near it.
const index = new StreetIndex([
  'Ερμού',
  'Πατρών',
  'Μανωλοπούλου',
  'Μιχαήλ Μερκούρη',
  'Αγίου Γεωργίου',
  'Αγίου Δημητρίου',
  'Γεωργίου Σισίνη',
  '28ης Οκτωβρίου',
  'Νικολάου Γκουτζούρη',
  'Ρήγα Φεραίου',
  'Ελευθερίου Βενιζέλου',
  'Αρχαίας Ήλιδος',
]);

describe('StreetIndex.restore', () => {
  it('writes a street in capitals with its accents and keeps the house number', () => {
    expect(index.restore('ΕΡΜΟΥ 49')).toBe('Ερμού 49');
    expect(index.restore('ΜΑΝΩΛΟΠΟΥΛΟΥ 43')).toBe('Μανωλοπούλου 43');
    expect(index.restore('ΑΡΧΑΙΑΣ ΗΛΙΔΟΣ 7')).toBe('Αρχαίας Ήλιδος 7');
    expect(index.restore('28ΗΣ ΟΚΤΩΒΡΙΟΥ 1')).toBe('28ης Οκτωβρίου 1');
    expect(index.restore('ΡΗΓΑ ΦΕΡΑΙΟΥ 46Α')).toBe('Ρήγα Φεραίου 46Α');
  });

  it('takes a first name or a title written short for the start of the long one', () => {
    expect(index.restore('Μ. ΜΕΡΚΟΥΡΗ 11')).toBe('Μιχαήλ Μερκούρη 11');
    expect(index.restore('ΑΓ. ΓΕΩΡΓΙΟΥ 4')).toBe('Αγίου Γεωργίου 4');
    expect(index.restore('ΝΙΚ. ΓΚΟΥΤΖΟΥΡΗ 60')).toBe('Νικολάου Γκουτζούρη 60');
    expect(index.restore('ΕΛ. ΒΕΝΙΖΕΛΟΥ 8')).toBe('Ελευθερίου Βενιζέλου 8');
    expect(index.restore('Γ.ΣΙΣΙΝΗ 134')).toBe('Γεωργίου Σισίνη 134');
  });

  it('takes a surname for the street when a first name is left out, if one street ends in it', () => {
    expect(index.restore('ΣΙΣΙΝΗ 145')).toBe('Γεωργίου Σισίνη 145');
  });

  it('leaves an address it cannot match, or matches to several streets, as printed', () => {
    expect(index.restore('ΠΛ. ΕΛΕΥΘΕΡΙΑΣ')).toBe('ΠΛ. ΕΛΕΥΘΕΡΙΑΣ');
    expect(index.restore('ΑΓ. ΔΗΜΗΤΡΙΟΥ 2')).toBe('Αγίου Δημητρίου 2');
    // "ΑΓΙΟΥ" alone fits two names, so neither is chosen.
    expect(new StreetIndex(['Αγίου Νικολάου', 'Αγίου Γεωργίου']).restore('ΑΓ. 4')).toBe('ΑΓ. 4');
  });

  it('refuses to choose between names that differ only in their accents', () => {
    expect(new StreetIndex(['Ερμού', 'Έρμου']).restore('ΕΡΜΟΥ 1')).toBe('ΕΡΜΟΥ 1');
  });

  it('gives a street with no number as the street', () => {
    expect(index.restore('ΕΡΜΟΥ')).toBe('Ερμού');
  });
});
