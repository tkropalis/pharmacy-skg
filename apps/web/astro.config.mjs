import react from '@astrojs/react';
import { defineConfig } from 'astro/config';
import { dataIntegration } from './integrations/data.ts';
import { serviceWorkerIntegration } from './integrations/service-worker.ts';

// The public domain is not chosen yet (docs/decisions.md, Defaults). Set PUBLIC_SITE_URL
// in the Vercel project once it is.
const site = process.env.PUBLIC_SITE_URL || 'https://pharmacy-skg.vercel.app';

export default defineConfig({
  site,
  output: 'static',
  trailingSlash: 'always',
  integrations: [react(), dataIntegration(), serviceWorkerIntegration()],
  i18n: {
    defaultLocale: 'el',
    locales: ['el', 'en'],
    routing: { prefixDefaultLocale: false },
  },
  vite: {
    build: {
      // Never inline scripts: the Content-Security-Policy (vercel.json) allows only 'self'.
      assetsInlineLimit: 0,
    },
  },
});
