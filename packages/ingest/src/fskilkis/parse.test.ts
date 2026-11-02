import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseKilkisDays, parseKilkisIndex } from './parse.ts';

const fixture = (name: string) =>
  readFileSync(new URL(`../../fixtures/fskilkis/${name}`, import.meta.url), 'utf8');

describe('parseKilkisIndex', () => {
  const articles = parseKilkisIndex(fixture('index_2026-11-02.html'));

  it('finds the monthly article of every town, October to December', () => {
    expect(articles).toHaveLength(12);
    for (const section of ['63-kilkis', '64-polykastro', '65-axioupoli', '66-goumenissa']) {
      expect(
        articles
          .filter((article) => article.section === section)
          .map((article) => article.month)
          .sort((a, b) => a - b),
      ).toEqual([10, 11, 12]);
    }
  });

  it('reads the month from the title and keeps the address', () => {
    expect(articles).toContainEqual({
      section: '63-kilkis',
      month: 11,
      path: '/efimeries/63-kilkis/111-efimereuonta-famakeia-kilkis-noemvriou',
    });
  });

  it('leaves out the legislation section', () => {
    expect(articles.some((article) => article.section.includes('orario'))).toBe(false);
  });
});

describe('parseKilkisDays: a plain table (Polykastro, Axioupoli, Goumenissa)', () => {
  it('reads a pharmacy a day, with no hours', () => {
    const days = parseKilkisDays(fixture('polykastro_2026-11.html'));
    expect(days).toHaveLength(30);
    expect(days[0]).toEqual({
      date: '2026-11-01',
      duties: [
        {
          name: 'ΣΑΡΑΝΤΟΠΟΥΛΟΣ ΣΑΒΒΑΣ',
          address: 'Μ. ΑΛΕΞΑΝΔΡΟΥ 98',
          phone: '2343022264',
          hours: [],
        },
      ],
    });
    expect(days.at(-1)?.date).toBe('2026-11-30');
  });

  it('reads a name with an ampersand, and a mobile number as the pharmacy phone', () => {
    const polykastro = parseKilkisDays(fixture('polykastro_2026-11.html'));
    expect(polykastro[3]?.duties[0]?.name).toBe('Σ. Φ. ΤΟΠΟΥΖΙΔΗ ΓΕΩΡΓΙΟΥ & ΚΩΝΣΤΑΝΤΙΝΟΥ Ο.Ε.');
    const axioupoli = parseKilkisDays(fixture('axioupoli_2026-11.html'));
    expect(axioupoli[0]?.duties[0]).toMatchObject({ phone: '6944246376', hours: [] });
  });

  it('gives each town one pharmacy a day, with an address and a phone', () => {
    for (const name of ['polykastro', 'axioupoli', 'goumenissa']) {
      const days = parseKilkisDays(fixture(`${name}_2026-11.html`));
      expect(days.map((day) => day.date)).toEqual(
        Array.from({ length: 30 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`),
      );
      for (const day of days) {
        expect(day.duties).toHaveLength(1);
        expect(day.duties[0]?.address).not.toBe('');
        expect(day.duties[0]?.phone).toMatch(/^[26]\d{9}$/);
      }
    }
  });
});

describe('parseKilkisDays: the table of Kilkis', () => {
  const days = parseKilkisDays(fixture('kilkis_2026-11.html'));
  const day = (date: string) => days.find((d) => d.date === date);

  it('reads every day of the month', () => {
    expect(days).toHaveLength(30);
    expect(days[0]?.date).toBe('2026-11-01');
    expect(days.at(-1)?.date).toBe('2026-11-30');
  });

  it('reads a weekday as a day pharmacy and a night pharmacy, each with its hours', () => {
    expect(day('2026-11-02')?.duties).toEqual([
      {
        name: 'ΣΤΡΑΤΙΝΑΚΗ ΣΟΦΙΑ',
        address: '21 ΙΟΥΝΙΟΥ 87',
        phone: '2341029529',
        hours: ['Από 8:00 Έως 21:00'],
      },
      {
        name: 'Σ.Φ. ΠΑΤΣΑΚΙΔΗΣ ΝΙΚΟΛΑΟΣ - ΠΑΤΣΑΚΙΔΗΣ ΚΩΝΣΤ. Ο.Ε.',
        address: '21 ΙΟΥΝΙΟΥ 180',
        phone: '2341023242',
        hours: ['Από 17:30 Έως 8:00 της επομένης'],
      },
    ]);
  });

  it('reads a Saturday, whose cells span several rows, with a window for each pharmacy', () => {
    expect(day('2026-11-07')?.duties).toEqual([
      {
        name: 'ΧΑΙΝΕΛΗΣ ΓΕΩΡΓΙΟΣ',
        address: 'ΣΟΛΩΝΟΣ 7(ΟΠΙΣΘΕΝ ΚΤΕΛ)',
        phone: '2341028890',
        hours: ['Από 8:00 έως 21:00'],
      },
      // In both columns: the morning, and then the night.
      {
        name: 'ΗΛΙΑΔΗΣ ΠΑΝΑΓΙΩΤΗΣ & ΣΙΑ ΟΕ',
        address: 'ΥΨΗΛΑΝΤΟΥ 25 (ΠΥΛΗ ΝΟΣΟΚ.)',
        phone: '2341023601',
        hours: ['Από 8:00 έως 14:00', 'Από 17:30 έως 8:00 Επόμενης'],
      },
      {
        name: 'ΛΙΑΡΑΣ ΚΩΝΣΤΑΝΤΙΝΟΣ',
        address: '21 ΙΟΥΝΙΟΥ 122',
        phone: '2341024340',
        hours: ['Από 8:00 έως 14:00'],
      },
      {
        name: 'ΚΑΡΙΠΙΔΟΥ ΧΡΙΣΤΙΝΑ & ΣΙΑ Ο.Ε.',
        address: 'ΕΛ.ΒΕΝΙΖΕΛΟΥ 21',
        phone: '2341020865',
        hours: ['Από 8:00 έως 14:00'],
      },
    ]);
  });

  it('gives every pharmacy of the month a phone and at least one window', () => {
    for (const { duties } of days) {
      expect(duties.length).toBeGreaterThanOrEqual(2);
      for (const duty of duties) {
        expect(duty.phone).toMatch(/^2341\d{6}$/);
        expect(duty.hours.length).toBeGreaterThan(0);
      }
    }
  });

  it('reads December the same way', () => {
    const december = parseKilkisDays(fixture('kilkis_2026-12.html'));
    expect(december).toHaveLength(31);
    expect(december[0]?.date).toBe('2026-12-01');
    for (const { duties } of december) expect(duties.length).toBeGreaterThanOrEqual(2);
  });
});

describe('parseKilkisDays: a page that is not a duty table', () => {
  it('throws instead of reading nothing', () => {
    expect(() => parseKilkisDays('<html><body><p>Maintenance</p></body></html>')).toThrow(
      'no duty table',
    );
    expect(() =>
      parseKilkisDays(
        '<section class="article-content"><table><tr><td>Κυριακή<br />1/11/2026</td><td>ΧΩΡΙΣ ΦΑΡΜΑΚΕΙΟ</td></tr></table></section>',
      ),
    ).toThrow('no pharmacy');
  });
});
