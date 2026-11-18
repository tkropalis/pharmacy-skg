/**
 * Renders the 1200x630 Open Graph image (public/og-image.png), the card shown when a link is
 * shared on Reddit, Facebook, Viber or WhatsApp. Run `pnpm --filter @pharmacy-skg/web og-image`
 * after changing the app name (src/config.ts), the tagline (i18n) or the covered areas, and
 * commit the PNG. It is rendered in a browser so the text is set in Manrope, the app's own face:
 * set PW_CHROMIUM_PATH to a Chromium binary, otherwise the installed Google Chrome is used.
 *
 * The right half is a night in central Athens drawn from the data: every pharmacy is a small grey
 * square, and the ones on duty through the night in the latest published list are the map's
 * large green marker. No street, name or label: only the answer the app gives, at a glance.
 */
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { APP_NAME } from '../src/config.ts';
import { el } from '../src/i18n/el.ts';
import { en } from '../src/i18n/en.ts';

const WIDTH = 1200;
const HEIGHT = 630;

const dataDir = fileURLToPath(new URL('../../../data/', import.meta.url));
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const fontDir = fileURLToPath(
  new URL('../node_modules/@fontsource-variable/manrope/files/', import.meta.url),
);

// The dark look's tokens (docs/DESIGN.md, Colour): the image is seen in feeds, often at night.
const BG = '#0e1512';
const FG = '#e4ece7';
const MUTED = '#a0b2a9';
const ACCENT = '#43c584';
// The app icon's green (favicon.svg) and its cross, as on the map's duty marker.
const GREEN = '#0b7a43';
const CROSS_PATH = 'M13 6h6v7h7v6h-7v7h-6v-7H6v-6h7z';

interface Point {
  lat: number;
  lon: number;
}

interface Located extends Point {
  id: string;
}

// The map: central Athens at street scale, where the most pharmacies are. Its centre (Syntagma,
// a little north-east) sits in the middle of the right half; it fades out under the text.
const AREAS = ['attiki', 'piraeus'];
const CENTRE: Point = { lat: 37.985, lon: 23.745 };
const CENTRE_PX = { x: 900, y: 315 };
const PX_PER_DEGREE = 3150;

async function pharmacies(): Promise<Located[]> {
  const located: Located[] = [];
  for (const area of AREAS) {
    const file = await readFile(`${dataDir}${area}/pharmacies.json`, 'utf8');
    const { pharmacies } = JSON.parse(file) as { pharmacies: { id: string; location?: Point }[] };
    for (const p of pharmacies) if (p.location) located.push({ id: p.id, ...p.location });
  }
  return located;
}

/** The ids on duty through the night in the latest published day (overnight and 24-hour). */
async function onDutyTonight(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const area of AREAS) {
    const days = (await readdir(`${dataDir}${area}/duties`)).filter((f) => f.endsWith('.json'));
    const latest = days.sort().at(-1);
    if (!latest) continue;
    const day = JSON.parse(await readFile(`${dataDir}${area}/duties/${latest}`, 'utf8')) as {
      groups: { sections: { kind: string; entries: { pharmacyId?: string }[] }[] }[];
    };
    for (const group of day.groups)
      for (const section of group.sections)
        if (section.kind === 'overnight' || section.kind === 'on-duty')
          for (const e of section.entries) if (e.pharmacyId) ids.add(e.pharmacyId);
  }
  return ids;
}

/** Equirectangular, scaled by the cosine of the latitude: exact enough for one city. */
function project(p: Point): [number, number] {
  const k = Math.cos((CENTRE.lat * Math.PI) / 180);
  return [
    CENTRE_PX.x + (p.lon - CENTRE.lon) * k * PX_PER_DEGREE,
    CENTRE_PX.y - (p.lat - CENTRE.lat) * PX_PER_DEGREE,
  ];
}

const inside = ([x, y]: [number, number], margin: number): boolean =>
  x > -margin && x < WIDTH + margin && y > -margin && y < HEIGHT + margin;

