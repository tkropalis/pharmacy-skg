# apps/web

The web app: Astro 7 (static output) with React 19 for interactive parts, installed as a PWA. Greek is the default locale (unprefixed); English lives under `/en/`.

```sh
pnpm --filter @pharmacy-skg/web dev       # dev server; /data/** is served from <repo>/data
pnpm --filter @pharmacy-skg/web build     # static site in dist/
pnpm --filter @pharmacy-skg/web preview   # serve dist/
pnpm --filter @pharmacy-skg/web icons     # re-render the PNG icons and the Open Graph image from public/favicon.svg
pnpm e2e                                  # build with a fixed date, then run the browser tests
```

## Layout

```
api/report.ts              Vercel serverless function: problem report -> GitHub issue (D17)
integrations/data.ts       publishes <repo>/data/<city>/ under /data/<city>/ (build and dev)
integrations/service-worker.ts   writes dist/sw.js from sw/sw.js with the precache list + version
sw/sw.js                   the hand-written service worker (template)
public/                    favicon, PNG icons, stale-check.js (blocking head script)
scripts/generate-icons.ts  icon and Open Graph image generator (sharp); the PNGs are committed
playwright.config.ts, e2e/ browser tests (see "Browser tests")
src/config.ts              app name (one constant), theme colours, emergency numbers
src/i18n/                  typed dictionaries (el.ts defines the shape, en.ts must match), routes, t()
src/layouts/Base.astro     head tags, hreflang, emergency strip, header, stale banner, footer
src/pages/[...path].astro  every page of every locale, from i18n/routes.ts
src/lib/data.ts            loadCityData(cityId, dates): fetches the published JSON for the client
src/lib/seo/              view models for the search-engine pages (pure, tested): translit.ts (ELOT 743 slugs),
                           model.ts, views.ts, format.ts, status-text.ts, jsonld.ts, sitemap.ts;
                           site-data.ts is the only file that reads data/ at build time
src/components/seo/       pharmacy, duty-date and area pages (thin; the logic is in lib/seo)
src/pages/<slug>/         one folder per parameterised route and locale (farmakeio, efimeries, perioxi,
                           en/pharmacy, en/duty, en/area), named after PARAM_ROUTES in i18n/routes.ts
src/pages/sitemap.xml.ts, robots.txt.ts   sitemap with hreflang alternates, and robots
src/scripts/seo/          status now, open-now and today highlight, computed in the browser
src/lib/pwa.ts            service worker registration and offline prefetch
src/lib/idle.ts, quiet.ts  yield to the browser, run when idle, run when the page has settled
src/scripts/boot.ts        runs on every page: freshness, service worker, prefetch
src/scripts/home-app.tsx   mounts the home screen into #app (replaces the no-JavaScript fallback)
src/components/app/        the home screen: HomeApp (state), Sheet, Controls, PharmacyRow,
                           UpcomingDuties, MapView (thin) and map-controller (MapLibre, lazy)
src/lib/                   pure, tested logic: status-label, list, directions, ics, places,
                           favourites, map-style, map-data, pins, duties, format
integrations/maplibre-worker.ts   publishes MapLibre's worker files under /_astro/maplibre-<version>/
```

To rename the app, edit `APP_NAME` and `APP_SHORT_NAME` in `src/config.ts`.

## Browser tests

`pnpm e2e` (from the repository root) builds the site with `PHARMACY_TODAY=2026-10-05` and a fixed `PUBLIC_SITE_URL` (`e2e/run.ts`), serves it with `astro preview` and runs Playwright in Chromium twice: a 390×844 phone and a 1280×800 desktop. Set `E2E_SKIP_BUILD=1` to reuse `dist/`, and pass Playwright arguments after it (`pnpm e2e -g offline`). `E2E_PORT` changes the port (default 4321); `astro preview` runs as a background server per project, so stop a stale one with `pnpm exec astro preview stop` in `apps/web`.

