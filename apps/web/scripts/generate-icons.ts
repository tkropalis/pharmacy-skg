/**
 * Renders the PWA icons from public/favicon.svg. Run `pnpm --filter @pharmacy-skg/web icons`
 * after changing the favicon, and commit the PNGs it writes to public/.
 */
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

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
