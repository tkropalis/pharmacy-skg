/**
 * The Cyclades, from the Pharmaceutical Association of the Cyclades' own duty page
 * (fscyclades.gr, cyclades/parse.ts). The form offers 13 places, each an island and a town
 * ("Πάρος (Νάουσα)"); the page answers one place and one day at a time, about six weeks ahead,
 * with the pharmacy on duty and its coordinates. The next 7 days are read, a request a second.
 *
 * Each island is a duty group: the islands are far apart, each has its own rota, and a day's
 * list for an island is published only when every one of its places was read, so a request that
 * failed leaves that island's pharmacies "not published" in the app instead of "not on duty".
 * An island's pharmacies share its name as their locality (people look for "Νάξος", not for the
 * towns of the form).
 *
 * The page states no hours; it says only that a duty lasts until 08:00 the next morning, and
 * that in places with 2 to 6 pharmacies the pharmacy on duty may close at midday, is not in the
 * pharmacy overnight and serves whoever phones (Presidential Decree 479/1981). Such a place's
 * duty is on call, as an ITeQ "*" is (decision D26): "on duty, call first" for the duty day.
 * The other places' duty is "on duty, hours not stated" (decision D23). The page does not say
 * which places are which, so ON_CALL_PLACES below is from the rotation each place showed in 30
 * days.
 *
 * A pharmacy's id is its phone, and the page prints two numbers for pharmacies they are not
 * (WRONG_PHONES): those entries are printed without a phone, which gives them an id from their
 * name, and are placed by the coordinates the page gives.
 */
import { addDays, CYCLADES } from '@pharmacy-skg/core';
import type { CycladesResult } from '../cyclades/parse.ts';
import type { DutyList, DutySection } from '../fsth/parse.ts';
import type { Warning } from '../registry/build.ts';
import { nameSimilarity } from '../registry/names.ts';
import type { Meta } from '../schema.ts';
import { describeError } from '../sources/http.ts';
import { CycladesClient } from '../sources/fscyclades.ts';
import { OSM_CREDIT } from './iteq.ts';
import {
  locationKey,
  type CityPipeline,
  type FetchedDutyList,
  type FetchedDutyLists,
  type ListedLocation,
} from './pipeline.ts';

/** How many days, from today, are stored as duty lists, like the other areas. */
const DAYS = 7;

interface Island {
  /** Our duty group's id. */
  readonly id: string;
  /** The island's name: the group's, and the locality of its pharmacies. */
  readonly name: string;
}

/** The islands by the name the form prints before the town. Thira is called Santorini. */
const ISLANDS: Readonly<Record<string, Island>> = {
  Άνδρος: { id: 'andros', name: 'Άνδρος' },
  Θήρα: { id: 'santorini', name: 'Σαντορίνη' },
  Μύκονος: { id: 'mykonos', name: 'Μύκονος' },
  Νάξος: { id: 'naxos', name: 'Νάξος' },
  Πάρος: { id: 'paros', name: 'Πάρος' },
  Σίφνος: { id: 'sifnos', name: 'Σίφνος' },
  Σύρος: { id: 'syros', name: 'Σύρος' },
  Τήνος: { id: 'tinos', name: 'Τήνος' },
};

/**
 * Whether the place's duty is on call: 6 or fewer pharmacies share it. Every place the form
 * offered on 2 Nov 2026, with the pharmacies its duty rotated through in the 30 days from then:
 * Syros 13, Naxos 9 and Mykonos 8 are more than 6; the others 0 to 6 (Parikia 6, Tinos 5, Fira
 * 4). A place the form adds later counts as on call until it is listed here, the safer reading.
 */
