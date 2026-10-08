# Research: the whole of Greece

Collected on 6 Oct 2026, before any code. It covers four questions:

1. What in the code assumes Thessaloniki.
2. Where duty lists come from in the rest of Greece.
3. How opening hours differ by region.
4. How the map and the data scale from about 1,000 pharmacies to about 10,500.

Tags as in [research.md](research.md): **[verified]** was fetched, measured or read in the source; **[search]** comes from search snippets; **[inferred]** is our own reasoning.

## Summary

- **Duty lists are more reachable than expected.**
  - One vendor, ITeQ A.E., runs the official duty sites of about 33 pharmacists' associations: `fsa-efimeries.gr` for Attica, and one shared platform, `<area>.efhmeries.gr`, for the others.
  - Together that is about 72% of the population.
  - The pages are server-rendered with no bot challenge, include coordinates, and look 7 days ahead (Attica about 200).
  - ITeQ also runs an "Efimeries API" that needs registration. **Asking ITeQ and the associations for access is the cleanest route to national coverage**, the same approach as D2.
- **Opening hours are the hard part.**
  - There is no national table. Each Region sets the hours for each regional unit (ΠΕ), often per municipality or community, and sometimes per pharmacy.
  - Seasons change on different dates, and decisions are amended during the year.
  - Almost all of them are on Diavgeia, which has an open API, but as PDFs that have to be read and turned into rules by hand.
  - For many areas no current decision was found at all.
  - Showing "Ανοιχτό" (D4) everywhere therefore depends on hand-curated rules for each area. Showing who is on duty does not.
- **The map scales without vector tiles.** 11,000 points are well within what a GeoJSON source can handle. What does not scale is how the app uses it today:
  - it loads every pharmacy up front;
  - it recomputes every status each minute on the main thread;
  - it calls `setData` on three sources on every change;
  - it builds one static page per pharmacy, with the CSS inlined.
- **Recommended shape:**
  - a small national index;
  - one data shard per duty authority (association);
  - a national file of each day's duty pharmacies for the zoomed-out view;
  - status computed only for the shards loaded;
  - incremental map updates (`updateData`, `promoteId`, feature-state).

## 1. What assumes Thessaloniki today

Code audit, 6 Oct 2026 [verified].

- **The city abstraction is only partial.**
  - `packages/core/src/city.ts` defines a `City` and `CITIES = [THESSALONIKI]`.
  - Data URLs (`lib/data.ts` `cityDataUrl`) and ingest paths (`store.ts` `cityPaths`) already take a city id.
  - The id is still hard-coded in more than 10 places:
    - `config.ts` `DEFAULT_CITY_ID` and `APP_NAME`;
    - `lib/meta.ts` and `lib/seo/site-data.ts`, which import and glob `data/thessaloniki/` literally;
    - the service worker's single `__CITY_ID__`;
    - `integrations/data.ts` `CITY_IDS`;
    - `cli/update.ts`.
- **Page URLs have no city segment** (`/farmakeio/<id>/`, `/perioxi/<slug>/`, `/efimeries/<date>/`), although D5 says they would.
  - Pharmacy ids (phone numbers) are unique across the country.
  - Locality names and slugs are not: the remembered area and the area picker match by name.
  - Group ids are not either: `DEFAULT_GROUP_ID = 'metro'` is a global constant.
- **Geography:**
  - the map starts at `THESSALONIKI.center`, zoom 12, with `minZoom: 8` and no `maxBounds`;
  - `public/theme.js` takes the sun's height at a fixed point in Thessaloniki;
  - the "far away" check (40 km from the centre) has its copy "Είστε μακριά από τη Θεσσαλονίκη";
  - the row hides the locality when it is "Θεσσαλονίκη";
  - `format.ts` formats phones by assuming the area code is 231 or five digits, which splits Athens numbers (21x) wrongly.
- **Rules:**
  - `regular-hours.ts` and `holidays.ts` (`LOCAL`) are keyed by city id. A city with no entry gets no regular hours.
  - The "αργίες" heading match follows how ΦΣΘ prints its PDFs.
  - `open.ts` itself is generic over `CityData` and assumes a 08:00–08:00 duty day, which does not hold everywhere: Ioannina's night duty starts at 18:00.
