import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SCHEMAS } from './schema.ts';
import { REPO_ROOT, toJson } from './store.ts';

describe('data/schema', () => {
  it.each(Object.entries(SCHEMAS))('%s.schema.json is up to date', async (name, schema) => {
    const committed = await readFile(
      join(REPO_ROOT, 'data', 'schema', `${name}.schema.json`),
      'utf8',
    );
    expect(committed, 'run: pnpm --filter @pharmacy-skg/ingest schema').toBe(
      toJson(z.toJSONSchema(schema, { io: 'output' })),
    );
  });
});
