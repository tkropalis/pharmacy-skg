/**
 * The Kilkis regional unit's four towns, from the Pharmaceutical Association of Kilkis' own site
 * (fskilkis.gr, fskilkis/parse.ts): one article per town and month, each with a table. Each town
 * is a duty group of its own, as the association publishes it, and its name is the pharmacies'
 * locality.
 *
 * Only what the tables state becomes hours. Kilkis prints each pharmacy's window ("Από 8:00 Έως
 * 21:00", overnight "Από 17:30 Έως 8:00 της επομένης"), which the ITeQ hours reader understands;
 * Polykastro, Axioupoli and Goumenissa print none, so their duty is "on duty, hours not stated"
 * (decision D23). The tables give no coordinates: the pharmacies are placed by Overture (phone)
 * and then Nominatim (address), inside the area's bounds (decision D22).
 */
import { addDays, KILKIS } from '@pharmacy-skg/core';
import type { DutyList, DutySection } from '../fsth/parse.ts';
import type { KilkisArticle, KilkisDay } from '../fskilkis/parse.ts';
import { iteqDuties } from '../iteq/heading.ts';
import type { Warning } from '../registry/build.ts';
import type { Meta } from '../schema.ts';
import { describeError } from '../sources/http.ts';
import { KilkisClient } from '../sources/fskilkis.ts';
import { OSM_CREDIT } from './iteq.ts';
import type { CityPipeline, FetchedDutyList, FetchedDutyLists } from './pipeline.ts';

/** How many days, from today, are stored as duty lists, like the other areas. */
const DAYS = 7;

interface Town {
  /** Our duty group's id. */
  readonly id: string;
  /** The town's name: the group's, and the locality of its pharmacies. */
  readonly name: string;
  /** The section's id on the site (`/efimeries/63-kilkis`). */
  readonly section: string;
}

const TOWNS: readonly Town[] = [
  { id: 'kilkis', name: 'Κιλκίς', section: '63-kilkis' },
  { id: 'polykastro', name: 'Πολύκαστρο', section: '64-polykastro' },
  { id: 'axioupoli', name: 'Αξιούπολη', section: '65-axioupoli' },
  { id: 'goumenissa', name: 'Γουμένισσα', section: '66-goumenissa' },
];

const FSK: Meta['sources'][number] = {
  id: 'fsk',
  name: { el: 'Φαρμακευτικός Σύλλογος Κιλκίς', en: 'Pharmaceutical Association of Kilkis' },
  url: 'https://www.fskilkis.gr/efimeries',
  note: 'Duty lists, from fskilkis.gr',
};

/** The heading of a duty without hours: the site prints none, so this names the page's list. */
const BARE_HEADING = 'Εφημερεύοντα φαρμακεία';

/**
 * The sections of one town's day. The windows are printed in more than one way ("Έως"/"έως",
 * "της επομένης"/"Επόμενης"), so each section's heading is rewritten the one way: a window is
 * one section.
 */
function sections(
  day: KilkisDay,
  warnings: Warning[],
  town: Town,
  locality: string,
): DutySection[] {
  const byHeading = new Map<string, DutySection & { entries: DutySection['entries'][number][] }>();
  const add = (
    heading: string,
    kind: DutySection['kind'],
    hours: DutySection['hours'],
    duty: KilkisDay['duties'][number],
  ) => {
    const section = byHeading.get(heading) ?? {
      kind,
      heading,
      hours,
      extraHours: [],
      notes: [],
      entries: [],
    };
    byHeading.set(heading, section);
    section.entries.push({
      locality,
      name: duty.name,
      address: duty.address,
      phone: duty.phone,
    });
  };
  for (const duty of day.duties) {
    if (duty.hours.length === 0) {
      add(BARE_HEADING, 'on-duty', null, duty);
      continue;
    }
    for (const printed of duty.hours) {
      const parsed = iteqDuties(printed, day.date);
      const window = parsed?.length === 1 ? parsed[0] : undefined;
      if (!window?.hours) {
        warnings.push({
          code: 'unknown-heading',
          message: `${day.date} ${town.id}: "${printed}" for ${duty.name}`,
        });
        continue;
      }
      const { from, to, toNextDay } = window.hours;
      add(
        `Από ${from} έως ${to}${toNextDay ? ' της επομένης' : ''}`,
        window.kind,
        window.hours,
        duty,
      );
    }
  }
  return [...byHeading.values()];
}

/** What the pipeline reads the site through (`KilkisClient`; a test replaces it). */
export interface KilkisSource {
  readonly origin: string;
  /** Requests made so far, for the log. */
  readonly requests: number;
  articles(): Promise<KilkisArticle[]>;
  days(article: KilkisArticle): Promise<KilkisDay[]>;
}

