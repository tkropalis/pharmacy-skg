import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeEntities, parseIteqDetails, parseIteqPage, phoneOf } from './parse.ts';

const fixture = (name: string) =>
  readFileSync(new URL(`../../fixtures/iteq/${name}`, import.meta.url), 'utf8');

describe('parseIteqPage', () => {
  it("reads today's page: the dates on offer, the token and every card", () => {
    const page = parseIteqPage(fixture('larisa_2026-10-06_home.html'));
    expect(page.date).toBe('2026-10-06');
    expect(page.dates).toEqual([
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
    ]);
    expect(page.token).toMatch(/^CfDJ8/);
    expect(page.cards).toHaveLength(15);
    expect(page.cards[1]).toEqual({
      heading: 'ΑΠΟ 08:00 ΕΩΣ 23:00',
      name: 'ΔΑΣΤΑΜΑΝΗΣ ΔΗΜ. ΑΘΑΝΑΣΙΟΣ',
      address: 'ΑΝΘΙΜΟΥ ΓΑΖΗ 41 & ΑΓ. ΝΙΚΟΛΑΟΥ',
      locality: 'ΛΑΡΙΣΑ',
      phone: '2410672566',
      detailsId: '23023',
    });
    const overnight = page.cards.find((card) => card.heading.startsWith('ΔΙΑΝΥΚΤΕΡΕΥΕΙ'));
    expect(overnight?.heading).toBe('ΔΙΑΝΥΚΤΕΡΕΥΕΙ 23:00 ΕΩΣ 08:00');
  });

  it('reads a later date, whose cards have no live status', () => {
    const page = parseIteqPage(fixture('larisa_2026-10-10.html'));
    expect(page.date).toBe('2026-10-10');
    expect(page.cards).toHaveLength(45);
    for (const card of page.cards) {
      expect(card.name).not.toBe('');
      expect(card.phone).toMatch(/^\d{10}$/);
      expect(card.detailsId).toMatch(/^\d+$/);
    }
    expect(new Set(page.cards.map((card) => card.locality))).toEqual(
      new Set([
        'ΛΑΡΙΣΑ',
        'ΤΥΡΝΑΒΟΣ',
        'ΑΓΙΑ',
        'ΑΜΠΕΛΩΝΑΣ',
        'ΕΛΑΣΣΟΝΑ',
        'ΦΑΡΣΑΛΑ',
        'ΓΙΑΝΝΟΥΛΗ',
        'ΦΑΛΑΝΗ',
        'ΝΙΚΑΙΑ',
      ]),
    );
  });
});

describe('parseIteqDetails', () => {
  it("reads a pharmacy's coordinates", () => {
    expect(parseIteqDetails(fixture('larisa_details_23023.html'))).toEqual({
      lat: 39.6335,
      lon: 22.4133,
    });
  });

  it('has none for an unplaced pharmacy or another page', () => {
    expect(parseIteqDetails('var _lat = 0 ; var _lng = 0 ;')).toBeNull();
    expect(parseIteqDetails('<html></html>')).toBeNull();
  });
});

describe('decodeEntities', () => {
  it('decodes numeric and named entities', () => {
    expect(decodeEntities('&#x39B;&#x391;&#913; &amp; &nbsp;x')).toBe('ΛΑΑ &  x');
  });
});

describe('phoneOf', () => {
  it('takes the first Greek number of the row', () => {
    expect(phoneOf('2410 614574')).toBe('2410614574');
    // Argolida prints it twice, or adds a mobile.
    expect(phoneOf(' 2754031330 2754031330 ')).toBe('2754031330');
    expect(phoneOf('2754051700 6947619938 2754051700')).toBe('2754051700');
    expect(phoneOf('+30 2310 123456')).toBe('2310123456');
    expect(phoneOf('6947 619938')).toBe('6947619938');
  });

  it('keeps anything else as its digits, for validation to report', () => {
    expect(phoneOf('2731081271-')).toBe('2731081271');
    expect(phoneOf('12345')).toBe('12345');
    expect(phoneOf('')).toBe('');
  });
});
