/**
 * Ilia, from the Region of Western Greece's decisions on Diavgeia (decision D26): the year's duty
 * table, "Διημερεύσεις – Διανυκτερεύσεις φαρμακείων της Περιφερειακής Ενότητας Ηλείας έτους
 * 2026" (ADA ΡΣΦΞ7Λ6-2Κ3, 16 Dec 2025), a 212-page PDF that names every pharmacy's duty for the
 * year. The next 7 days of it are stored as duty lists like the other areas' (D11, D27) and every
 * pharmacy it names is the roster, so the regular hours (core's regular-hours.ts, from decision
 * ΨΛΖΩ7Λ6-2Υ0) can show the others open and closed.
 *
 * The table is found by searching the open-data API each run, and read only when it is new: its
 * rows are kept in data/ilia/inputs/duty-table.json under its ADA and version (ilia/cache.ts), so
 * a run costs a few searches, not 212 pages. The 2027 table is expected in December and is found
 * the same way; a table that cannot be read in full fails the run and leaves the stored data as it
 * was.
 *
 * Other decisions change who is on duty: "Προσωρινή απαλλαγή από εφημερία" (a pharmacist
 * excused for months) and "προσωρινού κλεισίματος" (a pharmacy closed for days). They are free
 * text in images, so the ones read by hand are in ilia/duties.ts and the run reports every
 * other it finds.
 */
import { addDays, ILIA } from '@pharmacy-skg/core';
import {
  fileTableCache,
  fromCached,
  PARSER_VERSION,
  toCached,
  type CachedTable,
  type TableCache,
} from '../ilia/cache.ts';
import { EXEMPTIONS, ILIA_TOWNS, iliaDutyLists, iliaRoster } from '../ilia/duties.ts';
import { parseDutyTable, type Table } from '../ilia/table.ts';
import { extractTextItems } from '../pdf.ts';
import type { Warning } from '../registry/build.ts';
import type { Meta } from '../schema.ts';
import {
  DiavgeiaClient,
  diavgeiaUrl,
  type DiavgeiaDecision,
  type DiavgeiaSearch,
} from '../sources/diavgeia.ts';
import { OSM_CREDIT } from './iteq.ts';
import type { CityPipeline, FetchedDutyList, Roster, RosterEntry } from './pipeline.ts';

/** The Region of Western Greece, and the public health directorate of its Ilia regional unit. */
const ORG = '5004';
const UNIT = '78414';
/** How many days, from today, are stored as duty lists. */
const DAYS = 7;
/** A decision on a closure is about days: only a recent one is worth a person's look. */
const CLOSURE_DAYS = 14;

const WESTERN_GREECE: Meta['sources'][number] = {
  id: 'pde',
  name: { el: 'Περιφέρεια Δυτικής Ελλάδας', en: 'Region of Western Greece' },
  url: 'https://diavgeia.gov.gr/',
  note: 'Duty table ΡΣΦΞ7Λ6-2Κ3 and regular hours ΨΛΖΩ7Λ6-2Υ0, 2026 (diavgeia.gov.gr)',
};

/**
 * Decisions on a pharmacist excused from duty that were read and change no duty now: the ones
 * that the table of 16 Dec 2025 already leaves out (the decision of 15 Dec 2025, but for
 * Panagopoulou, a partner of Bafi, whose pharmacy keeps serving), a pharmacy that is not in the
 * table (Kypriotis, 12 Jun 2026; Tsiklira, 1 Jul 2026), and Kampitsi's, which ended on 30 Jan
 * 2026. Those that take duties off the table are in `EXEMPTIONS`.
 */
const REVIEWED = new Set(['9ΦΝΖ7Λ6-9ΡΨ', 'Ψ7857Λ6-3ΞΞ', 'ΨΦΦΡ7Λ6-ΔΥΛ', 'ΡΘ1Ξ7Λ6-ΟΞΑ']);

/** What the pipeline needs of Diavgeia (the client, or a test's). */
export interface DiavgeiaSource {
  search(query: DiavgeiaSearch): Promise<DiavgeiaDecision[]>;
  document(ada: string): Promise<Uint8Array>;
}

