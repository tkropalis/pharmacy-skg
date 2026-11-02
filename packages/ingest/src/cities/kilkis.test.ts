import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseKilkisDays, parseKilkisIndex, type KilkisArticle } from '../fskilkis/parse.ts';
import { expandKilkisAddress, kilkis, readKilkisLists, type KilkisSource } from './kilkis.ts';

const fixture = (name: string) =>
  readFileSync(new URL(`../../fixtures/fskilkis/${name}`, import.meta.url), 'utf8');

const ARTICLES = parseKilkisIndex(fixture('index_2026-11-02.html'));

/** The month tables we saved: November for every town, December for Kilkis. */
const TABLES: Readonly<Record<string, string>> = {
  '63-kilkis|11': 'kilkis_2026-11.html',
  '63-kilkis|12': 'kilkis_2026-12.html',
  '64-polykastro|11': 'polykastro_2026-11.html',
  '65-axioupoli|11': 'axioupoli_2026-11.html',
  '66-goumenissa|11': 'goumenissa_2026-11.html',
};

function fakeSource(
  articles: KilkisArticle[] = ARTICLES,
  days: KilkisSource['days'] = async (article) => {
    const file = TABLES[`${article.section}|${article.month}`];
    if (!file) throw new Error(`HTTP 404 for ${article.path}`);
    return parseKilkisDays(fixture(file));
  },
): KilkisSource & { read: string[] } {
  const read: string[] = [];
  return {
    origin: 'https://www.fskilkis.gr',
    read,
    get requests() {
      return 1 + read.length;
    },
    articles: async () => articles,
    days: async (article) => {
      read.push(article.path);
      return days(article);
    },
  };
}

const run = (source: KilkisSource, today = '2026-11-02') =>
  readKilkisLists(source, today, () => {});

describe('readKilkisLists', () => {
  it('reads the November article of each town once, and no other month', async () => {
    const source = fakeSource();
    await run(source);
    expect(source.read.sort()).toEqual([
      '/efimeries/63-kilkis/111-efimereuonta-famakeia-kilkis-noemvriou',
      '/efimeries/64-polykastro/105-efimereuonta-famakeia-polykastrou-noemvriou',
      '/efimeries/65-axioupoli/194-efimereuonta-famakeia-axioupolis-noemvriou',
      '/efimeries/66-goumenissa/96-efimereuonta-famakeia-goumenissas-noemvriou',
    ]);
  });

  it('makes a list for each town for each of the next 7 days, from the article it read', async () => {
    const { items, failures } = await run(fakeSource());
    expect(failures).toEqual([]);
    expect(items).toHaveLength(4 * 7);
    expect(new Set(items.map((item) => item.list.groupId))).toEqual(
      new Set(['kilkis', 'polykastro', 'axioupoli', 'goumenissa']),
    );
    expect(items.map((item) => item.list.date).sort()[0]).toBe('2026-11-02');
    expect(
      items
        .map((item) => item.list.date)
        .sort()
        .at(-1),
    ).toBe('2026-11-08');
    const polykastro = items.find((item) => item.list.groupId === 'polykastro');
    expect(polykastro?.source.url).toBe(
      'https://www.fskilkis.gr/efimeries/64-polykastro/105-efimereuonta-famakeia-polykastrou-noemvriou',
    );
  });

  it('gives Kilkis the hours its table states: a day window and an overnight one', async () => {
    const { items } = await run(fakeSource());
    const list = items.find(
      (item) => item.list.groupId === 'kilkis' && item.list.date === '2026-11-02',
    )?.list;
    expect(list?.groupName).toBe('Κιλκίς');
    expect(list?.sections.map(({ kind, heading, hours }) => ({ kind, heading, hours }))).toEqual([
      {
        kind: 'day',
        heading: 'Από 08:00 έως 21:00',
        hours: { from: '08:00', to: '21:00', toNextDay: false },
      },
      {
        kind: 'overnight',
        heading: 'Από 17:30 έως 08:00 της επομένης',
        hours: { from: '17:30', to: '08:00', toNextDay: true },
      },
    ]);
    expect(list?.sections[0]?.entries).toEqual([
      {
        locality: 'Κιλκίς',
        name: 'ΣΤΡΑΤΙΝΑΚΗ ΣΟΦΙΑ',
        address: '21 ΙΟΥΝΙΟΥ 87',
        phone: '2341029529',
      },
    ]);
    expect(list?.sections.some((section) => 'onCall' in section)).toBe(false);
  });

  it('prints one heading for one window, however the table spells it', async () => {
    const { items } = await run(fakeSource());
    const headings = new Set(
      items.flatMap((item) => item.list.sections.map((section) => section.heading)),
    );
    // "Από 8:00 Έως 21:00" and "Από 8:00 έως 21:00" are one section; so are the two nights.
    expect([...headings].sort()).toEqual([
      'Από 08:00 έως 14:00',
      'Από 08:00 έως 21:00',
      'Από 17:30 έως 08:00 της επομένης',
      'Εφημερεύοντα φαρμακεία',
    ]);
  });

  it('puts the Saturday morning pharmacies in their own section', async () => {
    const { items } = await run(fakeSource());
    const list = items.find(
      (item) => item.list.groupId === 'kilkis' && item.list.date === '2026-11-07',
    )?.list;
    expect(list?.sections.map((section) => [section.kind, section.entries.length])).toEqual([
      ['day', 1],
      ['saturday-extra', 3],
      ['overnight', 1],
    ]);
  });

  it('says only "on duty" for the towns whose tables state no hours', async () => {
    const { items } = await run(fakeSource());
    for (const id of ['polykastro', 'axioupoli', 'goumenissa']) {
      for (const { list } of items.filter((item) => item.list.groupId === id)) {
        expect(list.sections).toHaveLength(1);
        expect(list.sections[0]).toMatchObject({
          kind: 'on-duty',
          heading: 'Εφημερεύοντα φαρμακεία',
          hours: null,
        });
        expect(list.sections[0]?.entries).toHaveLength(1);
        expect(list.sections[0]?.entries[0]?.locality).toBe(list.groupName);
      }
    }
  });

  it('reads the next month too when the 7 days reach into it', async () => {
    const source = fakeSource();
    const { items, failures } = await run(source, '2026-11-28');
    expect(source.read).toContain(
      '/efimeries/63-kilkis/110-efimereuonta-famakeia-kilkis-dekemvriou',
    );
    expect(items.filter((i) => i.list.groupId === 'kilkis').map((i) => i.list.date)).toEqual([
      '2026-11-28',
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
      '2026-12-04',
    ]);
    // The December tables of the other towns were not saved: the fake answers 404 for them.
    expect(failures.filter((f) => f.code === 'unreadable-page')).toHaveLength(3);
    expect(items.filter((i) => i.list.groupId === 'polykastro')).toHaveLength(3);
  });

  it('reports a month the index has no article for, and a date the table lacks', async () => {
    const source = fakeSource(
      ARTICLES.filter((article) => !(article.section === '65-axioupoli' && article.month === 11)),
    );
    const { items, failures } = await run(source);
    expect(failures.map((f) => f.message)).toEqual([
      'fskilkis.gr: no article for axioupoli 2026-11',
    ]);
    expect(items.some((item) => item.list.groupId === 'axioupoli')).toBe(false);

    // An article not yet rewritten for this year keeps last year's dates.
    const stale = fakeSource(ARTICLES, async (article) =>
      parseKilkisDays(fixture(TABLES[`${article.section}|${article.month}`] ?? '')).filter(
        (day) => article.section !== '66-goumenissa' || day.date >= '2026-11-05',
      ),
    );
    const late = await run(stale);
    expect(late.failures.map((f) => f.message)).toEqual([
      'fskilkis.gr: goumenissa has no list for 2026-11-02',
      'fskilkis.gr: goumenissa has no list for 2026-11-03',
      'fskilkis.gr: goumenissa has no list for 2026-11-04',
    ]);
  });

  it('reports a table it cannot read and goes on with the other towns', async () => {
    const source = fakeSource(ARTICLES, async (article) => {
      if (article.section === '63-kilkis') throw new Error('no duty table in the article');
      return parseKilkisDays(fixture(TABLES[`${article.section}|${article.month}`] ?? ''));
    });
    const { items, failures } = await run(source);
    expect(items).toHaveLength(3 * 7);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.message).toContain('no duty table in the article');
  });

  it('reports a window it cannot read, and leaves that pharmacy out of the section', async () => {
    const source = fakeSource(ARTICLES, async () => [
      {
        date: '2026-11-02',
        duties: [
          { name: 'ΑΛΦΑ', address: 'ΟΔΟΣ 1', phone: '2341000001', hours: ['Από 8:00 Έως 21:00'] },
          { name: 'ΒΗΤΑ', address: 'ΟΔΟΣ 2', phone: '2341000002', hours: ['Ανοιχτά όλη μέρα 9'] },
        ],
      },
    ]);
    const { items, failures } = await run(source);
    const list = items.find((item) => item.list.groupId === 'kilkis')?.list;
    expect(list?.sections.flatMap((s) => s.entries.map((e) => e.name))).toEqual(['ΑΛΦΑ']);
    expect(failures.some((f) => f.code === 'unknown-heading')).toBe(true);
  });
});

