/**
 * Corfu, from its association's own pages on farmakeu.static.otenet.gr. The duty page shows only
 * today, in Greek and English, with the hours in each heading and no coordinates; the members'
 * page lists every member with the address and phone of the pharmacy. So each run stores the
 * list under the page's own date and keeps the earlier days, the members are the area's roster
 * (as Attica keeps one, decision D27) read once a week, and every pharmacy is placed by its
 * phone in Overture's pharmacies or by its address with Nominatim (decision D22).
 *
 * The Region's regular hours for Corfu are on Diavgeia (decision D26) but its longer hours, which
 * it lists every two months in PDF tables, are not read yet, so the app shows only the
 * pharmacies on duty.
 */
import { CORFU } from '@pharmacy-skg/core';
import { corfuPlace } from '../corfu/places.ts';
import type { CorfuDuties, CorfuPharmacy } from '../corfu/parse.ts';
import type { DutyEntry, DutyList, DutySection } from '../fsth/parse.ts';
import { iteqDuties, type IteqDuty } from '../iteq/heading.ts';
import type { Warning } from '../registry/build.ts';
import type { Meta } from '../schema.ts';
import { CORFU_ORIGIN, CorfuClient } from '../sources/corfu.ts';
import { describeError } from '../sources/http.ts';
import { squash } from '../text.ts';
import { addDays } from '../time.ts';
import { OSM_CREDIT } from './iteq.ts';
import type { CityPipeline, FetchedDutyLists, Roster, RosterEntry } from './pipeline.ts';

const FARMAKEU: Meta['sources'][number] = {
  id: 'farmakeu',
  name: { el: 'Φαρμακευτικός Σύλλογος Κέρκυρας', en: 'Pharmaceutical Association of Corfu' },
  url: `${CORFU_ORIGIN}/`,
  note: 'Duty lists and members, from farmakeu.static.otenet.gr',
};

/** How often the members are read again. */
const SWEEP_DAYS = 7;

/**
 * The duties a heading states. The page words them "ΔΙΗΜΕΡΕΥΟΥΝ ΑΠΟ ΤΙΣ 8:00 ΕΩΣ ΤΙΣ 21:00";
 * without the "ΤΙΣ" that is a window ITeQ's sites also print (iteq/heading.ts).
 */
export function corfuDuties(heading: string, date: string): IteqDuty[] | null {
  const text = squash(heading).replace(/(^|\s)ΤΙΣ(?=\s|$)/gi, ' ');
  const duties = iteqDuties(text, date);
  if (duties) return duties;
  // "ΔΙΗΜΕΡΕΥΟΥΝ" alone: on duty by day, no hours stated.
  if (/ΔΙΗΜΕΡΕΥ/i.test(text) && !/\d/.test(text)) {
    return [{ kind: 'day', hours: null, onCall: false }];
  }
  return null;
}

type MutableSection = DutySection & { entries: DutyEntry[] };

function entryOf(pharmacy: CorfuPharmacy, warnings: Warning[]): DutyEntry {
  const { place, known } = corfuPlace(pharmacy.address);
  if (!known) {
    warnings.push({
      code: 'unnamed-place',
      message: `${pharmacy.name}: no place known for "${pharmacy.address}", taken as ${place} (corfu/places.ts)`,
    });
  }
  return {
    locality: place,
    name: pharmacy.name,
    address: pharmacy.address,
    phone: pharmacy.phone,
  };
}

/** The duty list for the page's date: one section per window of each heading. */
export function corfuDutyList(duties: CorfuDuties): { list: DutyList | null; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const sections: MutableSection[] = [];
  for (const block of duties.blocks) {
    const parsed = corfuDuties(block.heading, duties.date);
    if (!parsed) {
      warnings.push({
        code: 'unknown-heading',
        message: `${duties.date}: "${block.heading}" for ${block.pharmacies.map((p) => p.name).join(', ')}`,
      });
      continue;
    }
    if (block.pharmacies.length === 0) continue;
    const entries = block.pharmacies.map((pharmacy) => entryOf(pharmacy, warnings));
    for (const duty of parsed) {
      sections.push({
        kind: duty.kind,
        heading: block.heading,
        hours: duty.hours,
        ...(duty.onCall ? { onCall: true as const } : {}),
        extraHours: [],
        notes: [],
        entries: [...entries],
      });
    }
  }
  return {
    list:
      sections.length === 0
        ? null
        : {
            groupId: CORFU.defaultGroupId,
            groupName: CORFU.name.el,
            date: duties.date,
            sections,
          },
    warnings,
  };
}

