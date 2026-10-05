/**
 * Everything that touches MapLibre. This module is only ever loaded through a dynamic import
 * (see MapView.tsx), so the library, its worker and its stylesheet stay out of the first load.
 */
import {
  AttributionControl,
  Map as MapLibreMap,
  NavigationControl,
  getVersion,
  setWorkerUrl,
} from 'maplibre-gl';
import type { AddLayerObject, GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Locale } from '@pharmacy-skg/core';
import type { Dictionary } from '../../i18n/index.ts';
import { PIN_KINDS } from '../../lib/list.ts';
import type { Origin, Row } from '../../lib/list.ts';
import { pinCollection } from '../../lib/map-data.ts';
import type { PinCollection } from '../../lib/map-data.ts';
import { STYLE_DARK, STYLE_LIGHT, localizeStyle } from '../../lib/map-style.ts';
import { PIN_SIZE, pinImageName, pinSvg } from '../../lib/pins.ts';

export interface MapControllerOptions {
  readonly locale: Locale;
  readonly text: Dictionary['app']['map'];
  readonly dark: boolean;
  readonly center: readonly [number, number];
  readonly zoom: number;
  /** Pixels at the bottom covered by the sheet, so the first view is centred above it. */
  readonly occludedBottom: number;
  readonly reducedMotion: boolean;
  /** Wide layouts have the list beside the map, narrow ones under it. */
  readonly sideBySide: boolean;
  readonly onSelect: (id: string | null) => void;
}

export interface MapController {
  setRows(rows: readonly Row[]): void;
  setOrigin(origin: Origin | null, fly: boolean, occludedBottom: number): void;
  setSelected(id: string | null): void;
  focusPharmacy(id: string, occludedBottom: number): void;
  resize(): void;
  destroy(): void;
}

// The worker module is published beside the app by integrations/maplibre-worker.ts.
setWorkerUrl(`/_astro/maplibre-${getVersion()}/maplibre-gl-worker.mjs`);

const SOURCE = 'pharmacies';
const CLOSED_SOURCE = 'closed';
const SELECTED_SOURCE = 'selected';
const ORIGIN_SOURCE = 'origin';
const EMPTY: PinCollection = { type: 'FeatureCollection', features: [] };
const FONT = ['Noto Sans Bold'];
const STYLE_TIMEOUT_MS = 20_000;

function layer(spec: Record<string, unknown>): AddLayerObject {
  return spec as unknown as AddLayerObject;
}

async function loadImage(svg: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  return image;
}

async function addPinImages(map: MapLibreMap): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const kind of PIN_KINDS) {
    for (const approximate of [false, true]) {
      jobs.push(
        // Rendered at twice the size so it stays sharp on dense screens.
        loadImage(pinSvg(kind, { approximate, size: PIN_SIZE * 2 })).then((image) => {
          map.addImage(pinImageName(kind, approximate), image, { pixelRatio: 2 });
        }),
      );
    }
  }
  await Promise.all(jobs);
}

