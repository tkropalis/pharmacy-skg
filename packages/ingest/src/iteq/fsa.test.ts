import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFsaCards, parseFsaDates } from './fsa.ts';
import { iteqDutyLists } from './lists.ts';
import { placeName } from './places.ts';

const fixture = (name: string) =>
  readFileSync(new URL(`../../fixtures/fsa/${name}`, import.meta.url), 'utf8');

describe('parseFsaDates', () => {
  it('reads the dates the form offers, from today, about 200 days ahead', () => {
    const dates = parseFsaDates(fixture('home_2026-10-08.html'));
    expect(dates[0]).toBe('2026-10-08');
    expect(dates[1]).toBe('2026-10-09');
    expect(dates).toHaveLength(201);
    expect(dates.at(-1)).toBe('2027-04-26');
  });
});

describe('parseFsaCards', () => {
  const cards = parseFsaCards(fixture('2026-10-08.html'));

  it('reads every card, and not the map above them', () => {
    expect(cards).toHaveLength(76);
    expect(cards[0]).toEqual({
      heading: '8 ΠΡΩΙ - 2 ΜΕΣΗΜΕΡΙ & 5 ΑΠΟΓΕΥΜΑ - 8 ΠΡΩΙ ΕΠΟΜΕΝΗΣ',
      name: 'ΖΑΦΕΙΡΟΥΔΗ ΔΗΜΗΤΡΑ ΚΑΙ ΣΙΑ Ο.Ε.',
      // As printed: a Greek capital Ο where the number has a zero.
      address: 'ΘΕΟΜΗΤΟΡΟΣ 4ΟΑ',
      locality: 'ΑΓ.ΔΗΜΗΤΡΙΟΣ',
      phone: '2130287000',
      detailsId: null,
      location: { lat: 37.9185136, lon: 23.7287832 },
    });
  });

  it('gives every card a name, an address, a place, a phone and coordinates in Attica', () => {
    for (const card of [...cards, ...parseFsaCards(fixture('2026-10-11.html'))]) {
      expect(card.name).not.toBe('');
      expect(card.address).not.toBe('');
      expect(card.locality).not.toBe('');
      expect(card.phone).toMatch(/^[26]\d{9}$/);
      expect(card.location?.lat).toBeGreaterThan(37.6);
      expect(card.location?.lat).toBeLessThan(38.4);
      expect(card.location?.lon).toBeGreaterThan(23.2);
      expect(card.location?.lon).toBeLessThan(24.15);
    }
  });
});

describe('the lists of a day in Attica', () => {
  const grouping = { kind: 'area', id: 'attiki', name: 'Αττική' } as const;
  const page = (name: string) => ({
    date: null,
    dates: [],
    token: null,
    cards: parseFsaCards(fixture(name)),
  });

  it('reads every way the hours are written, with no card left out', () => {
    const { lists, warnings } = iteqDutyLists(page('2026-10-08.html'), '2026-10-08', grouping);
    expect(warnings.filter((w) => w.code === 'unknown-heading')).toEqual([]);
    expect(lists).toHaveLength(1);
    const sections = lists[0]?.sections ?? [];
    const windows = sections.map((s) => [s.kind, s.hours]);
    expect(windows).toContainEqual(['day', { from: '08:00', to: '23:00', toNextDay: false }]);
    expect(windows).toContainEqual(['day', { from: '08:00', to: '21:00', toNextDay: false }]);
    expect(windows).toContainEqual(['on-duty', { from: '08:00', to: '08:00', toNextDay: true }]);
    expect(windows).toContainEqual(['overnight', { from: '21:00', to: '08:00', toNextDay: true }]);
    // "8 ΠΡΩΙ - 2 ΜΕΣΗΜΕΡΙ & 5 ΑΠΟΓΕΥΜΑ - 8 ΠΡΩΙ ΕΠΟΜΕΝΗΣ": two windows.
    expect(windows).toContainEqual(['day', { from: '08:00', to: '14:00', toNextDay: false }]);
    expect(windows).toContainEqual(['overnight', { from: '17:00', to: '08:00', toNextDay: true }]);
    const entries = sections.flatMap((s) => s.entries);
    // The split day counts twice; every card is in.
    expect(new Set(entries.map((e) => `${e.phone}|${e.address}`)).size).toBe(75);
  });

  it('names every place on the week sampled in written-out Greek', () => {
    for (const name of ['2026-10-08.html', '2026-10-11.html']) {
      for (const card of parseFsaCards(fixture(name))) {
        expect(placeName(card.locality), card.locality).not.toBe(card.locality);
      }
    }
    expect(placeName('ΑΓ.ΔΗΜΗΤΡΙΟΣ')).toBe('Άγιος Δημήτριος');
    expect(placeName('Ν.ΣΜΥΡΝΗ')).toBe('Νέα Σμύρνη');
    expect(placeName('ΠΑΤΗΣΙΑ ΚΑΤΩ')).toBe('Κάτω Πατήσια');
  });
});
