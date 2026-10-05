# apps/web

The web app: Astro 7 (static output) with React 19 for interactive parts, installed as a PWA. Greek is the default locale (unprefixed); English lives under `/en/`.

```sh
pnpm --filter @pharmacy-skg/web dev       # dev server; /data/** is served from <repo>/data
pnpm --filter @pharmacy-skg/web build     # static site in dist/
pnpm --filter @pharmacy-skg/web preview   # serve dist/
pnpm --filter @pharmacy-skg/web icons     # re-render the PNG icons from public/favicon.svg
```

## Layout

```
api/report.ts              Vercel serverless function: problem report -> GitHub issue (D17)
integrations/data.ts       publishes <repo>/data/<city>/ under /data/<city>/ (build and dev)
integrations/service-worker.ts   writes dist/sw.js from sw/sw.js with the precache list + version
sw/sw.js                   the hand-written service worker (template)
public/                    favicon, PNG icons, stale-check.js (blocking head script)
scripts/generate-icons.ts  icon generator (sharp)
src/config.ts              app name (one constant), theme colours, emergency numbers
src/i18n/                  typed dictionaries (el.ts defines the shape, en.ts must match), routes, t()
src/layouts/Base.astro     head tags, hreflang, emergency strip, header, stale banner, footer
src/pages/[...path].astro  every page of every locale, from i18n/routes.ts
src/lib/data.ts            loadCityData(cityId, dates): fetches the published JSON for the client
src/lib/pwa.ts            service worker registration and offline prefetch
src/scripts/boot.ts        runs on every page: freshness, service worker, prefetch
```

To rename the app, edit `APP_NAME` and `APP_SHORT_NAME` in `src/config.ts`.

## Deploying

The owner creates and manages the Vercel project (decision D14).

1. **Root Directory:** `apps/web`. Turn on **Include source files outside of the Root Directory** (Project Settings, General): the build reads `../../data`, and pnpm installs from the workspace root.
2. **Framework preset:** Astro (also set in `vercel.json`). Leave the build and install commands at their defaults; Vercel runs `pnpm install` at the workspace root and `astro build`.
3. **Environment variables** (Production and Preview):

   | Variable           | Value                                                                                                                                                                                           |
   | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `GITHUB_TOKEN`     | A **fine-grained** personal access token for this repository only, with **Issues: read and write** and nothing else. Without it `/api/report` answers 503 and the form links to GitHub instead. |
   | `PUBLIC_SITE_URL`  | The public origin, e.g. `https://example.gr` (no trailing slash). Used for canonical, hreflang and Open Graph URLs. Defaults to the placeholder `https://pharmacy-skg.vercel.app`.              |
   | `PUBLIC_ANALYTICS` | `vercel` to add the Vercel Web Analytics script (cookieless, decision D16). Leave unset to ship none.                                                                                           |
   | `GITHUB_REPO`      | Optional, `owner/name` the reports go to. Defaults to `tkropalis/pharmacy-skg`.                                                                                                                 |

4. **Web Analytics:** enable it under the project's Analytics tab. The script is only added to pages when `PUBLIC_ANALYTICS=vercel`.
5. After the first deploy, send a test report from `/anafora/` and check that an issue labelled `report` appears.

The site rebuilds on every push, so a data commit from the scheduled workflow republishes `/data/**`. Data is served with `Cache-Control: no-cache`, so browsers revalidate it.

## Security headers

`vercel.json` sets a Content-Security-Policy with `script-src 'self'`: no inline scripts. Astro islands (`client:*`) emit an inline bootstrap script and would be blocked, so interactive parts are mounted from a bundled module script instead (see `src/scripts/report-form.tsx`: `createRoot(...)` into a placeholder `div`). Use the same pattern for the map, or switch to Astro's `security.csp` (hashes) and relax `script-src` in step.

Map tiles, style, glyphs and sprites come from `https://tiles.openfreemap.org`, allowed for `connect-src`, `img-src` and `font-src`. The Vercel Insights script is served from `/_vercel/insights/`, which `'self'` covers.

## Service worker

`sw/sw.js` is copied to `dist/sw.js` by `integrations/service-worker.ts` in the `astro:build:done` hook. The hook lists every built file except the data, the worker itself and `404.html`, hashes their contents, and uses the combined hash as the build version. A rebuild with identical output has the same version, so nothing updates; any changed file gives a new version, a new `precache-<version>` cache, and removal of the old one on activation. The worker takes over at once (`skipWaiting` and `clients.claim`), and the page reloads once when control changes (`src/lib/pwa.ts`), unless a form has unsent input.

Strategies: pages network-first with a 4 s timeout then the precached copy; `/data/**` network-first (cache fallback, 404s not cached); `tiles.openfreemap.org` cache-first, capped at 500 entries; everything else, including `/api/`, goes to the network untouched. After load, while online, the page fetches meta, pharmacies, the extended-hours files and the duty lists for today and the next three days (Europe/Athens) so they are in the cache.

The worker is not registered in `astro dev`; use `build` and `preview` to try it.
