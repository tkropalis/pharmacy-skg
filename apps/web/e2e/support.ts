import { test as base, expect } from '@playwright/test';
import type { Locator, Page, Route } from '@playwright/test';
import { NOW } from './constants.ts';

export { expect };

/**
 * A style with only a background: enough for MapLibre to load and for the pins to draw, and
 * the same every time. The real style (OpenFreeMap Liberty) is never requested.
 */
const STUB_STYLE = {
  version: 8,
  name: 'e2e-stub',
  // A vector source that serves empty tiles: it is there for the attribution, which the real
  // style carries and which the map controls tests need to see.
  sources: {
    openmaptiles: {
      type: 'vector',
      tiles: ['https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf'],
      maxzoom: 14,
      attribution:
        '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> ' +
        '<a href="https://www.openmaptiles.org/" target="_blank">© OpenMapTiles</a> ' +
        'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
    },
  },
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#dde8e1' } },
    { id: 'lines', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation' },
  ],
};

/** Answers every request to the tile host from memory: the style, and empty tiles and glyphs. */
async function stubTiles(route: Route): Promise<void> {
  const { pathname } = new URL(route.request().url());
  if (pathname.startsWith('/styles/')) {
    await route.fulfill({ json: STUB_STYLE, headers: { 'access-control-allow-origin': '*' } });
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: 'application/x-protobuf',
    body: '',
    headers: { 'access-control-allow-origin': '*' },
  });
}

interface Fixtures {
  /** The instant the page's clock starts at (it keeps running from there). */
  now: string;
  /**
   * Whether the app may ask for the position when it opens (the default, as for a first-time
   * visitor). `false` is a visitor who turned that off: no position, an alphabetical list.
   */
  autoLocate: boolean;
  /** Messages of console errors and uncaught exceptions seen so far. */
  consoleErrors: string[];
}

export const test = base.extend<Fixtures>({
  now: [NOW, { option: true }],
  autoLocate: [true, { option: true }],

  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`${message.text()} (${message.location().url})`);
    });
    page.on('pageerror', (error) => errors.push(`uncaught: ${error.message}`));
    await use(errors);
  },

  page: async ({ page, context, now, autoLocate }, use) => {
    await context.route('https://tiles.openfreemap.org/**', stubTiles);
    // The flag the app keeps when the person has turned the automatic location request off.
    if (!autoLocate) {
      await page.addInitScript(() => localStorage.setItem('pharmacy-skg:location', 'off'));
    }
    await page.clock.install({ time: new Date(now) });
    await use(page);
  },
});

/** Waits until the home screen's list has rows (the data has loaded). */
export async function waitForRows(page: Page): Promise<Locator> {
  const rows = page.locator('ol.rows > li.row');
  await expect(rows.first()).toBeVisible();
  return rows;
}

/**
 * Waits until MapLibre is running. The map starts by itself a few seconds after the list; here
 * it is started as a person would, by reaching for it.
 */
export async function waitForMap(page: Page): Promise<void> {
  await page.locator('.map-area').dispatchEvent('pointerdown');
  await expect(page.locator('.map[data-status="ready"]')).toBeAttached({ timeout: 20_000 });
}

/**
 * Opens the "location, time and filters" panel, which starts closed. Its toggle is the origin
 * chip in the sheet header, or the small button of the nearby card while there is no position.
 */
export async function openControls(page: Page): Promise<void> {
  const panel = page.locator('#controls');
  if (!(await panel.isVisible()))
    await page.locator('button.controls-toggle:visible').first().click();
  await expect(panel).toBeVisible();
}

/**
 * Waits for the running (finite) animations to end, so an accessibility scan never measures
 * something half-faded in, such as the chosen pharmacy's flag on the map (it fades in from
 * transparent and reads as low contrast until it has).
 */
export async function settleAnimations(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.playState === 'running' &&
            animation.effect?.getTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}
