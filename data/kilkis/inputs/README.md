# Pipeline inputs

- `overture-pharmacies.json`: places with `taxonomy.primary = 'pharmacy'` from Overture Maps release **2026-09-23.1**, in a box around the Kilkis towns (Goumenissa to Kilkis, `KILKIS.bounds` in `packages/core/src/city.ts`). Licence CDLA-Permissive-2.0. The association's tables give no coordinates, so a pharmacy is placed by its phone here, then by its address with Nominatim. Refresh with `packages/ingest/scripts/overture-kilkis.sql`.
- `geocode-cache.json`: Nominatim results, misses included, keyed by query. Each address is geocoded once (Nominatim policy). Delete an entry to retry it.
