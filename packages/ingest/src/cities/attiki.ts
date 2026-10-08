/**
 * Attica, from its association's own duty site (fsa-efimeries.gr, iteq/fsa.ts). The cards are
 * ITeQ's, in a page of their own: the hours read as on the shared platform (iteq/heading.ts),
 * the whole area is one group, as the site publishes it, and each card's place is the pharmacy's
 * locality. Every card carries its coordinates. The site offers about 200 days: the next 7 are
 * stored as duty lists, like the other areas, and the rest only name the area's pharmacies (the
 * roster), since a week names only about 500 of its 3,100. Every offered date is read once a
 * week, and in between only the dates added since, one page a second.
 */
import { addDays, ATTIKI, holidaysOn, isoWeekday, regularRanges } from '@pharmacy-skg/core';
import { monthPeriod, monthsOf, readFsaTable } from '../fsa/extended.ts';
import { parseFsaHours, scheduleText, UnreadableHoursError, withMornings } from '../fsa/hours.ts';
import { iteqDutyLists } from '../iteq/lists.ts';
import { placeName } from '../iteq/places.ts';
import { extractPages } from '../pdf.ts';
import type { Warning } from '../registry/build.ts';
import { ExtendedHoursSchema, SCHEMA_VERSION, type ExtendedHours, type Meta } from '../schema.ts';
import { getBytes } from '../sources/http.ts';
import { FsaClient, listFsaExtendedHours } from '../sources/fsa.ts';
import { OSM_CREDIT } from './iteq.ts';
import type {
  CityPipeline,
  FetchedDutyList,
  ListedLocation,
  Roster,
  RosterEntry,
} from './pipeline.ts';

/** How many days, from today, are stored as duty lists. */
const DAYS = 7;
/** How often every offered date is read again for the roster. */
const SWEEP_DAYS = 7;

const FSA: Meta['sources'][number] = {
  id: 'fsa',
  name: { el: 'Φαρμακευτικός Σύλλογος Αττικής', en: 'Pharmaceutical Association of Attica' },
  url: 'https://fsa-efimeries.gr/',
  note: 'Duty lists, from fsa-efimeries.gr',
};

const FSA_HOURS: Meta['sources'][number] = {
  id: 'fsa-hours',
  name: { el: 'Φαρμακευτικός Σύλλογος Αττικής', en: 'Pharmaceutical Association of Attica' },
  url: 'https://fsa.gr/',
  note: 'Extended opening hours, from fsa.gr',
};

const PATT: Meta['sources'][number] = {
  id: 'patt',
  name: { el: 'Περιφέρεια Αττικής', en: 'Region of Attica' },
  url: 'https://diavgeia.gov.gr/doc/ΨΔ8Π7Λ7-ΚΒΨ',
  note: 'Regular opening hours, 13 May 2026 to 12 May 2027 (packages/core/src/regular-hours.ts)',
};

