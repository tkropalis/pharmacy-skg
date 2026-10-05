import { faMinus, faPlus, faQuestion } from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { faPath } from './fa.ts';
import type { PinKind } from './list.ts';

/**
 * The markers, drawn once as SVG and used three times: as map images (map.addImage), in the
 * list and in the legend. Status is never colour alone: each kind has its own silhouette
 * (duty a square with a cross, regular a dot, extended a diamond), and a location that is only
 * approximate (locality level) has a dashed outline and a hollow body. Only the duty markers
 * are large; the rest stay small so the map reads at a glance.
 */
export const PIN_COLORS: Readonly<Record<PinKind, string>> = {
  duty: '#0a6b3b',
  regular: '#3f5f7f',
  extended: '#6a3aa8',
  'duty-unknown': '#a14a00',
  closed: '#5b6670',
};

/** Image size on the map, in CSS pixels. */
export const PIN_SIZE = 30;

const SHAPES: Readonly<Record<PinKind, string>> = {
  // Rounded square with a cross: the official ΦΣΘ duty list. The only large marker.
  duty: 'M9 3h14a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6V9a6 6 0 0 1 6-6z',
  // Small dot: regular hours.
  regular: 'M16 7a9 9 0 1 1 0 18 9 9 0 0 1 0-18z',
  // Small diamond: extended hours.
  extended: 'M16 5.5l10.5 10.5L16 26.5 5.5 16z',
  // Rounded square with a "?": on duty, hours not stated.
  'duty-unknown': 'M9 3h14a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6V9a6 6 0 0 1 6-6z',
  // Small circle with a dash: closed.
  closed: 'M16 8.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15z',
};

/** Font Awesome glyphs inside the larger markers; the small dot and diamond have none. */
const GLYPHS: Readonly<Record<PinKind, IconDefinition | null>> = {
  duty: faPlus,
  regular: null,
  extended: null,
  'duty-unknown': faQuestion,
  closed: faMinus,
};

/**
 * The glyph centred in the 32-unit marker, its box `height` units tall. A stroke in the same ink
 * (`weight`, in the icon's own units) thickens it: Font Awesome's lines are drawn for text
 * sizes and would be hairlines on a 30 px marker.
 */
function glyph(icon: IconDefinition, ink: string, height: number, weight: number): string {
  const { width: w, height: h, d } = faPath(icon);
  const k = height / h;
  const x = (16 - (w * k) / 2).toFixed(2);
  const y = (16 - height / 2).toFixed(2);
  return (
    `<path transform="translate(${x} ${y}) scale(${k.toFixed(4)})" d="${d}" fill="${ink}" ` +
    `stroke="${ink}" stroke-width="${weight}" stroke-linejoin="round"/>`
  );
}

/** The SVG markup of a pin (viewBox 0 0 32 32). `size` is the CSS pixel size. */
export function pinSvg(
  kind: PinKind,
  options: { readonly approximate?: boolean; readonly size?: number } = {},
): string {
  const { approximate = false, size = PIN_SIZE } = options;
  const color = PIN_COLORS[kind];
  const hollow = approximate || kind === 'duty-unknown';
  const fill = hollow ? '#ffffff' : color;
  const ink = hollow ? color : '#ffffff';
  const dash = approximate ? ' stroke-dasharray="3.2 2.6"' : '';
  const shape = SHAPES[kind];
  const icon = GLYPHS[kind];
  const mark =
    icon === null ? '' : glyph(icon, ink, kind === 'duty' ? 22 : 18, kind === 'duty' ? 72 : 40);
  const ring = hollow ? 2.6 : 0;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">` +
    // A white halo under everything keeps the marker readable on light and dark maps.
    `<path d="${shape}" fill="#ffffff" stroke="#ffffff" stroke-width="${hollow ? 6 : 4.5}" stroke-linejoin="round"/>` +
    `<path d="${shape}" fill="${fill}" stroke="${color}" stroke-width="${ring}"${dash} stroke-linejoin="round"/>` +
    mark +
    '</svg>'
  );
}

/** The drop of the chosen pharmacy's marker (viewBox 0 0 40 52): a round head over a point. */
const DROP = 'M20 3a16 16 0 0 1 16 16c0 9.2-8.6 16-16 29C12.6 35 4 28.2 4 19A16 16 0 0 1 20 3z';

/** What the head of the chosen marker shows: the small markers' symbols, larger. */
function headMark(kind: PinKind, ink: string): string {
  switch (kind) {
    case 'regular':
      return `<circle cx="20" cy="19" r="5.5" fill="${ink}"/>`;
    case 'extended':
      return `<path d="M20 12.5l6.5 6.5-6.5 6.5-6.5-6.5z" fill="${ink}"/>`;
    default: {
      const icon = GLYPHS[kind];
      if (icon === null) return '';
      // glyph() centres in a 32-unit box; the head's centre is at (20, 19).
      return `<g transform="translate(4 3)">${glyph(icon, ink, kind === 'duty' ? 15 : 13, kind === 'duty' ? 60 : 36)}</g>`;
    }
  }
}

/**
 * The chosen pharmacy's marker (the map draws it as an element over the map, map-controller.ts):
 * the same colour and symbol as its small marker, as a drop with a white edge, so it stands
 * clear of the pins around it. An approximate location keeps the hollow, dashed look.
 */
export function selectedPinSvg(kind: PinKind, approximate = false): string {
  const color = PIN_COLORS[kind];
  const hollow = approximate || kind === 'duty-unknown';
  const fill = hollow ? '#ffffff' : color;
  const ink = hollow ? color : '#ffffff';
  const edge = hollow
    ? `stroke="${color}" stroke-width="2.6"${approximate ? ' stroke-dasharray="3.4 2.8"' : ''}`
    : 'stroke="none"';
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="52" viewBox="0 0 40 52" aria-hidden="true">' +
    `<path d="${DROP}" fill="#ffffff" stroke="#ffffff" stroke-width="5" stroke-linejoin="round"/>` +
    `<path d="${DROP}" fill="${fill}" ${edge} stroke-linejoin="round"/>` +
    headMark(kind, ink) +
    '</svg>'
  );
}

/** The map image name of a marker. */
export function pinImageName(kind: PinKind, approximate: boolean): string {
  return `pin-${kind}${approximate ? '-approx' : ''}`;
}

/** Pins that draw later sit on top when they overlap: duty on top, closed underneath. */
export const PIN_SORT_KEY: Readonly<Record<PinKind, number>> = {
  closed: 0,
  regular: 1,
  extended: 2,
  'duty-unknown': 3,
  duty: 4,
};
