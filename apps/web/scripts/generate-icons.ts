/**
 * Renders the PWA icons from public/favicon.svg and the 1200x630 Open Graph image (the preview
 * when a link is shared). Run `pnpm --filter @pharmacy-skg/web icons` after changing the
 * favicon, the app name (src/config.ts) or the wording below, and commit the PNGs it writes
 * to public/. The text is rendered with the fonts of the machine that runs it, so the result
 * is committed rather than built.
 */
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { APP_NAME } from '../src/config.ts';

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

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Greek title (the default locale) with the English name and the promise below it. */
function openGraphImage(): Buffer {
  const [greekA = '', greekB = ''] = APP_NAME.el.split(/ (?=[^ ]+$)/);
  const text = (y: number, size: number, weight: number, fill: string, value: string) =>
    `<text x="400" y="${y}" font-family="DejaVu Sans, Noto Sans, Arial, sans-serif" ` +
    `font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(value)}</text>`;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">` +
      `<rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="#0d1512"/>` +
      `<rect x="0" y="${OG_HEIGHT - 16}" width="${OG_WIDTH}" height="16" fill="${GREEN}"/>` +
      `<g transform="translate(80 175) scale(8)">` +
      `<rect width="32" height="32" rx="6" fill="${GREEN}"/><path d="${CROSS_PATH}" fill="#fff"/></g>` +
      text(250, 70, 700, '#ffffff', greekA) +
      text(335, 70, 700, '#ffffff', greekB) +
      text(425, 40, 400, '#a7bbb1', APP_NAME.en) +
      text(500, 27, 400, '#3ccf7f', 'Δωρεάν και χωρίς διαφημίσεις · Free and ad-free') +
      `</svg>`,
  );
}

await sharp(openGraphImage(), { density: 96 })
  .png({ compressionLevel: 9 })
  .toFile(`${publicDir}og-image.png`);
console.log('wrote public/og-image.png');
