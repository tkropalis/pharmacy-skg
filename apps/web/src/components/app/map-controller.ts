/**
 * Everything that touches MapLibre. This module is only ever loaded through a dynamic import
 * (see MapView.tsx), so the library, its worker and its stylesheet stay out of the first load.
 */
import {
  AttributionControl,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
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
import { distanceMetres } from '../../lib/engine.ts';
import { faDataUrl } from '../../lib/fa.ts';
import { yieldToMain } from '../../lib/idle.ts';
import { PIN_KINDS } from '../../lib/list.ts';
import type { Origin, Row } from '../../lib/list.ts';
import {
  DIMMED_LAYERS,
  DIMMED_OPACITY,
  PIN_LAYER_IDS,
  SOURCES,
  SOURCE_OPTIONS,
  pinLayers,
} from '../../lib/map-layers.ts';
import { pinCollection, splitPins } from '../../lib/map-data.ts';
import type { PinCollection, PinFeature } from '../../lib/map-data.ts';
import { PIN_SIZE, pinImageName, pinSvg, selectedPinSvg } from '../../lib/pins.ts';

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
  /** The night look (docs/decisions.md, Look): the dark base map and markers. */
  readonly dark: boolean;
  readonly onSelect: (id: string | null) => void;
  /** The person moved the map themselves (a drag or a pinch): they are looking at it. */
  readonly onReach: () => void;
}

/** Where distances are measured from: the device's position (a dot) or a chosen area (a ring). */
export interface OriginMark extends Origin {
  readonly kind: 'geo' | 'area';
  readonly label: string;
}

/** The chosen pharmacy, with the words of its flag. */
export interface Selection {
  readonly id: string;
  /** The short name (lib/names.ts). */
  readonly name: string;
  /** "έως 00:00", or null. */
  readonly when: string | null;
}

export interface MapController {
  setRows(rows: readonly Row[]): void;
  setOrigin(origin: OriginMark | null, fly: boolean, occludedBottom: number): void;
  /** `ripple` marks a choice made on the map itself. */
  setSelected(selection: Selection | null, ripple?: boolean): void;
  /**
   * Brings the pharmacy into the part of the map the sheet leaves free, with the origin too
   * when it is close, and does not move at all when the pharmacy is already in view.
   */
  focusPharmacy(id: string, occludedBottom: number, origin: Origin | null): void;
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
/** Camera moves: short, and slowing down at the end (ease-out-quart). */
const MOVE_MS = 450;
const easeOut = (t: number) => 1 - (1 - t) ** 4;
/** A chosen pharmacy this close to the origin is shown together with it. */
const WITH_ORIGIN_METRES = 3_000;
/**
 * Room the chosen marker and its two-line flag need around the point, in pixels: the flag is
 * centred over the marker and up to 14rem wide, so the sides need half of it.
 */
const MARKER_ROOM = { top: 120, side: 120, bottom: 24 } as const;
/** How long the chosen marker takes to leave (app.css, .sel.leaving). */
const LEAVE_MS = 160;

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

  // The controls' icons are Font Awesome too (MapLibre draws its own as backgrounds).
  const icons: readonly (readonly [string, IconDefinition])[] = [
    ['.maplibregl-ctrl-zoom-in .maplibregl-ctrl-icon', faPlus],
    ['.maplibregl-ctrl-zoom-out .maplibregl-ctrl-icon', faMinus],
    ['.maplibregl-ctrl-attrib-button', faCircleInfo],
  ];
  for (const [selector, icon] of icons) {
    for (const element of container.querySelectorAll<HTMLElement>(selector)) {
      element.style.backgroundImage = faDataUrl(icon, options.dark ? '#e6eee9' : '#1c2622');
    }
  }

  // The compact credit starts open; it is one tap away, and the map keeps its space. MapLibre
  // opens it (the credit is itself a <details>) when the first source data arrives, while the
  // loading note is still showing beside it, so until the style has loaded it is closed again
  // whenever MapLibre opens it, unless the person opened it.
  const credit = container.querySelector<HTMLElement>('.maplibregl-ctrl-attrib');
  let creditOpenedByPerson = false;
  const closeCredit = () => {
    if (creditOpenedByPerson || !credit) return;
    credit.classList.remove('maplibregl-compact-show');
    credit.removeAttribute('open');
  };
  credit?.querySelector('summary')?.addEventListener(
    'click',
    () => {
      creditOpenedByPerson = true;
    },
    { once: true },
  );
  const creditWatch = new MutationObserver(() => {
    if (credit?.classList.contains('maplibregl-compact-show')) closeCredit();
  });
  if (credit) creditWatch.observe(credit, { attributes: true, attributeFilter: ['class', 'open'] });
  closeCredit();
  await yieldToMain();

