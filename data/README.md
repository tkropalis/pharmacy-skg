# Data

Written by the scheduled pipeline (`packages/ingest`, workflow `update-data.yml`). Don't edit generated files by hand: the next run overwrites them. The pipeline writes only when every check in `packages/ingest/src/validate.ts` passes.

## Layout

```
data/
  schema/                         JSON Schema for each published file (pnpm --filter @pharmacy-skg/ingest schema)
  <city>/
    meta.json                     last change, coverage and source credits
    pharmacies.json               every pharmacy in an official list, with its location
    duties/<YYYY-MM-DD>.json      officially published duty lists for one day, per area group
    extended-hours/<from>_<to>.json  the ΠΚΜ extended-hours list for one period
    overrides.json                manual fixes, keyed by pharmacy id (edit this one)
    inputs/                       pipeline inputs and caches, not read by the app
```

- **Pharmacy ids** are the 10-digit phone number. A pharmacy without a valid phone gets `x-` plus a hash of its name and locality.
- **Hours** in duty sections are exactly what the section heading states, in local time (Europe/Athens). `hours` is `null` when the heading states none. `toNextDay` marks a shift that ends after midnight (decision D21).
- **Locations** carry their `source` (`override`, `overture` or `nominatim`) and `precision` (`exact`, `street` or `locality`). Every pharmacy in a duty list must have one.
- **Only official dates** are published (decision D11). The reconstructed rotation is never written here.

## Overrides

`<city>/overrides.json` maps a pharmacy id to corrections:

```json
{
  "2310733843": {
    "location": { "lat": 40.6601, "lon": 22.9156 },
    "note": "Placed by hand from the shop front; Nominatim found only the street"
  }
}
```

## Sources and licences

| Source | Used for | Terms |
| --- | --- | --- |
| Φαρμακευτικός Σύλλογος Θεσσαλονίκης (ΦΣΘ), via the copies re-hosted by thess.guide | duty lists | public lists, attributed (decisions D2, D20) |
| Περιφέρεια Κεντρικής Μακεδονίας (ΠΚΜ) | extended hours | public announcements |
| Overture Maps Foundation (`inputs/overture-pharmacies.json`) | locations | CDLA-Permissive-2.0 |
| OpenStreetMap contributors, via Nominatim (`inputs/geocode-cache.json`) | locations | ODbL; individual geocoding results, stored once per address |
