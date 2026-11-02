import type { CityData, Pharmacy } from '@pharmacy-skg/core';
import { distanceMetres } from '@pharmacy-skg/core';
import type { Locale } from '@pharmacy-skg/core';
import { romanize } from './seo/translit.ts';

/**
 * Each association publishes one duty list per group (in Thessaloniki: metro, Thermi, Lagkadas,
 * ...), and a day's file can hold only some of them. These helpers name the groups for the warnings about missing
 * lists. The names come from the duty files that are loaded; a group seen in none of them
 * falls back to its id.
 */

/**
 * Plain names for groups whose printed name is an administrative term (docs/decisions.md,
 * Defaults: plain words), by city id and group id: the Thessaloniki metro list is printed for
 * the "Πολεοδομικό Συγκρότημα Θεσσαλονίκης". Other groups keep their printed names ("Δήμος
 * Θέρμης").
 */
const DISPLAY_NAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  thessaloniki: { metro: 'Θεσσαλονίκη' },
};

/** The name a group is shown by: its plain name, or the name its list prints. */
export function groupDisplayName(cityId: string, id: string, printed: string): string {
  return DISPLAY_NAMES[cityId]?.[id] ?? printed;
}

/**
 * The groups of the cities that have several, as their lists print them. The loaded duty days
 * name only the groups that have a list on those days, and the warning "not announced yet for
 * ..." is about the ones that do not, so without these it would show their ids. A test keeps
 * this in step with data/.
 */
export const KNOWN_GROUPS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  thessaloniki: {
    metro: 'Πολεοδομικό Συγκρότημα Θεσσαλονίκης',
    asvestochori: 'Ασβεστοχώρι/Εξοχή-Χορτιάτης-Φίλυρο',
    chalkidona: 'Δήμος Χαλκηδόνας',
    delta: 'Δήμος Δέλτα',
    lagkadas: 'Δήμος Λαγκαδά',
    oraiokastro: 'Δήμος Ωραιοκάστρου',
    'panorama-pefka': 'Πανόραμα-Πεύκα',
    thermaikos: 'Δήμος Θερμαϊκού',
    thermi: 'Δήμος Θέρμης',
    volvi: 'Δήμος Βόλβης',
  },
  cyclades: {
    andros: 'Άνδρος',
    mykonos: 'Μύκονος',
    naxos: 'Νάξος',
    paros: 'Πάρος',
    santorini: 'Σαντορίνη',
    sifnos: 'Σίφνος',
    syros: 'Σύρος',
    tinos: 'Τήνος',
  },
  kilkis: {
    axioupoli: 'Αξιούπολη',
    goumenissa: 'Γουμένισσα',
    kilkis: 'Κιλκίς',
    polykastro: 'Πολύκαστρο',
  },
  larisa: {
    agia: 'Αγιά',
    ampelonas: 'Αμπελώνας',
    elassona: 'Ελασσόνα',
    falani: 'Φαλάνη',
    farsala: 'Φάρσαλα',
    giannouli: 'Γιάννουλη',
    larisa: 'Λάρισα',
    nikaia: 'Νίκαια',
    tyrnavos: 'Τύρναβος',
  },
  ilia: {
    amaliada: 'Αμαλιάδα',
    andravida: 'Ανδραβίδα',
    'ancient-olympia': 'Αρχαία Ολυμπία',
    varda: 'Βάρδα',
    vartholomio: 'Βαρθολομιό',
    gastouni: 'Γαστούνη',
    zacharo: 'Ζαχάρω',
    krestena: 'Κρέστενα',
    lechaina: 'Λεχαινά',
    pyrgos: 'Πύργος',
    tragano: 'Τραγανό',
  },
};

/** Group id to its name, from every loaded duty day (the newest day wins). */
export function groupNames(data: CityData): Map<string, string> {
  const names = new Map<string, string>(
    Object.entries(KNOWN_GROUPS[data.city.id] ?? {}).map(([id, printed]) => [
      id,
      groupDisplayName(data.city.id, id, printed),
    ]),
  );
  for (const date of [...data.duties.keys()].sort()) {
    for (const group of data.duties.get(date)?.groups ?? []) {
      names.set(group.id, groupDisplayName(data.city.id, group.id, group.name));
    }
  }
  return names;
}

/**
 * The names of some groups, in one text in the language's own way: "Δήμος Θέρμης και Δήμος
 * Βόλβης", "Dimos Thermis and Dimos Volvis" (the English names are the Greek ones in Latin
 * letters, as on the area pages).
 */
export function groupList(
  ids: readonly string[],
  names: ReadonlyMap<string, string>,
  locale: Locale,
): string {
  const shown = ids.map((id) => {
    const name = names.get(id) ?? id;
    return locale === 'en' ? romanize(name) : name;
  });
  return new Intl.ListFormat(locale === 'en' ? 'en-GB' : 'el-GR', {
    style: 'long',
    type: 'conjunction',
  }).format(shown);
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