const ON_CALL_PLACES: Readonly<Record<string, boolean>> = {
  'Άνδρος (Κόρθι)': true,
  'Άνδρος (Χώρα)': true,
  'Θήρα (Εμπορείο)': true,
  'Θήρα (Μεσσαριά)': true,
  'Θήρα (Φηρά)': true,
  'Μύκονος (Άνω Μερά)': true,
  'Μύκονος (Χώρα)': false,
  'Νάξος (Χώρα)': false,
  'Πάρος (Νάουσα)': true,
  'Πάρος (Παροικιά)': true,
  'Σίφνος (Απολλωνία)': true,
  'Σύρος (Ερμούπολη)': false,
  'Τήνος (Χώρα)': true,
};

/**
 * Phones the page prints for a pharmacy they are not, by place: ΤΣΑΓΚΑΣ in Korthi is printed with
 * the number of ΔΙΑΠΟΥΛΗ in Chora (Andros), and ΣΠΑΝΟΥ in Naoussa with the one of ΝΟΥΛΑ in Parikia
 * (Paros). Each number's exchange tells where it is (Korthi 22820 6, Chora 22820 2; Naoussa
 * 22840 5, Parikia 22840 2), and both pharmacies turn up for weeks, so a phone-based id would
 * make two pharmacies one.
 */
const WRONG_PHONES: ReadonlySet<string> = new Set([
  'Άνδρος (Κόρθι)|2282023203',
  'Πάρος (Νάουσα)|2284021772',
]);

const FSC: Meta['sources'][number] = {
  id: 'fsc',
  name: {
    el: 'Φαρμακευτικός Σύλλογος Κυκλάδων',
    en: 'Pharmaceutical Association of the Cyclades',
  },
  url: 'https://www.fscyclades.gr/onduty-cyclades/',
  note: 'Duty lists, from fscyclades.gr',
};

/** The page prints no heading over the pharmacy on duty; this is what it calls it. */
const HEADING = 'Εφημερεύον φαρμακείο';

