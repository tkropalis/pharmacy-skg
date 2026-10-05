# CLAUDE.md

This is a free, ad-free PWA that shows which pharmacies are open in the Thessaloniki regional unit, including on-duty (εφημερεύοντα) and overnight (διανυκτερεύοντα) ones.

Before changing behaviour, read [docs/decisions.md](docs/decisions.md). For sources and the opening-hours rules, see [docs/research.md](docs/research.md); for milestones, [docs/roadmap.md](docs/roadmap.md).

## Commands

```sh
pnpm install
pnpm dev            # Astro dev server (apps/web)
pnpm check          # format:check, lint, typecheck, test, build — what CI runs
pnpm format         # Prettier --write
pnpm test           # Vitest (colocated *.test.ts)
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

## Rules

- **Vercel:** don't use the Vercel connector or MCP. The owner manages the Vercel project.
- **Public repo:** never commit secrets or personal data.
- **Duty dates:** publish only officially published dates. A reconstructed rotation stays internal (decision D11).
- **Neutrality:** no ads, rankings, promotions or medical claims. Always show the data source and how fresh the data is.
- **Privacy:** the user's location and medicine searches never leave the device.
- **Workflow:** every milestone lands as a pull request (decision D18).

## Environment notes

- **Network access:** to scrape from a cloud session, these hosts must be allowed:
  - `www.thess.guide` (ΦΣΘ PDFs, decision D20), `www.pkm.gov.gr`, `nominatim.openstreetmap.org`
  - `www.moh.gov.gr` (price bulletins) and `www.eof.gr` (shortage list), decision D24
  - `tiles.openfreemap.org`; for Overture refreshes, `overturemaps-us-west-2.s3.amazonaws.com`
  - `fsth.gr` and its subdomains answer automated clients with a Cloudflare challenge. Don't try to get past it.
  - `overpass-api.de` drops connections from cloud containers; the `overpass.kumi.systems` mirror works.
- **Proxy:** in a cloud session, run Node scripts that fetch with `NODE_USE_ENV_PROXY=1` so `fetch` uses the HTTPS proxy. CI doesn't need it.
- **Data pipeline:** `pnpm --filter @pharmacy-skg/ingest run update` (with `run`: plain `pnpm update` is pnpm's own command) fetches, validates and writes `data/<city>/`. Add `--since YYYY-MM-DD` to backfill. `pnpm --filter @pharmacy-skg/ingest run medicines` does the same for `data/medicines/` (add `--force` to rebuild when no bulletin changed). Never hand-edit generated files in `data/`; manual fixes go in `data/<city>/overrides.json`.
- **Build scripts:** pnpm 10 blocks dependency build scripts. The allowed ones are listed under `onlyBuiltDependencies` in `pnpm-workspace.yaml`.
- **`astro check` prompting to install `@astrojs/check`:** it is already installed, so a transitive dependency is missing from `node_modules`. Reinstall from scratch: delete every `node_modules` and run `pnpm install`.