describe('the Kilkis pipeline', () => {
  it('is for Kilkis, credits the association and reads no extended hours', async () => {
    expect(kilkis.city.id).toBe('kilkis');
    expect(kilkis.sources.map((source) => source.id)).toEqual(['fsk', 'osm']);
    expect(kilkis.sourceIds).toEqual({ duty: 'fsk', extended: null });
    expect(await kilkis.fetchExtendedHours({} as never)).toEqual({ items: [], failures: [] });
  });

  it('expects a list for every town every day', () => {
    expect(kilkis.rules.groupIds).toEqual(['kilkis', 'polykastro', 'axioupoli', 'goumenissa']);
  });
});

describe('expandKilkisAddress', () => {
  it.each([
    ['Μ. ΑΛΕΞΑΝΔΡΟΥ 98', 'Μεγάλου Αλεξάνδρου 98'],
    ['21 ΙΟΥΝΙΟΥ 87', '21ης Ιουνίου 87'],
    ['Γ.ΚΑΠΕΤΑ 15', 'Καπετά 15'],
    ['ΕΛ.ΒΕΝΙΖΕΛΟΥ 11', 'Ελευθερίου Βενιζέλου 11'],
    ['ΠΛ. ΕΛΕΥΘΕΡΙΑΣ 21', 'Πλατεία Ελευθερίας 21'],
  ])('writes %s as OpenStreetMap does', (printed, expanded) => {
    expect(expandKilkisAddress(printed)).toBe(expanded);
  });

  it('leaves an address it does not know as it was printed', () => {
    expect(expandKilkisAddress('ΙΩΝΟΣ ΔΡΑΓΟΥΜΗ 54')).toBe('ΙΩΝΟΣ ΔΡΑΓΟΥΜΗ 54');
    expect(expandKilkisAddress('ΣΟΛΩΝΟΣ 7(ΟΠΙΣΘΕΝ ΚΤΕΛ)')).toBe('ΣΟΛΩΝΟΣ 7(ΟΠΙΣΘΕΝ ΚΤΕΛ)');
  });
});
