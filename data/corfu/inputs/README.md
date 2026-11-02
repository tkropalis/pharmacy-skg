# Pipeline inputs

- `overture-pharmacies.json`: places with `taxonomy.primary = 'pharmacy'` from Overture Maps release **2026-09-23.1**, in a box around Corfu and Paxos (the mainland across the strait and Albania's coast come with it and match nothing). Licence CDLA-Permissive-2.0. Refresh with `packages/ingest/scripts/overture.sql`. Corfu's duty page prints no coordinates, so a pharmacy is placed by its phone in this file, else by its address.
- `geocode-cache.json`: Nominatim results, misses included, keyed by query. Each address is geocoded once (Nominatim policy). Delete an entry to retry it.
- `roster.json`: every member of the association (its members' page), read once a week.
