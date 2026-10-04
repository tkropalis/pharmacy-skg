# Decisions

Agreed during the planning rounds on 4 Oct 2026. To change a decision, edit this file in the same PR that changes the behaviour.

## Product

| #   | Topic                 | Decision                                                                                                                                            | Why                                                                                                                     |
| --- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| D1  | Goal                  | A free, ad-free public app that becomes the default way to find an open pharmacy in Thessaloniki.                                                   | Trust and speed matter more than revenue.                                                                               |
| D2  | ΦΣΘ                   | Build on ΦΣΘ's public duty lists, with attribution. Contact them by email once a working beta exists; Claude drafts the email and a one-page brief. | Their permission or an official feed removes the biggest risk, and a working demo persuades better than a pitch.        |
| D3  | Platform              | An installable web app (PWA) first. A native wrapper only if it gets traction.                                                                      | Shareable links, search-engine traffic and the fastest path to launch.                                                  |
| D4  | What counts as "open" | Every pharmacy at any hour: regular hours, summer hours, extended hours, every duty type and holidays.                                              | That is the question people actually ask. Competitors only list duty pharmacies.                                        |
| D5  | Geography             | The whole Thessaloniki regional unit. Data and URLs carry a city key so other cities can be added later.                                            | Same PDFs, little extra work. Larissa reportedly runs the same system as ΦΣΘ.                                           |
| D6  | Prices                | In v1.1, medicine lookup: official prescription price, a co-payment estimate and a shortage warning. The search runs on the device.                 | Prescription prices are the same everywhere, non-prescription prices are only indicative, and stock data is not public. |
| D7  | Languages             | Greek (default) and English, built so more languages can be added.                                                                                  | Locals, students and visitors.                                                                                          |
| D8  | Home screen           | A map, with a bottom sheet listing the nearest open pharmacies. Each row has call and directions buttons.                                           | A familiar pattern that works one-handed.                                                                               |
| D9  | Hospitals             | On-duty hospitals are out of scope.                                                                                                                 | Focus.                                                                                                                  |
| D10 | Favourites            | Saved on the device, no accounts. Show each favourite's officially published next duty dates, with add-to-calendar. No push notifications.          | Useful without a backend.                                                                                               |
| D11 | Duty forecasts        | Show only officially published duty dates. The rotation may be reconstructed internally, but forecasts are published only if ΦΣΘ agrees.            | We should not antagonise the people we want a data feed from.                                                           |

## Engineering

| #   | Topic           | Decision                                                                                                                                                                                         |
| --- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D12 | Architecture    | Static first. A TypeScript monorepo; Astro pages with React components for the map; a scheduled GitHub Actions scraper that commits validated JSON. Supabase only once users need to write data. |
| D13 | UI library      | React.                                                                                                                                                                                           |
| D14 | Hosting         | Vercel. The owner creates and manages the project; do not use the Vercel connector.                                                                                                              |
| D15 | Repository      | Public, MIT licence.                                                                                                                                                                             |
| D16 | Analytics       | Cookieless aggregate counts only (e.g. Vercel Web Analytics).                                                                                                                                    |
| D17 | Problem reports | An in-app form sends the report through a serverless function into a GitHub issue. The form warns against including personal information, because the issues are public.                         |
| D18 | Workflow        | The initial scaffold went straight to `master`. Every later milestone lands as a pull request with a Vercel preview.                                                                             |
| D19 | Timeline        | Soft target: a public beta before 26 Oct 2026 (Αγίου Δημητρίου, a local holiday). The date moves if the data isn't trustworthy yet.                                                              |

## Defaults

These were chosen without a formal decision and apply until someone objects.

- **Status labels:** a pharmacy from the ΦΣΘ duty list shows "On duty (ΦΣΘ list)". One that is open only by its regular hours shows "Open (regular hours)", because we can't know about individual closures. Status is never shown by colour alone.
- **Stale data:** if the newest data is older than 36 hours, show a warning banner. Never hide the data silently.
- **Privacy:** the user's location and medicine searches never leave the device. Distances are computed on the device.
- **Look:** light/dark follows the system setting, with a pharmacy-green accent. Accessibility target: WCAG 2.2 AA.
- **Legal:** a disclaimer ("call before you go; not medical advice"), a privacy page, and credits for every data source.
- **Name:** "pharmacy-skg" is a working title. The public name and domain are chosen before launch.
- **Map:** MapLibre GL JS with OpenFreeMap tiles and Greek labels.
- **Directions:** deep links into Google Maps, Apple Maps or Waze, plus a call link. No routing API.
- **Geocoding:** once per address, with Nominatim. Results are stored with their source and a confidence level, and manual corrections live in the repo. Google geocoding is not used, because of its terms.
- **Tooling:**
  - pnpm workspaces; Vitest; ESLint 10 and Prettier; Playwright later.
  - Strict TypeScript 6. Version 7 is not yet supported by typescript-eslint or `astro check`.
  - Node 22, running `.ts` files natively.