- **Ingest:** built for one association.
  - The parts specific to Thessaloniki:
    - the thess.guide source;
    - the ΦΣΘ PDF parser and its 10 fixed `AREA_GROUPS`;
    - the ΠΚΜ title filter;
    - two bounding boxes (Overture, Nominatim);
    - validation ranges tuned to the metro group, with `PHARMACY_RANGE` at most 3,000;
    - the `SOURCES` metadata.
  - Generic parts: the store, the schema, registry matching, the geocoder, the PDF and XLSX helpers, and medicines (already national).
  - Duty files are never pruned (107 files, 3.3 MB).
- **Copy:**
  - `APP_NAME` ("Ανοιχτά Φαρμακεία Θεσσαλονίκης");
  - the home and about descriptions;
  - the credits;
  - the `.ics` source;
  - the duty and area page descriptions, in `el.ts`, `en.ts`, `app.el.ts` and `app.en.ts`.

## 2. Where duty lists come from

### The ITeQ platform (about 72% of the population)

Fetched 6 Oct 2026; every tenant answered 200 from IIS, with no challenge and no robots.txt [verified].

- **`fsa-efimeries.gr`** (Attica, run by ΦΣΑ):
  - `POST /Home/FilteredHomeResults` (`Date`, `IsOpen`) returns an HTML fragment of cards with the name, address, hours, phone and coordinates, in the Google Maps link.
  - About 75–80 cards a day.
  - Dates are published about 200 days ahead.
  - There is no JSON API (`/swagger` and `/api` return 404).
  - Read since 8 Oct 2026 (`cities/attiki.ts`): no token or cookie is needed; each card's maps link has its coordinates; the hours are written as on the shared platform ("8 ΠΡΩΙ - 11 ΒΡΑΔΥ"), and a pharmacy with a day and a night shift has a card for each. 201 dates on offer on 8 Oct 2026.
- **`<area>.efhmeries.gr`**, one ASP.NET Core code base:
  - `POST /tomeas` (`date`, `tomeas` for the sector, an antiforgery token and cookie, ordinary form protection) returns the day's list.
  - `/Home/Details/{id}` has `_lat`/`_lng`.
  - `/Home/Prints` produces daily and weekly PDFs.
  - The date picker reaches 7 days ahead.
- **Tenants with data:**
  - Piraeus (with the islands);
  - Crete: Heraklion, Chania, Lasithi;
  - Thessaly: Larissa (with sectors), Magnesia, Trikala, Karditsa;
  - Epirus: Ioannina;
  - Northern Greece: Kozani (Kozani and Ptolemaida), Kavala, Evros, Drama, Xanthi, Pella, Imathia, Pieria;
  - Dodecanese;
  - Central Greece: Fthiotida, Evia;
  - Peloponnese: Messinia, Korinthia, Argolida, Arkadia, Lakonia;
  - Samos.
- **Thin tenants:** Arta, Preveza, Thesprotia, Zakynthos and Cyclades show 1–3 entries a day, probably only the main town.
- **Empty tenants:** **Thessaloniki** (`thessaloniki.efhmeries.gr`), Rethymno, Rodopi and Kefalonia. The empty Thessaloniki tenant suggests ΦΣΘ may move there.
- **API:** `superadmin.efhmeries.gr/ApiUsers` offers "access to the API endpoints with a simple registration". Its terms, licence and limits are visible only after registering, which we did not do.
- **Companion app:** ITeQ also publishes a national app, iFarmakeia (`com.iteq.ifarmakeia_duties`) [search].

### Other sources

