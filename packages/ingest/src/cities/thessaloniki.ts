/**
 * The Thessaloniki regional unit: duty lists from the Φαρμακευτικός Σύλλογος Θεσσαλονίκης (ΦΣΘ),
 * read from the PDFs thess.guide re-hosts (decision D20), and extended hours from the Region of
 * Central Macedonia (ΠΚΜ).
 */
import { THESSALONIKI } from '@pharmacy-skg/core';
import type { DutyKind } from '@pharmacy-skg/core';
import { AREA_GROUPS } from '../fsth/groups.ts';
import { parseDutyList } from '../fsth/parse.ts';
import { extractTextItems } from '../pdf.ts';
import { parseExtendedHours } from '../pkm/parse.ts';
import type { Warning } from '../registry/build.ts';
import type { GeocodeHit } from '../registry/geocode.ts';
import { ExtendedHoursSchema, SCHEMA_VERSION, type ExtendedHours } from '../schema.ts';
import { getBytes } from '../sources/http.ts';
import { listExtendedHours, type ExtendedHoursLink } from '../sources/pkm.ts';
import { listDutyPdfs } from '../sources/thessguide.ts';
import { readFirstSheet } from '../xlsx.ts';
import type { CityPipeline, FetchedDutyList } from './pipeline.ts';

/**
 * Expected entries per section in the metro list, from the Jun–Oct 2026 lists. A count outside
 * these ranges means the parser or the source broke.
 */
const METRO_RANGES: Readonly<Record<DutyKind, readonly [number, number]>> = {
  day: [20, 120],
  'saturday-extra': [20, 120],
  'on-duty': [1, 120],
  overnight: [10, 60],
  'after-midnight': [2, 15],
};
const OTHER_GROUP_RANGE = [1, 12] as const;

// In ΦΣΘ lists "Θεσσαλονίκη" is the municipality; neighbouring municipalities are listed by
// their own names. OpenStreetMap tags their addresses with the city "Θεσσαλονίκη" too, so a
// plain query finds e.g. Κομνηνών 17 in Καλαμαριά.
const CITY = 'Θεσσαλονίκη';
const MUNICIPALITY = 'Δήμος Θεσσαλονίκης';

export function queryLocality(locality: string): string {
  return locality === CITY ? MUNICIPALITY : locality;
}

/** Rejects a result for Θεσσαλονίκη that lies in another municipality. */
export function inLocality(hit: Pick<GeocodeHit, 'displayName'>, locality: string): boolean {
  if (locality !== CITY) return true;
  const municipality = /Δήμος [^,]+/.exec(hit.displayName)?.[0];
  return municipality === undefined || municipality === MUNICIPALITY;
}

export const thessaloniki: CityPipeline = {
  city: THESSALONIKI,

  sources: [
    {
      id: 'fsth',
      name: {
        el: 'Φαρμακευτικός Σύλλογος Θεσσαλονίκης',
        en: 'Pharmaceutical Association of Thessaloniki',
      },
      url: 'https://fsth.gr/',
      note: 'Duty lists, read from the copies re-hosted by thess.guide',
    },
    {
      id: 'pkm',
      name: { el: 'Περιφέρεια Κεντρικής Μακεδονίας', en: 'Region of Central Macedonia' },
      url: 'https://www.pkm.gov.gr/',
      note: 'Extended opening hours',
    },
    {
      id: 'overture',
      name: { el: 'Overture Maps Foundation', en: 'Overture Maps Foundation' },
      url: 'https://overturemaps.org/',
      note: 'Pharmacy locations, CDLA-Permissive-2.0',
    },
    {
      id: 'osm',
      name: { el: 'Συντελεστές OpenStreetMap', en: 'OpenStreetMap contributors' },
      url: 'https://www.openstreetmap.org/copyright',
      note: 'Geocoding via Nominatim, ODbL',
    },
  ],

  sourceIds: { duty: 'fsth', extended: 'pkm' },

  async fetchDutyLists({ since, knownSources, log }) {
    const links = await listDutyPdfs(since);
    log(`thess.guide: ${links.length} duty PDFs uploaded since ${since}`);
    const items: FetchedDutyList[] = [];
    const failures: Warning[] = [];
    for (const link of links) {
      if (knownSources.has(`${link.url}|${link.uploadedAt}`)) continue;
      try {
        const list = parseDutyList(await extractTextItems(await getBytes(link.url)));
        if (list.date !== link.date) {
          log(`  note: ${link.url} is named ${link.date} but lists ${list.date}`);
        }
        items.push({ list, source: { url: link.url, uploadedAt: link.uploadedAt } });
      } catch (error) {
        // Report and carry on: validation fails the run if this leaves today's or tomorrow's
        // lists incomplete.
        failures.push({ code: 'unreadable-pdf', message: `${link.url}: ${String(error)}` });
      }
    }
    log(`  parsed ${items.length} new or updated PDFs`);
    return { items, failures };
  },

  async fetchExtendedHours({ today, extendedFiles, log }) {
    // The latest announcement per period wins (ΠΚΜ re-publishes corrections).
    const announcements = new Map<string, ExtendedHoursLink>();
    for (const link of await listExtendedHours()) {
      if (link.period.to < today) continue;
      const key = `${link.period.from}_${link.period.to}`;
      const current = announcements.get(key);
      if (!current || current.publishedAt < link.publishedAt) announcements.set(key, link);
    }
    log(`ΠΚΜ: ${announcements.size} current extended-hours lists`);

    const items: (readonly [string, ExtendedHours])[] = [];
    const failures: Warning[] = [];
    for (const [key, link] of announcements) {
      const file = `${key}.json`;
      const existing = extendedFiles.get(file);
      if (
        existing?.source.url === link.fileUrl &&
        existing.source.uploadedAt === link.publishedAt
      ) {
        continue;
      }
      const { entries, warnings } = parseExtendedHours(
        readFirstSheet(await getBytes(link.fileUrl)),
      );
      failures.push(...warnings);
      const list = ExtendedHoursSchema.parse({
        schemaVersion: SCHEMA_VERSION,
        period: link.period,
        title: link.title,
        announcementUrl: link.announcementUrl,
        source: { url: link.fileUrl, uploadedAt: link.publishedAt },
        entries: entries.map((entry) => ({ pharmacyId: '', ...entry })),
      });
      items.push([file, list]);
      log(`  parsed ${file}: ${entries.length} entries`);
    }
    return { items, failures };
  },

  geocoding: { queryLocality, accepts: inLocality },

  rules: {
    groupIds: AREA_GROUPS.map((group) => group.id),
    sectionRange: (groupId, kind) => (groupId === 'metro' ? METRO_RANGES[kind] : OTHER_GROUP_RANGE),
    pharmacies: [200, 3000],
    minExtendedEntries: 100,
  },
};
