/**
 * A city whose association publishes its duty lists on ITeQ's platform (`<area>.efhmeries.gr`).
 * The lists carry each pharmacy's coordinates, so geocoding is only a fallback.
 */
import type { City } from '@pharmacy-skg/core';
import { inGreece } from '@pharmacy-skg/core';
import { iteqDutyLists, type IteqGrouping, type IteqSector } from '../iteq/lists.ts';
import type { IteqCard } from '../iteq/parse.ts';
import type { Warning } from '../registry/build.ts';
import type { Meta } from '../schema.ts';
import { IteqClient } from '../sources/iteq.ts';
import type {
  CityPipeline,
  FetchedDutyList,
  GeocodeArea,
  ListedLocation,
  ValidationRules,
} from './pipeline.ts';

export interface IteqArea {
  readonly city: City;
  /** The site's host, e.g. 'larisa.efhmeries.gr'. */
  readonly host: string;
  /** The association, credited as the source of the duty lists. */
  readonly association: Meta['sources'][number];
  /**
   * The sectors, when the cards print them (Larissa); otherwise the whole area is one group and
   * each card's place is the pharmacy's locality.
   */
  readonly sectors?: readonly IteqSector[];
  readonly rules: ValidationRules;
  readonly geocoding?: GeocodeArea;
}

const OSM_CREDIT: Meta['sources'][number] = {
  id: 'osm',
  name: { el: 'Συντελεστές OpenStreetMap', en: 'OpenStreetMap contributors' },
  url: 'https://www.openstreetmap.org/copyright',
  note: 'Geocoding via Nominatim, ODbL, where the list gives no coordinates',
};

export function iteqPipeline(area: IteqArea): CityPipeline {
  const grouping: IteqGrouping = area.sectors
    ? { kind: 'sectors', sectors: area.sectors }
    : { kind: 'area', id: area.city.defaultGroupId, name: area.city.name.el };
  return {
    city: area.city,
    sources: [area.association, OSM_CREDIT],
    sourceIds: { duty: area.association.id, extended: null },

    async fetchDutyLists({ listedLocations, log }) {
      const client = new IteqClient(area.host);
      const items: FetchedDutyList[] = [];
      const failures: Warning[] = [];
      const cards = new Map<string, IteqCard>();
      const home = await client.home();
      // The time of this reading: of two readings of the same list, the later wins, and one
      // whose content did not change changes nothing (cli/update.ts).
      const uploadedAt = new Date().toISOString();

      for (const date of home.dates) {
        let page = home;
        if (date !== home.date) {
          try {
            page = await client.day(date);
          } catch (error) {
            failures.push({
              code: 'unreadable-page',
              message: `${area.host} ${date}: ${String(error)}`,
            });
            continue;
          }
        }
        if (page.date !== date) {
          failures.push({
            code: 'unreadable-page',
            message: `${area.host}: asked for ${date}, got ${page.date ?? 'no date'}`,
          });
          continue;
        }
        const { lists, warnings } = iteqDutyLists(page, date, grouping);
        failures.push(...warnings);
        for (const list of lists)
          items.push({ list, source: { url: `${client.origin}/`, uploadedAt } });
        for (const card of page.cards) if (card.detailsId) cards.set(card.detailsId, card);
      }

      // Coordinates for the pharmacies that have none yet (the pharmacy id is its phone).
      const known = new Set([...listedLocations.values()].map((location) => location.ref));
      const locations = new Map<string, ListedLocation>();
      for (const [id, card] of cards) {
        const ref = client.detailsUrl(id);
        if (known.has(ref) || listedLocations.has(card.phone) || locations.has(card.phone))
          continue;
        try {
          const point = await client.details(id);
          // The area's own bounds are only roughly known: anywhere in Greece is believed.
          if (point && inGreece(point)) {
            locations.set(card.phone, { ...point, ref });
          } else {
            failures.push({
              code: 'no-listed-location',
              message: `${ref}: ${point ? `${point.lat}, ${point.lon} is outside Greece` : 'no coordinates'} (${card.name})`,
            });
          }
        } catch (error) {
          failures.push({ code: 'unreadable-page', message: `${ref}: ${String(error)}` });
        }
      }
      log(
        `${area.host}: ${items.length} lists for ${home.dates.length} days, ` +
          `${locations.size} new coordinates (${client.requests} requests)`,
      );
      return { items, failures, locations };
    },

    async fetchExtendedHours() {
      return { items: [], failures: [] };
    },

    geocoding: area.geocoding ?? {},
    rules: area.rules,
  };
}
