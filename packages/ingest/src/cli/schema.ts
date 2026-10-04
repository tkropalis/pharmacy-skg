/** Exports the data schemas as JSON Schema to data/schema/. */
import { join } from 'node:path';
import { z } from 'zod';
import { SCHEMAS } from '../schema.ts';
import { REPO_ROOT, toJson, writeIfChanged } from '../store.ts';

for (const [name, schema] of Object.entries(SCHEMAS)) {
  const path = join(REPO_ROOT, 'data', 'schema', `${name}.schema.json`);
  const written = await writeIfChanged(path, toJson(z.toJSONSchema(schema, { io: 'output' })));
  console.log(`${written ? 'wrote' : 'unchanged'} ${path}`);
}