export const attiki: CityPipeline = {
  city: ATTIKI,
  sources: [FSA, FSA_HOURS, PATT, OSM_CREDIT],
  sourceIds: { duty: FSA.id, extended: FSA_HOURS.id },

  async fetchDutyLists({ today, log, roster: stored }) {
    const client = new FsaClient();
    const items: FetchedDutyList[] = [];
    const failures: Warning[] = [];
    const locations = new Map<string, ListedLocation>();
    const last = addDays(today, DAYS - 1);
    const offered = (await client.dates()).filter((date) => date >= today);
    // Every offered date once a week; otherwise the stored days and those added since.
    const sweep = stored === null || stored.sweptAt <= addDays(today, -SWEEP_DAYS);
    const dates = offered.filter(
      (date) => date <= last || sweep || stored === null || date > stored.readThrough,
    );
    // The time of this reading: of two readings of the same list, the later wins, and one whose
    // content did not change changes nothing (cli/update.ts).
    const uploadedAt = new Date().toISOString();
    const grouping = { kind: 'area', id: ATTIKI.defaultGroupId, name: ATTIKI.name.el } as const;
    const named = new Map<string, RosterEntry>();
    let unread = 0;

    for (const date of dates) {
      let cards;
      try {
        cards = await client.day(date);
      } catch (error) {
        unread++;
        failures.push({
          code: 'unreadable-page',
          message: `fsa-efimeries.gr ${date}: ${String(error)}`,
        });
        continue;
      }
      const page = { date, dates: [], token: null, cards };
      const { lists, warnings } = iteqDutyLists(page, date, grouping);
      // A later date's places repeat the warnings of the stored days: report each one once.
      for (const warning of warnings) {
        if (!failures.some((f) => f.message === warning.message)) failures.push(warning);
      }
      if (date <= last) {
        for (const list of lists)
          items.push({ list, source: { url: `${client.origin}/`, uploadedAt } });
      }
      const byPhone = new Map(cards.map((card) => [card.phone, card.location]));
      // The first date that names a pharmacy, so the stored roster changes only when one does.
      for (const entry of lists.flatMap((list) => list.sections.flatMap((s) => s.entries))) {
        if (named.has(entry.phone)) continue;
        named.set(entry.phone, {
          ...entry,
          groupId: ATTIKI.defaultGroupId,
          date,
          location: byPhone.get(entry.phone) ?? null,
        });
      }
      for (const card of cards) {
        if (card.location === null) {
          failures.push({
            code: 'no-listed-location',
            message: `fsa-efimeries.gr ${date}: no coordinates (${card.name})`,
          });
        } else if (date <= last && !locations.has(card.phone)) {
          locations.set(card.phone, { ...card.location, ref: `${client.origin}/` });
        }
      }
    }

    const roster = nextRoster(stored, named, {
      today,
      sweep,
      lastRead: dates.at(-1) ?? today,
      complete: unread === 0,
    });
    log(
      `fsa-efimeries.gr: ${items.length} lists for ${Math.min(dates.length, DAYS)} days, ` +
        `${dates.length} dates read${sweep ? ' (every offered date)' : ''}, ` +
        `${roster?.entries.length ?? 0} pharmacies named (${client.requests} requests)`,
    );
    return { items, failures, locations, ...(roster ? { roster } : {}) };
  },

  async fetchExtendedHours({ today, extendedFiles, roster, log }) {
    const items: (readonly [string, ExtendedHours])[] = [];
    const failures: Warning[] = [];
    // The rows are matched by phone to the pharmacies the duty site names, whose names and
    // addresses the entries take: the table's own are printed shifted (fsa/hours.ts).
    const named = new Map((roster?.entries ?? []).map((entry) => [entry.phone, entry]));
    if (named.size === 0) {
      failures.push({ code: 'no-roster', message: 'fsa.gr: no roster to match the tables to' });
      return { items, failures };
    }

    const done = new Set<string>();
    for (const link of await listFsaExtendedHours()) {
      const months = monthsOf(link.title);
      if (!months) {
        failures.push({
          code: 'unread-title',
          message: `fsa.gr: no two months in "${link.title}"`,
        });
        continue;
      }
      // The latest table for a month wins; a month that is over is not read.
      const current = months
        .map((month, column) => ({ month, column, period: monthPeriod(month) }))
        .filter(({ period }) => period.to >= today && !done.has(period.from));
      if (current.length === 0) continue;
      for (const { period } of current) done.add(period.from);
      const stored = current.every(
        ({ period }) =>
          extendedFiles.get(`${period.from}_${period.to}.json`)?.source.url === link.fileUrl,
      );
      if (stored) continue;

      const rows = readFsaTable(await extractPages(await getBytes(link.fileUrl)));
      const unknown = rows.filter((row) => !row.phones.some((phone) => named.has(phone)));
      for (const row of unknown) {
        failures.push({ code: 'extended-unknown-phone', message: `fsa.gr: ${row.printed}` });
      }
      for (const { month, column, period } of current) {
        const holidays = new Set(
          Array.from({ length: 31 }, (_, d) => addDays(period.from, d)).filter(
            (date) =>
              date <= period.to && holidaysOn(ATTIKI.id, date, ATTIKI.defaultGroupId).length > 0,
          ),
        );
        // The regular morning of each weekday this month (the afternoons change with the season).
        const mornings = new Map<number, readonly { from: string; to: string }[]>();
        for (let d = 0; d < 7; d++) {
          const date = addDays(period.from, d);
          mornings.set(
            isoWeekday(date),
            regularRanges(ATTIKI.id, date).filter((range) => range.to <= '15:00'),
          );
        }
        const seen = new Set<string>();
        // Checked by the schema when the list is built.
        const entries: object[] = [];
        let unread = 0;
        for (const row of rows) {
          const pharmacy = row.phones.map((phone) => named.get(phone)).find((p) => p);
          const text = row.hours[column] ?? '';
          if (!pharmacy || text === '' || seen.has(pharmacy.phone)) continue;
          seen.add(pharmacy.phone);
          try {
            const schedule = withMornings(
              parseFsaHours(text, month, holidays),
              (weekday) => mornings.get(weekday) ?? [],
              holidays,
            );
            entries.push({
              pharmacyId: '',
              name: pharmacy.name,
              address: pharmacy.address,
              postcode: '',
              area: pharmacy.locality,
              schedule,
              scheduleText: scheduleText(schedule),
            });
          } catch (error) {
            if (!(error instanceof UnreadableHoursError)) throw error;
            // Never guess what was meant: the pharmacy keeps its regular hours this month.
            unread++;
            failures.push({
              code: 'invalid-hours',
              message: `${period.from.slice(0, 7)} ${pharmacy.phone}: ${error.message}; left out: "${text}"`,
            });
          }
        }
        const file = `${period.from}_${period.to}.json`;
        items.push([
          file,
          ExtendedHoursSchema.parse({
            schemaVersion: SCHEMA_VERSION,
            period,
            title: link.title,
            announcementUrl: link.announcementUrl,
            source: { url: link.fileUrl, uploadedAt: link.publishedAt },
            entries,
          }),
        ]);
        log(`  fsa.gr ${file}: ${entries.length} entries, ${unread} left out unread`);
      }
      log(
        `  fsa.gr: ${rows.length} rows, ${unknown.length} with a phone the duty site does not name`,
      );
    }
    return { items, failures };
  },

  geocoding: {},
  // Loose, as for the ITeQ areas: a list today and tomorrow, and no section empty or absurdly
  // long (about 76 pharmacies a day in six kinds of duty, 8 Oct 2026). The roster names about
  // 3,100 pharmacies (8 Oct 2026): far fewer means a read went wrong.
  rules: {
    groupIds: [ATTIKI.defaultGroupId],
    sectionRange: () => [1, 80],
    pharmacies: [2500, 4000],
    // About 1,700 of the table's 2,000 rows read each month (Sep 2026).
    minExtendedEntries: 1000,
  },
};

