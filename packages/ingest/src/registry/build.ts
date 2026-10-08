import type { ListedLocation } from '../cities/pipeline.ts';
import type { ExtendedHoursEntry } from '../pkm/parse.ts';
import type { DutyDay, ExtendedHours, Location, Pharmacy } from '../schema.ts';
import { matchKey, normalizePhone } from '../text.ts';
import type { Geocoder } from './geocode.ts';
import { nameSimilarity, pharmacyId, sameStreetAddress, shareNameToken } from './names.ts';
import { distanceMetres, type OvertureIndex } from './overture.ts';

/** A manual correction, keyed by pharmacy id in data/<city>/overrides.json. */
export interface Override {
  readonly location?: { readonly lat: number; readonly lon: number };
  readonly note?: string;
}

export interface Warning {
  readonly code: string;
  readonly message: string;
}

// Below this name similarity, a match also needs the same street address.
// Partnerships reuse surnames: "ΛΩΤΙΔΗΣ - ΣΤΑΥΡΑΚΗΣ Ο.Ε." (Βενιζέλου 85) and
// "ΣΤΑΥΡΑΚΗΣ ΣΤΑΥΡΟΣ - ΛΩΤΙΔΗΣ ΙΣΑΑΚ ΟΕ" (Βουλγάρη 38) are different pharmacies.
const NAME_ONLY_MATCH = 0.8;

interface Candidate {
  readonly id: string;
  readonly score: number;
  /** Same street address and a shared name word: the entry is this pharmacy, not just a namesake. */
  readonly strong: boolean;
}

/** Every duty-list pharmacy an extended-hours entry could be, best first. */
function candidates(
  entry: Pick<ExtendedHoursEntry, 'name' | 'address' | 'area'>,
  pharmacies: readonly (Pick<Pharmacy, 'id' | 'name' | 'address'> & { locality?: string })[],
): Candidate[] {
  const found: Candidate[] = [];
  for (const pharmacy of pharmacies) {
    const similarity = nameSimilarity(entry.name, pharmacy.name);
    const strong =
      sameStreetAddress(entry.address, pharmacy.address) &&
      shareNameToken(entry.name, pharmacy.name);
    const score = strong ? 1 + similarity : similarity >= NAME_ONLY_MATCH ? similarity : 0;
    if (score === 0) continue;
    // A tie-breaker only: the same locality is a little more convincing.
    const sameLocality =
      pharmacy.locality !== undefined && matchKey(pharmacy.locality) === matchKey(entry.area);
    found.push({ id: pharmacy.id, score: score + (sameLocality ? 0.01 : 0), strong });
  }
  return found.sort((a, b) => b.score - a.score);
}

/**
 * Finds the duty-list pharmacy an extended-hours entry refers to. ΠΚΜ lists
 * have no phone numbers, so this goes by name and street address.
 */
export function matchExtendedEntry(
  entry: Pick<ExtendedHoursEntry, 'name' | 'address'> & { area?: string },
  pharmacies: readonly (Pick<Pharmacy, 'id' | 'name' | 'address'> & { locality?: string })[],
): string | null {
  return candidates({ area: '', ...entry }, pharmacies)[0]?.id ?? null;
}

/**
 * Gives every entry of one ΠΚΜ list its own pharmacy id. A pharmacist with two shops
 * has two rows with the same name; a name-only match would map both to one pharmacy,
 * and the second row's hours would then replace the first's. So each pharmacy is
 * claimed once, by the best match (street first, then the sheet order):
 * - a later row that also matches the street of a claimed pharmacy is a duplicate
 *   row: it is dropped (`ids[i]` is null);
 * - a later row that only matches by name is a different shop: it takes its next
 *   street match, or else a new id of its own.
 * Every dropped or re-assigned row is reported.
 */