/**
 * The roster from the members' page: one pharmacy per phone, named by its members in the
 * association's order ("ΚΟΣΚΙΝΑΣ ΝΙΚΟΣ - ΚΟΣΚΙΝΑΣ ΣΠΥΡΟΣ"). A member with no valid phone cannot be told apart
 * from another pharmacy and is reported. `before` keeps the date a pharmacy was first named.
 */
export function corfuRoster(
  members: readonly CorfuPharmacy[],
  options: { today: string; before: Roster | null },
): { roster: Roster; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const firstNamed = new Map((options.before?.entries ?? []).map((e) => [e.phone, e.date]));
  const byPhone = new Map<string, { names: string[]; entry: DutyEntry }>();
  for (const member of members) {
    if (member.phone === '') {
      warnings.push({
        code: 'member-no-phone',
        message: `members: no valid phone for ${member.name}, ${member.address}`,
      });
      continue;
    }
    const found = byPhone.get(member.phone);
    if (found) {
      if (!found.names.includes(member.name)) found.names.push(member.name);
    } else {
      byPhone.set(member.phone, { names: [member.name], entry: entryOf(member, warnings) });
    }
  }
  const entries: RosterEntry[] = [...byPhone.values()]
    .map(({ names, entry }) => ({
      ...entry,
      name: names.join(' - '),
      groupId: CORFU.defaultGroupId,
      date: firstNamed.get(entry.phone) ?? options.today,
      location: null,
    }))
    .sort((a, b) => a.phone.localeCompare(b.phone));
  return {
    roster: { sweptAt: options.today, readThrough: options.today, entries },
    warnings,
  };
}

export function corfuPipeline(
  open: () => Pick<CorfuClient, 'duties' | 'members' | 'requests'> = () => new CorfuClient(),
): CityPipeline {
  return {
    city: CORFU,
    sources: [FARMAKEU, OSM_CREDIT],
    sourceIds: { duty: FARMAKEU.id, extended: null },

    async fetchDutyLists({ today, roster: stored, log }): Promise<FetchedDutyLists> {
      const client = open();
      const failures: Warning[] = [];
      const duties = await client.duties();
      // The time of this reading: of two readings of the same list, the later wins, and one whose
      // content did not change changes nothing (update/city.ts).
      const uploadedAt = new Date().toISOString();
      const url = `${CORFU_ORIGIN}/phduties.php`;

      let items: FetchedDutyLists['items'] = [];
      // The list belongs to the page's own date, whatever day the run thinks it is. A page more
      // than a day off is a clock or a cache gone wrong, not a list for any day we know.
      if (duties.date < addDays(today, -1) || duties.date > addDays(today, 1)) {
        failures.push({
          code: 'page-date',
          message: `farmakeu.static.otenet.gr shows ${duties.date} on ${today}: not read`,
        });
      } else {
        if (duties.date !== today) {
          failures.push({
            code: 'page-date',
            message: `farmakeu.static.otenet.gr shows ${duties.date} on ${today}`,
          });
        }
        const { list, warnings } = corfuDutyList(duties);
        failures.push(...warnings);
        if (list) items = [{ list, source: { url, uploadedAt } }];
      }

      // The members once a week: they change a few times a year.
      let roster: Roster | undefined;
      if (stored === null || stored.sweptAt <= addDays(today, -SWEEP_DAYS)) {
        try {
          const read = corfuRoster(await client.members(), { today, before: stored });
          roster = read.roster;
          failures.push(...read.warnings);
        } catch (error) {
          failures.push({
            code: 'unreadable-page',
            message: `farmakeu.static.otenet.gr members.php: ${describeError(error)}`,
          });
        }
      }
      log(
        `farmakeu.static.otenet.gr: ${duties.date}, ` +
          `${items[0]?.list.sections.reduce((n, s) => n + s.entries.length, 0) ?? 0} on duty, ` +
          `${roster ? `${roster.entries.length} members read` : 'members kept'} ` +
          `(${client.requests} requests)`,
      );
      return { items, failures, ...(roster ? { roster } : {}) };
    },

    async fetchExtendedHours() {
      return { items: [], failures: [] };
    },

    geocoding: {},
    // Five or six pharmacies on duty at a time; about 100 members, 85 pharmacies (2 Nov 2026).
    rules: {
      groupIds: [CORFU.defaultGroupId],
      sectionRange: () => [1, 30],
      pharmacies: [50, 250],
      todayOnly: true,
      minExtendedEntries: null,
    },
  };
}

export const corfu = corfuPipeline();
