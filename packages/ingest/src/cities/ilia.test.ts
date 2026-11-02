import { describe, expect, it } from 'vitest';
import type { CachedTable, TableCache } from '../ilia/cache.ts';
import { ILIA_TOWNS } from '../ilia/duties.ts';
import type { Table, TableRow } from '../ilia/table.ts';
import { required } from '../required.ts';
import type { DiavgeiaDecision, DiavgeiaSearch } from '../sources/diavgeia.ts';
import { createIlia, tableProblems, tableYear, type DiavgeiaSource } from './ilia.ts';
import type { FetchContext } from './pipeline.ts';

const decision = (ada: string, subject: string, issueDate: string, versionId = 'v1') => ({
  ada,
  subject,
  issueDate,
  postedAt: `${issueDate}T12:00:00.000Z`,
  versionId,
  status: 'PUBLISHED',
  organizationId: '5004',
  unitIds: ['78414'],
});

const TABLE_2026 = decision(
  'ΡΣΦΞ7Λ6-2Κ3',
  'Διημερεύσεις – Διανυκτερεύσεις φαρμακείων της Περιφερειακής Ενότητας Ηλείας έτους 2026',
  '2025-12-16',
);
const TABLE_2027 = decision(
  'ΤΕΣΤ7Λ7-ΑΒΓ',
  'Διημερεύσεις – Διανυκτερεύσεις φαρμακείων της Περιφερειακής Ενότητας Ηλείας έτους 2027',
  '2026-12-15',
);

/** A table with every town on duty every day of the year, one pharmacy a town (Varda by name). */
function fullTable(year: number, drop?: { town: string; date: string }): Table {
  const rows: TableRow[] = [];
  for (let day = 0; day < (year % 4 === 0 ? 366 : 365); day++) {
    const date = new Date(Date.UTC(year, 0, 1 + day)).toISOString().slice(0, 10);
    for (const town of ILIA_TOWNS) {
      if (drop?.town === town.printed && drop.date === date) continue;
      const phone =
        town.id === 'varda' ? null : `26200000${String(ILIA_TOWNS.indexOf(town)).padStart(2, '0')}`;
      rows.push({
        town: town.printed,
        date,
        hours: phone ? '08:00-08:00*' : null,
        overnight: true,
        phone,
        name: phone ? null : 'ΒΑΡΔΑΣ ΕΝΑΣ',
        page: 1,
      });
    }
  }
  return {
    year,
    rows,
    warnings: [],
    pharmacies: ILIA_TOWNS.map((town, i) => ({
      phone: town.id === 'varda' ? null : `26200000${String(i).padStart(2, '0')}`,
      town: town.printed,
      name: town.id === 'varda' ? 'ΒΑΡΔΑΣ ΕΝΑΣ' : `ΦΑΡΜΑΚΕΙΟ ${town.name}`,
      address: town.id === 'varda' ? '' : `ΟΔΟΣ ${i + 1}`,
    })),
  };
}

interface World {
  /** The decisions each subject finds. */
  found: Record<string, DiavgeiaDecision[]>;
  /** The table each ADA holds. */
  tables: Map<string, Table>;
  documents: string[];
  searches: DiavgeiaSearch[];
  cache: CachedTable[];
  writes: number;
}

function world(init: Partial<Pick<World, 'found'>> = {}): World {
  return {
    found: { Διημερεύσεις: [TABLE_2026], απαλλαγή: [], κλεισίματος: [], ...init.found },
    tables: new Map([['ΡΣΦΞ7Λ6-2Κ3', fullTable(2026)]]),
    documents: [],
    searches: [],
    cache: [],
    writes: 0,
  };
}

