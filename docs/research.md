# Research notes

Collected on 4 Oct 2026 while planning the project. At the time, the development container's network policy blocked Greek sites and OpenStreetMap, so many findings come from search results rather than from the sources themselves.

Sections 1–3 were re-checked later on 4 Oct 2026 against downloaded files (the M1 fixtures). Those findings are tagged [verified] and say which file they come from. Section 4 was re-checked on 5 Oct 2026 against the ministry's and ΕΟΦ's files (the v1.1 fixtures in `packages/ingest/fixtures/moh` and `eof`).

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
- **Blocked to automated clients.** `fsth.gr`, `www.fsth.gr` and `efimeries.fsth.gr` sit behind Cloudflare, which answers every path (including `robots.txt`) with a 403 JS challenge (`cf-mitigated: challenge`). This happens from a cloud container with full network access, and will very likely happen from GitHub Actions runners too. So the endpoint questions above still cannot be answered, and a scheduled scraper cannot fetch from ΦΣΘ directly. [verified]
- **Re-host:** thess.guide uploads the ΦΣΘ PDFs unchanged (same MigraDoc/PDFsharp producer). It does so a few days ahead, about 11 files per day, and they can be listed through the WordPress media API: `https://www.thess.guide/wp-json/wp/v2/media?search=Εφημερίες&per_page=100`. The archive goes back to 16 Jun 2026, with some gaps (e.g. 22 Aug–5 Sep). Until mid-September it mostly holds only the metro PDF; all ten groups appear from about 16 Sep. [verified]

### Format

Checked against the PDFs for Sat 3, Sun 4, Mon 5 and Tue 6 Oct, Wed 15 Jul (summer) and Sat 15 Aug 2026 (a holiday). [verified]

- One text PDF per area group per day, generated with MigraDoc/PDFsharp. The metro PDF runs to about 3 pages; the others have 1.
- **Ten area groups:** Πολεοδομικό Συγκρότημα Θεσσαλονίκης, Δήμος Λαγκαδά, Δήμος Χαλκηδόνας, Δήμος Ωραιοκάστρου, Δήμος Θέρμης, Δήμος Θερμαϊκού, Δήμος Βόλβης, Δήμος Δέλτα, Πανόραμα-Πεύκα, Ασβεστοχώρι/Εξοχή-Χορτιάτης-Φίλυρο. The group name is the first line.
- Second line: "Εφημερεύοντα Φαρμακεία Σάββατο 03 Οκτ 2026" (weekday, day, Greek month abbreviation, year). On long weekday names the year wraps onto a third line (e.g. Fridays in July).
- The source has typos: e.g. a 9-digit phone (Βόλβης, 4 Oct 2026) and Latin look-alike letters inside Greek words ("M.AΛΕΞΑΝΔΡΟΥ").
- **Sections:** each starts with a heading, and **most headings state their own hours**, e.g. "Διανυκτερεύοντα Φαρμακεία (από 21:00 έως 00:00)". Some headings have no hours (Θέρμης, Ασβεστοχώρι group). Some carry a sub-note on the next lines (see 2. Duty shifts).
- The same section name means different hours in different groups. In the metro, "Διανυκτερεύοντα" is 21:00–00:00; in Θερμαϊκού it is 21:00–08:00 the next day. **Hours must be read from each heading, not from a table keyed by section name.**
- Midnight is written both as "00:00" and as "24:00" (Λαγκαδά).
- Table columns: Περιοχή (locality), Όνομα, Διεύθυνση, Τηλέφωνο (10 digits starting with 2). Names and addresses often wrap onto 2–3 lines, with the other cells vertically centred. So a line-based text parser is not enough; rows have to be grouped by y-position.
- The same pharmacy can appear in two sections on the same day (e.g. Θερμαϊκού day and night duty).
- Every page ends with a note on the sort order (locality, postcode, name).
- Row counts in the metro PDF: 49 weekend day duty + 59 extra Saturday-morning + 31 overnight + 7 after-midnight (Sat 3 Oct); 73 + 28 + 6 (Mon 5 Oct); 28 + 7 (Tue 6 Oct). Each outlying group lists 1–5 rows.

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

