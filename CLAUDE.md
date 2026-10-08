# CLAUDE.md

This is a free, ad-free PWA that shows which pharmacies are open in Greece, area by area (Thessaloniki, Attica and the areas on ITeQ's duty platform so far, decision D26), including on-duty (εφημερεύοντα) and overnight (διανυκτερεύοντα) ones.

Before changing behaviour, read [docs/decisions.md](docs/decisions.md). Before any UI or copy change, also read [docs/PRODUCT.md](docs/PRODUCT.md) (who it is for, the principles) and [docs/DESIGN.md](docs/DESIGN.md) (the design system, banned patterns, the review checklist and how to verify). For sources and the opening-hours rules, see [docs/research.md](docs/research.md); for milestones, [docs/roadmap.md](docs/roadmap.md).

## Commands

```sh
pnpm install
pnpm dev            # Astro dev server (apps/web); see "Environment notes" if the islands fail
pnpm check          # format:check, lint, typecheck, test, build: what CI runs
pnpm format         # Prettier --write
pnpm test           # Vitest (colocated *.test.ts), from the repository root
pnpm e2e            # build with a fixed date, then the Playwright tests (apps/web/README.md)
pnpm --filter @pharmacy-skg/web build && pnpm --filter @pharmacy-skg/web preview   # look at the real build
```

## Conventions

- **Modules:** strict TypeScript, ESM only. Internal packages export their TypeScript source (`exports` points to `src/index.ts`) and have no build step.
- **Imports:** import relative files with the `.ts` extension. Node runs them natively by stripping types, so only erasable syntax is allowed: no enums, namespaces or parameter properties.
- **TypeScript version:** stay on 6.x until typescript-eslint and `astro check` support 7.
- **Formatting:** Prettier (single quotes, width 100) and the ESLint flat config.
- **Tests:** parsers must be tested against real fixture files.
- **Copy:** every piece of UI text exists in Greek (the default locale) and English.
- **Astro whitespace:** Astro 7 treats whitespace like JSX. A line break between text and an inline element is dropped rather than rendered as a space, so write `{' '}` where a space is intended.
- **Time:** always compute times in the city's IANA time zone (`Europe/Athens`), never the device's.

## Working on the UI

The owner reviews the app on an iPhone; every change is judged on a phone first.

- **The docs are the design brief.** [docs/PRODUCT.md](docs/PRODUCT.md), [docs/DESIGN.md](docs/DESIGN.md) and the "Plain words" copy rules in [docs/decisions.md](docs/decisions.md) are the source of truth. Design and writing plugins (Impeccable, marketing or copy-editing skills) are optional and are usually missing in remote sessions; nothing depends on them. When one is available, use it, but its output must follow these files: the repository wins.
- **Reuse the system.** Colours are tokens defined for both looks (light and dark); sizes are rem; motion uses the `--ease-*` and `--dur-*` tokens and stops under reduced motion; either/or choices use `Segmented`; lists are plain rows, not cards. Add a token or component only with a reason a person would notice.
- **Copy:** Greek first, English complete, as few words as possible, one word for one thing (the canonical terms are in decisions.md). No em dashes, exclamation marks, abbreviations or parentheses in labels; no explanations of sources or how the app works outside the about and privacy pages.
- **Never ship a banned pattern** (DESIGN.md, Banned patterns): side stripes, gradient text, glass, eyebrows, tinted icon tiles, identical card grids, pills on things you cannot tap, hard-coded colours, targets under 44px.
- **Accessibility:** WCAG 2.2 AA, 44px targets, visible focus, accessible names that start with the visible text ("Κλήση: {name}"), status never by colour alone, changes announced through the live region.
- **Verify before the pull request:** build and preview, then look at 393×852, 375×667 and 1280×800, light and dark, Greek and English, by day and at night (DESIGN.md, Verifying). Run the review checklist in DESIGN.md (three people, the questions, a copy pass, the banned-pattern checks).
- **Same pull request:** update DESIGN.md and decisions.md when the system or a behaviour changes, and the unit and browser tests that rely on a changed class, label or flow.

## Rules

- **Vercel:** don't use the Vercel connector or MCP. The owner manages the Vercel project.
- **Public repo:** never commit secrets or personal data.
- **Duty dates:** publish only officially published dates. A reconstructed rotation stays internal (decision D11).
- **Neutrality:** no ads, rankings, promotions or medical claims. Always show how fresh the data is; credit every source on the about page.
- **Minimal UI:** keep on-screen copy as short as possible (the owner, 5 Oct 2026): no explanations of sources, privacy or how the app works outside the about and privacy pages.
- **Privacy:** the user's location and medicine searches never leave the device.
- **Workflow:** every milestone lands as a pull request (decision D18). When a branch builds on one that is not merged yet, base the pull request on that branch and say so in the description.
- **Commits and pull requests:** no Claude Code attribution: no `Co-Authored-By` trailer and no "Generated with Claude Code" line (the owner, 5 Oct 2026). Subjects follow the history: an area prefix (`web:`, `ingest:`, `data:`, `docs:`), lowercase after it, clauses joined with semicolons; a plain body that says what changed and why.

## Environment notes

- **Network access:** to scrape from a cloud session, these hosts must be allowed:
  - `www.thess.guide` (ΦΣΘ PDFs, decision D20), `www.pkm.gov.gr`, `nominatim.openstreetmap.org`
  - `*.efhmeries.gr` (ITeQ's duty sites, one per area, all on one server: the pipeline asks one page a second)
  - `fsa-efimeries.gr` (Attica's duty site, also ITeQ's: about eight requests a run, every offered date once a week, one a second) and `fsa.gr` (its extended-hours tables), decision D27
  - `www.moh.gov.gr` (price bulletins) and `www.eof.gr` (shortage list), decision D24
  - `tiles.openfreemap.org`; for Overture refreshes, `overturemaps-us-west-2.s3.amazonaws.com`
  - `fsth.gr` and its subdomains answer automated clients with a Cloudflare challenge. Don't try to get past it.
  - `overpass-api.de` drops connections from cloud containers; the `overpass.kumi.systems` mirror works.
- **Proxy:** in a cloud session, run Node scripts that fetch with `NODE_USE_ENV_PROXY=1` so `fetch` uses the HTTPS proxy. CI doesn't need it.
- **Data pipeline:** `pnpm --filter @pharmacy-skg/ingest run update` (with `run`: plain `pnpm update` is pnpm's own command) fetches, validates and writes `data/<city>/`. Add `--since YYYY-MM-DD` to backfill. `pnpm --filter @pharmacy-skg/ingest run medicines` does the same for `data/medicines/` (add `--force` to rebuild when no bulletin changed). Never hand-edit generated files in `data/`; manual fixes go in `data/<city>/overrides.json`.
- **Build scripts:** pnpm 10 blocks dependency build scripts. The allowed ones are listed under `onlyBuiltDependencies` in `pnpm-workspace.yaml`.
- **pnpm through corepack fails** with "Cannot find matching keyid" on some machines (an outdated corepack): run `npx -y pnpm@10.28.0 <command>` instead. Playwright's web server and `e2e/run.ts` call `pnpm` themselves, so put a two-line `pnpm` script that runs `npx -y pnpm@10.28.0 "$@"` first on `PATH` for `pnpm e2e`.
- **Node 22.12 to 22.17:** scripts that run `.ts` files directly (`e2e/run.ts`, `scripts/generate-icons.ts`) need `NODE_OPTIONS=--experimental-strip-types`; Node 22.18 and later strip types by default.
- **Browser tests:** without a Playwright browser, set `PW_CHROMIUM_PATH` to any Chromium or Chrome, or install one as CI does (`pnpm --filter @pharmacy-skg/web exec playwright install --with-deps chromium`). The full run takes about 15 minutes; pass a spec file to run part of it.
- **`astro dev`** has failed to mount the React islands (a "preamble" error). Check UI changes on `build` and `preview` instead; the service worker only runs there anyway.
- **Vitest from `apps/web`** also collects the Playwright specs and reports them as failed files; run `pnpm test` from the repository root.
- **`astro check` prompting to install `@astrojs/check`:** it is already installed, so a transitive dependency is missing from `node_modules`. Reinstall from scratch: delete every `node_modules` and run `pnpm install`.
