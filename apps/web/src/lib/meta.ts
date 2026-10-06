import type { Meta } from '@pharmacy-skg/core';

const metaFiles = import.meta.glob<Meta>('../../../../data/*/meta.json', {
  eager: true,
  import: 'default',
});

/**
 * A city's metadata as of the build (data/<city>/meta.json). Pages are static, so the client
 * re-reads /data/<city>/meta.json at runtime for the data's age (scripts/boot.ts).
 */
export function buildMetaFor(cityId: string): Meta {
  const meta = metaFiles[`../../../../data/${cityId}/meta.json`];
  if (meta === undefined) throw new Error(`No data/${cityId}/meta.json`);
  return meta;
}
