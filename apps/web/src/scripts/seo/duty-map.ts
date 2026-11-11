/**
 * The map at the top of a day's lists: every pharmacy on them, as the large duty markers of the
 * home map. Like a pharmacy's page map (pharmacy-map.ts) it is a picture, not a thing to move, and
 * the link over it opens the home map.
 */
import { LngLatBounds, Map as MapLibreMap, Marker } from 'maplibre-gl';
import type { Locale } from '@pharmacy-skg/core';
import { loadMapStyle } from '../../lib/map-style.ts';
import { loadMapStylesheet } from '../../lib/maplibre-setup.ts';
import { pinSvg } from '../../lib/pins.ts';

export interface DutyPin {
  readonly lat: number;
  readonly lon: number;
}

interface Options {
  readonly locale: Locale;
  readonly pins: readonly DutyPin[];
  readonly onReady: () => void;
}

/** The share of pins kept at each edge: one far island must not shrink the rest to a dot. */
const TRIM = 0.1;
const MAX_ZOOM = 14;
const ROOM = 20;
/** Most of the fade (seo.css, .seo-hero): pins may reach into its top, where it is still clear. */
const FADE_SHARE = 0.3;
const READY_AFTER_MS = 4000;

const isDark = () => document.documentElement.dataset['theme'] === 'dark';

/** The pins' bounds without the furthest few on each side. */
function coreBounds(pins: readonly DutyPin[]): LngLatBounds {
  const cut = pins.length >= 20 ? Math.floor(pins.length * TRIM) : 0;
  const lats = pins.map((pin) => pin.lat).sort((a, b) => a - b);
  const lons = pins.map((pin) => pin.lon).sort((a, b) => a - b);
  const at = (values: number[], index: number) => values[index] ?? 0;
  return new LngLatBounds(
    [at(lons, cut), at(lats, cut)],
    [at(lons, lons.length - 1 - cut), at(lats, lats.length - 1 - cut)],
  );
}

export async function showDutyMap(canvas: HTMLElement, options: Options): Promise<void> {
  const { locale, pins, onReady } = options;
  const [style] = await Promise.all([loadMapStyle(locale, isDark()), loadMapStylesheet()]);
  const map = new MapLibreMap({
    container: canvas as HTMLDivElement,
    style: style as never,
    bounds: coreBounds(pins),
    fitBoundsOptions: {
      padding: {
        top: ROOM,
        bottom: canvas.clientHeight * FADE_SHARE,
        left: ROOM,
        right: ROOM,
      },
      maxZoom: MAX_ZOOM,
    },
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
  });
  for (const pin of pins) {
    const element = document.createElement('div');
    element.innerHTML = pinSvg('duty', { size: 18 });
    new Marker({ element, anchor: 'center' }).setLngLat([pin.lon, pin.lat]).addTo(map);
  }

  await new Promise<void>((resolve, reject) => {
    map.once('idle', () => resolve());
    map.once('load', () => setTimeout(resolve, READY_AFTER_MS));
    map.once('error', () => reject(new Error('The map did not load')));
  });
  onReady();

  new MutationObserver(() => {
    void loadMapStyle(locale, isDark())
      .then((next) => map.setStyle(next as never))
      .catch(() => undefined);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}