  const failure = await loaded;
  creditWatch.disconnect();
  if (failure !== null) {
    map.remove();
    throw failure;
  }
  closeCredit();

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
  for (const spec of pinLayers({ dark: options.dark })) map.addLayer(layer(spec));
  // Each dimmed layer's own opacity, to return to when nothing is chosen.
  const fullOpacity = new Map(
    DIMMED_LAYERS.map(([id, property]) => {
      const value: unknown = map.getPaintProperty(id, property as never);
      return [id, typeof value === 'number' ? value : 1] as const;
    }),
  );

  let collection: PinCollection = EMPTY;
  let selection: Selection | null = null;
  let marker: { readonly id: string; readonly key: string; readonly marker: Marker } | null = null;
  const motion = options.reducedMotion
    ? { animate: false }
    : { duration: MOVE_MS, easing: easeOut };

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
    // A tap on the chosen marker (an element over the map) keeps the choice.
    const target = event.originalEvent.target;
    if (target instanceof Element && target.closest('.sel')) return;
    const hit = map.queryRenderedFeatures(event.point, {
      layers: [...PIN_LAYER_IDS, 'clusters'],
    });
    if (hit.length === 0) options.onSelect(null);
  });
  // Moves made by code (fitBounds, easeTo) have no original event.
  map.on('dragstart', (event) => {
    if (event.originalEvent) options.onReach();
  });
  map.on('zoomstart', (event) => {
    if (event.originalEvent && event.originalEvent.type !== 'wheel') options.onReach();
  });
  for (const id of [...PIN_LAYER_IDS, 'clusters']) {
    map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
  }

  const observer = new ResizeObserver(() => map.resize());
  observer.observe(container);

  /** The three pin sources, without the chosen pharmacy (its marker stands in for it). */
  function draw() {
    const shown =
      selection === null
        ? collection
        : {
            ...collection,
            features: collection.features.filter((f) => f.properties.id !== selection?.id),
          };
    const { duty, clustered, closed } = splitPins(shown);
    const set = (id: string, features: unknown[]) =>
      source(id)?.setData({ type: 'FeatureCollection', features } as never);
    set(SOURCES.clustered, clustered);
    set(SOURCES.duty, duty);
    set(SOURCES.closed, closed);
    // What is on the map, for the browser tests (the canvas cannot be read).
    const all = splitPins(collection);
    container.dataset['dutyPins'] = String(all.duty.length);
    container.dataset['clusteredPins'] = String(all.clustered.length);
    container.dataset['closedPins'] = String(all.closed.length);
    container.dataset['selected'] = selection?.id ?? '';
  }

  function dim(on: boolean) {
    for (const [id, property] of DIMMED_LAYERS) {
      const full = fullOpacity.get(id) ?? 1;
      map.setPaintProperty(id, property as never, (on ? full * DIMMED_OPACITY : full) as never);
    }
  }

  function removeMarker() {
    if (marker === null) return;
    const leaving = marker.marker;
    marker = null;
    if (options.reducedMotion) {
      leaving.remove();
      return;
    }
    leaving.getElement().classList.add('leaving');
    setTimeout(() => leaving.remove(), LEAVE_MS);
  }

  function markerElement(feature: PinFeature, chosen: Selection, ripple: boolean): HTMLElement {
    const { kind, approximate } = feature.properties;
    const root = document.createElement('div');
    root.className = 'sel';
    root.dataset['kind'] = kind;
    if (ripple) root.dataset['ripple'] = 'true';
    // The list says the same and the choice is announced (HomeApp): the marker is a picture.
    root.setAttribute('aria-hidden', 'true');
    const flag = document.createElement('div');
    flag.className = 'sel-flag';
    const name = document.createElement('span');
    name.className = 'sel-name';
    name.textContent = chosen.name;
    flag.append(name);
    if (chosen.when !== null) {
      const when = document.createElement('span');
      when.className = 'sel-when';
      when.textContent = chosen.when;
      flag.append(when);
    }
    const pin = document.createElement('div');
    pin.className = 'sel-pin';
    pin.innerHTML = selectedPinSvg(kind, approximate);
    const ground = document.createElement('span');
    ground.className = 'sel-ground';
    const ring = document.createElement('span');
    ring.className = 'sel-ripple';
    root.append(flag, pin, ground, ring);
    root.addEventListener('click', () => options.onSelect(chosen.id));
    return root;
  }

  /** The chosen pharmacy's marker: made again only when what it shows has changed. */
  function placeMarker(ripple: boolean) {
    const chosen = selection;
    const feature =
      chosen === null ? undefined : collection.features.find((f) => f.properties.id === chosen.id);
    if (chosen === null || feature === undefined) {
      removeMarker();
      return;
    }
    const { kind, approximate } = feature.properties;
    const key = [kind, approximate, chosen.name, chosen.when].join('|');
    if (marker !== null && marker.id === chosen.id && marker.key === key) {
      marker.marker.setLngLat(feature.geometry.coordinates);
      return;
    }
    const sameId = marker !== null && marker.id === chosen.id;
    if (sameId && marker !== null) {
      // The same pharmacy with new words (a minute passed): no entrance again.
      marker.marker.remove();
      marker = null;
    } else {
      removeMarker();
    }
    const element = markerElement(feature, chosen, ripple && !sameId);
    if (sameId) element.classList.add('settled');
    marker = {
      id: chosen.id,
      key,
      marker: new Marker({ element, anchor: 'bottom' })
        .setLngLat(feature.geometry.coordinates)
        .addTo(map),
    };
  }

  return {
    setRows(rows) {
      collection = pinCollection(rows);
      draw();
      placeMarker(false);
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
                  properties: {
                    kind: origin.kind,
                    name: origin.kind === 'geo' ? text.you : origin.label,
                  },
                  geometry: { type: 'Point', coordinates: [origin.lon, origin.lat] },
                },
              ],
            } as never),
      );
      if (origin !== null && fly && origin.kind === 'geo' && !options.reducedMotion) {
        // The position lands: its halo opens out once from the dot.
        map.setPaintProperty('origin-halo', 'circle-radius-transition', { duration: 0 });
        map.setPaintProperty('origin-halo', 'circle-opacity-transition', { duration: 0 });
        map.setPaintProperty('origin-halo', 'circle-radius', 6);
        map.setPaintProperty('origin-halo', 'circle-opacity', 0.5);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            map.setPaintProperty('origin-halo', 'circle-radius-transition', { duration: 900 });
            map.setPaintProperty('origin-halo', 'circle-opacity-transition', { duration: 900 });
            map.setPaintProperty('origin-halo', 'circle-radius', 18);
            map.setPaintProperty('origin-halo', 'circle-opacity', 0.16);
          }),
        );
      }
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
    setSelected(next, ripple = false) {
      const changed = (selection?.id ?? null) !== (next?.id ?? null);
      selection = next;
      if (changed) {
        draw();
        dim(next !== null);
      }
      placeMarker(ripple);
    },
    focusPharmacy(id, occludedBottom, origin) {
      const feature = collection.features.find((f) => f.properties.id === id);
      if (!feature) return;
      const [lon, lat] = feature.geometry.coordinates;
      const point = map.project([lon, lat]);
      const { clientWidth: width, clientHeight: height } = container;
      const inView =
        map.getZoom() >= 13.5 &&
        point.x >= MARKER_ROOM.side &&
        point.x <= width - MARKER_ROOM.side &&
        point.y >= MARKER_ROOM.top &&
        point.y <= height - occludedBottom - MARKER_ROOM.bottom;
      if (inView) return;
      const padding = { top: 0, left: 0, right: 0, bottom: occludedBottom };
      const near = origin !== null && distanceMetres(origin, { lat, lon }) <= WITH_ORIGIN_METRES;
      if (near) {
        // The map's own padding is what the sheet covers; it is added to the fit's padding.
        if (Math.abs((map.getPadding().bottom ?? 0) - occludedBottom) > 2) map.setPadding(padding);
        const bounds = new LngLatBounds([origin.lon, origin.lat], [origin.lon, origin.lat]);
        bounds.extend([lon, lat]);
        map.fitBounds(bounds, {
          padding: {
            top: MARKER_ROOM.top,
            left: MARKER_ROOM.side,
            right: MARKER_ROOM.side,
            bottom: 32,
          },
          maxZoom: 16.5,
          ...motion,
        });
        return;
      }
      map.easeTo({
        center: [lon, lat],
        zoom: Math.min(16, Math.max(map.getZoom(), 14)),
        padding,
        // A little below the middle: the flag above the marker needs the room.
        offset: [0, MARKER_ROOM.top / 3],
        ...motion,
      });
    },
    resize: () => map.resize(),
    destroy() {
      observer.disconnect();
      marker?.marker.remove();
      map.remove();
    },
  };
}