function pipeline(w: World) {
  const diavgeia: DiavgeiaSource = {
    async search(query) {
      w.searches.push(query);
      return w.found[query.subject] ?? [];
    },
    async document(ada) {
      w.documents.push(ada);
      return new TextEncoder().encode(ada);
    },
  };
  const cache: TableCache = {
    read: async () => w.cache,
    write: async (tables) => {
      w.cache = [...tables];
      w.writes++;
    },
  };
  return createIlia({
    diavgeia,
    cache,
    readTable: async (pdf) => {
      const table = w.tables.get(new TextDecoder().decode(pdf));
      if (!table) throw new Error('no such table');
      return table;
    },
  });
}

const context = (today: string, logs: string[] = []): FetchContext => ({
  today,
  since: today,
  knownSources: new Set(),
  extendedFiles: new Map(),
  listedLocations: new Map(),
  roster: null,
  log: (message) => logs.push(message),
});

describe('the Ilia pipeline', () => {
  it("reads the year's table and stores the next 7 days, each town a group", async () => {
    const w = world();
    const logs: string[] = [];
    const fetched = await pipeline(w).fetchDutyLists(context('2026-11-02', logs));

    expect(w.documents).toEqual(['ΡΣΦΞ7Λ6-2Κ3']);
    expect(fetched.failures).toEqual([]);
    expect(fetched.items).toHaveLength(7 * 11);
    const dates = [...new Set(fetched.items.map((item) => item.list.date))];
    expect(dates).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
    ]);
    expect(new Set(fetched.items.map((item) => item.list.groupId))).toEqual(
      new Set(ILIA_TOWNS.map((town) => town.id)),
    );
    // The list is dated by the decision's posting, so a run that reads it again changes nothing.
    expect(fetched.items[0]?.source).toEqual({
      url: 'https://diavgeia.gov.gr/decision/view/ΡΣΦΞ7Λ6-2Κ3',
      uploadedAt: '2025-12-16T12:00:00.000Z',
    });
    expect(logs.some((line) => line.includes('reading ΡΣΦΞ7Λ6-2Κ3'))).toBe(true);
  });

  it('names every pharmacy of the table as the roster, stable from run to run', async () => {
    const w = world();
    const first = await pipeline(w).fetchDutyLists(context('2026-11-02'));
    const second = await pipeline(w).fetchDutyLists(context('2026-11-03'));

    expect(first.roster?.entries).toHaveLength(11);
    expect(first.roster).toEqual({
      sweptAt: '2025-12-16',
      readThrough: '2026-12-31',
      entries: expect.any(Array),
    });
    expect(second.roster).toEqual(first.roster);
    expect(first.roster?.entries.find((e) => e.groupId === 'varda')).toMatchObject({
      phone: '',
      name: 'ΒΑΡΔΑΣ ΕΝΑΣ',
      date: '2026-01-01',
    });
  });

  it('keeps the rows and reads the PDF again only when the decision is new or corrected', async () => {
    const w = world();
    await pipeline(w).fetchDutyLists(context('2026-11-02'));
    await pipeline(w).fetchDutyLists(context('2026-11-03'));
    expect(w.documents).toEqual(['ΡΣΦΞ7Λ6-2Κ3']);
    expect(w.writes).toBe(1);
    expect(w.cache).toHaveLength(1);
    expect(w.cache[0]).toMatchObject({ ada: 'ΡΣΦΞ7Λ6-2Κ3', versionId: 'v1', year: 2026 });

    // The Region corrects the decision: the same ADA with a new version.
    w.found['Διημερεύσεις'] = [{ ...TABLE_2026, versionId: 'v2' }];
    await pipeline(w).fetchDutyLists(context('2026-11-04'));
    expect(w.documents).toEqual(['ΡΣΦΞ7Λ6-2Κ3', 'ΡΣΦΞ7Λ6-2Κ3']);
    expect(w.cache[0]).toMatchObject({ versionId: 'v2' });
  });

  it("looks for the tables from the October before the year, in the Region's unit", async () => {
    const w = world();
    await pipeline(w).fetchDutyLists(context('2026-11-02'));
    expect(w.searches[0]).toEqual({
      org: '5004',
      unit: '78414',
      subject: 'Διημερεύσεις',
      from: '2025-10-01',
      to: '2026-11-02',
    });
  });

  it('takes the days either side of New Year from the two tables', async () => {
    const w = world({ found: { Διημερεύσεις: [TABLE_2027, TABLE_2026] } });
    w.tables.set('ΤΕΣΤ7Λ7-ΑΒΓ', fullTable(2027));
    const fetched = await pipeline(w).fetchDutyLists(context('2026-12-29'));

    expect(w.documents.sort()).toEqual(['ΡΣΦΞ7Λ6-2Κ3', 'ΤΕΣΤ7Λ7-ΑΒΓ']);
    const sources = new Map(
      fetched.items.map((item) => [item.list.date, item.source.url.split('/').at(-1)]),
    );
    expect(sources.get('2026-12-31')).toBe('ΡΣΦΞ7Λ6-2Κ3');
    expect(sources.get('2027-01-01')).toBe('ΤΕΣΤ7Λ7-ΑΒΓ');
    expect(sources.size).toBe(7);
    expect(w.cache.map((t) => t.year)).toEqual([2026, 2027]);
  });

  it('reports a year with no table yet and still lists the days it has', async () => {
    const w = world();
    const fetched = await pipeline(w).fetchDutyLists(context('2026-12-29'));
    expect(fetched.failures).toEqual([
      { code: 'no-table', message: 'no duty table for 2027 on Diavgeia' },
    ]);
    expect([...new Set(fetched.items.map((item) => item.list.date))]).toEqual([
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
    ]);
  });

  it('does not publish a table that could not be read in full', async () => {
    const w = world();
    w.tables.set('ΡΣΦΞ7Λ6-2Κ3', fullTable(2026, { town: 'ΠΥΡΓΟΣ', date: '2026-07-07' }));
    await expect(pipeline(w).fetchDutyLists(context('2026-11-02'))).rejects.toThrow(
      /could not be read in full.*ΠΥΡΓΟΣ: no duty on 1 days, from 2026-07-07/,
    );
    expect(w.writes).toBe(0);
  });

  it('leaves the exempted pharmacist off the list and says who', async () => {
    const w = world();
    const base = fullTable(2026);
    // Liosi's pharmacy (Amaliada, Kolokotroni 10) is on duty on 7 Nov, and so is another.
    const table: Table = {
      ...base,
      rows: [
        ...base.rows,
        {
          town: 'ΑΜΑΛΙΑΔΑ',
          date: '2026-11-07',
          hours: '08:00-17:30',
          overnight: false,
          phone: '2622029394',
          name: null,
          page: 1,
        },
      ],
      pharmacies: [
        ...base.pharmacies,
        { phone: '2622029394', town: 'ΑΜΑΛΙΑΔΑ', name: 'ΛΙΩΣΗ ΑΛΙΚΗ', address: 'ΚΟΛΟΚΟΤΡΩΝΗ 10' },
      ],
    };
    w.tables.set('ΡΣΦΞ7Λ6-2Κ3', table);
    const logs: string[] = [];
    const fetched = await pipeline(w).fetchDutyLists(context('2026-11-02', logs));

    const amaliada = fetched.items.find(
      (item) => item.list.date === '2026-11-07' && item.list.groupId === 'amaliada',
    );
    expect(amaliada?.list.sections.flatMap((s) => s.entries.map((e) => e.phone))).toEqual([
      '2620000000',
    ]);
    expect(logs).toContain(
      '  9ΤΝΗ7Λ6-710: Αλίκη Λιόση του Αποστόλου, Κολοκοτρώνη 10, Αμαλιάδα, left off the duty lists',
    );
  });

  it('reports decisions about duty that nobody has read, and not the ones that have been', async () => {
    const exemption = (ada: string, issueDate: string) =>
      decision(ada, 'Προσωρινή απαλλαγή από εφημερία', issueDate);
    const closure = (ada: string, issueDate: string) =>
      decision(ada, 'Έγκριση άδειας προσωρινού κλεισίματος Φαρμακείου', issueDate);
    const w = world({
      found: {
        Διημερεύσεις: [TABLE_2026],
        απαλλαγή: [
          exemption('ΝΕΑ7Λ6-001', '2026-10-20'),
          exemption('9ΤΝΗ7Λ6-710', '2026-02-06'),
          exemption('Ψ7857Λ6-3ΞΞ', '2025-12-15'),
        ],
        κλεισίματος: [closure('ΝΕΑ7Λ6-002', '2026-10-30'), closure('ΠΑΛΙΑ7Λ6-003', '2026-08-12')],
      },
    });
    const fetched = await pipeline(w).fetchDutyLists(context('2026-11-02'));

    expect(fetched.failures.map((f) => [f.code, f.message.split(' ')[0]])).toEqual([
      ['unread-exemption', 'ΝΕΑ7Λ6-001'],
      ['unread-closure', 'ΝΕΑ7Λ6-002'],
    ]);
    // The exemptions are looked for from the December before the table's year.
    expect(w.searches.filter((q) => q.subject === 'απαλλαγή')[0]?.from).toBe('2025-12-01');
  });
});