export interface IliaDeps {
  readonly diavgeia: DiavgeiaSource;
  readonly cache: TableCache;
  /** Reads the table from its PDF. */
  readonly readTable: (pdf: Uint8Array) => Promise<Table>;
}

/** Every date of the year, in order. */
function datesOf(year: number): string[] {
  const dates: string[] = [];
  for (let date = `${year}-01-01`; date <= `${year}-12-31`; date = addDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

/**
 * What is wrong with a table read from a PDF, if anything: a town of the area missing, a day
 * without a duty in one, or any row or cell the reader could not make sense of. A table like
 * that is not published: it would leave days without a pharmacy on duty.
 */
export function tableProblems(table: Table): string[] {
  const problems = table.warnings.map((w) => `${w.code}: ${w.message}`);
  const known = new Set(ILIA_TOWNS.map((town) => town.printed));
  const have = new Map<string, Set<string>>();
  for (const row of table.rows) {
    if (!known.has(row.town)) problems.push(`unknown town "${row.town}"`);
    have.set(row.town, (have.get(row.town) ?? new Set<string>()).add(row.date));
  }
  const year = datesOf(table.year);
  for (const town of ILIA_TOWNS) {
    const dates = have.get(town.printed);
    if (!dates) {
      problems.push(`no rows for ${town.printed}`);
      continue;
    }
    const missing = year.filter((date) => !dates.has(date));
    if (missing.length > 0) {
      problems.push(`${town.printed}: no duty on ${missing.length} days, from ${missing[0]}`);
    }
  }
  return problems;
}

/** The year a duty table is for, from its subject ("… Ηλείας έτους 2026"), or null. */
export function tableYear(decision: DiavgeiaDecision): number | null {
  if (!/Διανυκτερεύσεις/.test(decision.subject) || !/Ηλείας/.test(decision.subject)) return null;
  const year = /έτους\s+(\d{4})/.exec(decision.subject)?.[1];
  return year === undefined ? null : Number(year);
}

export function createIlia({ diavgeia, cache, readTable }: IliaDeps): CityPipeline {
  return {
    city: ILIA,
    sources: [WESTERN_GREECE, OSM_CREDIT],
    sourceIds: { duty: WESTERN_GREECE.id, extended: null },

    async fetchDutyLists({ today, log }) {
      const failures: Warning[] = [];
      const dates = new Set(Array.from({ length: DAYS }, (_, i) => addDays(today, i)));
      const years = [...new Set([...dates].map((date) => Number(date.slice(0, 4))))];

      // The tables: a year's is posted in December before it, so look from October before.
      const found = await diavgeia.search({
        org: ORG,
        unit: UNIT,
        subject: 'Διημερεύσεις',
        from: `${Math.min(...years) - 1}-10-01`,
        to: today,
      });
      const stored = await cache.read();
      const tables: { decision: DiavgeiaDecision; table: Table; cached: CachedTable }[] = [];
      let read = false;
      for (const year of years) {
        // The latest posting for the year: a corrected table is a decision of its own.
        const decision = found.find((d) => d.status === 'PUBLISHED' && tableYear(d) === year);
        if (!decision) {
          failures.push({ code: 'no-table', message: `no duty table for ${year} on Diavgeia` });
          continue;
        }
        const have = stored.find(
          (t) =>
            t.ada === decision.ada &&
            t.versionId === decision.versionId &&
            t.parser === PARSER_VERSION,
        );
        if (have) {
          tables.push({ decision, table: fromCached(have), cached: have });
          continue;
        }
        log(`diavgeia.gov.gr: reading ${decision.ada} (${decision.subject})`);
        const table = await readTable(await diavgeia.document(decision.ada));
        const problems = tableProblems(table);
        if (problems.length > 0) {
          throw new Error(
            `the duty table ${decision.ada} could not be read in full (${problems.length} problems): ` +
              problems.slice(0, 5).join('; '),
          );
        }
        tables.push({ decision, table, cached: toCached(decision, table) });
        read = true;
      }
      // Only the tables still wanted are kept.
      if (read) await cache.write(tables.map(({ cached }) => cached));

      // The next 7 days, from the table of their year.
      const items: FetchedDutyList[] = [];
      const exempted = new Map<string, string>();
      for (const { decision, table } of tables) {
        const wanted = new Set([...dates].filter((date) => date.startsWith(`${table.year}-`)));
        const built = iliaDutyLists(table, wanted);
        failures.push(...built.warnings);
        for (const exemption of built.exempted) exempted.set(exemption.ada, exemption.who);
        for (const list of built.lists) {
          items.push({
            list,
            source: { url: diavgeiaUrl(decision.ada), uploadedAt: decision.postedAt },
          });
        }
      }
      for (const [ada, who] of exempted) log(`  ${ada}: ${who}, left off the duty lists`);

      // Every pharmacy the tables name, with the first day it is on duty.
      const entries = new Map<string, RosterEntry>();
      for (const { table } of tables) {
        for (const entry of iliaRoster(table)) {
          const key = entry.phone || `${entry.groupId}|${entry.name}`;
          const known = entries.get(key);
          entries.set(key, {
            ...entry,
            date: known && known.date < entry.date ? known.date : entry.date,
          });
        }
      }
      const posted = tables.map(({ decision }) => decision.postedAt.slice(0, 10)).sort();
      const roster: Roster | undefined =
        entries.size > 0
          ? {
              // Stable between runs: the roster changes only when a table does.
              sweptAt: posted.at(-1) ?? today,
              readThrough:
                tables
                  .map(({ table }) => `${table.year}-12-31`)
                  .sort()
                  .at(-1) ?? today,
              entries: [...entries.values()].sort(
                (a, b) => a.phone.localeCompare(b.phone) || a.name.localeCompare(b.name, 'el'),
              ),
            }
          : undefined;

      failures.push(...(await unreadDecisions(diavgeia, tables, today)));

      log(
        `diavgeia.gov.gr: ${items.length} lists for ${dates.size} days, ` +
          `${roster?.entries.length ?? 0} pharmacies named`,
      );
      return { items, failures, ...(roster ? { roster } : {}) };
    },

    async fetchExtendedHours() {
      return { items: [], failures: [] };
    },

    // The table prints addresses in capitals without accents.
    geocoding: { restoreStreets: true },
    // A town's list has one or two sections of a few pharmacies, never an empty one; the table
    // names about 80 pharmacies (2 Nov 2026).
    rules: {
      groupIds: ILIA_TOWNS.map((town) => town.id),
      sectionRange: () => [1, 12],
      pharmacies: [60, 130],
      minExtendedEntries: null,
    },
  };
}

/**
 * Decisions of the unit about a pharmacist excused from duty, or a pharmacy closed, that are not
 * in `REVIEWED` or `EXEMPTIONS`, as warnings with their ADA. A closure is about days, so only a
 * recent one is listed; an exemption can last the year, and the table's year starts with the
 * decisions of the December before.
 */
async function unreadDecisions(
  diavgeia: DiavgeiaSource,
  tables: readonly { table: Table }[],
  today: string,
): Promise<Warning[]> {
  const year = Math.min(...tables.map(({ table }) => table.year), Number(today.slice(0, 4)));
  const from = `${year - 1}-12-01`;
  const read = new Set([...REVIEWED, ...EXEMPTIONS.map((e) => e.ada)]);
  const warnings: Warning[] = [];
  const kinds = [
    { subject: 'απαλλαγή', code: 'unread-exemption', since: from },
    { subject: 'κλεισίματος', code: 'unread-closure', since: addDays(today, -CLOSURE_DAYS) },
  ];
  for (const { subject, code, since } of kinds) {
    const decisions = await diavgeia.search({ org: ORG, unit: UNIT, subject, from, to: today });
    for (const decision of decisions) {
      if (decision.status !== 'PUBLISHED' || decision.issueDate < since || read.has(decision.ada)) {
        continue;
      }
      warnings.push({
        code,
        message: `${decision.ada} (${decision.issueDate}) is not applied, read it: ${decision.subject.slice(0, 160)}`,
      });
    }
  }
  return warnings;
}

export const ilia: CityPipeline = createIlia({
  diavgeia: new DiavgeiaClient(),
  cache: fileTableCache(),
  readTable: async (pdf) => parseDutyTable(await extractTextItems(pdf)),
});