/** The island a place of the form is on: "Πάρος (Νάουσα)" is Paros. */
function islandOf(place: string): Island | undefined {
  return ISLANDS[/^(.*?)\s*\(/.exec(place)?.[1] ?? place];
}

type Entry = DutySection['entries'][number];

/** What the pipeline reads the page through (`CycladesClient`; a test replaces it). */
export interface CycladesSource {
  /** The page's address, which is also where the coordinates were read. */
  readonly page: string;
  /** Requests made so far, for the log. */
  readonly requests: number;
  places(): Promise<string[]>;
  day(date: string, place: string): Promise<CycladesResult>;
}

/** The next 7 days' duty list of every island, with the coordinates the page gives. */
export async function readCycladesLists(
  client: CycladesSource,
  today: string,
  log: (message: string) => void,
): Promise<FetchedDutyLists> {
  const items: FetchedDutyList[] = [];
  const failures: Warning[] = [];
  const locations = new Map<string, ListedLocation>();
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(today, i));
  // The time of this reading: of two readings of the same list, the later wins, and one whose
  // content did not change changes nothing (update/city.ts).
  const uploadedAt = new Date().toISOString();
  const source = { url: client.page, uploadedAt };

  const places = await client.places();
  if (places.length === 0) {
    throw new Error(`${client.page}: the form offers no places`);
  }
  const reported = new Set<string>();
  const report = (warning: Warning) => {
    if (reported.has(warning.message)) return;
    reported.add(warning.message);
    failures.push(warning);
  };
  // Who prints each phone: the pharmacy's id is its phone.
  const printedBy = new Map<string, Entry>();

  for (const date of dates) {
    const islands = new Map<
      string,
      { island: Island; complete: boolean; entries: Map<boolean, Entry[]> }
    >();
    for (const place of places) {
      const island = islandOf(place);
      if (!island) {
        report({
          code: 'unknown-place',
          message: `fscyclades.gr: "${place}" is on no known island`,
        });
        continue;
      }
      const read = islands.get(island.id) ?? { island, complete: true, entries: new Map() };
      islands.set(island.id, read);
      let result;
      try {
        result = await client.day(date, place);
      } catch (error) {
        read.complete = false;
        failures.push({
          code: 'unreadable-page',
          message: `fscyclades.gr ${date} ${place}: ${describeError(error)}`,
        });
        continue;
      }
      if (result.date !== date || result.place !== place) {
        read.complete = false;
        failures.push({
          code: 'unreadable-page',
          message: `fscyclades.gr: asked for ${date} ${place}, got ${result.date ?? 'no date'} ${result.place ?? 'no place'}`,
        });
        continue;
      }
      const onCall = ON_CALL_PLACES[place] ?? true;
      if (!(place in ON_CALL_PLACES)) {
        report({
          code: 'unknown-place',
          message: `fscyclades.gr: "${place}" is new; read as on call until ON_CALL_PLACES says`,
        });
      }
      for (const duty of result.duties) {
        if (!/^[26]\d{9}$/.test(duty.phone) || duty.name === '') {
          read.complete = false;
          failures.push({
            code: 'unreadable-page',
            message: `fscyclades.gr ${date} ${place}: "${duty.name}" with phone "${duty.phone}"`,
          });
          continue;
        }
        const entry: Entry = {
          locality: island.name,
          name: duty.name,
          address: duty.address,
          phone: WRONG_PHONES.has(`${place}|${duty.phone}`) ? '' : duty.phone,
        };
        if (entry.phone !== '') {
          const other = printedBy.get(entry.phone);
          if (other && nameSimilarity(other.name, entry.name) < 0.6) {
            // The same words whichever is read first, so the day after reports nothing new.
            const [a, b] = [other, entry].sort((x, y) => x.name.localeCompare(y.name, 'el'));
            report({
              code: 'phone-clash',
              message: `${a?.name} (${a?.address}) and ${b?.name} (${b?.address}) both print ${entry.phone}, which is the pharmacy's id`,
            });
          }
          printedBy.set(entry.phone, entry);
        }
        read.entries.set(onCall, [...(read.entries.get(onCall) ?? []), entry]);
        const key = locationKey(entry);
        if (duty.location === null) {
          report({
            code: 'no-listed-location',
            message: `fscyclades.gr ${date} ${place}: no coordinates (${duty.name})`,
          });
        } else if (!locations.has(key)) {
          locations.set(key, { ...duty.location, ref: client.page });
        }
      }
    }
    for (const { island, complete, entries } of islands.values()) {
      // A list from some of an island's places would say the others have no duty.
      if (!complete || entries.size === 0) continue;
      const sections: DutySection[] = [...entries]
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([onCall, list]) => ({
          kind: 'on-duty',
          heading: HEADING,
          hours: null,
          ...(onCall ? { onCall: true } : {}),
          extraHours: [],
          notes: [],
          entries: list,
        }));
      const list: DutyList = { groupId: island.id, groupName: island.name, date, sections };
      items.push({ list, source });
    }
  }
  log(
    `fscyclades.gr: ${items.length} lists for ${dates.length} days in ${places.length} places ` +
      `(${client.requests} requests)`,
  );
  return { items, failures, locations };
}

export const cyclades: CityPipeline = {
  city: CYCLADES,
  sources: [FSC, OSM_CREDIT],
  sourceIds: { duty: FSC.id, extended: null },

  fetchDutyLists: ({ today, log }) => readCycladesLists(new CycladesClient(), today, log),

  async fetchExtendedHours() {
    return { items: [], failures: [] };
  },

  geocoding: {},
  // Loose, as for the ITeQ areas: a section holds the pharmacies on duty in a few towns of one
  // island at most, and the area names about 40 pharmacies in a month (2 Nov 2026).
  rules: {
    // The islands that had a duty every day of the month from 2 Nov 2026. Sifnos and Ano Mera
    // (Mykonos) had none on any day; the group is still read if they ever do.
    groupIds: ['andros', 'mykonos', 'naxos', 'paros', 'santorini', 'syros', 'tinos'],
    sectionRange: () => [1, 6],
    pharmacies: [5, 200],
    minExtendedEntries: null,
  },
};
