/**
 * Renders the PWA icons from public/favicon.svg. Run `pnpm --filter @pharmacy-skg/web icons`
 * after changing the favicon and commit the PNGs it writes to public/. The Open Graph image (the
 * preview when a link is shared) has its own script, scripts/generate-og-image.ts.
 */
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { faClock, faHouseMedical, faPills, faStar } from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import sharp from 'sharp';
import { faPath } from '../src/lib/fa.ts';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const favicon = await readFile(`${publicDir}favicon.svg`);

// The favicon's two shapes, reused for the full-bleed variants.
const GREEN = '#0b7a43';
const CROSS_PATH = 'M13 6h6v7h7v6h-7v7h-6v-7H6v-6h7z';

/**
 * A square icon with no rounded corners, for platforms that apply their own mask (maskable
 * icons, iOS home screen). The cross is enlarged but stays inside the 80 % safe circle.
 */
function fullBleed(): Buffer {
  const scale = 1.15;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
      `<rect width="32" height="32" fill="${GREEN}"/>` +
      `<path transform="translate(16 16) scale(${scale}) translate(-16 -16)" d="${CROSS_PATH}" fill="#fff"/>` +
      `</svg>`,
  );
}

async function render(source: Buffer, size: number, file: string): Promise<void> {
  await sharp(source, { density: 384 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(file);
  console.log(`wrote ${file.replace(publicDir, 'public/')}`);
}

await mkdir(`${publicDir}icons`, { recursive: true });
await render(favicon, 192, `${publicDir}icons/icon-192.png`);
await render(favicon, 512, `${publicDir}icons/icon-512.png`);
await render(fullBleed(), 512, `${publicDir}icons/icon-maskable-512.png`);
await render(fullBleed(), 180, `${publicDir}apple-touch-icon.png`);

/**
 * The icons of the home-screen shortcuts (the manifest's `shortcuts`, src/lib/manifest.ts): the
 * Font Awesome glyph of each choice in white on the app icon's green, full-bleed, because the
 * phone cuts its own shape. The glyph stays inside the middle half.
 */
const SHORTCUT_ICONS = {
  open: faClock,
  duty: faHouseMedical,
  favourites: faStar,
  medicines: faPills,
} as const;

function shortcutIcon(icon: IconDefinition): Buffer {
  const { width, height, d } = faPath(icon);
  const scale = 16 / Math.max(width, height);
  const x = 16 - (width * scale) / 2;
  const y = 16 - (height * scale) / 2;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
      `<rect width="32" height="32" fill="${GREEN}"/>` +
      `<path transform="translate(${x} ${y}) scale(${scale})" d="${d}" fill="#fff"/>` +
      `</svg>`,
  );
}

for (const [name, icon] of Object.entries(SHORTCUT_ICONS)) {
  await render(shortcutIcon(icon), 192, `${publicDir}icons/shortcut-${name}.png`);
}
