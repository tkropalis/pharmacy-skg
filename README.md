# pharmacy-skg

Ανοιχτά φαρμακεία στη Θεσσαλονίκη, σε χάρτη. · Open pharmacies in Thessaloniki, on a map.

A free, ad-free web app you can install on your phone. It answers "which pharmacy is open near me right now?" across the Thessaloniki regional unit, covering on-duty (εφημερεύοντα) and overnight (διανυκτερεύοντα) pharmacies as well as those open during regular hours.

**Status:** early development. The [roadmap](docs/roadmap.md) lists the milestones.

## Repository layout

```
apps/web        Astro site
packages/core   Shared domain code (cities; later the "open now" logic)
docs/           Research notes, decisions, roadmap
```

## Development

Requires Node 22.12 or newer and pnpm 10.

```sh
pnpm install
pnpm dev     # http://localhost:4321
pnpm check   # format, lint, typecheck, test, build (the same steps as CI)
```

## Deploying on Vercel

Create a Vercel project from this repository with these settings:

- **Root Directory:** `apps/web`. Keep "Include files outside the root directory" enabled, because the app imports `packages/*`.
- **Framework preset:** Astro (detected automatically).
- **Node.js version:** 22.x.

## Documentation

- [Research notes](docs/research.md): data sources, opening-hours rules, prices, competitors, technical options.
- [Decisions](docs/decisions.md): what we decided, and why.
- [Roadmap](docs/roadmap.md): milestones.

## Data and disclaimer

Planned sources:

- On-duty lists from the Pharmaceutical Association of Thessaloniki (ΦΣΘ).
- The extended-hours list from the Region of Central Macedonia (ΠΚΜ).
- Map data from © OpenStreetMap contributors, OpenFreeMap and Overture Maps.

Opening information can change at short notice, so always call before you go. This project does not give medical advice.

## License

The code is released under the [MIT License](LICENSE). The data belongs to its respective sources.
