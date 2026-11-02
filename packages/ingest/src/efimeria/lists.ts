/**
 * Achaia's duty page (efimeria/parse.ts) as our duty list and extended hours.
 *
 * The page's duties are windows in seconds from the midnight of its date: "14:30 - 21:00" is
 * 52,200 to 75,600, "02:00 - 08:30" the next morning 93,600 to 117,000. A pharmacy that works the
 * night is listed in each window ("21:00 - 02:00" and "02:00 - 08:30"); here its windows that
 * touch become one, since a duty section's hours start on the section's own day. A window that
 * starts after midnight and follows none of the pharmacy's own cannot be written, and is
 * reported.
 */
import type { DutyKind, TimeWindow } from '@pharmacy-skg/core';
import { scheduleText } from '../fsa/hours.ts';
import type { DutyEntry, DutyList, DutySection } from '../fsth/parse.ts';
import type { Schedule, TimeRange } from '../pkm/parse.ts';
import type { Warning } from '../registry/build.ts';
import { ExtendedHoursSchema, SCHEMA_VERSION, type ExtendedHours } from '../schema.ts';
import { matchKey } from '../text.ts';
import type { EfimeriaExtendedGroup, EfimeriaPage, EfimeriaPharmacy } from './parse.ts';

const DAY = 86_400;

/** The towns as people write them; the site's own names are "Δήμος Δύμης", "Παραλία". */
const TOWNS: Readonly<Record<string, string>> = {
  Patra: 'Πάτρα',
  Dimi: 'Δύμη',
  Paralia_Patrwn: 'Παραλία Πατρών',
  Vrahneika: 'Βραχνέικα',
  Rio: 'Ρίο',
  Messatida: 'Μεσσάτιδα',
  Kalavryta: 'Καλάβρυτα',
  Erineos: 'Νέος Ερινεός',
};

export function townName(pharmacy: Pick<EfimeriaPharmacy, 'townKey' | 'town'>): string {
  return TOWNS[pharmacy.townKey] ?? pharmacy.town;
}

