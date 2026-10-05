# Pipeline inputs

- `overture-pharmacies.json`: places with `taxonomy.primary = 'pharmacy'` from Overture Maps release **2026-09-23.1**, in a box around the Thessaloniki regional unit. Licence CDLA-Permissive-2.0. Refresh with `packages/ingest/scripts/overture.sql`.
- `geocode-cache.json`: Nominatim results, misses included, keyed by query. Each address is geocoded once (Nominatim policy). Delete an entry to retry it.
