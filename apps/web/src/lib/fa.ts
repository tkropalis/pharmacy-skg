import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';

/**
 * Font Awesome icons (Free, CC BY 4.0) as plain SVG markup, for the places that are not React:
 * Astro pages, the map's markers and controls, the update notice. components/app/icons.tsx is
 * the React side.
 */
export function faPath(icon: IconDefinition): {
  readonly width: number;
  readonly height: number;
  readonly d: string;
} {
  const [width, height, , , path] = icon.icon;
  return { width, height, d: typeof path === 'string' ? path : path.join(' ') };
}

export function faSvg(
  icon: IconDefinition,
  options: { readonly size?: number; readonly className?: string; readonly color?: string } = {},
): string {
  const { width, height, d } = faPath(icon);
  const size = options.size ?? 16;
  const className = options.className ? ` class="${options.className}"` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg"${className} viewBox="0 0 ${width} ${height}" ` +
    `width="${size}" height="${size}" aria-hidden="true" focusable="false">` +
    `<path d="${d}" fill="${options.color ?? 'currentColor'}"/></svg>`
  );
}

/** As a CSS url(): for MapLibre's control buttons, which draw their icon as a background. */
export function faDataUrl(icon: IconDefinition, color: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(faSvg(icon, { color }))}")`;
}