const clock = (seconds: number) => {
  const minutes = Math.round(seconds / 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};

interface Merged {
  readonly fromSec: number;
  readonly toSec: number;
  readonly printed: string[];
}

/** The pharmacy's windows in order, those that touch or overlap joined. */
function mergeWindows(pharmacy: EfimeriaPharmacy): Merged[] {
  const sorted = [...pharmacy.windows].sort((a, b) => a.fromSec - b.fromSec || a.toSec - b.toSec);
  const merged: { fromSec: number; toSec: number; printed: string[] }[] = [];
  for (const window of sorted) {
    const last = merged.at(-1);
    if (last && window.fromSec <= last.toSec) {
      last.toSec = Math.max(last.toSec, window.toSec);
      last.printed.push(window.printed);
    } else {
      merged.push({ fromSec: window.fromSec, toSec: window.toSec, printed: [window.printed] });
    }
  }
  return merged;
}

function kindOf(hours: TimeWindow): DutyKind {
  if (hours.toNextDay) return hours.from < '12:00' ? 'on-duty' : 'overnight';
  return 'day';
}

type MutableSection = DutySection & { entries: DutyEntry[] };

/**
 * The area's duty list for the page's date: one section per distinct window, the pharmacies in
 * the page's order. Windows the site gives with another status than 1, and windows that cannot
 * be written, are reported and left out.
 */
export function efimeriaDutyList(
  page: EfimeriaPage,
  group: { readonly id: string; readonly name: string },
): { list: DutyList | null; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const sections = new Map<string, MutableSection>();
  for (const pharmacy of page.pharmacies) {
    const where = `${page.date} ${pharmacy.id} ${pharmacy.name}`;
    if (pharmacy.inactive > 0) {
      warnings.push({
        code: 'inactive-duty',
        message: `${where}: ${pharmacy.inactive} duties with a status other than 1 were not read`,
      });
    }
    for (const window of mergeWindows(pharmacy)) {
      const length = window.toSec - window.fromSec;
      if (window.fromSec < 0 || window.fromSec >= DAY || length <= 0 || length > DAY) {
        warnings.push({
          code: 'unwritable-window',
          message: `${where}: "${window.printed.join(' + ')}" (${window.fromSec}–${window.toSec} s) is not a window that starts on the day`,
        });
        continue;
      }
      const hours: TimeWindow = {
        from: clock(window.fromSec),
        to: clock(window.toSec),
        toNextDay: window.toSec >= DAY,
      };
      const heading = window.printed.join(' + ');
      const key = `${heading}|${hours.from}|${hours.to}|${hours.toNextDay}`;
      const section = sections.get(key) ?? {
        kind: kindOf(hours),
        heading,
        hours,
        extraHours: [],
        notes: [],
        entries: [],
      };
      sections.set(key, section);
      section.entries.push({
        locality: townName(pharmacy),
        name: pharmacy.name,
        address: pharmacy.address,
        phone: pharmacy.phone,
      });
    }
  }
  const ordered = [...sections.values()].sort(
    (a, b) =>
      (a.hours?.from ?? '').localeCompare(b.hours?.from ?? '') ||
      (a.hours?.to ?? '').localeCompare(b.hours?.to ?? ''),
  );
  return {
    list:
      ordered.length === 0
        ? null
        : { groupId: group.id, groupName: group.name, date: page.date, sections: ordered },
    warnings,
  };
}

// --- Extended hours --------------------------------------------------------------------------

export class UnreadableHoursError extends Error {}

const WEEKDAYS: readonly (readonly [string, number])[] = [
  ['ΔΕ', 1],
  ['ΤΡ', 2],
  ['ΤΕ', 3],
  ['ΠΕ', 4],
  ['ΠΑ', 5],
  ['ΣΑ', 6],
  ['ΚΥ', 7],
];

function weekday(token: string): number {
  const key = matchKey(token);
  const found = WEEKDAYS.find(([start]) => key.startsWith(start));
  if (!found || key.length > 10) throw new UnreadableHoursError(`not a weekday: "${token}"`);
  return found[1];
}

const RANGE = /^(\d{1,2})[.:](\d{2})\s*-\s*(\d{1,2})[.:](\d{2})$/;
const pad = (n: string) => n.padStart(2, '0');

/**
 * The hours lines of one group ("Δευ. & Τετ. : 08.30 - 14.30", "Δευ. - Παρ. : 8.00 - 21.00",
 * "Τρι. & Πεμ. & Παρ. : 8.30 - 14.30 & 17.30 - 21.00") as a weekly schedule. Anything else
 * throws, naming what was not understood: the hours of a pharmacy are never guessed.
 */
export function parseEfimeriaHours(lines: readonly string[]): Partial<Record<number, TimeRange[]>> {
  const days: Partial<Record<number, TimeRange[]>> = {};
  for (const line of lines) {
    const match = /^([^\d]+?)\s*:?\s*(\d.*)$/.exec(line);
    if (!match) throw new UnreadableHoursError(`not hours: "${line}"`);
    const [, dayText = '', rangeText = ''] = match;
    const weekdays: number[] = [];
    for (const part of dayText.split('&')) {
      const [first, last, ...more] = part.split('-').map((token) => token.trim());
      if (first === undefined || first === '' || more.length > 0 || last === '') {
        throw new UnreadableHoursError(`not weekdays: "${dayText}"`);
      }
      if (last === undefined) {
        weekdays.push(weekday(first));
      } else {
        const from = weekday(first);
        const to = weekday(last);
        if (from > to) throw new UnreadableHoursError(`not a range of weekdays: "${part}"`);
        for (let day = from; day <= to; day++) weekdays.push(day);
      }
    }
    const ranges: TimeRange[] = rangeText.split('&').map((text) => {
      const range = RANGE.exec(text.trim());
      if (!range) throw new UnreadableHoursError(`not a range of hours: "${text.trim()}"`);
      const [, h1 = '', m1 = '', h2 = '', m2 = ''] = range;
      const result = { from: `${pad(h1)}:${m1}`, to: `${pad(h2)}:${m2}` };
      if (
        Number(h1) > 23 ||
        Number(h2) > 23 ||
        Number(m1) > 59 ||
        Number(m2) > 59 ||
        result.from >= result.to
      ) {
        throw new UnreadableHoursError(`not a range of hours: "${text.trim()}"`);
      }
      return result;
    });
    for (const day of weekdays) {
      if (days[day]) throw new UnreadableHoursError(`weekday ${day} given twice`);
      days[day] = ranges;
    }
  }
  return days;
}

/**
 * The longer hours the page lists, as the stored list `efimeria.json`: valid from the day they
 * first appeared (`previous` keeps that date while the content is the same) to a week after the
 * last time they were read, since the page gives no dates. A group whose hours cannot be read is
 * reported and left out, so its pharmacies keep what the app knows of them.
 */
export function efimeriaExtendedHours(
  groups: readonly EfimeriaExtendedGroup[],
  options: {
    readonly today: string;
    /** The last day the list is believed (a week after today). */
    readonly until: string;
    readonly area: string;
    readonly url: string;
    readonly uploadedAt: string;
    readonly previous: ExtendedHours | undefined;
  },
): { list: ExtendedHours | null; warnings: Warning[] } {
  const warnings: Warning[] = [];
  // Checked by the schema when the list is built.
  const entries: (Omit<ExtendedHours['entries'][number], 'schedule'> & { schedule: Schedule })[] =
    [];
  for (const group of groups) {
    let schedule: Schedule;
    try {
      schedule = { type: 'weekly', days: parseEfimeriaHours(group.hours) };
    } catch (error) {
      if (!(error instanceof UnreadableHoursError)) throw error;
      warnings.push({
        code: 'invalid-hours',
        message: `extended hours "${group.hours.join(' ; ')}": ${error.message}; ${group.pharmacies.length} pharmacies left out`,
      });
      continue;
    }
    const text = scheduleText(schedule);
    for (const pharmacy of group.pharmacies) {
      entries.push({
        pharmacyId: '',
        name: pharmacy.name,
        address: pharmacy.address,
        postcode: '',
        area: options.area,
        schedule,
        scheduleText: text,
      });
    }
  }
  if (entries.length === 0) return { list: null, warnings };
  // The site shuffles the pharmacies of the block on every request.
  entries.sort(
    (a, b) => a.name.localeCompare(b.name, 'el') || a.address.localeCompare(b.address, 'el'),
  );

  // The same pharmacies with the same hours as the stored list (whose ids were matched since) are
  // the same list.
  const printed = (list: readonly { name: string; address: string; scheduleText: string }[]) =>
    JSON.stringify(list.map(({ name, address, scheduleText }) => [name, address, scheduleText]));
  const same =
    options.previous !== undefined && printed(options.previous.entries) === printed(entries);
  const from = same && options.previous ? options.previous.period.from : options.today;
  const list = ExtendedHoursSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    period: { from, to: options.until },
    title: 'Διευρυμένο ωράριο',
    announcementUrl: options.url,
    source: {
      url: options.url,
      uploadedAt:
        same && options.previous ? options.previous.source.uploadedAt : options.uploadedAt,
    },
    entries,
  });
  return { list, warnings };
}
