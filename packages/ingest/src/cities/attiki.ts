/**
 * Attica, from its association's own duty site (fsa-efimeries.gr, iteq/fsa.ts). The cards are
 * ITeQ's, in a page of their own: the hours read as on the shared platform (iteq/heading.ts),
 * the whole area is one group, as the site publishes it, and each card's place is the pharmacy's
 * locality. Every card carries its coordinates. The site offers about 200 days; like the other
 * areas, the next 7 are read, one page a second.
 */
import { addDays, ATTIKI } from '@pharmacy-skg/core';
import { iteqDutyLists } from '../iteq/lists.ts';
import type { Warning } from '../registry/build.ts';
import type { Meta } from '../schema.ts';
import { FsaClient } from '../sources/fsa.ts';
import { OSM_CREDIT } from './iteq.ts';
import type { CityPipeline, FetchedDutyList, ListedLocation } from './pipeline.ts';

/** How many days, from today, are read. */
const DAYS = 7;

const FSA: Meta['sources'][number] = {
  id: 'fsa',
  name: { el: 'Φαρμακευτικός Σύλλογος Αττικής', en: 'Pharmaceutical Association of Attica' },
  url: 'https://fsa-efimeries.gr/',
  note: 'Duty lists, from fsa-efimeries.gr',
};

export const attiki: CityPipeline = {
  city: ATTIKI,
  sources: [FSA, OSM_CREDIT],
  sourceIds: { duty: FSA.id, extended: null },

  async fetchDutyLists({ today, log }) {
    const client = new FsaClient();
    const items: FetchedDutyList[] = [];
    const failures: Warning[] = [];
    const locations = new Map<string, ListedLocation>();
    const last = addDays(today, DAYS - 1);
    const dates = (await client.dates()).filter((date) => date >= today && date <= last);
    // The time of this reading: of two readings of the same list, the later wins, and one whose
    // content did not change changes nothing (cli/update.ts).
    const uploadedAt = new Date().toISOString();
    const grouping = { kind: 'area', id: ATTIKI.defaultGroupId, name: ATTIKI.name.el } as const;

    for (const date of dates) {
      let cards;
      try {
        cards = await client.day(date);
      } catch (error) {
        failures.push({
          code: 'unreadable-page',
          message: `fsa-efimeries.gr ${date}: ${String(error)}`,
        });
        continue;
      }
      const page = { date, dates: [], token: null, cards };
      const { lists, warnings } = iteqDutyLists(page, date, grouping);
      failures.push(...warnings);
      for (const list of lists)
        items.push({ list, source: { url: `${client.origin}/`, uploadedAt } });
      for (const card of cards) {
        if (card.location === null) {
          failures.push({
            code: 'no-listed-location',
            message: `fsa-efimeries.gr ${date}: no coordinates (${card.name})`,
          });
        } else if (!locations.has(card.phone)) {
          locations.set(card.phone, { ...card.location, ref: `${client.origin}/` });
        }
      }
    }
    log(
      `fsa-efimeries.gr: ${items.length} lists for ${dates.length} days, ` +
        `${locations.size} placed pharmacies (${client.requests} requests)`,
    );
    return { items, failures, locations };
  },

  async fetchExtendedHours() {
    return { items: [], failures: [] };
  },

  geocoding: {},
  // Loose, as for the ITeQ areas: a list today and tomorrow, and no section empty or absurdly
  // long (about 76 pharmacies a day in six kinds of duty, 8 Oct 2026).
  rules: {
    groupIds: [ATTIKI.defaultGroupId],
    sectionRange: () => [1, 80],
    pharmacies: [1, 3000],
    minExtendedEntries: null,
  },
};
