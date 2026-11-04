/**
 * What every MapLibre map on the site starts with. Only ever imported by modules that are
 * themselves loaded dynamically, so the library stays out of the first load.
 */
import { getVersion, setWorkerUrl } from 'maplibre-gl';
// Added when a map starts: a plain CSS import would link it into the page head and block the
// first paint.
import maplibreCss from 'maplibre-gl/dist/maplibre-gl.css?url';

// The worker module is published beside the app by integrations/maplibre-worker.ts.
setWorkerUrl(`/_astro/maplibre-${getVersion()}/maplibre-gl-worker.mjs`);

export function loadMapStylesheet(): Promise<void> {
  if (document.querySelector(`link[href="${maplibreCss}"]`)) return Promise.resolve();
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = maplibreCss;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.append(link);
  });
}
