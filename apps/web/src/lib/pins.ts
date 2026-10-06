import { faPlus, faQuestion } from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { faPath } from './fa.ts';
import type { PinKind } from './list.ts';

/**
 * The markers, drawn once as SVG and used three times: as map images (map.addImage), in the
 * list and in the legend. Every pharmacy is a rounded square with a cross, like the green cross
 * outside every Greek pharmacy (the owner, 6 Oct 2026). Status is never colour alone: on duty is
 * large and solid with a white cross, on duty with no hours printed is large and solid with a
 * "?", open is smaller and white with a green cross, closed is small, grey and faded. A location
 * that is only approximate (locality level) has a dashed outline and a white body.
 */
export const PIN_COLORS: Readonly<Record<PinKind, string>> = {
  duty: '#0a6b3b',
  open: '#0a6b3b',
  'duty-unknown': '#0a6b3b',
  closed: '#5b6670',
};

/** Image size on the map, in CSS pixels. */
export const PIN_SIZE = 30;

interface Look {
  /** From the centre to the edge of the square, in the 32-unit box. */
  readonly half: number;
  readonly radius: number;
  /** A solid body with a white glyph; otherwise a white body with an edge and glyph in colour. */
  readonly solid: boolean;
  readonly glyph: IconDefinition;
  /** The glyph's height, and the stroke that thickens it (in the icon's own units). */
  readonly glyphHeight: number;
  readonly glyphWeight: number;
  readonly edge: number;
  readonly opacity: number;
}

const LOOKS: Readonly<Record<PinKind, Look>> = {
  // On duty: what people look for at night. The only large markers.
  duty: {
    half: 13,
    radius: 6,
    solid: true,
    glyph: faPlus,
    glyphHeight: 22,
    glyphWeight: 72,
    edge: 2.6,
    opacity: 1,
  },
  // On duty, no hours printed: the same square with a "?" for its cross.
  'duty-unknown': {
    half: 13,
    radius: 6,
    solid: true,
    glyph: faQuestion,
    glyphHeight: 17,
    glyphWeight: 40,
    edge: 2.6,
    opacity: 1,
  },
  // Open by its regular or extended hours: smaller, white, a green cross.
  open: {
    half: 10,
    radius: 4.5,
    solid: false,
    glyph: faPlus,
    glyphHeight: 13,
    glyphWeight: 80,
    edge: 2,
    opacity: 1,
  },
  // Closed, shown on request: small, grey, faded.
  closed: {
    half: 9,
    radius: 4,
    solid: false,
    glyph: faPlus,
    glyphHeight: 11,
    glyphWeight: 60,
    edge: 1.8,
    opacity: 0.8,
  },
};

/** A rounded square centred in the 32-unit box. */
function square(half: number, r: number): string {
  const a = 16 - half;
  const side = half * 2 - 2 * r;
  return (
    `M${a + r} ${a}h${side}a${r} ${r} 0 0 1 ${r} ${r}v${side}a${r} ${r} 0 0 1-${r} ${r}` +
    `h-${side}a${r} ${r} 0 0 1-${r}-${r}v-${side}a${r} ${r} 0 0 1 ${r}-${r}z`
  );
}

/**
 * The glyph centred in the 32-unit box, `height` units tall. A stroke in the same ink
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
  const look = LOOKS[kind];
  const color = PIN_COLORS[kind];
  const solid = look.solid && !approximate;
  const fill = solid ? color : '#ffffff';
  const ink = solid ? '#ffffff' : color;
  const edge = solid ? 0 : look.edge;
  const dash = approximate ? ' stroke-dasharray="3.2 2.6"' : '';
  const shape = square(look.half, look.radius);
  const opacity = look.opacity === 1 ? '' : ` opacity="${look.opacity}"`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32"${opacity}>` +
    // A white halo under everything keeps the marker readable on light and dark maps.
    `<path d="${shape}" fill="#ffffff" stroke="#ffffff" stroke-width="${solid ? 4.5 : 6}" stroke-linejoin="round"/>` +
    `<path d="${shape}" fill="${fill}" stroke="${color}" stroke-width="${edge}"${dash} stroke-linejoin="round"/>` +
    glyph(look.glyph, ink, look.glyphHeight, look.glyphWeight) +
    '</svg>'
  );
}

/** The drop of the chosen pharmacy's marker (viewBox 0 0 40 52): a round head over a point. */
const DROP = 'M20 3a16 16 0 0 1 16 16c0 9.2-8.6 16-16 29C12.6 35 4 28.2 4 19A16 16 0 0 1 20 3z';

/**
 * The chosen pharmacy's marker (the map draws it as an element over the map, map-controller.ts):
 * the same colour, body and glyph as its small marker, as a drop with a white edge, so it stands
 * clear of the pins around it. An approximate location keeps the white, dashed look.
 */
export function selectedPinSvg(kind: PinKind, approximate = false): string {
  const look = LOOKS[kind];
  const color = PIN_COLORS[kind];
  const solid = look.solid && !approximate;
  const fill = solid ? color : '#ffffff';
  const ink = solid ? '#ffffff' : color;
  const edge = solid
    ? 'stroke="none"'
    : `stroke="${color}" stroke-width="2.6"${approximate ? ' stroke-dasharray="3.4 2.8"' : ''}`;
  const small = look.glyph === faPlus ? 15 : 13;
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="52" viewBox="0 0 40 52" aria-hidden="true">' +
    `<path d="${DROP}" fill="#ffffff" stroke="#ffffff" stroke-width="5" stroke-linejoin="round"/>` +
    `<path d="${DROP}" fill="${fill}" ${edge} stroke-linejoin="round"/>` +
    // glyph() centres in a 32-unit box; the head's centre is at (20, 19).
    `<g transform="translate(4 3)">${glyph(look.glyph, ink, small, look.glyph === faPlus ? 60 : 36)}</g>` +
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
  open: 1,
  'duty-unknown': 2,
  duty: 3,
};