/**
 * The roster after a run that read some dates (`named`, by phone). A full read replaces it; a
 * partial one adds the pharmacies new dates name. A run with a failed page keeps the stored one's
 * pharmacies and dates, so the next run reads those dates again.
 */
export function nextRoster(
  stored: Roster | null,
  named: ReadonlyMap<string, RosterEntry>,
  read: { today: string; sweep: boolean; lastRead: string; complete: boolean },
): Roster | undefined {
  // The stored days come before the last date read on an earlier run.
  const readThrough =
    stored !== null && stored.readThrough > read.lastRead ? stored.readThrough : read.lastRead;
  if (read.sweep && read.complete) {
    return { sweptAt: read.today, readThrough, entries: sortRoster(named.values()) };
  }
  if (stored === null) return undefined;
  // A place added to the list since a pharmacy was stored is written out now.
  const merged = new Map(
    stored.entries.map((entry) => [entry.phone, { ...entry, locality: placeName(entry.locality) }]),
  );
  for (const [phone, entry] of named) if (!merged.has(phone)) merged.set(phone, entry);
  return {
    sweptAt: stored.sweptAt,
    readThrough: read.complete ? readThrough : stored.readThrough,
    entries: sortRoster(merged.values()),
  };
}

/** By phone, so the stored file changes only where a pharmacy does. */
function sortRoster(entries: Iterable<RosterEntry>): RosterEntry[] {
  return [...entries].sort((a, b) => a.phone.localeCompare(b.phone));
}
