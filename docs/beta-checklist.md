# Beta launch checklist (M4)

Target: a public beta before 26 Oct 2026, if the data is trustworthy (decision D19). Items marked **Owner** need you; the rest are done or automated.

## 1. Merge (Owner)

- [ ] Merge #1 (M1, data pipeline). The scheduled workflow starts running on `master` twice a day (06:20 and 18:20 Athens).
- [ ] Merge #2 (M2, open-now logic), then the M3 PR (the app). Each PR's base moves to `master` when the previous one merges.
- [ ] Watch the first two scheduled runs under Actions → "Update data". Each should commit `data: …` or report no change.

## 2. Vercel (Owner, decision D14)

- [ ] Create the project from this repository.
  - Root Directory: `apps/web`.
  - Turn on "Include source files outside of the Root Directory": the build reads `../../data`.
  - Framework preset: Astro. Keep the default build and install commands.
- [ ] Environment variables:
  - `GITHUB_TOKEN`: a fine-grained token for this repository only, with Issues read/write. It powers problem reports; without it the form falls back to a GitHub link.
  - `PUBLIC_SITE_URL`: the final origin, e.g. `https://example.gr`. It feeds canonical links and the sitemap.
  - Turn on Web Analytics in the project's Analytics tab (cookieless, D16). The app already ships `@vercel/analytics`; no variable is needed.
- [ ] Choose the public name and domain. The name lives in one place, `apps/web/src/config.ts` (`APP_NAME`, `APP_SHORT_NAME`), so tell Claude and it will rename the app.
- [ ] After the first deploy, send a test report from `/anafora/` and check that an issue labelled `report` appears. Then close it.

## 3. Real devices (Owner, about 20 minutes)

On an iPhone (Safari) and an Android phone (Chrome):

- [ ] The home screen loads. "Use my location" asks for permission and sorts the list by distance.
- [ ] Call, Directions (Google, Apple, Waze) and Share work.
- [ ] Install: on Android, the "Εγκατάσταση" button in the list's footer (or on the about page); on the iPhone, Share → "Προσθήκη στην οθόνη Αφετηρίας". The icon reads "Φαρμακεία".
- [ ] Open the installed app in airplane mode: the list still shows, with "Εκτός σύνδεσης" next to the data's age. A pharmacy page you opened before also opens. Turn airplane mode off: the note goes away by itself.
- [ ] Switch the phone to dark mode: the app should stay light (one theme on every device).
- [ ] Report anything odd through the app's own report form, so it lands as an issue.

## 4. Data trust (automated, then a spot check by you)

- [ ] M1 "done when": a week of scheduled runs matches the official ΦΣΘ lists. Spot-check one day against https://fsth.gr/ (open it in your browser).
- [ ] 16 Oct: check whether the outlying groups' hours change. The parser reads the hours from each heading, so a change is picked up automatically; the check is only to update the docs.
- [ ] 26 Oct (Αγίου Δημητρίου) is the first real weekday holiday. Check that the metro list uses the "αργίες" heading and that the app shows only duty and extended-hours pharmacies that day.
- [ ] By 1 Nov: the ΠΚΜ list for Nov–Dec must be ingested. The app warns when no extended-hours list covers the date.

## 5. ΦΣΘ (Owner decides when, D2/D20)

- [ ] When the app is live, send `docs/outreach/fsth-email.md` with `docs/outreach/fsth-brief.md` (exported to PDF) and the link.

## Known limits at beta

- Duty lists come from the thess.guide re-host, because fsth.gr blocks automated clients. If thess.guide stops, the data goes stale and the stale-data banner appears after 36 hours.
- Θέρμη and Ασβεστοχώρι publish duty sections without hours. The app shows "on duty, hours not stated, call first".
- No summer schedule is applied; one needs adding before July 2027.