- **Browser:** CI installs one (`pnpm --filter @pharmacy-skg/web exec playwright install --with-deps chromium`). Locally use any Chromium by setting `PW_CHROMIUM_PATH=/path/to/chromium`; do not install browsers just for this. The Playwright version is pinned to match.
- **Fixed time:** the build's idea of today is `PHARMACY_TODAY` (`src/lib/build-today.ts`, read by the data integration and the search-engine page builders; unset it is the Athens date), and every test fixes the browser clock with `page.clock` (default Monday 2026-10-05 22:30 Athens, when only duty pharmacies are open). Use dates that exist in `data/thessaloniki/duties` (2026-09-28 to 2026-10-08 in the test build); 2026-10-01 has the metro list only, which the group-coverage tests use.
- **No network:** every request to `tiles.openfreemap.org` is answered by `e2e/support.ts` (a style with one empty vector source, empty tiles and glyphs). Service workers are blocked except in `offline.spec.ts`, where `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1` (set in `playwright.config.ts`) lets the stubs also catch the worker's own requests.
- **The map:** it starts by itself only once the page has settled (seconds after the list), so a test that needs it calls `waitForMap` (`e2e/support.ts`), which reaches for the map as a person would. `home.spec.ts` covers the three ways it starts.
- **Accessibility:** `a11y.spec.ts` runs axe with the WCAG 2.0, 2.1 and 2.2 level A and AA rules on the home, pharmacy, duty-date, area, about, privacy and report pages, in both languages and both colour schemes. `home.spec.ts` checks 44×44 px map controls and visible, unobscured keyboard focus.
- **Not covered:** the Content-Security-Policy and the response headers of `vercel.json` (preview does not apply them), and real devices (M4).

## Lighthouse

Run on the built site served with compression and the cache headers of `vercel.json` (`astro preview` sends neither, so "use text compression" would fail), mobile preset, with a local stand-in for `tiles.openfreemap.org`. Last measured on this branch, in a slow shared container (performance varies by about ±10 between runs):

| Page                     | Performance | Accessibility | Best practices | SEO |
| ------------------------ | ----------- | ------------- | -------------- | --- |
| Duty date                | 100         | 100           | 100            | 100 |
| Pharmacy                 | 97          | 100           | 100            | 100 |
| Home screen (list + map) | 75 to 100   | 100           | 100            | 100 |

The home screen was 45 to 65 before the performance pass. The table below was measured with a 3 s map wait; with the 1 s wait now in use, the cached server gives 99 to 100 on a cold run and 75 to 79 on repeat runs (blocking time about 0.7 s, all of it the map start). Median of three runs per language, mobile preset, two servers (a compressing static server that caches its compressed files, and a first-visit one that compresses every request, which is slower and spreads the load out more); the figures are for `/` and `/en/`:

| Home screen           | Performance | Largest paint | Blocking time  | Layout shift |
| --------------------- | ----------- | ------------- | -------------- | ------------ |
| Before, cached server | 65, 65      | 2.9 s, 2.9 s  | 2.7 s, 2.6 s   | 0, 0         |
| After, cached server  | 96, 96      | 2.6 s, 2.6 s  | 0.07 s, 0.06 s | 0.003, 0     |
| Before, slow server   | 56, 49      | 1.8 s, 1.5 s  | 0.8 s, 1.8 s   | 0.33, 0.33   |
| After, slow server    | 98, 99      | 1.7 s, 1.5 s  | 0.02 s, 0.02 s | 0.003, 0.003 |

- **Home screen:** what the first load does is small: fetch `meta.json` and `pharmacies.json` (preloaded from the page head, `pages/[...path].astro`), and the rest as soon as the entry script runs (`prefetchCityData`, before React mounts); render the list through a React transition, which React cuts into slices of a few milliseconds. The one long piece left is computing which pharmacies are open (`buildRows`, about 25 ms the first time).
- **The map starts when the page has settled** (`components/app/use-map-start.ts`): 1 s without a network response, long task, touch or scroll (`lib/quiet.ts`), then an idle moment, and 15 s at the latest; at once when the person touches or focuses the map, asks for a pharmacy on it or pulls the sheet down. Starting MapLibre is 300 to 600 ms of long tasks in this container (the first WebGL context, shader compilation, the first frames) and they cannot be cut into slices. With a 1 s wait the home screen scores 75 to 79 on a repeat run, 99 to 100 on a cold one (blocking time about 0.7 s, all of it the map start), and the map appears about 1 to 2 s after the list. A 3 s wait scores 93 to 100 only because Lighthouse stops observing before the map starts, while people would wait about 4 s for the map, so we chose 1 s. `MAP_QUIET_MS` tunes it.
- **Layout shift:** the data-age line and the footer under the "loading" note are reserved or left out until the data has loaded; they used to push the sheet's body down (0.33 on a slow first load).
- **Best practices** is 96 when the browser cannot reach the tile server ("errors logged to the console"); the run above resolves it to a local stub.

## Search-engine pages

The build generates a page per pharmacy (about 1,030 per locale), per published duty date and per locality, plus index pages for dates and areas. They are static, so anything that depends on the clock is computed in the browser: the pharmacy's status, which pharmacies of an area are open, and which date is today. The static part shows only officially published duty dates (decision D11).

