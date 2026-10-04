# Research notes

Collected on 4 Oct 2026 while planning the project. At the time, the development container's network policy blocked Greek sites and OpenStreetMap, so many findings come from search results rather than from the sources themselves.

Confidence tags:

- **[verified]** fetched, downloaded or measured directly (or read in a project's source code)
- **[search]** from search-result snippets, not yet checked against the source
- **[inferred]** our own reasoning

Anything marked **verify** must be checked against the real source before code depends on it.

## 1. On-duty pharmacy data (ΦΣΘ)

### Source

- The Pharmaceutical Association of Thessaloniki (Φαρμακευτικός Σύλλογος Θεσσαλονίκης, ΦΣΘ) runs https://fsth.gr/ on WordPress. [search]
- Public duty page: `https://fsth.gr/εφημερεύοντα-φαρμακεία/` [search]
- Duty application on an older ASP.NET subdomain: https://efimeries.fsth.gr/root.el.aspx. You pick an area and a date, then print a PDF. [search]
- An older indexed URL takes a date as `yyyyMMddHHmmss`: `https://www.fsth.gr/root.viewpharmaciesonduty.el.aspx?date=20220630000000`. [search] The same path probably still works on `efimeries.fsth.gr`. [inferred] **verify**
- No JSON, XHR or iCal endpoint was found, but the pages could not be inspected. **verify**

### Format

- One text PDF per area group per day, published a few days ahead. [search]
- Title pattern: "Πολεοδομικό Συγκρότημα Θεσσαλονίκης Εφημερεύοντα Φαρμακεία Δευτέρα 23 Φεβ 2026". [search]
- Section headings: "Διημερεύοντα Φαρμακεία", "Διανυκτερεύοντα Φαρμακεία", "Μεταμεσονύκτια Φαρμακεία". [verified, from a parser's source code]
- Fields: name, address and phone (10 digits starting with 2). No coordinates. Hours are implied by the section a pharmacy is listed under. [verified, same]
- Dates use Greek month abbreviations ("φεβ", "μάρ", …). [verified, same]
- Area groups seen: Πολεοδομικό Συγκρότημα, Δ. Λαγκαδά, Χαλκηδόνας, Ωραιοκάστρου, Θέρμης, Θερμαϊκού, Βόλβης, Δέλτα, Πανόραμα-Πεύκα, Ασβεστοχώρι/Εξοχή-Χορτιάτης-Φίλυρο. [search]
- Other sites re-host the PDFs, e.g. `thess.guide/wp-content/uploads/2026/02/Εφημερίες_23-02-2026.pdf`. A possible fallback source. [search]

### Rotation

- ΦΣΘ publishes a yearly calendar of numbered duty "cards" (καρτέλες): https://fsth.gr/efhmeries-poleodomikoy-2026/ [search]
- Which pharmacies belong to each card is visible to members only. [search]
- Comparing the public calendar with the public daily lists should reveal each card's members, which would allow forecasting duty dates. [inferred] We only publish official dates; see decision D11.

### Prior art

- [george-karafotias/thess-pharmacies](https://github.com/george-karafotias/thess-pharmacies) (Sept 2026, C# with PdfPig) parses ΦΣΘ PDFs that are uploaded by hand and geocodes them with Photon. Demo: thess-pharmacies-app.netlify.app. [verified]
- pharmafinder.app: open-source frontend, backend behind a Cloudflare Turnstile bot check. [verified]

## 2. Opening hours

These are the rules the "open now" logic has to encode.

### Regular hours

- Since 23 Mar 2021: Mon/Wed 08:00–14:30; Tue/Thu/Fri 08:00–14:00 and 17:00–21:00. [search] **verify**
- Summer 2026: continuous 08:00–16:00 from 13 Jul to 21 Aug. [search] **verify**
- Saturdays and Sundays: closed except for duty pharmacies. [inferred] **verify**
- Hours follow decisions of the Region of Central Macedonia (ΠΚΜ), based on ΦΣΘ proposals. [search]
- Duty exemptions: Law 1963/1991 art. 9, amended by art. 71 of Law 5243/2025 (https://fsth.gr/nomothesia-apallages-kai-dieyrymeno/). [search]

### Extended hours (διευρυμένο ωράριο)

- Pharmacies declare extended hours to ΦΣΘ online (https://fsth.gr/f8b69323/). [search]
- ΠΚΜ publishes the official list every two months, probably as PDF attachments. Current period, 1 Sep–31 Oct 2026: https://www.pkm.gov.gr/anakoinosi-pou-afora-to-dievrymeno-orario-farmakeion-tis-m-e-thessalonikis-apo-01-09-2026-eos-31-10-2026-symfona-me-tous-pinakes-pou-katartizei-o-f-s-th/ [search]

### Duty shifts

Sources conflict here, so **verify everything below against real PDFs**.

- Weekends and holidays: cards 1–17 rotate, open 08:00–21:00 ("Διημερεύοντα"). [search]
- A vrisko.gr note says on-duty pharmacies stay open until 22:00 from 16 Oct to 15 May and until 23:00 from 16 May to 15 Oct. [search]
- Saturday mornings: cards Σ1–Σ4 open 08:30–14:30. [search]
- Monday and Wednesday afternoons: cards 21–37 (one source says summer only). [search]
- Overnight ("Διανυκτερεύοντα"): open until 00:00. [search]
- After midnight ("Μεταμεσονύκτια"): 21:00–08:00, grouped by letter (Α/Β/Γ/Δ). [search] One snippet says 20:30–00:00 and until 08:30 instead. [search]
- Midday: on Tue/Thu/Fri, pharmacies that are open until 00:00 also stay open 14:00–17:00. [search]

### Holidays

- National public holidays, including those that move with Orthodox Easter (Καθαρά Δευτέρα, Μεγάλη Παρασκευή, Δευτέρα του Πάσχα, Αγίου Πνεύματος). [inferred] **verify** which of these close pharmacies, and whether any close them for half a day.
- Local holiday: 26 Oct (Αγίου Δημητρίου) in Thessaloniki. [inferred] **verify**

## 3. Registry of all pharmacies

- **How many:** vrisko.gr lists 504 pharmacies in the city of Thessaloniki and 1,238 in the prefecture. [search] We estimate 900–1,000 in the urban area. [inferred]
- **Overture Maps**, release 2026-09-23.1 (licence CDLA-Permissive-2.0), bbox 22.75–23.20E, 40.45–40.80N [verified]:
  - 640 places categorised as pharmacy;
  - 474 with confidence ≥ 0.77, and 435 with pharmacy-like names;
  - most have a phone and an address;
  - some are miscategorised (e.g. a bank).
- **OpenStreetMap:** not checked, because the host was blocked. The Overpass query to run:
  `[out:json];area["name"="Περιφερειακή Ενότητα Θεσσαλονίκης"]->.a;nwr[amenity=pharmacy](area.a);out tags center;`
- **ΕΟΠΥΥ** (https://www.eopyy.gov.gr/PharmacyList) lists only ΕΟΠΥΥ's own pharmacies. [search/inferred]
- **data.gov.gr and opendata.thessaloniki.gr:** no pharmacy registry found. [search]
- **Google Places:** not usable. Its terms restrict storing the data and showing it on non-Google maps. [inferred]
- **The duty lists themselves:** every pharmacy rotates through duty, so a few weeks of lists should list nearly all of them with address and phone. [inferred]

## 4. Medicine prices and item search

### Official price bulletin (Δελτίο Τιμών Φαρμάκων)

- **Where:**
  - Prescription medicines: https://www.moh.gov.gr/articles/times-farmakwn/deltia-timwn/
  - Non-prescription medicines (ΜΗΣΥΦΑ): https://www.moh.gov.gr/articles/times-farmakwn/deltia-timwn-mhsyfa/ [search]
- **No single current file.** The current list has to be assembled from several bulletins [search]:
  - **Base:** the yearly re-pricing of December 2025 (decision Δ3(α) 58275/29-12-2025, page 13924). It was amended on page 14046 and applied in pharmacies from 23 Feb 2026.
  - **New generics:** monthly, 2–3 months behind.
  - **New medicines:** quarterly.
  - **Price cuts:** occasional extra bulletins.
- **Columns** [search]: barcode, name, form, strength, pack, ATC, active substance, licence holder, and ex-factory, wholesale, hospital and retail prices.
  - The barcode is a national ΕΟΦ code, not an EAN. [inferred]
- **Size:** about 7,500–8,000 rows. [inferred]
- **Reuse:** the bulletins are public ministerial decisions, so they should be reusable under the open-data law ν.4727/2020. [inferred] Ministry contact: farmaka@moh.gov.gr. [search]

### Is the price the same everywhere?

- **Prescription medicines:** the bulletin sets maximum prices, so the price is effectively the same at every pharmacy. [search/inferred]
- **Non-prescription medicines (ΜΗΣΥΦΑ):** prices were freed by ν.4254/2014 (effective 2017). The ministry price is only indicative (Γ5(α)οικ.38152/2017, ΦΕΚ Β'1761/2017). [search]
- **General-sale products:** about 216 of them (ΓΕΔΙΦΑ) may also be sold outside pharmacies. [search]
- **Parapharmacy** (cosmetics, supplements, baby formula): pricing is free. [inferred]

### What the patient pays

- A 0, 10 or 25% co-payment, depending on the diagnosis and insurance, plus the full gap between the retail price and the reference (insurance) price. [search]
- The positive (reimbursement) list has about 6,900 products: https://www.moh.gov.gr/articles/times-farmakwn/epitroph-aksiologhshs-kai-apozhmiwshs-farmakwn/ [search]
- The app can show the retail price plus an estimate like "≈ €X at 25/10/0%". The exact amount needs the prescription. [inferred]

### Medicine database

- ΕΟΦ's product search, with product-information and leaflet PDFs: https://services.eof.gr/drugsearch/ [unverified]. No API or bulk download was found. [search]
- Proprietary databases (galinos.gr, farmako.net) are protected by the database right (ν.2121/1993 art. 45A). [inferred]

### Shortages

- **ΕΟΦ monthly "limited availability" list:** a PDF with barcode, ATC and active substance. The latest seen is dated 31 Aug 2026. [search]
- **ΕΟΦ parallel-export bans:** 3-month bans, renewed each time (e.g. 105 products, 27 May–27 Aug 2026). [search]
- **ΗΣΠΑΔΙΦ:** the ministry and ΗΔΙΚΑ have tracked stock down to pharmacy level since 22 Jan 2024. The data is not public. A citizen app was announced in May 2025, with no sign of launch. [search]

### Per-pharmacy stock

- **Greece:** no public service shows live stock. pharmacyneeds.gr works by request and reply. [search]
- **Pharmacy software vendors:** Epsilon CSA (about 5,500 pharmacies), Entersoft, Pharmacy One, Pharmasys. [search] None offers a public stock API. [inferred]
- **Models abroad** [search]:
  - Germany: gesund.de reads stock directly from pharmacy software.
  - Spain: CISMED collects stock-outs, and the regulator's CIMA API flags supply problems.
  - Portugal: a 1400 phone line finds a pharmacy with stock.
  - Italy: AIFA publishes shortage data as open CSV.

### Parapharmacy price comparison

- Skroutz has an API, available on request. BestPrice has no public API. Linkwise provides affiliate product feeds. [search]
- Scraping is legally risky (CJEU C-762/19 on the database right). [search/inferred]

### Regulation

- Price lists without product claims are not advertising (Directive 2001/83, art. 86(2)). [search]
- Distance selling is allowed only for ΓΕΔΙΦΑ products (ΚΥΑ 32221/2013 art. 116, amended by 22609/2022). [search]
- Recent EU court rulings: DocMorris (C-517/23, 2025) and Doctipharma (C-606/21, 2024). [search]
- **What this means for the app:** neutral official prices are fine; no deals, rankings, product claims or orders. Medicine searches are health data under GDPR, so they stay on the device. [inferred]

### Feasibility

- **Prescription price lookup:** feasible.
- **Non-prescription prices:** partial (indicative only).
- **Per-pharmacy stock:** not feasible without partnerships.
- **Shortage warnings:** feasible, updated monthly.

## 5. Competitors

- **Pharmacists' cooperative app** (ΣΥ.ΦΑ. Θεσσαλονίκης, by Pharmanet): list, map, on-duty hospitals, product offers. [search]
  - Android `com.pharmanet.syfa.syfaefarmogiaplo` (10K+ installs); iOS id1273312180.
- **Farmakeia** (Animapps, farmakeia.gr, iOS id364925463): 48 cities, funded by ads. [search]
- **On-Duty Pharmacy** (Quantum Core, Android `gr.quantumcore.on_dutypharmacy.android`, 5K+ installs): shows whether a pharmacy has confirmed to its association that it is open. [search]
- **Directories and lists** [search]:
  - vrisko.gr and xo.gr, heavy on ads;
  - thess.guide, with 3-day lists and the ΦΣΘ PDFs;
  - efimeries-online.gr;
  - daily posts on news sites.
- **Athens precedent:** the official FSA-Efimeries app and site (https://fsa-efimeries.gr/) use algorithm-built rosters and QR codes in pharmacy windows. [search]
- **Gaps a new app can fill** [inferred]:
  - an ad-free, map-first web app;
  - a correct "open now" across every type of hours and season;
  - next duty dates per pharmacy;
  - showing the source and how fresh the data is, plus error reporting;
  - English;
  - offline use.

## 6. UX patterns from abroad

- **Spain**, Farmacias Ahora Zaragoza: future date and time picker; different map styling for regular, on-duty and extended-hours pharmacies; one-tap call. [search]
- **Italy**, Federfarma Lombardia "Farmacia Aperta": radius filter from 700 m to 10 km; web version alongside the app; route to the pharmacy. [search]
- **Portugal**, Farmácias de Serviço: default home town, "open / on-call" filter, call button, hand-off to navigation apps. [search]
- **Austria**, Apo-App: favourite pharmacies, live open status, distance. [search]
- **Germany**, aponet: official chamber data, a phone hotline that can send results by SMS, embeddable widgets, displays for pharmacy windows. [search]
- **France**, 3237 (anti-pattern): a paid phone line, captchas, frequent errors. [search]
- **iOS:** web push works only for web apps added to the Home Screen, on iOS 16.4+. [verified]

## 7. Technical options

### Maps

- **Library size:** MapLibre GL JS 6.12 is about 299 KB gzipped and ESM-only; Leaflet 1.9.4 is about 42 KB gzipped. [verified]
- **OpenFreeMap:** free, no API keys, no usage limits, no SLA. [verified]
  - For Greek labels, set `text-field` to `["coalesce",["get","name:el"],["get","name"]]`. [verified]
- **Protomaps:** supports `name:el`. A city extract can be cut with `pmtiles extract --bbox` and hosted on any static store. [verified]
- **Commercial providers:** MapTiler and Stadia free tiers are non-commercial only; Carto needs an API key; Mapbox needs a card. [search/verified]
- **OSM raster tiles:** heavy use is not allowed. [search]

### Directions (deep links)

- **Google:** `https://www.google.com/maps/dir/?api=1&destination=LAT,LNG&travelmode=walking` [search]
- **Apple:**
  - iOS 18.4+: `https://maps.apple.com/directions?destination=LAT,LNG&mode=walking`
  - Legacy: `https://maps.apple.com/?daddr=LAT,LNG&dirflg=w` [verified]
- **Waze:** `https://waze.com/ul?ll=LAT%2CLNG&navigate=yes` [search]
- **Routing APIs** (OSRM on FOSSGIS, Valhalla, OpenRouteService, GraphHopper) have restrictive free tiers. Deep links make them unnecessary. [verified/search]

### Geocoding

- **Google Geocoding:** its terms forbid showing results on non-Google maps and limit caching to 30 days, so it is not usable. [verified]
- **Nominatim:** at most 1 request per second, an identifying User-Agent, no bulk jobs. Storing results is allowed. [search]
- **Others:** the Photon demo server is fair-use only [verified]; Geoapify allows storing results with attribution [search]; LocationIQ's free plan caches for at most 48 h. [search]
- **Strategy** [inferred]:
  - geocode each address once;
  - store the source and a confidence level with the result;
  - keep manual pin fixes in the repo;
  - re-geocode only when the address text changes.

### Public transport

- **Metro:** Line 1 opened on 30 Nov 2024. The Kalamaria branch opened on 27 Aug 2026 with five stations. [search]
- **Buses:** the OASTH bus GTFS is published by OSETH on data.gov.gr, in slices valid for about two weeks. There is no GTFS for the metro. [verified via a third-party project] An unofficial live-data API also exists. [search]

### Hosting and scheduling

- **GitHub Actions** [verified]:
  - scheduled runs can be delayed or dropped;
  - in public repos, schedules are disabled after 60 days without activity;
  - schedules accept a `timezone:` setting.
- **Cloudflare Workers Free:** offers cron triggers with tight CPU limits. [verified]
- **Vercel Hobby:** crons run at most once a day, and the plan is for non-commercial use only. [search/inferred]
- **Supabase Free:** projects pause after 7 days without activity. [search]

## 8. Out of scope, for reference

On-duty hospitals (decision D9) are published monthly as PDFs by the 3rd regional health authority (https://www.3ype.gr/category/efimeries/) and the 4th (https://www.4ype.gr/efimeries-nosokomeion/). [search]
