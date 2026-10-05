import type { Pharmacy } from '@pharmacy-skg/core';

export type DirectionsApp = 'google' | 'apple' | 'waze';
export const DIRECTIONS_APPS: readonly DirectionsApp[] = ['google', 'apple', 'waze'];

/** Where to send people: exact coordinates, or the printed address when the pin is not exact. */
export type DirectionsTarget =
  { readonly lat: number; readonly lon: number } | { readonly query: string };

/**
 * Coordinates are used for exact and street-level locations. A locality-level location is only
 * the middle of a village or neighbourhood, so directions to it would mislead: the address text
 * goes to the maps app instead, which geocodes it itself (nothing leaves the device before the
 * person taps a link).
 */
export function directionsTarget(
  pharmacy: Pick<Pharmacy, 'address' | 'locality' | 'location'>,
): DirectionsTarget {
  const { location } = pharmacy;
  if (location !== null && location.precision !== 'locality') {
    return { lat: location.lat, lon: location.lon };
  }
  return { query: [pharmacy.address, pharmacy.locality].filter((s) => s !== '').join(', ') };
}

const coords = (t: { lat: number; lon: number }) => `${t.lat.toFixed(6)},${t.lon.toFixed(6)}`;

/** Walking directions where the app supports a mode; Waze has none. */
export function directionsUrl(app: DirectionsApp, target: DirectionsTarget): string {
  const place = 'query' in target ? target.query : coords(target);
  switch (app) {
    case 'google':
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place)}&travelmode=walking`;
    case 'apple':
      // The legacy form works on every iOS and macOS. The newer /directions form needs iOS 18.4.
      return appleLegacyUrl(target);
    case 'waze':
      return 'query' in target
        ? `https://waze.com/ul?q=${encodeURIComponent(target.query)}&navigate=yes`
        : `https://waze.com/ul?ll=${encodeURIComponent(coords(target))}&navigate=yes`;
  }
}

/** Apple Maps' long-standing directions URL (walking). */
export function appleLegacyUrl(target: DirectionsTarget): string {
  const place = 'query' in target ? target.query : coords(target);
  return `https://maps.apple.com/?daddr=${encodeURIComponent(place)}&dirflg=w`;
}

/** The tel: link for a Greek landline or mobile number as printed. */
export function telUrl(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  return `tel:${digits}`;
}

/**
 * The app the row's one-tap directions button opens: Apple Maps on Apple devices (the maps app
 * that is always there), Google Maps elsewhere. The other apps stay one tap further, in the
 * row's details.
 */
export function defaultDirectionsApp(userAgent: string, maxTouchPoints = 0): DirectionsApp {
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'apple';
  // iPadOS reports itself as a Mac; a Mac with touch is an iPad.
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return 'apple';
  return 'google';
}
