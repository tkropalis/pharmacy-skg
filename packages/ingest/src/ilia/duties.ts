/**
 * The Ilia duty table (ilia/table.ts) as the app's duty lists and roster. Each of the table's
 * eleven towns is a duty group, since each has its own rota; a pharmacy's locality is its town.
 *
 * A row's hours are the windows printed, each its own section like the other areas' (D26): the
 * "Διανυκτερεύει" column decides night duty, so a window that ends the next morning is an
 * overnight duty only on a row marked "Ναι", and a row that contradicts its column is reported
 * and left out. A "*" after the hours ("08:00-08:00*", the small towns' round-the-clock duty)
 * is read as on call, the way the ITeQ lists read theirs: the app says "call first" and never
 * "open" (its meaning is not stated in the table; docs/research-greece.md).
 */
import type { DutyKind, TimeWindow } from '@pharmacy-skg/core';
import type { DutyEntry, DutyList, DutySection } from '../fsth/parse.ts';
import type { RosterEntry } from '../cities/pipeline.ts';
import type { Warning } from '../registry/build.ts';
import { matchKey } from '../text.ts';
import type { Table, TableRow } from './table.ts';

/** A town of the table: one duty group. */
export interface IliaTown {
  /** Our stable id for the group, which the regular hours name (core's regular-hours.ts). */
  readonly id: string;
  /** The heading as the table prints it. */
  readonly printed: string;
  /** The name shown to people, which is also each pharmacy's locality. */
  readonly name: string;
}

export const ILIA_TOWNS: readonly IliaTown[] = [
  { id: 'amaliada', printed: 'ΑΜΑΛΙΑΔΑ', name: 'Αμαλιάδα' },
  { id: 'andravida', printed: 'ΑΝΔΡΑΒΙΔΑ', name: 'Ανδραβίδα' },
  { id: 'ancient-olympia', printed: 'ΑΡΧΑΙΑ ΟΛΥΜΠΙΑ', name: 'Αρχαία Ολυμπία' },
  { id: 'varda', printed: 'ΒΑΡΔΑ', name: 'Βάρδα' },
  { id: 'vartholomio', printed: 'ΒΑΡΘΟΛΟΜΙΟ', name: 'Βαρθολομιό' },
  { id: 'gastouni', printed: 'ΓΑΣΤΟΥΝΗ', name: 'Γαστούνη' },
  { id: 'zacharo', printed: 'ΖΑΧΑΡΩ', name: 'Ζαχάρω' },
  { id: 'krestena', printed: 'ΚΡΕΣΤΕΝΑ', name: 'Κρέστενα' },
  { id: 'lechaina', printed: 'ΛΕΧΑΙΝΑ', name: 'Λεχαινά' },
  { id: 'pyrgos', printed: 'ΠΥΡΓΟΣ', name: 'Πύργος' },
  { id: 'tragano', printed: 'ΤΡΑΓΑΝΟ', name: 'Τραγανό' },
];

const TOWN_BY_PRINTED = new Map(ILIA_TOWNS.map((town) => [matchKey(town.printed), town]));

export function iliaTown(printed: string): IliaTown | undefined {
  return TOWN_BY_PRINTED.get(matchKey(printed));
}

/**
 * A duty a Diavgeia decision takes off the table's, for one pharmacy and the days the decision
 * names ("Προσωρινή απαλλαγή από εφημερία – διανυκτέρευση"). The decisions are free text in a
 * PDF, read by hand: each is here with its ADA, only where the decision names a pharmacy that is
 * the table's by its street, alone in it (a partner's exemption leaves the other partner to
 * serve). The run reports every such decision it finds that is not listed (cities/ilia.ts).
 */
export interface Exemption {
  readonly ada: string;
  /** The pharmacy's phone in the table. */
  readonly phone: string;
  /** First and last day (YYYY-MM-DD), both included. */
  readonly from: string;
  readonly to: string;
  /** Who, as the decision names them. */
  readonly who: string;
}

/**
 * The exemptions read so far (docs/research-greece.md has the ones left out, and why). Liosi's
 * pharmacy at Kolokotroni 10 in Amaliada is hers alone: the decision of 6 Feb 2026 exempts her
 * "from 06-02-2026 to 31-12-2026", while the table, issued on 16 Dec 2025, still lists her.
 */
export const EXEMPTIONS: readonly Exemption[] = [
  {
    ada: '9ΤΝΗ7Λ6-710',
    phone: '2622029394',
    from: '2026-02-06',
    to: '2026-12-31',
    who: 'Αλίκη Λιόση του Αποστόλου, Κολοκοτρώνη 10, Αμαλιάδα',
  },
];

interface DutyWindow {
  readonly hours: TimeWindow;
  readonly kind: DutyKind;
  readonly onCall: boolean;
}

const WINDOW = /^(\d\d:\d\d)-(\d\d:\d\d)(\*?)$/;

/**
 * The duties a row's hours state, one per window; null when the hours contradict the night
 * column (a row marked "Ναι" with nothing that ends the next morning, or the reverse).
 */
