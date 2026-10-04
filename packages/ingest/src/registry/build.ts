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

/**
 * Finds the duty-list pharmacy an extended-hours entry refers to. ΠΚΜ lists
 * have no phone numbers, so this goes by name and street address.
 */
export function matchExtendedEntry(
  entry: Pick<ExtendedHoursEntry, 'name' | 'address'>,
  pharmacies: readonly Pick<Pharmacy, 'id' | 'name' | 'address'>[],
): string | null {
  let best: { id: string; score: number } | undefined;
  for (const pharmacy of pharmacies) {
    const similarity = nameSimilarity(entry.name, pharmacy.name);
    const sameStreet = sameStreetAddress(entry.address, pharmacy.address);
    const score =
      sameStreet && shareNameToken(entry.name, pharmacy.name)
        ? 1 + similarity
        : similarity >= NAME_ONLY_MATCH
          ? similarity
          : 0;
    if (score > 0 && (!best || score > best.score)) best = { id: pharmacy.id, score };
  }
  return best?.id ?? null;
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
  sources: Set<'fsth' | 'pkm'>;
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
  readonly overture: OvertureIndex;
  readonly geocoder: Geocoder;
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
            sources: new Set([...(draft?.sources ?? []), 'fsth']),
            firstSeen: draft?.firstSeen ?? day.date,
            lastSeen: day.date,
          });
        }
      }
    }
  }

  for (const list of input.extended) {
    for (const entry of list.entries) {
      const draft = drafts.get(entry.pharmacyId);
      if (draft) {
        draft.postcode ??= entry.postcode || null;
        draft.sources.add('pkm');
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
        sources: new Set(['pkm']),
        firstSeen: list.from,
        lastSeen: list.from,
      });
    }
  }

  const pharmacies: Pharmacy[] = [];
  for (const draft of [...drafts.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    pharmacies.push({
      ...draft,
      sources: [...draft.sources].sort(),
      location: await locate(draft, input, warnings),
    });
  }
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

  const byPhone = input.overture.findByPhone(draft.phone);
  // A phone match is enough; the geocode is only a cross-check then, so it
  // uses cached results and spares Nominatim.
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
        message: `${draft.id} ${draft.name}: Overture (by phone) is ${Math.round(distanceMetres(hit, byPhone))} m from "${hit.query}"`,
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
