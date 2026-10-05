import { defineConfig } from '@playwright/test';

// Not Astro's default (4321, where a developer's own dev or preview server usually is): the
// tests must never run against some other server that happens to be on the port.
const PORT = Number(process.env.E2E_PORT ?? 4329);

// Lets context.route() see requests the service worker makes itself (the map style and tiles in
// the offline test), so those are stubbed too instead of reaching the network.
process.env['PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS'] = '1';

/**
 * Browser smoke tests against `astro preview` of the production build (`pnpm e2e` builds first,
 * see e2e/run.ts). Locally set PW_CHROMIUM_PATH to a Chromium binary; CI installs one with
 * `playwright install`. Service workers are blocked except in the offline test, and every
 * request to the tile server is stubbed (e2e/support.ts), so nothing here touches the network.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'el-GR',
    timezoneId: 'Europe/Athens',
    serviceWorkers: 'block',
    permissions: ['geolocation'],
    geolocation: { latitude: 40.6326, longitude: 22.9409 },
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env['PW_CHROMIUM_PATH'] || undefined,
      // Software WebGL, so MapLibre can start in a headless container.
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  projects: [
    {
      name: 'mobile',
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
  ],
  globalSetup: './e2e/global-setup.ts',
  webServer: {
    // --ignore-lock: Astro 7 keeps one preview server per project and, when it finds an agent or
    // a lock, starts it in the background and exits. Here Playwright owns the process (it starts
    // it and stops it) and the port is its own, so the lock is not wanted.
    command: `pnpm exec astro preview --host 127.0.0.1 --port ${PORT} --ignore-lock`,
    url: `http://127.0.0.1:${PORT}/`,
    // Never reuse what is already listening: it could be a stale or an unrelated server. If the
    // port is taken Playwright stops with an error that says so; pick another with E2E_PORT.
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
