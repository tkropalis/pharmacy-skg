-- Refreshes data/thessaloniki/inputs/overture-pharmacies.json from Overture Maps.
-- Overture places are licensed CDLA-Permissive-2.0. Run from the repo root with the
-- DuckDB CLI (anonymous S3 access; unset AWS_* variables first if any are set):
--
--   duckdb -c ".read packages/ingest/scripts/overture.sql"
--
-- Then update RELEASE below and in data/thessaloniki/inputs/README.md.
INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;
CREATE OR REPLACE SECRET anon (TYPE s3, PROVIDER config, KEY_ID '', SECRET '', REGION 'us-west-2');
SET VARIABLE release = '2026-09-23.1';

COPY (
  SELECT id, names.primary AS name, phones[1] AS phone,
         addresses[1].freeform AS address, addresses[1].locality AS locality,
         round(confidence, 3) AS confidence,
         round(ST_Y(geometry), 6) AS lat, round(ST_X(geometry), 6) AS lon
  FROM read_parquet('s3://overturemaps-us-west-2/release/' || getvariable('release') || '/theme=places/type=place/*', hive_partitioning = 1)
  -- The Thessaloniki regional unit, with a margin.
  WHERE bbox.xmin BETWEEN 22.55 AND 23.65 AND bbox.ymin BETWEEN 40.35 AND 41.05
    AND taxonomy.primary = 'pharmacy'
  ORDER BY id
) TO 'data/thessaloniki/inputs/overture-pharmacies.json' (FORMAT json, ARRAY true);
