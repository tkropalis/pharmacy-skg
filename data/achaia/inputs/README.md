# Pipeline inputs

- `overture-pharmacies.json`: places with `taxonomy.primary = 'pharmacy'` from Overture Maps release **2026-09-23.1**, in a box around Patras and the places around it. Licence CDLA-Permissive-2.0. Refresh with `packages/ingest/scripts/overture.sql`. The duty page gives the coordinates of the pharmacies on duty; the pharmacies of its longer hours have a name and an address only, and are placed by name and street in this file, else by address.
- `geocode-cache.json`: Nominatim results, misses included, keyed by query. Each address is geocoded once (Nominatim policy). Delete an entry to retry it.
- `listed-locations.json`: the coordinates the duty page gave, by pharmacy id.