| Area                                                                                                                      | Source                                      | Format                                                                                     | Notes                                                            |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Thessaloniki                                                                                                              | fsth.gr, read through thess.guide           | daily PDF                                                                                  | as today (D20)                                                   |
| Achaia (Patra and nearby towns)                                                                                           | efimeria.gr (Silktech), linked from fsax.gr | HTML per town, today only                                                                  | Cloudflare in front, but no challenge [verified]                 |
| Serres                                                                                                                    | fsserron.gr                                 | weekly PDFs on WordPress                                                                   | [verified]                                                       |
| Kilkis                                                                                                                    | fskilkis.gr                                 | monthly HTML tables per town                                                               | [verified]                                                       |
| Dodecanese                                                                                                                | fs12.gr                                     | weekly tables per island, plus .xlsx                                                       | alongside the ITeQ tenant [verified]                             |
| Cyclades                                                                                                                  | fscyclades.gr                               | WordPress form (admin-ajax)                                                                | the ITeQ tenant is thin [verified]                               |
| Rethymno                                                                                                                  | fskriti.gr                                  | weekly JPG scan                                                                            | would need OCR [verified]                                        |
| Ilia, Thiva, Arkadia                                                                                                      | Diavgeia                                    | the Region's approval of the year's duty table, as a full day-by-day PDF with a text layer | official and open; changes come as amending decisions [verified] |
| Corfu, Aitoloakarnania, Chalkidiki, Lesvos, Rodopi, Kefalonia, Chios, Lefkada, Florina, Kastoria, Grevena, Fokida, Lemnos | none found online                           | n/a                                                                                        | about 9% of the population [verified/search]                     |

- **National sources:**
  - ΠΦΣ (pfs.gr) has no duty locator and no registry.
  - Data.gov.gr, ΕΟΠΥΥ and ΗΔΙΚΑ have no open national registry or duty feed.
  - Law 5243/2025 art. 71 only covers exemptions from duty.
  - The national 1566 line was announced (June 2025) to add duty pharmacies later; there is no sign it has [verified/search].
- **Aggregators:** farmakeia.gr says its data comes "from the associations"; it is behind Cloudflare and has its own terms. Also pharmafinder.app, greece.ondutypharmacy.com and efimeries-online.gr (ΣΥΦΑ Θεσσαλονίκης). None is a source we would use.
- **Open-source scrapers:**
  - `antoniskoin/pharos-api` (Athens, Crete, Patra);
  - `Zennoname/Thesis` (fsa-efimeries and the efhmeries tenants);
  - `DsTyM/PharmaciesOnDutyAttica`.
  - Useful to read, not to depend on.

### Coverage by kind of source [inferred]

| Kind                                                                                    | Share of population |
| --------------------------------------------------------------------------------------- | ------------------- |
| Openly licensed, machine-readable                                                       | 0%                  |
| Structured HTML with coordinates (ITeQ)                                                 | about 72%           |
| PDF or HTML we can parse (Thessaloniki, Achaia, Serres, Kilkis, Diavgeia annual tables) | about 18%           |
| Images only (Rethymno)                                                                  | about 1%            |
| Nothing online                                                                          | about 9%            |

## 3. Opening hours by region

### Legal frame [verified]

- Law 1963/1991 art. 9, as replaced by 4512/2018 art. 257: the **Περιφερειάρχης** sets the hours, after the **association's agreement**. The minimum is 40 hours a week, Monday to Friday, within 08:00–21:00.
- Extended hours:
  - each pharmacy declares them every two months (4558/2018 art. 5);
  - the association compiles the tables;
  - weekdays until 21:00 at the latest, Saturday until 20:00, no Sundays.
- Law 4613/2019 art. 26 closes pharmacies, except those on duty, on:
  - the national holidays;
  - **each town's patron-saint day**;
  - **each town's liberation day**.
- No 2025–26 national change was found. Law 5243/2025 art. 71 is only about exemptions from duty.

### What varies

Read in about 40 Diavgeia decisions [verified].

- **Base pattern:** Mon/Wed mornings, Tue/Thu/Fri split shifts. Many variants:
  - the afternoons fall on the mirrored days (Karditsa, Grevena);
  - a straight 08:00–16:00 all year (Pyrgos) or in summer (Pella, Kastoria, Imathia, Patra in August);
  - Saturday mornings (Patra, Arkadia).
- **Seasons:**
  - summer afternoons usually start 30 minutes later;
  - the changeover dates differ: 1 Apr, 30 Apr, 1 May, 1 Jun, 1 Jul, 14 Sep, 1 Oct, 1 Nov;
  - Corfu publishes a new decision at each switch.
- **Islands in summer:** open every day.
  - Skiathos 09:00–14:00 and 17:00–24:00 from May to October.
  - Skopelos and Alonissos every day from 15/6 to 15/9.
  - Thasos every day from 1/5 to 30/9.