/** The next 7 days' duty list of every town. */
export async function readKilkisLists(
  client: KilkisSource,
  today: string,
  log: (message: string) => void,
): Promise<FetchedDutyLists> {
  const items: FetchedDutyList[] = [];
  const failures: Warning[] = [];
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(today, i));
  const months = [...new Set(dates.map((date) => date.slice(0, 7)))];
  // The time of this reading: of two readings of the same list, the later wins, and one whose
  // content did not change changes nothing (update/city.ts).
  const uploadedAt = new Date().toISOString();

  const articles = await client.articles();
  for (const town of TOWNS) {
    const days = new Map<string, KilkisDay>();
    const urls = new Map<string, string>();
    // The months whose article was read: a date missing from another is already reported.
    const readMonths = new Set<string>();
    for (const month of months) {
      const article: KilkisArticle | undefined = articles.find(
        (a) => a.section === town.section && a.month === Number(month.slice(5)),
      );
      if (!article) {
        failures.push({
          code: 'unreadable-page',
          message: `fskilkis.gr: no article for ${town.id} ${month}`,
        });
        continue;
      }
      try {
        for (const day of await client.days(article)) {
          days.set(day.date, day);
          urls.set(day.date, `${client.origin}${article.path}`);
        }
        readMonths.add(month);
      } catch (error) {
        failures.push({
          code: 'unreadable-page',
          message: `fskilkis.gr ${article.path}: ${describeError(error)}`,
        });
      }
    }
    for (const date of dates) {
      const day = days.get(date);
      // An article keeps last year's days until it is rewritten: a date it lacks is not read.
      if (!day) {
        if (!readMonths.has(date.slice(0, 7))) continue;
        failures.push({
          code: 'no-duty',
          message: `fskilkis.gr: ${town.id} has no list for ${date}`,
        });
        continue;
      }
      const warnings: Warning[] = [];
      const list: DutyList = {
        groupId: town.id,
        groupName: town.name,
        date,
        sections: sections(day, warnings, town, town.name),
      };
      failures.push(...warnings);
      if (list.sections.length > 0) {
        items.push({ list, source: { url: urls.get(date) ?? client.origin, uploadedAt } });
      }
    }
  }
  log(`fskilkis.gr: ${items.length} lists for ${dates.length} days (${client.requests} requests)`);
  return { items, failures };
}

/**
 * The streets the tables abbreviate or number differently from OpenStreetMap: the town's main
 * streets (seen on 2 Nov 2026). "Μ. ΑΛΕΞΑΝΔΡΟΥ 98, Πολύκαστρο" finds nothing; "Μεγάλου
 * Αλεξάνδρου 98, Πολύκαστρο" finds the street.
 */
const STREETS: readonly (readonly [RegExp, string])[] = [
  [/^Μ\.\s*ΑΛΕΞΑΝΔΡΟΥ/i, 'Μεγάλου Αλεξάνδρου'],
  [/^21\s+ΙΟΥΝΙΟΥ/i, '21ης Ιουνίου'],
  [/^Γ\.\s*ΚΑΠΕΤΑ/i, 'Καπετά'],
  [/^ΕΛ\.\s*ΒΕΝΙΖΕΛΟΥ/i, 'Ελευθερίου Βενιζέλου'],
  [/^ΠΛ\.\s*ΕΛΕΥΘΕΡΙΑΣ/i, 'Πλατεία Ελευθερίας'],
];

/** The address with its street written the way OpenStreetMap does. */
export function expandKilkisAddress(address: string): string {
  const street = STREETS.find(([pattern]) => pattern.test(address.trim()));
  return street ? address.trim().replace(street[0], street[1]) : address;
}

export const kilkis: CityPipeline = {
  city: KILKIS,
  sources: [FSK, OSM_CREDIT],
  sourceIds: { duty: FSK.id, extended: null },

  fetchDutyLists: ({ today, log }) => readKilkisLists(new KilkisClient(), today, log),

  async fetchExtendedHours() {
    return { items: [], failures: [] };
  },

  geocoding: { expandAddress: expandKilkisAddress },
  // Loose, as for the ITeQ areas. Kilkis names about two pharmacies a day (a day and a night
  // one, a Saturday morning four or five); the other towns one a day (2 Nov 2026). The area
  // has about 45 pharmacies on its tables (Overture lists ~16 in Kilkis, 8 in Polykastro).
  rules: {
    groupIds: TOWNS.map((town) => town.id),
    sectionRange: (groupId) => (groupId === 'kilkis' ? [1, 10] : [1, 3]),
    pharmacies: [10, 120],
    minExtendedEntries: null,
  },
};
