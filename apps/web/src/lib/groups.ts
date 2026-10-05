import type { CityData, Pharmacy } from '@pharmacy-skg/core';
import { distanceMetres } from '@pharmacy-skg/core';

/**
 * ΦΣΘ publishes one duty list per area group (metro, Thermi, Lagkadas, ...), and a day's file
 * can hold only some of them. These helpers name the groups for the warnings about missing
 * lists. The names come from the duty files that are loaded; a group seen in none of them
 * falls back to its id.
 */

/** Group id to its name, from every loaded duty day (the newest day wins). */
export function groupNames(data: CityData): Map<string, string> {
  const names = new Map<string, string>();
  for (const date of [...data.duties.keys()].sort()) {
    for (const group of data.duties.get(date)?.groups ?? []) names.set(group.id, group.name);
  }
  return names;
}

/** The names of some groups, in one text ("Δήμος Θέρμης, Δήμος Βόλβης"). */
export function groupList(ids: readonly string[], names: ReadonlyMap<string, string>): string {
  return ids.map((id) => names.get(id) ?? id).join(', ');
}

/** The group most of these pharmacies belong to, or null when none has one. */
export function dominantGroup(pharmacies: readonly Pharmacy[]): string | null {
  const counts = new Map<string, number>();
  for (const { groupId } of pharmacies) {
    if (groupId !== null) counts.set(groupId, (counts.get(groupId) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [id, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && id < best)) {
      best = id;
      bestCount = count;
    }
  }
  return best;
}

/** The group of the located pharmacy nearest to a point: the list that applies around there. */
export function groupNear(
  pharmacies: readonly Pharmacy[],
  point: { readonly lat: number; readonly lon: number },
): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const pharmacy of pharmacies) {
    if (pharmacy.groupId === null || pharmacy.location === null) continue;
    const distance = distanceMetres(point, pharmacy.location);
    if (distance < bestDistance) {
      best = pharmacy.groupId;
      bestDistance = distance;
    }
  }
  return best;
}
