/**
 * Achaia, from its association's duty site, efimeria.gr (run by Silktech). The site shows only
 * today: one page carries every area's duties with each pharmacy's coordinates, and the longer
 * hours ("Διευρυμένο ωράριο") with a name and an address per pharmacy, no phone. So each run
 * stores the list under the page's own date and keeps the earlier days, and the longer hours are
 * valid from the day they first appeared to a week after they were last read (decision D26).
 * The whole area is one duty group, as the site publishes it; a pharmacy's place is its town.
 */
import { ACHAIA } from '@pharmacy-skg/core';
import { efimeriaDutyList, efimeriaExtendedHours, townName } from '../efimeria/lists.ts';
import type { Warning } from '../registry/build.ts';
import type { Meta } from '../schema.ts';
import { EFIMERIA_ORIGIN, EfimeriaClient } from '../sources/efimeria.ts';
import { addDays } from '../time.ts';
import { OSM_CREDIT } from './iteq.ts';
import {
  locationKey,
  type CityPipeline,
  type FetchedDutyLists,
  type ListedLocation,
} from './pipeline.ts';

const EFIMERIA: Meta['sources'][number] = {
  id: 'efimeria',
  name: { el: 'Φαρμακευτικός Σύλλογος Αχαΐας', en: 'Pharmaceutical Association of Achaia' },
  url: `${EFIMERIA_ORIGIN}/`,
  note: 'Duty lists and longer hours, from efimeria.gr',
};

/** The longer hours are one file, replaced as they change. */
export const EXTENDED_FILE = 'efimeria.json';
/** How long the longer hours are believed after they were last read. */
const EXTENDED_DAYS = 7;

/** The places the longer hours' block lists belong to Patras: the municipality of Patras. */
const EXTENDED_AREA = 'Πάτρα';

export function achaiaPipeline(
  open: () => Pick<EfimeriaClient, 'page' | 'requests'> = () => new EfimeriaClient(),
): CityPipeline {
  return {
    city: ACHAIA,
    sources: [EFIMERIA, OSM_CREDIT],
    sourceIds: { duty: EFIMERIA.id, extended: null },

    async fetchDutyLists({ today, extendedFiles, log }): Promise<FetchedDutyLists> {
      const client = open();
      const page = await client.page();
      const failures: Warning[] = [];
      // The time of this reading: of two readings of the same list, the later wins, and one whose
      // content did not change changes nothing (update/city.ts).
      const uploadedAt = new Date().toISOString();

      // The list belongs to the page's own date, whatever day the run thinks it is. A page more
      // than a day off is a clock or a cache gone wrong, not a list for any day we know.
      if (page.date < addDays(today, -1) || page.date > addDays(today, 1)) {
        failures.push({
          code: 'page-date',
          message: `efimeria.gr shows ${page.date} ${page.time} on ${today}: not read`,
        });
        return { items: [], failures };
      }
      if (page.date !== today) {
        failures.push({
          code: 'page-date',
          message: `efimeria.gr shows ${page.date} ${page.time} on ${today}`,
        });
      }

      const { list, warnings } = efimeriaDutyList(page, {
        id: ACHAIA.defaultGroupId,
        name: ACHAIA.name.el,
      });
      failures.push(...warnings);
      const url = `${EFIMERIA_ORIGIN}/All`;
      const locations = new Map<string, ListedLocation>();
      for (const pharmacy of page.pharmacies) {
        locations.set(
          locationKey({
            phone: pharmacy.phone,
            name: pharmacy.name,
            locality: townName(pharmacy),
          }),
          { lat: pharmacy.lat, lon: pharmacy.lon, ref: url },
        );
      }

      const extendedFailures: Warning[] = [];
      const extended = efimeriaExtendedHours(page.extended, {
        today: page.date,
        until: addDays(page.date, EXTENDED_DAYS),
        area: EXTENDED_AREA,
        url,
        uploadedAt,
        previous: extendedFiles.get(EXTENDED_FILE),
      });
      extendedFailures.push(...extended.warnings);
      if (extended.list === null) {
        extendedFailures.push({
          code: 'no-extended',
          message:
            'efimeria.gr: no longer hours could be read; the stored list stays until it ends',
        });
      }

      log(
        `efimeria.gr: ${page.date} ${page.time}, ${page.pharmacies.length} pharmacies on duty, ` +
          `${extended.list?.entries.length ?? 0} with longer hours (${client.requests} requests)`,
      );
      return {
        items: list ? [{ list, source: { url, uploadedAt } }] : [],
        failures,
        locations,
        extendedHours: {
          items: extended.list ? [[EXTENDED_FILE, extended.list]] : [],
          failures: extendedFailures,
        },
      };
    },

    async fetchExtendedHours() {
      return { items: [], failures: [] };
    },

    geocoding: {},
    // About 16 pharmacies on duty a day, in six areas, and 53 with longer hours (2 Nov 2026); the
    // registry grows with the days kept. Far fewer means a read went wrong.
    rules: {
      groupIds: [ACHAIA.defaultGroupId],
      sectionRange: () => [1, 60],
      pharmacies: [20, 800],
      todayOnly: true,
      minExtendedEntries: 20,
    },
  };
}

export const achaia = achaiaPipeline();
