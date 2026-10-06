import type { DutyList, DutySection } from '../fsth/parse.ts';
import type { Warning } from '../registry/build.ts';
import { matchKey } from '../text.ts';
import { iteqHeading, type IteqPage } from './parse.ts';

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
 * One duty list per sector from a day's page: each card heading becomes a section (in the
 * order the page shows them), with the hours it prints. A card in a sector we do not know, or
 * with a heading we cannot read, is reported and left out: validation then fails the run if
 * that leaves a sector without its list today or tomorrow.
 */
export function iteqDutyLists(
  page: IteqPage,
  date: string,
  sectors: readonly IteqSector[],
): { lists: DutyList[]; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const bySector = new Map(sectors.map((sector) => [matchKey(sector.printed), sector]));
  const sections = new Map<
    string,
    Map<string, DutySection & { entries: DutySection['entries'][number][] }>
  >();

  for (const card of page.cards) {
    const sector = bySector.get(matchKey(card.locality));
    if (!sector) {
      warnings.push({
        code: 'unknown-sector',
        message: `${date}: "${card.locality}" for ${card.name}`,
      });
      continue;
    }
    const kind = iteqHeading(card.heading, date);
    if (!kind) {
      warnings.push({
        code: 'unknown-heading',
        message: `${date} ${sector.id}: "${card.heading}" for ${card.name}`,
      });
      continue;
    }
    const groupSections = sections.get(sector.id) ?? new Map();
    sections.set(sector.id, groupSections);
    const section = groupSections.get(card.heading) ?? {
      ...kind,
      heading: card.heading,
      extraHours: [],
      notes: [],
      entries: [],
    };
    groupSections.set(card.heading, section);
    section.entries.push({
      locality: sector.name,
      name: card.name,
      address: card.address,
      phone: card.phone,
    });
  }

  const lists = sectors.flatMap((sector): DutyList[] => {
    const groupSections = sections.get(sector.id);
    if (!groupSections) return [];
    return [
      { groupId: sector.id, groupName: sector.name, date, sections: [...groupSections.values()] },
    ];
  });
  return { lists, warnings };
}