export function dutyWindows(hours: string | null, overnight: boolean): DutyWindow[] | null {
  // Varda's rows state no hours: an overnight duty, shown as on duty with its hours not stated.
  if (hours === null) return overnight ? [] : null;
  const windows: DutyWindow[] = [];
  for (const part of hours.split(' & ')) {
    const match = WINDOW.exec(part);
    if (!match) return null;
    const [, from = '', to = '', star = ''] = match;
    const toNextDay = to <= from;
    windows.push({
      hours: { from, to, toNextDay },
      // A window into the next morning that starts in the morning is round the clock.
      kind: toNextDay ? (from < '12:00' ? 'on-duty' : 'overnight') : 'day',
      onCall: star === '*',
    });
  }
  const endsNextDay = windows.some((window) => window.hours.toNextDay);
  return endsNextDay === overnight ? windows : null;
}

/** Who a row is, from the table's readings. */
function entryOf(
  row: TableRow,
  town: IliaTown,
  byPhone: ReadonlyMap<string, { name: string; address: string }>,
): DutyEntry | null {
  if (row.phone === null) {
    return { locality: town.name, name: row.name ?? '', address: '', phone: '' };
  }
  const pharmacy = byPhone.get(row.phone);
  if (!pharmacy) return null;
  return { locality: town.name, name: pharmacy.name, address: pharmacy.address, phone: row.phone };
}

function exemptOn(entry: DutyEntry, date: string): Exemption | undefined {
  return EXEMPTIONS.find((e) => e.phone === entry.phone && e.from <= date && date <= e.to);
}

type MutableSection = DutySection & { entries: DutyEntry[] };

/**
 * The duty lists of `dates`: one per town with duties that day, one section per window of each
 * distinct hours, in the order of the day's hours. Rows that cannot be used are reported.
 */
export function iliaDutyLists(
  table: Table,
  dates: ReadonlySet<string>,
): { lists: DutyList[]; warnings: Warning[]; exempted: Exemption[] } {
  const warnings: Warning[] = [];
  const exempted = new Set<Exemption>();
  const byPhone = new Map(
    table.pharmacies.flatMap((p) => (p.phone ? [[p.phone, p] as const] : [])),
  );
  const sections = new Map<string, Map<string, MutableSection>>();
  const towns = new Map<string, IliaTown>();

  for (const row of table.rows) {
    if (!dates.has(row.date)) continue;
    const town = iliaTown(row.town);
    if (!town) {
      warnings.push({ code: 'unknown-town', message: `${row.date}: "${row.town}"` });
      continue;
    }
    const windows = dutyWindows(row.hours, row.overnight);
    const entry = entryOf(row, town, byPhone);
    if (!windows || !entry) {
      warnings.push({
        code: 'unusable-row',
        message: `${row.date} ${row.town} page ${row.page}: ${row.hours ?? 'no hours'}, ${row.overnight ? 'Ναι' : 'Όχι'}, ${row.phone ?? row.name}`,
      });
      continue;
    }
    const exemption = exemptOn(entry, row.date);
    if (exemption) {
      exempted.add(exemption);
      continue;
    }
    const key = `${row.date}|${town.id}`;
    towns.set(key, town);
    const groupSections = sections.get(key) ?? new Map<string, MutableSection>();
    sections.set(key, groupSections);
    const heading = row.hours ?? 'ΔΙΑΝΥΚΤΕΡΕΥΣΗ';
    // Varda's rows have no windows: one section, overnight, hours not stated.
    const parts: (DutyWindow | null)[] = windows.length > 0 ? windows : [null];
    parts.forEach((window, i) => {
      const sectionKey = `${heading}|${i}`;
      const section = groupSections.get(sectionKey) ?? {
        kind: window?.kind ?? 'overnight',
        heading,
        hours: window?.hours ?? null,
        ...(window?.onCall ? { onCall: true as const } : {}),
        extraHours: [],
        notes: [],
        entries: [],
      };
      groupSections.set(sectionKey, section);
      section.entries.push(entry);
    });
  }

  const lists: DutyList[] = [...sections]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, groupSections]) => {
      const [date = '', groupId = ''] = key.split('|');
      const town = towns.get(key);
      return {
        groupId,
        groupName: town?.name ?? groupId,
        date,
        sections: [...groupSections.values()].sort(
          (a, b) =>
            (a.hours?.from ?? '99').localeCompare(b.hours?.from ?? '99') ||
            a.heading.localeCompare(b.heading),
        ),
      };
    });
  return { lists, warnings, exempted: [...exempted] };
}

/**
 * Every pharmacy the table names, as the roster (D27), each with the first date it is on duty.
 * The coordinates are not in the table: they come from Overture and the address.
 */
export function iliaRoster(table: Table): RosterEntry[] {
  const first = new Map<string, string>();
  for (const row of table.rows) {
    const key = row.phone ?? `${row.town}|${matchKey(row.name ?? '')}`;
    if (!first.has(key) || row.date < (first.get(key) ?? '')) first.set(key, row.date);
  }
  const entries: RosterEntry[] = [];
  for (const pharmacy of table.pharmacies) {
    const town = iliaTown(pharmacy.town);
    const key = pharmacy.phone ?? `${pharmacy.town}|${matchKey(pharmacy.name)}`;
    const date = first.get(key);
    if (!town || !date) continue;
    entries.push({
      groupId: town.id,
      date,
      locality: town.name,
      name: pharmacy.name,
      address: pharmacy.address,
      phone: pharmacy.phone ?? '',
      location: null,
    });
  }
  return entries;
}
