import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { iteqDutyLists } from './lists.ts';
import { parseIteqPage } from './parse.ts';

const fixture = (name: string) =>
  readFileSync(new URL(`../../fixtures/iteq/${name}`, import.meta.url), 'utf8');

const SECTORS = [
  { id: 'larisa', printed: 'ΛΑΡΙΣΑ', name: 'Λάρισα' },
  { id: 'tyrnavos', printed: 'ΤΥΡΝΑΒΟΣ', name: 'Τύρναβος' },
  { id: 'agia', printed: 'ΑΓΙΑ', name: 'Αγιά' },
  { id: 'ampelonas', printed: 'ΑΜΠΕΛΩΝΑΣ', name: 'Αμπελώνας' },
  { id: 'elassona', printed: 'ΕΛΑΣΣΟΝΑ', name: 'Ελασσόνα' },
  { id: 'farsala', printed: 'ΦΑΡΣΑΛΑ', name: 'Φάρσαλα' },
  { id: 'giannouli', printed: 'ΓΙΑΝΝΟΥΛΗ', name: 'Γιάννουλη' },
  { id: 'falani', printed: 'ΦΑΛΑΝΗ', name: 'Φαλάνη' },
  { id: 'nikaia', printed: 'ΝΙΚΑΙΑ', name: 'Νίκαια' },
];

describe('iteqDutyLists', () => {
  it('makes one list per sector, one section per heading, in the page order', () => {
    const page = parseIteqPage(fixture('larisa_2026-10-10.html'));
    const { lists, warnings } = iteqDutyLists(page, '2026-10-10', SECTORS);
    expect(warnings).toEqual([]);
    expect(lists.map((list) => list.groupId)).toEqual(SECTORS.map((sector) => sector.id));

    const city = lists.find((list) => list.groupId === 'larisa');
    expect(city?.groupName).toBe('Λάρισα');
    expect(city?.date).toBe('2026-10-10');
    expect(city?.sections.map((s) => [s.kind, s.heading, s.entries.length])).toEqual([
      ['day', 'ΑΠΟ 08:00 ΕΩΣ 23:00', 7],
      ['saturday-extra', 'ΑΠΟ 08:00 ΕΩΣ 14:00', 23],
      ['overnight', 'ΔΙΑΝΥΚΤΕΡΕΥΕΙ 23:00 ΕΩΣ 08:00', 1],
    ]);
    // The locality is the sector's plain name.
    expect(city?.sections[0]?.entries[0]).toEqual({
      locality: 'Λάρισα',
      name: 'ΒΙΒΗ ΘΑΝΑΚΟΥ Ε.Ε.',
      address: 'ΣΙΦΝΟΥ 63 (Ανάμεσα στην πλατεία Μικρού Προφήτη Ηλία και στην πλατεία Πρωτομαγιάς)',
      phone: '2410614574',
    });

    const tyrnavos = lists.find((list) => list.groupId === 'tyrnavos');
    expect(tyrnavos?.sections.map((s) => [s.kind, s.hours, s.entries.length])).toEqual([
      ['on-duty', null, 1],
      ['saturday-extra', { from: '08:00', to: '13:00', toNextDay: false }, 1],
    ]);
  });

  it('reports a card in a sector it does not know, and leaves it out', () => {
    const page = parseIteqPage(fixture('larisa_2026-10-06_home.html'));
    const { lists, warnings } = iteqDutyLists(page, '2026-10-06', SECTORS.slice(0, 1));
    expect(lists.map((list) => list.groupId)).toEqual(['larisa']);
    expect(warnings).toHaveLength(8);
    expect(warnings[0]?.code).toBe('unknown-sector');
  });
});
