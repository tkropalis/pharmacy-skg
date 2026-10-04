import { z } from 'zod';
import { normalizePhone } from '../text.ts';
import { sameStreetAddress, shareNameToken } from './names.ts';

export const OverturePlaceSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  locality: z.string().nullable(),
  confidence: z.number(),
  lat: z.number(),
  lon: z.number(),
});
export type OverturePlace = z.infer<typeof OverturePlaceSchema>;

export function distanceMetres(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Lookups into the committed Overture snapshot (data/<city>/inputs/overture-pharmacies.json). */
export class OvertureIndex {
  private readonly byPhone = new Map<string, OverturePlace[]>();
  private readonly places: readonly OverturePlace[];

  constructor(places: readonly OverturePlace[]) {
    this.places = places;
    for (const place of places) {
      const phone = normalizePhone(place.phone);
      if (phone) this.byPhone.set(phone, [...(this.byPhone.get(phone) ?? []), place]);
    }
  }

  /** The most confident place with this phone number. */
  findByPhone(phone: string | null): OverturePlace | undefined {
    const valid = normalizePhone(phone);
    if (!valid) return undefined;
    return [...(this.byPhone.get(valid) ?? [])].sort((a, b) => b.confidence - a.confidence)[0];
  }

  /** The most confident place that shares a name word and the street address. */
  findByNameAndAddress(name: string, address: string): OverturePlace | undefined {
    return this.places
      .filter(
        (place) =>
          place.name &&
          place.address &&
          shareNameToken(name, place.name) &&
          sameStreetAddress(address, place.address),
      )
      .sort((a, b) => b.confidence - a.confidence)[0];
  }

  /** The nearest place within `radius` metres whose name shares a word with `name`. */
  findByNameNear(
    name: string,
    near: { lat: number; lon: number },
    radius: number,
  ): OverturePlace | undefined {
    let best: { place: OverturePlace; distance: number } | undefined;
    for (const place of this.places) {
      if (!place.name || !shareNameToken(name, place.name)) continue;
      const distance = distanceMetres(near, place);
      if (distance <= radius && (!best || distance < best.distance)) best = { place, distance };
    }
    return best?.place;
  }
}
