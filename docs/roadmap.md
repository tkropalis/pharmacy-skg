# Roadmap

Each milestone after M0 lands as a pull request (decision D18).

## M0: Scaffold ✅

pnpm monorepo, TypeScript, lint/format/test tooling, CI, a placeholder page, and these docs.

## M1: Data pipeline

Decisions D20–D22 adjust this milestone: duty PDFs come via thess.guide, hours come from each heading, and coordinates come from Overture and Nominatim.

- **Fixtures:** capture real source files to test against:
  - ΦΣΘ PDFs for a weekday, a Saturday, a Sunday and a holiday, covering every area group;
  - the Region's (ΠΚΜ) extended-hours list.
- **Verify** the shift model and the hours in [research.md](research.md) against those fixtures, and correct the notes.
- **`packages/ingest`:**
  - download and parse the ΦΣΘ PDFs into typed duty records;
  - parse the extended-hours list;
  - normalise names, addresses and phone numbers.
- **Registry:**
  - collect pharmacies from the duty lists, OpenStreetMap and Overture;
  - geocode new addresses once, with Nominatim, and cache the results;
  - keep a manual overrides file;
  - reconstruct the rotation internally only (decision D11).
- **`data/`:** a layout plus a JSON schema and validation. Counts must fall in expected ranges, and every on-duty pharmacy must have a location.
- **Scheduled workflow:** runs twice a day on Europe/Athens time and commits data only when it changed and validation passes.

**Done when** a week of scheduled runs matches the official ΦΣΘ lists.

## M2: "Open now" logic (in review)

Pure TypeScript in `packages/core`, specified by decision D23.

- **Covers:**
  - regular hours (a data table; the summer schedule is not applied until one is verified);
  - extended hours;
  - every duty type, including after midnight;
  - national holidays, including those that move with Orthodox Easter, plus local holidays;
  - daylight-saving changes.
- **Answers:**
  - is pharmacy X open at time T, and until when;
  - when does it next open;
  - which pharmacies are open now, sorted by distance.
- **Tests:** table-driven, covering midnight crossings, the DST switch and holidays that fall on weekends, plus the real data under `data/thessaloniki`.

**Done:**

- Modules: `zoned.ts` (Intl-only time-zone maths), `holidays.ts`, `regular-hours.ts`, `open.ts` (`openIntervals`, `pharmacyStatus`, `openPharmacies`, `publishedDuties`, `coverage`, `distanceMetres`).
- `packages/ingest/src/core-contract.test.ts` keeps the zod schemas assignable to the core types.
- `openPharmacies` over the 1,028 pharmacies in `data/` takes about 10–20 ms.
- Not done: the 1 May transfer rule, and any summer schedule.
- **Before 1 Jul 2027:** verify and add the 2027 summer schedule (`regular-hours.ts`). The July 2026 duty lists show it (see [research.md](research.md), section 2).

## M3: The app (in review)

- **Structure:**
  - Greek routes by default, English under `/en`;
  - a PWA manifest and service worker, with the next 3 days available offline.
- **Map:** MapLibre with OpenFreeMap tiles and Greek labels. Pins are styled by status (never by colour alone), with a bottom-sheet list.
- **Location:** read on the device, with an area picker as fallback. A date/time picker lets people look ahead.
- **Pharmacy rows:**
  - a status label and countdown;
  - call, directions (Google, Apple, Waze) and share buttons;
  - a favourite toggle.
- **Favourites:** officially published next duty dates, with calendar (`.ics`) export.
- **Problem reports:** the form → serverless function → GitHub issue.
- **Trust and legal:**
  - a "last updated" line and a stale-data banner;
  - a disclaimer, a privacy page and source credits;
  - an emergency strip (166, 112, Poison Centre).
- **Search engines:** pages per area and day, and per pharmacy, plus a sitemap.
- **Quality:** Playwright smoke tests, plus Lighthouse and accessibility passes.
  - Done: `apps/web/e2e` (Chromium, 390×844 phone and 1280×800 desktop, fixed clock, tile server stubbed) covers the home screen in both languages, the area picker, the pharmacy, duty-date and area pages (lang, canonical, hreflang), the report form (success, 503 fallback), offline reload with the map, touch targets and focus, and axe (WCAG 2.2 A/AA) on seven pages × two languages × two colour schemes. `pnpm e2e` builds with `PHARMACY_TODAY` and runs; CI has a separate `e2e` job.
  - Done: Lighthouse on the built home, a pharmacy page and a duty page (mobile): 90 or more for accessibility, best practices and SEO; the home screen's performance is 93 to 100 after the map was made to wait for a settled page (see apps/web/README.md).
  - Open for M4: test on real devices; a Vercel Firewall rate-limit rule for `/api/report`; a check that `POST /api/report/` reaches the function on Vercel.

## M4: Beta launch

The owner's steps are in [beta-checklist.md](beta-checklist.md). The one-page brief for ΦΣΘ is in [outreach/fsth-brief.md](outreach/fsth-brief.md).

- Test on real devices (iOS Safari, Android Chrome) and fix what's found.
- **Owner:**
  - create the Vercel project;
  - add the environment variables;
  - turn on Web Analytics;
  - choose a name and domain.
- Send the ΦΣΘ email with the one-page brief (decision D2).
- Public beta before 26 Oct 2026, if the data is trustworthy (decision D19).

## v1.1

- **Medicine lookup:**
  - merge the ministry's price bulletins by barcode;
  - estimate the patient's co-payment;
  - flag ΕΟΦ shortages and export bans;
  - run the search on the device.
- **Duty forecasts,** only if ΦΣΘ agrees (decision D11).

## Later

- A dashboard for pharmacies, including "ask nearby pharmacies whether they have X".
- More cities.
- A native wrapper and push notifications.
