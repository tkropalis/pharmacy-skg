/**
 * The small map on a pharmacy's page. Loaded on its own, only when the map nears the screen.
 * It is a picture of the place and of what is open around it, not a thing to move: a phone must
 * be able to scroll past it, and the link over it opens the big map on the home screen.
 */
import { LngLatBounds, Map as MapLibreMap, Marker } from 'maplibre-gl';
import type { Locale } from '@pharmacy-skg/core';
import type { PinKind } from '../../lib/list.ts';
import { loadMapStyle } from '../../lib/map-style.ts';
import { loadMapStylesheet } from '../../lib/maplibre-setup.ts';
import { pinSvg, selectedPinSvg } from '../../lib/pins.ts';

export interface MapPin {
  readonly lat: number;
  readonly lon: number;
  readonly kind: PinKind;
  readonly approximate: boolean;
}

interface Options extends MapPin {
  readonly locale: Locale;
  readonly pins: readonly MapPin[];
  readonly onReady: () => void;
}

const ZOOM = 15;
/** A neighbour further than this would only shrink the pharmacy's own place to a dot. */
const NEIGHBOUR_DEGREES = 0.03;
/** Room for the drop above its point. */
const TOP_ROOM = 64;
const SIDE_ROOM = 48;
/** The part of the height the fade takes (seo.css, .seo-hero): nothing is placed there. */
const FADE_SHARE = 0.42;
/** A slow tile must not leave the picture blank: it fades in anyway. */
const READY_AFTER_MS = 4000;

const isDark = () => document.documentElement.dataset['theme'] === 'dark';

function marker(svg: string, anchor: 'bottom' | 'center', pin: MapPin, map: MapLibreMap): void {
  const element = document.createElement('div');
  element.innerHTML = svg;
  new Marker({ element, anchor }).setLngLat([pin.lon, pin.lat]).addTo(map);
}

export async function showPharmacyMap(canvas: HTMLElement, options: Options): Promise<void> {
  const { locale, pins, onReady } = options;
  const [style] = await Promise.all([loadMapStyle(locale, isDark()), loadMapStylesheet()]);
  const around = pins.filter(
    (pin) =>
      Math.abs(pin.lat - options.lat) < NEIGHBOUR_DEGREES &&
      Math.abs(pin.lon - options.lon) < NEIGHBOUR_DEGREES,
  );
  const bounds = new LngLatBounds();
  for (const pin of [options, ...around]) bounds.extend([pin.lon, pin.lat]);

  const map = new MapLibreMap({
    container: canvas as HTMLDivElement,
    style: style as never,
    center: [options.lon, options.lat],
    zoom: ZOOM,
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
  });
  const fade = canvas.clientHeight * FADE_SHARE;
  if (around.length > 0) {
    const padding = { top: TOP_ROOM, bottom: fade, left: SIDE_ROOM, right: SIDE_ROOM };
    map.fitBounds(bounds, { padding, maxZoom: ZOOM, animate: false });
  } else {
    map.setPadding({ top: 0, bottom: fade, left: 0, right: 0 });
  }

  for (const pin of around) {
    marker(pinSvg(pin.kind, { approximate: pin.approximate, size: 28 }), 'center', pin, map);
  }
  marker(selectedPinSvg(options.kind, options.approximate), 'bottom', options, map);

  await new Promise<void>((resolve, reject) => {
    map.once('idle', () => resolve());
    map.once('load', () => setTimeout(resolve, READY_AFTER_MS));
    map.once('error', () => reject(new Error('The map did not load')));
  });
  onReady();

  // The look can change while the page is open (the footer's control, or the sun going down).
  new MutationObserver(() => {
    void loadMapStyle(locale, isDark())
      .then((next) => map.setStyle(next as never))
      .catch(() => undefined);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}