- **Hours set per pharmacy:** Zakynthos, and Rethymno's tourist villages.
- **Duty shape:**
  - Ioannina's night duty starts at 18:00;
  - Chania's evening duty runs until 22:00 or 23:00 by season;
  - 24 and 31 Dec run 08:00–16:00 straight in Thessaloniki and Imathia.
- **Validity:** usually the calendar year; Attica runs 13 May to 12 May. Amendments are common: Rethymno 4 times in 2026.
- **Not found on Diavgeia:**
  - Larissa, Trikala, Serres, Chalkidiki, Pieria, Messinia, Xanthi, Rodopi;
  - the Heraklion and Chania decisions;
  - most of the North and South Aegean.

### Extended-hours lists

| Who                                              | Format                         | Notes                                                                        |
| ------------------------------------------------ | ------------------------------ | ---------------------------------------------------------------------------- |
| ΠΚΜ (Thessaloniki)                               | XLSX                           | ingested today                                                               |
| ΦΣΑ (Attica)                                     | 47-page PDF every two months   | the Greek font is broken (shifted glyphs), so it needs font remapping or OCR |
| Peloponnese Region                               | PDF                            | lists only the _extra_ hours                                                 |
| Western Macedonia, Evros, Ionian, Central Greece | Diavgeia PDFs every two months |                                                                              |

### Local holidays

- Each town's patron-saint and liberation days, by law.
- Decisions rarely print the date, so the dates have to be curated per town.
- **All of Attica and Piraeus use 14 Sep instead**, at ΦΣΑ's and ΦΣΠ's request (2025, 2026).
- Known so far:

| Place     | Date   | Holiday    | Tag        |
| --------- | ------ | ---------- | ---------- |
| Patra     | 30 Nov |            | [search]   |
| Kastoria  | 11 Nov | liberation |            |
| Grevena   | 13 Oct | liberation |            |
| Arkadia   | 22 May |            |            |
| Heraklion | 11 Nov |            | [inferred] |
| Larissa   | 15 May |            | [inferred] |
| Corfu     | 12 Dec |            | [inferred] |

### Map data has no usable hours