export function matchExtendedEntries(
  entries: readonly Pick<ExtendedHoursEntry, 'name' | 'address' | 'postcode' | 'area'>[],
  pharmacies: readonly (Pick<Pharmacy, 'id' | 'name' | 'address'> & { locality?: string })[],
): { ids: (string | null)[]; warnings: Warning[] } {
  const ranked = entries.map((entry) => candidates(entry, pharmacies));
  const order = entries
    .map((_, index) => index)
    .sort((a, b) => (ranked[b]?.[0]?.score ?? 0) - (ranked[a]?.[0]?.score ?? 0) || a - b);
  const ids: (string | null)[] = entries.map(() => null);
  const claimedBy = new Map<string, number>();
  const warnings: Warning[] = [];
  const describe = (i: number) => {
    const e = entries[i];
    return `"${e?.name}", ${e?.address} ${e?.postcode} ${e?.area}`;
  };

  for (const i of order) {
    const entry = entries[i];
    const options = ranked[i] ?? [];
    if (!entry) continue;
    const best = options[0];
    if (!best) {
      ids[i] = claimNew(entry, i, claimedBy);
      continue;
    }
    const free = options.find((c) => !claimedBy.has(c.id) && (c === best || c.strong));
    if (free) {
      ids[i] = free.id;
      claimedBy.set(free.id, i);
      continue;
    }
    const owner = claimedBy.get(best.id) ?? -1;
    if (best.strong) {
      warnings.push({
        code: 'duplicate-extended',
        message: `row left out, same pharmacy ${best.id} as ${describe(owner)}: ${describe(i)}`,
      });
    } else {
      ids[i] = claimNew(entry, i, claimedBy);
      warnings.push({
        code: 'duplicate-extended',
        message: `${describe(i)} shares a name with ${best.id} (${describe(owner)}) but not its address: kept as a separate pharmacy ${ids[i]}`,
      });
    }
  }
  return { ids, warnings };
}

/** An id for an entry with no pharmacy of its own yet; the address keeps two shops apart. */
function claimNew(
  entry: Pick<ExtendedHoursEntry, 'name' | 'address' | 'area'>,
  index: number,
  claimedBy: Map<string, number>,
): string {
  let id = pharmacyId(null, entry.name, entry.area);
  if (claimedBy.has(id)) id = pharmacyId(null, entry.name, `${entry.area} ${entry.address}`);
  claimedBy.set(id, index);
  return id;
}

/**
 * Picks the id for a duty-list entry. Normally the phone number; when the
 * printed phone is invalid, an existing pharmacy with the same name in the
 * same locality, or a name-based id.
 */
export function dutyEntryId(
  entry: { name: string; locality: string; phone: string },
  known: readonly Pick<Pharmacy, 'id' | 'name' | 'locality'>[],
): string {
  if (normalizePhone(entry.phone)) return pharmacyId(entry.phone, entry.name, entry.locality);
  const locality = matchKey(entry.locality);
  const same = known.find(
    (pharmacy) =>
      matchKey(pharmacy.locality) === locality && nameSimilarity(pharmacy.name, entry.name) >= 0.6,
  );
  return same?.id ?? pharmacyId(null, entry.name, entry.locality);
}

interface Draft {
  id: string;
  name: string;
  address: string;
  locality: string;
  postcode: string | null;
  phone: string | null;
  groupId: string | null;
  sources: Set<string>;
  firstSeen: string;
  lastSeen: string;
}

export interface RegistryInput {
  readonly days: readonly DutyDay[];
  /** Extended-hours entries, each with its period start date (used as "seen" date). */
  readonly extended: readonly {
    readonly from: string;
    readonly entries: ExtendedHours['entries'];
  }[];
  readonly overrides: Readonly<Record<string, Override>>;
  /**
   * Pharmacies the source names beyond the stored duty lists (cities/pipeline.ts, Roster), with
   * their ids; the stored lists' printing wins for a pharmacy in both.
   */
  readonly roster?: readonly {
    readonly pharmacyId: string;
    readonly name: string;
    readonly address: string;
    readonly locality: string;
    readonly phone: string;
    readonly groupId: string;
    readonly date: string;
  }[];
  /** Coordinates the duty lists give, by pharmacy id; they come after the overrides. */
  readonly listed?: ReadonlyMap<string, ListedLocation>;
  readonly overture: OvertureIndex;
  readonly geocoder: Geocoder;
  /** The source ids recorded in each pharmacy's `sources`. */
  readonly sourceIds: { readonly duty: string; readonly extended: string | null };
}

