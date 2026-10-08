import react from '@astrojs/react';
import { defineConfig } from 'astro/config';
import { dataIntegration } from './integrations/data.ts';
import { maplibreWorkerIntegration } from './integrations/maplibre-worker.ts';
import { serviceWorkerIntegration } from './integrations/service-worker.ts';
import { SITE_URL } from './src/config.ts';

// The public origin for canonical, hreflang, Open Graph and sitemap URLs: PUBLIC_SITE_URL when
// set (the Vercel project sets it; the e2e build sets a fixed one), else the live domain. Preview
// builds name the live domain too, so a preview that gets crawled points search engines at it.
const site = process.env.PUBLIC_SITE_URL || SITE_URL;

export default defineConfig({
  site,
  output: 'static',
  trailingSlash: 'always',
  // The worker integration must come before the service worker one: that lists the build output.
  integrations: [
    react(),
    dataIntegration(),
    maplibreWorkerIntegration(),
    serviceWorkerIntegration(),
  ],
  i18n: {
    defaultLocale: 'el',
    locales: ['el', 'en'],
    routing: { prefixDefaultLocale: false },
  },
  build: {
    // The stylesheets are small: inlined, they no longer block the first paint. (The CSP allows
    // inline styles, not inline scripts.)
    inlineStylesheets: 'always',
  },
  vite: {
    build: {
      // Source maps are public like the code (open source); Lighthouse expects them for big files.
      sourcemap: true,
      // Never inline scripts: the Content-Security-Policy (vercel.json) allows only 'self'.
      assetsInlineLimit: 0,
      // The MapLibre chunk is about 1 MB on purpose: it is loaded lazily, after the list.
      chunkSizeWarningLimit: 1200,
    },
  },
});