/** The on-duty marker: the app icon's rounded square and cross, `size` pixels wide. */
function dutyMarker([x, y]: [number, number], size: number): string {
  const s = size / 32;
  return (
    `<g transform="translate(${(x - size / 2).toFixed(1)} ${(y - size / 2).toFixed(1)}) scale(${s})">` +
    `<rect x="-2" y="-2" width="36" height="36" rx="9" fill="${BG}"/>` +
    `<rect width="32" height="32" rx="7" fill="${GREEN}"/>` +
    `<path d="${CROSS_PATH}" fill="#fff"/></g>`
  );
}

function mapSvg(all: Located[], duty: Set<string>): string {
  const closed: string[] = [];
  const open: string[] = [];
  for (const p of all) {
    const xy = project(p);
    if (!inside(xy, 40)) continue;
    if (duty.has(p.id)) {
      // A marker half faded under the text reads as a stain: leave those out.
      if (xy[0] > 720) open.push(dutyMarker(xy, 30));
    } else
      closed.push(
        `<rect x="${(xy[0] - 2.5).toFixed(1)}" y="${(xy[1] - 2.5).toFixed(1)}" width="5" height="5" rx="1.2"/>`,
      );
  }
  return (
    `<svg class="map" xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-hidden="true">` +
    `<g fill="${MUTED}" fill-opacity="0.32">${closed.join('')}</g>${open.join('')}</svg>`
  );
}

async function fontFace(file: string, range: string): Promise<string> {
  const data = (await readFile(`${fontDir}${file}`)).toString('base64');
  return (
    `@font-face{font-family:Manrope;font-weight:200 800;` +
    `src:url(data:font/woff2;base64,${data}) format('woff2');unicode-range:${range}}`
  );
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function html(all: Located[], duty: Set<string>): Promise<string> {
  const fonts =
    (await fontFace('manrope-greek-wght-normal.woff2', 'U+0370-03FF')) +
    (await fontFace('manrope-latin-wght-normal.woff2', 'U+0000-00FF,U+2000-206F'));
  const [nameA = '', nameB = ''] = APP_NAME.el.split(/ (?=[^ ]+$)/);
  return `<!doctype html><html lang="el"><head><meta charset="utf-8"><style>
${fonts}
*{margin:0;box-sizing:border-box}
html,body{width:${WIDTH}px;height:${HEIGHT}px;background:${BG};overflow:hidden}
body{font-family:Manrope,sans-serif;color:${FG};-webkit-font-smoothing:antialiased;position:relative}
.map{position:absolute;inset:0;-webkit-mask-image:linear-gradient(to right,transparent 500px,#000 720px);mask-image:linear-gradient(to right,transparent 500px,#000 720px)}
.text{position:absolute;left:80px;top:0;bottom:0;width:560px;display:flex;flex-direction:column;justify-content:center}
.icon{width:88px;height:88px;margin-bottom:40px}
h1{font-size:84px;font-weight:800;line-height:1;letter-spacing:-0.02em}
.en{font-size:36px;font-weight:600;color:${MUTED};margin-top:20px;letter-spacing:-0.01em}
.tagline{font-size:30px;font-weight:600;color:${ACCENT};margin-top:44px;line-height:1.35}
</style></head><body>
${mapSvg(all, duty)}
<div class="text">
<svg class="icon" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="${GREEN}"/><path d="${CROSS_PATH}" fill="#fff"/></svg>
<h1>${escapeHtml(nameA)}<br>${escapeHtml(nameB)}</h1>
<p class="en">${escapeHtml(APP_NAME.en)}</p>
<p class="tagline">${escapeHtml(el.tagline)}<br>${escapeHtml(en.tagline)}</p>
</div>
</body></html>`;
}

const all = await pharmacies();
const duty = await onDutyTonight();
const executablePath = process.env['PW_CHROMIUM_PATH'];
const browser = await chromium.launch(executablePath ? { executablePath } : { channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  await page.setContent(await html(all, duty));
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: 'png' });
  await sharp(png).png({ compressionLevel: 9 }).toFile(`${publicDir}og-image.png`);
  console.log('wrote public/og-image.png');
} finally {
  await browser.close();
}
