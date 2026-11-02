-- Refreshes data/kilkis/inputs/overture-pharmacies.json from Overture Maps (the Kilkis towns'
-- pharmacies are placed by phone from it, decision D22). Overture places are licensed
-- CDLA-Permissive-2.0. Run from the repo root with the DuckDB CLI (anonymous S3 access; unset
-- AWS_* variables first if any are set):
--
--   duckdb -c ".read packages/ingest/scripts/overture-kilkis.sql"
--
-- Then update RELEASE below and in data/kilkis/inputs/README.md.
INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;
CREATE OR REPLACE SECRET anon (TYPE s3, PROVIDER config, KEY_ID '', SECRET '', REGION 'us-west-2');
SET VARIABLE release = '2026-09-23.1';

COPY (
  SELECT id, names.primary AS name, phones[1] AS phone,
         addresses[1].freeform AS address, addresses[1].locality AS locality,
         round(confidence, 3) AS confidence,
         round(ST_Y(geometry), 6) AS lat, round(ST_X(geometry), 6) AS lon
  FROM read_parquet('s3://overturemaps-us-west-2/release/' || getvariable('release') || '/theme=places/type=place/*', hive_partitioning = 1)
  -- The Kilkis area's box (packages/core/src/city.ts), which takes in Goumenissa to Kilkis.
  WHERE bbox.xmin BETWEEN 22.35 AND 22.99 AND bbox.ymin BETWEEN 40.85 AND 41.10
    AND taxonomy.primary = 'pharmacy'
  ORDER BY id
) TO 'data/kilkis/inputs/overture-pharmacies.json' (FORMAT json, ARRAY true);
