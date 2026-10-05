/**
 * Everything that touches MapLibre. This module is only ever loaded through a dynamic import
 * (see MapView.tsx), so the library, its worker and its stylesheet stay out of the first load.
 */
import {
  AttributionControl,
  LngLatBounds,
  Map as MapLibreMap,
  NavigationControl,
  getVersion,
  setWorkerUrl,
} from 'maplibre-gl';
import type { AddLayerObject, GeoJSONSource } from 'maplibre-gl';
// The stylesheet is added when the map starts. A plain CSS import here would make the build
// link it into the page head, where it would block the first paint of the list.
import maplibreCss from 'maplibre-gl/dist/maplibre-gl.css?url';
import { faCircleInfo, faMinus, faPlus } from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import type { Locale } from '@pharmacy-skg/core';
import type { Dictionary } from '../../i18n/index.ts';
import { faDataUrl } from '../../lib/fa.ts';
import { yieldToMain } from '../../lib/idle.ts';
import { PIN_KINDS } from '../../lib/list.ts';
import type { Origin, Row } from '../../lib/list.ts';
import { PIN_LAYER_IDS, SOURCES, SOURCE_OPTIONS, pinLayers } from '../../lib/map-layers.ts';
import { pinCollection, splitPins } from '../../lib/map-data.ts';
import type { PinCollection } from '../../lib/map-data.ts';
import { PIN_SIZE, pinImageName, pinSvg } from '../../lib/pins.ts';

export interface MapControllerOptions {
  readonly locale: Locale;
  readonly text: Dictionary['app']['map'];
  /** The localized base style, already on its way (see loadMapStyle). */
  readonly style: Promise<Record<string, unknown>>;
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

/** The view after a new position shows this many of the nearest open pharmacies. */
const NEAREST_SHOWN = 4;
const NEAREST_MAX_ZOOM = 16;
const EMPTY: PinCollection = { type: 'FeatureCollection', features: [] };
const STYLE_TIMEOUT_MS = 20_000;

function layer(spec: Record<string, unknown>): AddLayerObject {
  return spec as unknown as AddLayerObject;
}

function loadStylesheet(href: string): Promise<void> {
  if (document.querySelector(`link[href="${href}"]`)) return Promise.resolve();
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    // A failed stylesheet should not stop the map: it would only look unstyled.
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.append(link);
  });
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