async function fetchStyle(url: string, locale: Locale): Promise<Record<string, unknown>> {
  const response = await fetch(url, { signal: AbortSignal.timeout(STYLE_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Style request failed: HTTP ${response.status}`);
  return localizeStyle((await response.json()) as { layers?: never[] }, locale);
}

export async function createMapController(
  container: HTMLElement,
  options: MapControllerOptions,
): Promise<MapController> {
  const { locale, text, dark } = options;
  const style = await fetchStyle(dark ? STYLE_DARK : STYLE_LIGHT, locale);

  const map = new MapLibreMap({
    container,
    style: style as never,
    center: [options.center[0], options.center[1]],
    zoom: options.zoom,
    minZoom: 8,
    maxZoom: 19,
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    locale: {
      'NavigationControl.ZoomIn': text.zoomIn,
      'NavigationControl.ZoomOut': text.zoomOut,
      'Map.Title': text.label,
    },
  });
  map.touchZoomRotate.disableRotation();
  map.setPadding({ top: 0, left: 0, right: 0, bottom: options.occludedBottom });

  // Controls: zoom buttons, and the attribution OpenFreeMap's licence asks for. On a phone
  // the bottom edge is under the sheet, so the (collapsed) credit sits at the top.
  map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(
    new AttributionControl({ compact: !options.sideBySide }),
    options.sideBySide ? 'bottom-right' : 'top-left',
  );

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Map style did not load')), STYLE_TIMEOUT_MS);
    map.once('load', () => {
      clearTimeout(timer);
      resolve();
    });
    map.once('error', (event) => {
      if (!map.loaded() && !map.isStyleLoaded()) {
        clearTimeout(timer);
        reject(event.error);
      }
    });
  }).catch((error: unknown) => {
    map.remove();
    throw error;
  });

  // The compact credit starts open; it is one tap away, and the map keeps its space.
  container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
  container.querySelector('.maplibregl-ctrl-attrib details')?.removeAttribute('open');

  const canvas = map.getCanvas();
  canvas.setAttribute('aria-label', text.label);
  canvas.setAttribute('aria-roledescription', 'map');

  await addPinImages(map);

  map.addSource(SOURCE, {
    type: 'geojson',
    data: EMPTY as never,
    cluster: true,
    clusterRadius: 38,
    clusterMaxZoom: 12,
  });
  // Closed pharmacies (shown on request) are kept apart from the open ones, so a cluster never
  // hides an open pharmacy, and they only appear once the map is zoomed in.
  map.addSource(CLOSED_SOURCE, { type: 'geojson', data: EMPTY as never });
  map.addSource(SELECTED_SOURCE, { type: 'geojson', data: EMPTY as never });
  map.addSource(ORIGIN_SOURCE, { type: 'geojson', data: EMPTY as never });

  const halo = dark ? '#ffffff' : '#10231a';
  map.addLayer(
    layer({
      id: 'origin-halo',
      type: 'circle',
      source: ORIGIN_SOURCE,
      paint: { 'circle-radius': 20, 'circle-color': '#1d4ed8', 'circle-opacity': 0.18 },
    }),
  );
  map.addLayer(
    layer({
      id: 'origin-dot',
      type: 'circle',
      source: ORIGIN_SOURCE,
      paint: {
        'circle-radius': 8,
        'circle-color': '#1d4ed8',
        'circle-stroke-width': 3,
        'circle-stroke-color': '#ffffff',
      },
    }),
  );
  map.addLayer(
    layer({
      id: 'closed-pins',
      type: 'symbol',
      source: CLOSED_SOURCE,
      minzoom: 13,
      layout: {
        'icon-image': ['get', 'image'],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    }),
  );
  map.addLayer(
    layer({
      id: 'clusters',
      type: 'circle',
      source: SOURCE,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#26323c',
        'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 25],
        'circle-stroke-width': 3,
        'circle-stroke-color': '#ffffff',
      },
    }),
  );
  map.addLayer(
    layer({
      id: 'cluster-count',
      type: 'symbol',
      source: SOURCE,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': FONT,
        'text-size': 13,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#ffffff' },
    }),
  );
  map.addLayer(
    layer({
      id: 'pins',
      type: 'symbol',
      source: SOURCE,
      filter: ['!', ['has', 'point_count']],
      layout: {
        'icon-image': ['get', 'image'],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'symbol-sort-key': ['get', 'sort'],
      },
    }),
  );
  map.addLayer(
    layer({
      id: 'pin-names',
      type: 'symbol',
      source: SOURCE,
      minzoom: 15.5,
      filter: ['!', ['has', 'point_count']],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
        'text-offset': [0, 1.3],
        'text-anchor': 'top',
        'text-max-width': 9,
        'text-optional': true,
      },
      paint: {
        'text-color': dark ? '#ffffff' : '#10231a',
        'text-halo-color': dark ? '#10231a' : '#ffffff',
        'text-halo-width': 1.5,
      },
    }),
  );
  map.addLayer(
    layer({
      id: 'selected-ring',
      type: 'circle',
      source: SELECTED_SOURCE,
      paint: {
        'circle-radius': 24,
        'circle-color': '#ffffff',
        'circle-opacity': 0.55,
        'circle-stroke-width': 3,
        'circle-stroke-color': halo,
      },
    }),
  );
  map.addLayer(
    layer({
      id: 'selected-pin',
      type: 'symbol',
      source: SELECTED_SOURCE,
      layout: {
        'icon-image': ['get', 'image'],
        'icon-size': 1.3,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    }),
  );

  let collection: PinCollection = EMPTY;
  const motion = options.reducedMotion ? { animate: false } : { duration: 500 };

  const pinSource = () => map.getSource(SOURCE) as GeoJSONSource | undefined;

  map.on('click', 'pins', (event) => {
    const id = event.features?.[0]?.properties?.['id'];
    if (typeof id === 'string') options.onSelect(id);
  });
  map.on('click', 'closed-pins', (event) => {
    const id = event.features?.[0]?.properties?.['id'];
    if (typeof id === 'string') options.onSelect(id);
  });
  map.on('click', 'selected-pin', (event) => {
    const id = event.features?.[0]?.properties?.['id'];
    if (typeof id === 'string') options.onSelect(id);
  });
  map.on('click', 'clusters', (event) => {
    const feature = event.features?.[0];
    const clusterId = feature?.properties?.['cluster_id'];
    if (feature?.geometry.type !== 'Point' || typeof clusterId !== 'number') return;
    const [lon, lat] = feature.geometry.coordinates;
    if (lon === undefined || lat === undefined) return;
    void pinSource()
      ?.getClusterExpansionZoom(clusterId)
      .then((zoom) => map.easeTo({ center: [lon, lat], zoom: zoom + 0.5, ...motion }));
  });
  map.on('click', (event) => {
    const hit = map.queryRenderedFeatures(event.point, {
      layers: ['pins', 'closed-pins', 'clusters', 'selected-pin'],
    });
    if (hit.length === 0) options.onSelect(null);
  });
  for (const id of ['pins', 'closed-pins', 'clusters', 'selected-pin']) {
    map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
  }

  const observer = new ResizeObserver(() => map.resize());
  observer.observe(container);

  return {
    setRows(rows) {
      collection = pinCollection(rows);
      const closed = collection.features.filter((f) => f.properties.kind === 'closed');
      const open = collection.features.filter((f) => f.properties.kind !== 'closed');
      pinSource()?.setData({ type: 'FeatureCollection', features: open } as never);
      (map.getSource(CLOSED_SOURCE) as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: closed,
      } as never);
    },
    setOrigin(origin, fly, occludedBottom) {
      const source = map.getSource(ORIGIN_SOURCE) as GeoJSONSource | undefined;
      source?.setData(
        origin === null
          ? (EMPTY as never)
          : ({
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  properties: { name: text.you },
                  geometry: { type: 'Point', coordinates: [origin.lon, origin.lat] },
                },
              ],
            } as never),
      );
      if (origin !== null && fly) {
        map.easeTo({
          center: [origin.lon, origin.lat],
          zoom: Math.max(map.getZoom(), 14),
          padding: { top: 0, left: 0, right: 0, bottom: occludedBottom },
          ...motion,
        });
      }
    },
    setSelected(id) {
      const source = map.getSource(SELECTED_SOURCE) as GeoJSONSource | undefined;
      const feature =
        id === null ? undefined : collection.features.find((f) => f.properties.id === id);
      source?.setData(
        feature ? ({ type: 'FeatureCollection', features: [feature] } as never) : (EMPTY as never),
      );
    },
    focusPharmacy(id, occludedBottom) {
      const feature = collection.features.find((f) => f.properties.id === id);
      if (!feature) return;
      map.easeTo({
        center: feature.geometry.coordinates,
        zoom: Math.max(map.getZoom(), 15),
        padding: { top: 0, left: 0, right: 0, bottom: occludedBottom },
        ...motion,
      });
    },
    resize: () => map.resize(),
    destroy() {
      observer.disconnect();
      map.remove();
    },
  };
}
