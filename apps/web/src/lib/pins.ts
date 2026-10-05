import type { PinKind } from './list.ts';

/**
 * The markers, drawn once as SVG and used twice: as map images (map.addImage) and as the
 * legend. Status is never colour alone: each kind has its own outline and glyph, and a
 * location that is only approximate (locality level) has a dashed outline and a hollow body.
 */
export const PIN_COLORS: Readonly<Record<PinKind, string>> = {
  duty: '#0a6b3b',
  regular: '#1b57b5',
  extended: '#6a3aa8',
  'duty-unknown': '#a14a00',
  closed: '#5b6670',
};

/** Image size on the map, in CSS pixels. */
export const PIN_SIZE = 30;

const SHAPES: Readonly<Record<PinKind, string>> = {
  // Rounded square: the official ΦΣΘ duty list.
  duty: 'M9 3h14a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6V9a6 6 0 0 1 6-6z',
  // Circle: regular hours.
  regular: 'M16 3a13 13 0 1 1 0 26 13 13 0 0 1 0-26z',
  // Hexagon: extended hours.
  extended: 'M16 2.5l12 6.75v13.5L16 29.5 4 22.75V9.25z',
  // Rounded square with a "?": on duty, hours not stated.
  'duty-unknown': 'M9 3h14a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6V9a6 6 0 0 1 6-6z',
  // Small circle with a dash: closed.
  closed: 'M16 7.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z',
};

const GLYPHS: Readonly<Record<PinKind, string>> = {
  duty: 'M14 8h4v6h6v4h-6v6h-4v-6H8v-4h6z',
  regular: 'M9.5 16.5l4.2 4.2 8.8-9.4',
  extended: 'M16 8.5v8l5 3',
  'duty-unknown': '',
  closed: 'M12 16h8',
};

/** Glyphs drawn as strokes rather than filled shapes. */
const STROKED: ReadonlySet<PinKind> = new Set(['regular', 'extended', 'closed']);

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
  const glyph =
    kind === 'duty-unknown'
      ? `<text x="16" y="22.5" text-anchor="middle" font-family="system-ui,sans-serif" font-size="19" font-weight="700" fill="${ink}">?</text>`
      : STROKED.has(kind)
        ? `<path d="${GLYPHS[kind]}" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`
        : `<path d="${GLYPHS[kind]}" fill="${ink}"/>`;
  const ring = hollow ? 2.6 : 0;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">` +
    // A white halo under everything keeps the marker readable on light and dark maps.
    `<path d="${shape}" fill="#ffffff" stroke="#ffffff" stroke-width="${hollow ? 6 : 5}" stroke-linejoin="round"/>` +
    `<path d="${shape}" fill="${fill}" stroke="${color}" stroke-width="${ring}"${dash} stroke-linejoin="round"/>` +
    glyph +
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