- **Duty-date pages** exist for the dates whose duty file is published into `dist/data` (today minus 7 days onward, `integrations/data-files.ts`), at most 45 (`MAX_DUTY_PAGES` in `lib/seo/model.ts`). Pharmacy pages also list the last 14 days from `data/`, linking to a date page only where one exists.
- **Area slugs** come from the locality name by ELOT 743 transliteration (`lib/seo/translit.ts`). They depend only on the name, so they are stable across builds.
- **Service worker:** these pages are not precached (`integrations/precache.ts`), only the index pages are. They are fetched when visited.
- **Sitemap:** `/sitemap.xml` lists both locales with `xhtml:link` alternates. The report form and the 404 page are left out.

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

The home screen (`src/scripts/home-app.tsx`) follows that pattern. MapLibre is loaded by a dynamic import from `components/app/map-controller.ts` only once the page has settled after the list (or the person reaches for the map), so the first load stays small. MapLibre 6 starts its tile workers from `maplibre-gl-worker.mjs`, which imports `maplibre-gl-shared.mjs`; a bundler cannot see that, so `integrations/maplibre-worker.ts` copies both into `dist/_astro/maplibre-<version>/` (and serves them in `astro dev`) and the app calls `setWorkerUrl`. The worker runs from a `blob:` module, which is why `worker-src` allows `'self' blob:`. Hosts must serve `.mjs` as `text/javascript` (Vercel does).

Map tiles, style, glyphs and sprites come from `https://tiles.openfreemap.org`, allowed for `connect-src`, `img-src` and `font-src`. The Vercel Insights script is served from `/_vercel/insights/`, which `'self'` covers.

## Service worker

`sw/sw.js` is copied to `dist/sw.js` by `integrations/service-worker.ts` in the `astro:build:done` hook. The hook lists every built file except the data, the worker itself and `404.html`, hashes their contents, and uses the combined hash as the build version. A rebuild with identical output has the same version, so nothing updates; any changed file gives a new version, a new `precache-<version>` cache, and removal of the old one on activation. The worker takes over at once (`skipWaiting` and `clients.claim`), and the page reloads once when control changes (`src/lib/pwa.ts`), unless a form has unsent input.

The map chunk, its worker files and its stylesheet are **not** precached (about 0.45 MB gzipped that most visits never use). The worker caches any other content-hashed `/_astro/` file cache-first the first time it is used, so the map works offline once it has been seen (cache `assets-<version>`, dropped with the version). The precache is the app shell only: 35 files, about 0.5 MB (0.17 MB gzipped), down from 47 files, 3.1 MB (0.6 MB gzipped). The sitemap, robots.txt and the duty index (it lists dates, so it changes every day) are left out too.

**Updates.** Nothing that depends on the data or on the date is in the shell pages: the age of the data is read from `meta.json` at runtime (and remembered in `localStorage` for the first paint of the stale banner, `public/stale-check.js`), and the no-JavaScript link on the home page goes to the list of dates. A data update therefore does not change the worker. When a new version does ship, the worker downloads only the files whose content hash changed (it keeps the others from the previous cache), takes over at once, and a page that is on screen shows a "reload" button instead of reloading by itself; a hidden page reloads on its own unless a form has unsent input.

Strategies: pages network-first with a 4 s timeout then the precached copy; `/data/**` network-first (cache fallback, 404s not cached); `tiles.openfreemap.org` cache-first, capped at 500 entries; everything else, including `/api/`, goes to the network untouched. After load, while online, the page fetches meta, pharmacies, the extended-hours files and the duty lists for yesterday (the overnight list), today and the next three days (Europe/Athens), only for the days `meta.json` says are published, so they are in the cache.

The worker is not registered in `astro dev`; use `build` and `preview` to try it.

## Problem reports (`api/report.ts`)

- The message, and any pharmacy text that is not a registry id (`^(\d{10}|x-[0-9a-f]{10})$`), go into a fenced code block whose fence is longer than any run of backticks in the text, so a public issue cannot get links, images, HTML, @mentions or `owner/repo#1` references. Only a valid id reaches the title.
- The content type must be `application/json`, optionally with a charset. Other sites are refused with `Sec-Fetch-Site`.
- **Rate limit.** The function keeps a best-effort limit in memory: 5 reports per 10 minutes for each first `X-Forwarded-For` address, answered with 429. Each function instance has its own counter, so this only slows down a careless loop. **The owner should add a Vercel Firewall rate-limit rule for `/api/report`** (Project, Firewall, Custom Rules, "Rate Limit").
- **Trailing slash.** `vercel.json` has `trailingSlash: true`, which can redirect `/api/report` to `/api/report/`. The form therefore posts to `/api/report/` (`REPORT_ENDPOINT` in `src/lib/report.ts`) and `vercel.json` rewrites that to the function. Check on the first deploy that a test report arrives (step 5 above); if Vercel serves the function only at the slash-less path, delete the rewrite and set `REPORT_ENDPOINT` to `/api/report`.
