import type { DutyList, DutySection } from '../fsth/parse.ts';
import type { Warning } from '../registry/build.ts';
import { matchKey } from '../text.ts';
import { iteqDuties } from './heading.ts';
import type { IteqPage } from './parse.ts';
import { placeName } from './places.ts';

/** A sector of an ITeQ area: one duty group of ours. */
export interface IteqSector {
  /** Our stable id for the group. */
  readonly id: string;
  /** The sector's name as the cards print it ("ΛΑΡΙΣΑ"). */
  readonly printed: string;
  /** The name shown to people, which is also each pharmacy's locality ("Λάρισα"). */
  readonly name: string;
}

/**
 * How an area's cards become duty groups:
 * - `sectors`: the cards print the sector (Larissa), and each sector is a group of its own;
 * - `area`: the cards print the village or neighbourhood, so the whole area is one group, which
 *   is how the site publishes it, and each card's place is the pharmacy's locality.
 */
export type IteqGrouping =
  | { readonly kind: 'sectors'; readonly sectors: readonly IteqSector[] }
  | { readonly kind: 'area'; readonly id: string; readonly name: string };

type MutableSection = DutySection & { entries: DutySection['entries'][number][] };

/**
 * The duty lists of a day's page: one section per heading and window, in the order the page
 * shows them. A card in a sector we do not know, or with a heading we cannot read, is reported
 * and left out: validation then fails the run if that leaves a group without its list today or
 * tomorrow.
 */
export function iteqDutyLists(
  page: IteqPage,
  date: string,
  grouping: IteqGrouping,
): { lists: DutyList[]; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const groups =
    grouping.kind === 'sectors'
      ? grouping.sectors.map(({ id, name }) => ({ id, name }))
      : [{ id: grouping.id, name: grouping.name }];
  const bySector =
    grouping.kind === 'sectors'
      ? new Map(grouping.sectors.map((sector) => [matchKey(sector.printed), sector]))
      : null;
  const sections = new Map<string, Map<string, MutableSection>>();

  for (const card of page.cards) {
    let groupId: string;
    let locality: string;
    if (bySector) {
      const sector = bySector.get(matchKey(card.locality));
      if (!sector) {
        warnings.push({
          code: 'unknown-sector',
          message: `${date}: "${card.locality}" for ${card.name}`,
        });
        continue;
      }
      groupId = sector.id;
      locality = sector.name;
    } else {
      groupId = groups[0]?.id ?? '';
      locality = placeName(card.locality);
      if (locality === card.locality && /[Α-Ω]/.test(locality)) {
        warnings.push({
          code: 'unnamed-place',
          message: `${groupId}: "${card.locality}" has no written-out name (iteq/places.ts)`,
        });
      }
    }
    const duties = iteqDuties(card.heading, date);
    if (!duties) {
      warnings.push({
        code: 'unknown-heading',
        message: `${date} ${groupId}: "${card.heading}" for ${card.name}`,
      });
      continue;
    }
    const groupSections = sections.get(groupId) ?? new Map<string, MutableSection>();
    sections.set(groupId, groupSections);
    duties.forEach((duty, i) => {
      const key = `${card.heading}|${i}`;
      const section = groupSections.get(key) ?? {
        kind: duty.kind,
        heading: card.heading,
        hours: duty.hours,
        ...(duty.onCall ? { onCall: true } : {}),
        extraHours: [],
        notes: [],
        entries: [],
      };
      groupSections.set(key, section);
      section.entries.push({
        locality,
        name: card.name,
        address: card.address,
        phone: card.phone,
      });
    });
  }

  const lists = groups.flatMap((group): DutyList[] => {
    const groupSections = sections.get(group.id);
    if (!groupSections) return [];
    return [
      { groupId: group.id, groupName: group.name, date, sections: [...groupSections.values()] },
    ];
  });
  return { lists, warnings: dedupe(warnings) };
}

function dedupe(warnings: Warning[]): Warning[] {
  const seen = new Set<string>();
  return warnings.filter(({ code, message }) => {
    const key = `${code}|${message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
