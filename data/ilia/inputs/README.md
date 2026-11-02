# Pipeline inputs

- `overture-pharmacies.json`: places with `taxonomy.primary = 'pharmacy'` from Overture Maps release **2026-09-23.1**, in a box around the Ilia regional unit (longitude 21.05 to 21.80, latitude 37.38 to 38.05). Licence CDLA-Permissive-2.0. Made with the query in `packages/ingest/scripts/overture.sql`, with that box and this file as its output.
- `geocode-cache.json`: Nominatim results, misses included, keyed by query. Each address is geocoded once (Nominatim policy). Delete an entry to retry it.
- `duty-table.json`: the rows of the Region of Western Greece's yearly duty table (Diavgeia ADA ΡΣΦΞ7Λ6-2Κ3 for 2026), as the pipeline read them from its PDF, under the decision's ADA and version. The PDF is read again only when the decision is new or corrected (`packages/ingest/src/ilia/cache.ts`). Written by the pipeline.
- `roster.json`: every pharmacy the table names, with the first day it is on duty. Written by the pipeline.