/** Builds the pharmacy registry from every stored official list and locates each pharmacy. */
export async function buildRegistry(
  input: RegistryInput,
): Promise<{ pharmacies: Pharmacy[]; warnings: Warning[] }> {
  const warnings: Warning[] = [];
  const drafts = new Map<string, Draft>();

  // Duty lists, oldest first, so the latest printing of a name or address wins.
  for (const day of [...input.days].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const group of day.groups) {
      for (const section of group.sections) {
        for (const entry of section.entries) {
          const draft = drafts.get(entry.pharmacyId);
          const phone = normalizePhone(entry.phone);
          if (!phone) {
            warnings.push({
              code: 'invalid-phone',
              message: `${day.date} ${group.id}: "${entry.phone}" for ${entry.name}`,
            });
          }
          drafts.set(entry.pharmacyId, {
            id: entry.pharmacyId,
            name: entry.name,
            address: entry.address,
            locality: entry.locality,
            postcode: draft?.postcode ?? null,
            phone: phone ?? draft?.phone ?? null,
            groupId: group.id,
            sources: new Set([...(draft?.sources ?? []), input.sourceIds.duty]),
            firstSeen: draft?.firstSeen ?? day.date,
            lastSeen: day.date,
          });
        }
      }
    }
  }

  for (const entry of input.roster ?? []) {
    if (drafts.has(entry.pharmacyId)) continue;
    drafts.set(entry.pharmacyId, {
      id: entry.pharmacyId,
      name: entry.name,
      address: entry.address,
      locality: entry.locality,
      postcode: null,
      phone: normalizePhone(entry.phone),
      groupId: entry.groupId,
      sources: new Set([input.sourceIds.duty]),
      firstSeen: entry.date,
      lastSeen: entry.date,
    });
  }

  const extendedSource = input.sourceIds.extended ?? input.sourceIds.duty;
  for (const list of input.extended) {
    for (const entry of list.entries) {
      const draft = drafts.get(entry.pharmacyId);
      if (draft) {
        draft.postcode ??= entry.postcode || null;
        draft.sources.add(extendedSource);
        continue;
      }
      drafts.set(entry.pharmacyId, {
        id: entry.pharmacyId,
        name: entry.name,
        address: entry.address,
        locality: entry.area,
        postcode: entry.postcode || null,
        phone: null,
        groupId: null,
        sources: new Set([extendedSource]),
        firstSeen: list.from,
        lastSeen: list.from,
      });
    }
  }

  // Locate the pharmacies people are most likely to look for first (on duty
  // most recently), so a limited geocoding budget goes to them.
  const located = new Map<string, Location | null>();
  for (const draft of [...drafts.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))) {
    located.set(draft.id, await locate(draft, input, warnings));
  }
  const pharmacies: Pharmacy[] = [...drafts.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((draft) => ({
      ...draft,
      sources: [...draft.sources].sort(),
      location: located.get(draft.id) ?? null,
    }));
  return { pharmacies, warnings };
}

// How far from a Nominatim result an Overture pharmacy with a matching name may be.
const SNAP_RADIUS = { exact: 150, street: 600, locality: 2500 } as const;
// An Overture phone match further than this from the street-level geocode is reported.
const PHONE_MATCH_TOLERANCE = 1500;

async function locate(
  draft: Draft,
  input: RegistryInput,
  warnings: Warning[],
): Promise<Location | null> {
  const override = input.overrides[draft.id]?.location;
  if (override) return { ...override, source: 'override', precision: 'exact' };
  const listed = input.listed?.get(draft.id);
  if (listed) return { ...listed, source: 'list', precision: 'exact' };

  // A phone match, or a name and street match, is enough. The geocode is then
  // only a cross-check, so it uses cached results and spares Nominatim.
  const byPhone =
    input.overture.findByPhone(draft.phone) ??
    input.overture.findByNameAndAddress(draft.name, draft.address);
  const hit = await input.geocoder.geocode(draft.address, draft.locality, {
    cachedOnly: byPhone !== undefined,
  });
  if (byPhone) {
    if (
      hit &&
      hit.precision !== 'locality' &&
      distanceMetres(hit, byPhone) > PHONE_MATCH_TOLERANCE
    ) {
      warnings.push({
        code: 'location-disagreement',
        message: `${draft.id} ${draft.name}: Overture is ${Math.round(distanceMetres(hit, byPhone))} m from "${hit.query}"`,
      });
    }
    return {
      lat: byPhone.lat,
      lon: byPhone.lon,
      source: 'overture',
      precision: 'exact',
      ref: byPhone.id,
    };
  }
  if (!hit) return null;

  const byName = input.overture.findByNameNear(draft.name, hit, SNAP_RADIUS[hit.precision]);
  if (byName) {
    return {
      lat: byName.lat,
      lon: byName.lon,
      source: 'overture',
      precision: 'exact',
      ref: byName.id,
    };
  }
  return {
    lat: Math.round(hit.lat * 1e6) / 1e6,
    lon: Math.round(hit.lon * 1e6) / 1e6,
    source: 'nominatim',
    precision: hit.precision,
    ref: hit.query,
  };
}