- OpenStreetMap has 5,675 `amenity=pharmacy` objects in Greece (about 55% of the real total); only 405 (7%) have `opening_hours` [verified].
- Overture places have no opening-hours field.
- About 10,000–10,500 pharmacies in all (PGEU's 97 per 100,000) [search/inferred].

## 4. Scaling the data and the map

Measured on the real Thessaloniki data on an Apple M3 and extrapolated to 11,000 [verified/inferred]. Phones are about 3× slower (a recent iPhone) to 6–10× slower (a mid-range Android).

### Payloads

| File                                                                        | Today (brotli) | At 11,000 (brotli)             |
| --------------------------------------------------------------------------- | -------------- | ------------------------------ |
| `pharmacies.json` as it is (indented, every field)                          | 53 KB          | ~570 KB (6.5 MB raw)           |
| Client fields only, minified                                                | 35 KB          | ~375 KB                        |
| Columnar (arrays, integer coordinates, dictionaries for locality and group) | 26 KB          | ~275 KB                        |
| Ids and coordinates only                                                    | 6 KB           | ~70 KB                         |
| One duty day, ids and hours                                                 | 0.5–3.8 KB     | ~5–40 KB for the whole country |
| Extended hours, without `scheduleText` and repeated names                   | 5 KB (from 20) | per area                       |

### Engine and map costs

| What                                                | 1,032 | 11,352 |
| --------------------------------------------------- | ----- | ------ |
| `openPharmacies` at 08:30                           | 8 ms  | 86 ms  |
| `openPharmacies` at 20:30                           | 3 ms  | 41 ms  |
| `pharmacyStatus` for every pharmacy ("show closed") |       | 313 ms |
| `setData` clone on the main thread                  | 2 ms  | 22 ms  |
| Supercluster `load`                                 | 9 ms  | 22 ms  |

On a phone, the 11,000 case means long main-thread tasks every minute.

### Recommended architecture

1. **Shard by duty authority.**
   - The association that publishes the list is the natural unit (about 50): duty lists, hours rules and freshness already belong to it.
   - A national `index.json` (about 5 KB) has, per area: names in both languages, bbox, centroid, count, published dates, update time and content hash.
   - Each `data/<area>/` keeps pharmacies (columnar, client fields only), duties and extended hours.
2. **A national duty file per day** (`duty/<date>.json`, about 25 KB) with coordinates and hours. It answers "who is on duty near me" across area borders, and drives the zoomed-out map without loading any shard.
3. **No vector tiles of pharmacies.**
   - The engine needs every attribute on the device, so tiles would ship the attributes twice.
   - Feature-state cannot drive `filter` or `icon-image`.
   - Range-request formats (PMTiles, FlatGeobuf) cannot go into the service worker's cache as they are (`Cache.put` rejects 206).
   - Tiles only pay off at 50,000–100,000+ points.
4. **Map:**
   - load each source once (`setData(url)` so the worker fetches and parses it);
   - `promoteId: 'id'`;
   - apply status changes with `updateData` and only the pharmacies that changed;
   - show the chosen pharmacy with feature-state in paint properties instead of removing it with `setData`;
   - source `maxzoom` 12–14 and `buffer` 32–64;
   - clustering only for regular-hours pins;
   - duty pins as a `circle` layer below about z9, icons above;
   - `minZoom` about 5 and `maxBounds` about `[18.5, 34.0, 30.5, 42.5]` (Corfu to Kastellorizo, Gavdos).
5. **Engine:**
   - compute status only for the loaded shards (home area plus those in view), which stays at today's 3–8 ms;
   - recompute at the next status boundary (the earliest opening, closing or "closing soon" time), not every minute;
   - a web worker only if more than about 3,000 pharmacies are ever computed at once.
6. **First view:**
   1. the remembered area or location (already stored, PR #17);
   2. then the device's location;
   3. then all of Greece showing only on-duty pharmacies.

   Germany (aponet), Portugal and Italy all start from a place, never from a national map of every pharmacy. No heatmap: it says nothing about where to go, and shows status by colour alone.

7. **Base map:** keep OpenFreeMap.
   - It covers the planet, has no limits and is free for commercial use. It has no SLA.
   - A self-hosted Protomaps extract of Greece would be about 250–500 MB [inferred], near Vercel's limits, with no offline benefit. Defer it.
   - Raise the tile cache from 500 to about 1,500 tiles (least recently used).
8. **Static pages:**
   - 22,000 pharmacy pages at today's 28.5 KB would be about 630 MB, near Vercel's 1 GB limit.
   - `build.inlineStylesheets: 'never'` brings a page to about 11 KB (about 240 MB in all).
   - Keep daily-changing content (upcoming duties) out of pharmacy pages, so data commits change only the date and area pages and deploys stay small.
   - Split the sitemap into an index with one sitemap per area.
   - Duty-date pages per area (about 1,100), or one national page per date.
9. **Offline:**
   - precache the shell, `index.json` and the points file;
   - keep warm the home area's shard and duty days, and the national duty files for the same days (about 125 KB);
   - other areas are cached only when visited, with at most about 3 kept (least recently used).

## 5. The registry (which pharmacies exist, and where)

[inferred, from the findings above]

- **Duty lists:** every pharmacy rotates through duty, so a few weeks of lists name nearly every one. ITeQ lists carry coordinates, so most of the country needs no geocoding.
- **Other sources:** the extended-hours lists and the Diavgeia annual tables add names and addresses.
- **Overture:** a national extract for matching by phone, under the same licence as today.
- **Nominatim:** only for what remains. At 1 request a second, and with cloud IPs rate-limited after about 100 requests, it has to run in small daily batches with a persistent cache.
- **D22 still holds:** no OSM data copied into `data/`.
- **Validation:** count ranges per area instead of the metro's.

## 6. Open questions for the owner

1. **Contact first, or build first?**
   - D2 was "build, then ask". At national scale, ITeQ's registration-only API and about 33 associations make an early, short request worth considering.
   - This is the owner's call: it is outward-facing.
2. **What "open" means where the hours are unknown.**
   - Option one: show only duty pharmacies until an area's rules are curated from its Diavgeia decision, and say so plainly.
   - Option two: wait for each area's rules before launching it.
   - Either way, never guess regular hours (D23's spirit).
3. **Rollout order.** Proposed:
   1. Prepare on Thessaloniki alone: the multi-area plumbing and the map optimisations, which help today too.
   2. One ITeQ adapter, piloted on Larissa (and Heraklion or Attica).
   3. A national duty layer across all ITeQ areas.
   4. Curated hours per area.
   5. The long tail: Diavgeia tables, per-site parsers, extended hours.
4. **Name, domain and URLs.** "Ανοιχτά Φαρμακεία Θεσσαλονίκης" and "pharmacy-skg" no longer fit. Area URLs need a region prefix, while pharmacy URLs (phone ids) can stay as they are.
5. **Thessaloniki's source.** If ΦΣΘ starts filling its efhmeries tenant, Thessaloniki can move to the shared adapter and stop depending on thess.guide.

## Sources

- **Diavgeia open data:** `https://diavgeia.gov.gr/opendata/search.json` (org 5001–5013 are the 13 Regions); decisions at `https://diavgeia.gov.gr/doc/<ΑΔΑ>`.
  - Opening hours: ΨΔ8Π7Λ7-ΚΒΨ (Attica), 9ΠΠΦ7ΛΡ-45Ρ (Magnesia and the Sporades), Ψ5Μ67ΛΛ-ΤΔΑ (Pella), 9ΘΧΟ7Λ9-ΕΗ5 (Ioannina), ΨΦΘ57ΛΕ-19Ο (Corfu), ΨΑΑΣ7ΛΕ-ΠΝΦ (Zakynthos), ΨΔ4Η7ΛΚ-ΜΥ9 (Rethymno).
  - Attica holiday on 14 Sep: 96ΒΙ7Λ7-ΧΛΣ.
  - Attica 2026–27 (13 May to 12 May), checked 8 Oct 2026: Central Athens ΨΔ8Π7Λ7-ΚΒΨ, North Athens Ψ1ΑΗ7Λ7-ΙΞ0 (amended 9ΛΤ07Λ7-149), West Athens Ψ3Δ17Λ7-8Δ0 (amended ΡΞΜΙ7Λ7-ΜΣΗ), West Attica ΡΩΡ47Λ7-ΠΞΡ (amended 96ΒΙ7Λ7-ΧΛΣ), all the same hours from the association's letter 1609/17.04.2026. South Athens and East Attica: nothing on Diavgeia for 2025 or 2026, searched by subject and by their directorates (78997, 80888). The seasons' dates are in none of them; the association's notice of 29 Oct 2024 (fsa.gr/6469-2) gives winter from 1 Nov.
  - Annual duty tables: ΡΣΦΞ7Λ6-2Κ3 (Ilia).
- **Laws:**
  - https://www.taxheaven.gr/law/4512/2018/arthro/257
  - https://www.taxheaven.gr/law/4613/2019/arthro/26
  - https://www.taxheaven.gr/law/5243/2025/arthro/71
- **ITeQ:**
  - https://fsa-efimeries.gr/
  - https://larisa.efhmeries.gr/ (and the other tenants)
  - https://superadmin.efhmeries.gr/ApiUsers
- **Extended hours:**
  - https://fsa.gr/wp-content/uploads/2026/06/ΙΟΥΛ-ΑΥΓ-2026-final-1.pdf
  - https://www.ppel.gov.gr/wp-content/uploads/2026/08/Πίνακας-Διευρυμένου-ωραρίου-5ο-Δίμηνο-2026.pdf
- **MapLibre:**
  - https://maplibre.org/maplibre-gl-js/docs/guides/large-data/
  - https://maplibre.org/maplibre-gl-js/docs/API/classes/GeoJSONSource/
  - https://maplibre.org/maplibre-style-spec/expressions/ (feature-state is paint-only)
- **Base map and hosting:**
  - https://github.com/hyperknot/openfreemap
  - https://docs.protomaps.com/basemaps/downloads
  - https://vercel.com/docs/limits/overview
- **Service worker:** https://w3c.github.io/ServiceWorker/#cache-put (206 responses are rejected)
- **Overture place schema:** https://docs.overturemaps.org/schema/reference/places/place/