export async function createMapController(
  container: HTMLElement,
  options: MapControllerOptions,
): Promise<MapController> {
  const { text } = options;
  const [style] = await Promise.all([options.style, loadStylesheet(maplibreCss)]);
  // The steps below are long on a phone. Each ends the task, so the page can paint and answer
  // a touch in between.
  await yieldToMain();

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

  // Listening starts now, before the pause below, so 'load' cannot be missed. The promise only
  // resolves (with the error, if any): nobody is awaiting it yet when it may fail.
  const loaded = new Promise<unknown>((resolve) => {
    const timer = setTimeout(() => resolve(new Error('Map style did not load')), STYLE_TIMEOUT_MS);
    map.once('load', () => {
      clearTimeout(timer);
      resolve(null);
    });
    map.once('error', (event) => {
      if (!map.loaded() && !map.isStyleLoaded()) {
        clearTimeout(timer);
        resolve(event.error);
      }
    });
  });

  // Controls: zoom buttons, and the attribution OpenFreeMap's licence asks for. On a phone
  // the bottom edge is under the sheet, so the (collapsed) credit sits at the top.
  map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(
    new AttributionControl({ compact: !options.sideBySide }),
    options.sideBySide ? 'bottom-right' : 'top-left',
  );
  await yieldToMain();

  const failure = await loaded;
  if (failure !== null) {
    map.remove();
    throw failure;
  }

  // The controls' icons are Font Awesome too (MapLibre draws its own as backgrounds).
  const icons: readonly (readonly [string, IconDefinition])[] = [
    ['.maplibregl-ctrl-zoom-in .maplibregl-ctrl-icon', faPlus],
    ['.maplibregl-ctrl-zoom-out .maplibregl-ctrl-icon', faMinus],
    ['.maplibregl-ctrl-attrib-button', faCircleInfo],
  ];
  for (const [selector, icon] of icons) {
    for (const element of container.querySelectorAll<HTMLElement>(selector)) {
      element.style.backgroundImage = faDataUrl(icon, '#1c2622');
    }
  }

  // The compact credit starts open; it is one tap away, and the map keeps its space.
  container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
  container.querySelector('.maplibregl-ctrl-attrib details')?.removeAttribute('open');

  const canvas = map.getCanvas();
  canvas.setAttribute('aria-label', text.label);
  canvas.setAttribute('aria-roledescription', 'map');

  await addPinImages(map);
  await yieldToMain();

  // Sources and layers are described in lib/map-layers.ts (and tested there): the duty pins have
  // their own source that is never clustered, and their layer is drawn above everything else.
  for (const [key, id] of Object.entries(SOURCES)) {
    map.addSource(id, {
      type: 'geojson',
      data: EMPTY as never,
      ...SOURCE_OPTIONS[key as keyof typeof SOURCES],
    } as never);
  }
  // The app has one, light, theme (docs/decisions.md, Look).
  for (const spec of pinLayers({ dark: false })) map.addLayer(layer(spec));

  let collection: PinCollection = EMPTY;
  const motion = options.reducedMotion ? { animate: false } : { duration: 500 };

  const source = (id: string) => map.getSource(id) as GeoJSONSource | undefined;

  for (const id of PIN_LAYER_IDS) {
    map.on('click', id, (event) => {
      const pharmacyId = event.features?.[0]?.properties?.['id'];
      if (typeof pharmacyId === 'string') options.onSelect(pharmacyId);
    });
  }
  map.on('click', 'clusters', (event) => {
    const feature = event.features?.[0];
    const clusterId = feature?.properties?.['cluster_id'];
    if (feature?.geometry.type !== 'Point' || typeof clusterId !== 'number') return;
    const [lon, lat] = feature.geometry.coordinates;
    if (lon === undefined || lat === undefined) return;
    void source(SOURCES.clustered)
      ?.getClusterExpansionZoom(clusterId)
      .then((zoom) => map.easeTo({ center: [lon, lat], zoom: zoom + 0.5, ...motion }));
  });
  map.on('click', (event) => {
    const hit = map.queryRenderedFeatures(event.point, {
      layers: [...PIN_LAYER_IDS, 'clusters'],
    });
    if (hit.length === 0) options.onSelect(null);
  });
  for (const id of [...PIN_LAYER_IDS, 'clusters']) {
    map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
  }

  const observer = new ResizeObserver(() => map.resize());
  observer.observe(container);

  return {
    setRows(rows) {
      collection = pinCollection(rows);
      const { duty, clustered, closed } = splitPins(collection);
      const set = (id: string, features: unknown[]) =>
        source(id)?.setData({ type: 'FeatureCollection', features } as never);
      set(SOURCES.clustered, clustered);
      set(SOURCES.duty, duty);
      set(SOURCES.closed, closed);
      // What is on the map, for the browser tests (the canvas cannot be read).
      container.dataset['dutyPins'] = String(duty.length);
      container.dataset['clusteredPins'] = String(clustered.length);
      container.dataset['closedPins'] = String(closed.length);
    },
    setOrigin(origin, fly, occludedBottom) {
      source(SOURCES.origin)?.setData(
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
        // A view that shows the position and the nearest few open pharmacies (the rows are
        // already sorted by distance from it), above the sheet.
        const bounds = new LngLatBounds([origin.lon, origin.lat], [origin.lon, origin.lat]);
        let found = 0;
        for (const feature of collection.features) {
          if (found === NEAREST_SHOWN) break;
          if (feature.properties.kind === 'closed') continue;
          bounds.extend(feature.geometry.coordinates);
          found += 1;
        }
        if (found === 0) {
          map.easeTo({
            center: [origin.lon, origin.lat],
            zoom: Math.max(map.getZoom(), 14),
            padding: { top: 0, left: 0, right: 0, bottom: occludedBottom },
            ...motion,
          });
        } else {
          // The map's own padding is what the sheet covers; it is added to the fit's padding.
          if (Math.abs((map.getPadding().bottom ?? 0) - occludedBottom) > 2) {
            map.setPadding({ top: 0, left: 0, right: 0, bottom: occludedBottom });
          }
          map.fitBounds(bounds, {
            padding: { top: 72, left: 48, right: 48, bottom: 24 },
            maxZoom: NEAREST_MAX_ZOOM,
            ...motion,
          });
        }
      }
    },
    setSelected(id) {
      const feature =
        id === null ? undefined : collection.features.find((f) => f.properties.id === id);
      source(SOURCES.selected)?.setData(
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
