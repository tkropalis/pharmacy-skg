import type { Pharmacy } from '@pharmacy-skg/core';

/** "2310023026" becomes "+302310023026". Returns null for an unusable number. */
export function phoneToE164(phone: string | null): string | null {
  if (phone === null) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+30${digits}`;
  if (digits.length === 12 && digits.startsWith('30')) return `+${digits}`;
  return null;
}

export function telHref(phone: string | null): string | null {
  const e164 = phoneToE164(phone);
  if (e164 !== null) return `tel:${e164}`;
  const digits = phone?.replace(/[^\d+]/g, '') ?? '';
  return digits === '' ? null : `tel:${digits}`;
}

/**
 * Schema.org `Pharmacy`. Coordinates only when the geocoder was sure of the street. No
 * `openingHoursSpecification`: the regular hours are replaced by duty and extended-hours
 * entries and by holidays, so a fixed specification could be wrong on any given day.
 */
export function pharmacyJsonLd(pharmacy: Pharmacy, url: string): Record<string, unknown> {
  const telephone = phoneToE164(pharmacy.phone);
  const precise =
    pharmacy.location !== null &&
    (pharmacy.location.precision === 'exact' || pharmacy.location.precision === 'street');
  return {
    '@context': 'https://schema.org',
    '@type': 'Pharmacy',
    name: pharmacy.name,
    url,
    address: {
      '@type': 'PostalAddress',
      streetAddress: pharmacy.address,
      addressLocality: pharmacy.locality,
      ...(pharmacy.postcode === null ? {} : { postalCode: pharmacy.postcode }),
      addressCountry: 'GR',
    },
    ...(telephone === null ? {} : { telephone }),
    ...(precise && pharmacy.location !== null
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: pharmacy.location.lat,
            longitude: pharmacy.location.lon,
          },
        }
      : {}),
  };
}

/** JSON safe to put inside a <script type="application/ld+json"> element. */
export function jsonLdScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
