import { describe, expect, it } from 'vitest';
import { realModel } from './test-data.ts';
import { assignSlugs, romanize, romanizeLocality, slugify, transliterate } from './translit.ts';

describe('transliterate (ELOT 743)', () => {
  it.each([
    ['Καλαμαριά', 'kalamaria'],
    ['Άγιος Αθανάσιος', 'agios athanasios'],
    ['Νέα Μηχανιώνα', 'nea michaniona'],
    ['Θεσσαλονίκη', 'thessaloniki'],
    ['Χαλκηδόνα', 'chalkidona'],
    ['Ψαρού', 'psarou'],
  ])('%s', (greek, latin) => {
    expect(transliterate(greek)).toBe(latin);
  });

  it('drops accents and the diaeresis, and treats final sigma like sigma', () => {
    expect(transliterate('ΠΑΥΛΟΣ')).toBe(transliterate('Παύλος'));
    expect(transliterate('Αϊ')).toBe('ai');
    expect(transliterate('Σταυρός')).toBe('stavros');
  });

  it('uses the digraph rules: ου, ει, οι, αι and the αυ/ευ voicing', () => {
    expect(transliterate('Σουρωτή')).toBe('souroti');
    expect(transliterate('Λαγκαδάς')).toBe('lagkadas');
    expect(transliterate('Ευκαρπία')).toBe('efkarpia'); // voiceless κ follows
    expect(transliterate('Εύοσμος')).toBe('evosmos'); // a vowel follows
    expect(transliterate('Σταυρούπολη')).toBe('stavroupoli'); // voiced ρ follows
    expect(transliterate('Ελευθέριο-Κορδελιό')).toBe('eleftherio-kordelio');
    expect(transliterate('Αιγαίου')).toBe('aigaiou');
  });

  it('writes μπ and ντ as b and d at the start of a word and mp and nt elsewhere', () => {
    expect(transliterate('Μπότσαρη')).toBe('botsari');
    expect(transliterate('Ντάλλας')).toBe('dallas');
    expect(transliterate('Κάμπος')).toBe('kampos');
    expect(transliterate('Σίντος')).toBe('sintos');
  });

  it('keeps Latin letters and digits', () => {
    expect(transliterate('Ωραιόκαστρο 2')).toBe('oraiokastro 2');
  });
});

describe('romanize', () => {
  it('capitalises each word', () => {
    expect(romanize('Νέα Μηχανιώνα')).toBe('Nea Michaniona');
    expect(romanize('Ελευθέριο-Κορδελιό')).toBe('Eleftherio-Kordelio');
  });

  it('spells out the abbreviated locality', () => {
    expect(romanizeLocality('Ν. Επιβάτες')).toBe('Neoi Epivates');
    expect(romanizeLocality('Καλαμαριά')).toBe('Kalamaria');
  });
});

describe('slugify', () => {
  it('gives lower-case ASCII with single hyphens', () => {
    expect(slugify('Άγιος Αθανάσιος')).toBe('agios-athanasios');
    expect(slugify('  Νέα  Μηχανιώνα! ')).toBe('nea-michaniona');
    expect(slugify('Ν. Επιβάτες')).toBe('n-epivates');
  });
});

describe('assignSlugs', () => {
  it('is independent of the input order', () => {
    const names = ['Καλαμαριά', 'Θέρμη', 'Νέα Μηχανιώνα', 'Άγιος Αθανάσιος'];
    expect([...assignSlugs(names)]).toEqual([...assignSlugs([...names].reverse())].sort());
    expect(Object.fromEntries(assignSlugs(names))).toEqual(
      Object.fromEntries(assignSlugs([...names].reverse())),
    );
  });

  it('numbers a slug that is already taken, in sorted order', () => {
    const slugs = assignSlugs(['Καλαμαριά', 'Κάλαμαριά', 'Θέρμη']);
    expect([...slugs.values()].sort()).toEqual(['kalamaria', 'kalamaria-2', 'thermi']);
    // Code-point order: the accented spelling sorts first and keeps the plain slug.
    expect(slugs.get('Κάλαμαριά')).toBe('kalamaria');
    expect(slugs.get('Καλαμαριά')).toBe('kalamaria-2');
  });

  it('spells out the abbreviated locality', () => {
    expect(assignSlugs(['Ν. Επιβάτες']).get('Ν. Επιβάτες')).toBe('neoi-epivates');
  });

  it('gives every real locality a unique, URL-safe slug', () => {
    const localities = [...new Set(realModel().pharmacies.map((p) => p.locality))];
    expect(localities.length).toBeGreaterThan(50);
    const slugs = [...assignSlugs(localities).values()];
    expect(new Set(slugs).size).toBe(localities.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('keeps the slugs of the examples stable', () => {
    const slugs = assignSlugs(realModel().pharmacies.map((p) => p.locality));
    expect(slugs.get('Καλαμαριά')).toBe('kalamaria');
    expect(slugs.get('Άγιος Αθανάσιος')).toBe('agios-athanasios');
    expect(slugs.get('Νέα Μηχανιώνα')).toBe('nea-michaniona');
    expect(slugs.get('Θεσσαλονίκη')).toBe('thessaloniki');
  });
});