describe('tableProblems', () => {
  it('finds nothing wrong with a table that has every town on every day', () => {
    expect(tableProblems(fullTable(2026))).toEqual([]);
  });

  it('names a missing town, a missing day, an unknown town and a row that was not read', () => {
    const table = fullTable(2026);
    const problems = tableProblems({
      ...table,
      rows: [
        ...table.rows.filter((r) => r.town !== 'ΤΡΑΓΑΝΟ' && r.date !== '2026-03-05'),
        { ...required(table.rows[0], 'a row'), town: 'ΠΑΤΡΑ' },
      ],
      warnings: [{ code: 'unreadable-row', message: 'page 9' }],
    });
    expect(problems).toEqual([
      'unreadable-row: page 9',
      'unknown town "ΠΑΤΡΑ"',
      expect.stringMatching(/^ΑΜΑΛΙΑΔΑ: no duty on 1 days, from 2026-03-05$/),
      expect.stringMatching(/^ΑΝΔΡΑΒΙΔΑ: no duty on 1 days/),
      expect.stringMatching(/^ΑΡΧΑΙΑ ΟΛΥΜΠΙΑ: no duty on 1 days/),
      expect.stringMatching(/^ΒΑΡΔΑ: no duty on 1 days/),
      expect.stringMatching(/^ΒΑΡΘΟΛΟΜΙΟ: no duty on 1 days/),
      expect.stringMatching(/^ΓΑΣΤΟΥΝΗ: no duty on 1 days/),
      expect.stringMatching(/^ΖΑΧΑΡΩ: no duty on 1 days/),
      expect.stringMatching(/^ΚΡΕΣΤΕΝΑ: no duty on 1 days/),
      expect.stringMatching(/^ΛΕΧΑΙΝΑ: no duty on 1 days/),
      expect.stringMatching(/^ΠΥΡΓΟΣ: no duty on 1 days/),
      'no rows for ΤΡΑΓΑΝΟ',
    ]);
  });
});

describe('tableYear', () => {
  it('is the year a duty table is for, and nothing for other decisions about pharmacies', () => {
    expect(tableYear(TABLE_2026)).toBe(2026);
    expect(
      tableYear(
        decision(
          'X',
          '«Διημερεύσεις – Διανυκτερεύσεις φαρμακείων της Περιφερειακής Ενότητας  Ηλείας έτους 2025 »',
          '2024-12-24',
        ),
      ),
    ).toBe(2025);
    expect(
      tableYear(decision('X', 'Κενές θέσεις φαρμακείων μηνός Ιουνίου 2026', '2026-06-05')),
    ).toBeNull();
    expect(
      tableYear(
        decision(
          'X',
          'Διημερεύσεις – Διανυκτερεύσεις φαρμακείων του Νομού Αχαΐας έτους 2026',
          '2025-12-01',
        ),
      ),
    ).toBeNull();
  });
});
