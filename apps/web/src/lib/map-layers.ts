/**
 * The map's sources and layers, as plain style objects (MapLibre's types are only needed where
 * they are added, components/app/map-controller.ts). Kept apart from the map so the rules that
 * matter can be tested without WebGL:
 *
 *  - Pharmacies on duty (and those whose list prints no hours) are what people look for at
 *    night. They sit in their own source, which is never clustered, and their layer is drawn
 *    above everything else. The chosen pharmacy is not a layer: it is an element over the map
 *    (map-controller.ts), and it is taken out of these sources while it is chosen.
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
  /** Where distances are measured from: the device's position or a chosen area. */
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
  const area = dark ? { fill: '#3fbf7f', text: '#b6ecd0' } : { fill: '#0a7d45', text: '#0b5c33' };
  const names = {
    layout: {
      'text-field': ['get', 'name'],
      'text-font': REGULAR,
      'text-size': 11,
      'text-offset': [0, 1.1],
      'text-anchor': 'top',
      'text-max-width': 8,
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
        // Smaller than the duty pins, which are what people look for (their square is smaller
        // in the image too); both grow with the zoom so that the pins of a dense centre do not
        // pile up when the whole city is in view, and the cross can be read at street level.
        'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 15, 0.9, 17, 1],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'symbol-sort-key': ['get', 'sort'],
      },
    },
    {
      id: 'pin-names',
      type: 'symbol',
      source: SOURCES.clustered,
      // Names of the many day-time pharmacies only once the streets are large: before that
      // they bury the map in text.
      minzoom: 17,
      filter: ['!', ['has', 'point_count']],
      ...names,
    },
    {
      // The device's position: a blue dot in a soft halo, as in every maps app.
      id: 'origin-halo',
      type: 'circle',
      source: SOURCES.origin,
      filter: ['==', ['get', 'kind'], 'geo'],
      paint: {
        'circle-radius': 18,
        'circle-color': '#1d4ed8',
        'circle-opacity': 0.16,
        'circle-radius-transition': { duration: 900, delay: 0 },
        'circle-opacity-transition': { duration: 900, delay: 0 },
      },
    },
    {
      id: 'origin-dot',
      type: 'circle',
      source: SOURCES.origin,
      filter: ['==', ['get', 'kind'], 'geo'],
      paint: {
        'circle-radius': 7,
        'circle-color': '#1d4ed8',
        'circle-stroke-width': 2.5,
        'circle-stroke-color': '#ffffff',
      },
    },
    {
      // A chosen area is not where the person is: a ring with the area's name, not the dot.
      id: 'origin-area',
      type: 'circle',
      source: SOURCES.origin,
      filter: ['==', ['get', 'kind'], 'area'],
      paint: {
        'circle-radius': 22,
        'circle-color': area.fill,
        'circle-opacity': 0.14,
        'circle-stroke-width': 2,
        'circle-stroke-color': area.fill,
      },
    },
    {
      id: 'origin-area-name',
      type: 'symbol',
      source: SOURCES.origin,
      filter: ['==', ['get', 'kind'], 'area'],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': BOLD,
        'text-size': 12,
        'text-offset': [0, 2.1],
        'text-anchor': 'top',
        'text-allow-overlap': true,
      },
      paint: { 'text-color': area.text, 'text-halo-color': paper, 'text-halo-width': 2 },
    },
    {
      // Above the clusters, the other pins and the origin.
      id: 'duty-pins',
      type: 'symbol',
      source: SOURCES.duty,
      layout: {
        'icon-image': ['get', 'image'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.75, 15, 1],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'symbol-sort-key': ['get', 'sort'],
      },
    },
    {
      id: 'duty-names',
      type: 'symbol',
      source: SOURCES.duty,
      minzoom: 14.5,
      ...names,
      layout: { ...names.layout, 'text-font': BOLD, 'text-offset': [0, 1.3] },
    },
  ];
}

/** Layers a click or tap on a pharmacy can hit (the pins, not the clusters). */
export const PIN_LAYER_IDS = ['duty-pins', 'pins', 'closed-pins'] as const;

/**
 * Layers that step back while a pharmacy is chosen, with the opacity property that does it:
 * the chosen one is then the only thing at full strength.
 */
export const DIMMED_LAYERS: readonly (readonly [string, string])[] = [
  ['closed-pins', 'icon-opacity'],
  ['clusters', 'circle-opacity'],
  ['cluster-count', 'text-opacity'],
  ['pins', 'icon-opacity'],
  ['pin-names', 'text-opacity'],
  ['duty-pins', 'icon-opacity'],
  ['duty-names', 'text-opacity'],
];
/** Their opacity while a pharmacy is chosen. */
export const DIMMED_OPACITY = 0.45;
