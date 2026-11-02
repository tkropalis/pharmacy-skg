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

| Who                                              | Format                         | Notes                                   |
| ------------------------------------------------ | ------------------------------ | --------------------------------------- |
| ΠΚΜ (Thessaloniki)                               | XLSX                           | ingested today                          |
| ΦΣΑ (Attica)                                     | 50-page PDF every two months   | read since 8 Oct 2026; see Attica below |
| Peloponnese Region                               | PDF                            | lists only the _extra_ hours            |
| Western Macedonia, Evros, Ionian, Central Greece | Diavgeia PDFs every two months |                                         |

### Attica

Researched and built on 8 Oct 2026 (decision D27) [verified].

- **Regular hours:** one decision per regional unit, each signed by its deputy governor, for 13 May 2026 to 12 May 2027, all at ΦΣΑ's request 1609/17.04.2026.
  - On Diavgeia: Central Athens ΨΔ8Π7Λ7-ΚΒΨ, North Athens Ψ1ΑΗ7Λ7-ΙΞ0, West Athens Ψ3Δ17Λ7-8Δ0, West Attica ΡΩΡ47Λ7-ΠΞΡ. Word for word the same: Mon/Wed 08:00–14:30; Tue/Thu/Fri 08:00–14:00 and 17:00–20:00 (winter) or 17:30–20:30 (summer).
  - South Athens and East Attica: nothing on Diavgeia in 2024–2026.
  - Winter starts on 1 Nov (ΦΣΑ's post of 29 Oct 2024, fsa.gr/6469-2). When summer starts is published nowhere we found.
  - 14 Sep replaces the patron saints: amending decisions 9ΛΤ07Λ7-149 (North), ΡΞΜΙ7Λ7-ΜΣΗ (West), 96ΒΙ7Λ7-ΧΛΣ (West Attica) for 2026; ΡΗΔΜ7Λ7-ΟΝΡ for 2025. The decisions also name each town's liberation day, but the duty list for 12 Oct (Athens) is an ordinary day's.
- **Every pharmacy:** the 201 dates fsa-efimeries.gr offers name 3,111 pharmacies, all with coordinates; a week names about 500. The count levels off by early March (the rotation), and the dates after early April 2027 list two pharmacies a day.
- **Extended hours:** fsa.gr posts the table in its category `dievrimeno-orario` (WordPress, `wp-json/wp/v2/posts`), about two months ahead.
  - About 2,000 rows (Sep–Oct 2026): place, name, address, phone and each month's hours. 1,951 phones are among the 3,111.
  - Word drew the table with no row rules; each cell's sides are thin filled boxes, which give the rows and columns. A row may run onto the next page.
  - The letters are printed shifted, in two ways (one font from Δ on: "ΓΔΤΣΔΡΑ" for ΔΕΥΤΕΡΑ; another from Σ on: "ΔΕΤΣΕΡΑ"), and lower case its own way ("δεσηερα"). Two letters can share a glyph (Γ for Γ and Δ), so text is matched, not decoded. Phone numbers are printed as they are.
  - The hours are typed freely ("ΔΕΥ-ΠΑΡ 8πμ-9μμ", "8-2,30 5-8,30", "όμοια με τον Ιούλιο"). A strict reader reads about 85% of the cells; the rest are ambiguous or misspelt.
  - Some pharmacies list only what they add ("ΔΕΥ-ΠΕΜ 14:30-20:30"), others their whole day.

### Thessaly and Crete

Searched on Diavgeia on 2 Nov 2026 (the Regions' organisations 5007 and 5010, their public-health units, subjects and full text, 2023 to 2026) and read as PDFs [verified]. The API (`/luminapi/opendata/search.json`) takes `from_issue_date` and `to_issue_date` and answers only for a window of about six months, so a search over years has to go window by window.

| Area      | Decision in force on 2 Nov 2026                                                                                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Karditsa  | ΨΞΡΤ7ΛΡ-0ΤΞ, 29 May 2026 (replaced ΡΩΟ27ΛΡ-ΕΑ2 of 27 Jun 2023). Added to the app.                                                                               |
| Magnesia  | 9ΠΠΦ7ΛΡ-45Ρ, 3 Nov 2025, "for the period 2026-2027" (earlier: ΨΝΙΕ7ΛΡ-Η8Ο, 2024-2025; 65ΤΓ7ΛΡ-ΞΚ8, 2025-2026). Added to the app for 2026 and 2027.              |
| Larissa   | None on Diavgeia: no hours decision since 2023 from the Larissa unit (82008), the Region's health directorate (82006) or in subject searches across the Region. |
| Trikala   | ΨΥΘ27ΛΡ-6ΦΦ (16 Feb 2023) is "for the year 2023"; nothing since. Duty only.                                                                                     |
| Chania    | None: no hours decision among the 63 the unit posted since 2023.                                                                                                |
| Heraklion | None for the unit. 9ΖΣΞ7ΛΚ-573 (15 Feb 2023) sets Moires 08:00-16:00 "until 2-7-2023", expired and one place. Duty approvals are per municipality.              |
| Lasithi   | None. The unit posts only duty approvals (for example 9Α0Ο7ΛΚ-3ΕΡ, Sitia, 1 May to 31 Dec 2026).                                                                |
| Rethymno  | A "mandatory minimum hours" decision is posted every few months (latest Ρ4ΗΓ7ΛΚ-ΒΨΖ, 22 Oct 2026). Rethymno is not an area of the app yet.                      |

- **Karditsa, ΨΞΡΤ7ΛΡ-0ΤΞ:** signed by the deputy head of the directorate "by order of the Regional Governor", at the association's proposal 183/27-5-2026.
  - Karditsa, Palamas, Sofades, Karditsomagoula, Agnantero, Proastio and the other communities: Mon, Wed, Fri 08:00-14:00 and 17:30-21:00 (summer) or 17:00-21:00 (winter); Tue, Thu 08:00-14:30.
  - Mouzaki: Mon to Fri 08:00-14:30, and Tue, Thu, Fri 17:30-21:00 (summer) or 17:00-21:00 (winter).
  - No validity dates, no season dates, no holidays. The 2023 decision had the same shape and stood for three years. The owner (2 Nov 2026): in force until replaced; winter from 1 Nov as in Attica; the return to summer is unknown, so from 1 Apr 2027 only the shared 17:30-21:00 counts.
- **Magnesia, 9ΠΠΦ7ΛΡ-45Ρ:** at the Magnesia association's letters 12911, 12912 and 12913 of 24.10.2025, for Magnesia and the Sporades.
  - Volos regional unit (Volos, Nea Ionia, Nea Anchialos, Iolkos, Artemida, Portaria, Aisonia): Mon 08:00-14:00, Wed 08:00-13:30, Tue, Thu, Fri 08:00-13:30 and 17:00-21:00.
  - Agria: Mon, Wed, Fri 08:00-14:00 and 17:00-21:00; Tue, Thu 08:00-14:00.
  - Almyros, Rigas Feraios, Notio Pilio (Argalasti and Agios Georgios Nileias with their own hours) and Zagora-Mouresi have schedules of their own; the Sporades (Skiathos, Skopelos, Alonnisos) have winter and summer ones, open every day in summer. None of these is in the app's Magnesia box except Agria.
  - It forbids opening on 25 Mar, Good Friday, Easter Monday, 15 Aug, 25 and 26 Dec, 1 and 6 Jan, Clean Monday, 1 May, 28 Oct, Whit Monday and "the feast day of the town's patron saint", without a date for that. The national ones are already in the calendar.
  - The "period 2026-2027" has no dates. The owner (2 Nov 2026): read literally, 1 Jan 2026 to 31 Dec 2027, replaced if a newer decision comes. The three decisions overlap (issued Dec 2023, Jan 2025 and Nov 2025), so a new one for 2027-2028 is likely this winter.
- **What the app uses:** the hours of the places where the area's pharmacies are (Karditsa town; Volos and Nea Ionia), because `regularRanges` has one table per area. Places in the decision that differ and have no pharmacy in the app's data (Mouzaki, Agria) are listed as open questions. The data only knows pharmacies that appeared on a duty list (Karditsa 44, Magnesia 130 of about 164 in Volos).

### Ilia

Researched and built on 2 Nov 2026 (decision D28) [verified]. Both decisions are the Region of Western Greece's (Diavgeia organisation 5004), from the public health directorate of the Ilia regional unit (unit 78414), issued on 16 Dec 2025 and signed by the deputy governor of Ilia, with the pharmacists' association's consent (its letters 102 and 103 of 16-12-2025).

- **Duty table, ΡΣΦΞ7Λ6-2Κ3:** "Διημερεύσεις – Διανυκτερεύσεις φαρμακείων της Περιφερειακής Ενότητας Ηλείας έτους 2026", a 5 MB PDF of 212 pages with a text layer.
  - Pages 1 and 2 are the decision, pages 3 to 6 the regular hours, from page 7 a table for each of eleven towns: Amaliada, Andravida, Ancient Olympia, Varda, Vartholomio, Gastouni, Zacharo, Krestena, Lechaina, Pyrgos and Tragano. The decision names the same eleven.
  - 4,845 rows, a duty each, every town on every day of 2026 (Amaliada and Pyrgos have a night and a day pharmacy, Lechaina a second day pharmacy on 50 days, the others one pharmacy a day). 79 phones and, for Varda, six pharmacists named.
  - Row: date and weekday, hours ("08:00-17:00", "08:00-14:30 & 17:30-08:00", "08:00-08:00*"), name, address, phone, "Διανυκτερεύει" Ναι or Όχι. The small towns have one pharmacy on duty round the clock, with a "*" the table never explains. Varda's table is another: date, weekday, a "ΝΑΙ" for a holiday, the pharmacist, "ΔΙΑΝΥΚΤΕΡΕΥΣΗ", the area; no phone, no address, no hours.
  - A web page printed to PDF: cells wrap onto four lines, the columns move from page to page, a row cut at the end of a page has its hours and flag at the foot of the page and the rest at the top of the next (or the other way round), a row can be printed twice or as one line of text, and the table's header falls in the middle of a row. `ilia/table.ts` reads these; its tests use real pages (`fixtures/ilia/`).
  - The year's table comes in December (the 2025 table, 6Ρ5Φ7Λ6-Ε70, on 24 Dec 2024), so the 2027 table is expected within weeks.
- **Regular hours, ΨΛΖΩ7Λ6-2Υ0:** "Υποχρεωτικό ωράριο λειτουργίας Φαρμακείων Φαρμακευτικού Συλλόγου Ηλείας έτους 2026", 6 pages, "per community, from 01-01-2026 to 31-12-2026", 40 hours a week each, a straight 08:00–16:00 in most.
  - Pyrgos, Varda, Gastouni, Zacharo, Tragano: Mon to Fri 08:00–16:00. Amaliada the same, 07:30–15:30 from 1 Jul to 31 Aug. Krestena 07:30–15:30. Ancient Olympia 08:30–13:30 and 18:00–21:00.
  - Andravida and Lechaina (winter): Mon, Wed 08:00–14:30; Tue, Thu, Fri 08:00–14:00 and 17:30–20:30. Vartholomio: Mon, Tue, Thu 08:00–14:00 and 17:30–20:30 (18:00–21:00 in summer), Wed, Fri 08:00–14:30, "afternoon closed".
  - Not used: Lechaina's summer table, whose Tuesday, Thursday and Friday read 8:00–14:30 and 18:00–21:00 (9.5 hours) under "9,00". It covers July and August only, which are over.
  - The decision ends on 31 Dec 2026. Nothing on Diavgeia yet for 2027.
- **Decisions that amend the table:** the unit posts "Προσωρινή απαλλαγή από εφημερία – διανυκτέρευση" (a pharmacist excused for months) and "άδεια προσωρινού κλεισίματος Φαρμακείου" (a pharmacy closed for days). Each is a two-page PDF whose decision is an image; the search finds them by subject.
  - Exemptions read on 2 Nov 2026: ΡΛΩ97Λ6-Ω7Κ and 9ΦΝΖ7Λ6-9ΡΨ (Kampitsi, Gastouni, to 30 Nov 2025 and 30 Jan 2026); Ψ7857Λ6-3ΞΞ (15 Dec 2025: Vlachou in Varda, Papakonstantinou, Panagopoulou until 30 Jun and Maniatis in Amaliada, Karnachoriti in Gastouni, the year); 9ΤΝΗ7Λ6-710 (6 Feb 2026: Liosi, Kolokotroni 10, Amaliada, to 31 Dec; Bafi, Ermou 49, to 31 Jul); ΨΦΦΡ7Λ6-ΔΥΛ (12 Jun 2026: Kypriotis, Chalkiopoulou 3, Gastouni, to "31-11-2026"); ΡΘ1Ξ7Λ6-ΟΞΑ (1 Jul 2026: Tsiklira, Ermou 9, and Panagopoulou, Ermou 49, Amaliada, to 31 Dec).
  - The table of 16 Dec 2025 already leaves out the pharmacists of the decision of 15 Dec. Only Liosi's is a pharmacy that has the table's duties (7 Nov, 19 Nov, 27 Nov and others to 31 Dec), and the app leaves them out. Ermou 49 is a partnership (Panagopoulou and Bafi): both are excused from 6 Feb to 31 Jul, only Panagopoulou after, so the pharmacy serves again from 1 Aug. Maniatis ("Καλαβρύτων 18") is not applied: the table has a partnership "Σ.Φ. ΚΩΝΣΤΑΝΤΙΝΟΥ ΜΑΝΙΑΤΗ ΠΑΝΑΓΙΩΤΑ ΜΑΝΙΑΤΗ ΟΕ" at Καλαβρύτων 19, which may be the same pharmacy or not.
  - Closures read: Karali, Ermou 78, Pyrgos, 9 to 12 Oct 2026 (ΨΣ8Η7Λ6-Η6Ζ); Giatra, Sisini 71, Gastouni, 18 to 22 May (Ρ03Η7Λ6-ΩΧΥ). Days long, so the run lists only a closure posted in the last 14 days.
- **Places:** 38 Overture pharmacies in the area's box, 22 matched by phone; the rest by Nominatim, many only to their town (the streets are thin in OpenStreetMap).

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
  - Thessaly 2026: Karditsa ΨΞΡΤ7ΛΡ-0ΤΞ, Magnesia and the Sporades 9ΠΠΦ7ΛΡ-45Ρ; see Thessaly and Crete above.
  - Ilia 2026: duty table ΡΣΦΞ7Λ6-2Κ3, regular hours ΨΛΖΩ7Λ6-2Υ0; see Ilia above.
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
