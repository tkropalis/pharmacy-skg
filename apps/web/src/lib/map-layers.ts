/**
 * The map's sources and layers, as plain style objects (MapLibre's types are only needed where
 * they are added, components/app/map-controller.ts). Kept apart from the map so the rules that
 * matter can be tested without WebGL:
 *
 *  - Pharmacies on duty (and those whose list prints no hours) are what people look for at
 *    night. They sit in their own source, which is never clustered, and their layer is drawn
 *    above everything but the selection.
 *  - Only regular and extended-hours pharmacies are clustered, and the clusters are small and
 *    quiet (muted fill, small count), so they do not dominate the map.
 */

export const SOURCES = {
  /** Regular and extended hours: clustered. */
  clustered: 'pharmacies',
  /** On duty, or on duty with no hours printed: never clustered. */
  duty: 'duty',
  /** Closed ones, shown on request. */
  closed: 'closed',
  selected: 'selected',
  origin: 'origin',
} as const;

export const CLUSTER_RADIUS = 40;
/** From this zoom on every pharmacy is drawn on its own. */
export const CLUSTER_MAX_ZOOM = 13;

/** Source options (the data is set later). */
export const SOURCE_OPTIONS: Readonly<Record<keyof typeof SOURCES, Record<string, unknown>>> = {
  clustered: { cluster: true, clusterRadius: CLUSTER_RADIUS, clusterMaxZoom: CLUSTER_MAX_ZOOM },
  duty: {},
  closed: {},
  selected: {},
  origin: {},
};

export interface ClusterColors {
  readonly fill: string;
  readonly stroke: string;
  readonly text: string;
}

/**
 * Muted on both maps: a pale disc with a dark number on the light map, a dark disc with a light
 * number on the dark one. The text is at least 7:1 against the fill, and the outline is a mid
 * tone, so a cluster reads as a quiet count and not as the content.
 */
export function clusterColors(dark: boolean): ClusterColors {
  return dark
    ? { fill: '#22322b', stroke: '#7f9a8d', text: '#dbe8e1' }
    : { fill: '#e6eeea', stroke: '#62786d', text: '#1f2f27' };
}

export type LayerSpec = Record<string, unknown> & { readonly id: string };

const BOLD = ['Noto Sans Bold'];
const REGULAR = ['Noto Sans Regular'];

/** The layers from bottom to top. */
export function pinLayers(options: { readonly dark: boolean }): readonly LayerSpec[] {
  const { dark } = options;
  const colors = clusterColors(dark);
  const ink = dark ? '#ffffff' : '#10231a';
  const paper = dark ? '#10231a' : '#ffffff';
  const names = {
    layout: {
      'text-field': ['get', 'name'],
      'text-font': REGULAR,
      'text-size': 11,
      'text-offset': [0, 1.3],
      'text-anchor': 'top',
      'text-max-width': 9,
      'text-optional': true,
    },
    paint: {
      'text-color': ink,
      'text-halo-color': paper,
      'text-halo-width': 1.5,
    },
  };
  return [
    {
      id: 'closed-pins',
      type: 'symbol',
      source: SOURCES.closed,
      minzoom: 13,
      layout: {
        'icon-image': ['get', 'image'],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    },
    {
      id: 'clusters',
      type: 'circle',
      source: SOURCES.clustered,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': colors.fill,
        'circle-opacity': 0.94,
        'circle-radius': ['step', ['get', 'point_count'], 11, 10, 14, 50, 18],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': colors.stroke,
      },
    },
    {
      id: 'cluster-count',
      type: 'symbol',
      source: SOURCES.clustered,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': BOLD,
        'text-size': 11,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': colors.text },
    },
    {
      id: 'pins',
      type: 'symbol',
      source: SOURCES.clustered,
      filter: ['!', ['has', 'point_count']],
      layout: {
        'icon-image': ['get', 'image'],
        // Smaller than the duty pins, which are what people look for; both grow with the zoom
        // so that the pins of a dense centre do not pile up when the whole city is in view.
        'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 15, 0.9],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'symbol-sort-key': ['get', 'sort'],
      },
    },
    {
      id: 'pin-names',
      type: 'symbol',
      source: SOURCES.clustered,
      minzoom: 15.5,
      filter: ['!', ['has', 'point_count']],
      ...names,
    },
    {
      id: 'origin-halo',
      type: 'circle',
      source: SOURCES.origin,
      paint: { 'circle-radius': 20, 'circle-color': '#1d4ed8', 'circle-opacity': 0.18 },
    },
    {
      id: 'origin-dot',
      type: 'circle',
      source: SOURCES.origin,
      paint: {
        'circle-radius': 8,
        'circle-color': '#1d4ed8',
        'circle-stroke-width': 3,
        'circle-stroke-color': '#ffffff',
      },
    },
    {
      // Above the clusters, the other pins and the position dot; only the selection is higher.
      id: 'duty-pins',
      type: 'symbol',
      source: SOURCES.duty,
      layout: {
        'icon-image': ['get', 'image'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 15, 1.15],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'symbol-sort-key': ['get', 'sort'],
      },
    },
    {
      id: 'duty-names',
      type: 'symbol',
      source: SOURCES.duty,
      minzoom: 15,
      ...names,
      layout: { ...names.layout, 'text-offset': [0, 1.5] },
    },
    {
      id: 'selected-ring',
      type: 'circle',
      source: SOURCES.selected,
      paint: {
        'circle-radius': 24,
        'circle-color': '#ffffff',
        'circle-opacity': 0.55,
        'circle-stroke-width': 3,
        'circle-stroke-color': ink,
      },
    },
    {
      id: 'selected-pin',
      type: 'symbol',
      source: SOURCES.selected,
      layout: {
        'icon-image': ['get', 'image'],
        'icon-size': 1.3,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    },
  ];
}

/** Layers a click or tap on a pharmacy can hit (the pins, not the clusters). */
export const PIN_LAYER_IDS = ['duty-pins', 'pins', 'closed-pins', 'selected-pin'] as const;