- Since 23 Mar 2021: Mon/Wed 08:00–14:30; Tue/Thu/Fri 08:00–14:00 and 17:00–21:00. [verified] Two reports of 23 Mar 2021 (iefimerida.gr, parallaximag.gr) give the same wording: "Δευτέρα και Τετάρτη από τις 08:00 έως τις 14:30 και Τρίτη, Πέμπτη και Παρασκευή από τις 08:00 έως τις 14:00 και από τις 17:00 έως και τις 21:00". The ΠΚΜ decision itself was not fetched. Encoded as a data table in `packages/core/src/regular-hours.ts`.
- Summer 2026: continuous 08:00–16:00 from 13 Jul to 21 Aug. [search] **verify** The duty lists corroborate the dates, not the hours: the metro list has a Διημερεύοντα section on every Tue, Thu and Fri from 14 Jul to 21 Aug 2026 (15 days in the archive) and on no other Tue, Thu or Fri. That points to a summer schedule with no afternoon opening, so that pharmacies need a day-duty rota on those days. [verified] Not applied (decision D23): the engine uses the regular hours all year until the summer hours are verified, so it shows non-duty pharmacies open on summer Tue/Thu/Fri evenings. A test pinned to the July 2026 data documents this.
- Saturdays and Sundays: no regular hours; only duty and extended-hours pharmacies are open. [inferred] Applied (decision D23).
- Hours follow decisions of the Region of Central Macedonia (ΠΚΜ), based on ΦΣΘ proposals. [search]
- Duty exemptions: Law 1963/1991 art. 9, amended by art. 71 of Law 5243/2025 (https://fsth.gr/nomothesia-apallages-kai-dieyrymeno/). [search]

### Extended hours (διευρυμένο ωράριο)

- Pharmacies declare extended hours to ΦΣΘ online (https://fsth.gr/f8b69323/). [search]
- ΠΚΜ publishes the official list every two months. Current period, 1 Sep–31 Oct 2026: https://www.pkm.gov.gr/anakoinosi-pou-afora-to-dievrymeno-orario-farmakeion-tis-m-e-thessalonikis-apo-01-09-2026-eos-31-10-2026-symfona-me-tous-pinakes-pou-katartizei-o-f-s-th/ [search]
- **Format** (file `2026_08_31_ΔΙΕΥΡΥΜΕΝΟ-ΩΡΑΡΙΟ-ΣΕΠΤ-ΟΚΤ2026.xlsx`, linked from that page) [verified]:
  - an XLSX file, not a PDF. `www.pkm.gov.gr` returns 403 to clients without a browser-like User-Agent;
  - 398 pharmacies, one sheet. Columns: Περίοδος, Φαρμακείο, Διεύθυνση, Τ.Κ., Δημοτική ενότητα, Πρόγραμμα;
  - no phone numbers, so matching to duty-list pharmacies has to use name, address and postcode;
  - Πρόγραμμα is multi-line text. 365 rows use weekdays ("Δευτέρα: 08:00 - 14:30 και 17:00 - 21:00") and 33 use dates ("Τρίτη 01/09/2026: 08:00 - 21:00");
  - no Sunday hours. Saturday hours vary (e.g. 09:00–14:30, 08:00–20:00);
  - some times look like typing slips (14:01, 14:31, 13:59). Keep them as published.

### Duty shifts

Verified against the PDFs listed in section 1 (Format). The headings are quoted as printed. [verified]

**Metro area (Πολεοδομικό Συγκρότημα):**

| Section heading                                                          | Hours                | Days seen                         |
| ------------------------------------------------------------------------ | -------------------- | --------------------------------- |
| Διημερεύοντα Φαρμακεία (Σάββατο, Κυριακή και αργίες από 08:00 έως 21:00) | 08:00–21:00          | Sat, Sun, holiday (15 Aug)        |
| Διημερεύοντα Φαρμακεία (από 08:00 έως 21:00)                             | 08:00–21:00          | Mon, Wed (also in summer, 15 Jul) |
| Επιπλέον Φαρμακεία Σαββάτου (από 08:30 έως 14:30)                        | 08:30–14:30          | Sat (not the 15 Aug holiday)      |
| Διανυκτερεύοντα Φαρμακεία (από 21:00 έως 00:00)                          | 21:00–00:00          | every day                         |
| Μεταμεσονύκτια Φαρμακεία (από 21:00 έως 08:00 το επόμενο πρωί)           | 21:00–08:00 next day | every day                         |

- Tuesday, Thursday and Friday have no day-duty section outside summer, because every pharmacy is open on those afternoons anyway. From 14 Jul to 21 Aug 2026 they do have one (see the summer bullet in Regular hours). [verified]
- Under the Διανυκτερεύοντα heading on Tue/Thu/Fri: "Τρίτη, Πέμπτη & Παρασκευή (εκτός αργιών), λειτουργούν και 14:00-17:00 (όχι τα Μεταμεσονύκτια)". So overnight pharmacies also cover the midday break on those days, except on holidays.
- **Settled conflicts:**
  - Day duty in the metro closes at **21:00**. The 22:00/23:00 closing times from vrisko.gr apply to some outlying groups, not to the metro.
  - The PDF has two overnight tiers: Διανυκτερεύοντα ends at **00:00**, and Μεταμεσονύκτια ends at **08:00** the next morning. The 20:30/08:30 times appear in no file.
- Card numbers (1–17, Σ1–Σ4, 21–37) and letter groups (Α/Β/Γ/Δ) are not printed in the PDFs.

**Outlying groups** (all days seen):

| Group                                     | Headings and hours                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Λαγκαδά                                   | 08:00–23:00, and a second section 08:00–24:00                                                                                   |
| Χαλκηδόνας, Πανόραμα-Πεύκα, Βόλβης, Δέλτα | 08:00–23:00                                                                                                                     |
| Ωραιοκάστρου                              | 08:00–00:00                                                                                                                     |
| Θερμαϊκού                                 | Διημερεύοντα 08:00–21:00; Εφημερεύοντα 08:00–00:00; Διανυκτερεύοντα 21:00–08:00 next day, with the Tue/Thu/Fri 14:00–17:00 note |
| Θέρμης                                    | Εφημερεύοντα 08:00–23:00; Εφημερεύοντα **(no hours)**; Διανυκτερεύοντα **(no hours)**                                           |
| Ασβεστοχώρι/Εξοχή-Χορτιάτης-Φίλυρο        | Εφημερεύοντα **(no hours)**                                                                                                     |

- Whether these hours change with the season (the vrisko.gr 22:00/23:00 note) is not yet known: the earliest file is from 16 Jun. **verify** after 16 Oct.
- What "no hours" means for Θέρμης and Ασβεστοχώρι is unknown. **verify** (ask ΦΣΘ).

### Holidays

- National public holidays: 1 Jan, 6 Jan, Καθαρά Δευτέρα, 25 Mar, Μεγάλη Παρασκευή, Easter Sunday and Monday, 1 May, Αγίου Πνεύματος, 15 Aug, 28 Oct, 25 Dec, 26 Dec. The moveable ones come from the Orthodox Easter date (Meeus Julian algorithm plus 13 days, valid 1900–2099). [inferred] Applied (decision D23). **verify** that every one closes pharmacies, and whether any close them for half a day.
- Local holiday: 26 Oct (Αγίου Δημητρίου), for the metro group only. [inferred] Applied (decision D23). **verify**
- Holidays announced by the duty list: the "Σάββατο, Κυριακή και αργίες" heading is printed every weekend (on all 29 weekend days in the archive). A Monday–Friday whose list uses it counts as a holiday for that group. No weekday has done so yet: 15 Aug 2026 was a Saturday, so the case is untested against real data.
- Not implemented: the government's transfer of 1 May when it falls in Holy Week or Easter week. 1 May is always listed, and a moved holiday is caught by the heading above.
- Dated extended-hours schedules apply on holidays. Of the 33 dated schedules in the Sep–Oct 2026 list, 29 omit 26 Oct and all omit 28 Oct, so on those days the holiday rule applies instead of the regular hours; the 4 that list 26 Oct are open then.

## 3. Registry of all pharmacies

- **How many:** vrisko.gr lists 504 pharmacies in the city of Thessaloniki and 1,238 in the prefecture. [search] We estimate 900–1,000 in the urban area. [inferred]
- **Overture Maps**, release 2026-09-23.1 (licence CDLA-Permissive-2.0), bbox 22.75–23.20E, 40.45–40.80N [verified]:
  - 640 places categorised as pharmacy;
  - 474 with confidence ≥ 0.77, and 435 with pharmacy-like names;
  - most have a phone and an address;
  - some are miscategorised (e.g. a bank).
- **Overture, re-checked** [verified]: the 640 / 474 figures reproduce. In the 2026 schema the category lives in `taxonomy.primary` (`pharmacy`) and `basic_category` (`pharmacy_and_drug_store`); there is no `categories` column. 619 of the 640 have a phone.
- **OpenStreetMap** (Overpass, same bbox, data as of 24 Jul 2026) [verified]:
  - 764 objects tagged `amenity=pharmacy` (757 nodes, 7 ways);
  - only 42% have a `name`, 8% a phone, 33% a house number and 3% `opening_hours`;
  - `overpass-api.de` reset every connection from the cloud container; the `overpass.kumi.systems` mirror worked;
  - the planned query by area name returned nothing; querying by bbox works.
  - Licence: ODbL. A database derived from OSM must be shared under ODbL too. [inferred]
- **Overlap:** 443 of the 640 Overture pharmacies have an OSM pharmacy within 100 m (373 within 50 m). [verified]
- **Duty lists as a registry:** the PDFs for 6 dates already list 457 distinct phone numbers, i.e. pharmacies. The thess.guide archive (≈100 days) should cover nearly all of them. [verified/inferred]
- **ΕΟΠΥΥ** (https://www.eopyy.gov.gr/PharmacyList) lists only ΕΟΠΥΥ's own pharmacies. [search/inferred]
- **data.gov.gr and opendata.thessaloniki.gr:** no pharmacy registry found. [search]
- **Commercial directories** [verified 4 Oct 2026]: vrisko.gr's terms (§13) forbid automated extraction, and its content is protected by the database right; xo.gr (Χρυσός Οδηγός) answers automated clients with a Cloudflare challenge. Neither is used (decision D22). Looking up a single address by hand to write a manual override is fine.
- **Google Places:** not usable. Its terms restrict storing the data and showing it on non-Google maps. [inferred]
- **The duty lists themselves:** every pharmacy rotates through duty, so a few weeks of lists should list nearly all of them with address and phone. [inferred]

## 4. Medicine prices and item search

### Official price bulletin (Δελτίο Τιμών Φαρμάκων)

- **Where:**
  - Prescription medicines: https://www.moh.gov.gr/articles/times-farmakwn/deltia-timwn/ [verified]
  - Non-prescription medicines (ΜΗΣΥΦΑ): https://www.moh.gov.gr/articles/times-farmakwn/deltia-timwn-mhsyfa/ [verified]
  - One article per ministerial decision, listed 20 per page with its date. Each article attaches the decision (PDF) and its price tables, as .xlsx and as PDF, downloaded with `?fdl=<id>`. There is no API; the pages are plain HTML. The server sometimes resets connections, so requests are retried. [verified]
- **No single current file.** The current list is assembled from several bulletins [verified, 5 Oct 2026]:
  - **Base:** the yearly revision of December 2025 (decision Δ3(α) 58275/29-12-2025, article 13924), republished whole by its amendment (article 14046, 20 Feb 2026, 8,507 packs). An amendment quotes the revision's title, so the newest article whose title has "Δελτίο αναθεωρημένων τιμών" is the base.
  - **Later bulletins:** 32 more tables in 25 articles up to 30 Sep 2026: new generics (monthly, published 2–5 months late, e.g. September 2025's on 5 Mar 2026), new medicines (quarterly), re-pricing of reference medicines, voluntary price cuts, price changes of non-reimbursed medicines, medical cannabis products. Article ids grow with publication, so applying them by id, keyed by barcode, gives the prices in force.
  - **Gaps:** withdrawals are not in these bulletins, so a withdrawn pack stays listed until the next revision. A few articles have only PDFs (e.g. ΜΗΣΥΦΑ article 13833, Nov 2025); their changes are not applied.
- **Columns** [verified]: Κωδικός (ministry code), Barcode, the product (name, form, strength and pack in one cell, e.g. "DORALIN F.C.TAB 40MG/TAB ΒΤx30 (BLIST 3x10)"), ATC, Μη αποζημιούμενο ("N" when not reimbursed), ex-factory, wholesale and retail prices (with VAT), active substances, licence holder, VAT rate (6% or 13%). The ΜΗΣΥΦΑ tables have an "Ενδεικτική Λιανική Τιμή" (indicative retail price) instead.
  - Headers, their order and casing differ between tables ("Barcode"/"BARCODE"; "ΟΝΟΝΑΣΙΑ ΚΑΚ", a typo for the licence holder), and some tables lack the ATC or reimbursement column, so columns are matched by header.
  - The barcode is a 13-digit national ΕΟΦ code starting 2800–2809, not an EAN.
  - Quirks: a few new packs are priced 0 (not yet priced) and one cell holds two prices; such rows are skipped with a warning.
- **Size** [verified, 5 Oct 2026]: 9,046 prescription packs and 770 ΜΗΣΥΦΑ packs (the 2025 catalogue revision, article 13661 of 10 Sep 2025, plus four bulletins of new products published after it). The two lists share no barcode.
- **Reuse:** the bulletins are public ministerial decisions, so they should be reusable under the open-data law ν.4727/2020. [inferred] Ministry contact: farmaka@moh.gov.gr. [search]

### Is the price the same everywhere?

- **Prescription medicines:** the bulletin sets maximum prices, so the price is effectively the same at every pharmacy. [search/inferred]
- **Non-prescription medicines (ΜΗΣΥΦΑ):** prices were freed by ν.4254/2014 (effective 2017). The ministry price is only indicative (Γ5(α)οικ.38152/2017, ΦΕΚ Β'1761/2017). [search]
- **General-sale products:** about 216 of them (ΓΕΔΙΦΑ) may also be sold outside pharmacies. [search]
- **Parapharmacy** (cosmetics, supplements, baby formula): pricing is free. [inferred]

### What the patient pays

- A 0, 10 or 25% co-payment, depending on the diagnosis and insurance, plus the full gap between the retail price and the reference (insurance) price. [search]
- The positive (reimbursement) list has about 6,900 products: https://www.moh.gov.gr/articles/times-farmakwn/epitroph-aksiologhshs-kai-apozhmiwshs-farmakwn/ [search]
- **No estimate is possible from public files** [verified, 5 Oct 2026]: the price bulletins have no reference price and no co-payment rate (only the "not reimbursed" flag). The reimbursement list published for consultation (article 14817, "LISTA_INPUT SEPTEMBER 2026.xlsx", about 6,000 packs) has no reference price and no barcode either, only a short product code. So the app shows the retail price and, when the bulletin says so, that the medicine is not reimbursed; it makes no co-payment estimate (decision D24).

### Medicine database

- ΕΟΦ's product search, with product-information and leaflet PDFs: https://services.eof.gr/drugsearch/ [unverified]. No API or bulk download was found. [search]
- Proprietary databases (galinos.gr, farmako.net) are protected by the database right (ν.2121/1993 art. 45A). [inferred]

### Shortages

- **ΕΟΦ monthly "limited availability" list** [verified]: a text PDF linked from a post in https://www.eof.gr/category/farmaka/eparkeia-farmaka/, also found through the WordPress API (`/wp-json/wp/v2/posts?search=ΠΕΡΙΟΡΙΣΜΕΝΗΣ ΔΙΑΘΕΣΙΜΟΤΗΤΑΣ`). Columns: barcode, description, ATC, substances, how it is dispensed, licence holder, start date, expected end date, reason, alternatives. The list of 30 Sep 2026 (posted 2 Oct) has 289 packs on 10 pages, the last page a separate section of emergency imports through Ι.Φ.Ε.Τ. with its own column positions; 263 of the 289 have a price in the bulletins (the others are hospital-only or imports). One title has no year ("31 ΜΑΪΟΥ"), so the post's date stands in.
- **ΕΟΦ parallel-export bans** [verified]: 3-month bans, renewed each time (e.g. 105 products, 27 May–27 Aug 2026 [search]). The latest post (27 Aug 2026) links a 9-page scanned PDF with no text layer, so it cannot be read without OCR. Not used (decision D24).
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

- **Prescription price lookup:** feasible; built in v1.1.
- **Non-prescription prices:** partial (indicative only); built in v1.1, labelled as indicative.
- **Co-payment estimate:** not feasible from public files (no reference price).
- **Per-pharmacy stock:** not feasible without partnerships.
- **Shortage warnings:** feasible, updated monthly; built in v1.1. Export bans: not without OCR.

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
- **Nominatim pitfall** [verified]: OpenStreetMap tags addresses in Καλαμαριά and other neighbouring municipalities with the city "Θεσσαλονίκη", so "Κομνηνών 17, Θεσσαλονίκη" (free-form or structured) resolves to Καλαμαριά, about 5 km from the real pharmacy. In ΦΣΘ lists "Θεσσαλονίκη" means the municipality, so the pipeline queries "…, Δήμος Θεσσαλονίκης" and rejects results in another Δήμος. Nominatim also rate-limits shared cloud IPs after about 100 requests; the pipeline caps itself at 150 per run.
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
