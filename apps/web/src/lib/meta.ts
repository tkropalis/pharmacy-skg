import type { Meta } from '@pharmacy-skg/core';
import metaJson from '../../../../data/thessaloniki/meta.json';

/**
 * The data's metadata as of the build, for the footer and the stale-data banner. Pages are
 * static, so the client re-reads /data/thessaloniki/meta.json at runtime (scripts/boot.ts).
 */
export const buildMeta = metaJson as Meta;
